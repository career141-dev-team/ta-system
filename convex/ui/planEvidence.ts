// convex/ui/planEvidence.ts
//
// AURA's day plan, phase 4 (owner 19 Nov 2026, ta-system-ui docs/AURA-DAY-AGENT.md
// section 5): a task is done when the system shows it. Called from
// lib/dailyEmail.finalizeDailyEmail - the one place every accepted Midday and EOD
// passes, whichever screen sent it - so the plan's email task ticks itself and the pet
// says so. Never by the clock: a task whose time passed stays overdue, not done.

import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { historyOf, ticksFor, type TaskState } from "./planRules";
import { arm } from "./planRemind";

export async function tickFromEmail(ctx: MutationCtx, userId: Id<"users">, date: string, type: "midday" | "eod", jobId: Id<"jobs">, at: number): Promise<void> {
  const plan = await ctx.db.query("auraDayPlans").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).first();
  if (!plan || plan.state !== "approved") return;
  const tasks = await ctx.db.query("auraPlanTasks").withIndex("by_plan", (q) => q.eq("planId", plan._id)).take(100);
  const kind = type === "midday" ? "midday_email" : "eod_email";
  const keys = new Set(ticksFor(tasks.map((t) => ({ key: t.key, kind: t.kind, jobId: t.jobId as string | undefined, state: t.state as TaskState })), kind, jobId as string));
  if (!keys.size) return;
  const what = type === "midday" ? "Midday email sent" : "End-of-day email sent";
  for (const t of tasks)
    if (keys.has(t.key))
      await ctx.db.patch(t._id, { state: "done", doneBy: "system", doneAt: at, history: historyOf(t.history, { at, by: "system", what: `${what} — ticked off by AURA` }) });
  const text = `${what} — ticked it off.`;
  await ctx.db.patch(plan._id, { lastReminder: { at, text, moment: "done" }, version: plan.version + 1, updatedAt: at });
  await arm(ctx, plan._id);
}
