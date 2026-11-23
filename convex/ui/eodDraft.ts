"use node";
// convex/ui/eodDraft.ts
//
// Draft my EOD (AI-FLOWS 4, owner 23 Nov 2026): notes({ jobId }) drafts the NOTES
// column of today's Midday / End of day email with Claude Haiku, from each person's
// own CV (rules in eodDraftRules.ts). Nothing is saved here: the email screen shows
// the lines, the TA keeps or changes them, and the existing send saves them back.
// Every call is a row in aiRuns ("eod"), and the desk stops at AI_DAY_LIMIT_USD.

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { anthropicOn, getAnthropicClient } from "../lib/llm";
import { jsonIn } from "../lib/claudeFirst";
import { colomboDayStart } from "../../src/lib/calendar";
import { AI_DAY_LIMIT_USD, costOf } from "./auraRules";
import { EOD_SYSTEM, cleanDraft, eodTurn, type Drafted, type DraftPerson } from "./eodDraftRules";
import { inWords } from "./rules";

type Answer = { ok: true; notes: Drafted; message: string } | { ok: false; message: string };
const refused = (message: string): Answer => ({ ok: false, message });
const TIMEOUT_MS = 25_000;

export const notes = action({
  args: { jobId: v.id("jobs"), workLocationId: v.optional(v.string()), forDate: v.optional(v.string()) },
  handler: async (ctx, a): Promise<Answer> => {
    const me = (await ctx.runQuery(api.ui.me.whoAmI, {})) as { ok: true; id: string } | { ok: false; message: string };
    if (!me.ok) return refused(me.message);
    const userId = me.id as Id<"users">;
    let read: { job: { title: string; client: string }; people: DraftPerson[] };
    try {
      read = (await ctx.runQuery(internal.ui.eodDraftRead.people, { userId, ...a })) as typeof read;
    } catch (error) {
      return refused(inWords(error, "Could not read this email. Try again."));
    }
    if (!read.people.length) return refused("Nobody is in this email yet, so there is nothing to draft.");
    if (!anthropicOn()) return refused("AURA's AI is not switched on yet. Ask your admin to add the Anthropic key.");
    const day = colomboDayStart(Date.now());
    const spent = (await ctx.runQuery(internal.ui.auraLedger.spentToday, { day })) as number;
    if (spent >= AI_DAY_LIMIT_USD) return refused("AURA has used today's AI allowance for the desk. It is back tomorrow.");
    const log = (i: number, o: number, ok: boolean, error?: string) =>
      ctx.runMutation(internal.ui.auraLedger.record, { userId, feature: "eod", day, inputTokens: i, outputTokens: o, costUsd: costOf(i, o), ok, ...(error ? { error: error.slice(0, 300) } : {}) });
    try {
      const res = await getAnthropicClient(TIMEOUT_MS).chat.completions.create({
        model: "claude-haiku-5-5",
        max_tokens: 1500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EOD_SYSTEM },
          { role: "user", content: eodTurn(read.job, read.people) },
        ],
      });
      const used = res.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
      const got = cleanDraft(jsonIn(res.choices[0]?.message?.content ?? ""), read.people.map((p) => p.id));
      await log(used.prompt_tokens ?? 0, used.completion_tokens ?? 0, !!got, got ? undefined : "no usable JSON");
      if (!got) return refused("AURA could not draft the notes. Try again.");
      const n = Object.keys(got).length;
      return {
        ok: true,
        notes: got,
        message: n ? `Drafted notes for ${n} of ${read.people.length}. Read them before you send.` : "The CVs did not say enough to add a note.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ui/eodDraft] notes: ${message}`);
      await log(0, 0, false, message);
      return refused(/timeout|abort/i.test(message) ? "AURA took too long. Try again." : "AURA could not draft just now. Try again.");
    }
  },
});
