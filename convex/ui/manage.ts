// convex/ui/manage.ts
//
// PR 1b (18 Nov): writes whose rules lived ONLY in the old Next.js app, moved
// into the backend so the new UI can call them safely. The old app built
// these as generic `ta/commit:apply` ops after checking the rules itself; here
// the same rules run in the same transaction as the write. Old AURA keeps its
// own path untouched.
//
// Permission checks reuse the old app's own `can` (src/lib/auth.ts), fed the
// same inputs it was fed there: the person (mapUser), their assignment on the
// opening, and whether they are on a strategy row.

import { v } from "convex/values";
import { mutation, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { makeFunctionReference } from "convex/server";

// Not in the checked-in _generated/api (its own module since 9 Nov).
const DELETE_DROPPED = makeFunctionReference<"mutation", { actorId?: string; applicationId: string }>("ta/applicationDelete:deleteDropped");
import type { Doc, Id } from "../_generated/dataModel";
import { mapUser } from "../../src/data/convex/map";
import { can } from "../../src/lib/auth";
import { isGone } from "../../src/lib/bin";
import { colomboDayFromValue, colomboDayStart } from "../../src/lib/calendar";
import { isTicked, strategyAcceptanceStatus } from "../../src/lib/strategyPlanner";
import { NotSignedIn, uiUser } from "./me";
import { inWords, normalizeQuestions, strategyRowsToSubmit, type StrategyRowLike } from "./rules";

type Refused = { ok: false; message: string };
type Done = Refused | { ok: true; message: string };
const refused = (message: string): Refused => ({ ok: false, message });

/** The person, their opening and their assignment on it - what `can` is asked with. */
async function forOpening(ctx: MutationCtx, openingId: string) {
  let user: Doc<"users">;
  try {
    user = await uiUser(ctx);
  } catch (error) {
    return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
  }
  const jobId = ctx.db.normalizeId("jobs", openingId);
  const job = jobId ? await ctx.db.get(jobId) : null;
  if (!jobId || !job || isGone(job)) return refused("That opening no longer exists.");
  const row = await ctx.db
    .query("jobAssignments")
    .withIndex("by_jobId_userId", (q) => q.eq("jobId", jobId).eq("userId", user._id))
    .filter((q) => q.eq(q.field("isActive"), true))
    .first();
  const assignment = row ? ({ userId: user._id as string, role: row.assignmentRole } as never) : null;
  return { ok: true as const, user, mapped: mapUser(user as never), job, jobId, assignment };
}

/** The opening's follow-up questions, the whole list as the Automations panel saves it. */
export const setQuestions = mutation({
  args: { openingId: v.string(), questions: v.array(v.string()) },
  handler: async (ctx, args): Promise<Done> => {
    const o = await forOpening(ctx, args.openingId);
    if (!o.ok) return o;
    const verdict = can(o.mapped, "opening.manage", { openingId: o.jobId as string, assignment: o.assignment });
    if (!verdict.ok) return refused(verdict.message);
    const existing = ((o.job as { followUpQuestions?: { id: string; label: string }[] }).followUpQuestions ?? []);
    const next = normalizeQuestions(existing, args.questions, () => `q${Math.random().toString(36).slice(2, 8)}`);
    if (!next.ok) return next;
    await ctx.db.patch(o.jobId, { followUpQuestions: next.questions, updatedAt: Date.now() } as never);
    return { ok: true, message: "Follow-up questions saved." };
  },
});

/** Strategy rows on this opening, read as the old rules read them. */
async function strategyRows(ctx: MutationCtx, jobId: Id<"jobs">) {
  return ctx.db.query("strategyAssignments").withIndex("by_opening", (q) => q.eq("openingId", jobId)).take(500);
}

/** Accept every strategy waiting for this TA on this opening. */
export const acceptStrategies = mutation({
  args: { openingId: v.string() },
  handler: async (ctx, args): Promise<Done> => {
    const o = await forOpening(ctx, args.openingId);
    if (!o.ok) return o;
    const me = o.user._id as string;
    const rows = await strategyRows(ctx, o.jobId);
    const onStrategy = rows.some((r) => r.doneBy.some((d) => (d as string) === me));
    const verdict = can(o.mapped, "strategy.work", { openingId: o.jobId as string, assignment: o.assignment, ownerTaId: null, onStrategy });
    if (!verdict.ok) return refused(verdict.message);
    const now = Date.now();
    let accepted = 0;
    for (const row of rows) {
      const view = { ...row, doneBy: row.doneBy.map(String) } as never;
      if (row.notApplicable || !isTicked(view) || !row.doneBy.some((d) => (d as string) === me)) continue;
      const acks = row.acknowledgements ?? [];
      const mine = acks.find((a) => (a.taId as string) === me);
      if (!mine || mine.acceptedAt !== null) continue;
      await ctx.db.patch(row._id, { acknowledgements: acks.map((a) => ((a.taId as string) === me ? { ...a, acceptedAt: now } : a)) });
      accepted++;
    }
    if (accepted === 0) return { ok: true, message: "There are no new strategy assignments to accept." };
    return { ok: true, message: `Accepted ${accepted} ${accepted === 1 ? "strategy" : "strategies"}. You can start working on ${accepted === 1 ? "it" : "them"} now.` };
  },
});

/** A TA submits what they did on their strategies; the TA Lead is belled. */
export const submitStrategies = mutation({
  args: {
    openingId: v.string(),
    rows: v.array(v.object({ rowId: v.string(), used: v.boolean(), date: v.string(), note: v.string() })),
  },
  handler: async (ctx, args): Promise<Done> => {
    const o = await forOpening(ctx, args.openingId);
    if (!o.ok) return o;
    const me = o.user._id as string;
    const rows = await strategyRows(ctx, o.jobId);
    const onStrategy = rows.some((r) => r.doneBy.some((d) => (d as string) === me));
    const verdict = can(o.mapped, "strategy.work", { openingId: o.jobId as string, assignment: o.assignment, ownerTaId: null, onStrategy });
    if (!verdict.ok) return refused(verdict.message);

    const byId = new Map<string, StrategyRowLike>();
    for (const r of rows) {
      const view = { ...r, doneBy: r.doneBy.map(String) } as never;
      byId.set(r._id as string, { id: r._id as string, name: r.strategyName, notApplicable: r.notApplicable, onIt: r.doneBy.some((d) => (d as string) === me), ticked: isTicked(view) });
    }
    const now = Date.now();
    const picked = strategyRowsToSubmit(byId, args.rows, colomboDayFromValue, colomboDayStart(now));
    if (!picked.ok) return picked;

    // store.ts submitStrategyRows, row by row: a row still waiting for this
    // TA's acceptance is not taken; a ticked row they were not on gains them.
    let taken = 0;
    for (const p of picked.rows) {
      const row = rows.find((r) => (r._id as string) === p.rowId)!;
      const view = { ...row, doneBy: row.doneBy.map(String), acknowledgements: row.acknowledgements?.map((a) => ({ ...a, taId: a.taId as string })) } as never;
      const onIt = row.doneBy.some((d) => (d as string) === me);
      if (onIt && strategyAcceptanceStatus(view, me) === "pending") continue;
      await ctx.db.patch(row._id, {
        doneBy: onIt ? row.doneBy : [...row.doneBy, o.user._id],
        doneAt: p.doneAt,
        note: p.note,
        proofs: row.proofs.map((x) => (x.submittedAt === null && (x.addedBy as string) === me ? { ...x, submittedAt: now } : x)),
        submittedAt: now,
        submittedBy: o.user._id,
      });
      taken++;
    }
    if (taken === 0) return refused("Accept your new strategy assignments before submitting an update.");

    // ponytail: the old app held a 5-minute in-memory throttle per process on
    // this bell; here every submit bells the lead once. Add a stored throttle
    // if leads find it noisy.
    const lead = (o.job as { taLeadId?: string }).taLeadId;
    if (lead && lead !== me) {
      await ctx.runMutation(internal.ta.notifications.create, {
        userId: lead, type: "strategy_assigned", title: "A TA submitted strategies",
        body: `${o.user.fullName} submitted their strategies on ${o.job.title}.`, jobId: o.jobId as string,
      });
    }
    return { ok: true, message: `Submitted ${taken} ${taken === 1 ? "strategy" : "strategies"}. Your TA Lead can now see ${taken === 1 ? "it" : "them"}.` };
  },
});

/**
 * Remove someone from this opening (src/app/actions.ts removeApplication):
 * opening.manage; a move to Dropped out with "Removed from the opening", which
 * Bring back reverses; already in Dropped out it is the lead-only real delete
 * (ta/applicationDelete:deleteDropped). The collision lock is in moveStage.
 */
export const removeFromOpening = mutation({
  args: { applicationId: v.string() },
  handler: async (ctx, args): Promise<Done> => {
    const appId = ctx.db.normalizeId("applications", args.applicationId);
    const app = appId ? await ctx.db.get(appId) : null;
    if (!appId || !app) return refused("That record no longer exists — it may have been removed.");
    const o = await forOpening(ctx, app.jobId as string);
    if (!o.ok) return o;
    const verdict = can(o.mapped, "opening.manage", { openingId: o.jobId as string, assignment: o.assignment });
    if (!verdict.ok) return refused(verdict.message);
    try {
      if (app.currentStage === "unresponsive") {
        await ctx.runMutation(DELETE_DROPPED, { actorId: o.user._id, applicationId: appId });
        return { ok: true, message: "Deleted from this job. The candidate and their CV stay in the database." };
      }
      const r: { ownerTaId?: string } = await ctx.runMutation(internal.ta.applications.moveStage, {
        actorId: o.user._id, applicationId: appId, stage: "dropped_out", reason: "Removed from the opening",
      });
      if (r?.ownerTaId) return refused("Another recruiter has claimed this candidate.");
    } catch (error) {
      return refused(inWords(error, "They could not be removed."));
    }
    return { ok: true, message: "Removed from the opening — they are under Dropped out, and can be brought back from there." };
  },
});

/** Database CVs "Not for this job": off this opening's matches for good (ta/applications:excludeFromMatches). */
export const notForJob = mutation({
  args: { openingId: v.string(), candidateId: v.string() },
  handler: async (ctx, args): Promise<Done> => {
    const o = await forOpening(ctx, args.openingId);
    if (!o.ok) return o;
    try {
      await ctx.runMutation(internal.ta.applications.excludeFromMatches, { actorId: o.user._id, openingId: o.jobId, candidateId: args.candidateId });
    } catch (error) {
      return refused(inWords(error, "That could not be saved. Try again."));
    }
    return { ok: true, message: "Taken off this job's matches." };
  },
});
