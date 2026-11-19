"use node";
// convex/ui/planTalk.ts
//
// AURA's day plan, phase 3 (owner 19 Nov 2026, ta-system-ui docs/AURA-DAY-AGENT.md
// section 7): the TA changes the approved plan by talking - "I need another 15
// minutes", "move this to 2:30", "stop reminding me for 30 minutes", "I'll work till
// 10". The sentence becomes ONE change: plain rules read the common ones (no model, no
// cost); only what they cannot read goes to Claude Haiku, which may only name a change
// from a fixed list, never a time it invents. A task it cannot pick for sure is asked
// about. The times, the slide of the tasks after, and the clashes are plain code
// (planRules.applyChange), saved by ui/plan:applyTalk with the TA's words in history.

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeFunctionReference } from "convex/server";
import { anthropicOn, getAnthropicClient } from "../lib/llm";
import { jsonIn } from "../lib/claudeFirst";
import { colomboDayStart } from "../../src/lib/calendar";
import { AI_DAY_LIMIT_USD, costOf } from "./auraRules";
import { dayStartOf, hm, pickTask, readChange, type Change, type ChangeOp, type TalkTask } from "./planRules";

type Answer = { ok: false; message: string } | { ok: true; message: string; ask?: false } | { ok: true; ask: true; message: string; options?: string[] };
const refused = (message: string): Answer => ({ ok: false, message });
const TIMEOUT_MS = 20_000;
const OPS: ChangeOp[] = ["extend", "move", "set_end", "snooze", "shift_pending", "add", "skip", "set_finish", "done"];

const applyRef = makeFunctionReference<"mutation", { userId: Id<"users">; said: string; change: Change }, { ok: boolean; message: string }>("ui/plan:applyTalk");

type PlanRead = { ok: true; plan: { date: string; state: string; finishMin: number; tasks: TalkTask[] } | null } | { ok: false; message: string };

const SYSTEM = `You turn ONE sentence from a recruiter about today's plan into ONE change, as JSON.
Allowed "op": extend (more minutes on a task), move (a task to a new start), set_end (a task ends at a time), snooze (no reminders for N minutes; "all": true for the whole plan), shift_pending (move every not-started task to start from a time), add (a new task: "title", "atMin", "minutes"), skip (a task, with "reason"), set_finish (the day's planned finish), done (a task is finished).
Use only task keys from the list. Times are minutes after midnight (14:30 = 870). If the sentence does not ask to change the plan, or you are not sure which task, answer {"ask": "<one short question>"}.
Answer JSON only, e.g. {"op":"move","key":"t3","atMin":870}.`;

/** The model's answer, checked: only a known op, a real key, sane numbers. */
function checked(raw: unknown, keys: Set<string>): Change | { ask: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.ask === "string" && r.ask.trim()) return { ask: r.ask.trim().slice(0, 200) };
  if (!OPS.includes(r.op as ChangeOp)) return null;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x) : undefined);
  const key = typeof r.key === "string" && keys.has(r.key) ? r.key : undefined;
  if (typeof r.key === "string" && !key) return null;
  return {
    op: r.op as ChangeOp,
    key,
    minutes: num(r.minutes),
    atMin: num(r.atMin),
    title: typeof r.title === "string" ? r.title.slice(0, 120) : undefined,
    reason: typeof r.reason === "string" ? r.reason.slice(0, 300) : undefined,
    all: r.all === true ? true : undefined,
  };
}

export const change = action({
  args: { text: v.string() },
  handler: async (ctx, args): Promise<Answer> => {
    const text = args.text.trim().slice(0, 500);
    if (!text) return refused("Say what changed.");
    const me = (await ctx.runQuery(api.ui.me.whoAmI, {})) as { ok: true; id: string } | { ok: false; message: string };
    if (!me.ok) return refused(me.message);
    const read = (await ctx.runQuery(api.ui.plan.today, {})) as PlanRead;
    if (!read.ok) return refused(read.message);
    const plan = read.plan;
    if (!plan || plan.state !== "approved") return refused(plan?.state === "closed" ? "Today's plan is closed." : "Approve today's plan first, then I can change it.");

    const now = Date.now();
    const nowMin = Math.floor((now - dayStartOf(plan.date)) / 60_000);
    let got = readChange(text, plan.tasks, nowMin);

    if (got === null) {
      // Only what the rules cannot read costs a model call.
      if (!anthropicOn()) return refused("I could not read that change. Try “I need 15 more minutes”, “move this to 2:30” or “stop reminding me for 30 minutes”.");
      const day = colomboDayStart(now);
      const spent = (await ctx.runQuery(internal.ui.auraLedger.spentToday, { day })) as number;
      if (spent >= AI_DAY_LIMIT_USD) return refused("AURA has used today's AI allowance. Try “move this to 2:30” or “I need 15 more minutes”.");
      const open = plan.tasks.filter((t) => t.state === "planned" || t.state === "doing");
      const list = open.map((t) => `${t.key}: ${t.title} (${hm(t.startMin)}-${hm(t.startMin + t.minutes)}, ${t.state})`).join("\n");
      const inHand = pickTask("", plan.tasks, nowMin);
      const userId = me.id as Id<"users">;
      const log = (i: number, o: number, ok: boolean, error?: string) =>
        ctx.runMutation(internal.ui.auraLedger.record, { userId, feature: "plan", day, inputTokens: i, outputTokens: o, costUsd: costOf(i, o), ok, ...(error ? { error: error.slice(0, 300) } : {}) });
      try {
        const res = await getAnthropicClient(TIMEOUT_MS).chat.completions.create({
          model: "claude-haiku-5-5",
          max_tokens: 200,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: `Now: ${hm(nowMin)}. Planned finish: ${hm(plan.finishMin)}. Task in hand: ${inHand && "task" in inHand ? inHand.task.key : "none"}.\nOpen tasks:\n${list || "(none)"}\n\nSentence: ${text}` },
          ],
        });
        const used = res.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
        const c = checked(jsonIn(res.choices[0]?.message?.content ?? ""), new Set(open.map((t) => t.key)));
        await log(used.prompt_tokens ?? 0, used.completion_tokens ?? 0, !!c, c ? undefined : "no usable change");
        got = c === null ? { ask: "I could not read that change. Which task, and what should change?" } : "ask" in c ? c : { change: c };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[ui/planTalk] change: ${message}`);
        await log(0, 0, false, message);
        return refused(/timeout|abort/i.test(message) ? "AURA took too long. Try again." : "AURA could not read that just now. Try again.");
      }
    }

    if ("ask" in got) return { ok: true, ask: true, message: got.ask, options: got.options };
    const done = await ctx.runMutation(applyRef, { userId: me.id as Id<"users">, said: text, change: got.change });
    return done.ok ? { ok: true, message: done.message } : refused(done.message);
  },
});
