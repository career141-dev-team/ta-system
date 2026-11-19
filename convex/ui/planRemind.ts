// convex/ui/planRemind.ts
//
// AURA's day-plan reminders, phase 2 (owner 19 Nov 2026, ta-system-ui
// docs/AURA-DAY-AGENT.md section 6). One scheduled wake-up per plan: when it fires it
// sends what is due (at most one reminder: a bell row of kind `aura_reminder`, and
// `lastReminder` on the plan, which the screen's pet speaks and turns into a browser
// pop-up), marks what it handled, and schedules the next. Every change to a plan calls
// `arm`, which cancels the old wake-up and plans the new one, so there is never a pile
// of stale reminders; a wake-up for an older `version` of the plan does nothing.
// Before approval only one thing is ever sent: "your plan is not approved yet", an
// hour after the workday started.

import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { makeFunctionReference } from "convex/server";
import { dayStartOf, dueNow, nextWake, NUDGE_AFTER_MS, type RemTask, type TaskState } from "./planRules";

const wakeRef = makeFunctionReference<"mutation", { planId: Id<"auraDayPlans">; version: number }>("ui/planRemind:wake");

const remTask = (t: Doc<"auraPlanTasks">): RemTask => ({
  key: t.key,
  title: t.title,
  kind: t.kind,
  startMin: t.startMin,
  minutes: t.minutes,
  state: t.state as TaskState,
  snoozedUntil: t.snoozedUntil,
  reminded: t.reminded,
});

const tasksOf = async (ctx: MutationCtx, planId: Id<"auraDayPlans">) =>
  (await ctx.db.query("auraPlanTasks").withIndex("by_plan", (q) => q.eq("planId", planId)).take(100)).sort((a, b) => a.order - b.order);

/** When the not-approved nudge is due for a draft, or null. */
async function nudgeAt(ctx: MutationCtx, plan: Doc<"auraDayPlans">): Promise<number | null> {
  if (plan.state !== "draft" || plan.nudged) return null;
  const day = await ctx.db.query("taWorkdays").withIndex("by_user_date", (q) => q.eq("userId", plan.userId).eq("date", plan.date)).first();
  return day && !day.finishedAt ? day.startedAt + NUDGE_AFTER_MS : null;
}

/** Cancel this plan's wake-up and schedule the next one, from the plan as it is now. */
export async function arm(ctx: MutationCtx, planId: Id<"auraDayPlans">): Promise<void> {
  const plan = await ctx.db.get(planId);
  if (!plan) return;
  if (plan.wakeJobId) {
    try {
      await ctx.scheduler.cancel(plan.wakeJobId);
    } catch {
      // Already ran or already cancelled: nothing to undo.
    }
  }
  const now = Date.now();
  let at: number | null = null;
  if (plan.state === "approved") at = nextWake((await tasksOf(ctx, plan._id)).map(remTask), dayStartOf(plan.date), now, plan.quietUntil);
  else if (plan.state === "draft") {
    const n = await nudgeAt(ctx, plan);
    at = n === null ? null : Math.max(n, now + 1000);
  }
  if (at === null) {
    await ctx.db.patch(plan._id, { wakeJobId: undefined, wakeAt: undefined });
    return;
  }
  const job = await ctx.scheduler.runAt(at, wakeRef, { planId: plan._id, version: plan.version });
  await ctx.db.patch(plan._id, { wakeJobId: job, wakeAt: at });
}

async function bell(ctx: MutationCtx, plan: Doc<"auraDayPlans">, title: string, body: string, jobId?: Id<"jobs">, taskKey?: string) {
  await ctx.db.insert("notifications", {
    userId: plan.userId,
    type: "aura_reminder",
    title,
    body,
    ...(jobId ? { jobId } : {}),
    ...(taskKey ? { taskKey } : {}),
    read: false,
    createdAt: new Date().toISOString(),
  });
}

export const wake = internalMutation({
  args: { planId: v.id("auraDayPlans"), version: v.number() },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId);
    // An older plan's wake-up, or a closed plan: nothing to say.
    if (!plan || plan.version !== args.version || plan.state === "closed") return;
    const now = Date.now();

    if (plan.state === "draft") {
      const n = await nudgeAt(ctx, plan);
      if (n !== null && now >= n) {
        const text = "Your plan is not approved yet — approve it so I can keep you on time.";
        await bell(ctx, plan, "Approve today's plan", text);
        await ctx.db.patch(plan._id, { nudged: true, lastReminder: { at: now, text, moment: "approve" }, wakeJobId: undefined, wakeAt: undefined });
      }
      return;
    }

    const tasks = await tasksOf(ctx, plan._id);
    const { deliver, mark } = dueNow(tasks.map(remTask), dayStartOf(plan.date), now, plan.quietUntil);
    for (const t of tasks) {
      const ms = mark.get(t.key);
      if (ms?.length) await ctx.db.patch(t._id, { reminded: [...(t.reminded ?? []), ...ms.map((m) => `${t.key}:${m}`)] });
    }
    if (deliver) {
      const task = tasks.find((t) => t.key === deliver.key)!;
      await bell(ctx, plan, "AURA", deliver.text, task.jobId, task.key);
      await ctx.db.patch(plan._id, { lastReminder: { at: now, text: deliver.text, key: deliver.key, moment: deliver.moment } });
    }
    await arm(ctx, plan._id);
  },
});
