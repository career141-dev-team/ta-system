"use node";
// convex/ui/homeAsk.ts
//
// D11 item 5 (owner 20 Nov 2026): Claude Haiku behind two lead-side chats, used only
// where the screen's word rules stop (rules in homeAskRules.ts).
// - home({ role, text }): the lead / Director / Ops home question, answered from the
//   same desk the home shows, read again here as the person asking (ui/lead:desk,
//   ui/homes:director, ui/homes:ops - each refuses anyone who may not see it).
// - plan({ text, strategies, tas, today }): a line on a job's strategy plan read into
//   strategies, TAs and a day, only from the list and team the page was given. The
//   page still shows the change and the lead still presses Send: nothing is saved here.
// Every call is a row in aiRuns ("home" / "strategy"), the desk stops at
// AI_DAY_LIMIT_USD, 20 s at most, signed in first.

import { v } from "convex/values";
import { action, type ActionCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { anthropicOn, getAnthropicClient } from "../lib/llm";
import { jsonIn } from "../lib/claudeFirst";
import { colomboDayStart } from "../../src/lib/calendar";
import { AI_DAY_LIMIT_USD, cleanReply, costOf, type Reply } from "./auraRules";
import { HOME_SYSTEM, PLAN_SYSTEM, cleanPlan, homeTurn, planTurn, type Said } from "./homeAskRules";

const TIMEOUT_MS = 20_000;
type No = { ok: false; message: string };
const refused = (message: string): No => ({ ok: false, message });

type Me = { ok: true; id: string } | { ok: false; message: string };

/** The key on, the day's allowance left; then one call, logged either way. */
async function haiku(ctx: ActionCtx, me: { id: string }, feature: string, system: string, user: string, maxTokens: number): Promise<{ ok: true; raw: unknown; log: (ok: boolean, error?: string) => Promise<unknown> } | No> {
  if (!anthropicOn()) return refused("AURA's AI is not switched on yet. Ask your admin to add the Anthropic key.");
  const day = colomboDayStart(Date.now());
  const spent = (await ctx.runQuery(internal.ui.auraLedger.spentToday, { day })) as number;
  if (spent >= AI_DAY_LIMIT_USD) return refused("AURA has used today's AI allowance for the desk. It is back tomorrow.");
  const userId = me.id as Id<"users">;
  const record = (i: number, o: number, ok: boolean, error?: string) =>
    ctx.runMutation(internal.ui.auraLedger.record, { userId, feature, day, inputTokens: i, outputTokens: o, costUsd: costOf(i, o), ok, ...(error ? { error: error.slice(0, 300) } : {}) });
  try {
    const res = await getAnthropicClient(TIMEOUT_MS).chat.completions.create({
      model: "claude-haiku-5-5",
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    });
    const used = res.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
    return { ok: true, raw: jsonIn(res.choices[0]?.message?.content ?? ""), log: (ok, error) => record(used.prompt_tokens ?? 0, used.completion_tokens ?? 0, ok, error) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ui/homeAsk] ${feature}: ${message}`);
    await record(0, 0, false, message);
    return refused(/timeout|abort/i.test(message) ? "AURA took too long. Try again." : "AURA could not answer just now. Try again.");
  }
}

export const home = action({
  args: { role: v.union(v.literal("Lead"), v.literal("Director"), v.literal("Ops")), text: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; reply: Extract<Reply, { kind: "answer" }> } | No> => {
    const text = args.text.trim().slice(0, 500);
    if (!text) return refused("Type what you need.");
    const me = (await ctx.runQuery(api.ui.me.whoAmI, {})) as Me;
    if (!me.ok) return refused(me.message);
    const ref = args.role === "Lead" ? api.ui.lead.desk : args.role === "Director" ? api.ui.homes.director : api.ui.homes.ops;
    const desk = (await ctx.runQuery(ref, {})) as { ok: boolean; message?: string };
    if (!desk.ok) return refused(desk.message ?? "That desk is not open to you.");
    const got = await haiku(ctx, me, "home", HOME_SYSTEM(args.role), homeTurn(desk, text), 900);
    if (!got.ok) return got;
    const reply = cleanReply(got.raw, new Set());
    await got.log(!!reply && reply.kind === "answer", reply ? undefined : "no usable JSON");
    return reply && reply.kind === "answer" ? { ok: true, reply } : refused("AURA could not put an answer together. Ask again in other words.");
  },
});

export const plan = action({
  args: {
    text: v.string(),
    strategies: v.array(v.string()),
    tas: v.array(v.object({ id: v.string(), name: v.string() })),
    today: v.number(),
  },
  handler: async (ctx, args): Promise<({ ok: true } & Said) | No> => {
    const text = args.text.trim().slice(0, 500);
    if (!text) return refused("Say which strategies, who and when.");
    const me = (await ctx.runQuery(api.ui.me.whoAmI, {})) as Me;
    if (!me.ok) return refused(me.message);
    const today = Math.min(4, Math.max(0, Math.round(args.today)));
    const got = await haiku(ctx, me, "strategy", PLAN_SYSTEM, planTurn({ ...args, text, today }), 500);
    if (!got.ok) return got;
    const said = cleanPlan(got.raw, args.strategies, args.tas.map((t) => t.id), today);
    await got.log(!!said, said ? undefined : "no usable reading");
    return said ? { ok: true, ...said } : refused("I could not place that. Name a strategy and who should do it.");
  },
});
