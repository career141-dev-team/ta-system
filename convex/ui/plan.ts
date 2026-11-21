// convex/ui/plan.ts
//
// AURA's day plan, phase 1 (owner 19 Nov 2026; ta-system-ui docs/AURA-DAY-AGENT.md):
// the signed-in TA's plan for today - drafted with AURA, approved by the TA (only
// after Start workday, owner's Decision 2), ticked task by task, closed at the end
// with what is open carried. Only the TA's own plan is read or changed here; the
// lead's read-only view comes in phase 5. Reminders (phase 2) start from `approvedAt`.

import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { workdayDate } from "../../src/lib/workday";
import { mapUser } from "../../src/data/convex/map";
import { isDeskWideUser } from "../ta/guard";
import { NotSignedIn, uiUser } from "./me";
import { applyChange, dayStartOf, DEFAULT_FINISH, draftRefusal, historyOf, planTally, taskMoveRefusal, withDayEmails, type Change, type TaskState } from "./planRules";
import { arm, closePlan } from "./planRemind";

type Refused = { ok: false; message: string };
const refused = (message: string): Refused => ({ ok: false, message });

async function who(ctx: QueryCtx | MutationCtx, viewAs?: string): Promise<Refused | { ok: true; user: Doc<"users"> }> {
  try {
    return { ok: true, user: await uiUser(ctx, viewAs) };
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
  summary: plan.summary ?? null,
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

/** What the last earlier plan left open - carried, or still open on a plan nobody
 *  closed - offered first in today's draft (phase 5). Midday and EOD are not carried:
 *  every plan gets its own (phase 4). */
async function carriedFrom(ctx: QueryCtx | MutationCtx, userId: Id<"users">, date: string) {
  const last = await ctx.db.query("auraDayPlans").withIndex("by_user_date", (q) => q.eq("userId", userId).lt("date", date)).order("desc").first();
  if (!last || last.state === "draft") return { from: null, tasks: [] };
  const open = (await tasksOf(ctx, last._id)).filter((t) => (t.state === "carried" || t.state === "planned" || t.state === "doing") && t.kind !== "midday_email" && t.kind !== "eod_email");
  return {
    from: last.date,
    tasks: open.slice(0, 20).map((t) => ({ key: t.key, title: t.title, detail: t.detail ?? null, kind: t.kind, jobId: (t.jobId as string | undefined) ?? null, minutes: t.minutes, priority: t.priority })),
  };
}

/** Today's plan, or null when there is none yet. */
export const today = query({
  args: { as: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const w = await who(ctx, args.as);
    if (!w.ok) return w;
    const date = workdayDate(Date.now());
    const plan = await planOf(ctx, w.user._id, date);
    return { ok: true as const, plan: plan ? shape(plan, await tasksOf(ctx, plan._id)) : null, carried: await carriedFrom(ctx, w.user._id, date) };
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
    // Every plan carries the Midday and the EOD, the EOD just before the finish (phase 4).
    const tasks = why ? [] : withDayEmails(args.tasks, finishMin);
    if (why) return refused(why);

    // A plan from an earlier day nobody closed is closed now, carrying its open work (phase 5).
    for (const old of await ctx.db.query("auraDayPlans").withIndex("by_user_date", (q) => q.eq("userId", me).lt("date", date)).order("desc").take(3))
      if (old.state === "approved") await closePlan(ctx, old, "system", now);

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
    for (const [i, t] of tasks.entries()) {
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
    const { summary } = await closePlan(ctx, plan, "ta", now);
    return { ok: true as const, message: `Plan closed. ${summary}` };
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

/** One change read from the TA's words (ui/planTalk), applied to their approved plan:
 *  the times worked out by applyChange, each touched task given a history line with
 *  the TA's own words, moved tasks' reminders re-armed (docs/AURA-DAY-AGENT.md section 7).
 *  Internal: only ui/planTalk calls it, with the signed-in person's own id. */
export const applyTalk = internalMutation({
  args: {
    userId: v.id("users"),
    said: v.string(),
    change: v.object({
      op: v.union(v.literal("extend"), v.literal("move"), v.literal("set_end"), v.literal("snooze"), v.literal("shift_pending"), v.literal("add"), v.literal("skip"), v.literal("set_finish"), v.literal("done")),
      key: v.optional(v.string()),
      minutes: v.optional(v.number()),
      atMin: v.optional(v.number()),
      title: v.optional(v.string()),
      reason: v.optional(v.string()),
      all: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const plan = await planOf(ctx, args.userId, workdayDate(now));
    if (!plan || plan.state !== "approved") return refused(plan?.state === "closed" ? "Today's plan is closed." : "Approve today's plan first, then I can change it.");
    const rows = await tasksOf(ctx, plan._id);
    const nowMin = Math.floor((now - dayStartOf(plan.date)) / 60_000);
    const change = args.change as Change;
    const result = applyChange(
      rows.map((t) => ({ key: t.key, title: t.title, startMin: t.startMin, minutes: t.minutes, state: t.state as TaskState, kind: t.kind })),
      change,
      plan.finishMin,
      nowMin,
    );
    if ("refused" in result) return refused(result.refused);
    const said = `Chat: “${args.said.trim().slice(0, 120)}”`;

    if (change.op === "snooze" && change.all) await ctx.db.patch(plan._id, { quietUntil: now + (change.minutes ?? 30) * 60_000 });
    for (const key of result.changed) {
      const next = result.tasks.find((t) => t.key === key)!;
      const row = rows.find((t) => t.key === key);
      if (!row) {
        await ctx.db.insert("auraPlanTasks", {
          planId: plan._id,
          userId: args.userId,
          key,
          order: rows.length,
          title: next.title,
          kind: "other",
          startMin: next.startMin,
          minutes: next.minutes,
          priority: "normal",
          state: "planned",
          history: [{ at: now, by: "ta", what: `Added. ${said}` }],
        });
        continue;
      }
      const moved = next.startMin !== row.startMin || next.minutes !== row.minutes;
      const what = moved ? `${hmOf(row.startMin)}–${hmOf(row.startMin + row.minutes)} → ${hmOf(next.startMin)}–${hmOf(next.startMin + next.minutes)}` : next.state !== row.state ? `${row.state} → ${next.state}` : "Reminders paused";
      await ctx.db.patch(row._id, {
        startMin: next.startMin,
        minutes: next.minutes,
        state: next.state,
        ...(next.state === "done" ? { doneBy: "ta" as const, doneAt: now } : {}),
        ...(next.state === "skipped" ? { reason: next.reason } : {}),
        ...(next.snoozeMin ? { snoozedUntil: now + next.snoozeMin * 60_000 } : {}),
        // A task at a new time gets its reminders again, at the new times.
        ...(moved ? { reminded: [] } : {}),
        history: historyOf(row.history, { at: now, by: "ta", what: `${what}. ${said}` }),
      });
    }
    // A new finish means a new time for the lead to hear about a missing EOD (phase 4).
    const newFinish = result.finishMin !== plan.finishMin ? { leadTold: undefined } : {};
    await ctx.db.patch(plan._id, { finishMin: result.finishMin, ...newFinish, version: plan.version + 1, updatedAt: now });
    await arm(ctx, plan._id);
    return { ok: true as const, message: [result.say, ...result.clashes].join(" ") };
  },
});

const hmOf = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

/** Phase 5, the lead's read-only view (owner's Decision 4): every TA's plan for today -
 *  approved or not, done of all, what is late, what is next, the summary once closed.
 *  Desk-wide people only; nobody changes a plan here. Bounded: 40 TAs, 100 tasks each. */
export const team = query({
  args: {},
  handler: async (ctx) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    if (!isDeskWideUser(w.user)) return refused("Only a TA Lead, Director, Ops or an admin sees the team's plans.");
    const now = Date.now();
    const date = workdayDate(now);
    const nowMin = Math.floor((now - dayStartOf(date)) / 60_000);
    const people = (await ctx.db.query("users").take(400)).filter((u) => u.isActive && ["ta", "ta_support"].includes(mapUser(u as never).role)).slice(0, 40);
    const rows = await Promise.all(
      people.map(async (u) => {
        const plan = await planOf(ctx, u._id, date);
        if (!plan) return { name: u.fullName, state: "none" as const };
        const tasks = await tasksOf(ctx, plan._id);
        const open = tasks.filter((t) => t.state === "planned" || t.state === "doing");
        const next = open.sort((a, b) => a.startMin - b.startMin)[0];
        return {
          name: u.fullName,
          state: plan.state,
          finishMin: plan.finishMin,
          tally: planTally(tasks),
          late: open.filter((t) => t.startMin + t.minutes < nowMin).map((t) => t.title).slice(0, 5),
          next: next ? { title: next.title, startMin: next.startMin } : null,
          summary: plan.summary ?? null,
        };
      }),
    );
    return { ok: true as const, nowMin, team: rows };
  },
});
