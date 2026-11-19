// convex/ui/plan.ts
//
// AURA's day plan, phase 1 (owner 19 Nov 2026; ta-system-ui docs/AURA-DAY-AGENT.md):
// the signed-in TA's plan for today - drafted with AURA, approved by the TA (only
// after Start workday, owner's Decision 2), ticked task by task, closed at the end
// with what is open carried. Only the TA's own plan is read or changed here; the
// lead's read-only view comes in phase 5. Reminders (phase 2) start from `approvedAt`.

import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { workdayDate } from "../../src/lib/workday";
import { NotSignedIn, uiUser } from "./me";
import { DEFAULT_FINISH, draftRefusal, historyOf, planTally, taskMoveRefusal, type TaskState } from "./planRules";
import { arm } from "./planRemind";

type Refused = { ok: false; message: string };
const refused = (message: string): Refused => ({ ok: false, message });

async function who(ctx: QueryCtx | MutationCtx): Promise<Refused | { ok: true; user: Doc<"users"> }> {
  try {
    return { ok: true, user: await uiUser(ctx) };
  } catch (error) {
    return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
  }
}

const planOf = (ctx: QueryCtx | MutationCtx, userId: Id<"users">, date: string) =>
  ctx.db.query("auraDayPlans").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date)).first();
const tasksOf = async (ctx: QueryCtx | MutationCtx, planId: Id<"auraDayPlans">) =>
  (await ctx.db.query("auraPlanTasks").withIndex("by_plan", (q) => q.eq("planId", planId)).take(100)).sort((a, b) => a.order - b.order);

const shape = (plan: Doc<"auraDayPlans">, tasks: Doc<"auraPlanTasks">[]) => ({
  id: plan._id as string,
  date: plan.date,
  state: plan.state,
  finishMin: plan.finishMin,
  approvedAt: plan.approvedAt ?? null,
  version: plan.version,
  quietUntil: plan.quietUntil ?? null,
  lastReminder: plan.lastReminder ?? null,
  tally: planTally(tasks),
  tasks: tasks.map((t) => ({
    key: t.key,
    title: t.title,
    detail: t.detail ?? null,
    kind: t.kind,
    jobId: (t.jobId as string | undefined) ?? null,
    startMin: t.startMin,
    minutes: t.minutes,
    priority: t.priority,
    dependsOn: t.dependsOn ?? null,
    state: t.state,
    doneBy: t.doneBy ?? null,
    reason: t.reason ?? null,
    snoozedUntil: t.snoozedUntil ?? null,
  })),
});

/** Today's plan, or null when there is none yet. */
export const today = query({
  args: {},
  handler: async (ctx) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const plan = await planOf(ctx, w.user._id, workdayDate(Date.now()));
    return { ok: true as const, plan: plan ? shape(plan, await tasksOf(ctx, plan._id)) : null };
  },
});

const draftTask = v.object({
  key: v.string(),
  title: v.string(),
  detail: v.optional(v.string()),
  kind: v.string(),
  jobId: v.optional(v.string()),
  startMin: v.number(),
  minutes: v.number(),
  priority: v.string(),
  dependsOn: v.optional(v.string()),
});

/** Save (or replace) today's draft. Refused once the plan is approved or closed. */
export const saveDraft = mutation({
  args: { tasks: v.array(draftTask), finishMin: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const me = w.user._id;
    const now = Date.now();
    const date = workdayDate(now);
    const finishMin = args.finishMin ?? DEFAULT_FINISH;
    const mine = await ctx.db.query("jobAssignments").withIndex("by_userId_isActive", (q) => q.eq("userId", me).eq("isActive", true)).take(100);
    const why = draftRefusal(args.tasks, finishMin, new Set(mine.map((a) => a.jobId as string)));
    if (why) return refused(why);

    let plan = await planOf(ctx, me, date);
    if (plan && plan.state !== "draft") return refused(plan.state === "approved" ? "Today's plan is already approved. Change it by asking AURA." : "Today's plan is closed.");
    if (plan) {
      // A draft is replaced whole: its tasks were never approved, so nothing is lost.
      for (const t of await tasksOf(ctx, plan._id)) await ctx.db.delete(t._id);
      await ctx.db.patch(plan._id, { finishMin, version: plan.version + 1, updatedAt: now });
    } else {
      const id = await ctx.db.insert("auraDayPlans", { userId: me, date, state: "draft", finishMin, version: 1, createdAt: now, updatedAt: now });
      plan = (await ctx.db.get(id))!;
    }
    for (const [i, t] of args.tasks.entries()) {
      await ctx.db.insert("auraPlanTasks", {
        planId: plan._id,
        userId: me,
        key: t.key,
        order: i,
        title: t.title.trim(),
        detail: t.detail?.trim() || undefined,
        kind: t.kind,
        jobId: (t.jobId as Id<"jobs"> | undefined) || undefined,
        startMin: t.startMin,
        minutes: t.minutes,
        priority: t.priority,
        dependsOn: t.dependsOn,
        state: "planned",
        history: [{ at: now, by: "ta", what: "Planned with AURA" }],
      });
    }
    await arm(ctx, plan._id);
    return { ok: true as const, message: "Draft saved." };
  },
});

/** Approve today's draft. Only after Start workday (owner, Decision 2). */
export const approve = mutation({
  args: {},
  handler: async (ctx) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const now = Date.now();
    const date = workdayDate(now);
    const plan = await planOf(ctx, w.user._id, date);
    if (!plan) return refused("There is no plan to approve yet. Plan your day with AURA first.");
    if (plan.state !== "draft") return refused(plan.state === "approved" ? "Today's plan is already approved." : "Today's plan is closed.");
    const day = await ctx.db.query("taWorkdays").withIndex("by_user_date", (q) => q.eq("userId", w.user._id).eq("date", date)).first();
    if (!day || day.finishedAt) return refused("Start your workday first, then approve the plan.");
    const tasks = await tasksOf(ctx, plan._id);
    if (!tasks.length) return refused("The plan has no tasks yet.");
    await ctx.db.patch(plan._id, { state: "approved", approvedAt: now, workdayId: day._id, version: plan.version + 1, updatedAt: now });
    await arm(ctx, plan._id);
    return { ok: true as const, message: "Plan approved. AURA will keep you on it." };
  },
});

/** Tick, start, undo, skip (with a reason) or bring back one task. */
export const setTask = mutation({
  args: { key: v.string(), state: v.union(v.literal("planned"), v.literal("doing"), v.literal("done"), v.literal("skipped")), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const now = Date.now();
    const plan = await planOf(ctx, w.user._id, workdayDate(now));
    if (!plan) return refused("There is no plan for today.");
    const task = (await tasksOf(ctx, plan._id)).find((t) => t.key === args.key);
    if (!task) return refused("That task is not in today's plan. Reload the page.");
    const reason = args.reason?.trim().slice(0, 300);
    const why = taskMoveRefusal(task.state as TaskState, args.state, plan.state, reason);
    if (why) return refused(why);
    const words = { planned: "Back to planned", doing: "Started", done: "Done", skipped: `Skipped: ${reason}` }[args.state];
    await ctx.db.patch(task._id, {
      state: args.state,
      doneBy: args.state === "done" ? "ta" : undefined,
      doneAt: args.state === "done" ? now : undefined,
      reason: args.state === "skipped" ? reason : undefined,
      history: historyOf(task.history, { at: now, by: "ta", what: words }),
    });
    await ctx.db.patch(plan._id, { version: plan.version + 1, updatedAt: now });
    await arm(ctx, plan._id);
    return { ok: true as const, message: args.state === "done" ? `“${task.title}” done.` : "Saved." };
  },
});

/** Close today's plan: every open task is carried to tomorrow, nothing is marked done. */
export const close = mutation({
  args: {},
  handler: async (ctx) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const now = Date.now();
    const plan = await planOf(ctx, w.user._id, workdayDate(now));
    if (!plan) return refused("There is no plan for today.");
    if (plan.state !== "approved") return refused(plan.state === "closed" ? "Today's plan is already closed." : "Approve the plan before closing it.");
    let carried = 0;
    for (const t of await tasksOf(ctx, plan._id)) {
      if (t.state !== "planned" && t.state !== "doing") continue;
      carried += 1;
      await ctx.db.patch(t._id, { state: "carried", history: historyOf(t.history, { at: now, by: "ta", what: "Carried to the next day" }) });
    }
    await ctx.db.patch(plan._id, { state: "closed", closedAt: now, version: plan.version + 1, updatedAt: now });
    await arm(ctx, plan._id); // a closed plan has no wake-up: this cancels it
    return { ok: true as const, message: carried ? `Plan closed. ${carried} open ${carried === 1 ? "task carries" : "tasks carry"} to tomorrow.` : "Plan closed. Everything is done." };
  },
});

/** "Stop reminding me for N minutes": one task (its key) or the whole plan. The task
 *  itself is not touched - only its reminders wait (docs/AURA-DAY-AGENT.md section 7). */
export const snooze = mutation({
  args: { key: v.optional(v.string()), minutes: v.number() },
  handler: async (ctx, args) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    if (!Number.isInteger(args.minutes) || args.minutes < 5 || args.minutes > 240) return refused("Snooze for 5 minutes to 4 hours.");
    const now = Date.now();
    const plan = await planOf(ctx, w.user._id, workdayDate(now));
    if (!plan || plan.state !== "approved") return refused("There is no approved plan to quiet.");
    const until = now + args.minutes * 60_000;
    if (args.key) {
      const task = (await tasksOf(ctx, plan._id)).find((t) => t.key === args.key);
      if (!task) return refused("That task is not in today's plan. Reload the page.");
      await ctx.db.patch(task._id, { snoozedUntil: until, history: historyOf(task.history, { at: now, by: "ta", what: `Reminders paused for ${args.minutes} min` }) });
    } else await ctx.db.patch(plan._id, { quietUntil: until });
    await ctx.db.patch(plan._id, { version: plan.version + 1, updatedAt: now });
    await arm(ctx, plan._id);
    return { ok: true as const, message: `No reminders${args.key ? " for that task" : ""} for ${args.minutes} minutes.` };
  },
});
