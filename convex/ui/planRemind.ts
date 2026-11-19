// convex/ui/planRemind.ts
//
// AURA's day plan, phase 2: reminders (owner 19 Nov 2026; ta-system-ui
// docs/AURA-DAY-AGENT.md §6). Each plan has ONE scheduled wake-up, set for its
// nearest due reminder. When it fires it sends that one reminder to the TA's bell
// (the new UI's pet and pop-up read the bell), then sets the next. Every change to
// the plan calls `rearm`, which cancels the old wake-up and sets a new one, so there
// is never a pile of stale reminders; a wake-up made for an older version of the
// plan does nothing.

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { workdayDate } from "../../src/lib/workday";
import { DRAFT_NUDGE_AFTER_MIN, DRAFT_NUDGE_TEXT, atOf, colomboMin, dueReminder, nextReminderMin, type Moment, type RemindTask } from "./planRules";

const wakeRef = makeFunctionReference<"mutation", { planId: Id<"auraDayPlans">; version: number }>("ui/planRemind:wake");

const tasksOf = (ctx: MutationCtx, planId: Id<"auraDayPlans">) =>
  ctx.db.query("auraPlanTasks").withIndex("by_plan", (q) => q.eq("planId", planId)).take(100);

/** Cancel the plan's wake-up and set the next one (or none). Call after every plan change. */
export async function rearm(ctx: MutationCtx, planId: Id<"auraDayPlans">, notBefore = Date.now()): Promise<void> {
  const plan = await ctx.db.get(planId);
  if (!plan) return;
  if (plan.wakeId) {
    // A wake-up that already ran cannot be cancelled; that is fine.
    await ctx.scheduler.cancel(plan.wakeId).catch(() => undefined);
  }
  const now = Date.now();
  let at: number | null = null;
  if (plan.date === workdayDate(now)) {
    if (plan.state === "approved") {
      const min = nextReminderMin((await tasksOf(ctx, plan._id)) as RemindTask[]);
      if (min !== null) at = atOf(plan.date, min);
    } else if (plan.state === "draft" && !plan.draftNudgedAt) {
      const day = await ctx.db.query("taWorkdays").withIndex("by_user_date", (q) => q.eq("userId", plan.userId).eq("date", plan.date)).first();
      // No workday yet: look again in half an hour.
      at = day && !day.finishedAt ? day.startedAt + DRAFT_NUDGE_AFTER_MIN * 60_000 : day ? null : now + 30 * 60_000;
    }
  }
  const wakeId = at === null ? undefined : await ctx.scheduler.runAt(Math.max(notBefore, at), wakeRef, { planId, version: plan.version });
  await ctx.db.patch(planId, { wakeId });
}

async function bell(ctx: MutationCtx, userId: Id<"users">, workdayId: Id<"taWorkdays"> | undefined, body: string, taskKey?: string, jobId?: Id<"jobs">) {
  await ctx.db.insert("notifications", {
    userId,
    type: "aura_reminder",
    title: "AURA",
    body,
    workdayId,
    taskKey,
    jobId,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

export const wake = internalMutation({
  args: { planId: v.id("auraDayPlans"), version: v.number() },
  handler: async (ctx, { planId, version }) => {
    const plan = await ctx.db.get(planId);
    // Made for an older plan, or the plan is gone: do nothing.
    if (!plan || plan.version !== version) return;
    await ctx.db.patch(planId, { wakeId: undefined });
    const now = Date.now();
    if (plan.date !== workdayDate(now)) return;

    if (plan.state === "draft") {
      if (plan.draftNudgedAt) return;
      const day = await ctx.db.query("taWorkdays").withIndex("by_user_date", (q) => q.eq("userId", plan.userId).eq("date", plan.date)).first();
      if (day && !day.finishedAt && now >= day.startedAt + DRAFT_NUDGE_AFTER_MIN * 60_000) {
        await bell(ctx, plan.userId, day._id, DRAFT_NUDGE_TEXT);
        await ctx.db.patch(planId, { draftNudgedAt: now });
      }
      return await rearm(ctx, planId);
    }
    if (plan.state !== "approved") return;

    const tasks = await tasksOf(ctx, planId);
    const due = dueReminder(tasks as RemindTask[], colomboMin(now));
    if (due) {
      const task = tasks.find((t) => t.key === due.key)!;
      const sent: Moment[] = [...due.also, due.moment];
      await ctx.db.patch(task._id, { reminded: [...(task.reminded ?? []), ...sent] });
      await bell(ctx, plan.userId, plan.workdayId, due.text, task.key, task.jobId);
    }
    // Anything else due now waits a minute (one reminder at a time on screen, §6).
    await rearm(ctx, planId, due ? now + 60_000 : now);
  },
});
