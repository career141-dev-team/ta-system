"use node";
// convex/ui/adminAsk.ts
//
// The admin's assistant, free questions (21 Nov): "why can't Samira open her workday?".
// Admin only. It finds the person the sentence names, reads what the desk holds on them
// (ui/adminView:report - workday, unticked checks, last actions, positions) and Claude
// Haiku answers ONLY from those facts. It advises: nothing is changed, sent or saved
// (the screens' own "view as" is read only). Every call is a row in aiRuns ("admin"),
// under the same $5 a day desk limit as the other AURA chats.

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { anthropicOn, getAnthropicClient } from "../lib/llm";
import { jsonIn } from "../lib/claudeFirst";
import { colomboDayStart } from "../../src/lib/calendar";
import { AI_DAY_LIMIT_USD, costOf } from "./auraRules";
import { personIn } from "./adminView";

type Position = { jobId: string; title: string; workType: string };
type Answer =
  | { ok: false; message: string; code?: "no_person" }
  | { ok: true; say: string; rows: { main: string; meta?: string }[]; person: { id: string; name: string; role: string; positions: Position[] } };
const refused = (message: string): Answer => ({ ok: false, message });
const TIMEOUT_MS = 20_000;

const SYSTEM = `You are AURA, the personal assistant of the TA System's admin. The admin asks about one TA's work.
You are given FACTS read from the system just now. Answer ONLY from them. If the facts do not show it, say it is not recorded - never guess, never invent a time, a reason or an action.
You cannot change anything. Be short, plain and specific: one or two sentences, then up to 5 rows of the facts that matter.
Reply as JSON: {"say": string, "rows": [{"main": string, "meta": string}]}`;

type Report =
  | { ok: false; message: string }
  | { ok: true; several: unknown }
  | { ok: true; person: { id: string; name: string; role: string; active: boolean }; workday: unknown; positions: Position[]; unticked: unknown; actions: unknown };

export const ask = action({
  args: { text: v.string(), personId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Answer> => {
    const text = args.text.trim().slice(0, 600);
    if (!text) return refused("Type what you need.");
    const me = (await ctx.runQuery(api.ui.me.whoAmI, {})) as { ok: true; id: string; role: string } | { ok: false; message: string };
    if (!me.ok) return refused(me.message);
    if (me.role !== "admin") return refused("Only an admin can look into another person's work.");
    if (!anthropicOn()) return refused("AURA's AI is not switched on yet. Ask your admin to add the Anthropic key.");

    let id = args.personId;
    if (!id) {
      const list = (await ctx.runQuery(api.ui.adminView.people, {})) as { ok: true; people: { id: string; name: string }[] } | { ok: false; message: string };
      if (!list.ok) return refused(list.message);
      const hit = personIn(text, list.people);
      if (hit === "many") return refused("More than one person fits. Say the full name.");
      if (!hit) return { ok: false, message: "Which TA do you mean? Say their name.", code: "no_person" };
      id = hit.id;
    }
    const report = (await ctx.runQuery(api.ui.adminView.report, { id })) as Report;
    if (!report.ok) return refused(report.message);
    if ("several" in report) return refused("More than one person fits. Say the full name.");

    const now = Date.now();
    const day = colomboDayStart(now);
    const spent = (await ctx.runQuery(internal.ui.auraLedger.spentToday, { day })) as number;
    if (spent >= AI_DAY_LIMIT_USD) return refused("AURA has used today's AI allowance for the desk. It is back tomorrow.");
    const clock = new Date(now).toLocaleString("en-GB", { timeZone: "Asia/Colombo", weekday: "short", hour: "numeric", minute: "2-digit" });
    const facts = JSON.stringify({ now: clock, person: report.person, workday: report.workday, positionsToday: report.positions, notDoneYet: report.unticked, lastRecordedActions: report.actions }).slice(0, 12_000);

    const userId = me.id as Id<"users">;
    const log = (i: number, o: number, ok: boolean, error?: string) =>
      ctx.runMutation(internal.ui.auraLedger.record, { userId, feature: "admin", day, inputTokens: i, outputTokens: o, costUsd: costOf(i, o), ok, ...(error ? { error: error.slice(0, 300) } : {}) });
    try {
      const res = await getAnthropicClient(TIMEOUT_MS).chat.completions.create({
        model: "claude-haiku-5-5",
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `FACTS:\n${facts}\n\nQUESTION: ${text}` },
        ],
      });
      const used = res.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
      const j = jsonIn(res.choices[0]?.message?.content ?? "") as { say?: unknown; rows?: unknown } | null;
      const say = typeof j?.say === "string" ? j.say.trim().slice(0, 600) : "";
      const rows = Array.isArray(j?.rows)
        ? (j.rows as { main?: unknown; meta?: unknown }[])
            .filter((r) => typeof r?.main === "string")
            .slice(0, 5)
            .map((r) => ({ main: String(r.main).slice(0, 200), ...(typeof r.meta === "string" && r.meta ? { meta: r.meta.slice(0, 200) } : {}) }))
        : [];
      await log(used.prompt_tokens ?? 0, used.completion_tokens ?? 0, !!say, say ? undefined : "no usable JSON");
      if (!say) return refused("AURA could not put an answer together. Ask again in other words.");
      return { ok: true, say, rows, person: { id: report.person.id, name: report.person.name, role: report.person.role, positions: report.positions } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ui/adminAsk] ${message}`);
      await log(0, 0, false, message);
      return refused(/timeout|abort/i.test(message) ? "AURA took too long to answer. Try again." : "AURA could not answer just now. Try again.");
    }
  },
});
