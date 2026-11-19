"use node";
// convex/ui/aura.ts
//
// AURA on Today (E5 group 1, 19 Nov): the TA asks in words - plan my day, what
// first, my strategies, draft my EOD, anything about their positions - and Claude
// Haiku 5.5 answers from the TA's own desk (ui/desk:desk). It only advises:
// nothing is moved, sent or saved. Every call is a row in aiRuns, and the desk
// stops at AI_DAY_LIMIT_USD a Colombo day.
//
// The person comes from the Clerk sign-in, carried into the queries this action
// runs (ui/me:whoAmI, ui/desk:desk) - never from an argument.

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { anthropicOn, getAnthropicClient } from "../lib/llm";
import { jsonIn } from "../lib/claudeFirst";
import { colomboDayStart } from "../../src/lib/calendar";
import { AI_DAY_LIMIT_USD, cleanReply, costOf, SYSTEM, trimHistory, userTurn, type DeskPosition, type Reply } from "./auraRules";

type Answer = { ok: false; message: string } | { ok: true; reply: Reply };
const refused = (message: string): Answer => ({ ok: false, message });

// A chat answer must come back while the person waits; the backend runs only a
// few actions at once (the 6 Oct incident), so none may hang.
const TIMEOUT_MS = 20_000;

export const askToday = action({
  args: {
    text: v.string(),
    history: v.array(v.object({ role: v.union(v.literal("user"), v.literal("assistant")), text: v.string() })),
    today: v.array(v.object({ jobId: v.string(), workType: v.string() })),
  },
  handler: async (ctx, args): Promise<Answer> => {
    const text = args.text.trim().slice(0, 1000);
    if (!text) return refused("Type what you need.");
    const me = (await ctx.runQuery(api.ui.me.whoAmI, {})) as { ok: true; id: string } | { ok: false; message: string };
    if (!me.ok) return refused(me.message);
    if (!anthropicOn()) return refused("AURA's AI is not switched on yet. Ask your admin to add the Anthropic key.");
    const desk = (await ctx.runQuery(api.ui.desk.desk, {})) as { ok: true; positions: DeskPosition[] } | { ok: false; message: string };
    if (!desk.ok) return refused(desk.message);

    const now = Date.now();
    const day = colomboDayStart(now);
    const spent = (await ctx.runQuery(internal.ui.auraLedger.spentToday, { day })) as number;
    if (spent >= AI_DAY_LIMIT_USD) return refused("AURA has used today's AI allowance for the desk. It is back tomorrow.");

    const ids = new Set(desk.positions.map((p) => p.id));
    const today = args.today.filter((t) => ids.has(t.jobId)).slice(0, 10);
    const history = trimHistory(args.history);
    while (history[0]?.role === "assistant") history.shift();
    const clock = new Date(now).toLocaleString("en-GB", { timeZone: "Asia/Colombo", weekday: "short", hour: "numeric", minute: "2-digit" });

    const userId = me.id as Id<"users">;
    const log = (inputTokens: number, outputTokens: number, ok: boolean, error?: string) =>
      ctx.runMutation(internal.ui.auraLedger.record, { userId, feature: "today", day, inputTokens, outputTokens, costUsd: costOf(inputTokens, outputTokens), ok, ...(error ? { error: error.slice(0, 300) } : {}) });

    try {
      const res = await getAnthropicClient(TIMEOUT_MS).chat.completions.create({
        model: "claude-haiku-5-5",
        max_tokens: 1500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          ...history.map((t) => ({ role: t.role, content: t.text })),
          { role: "user", content: userTurn(desk.positions, today, clock, text) },
        ],
      });
      const used = res.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
      const reply = cleanReply(jsonIn(res.choices[0]?.message?.content ?? ""), ids);
      await log(used.prompt_tokens ?? 0, used.completion_tokens ?? 0, !!reply, reply ? undefined : "no usable JSON");
      return reply ? { ok: true, reply } : refused("AURA could not put an answer together. Ask again in other words.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ui/aura] today: ${message}`);
      await log(0, 0, false, message);
      return refused(/timeout|abort/i.test(message) ? "AURA took too long to answer. Try again." : "AURA could not answer just now. Try again.");
    }
  },
});
