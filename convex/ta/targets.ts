// convex/ta/targets.ts
//
// Daily targets (3 Nov). A TA lead or admin sets, per TA per opening, how many
// CVs to shortlist and how many LinkedIn links to add to the Excel sheet each
// day. The TA sees the target and today's progress inside the opening and on
// their dashboard.
//
// "Today" is the Colombo day. CVs are the applications the TA shortlisted on the
// opening today (applications.by_workday_owner); links are the linkVault rows
// they added today (linkVault.by_workday_added). Both are the counts the workday
// checks already use, so a target and the checklist never disagree.

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireActor, optionalActor } from "./guard";
import { cleanTarget, maySetTargets } from "../lib/targetsAccess";
import { colomboDayStart } from "../../src/lib/calendar";

const RECRUITER = ["primary_recruiter", "supporting_recruiter"];
const CAP = 2001; // a day's count never gets near this; take() keeps the read bounded

type TargetRow = {
  jobId: string;
  jobTitle: string;
  clientName: string;
  userId: string;
  userName: string;
  /** null = no target set yet */
  cvsPerDay: number | null;
  linksPerDay: number | null;
  cvsToday: number;
  linksToday: number;
};

async function build(ctx: QueryCtx, jobId: Id<"jobs">, userId: Id<"users">, since: number): Promise<TargetRow | null> {
  const [job, user, target, cvs, links] = await Promise.all([
    ctx.db.get(jobId),
    ctx.db.get(userId),
    ctx.db.query("taTargets").withIndex("by_jobId_userId", (q) => q.eq("jobId", jobId).eq("userId", userId)).first(),
    ctx.db.query("applications")
      .withIndex("by_workday_owner", (q) => q.eq("jobId", jobId).eq("ownerTaId", userId).gte("shortlistedAt", since))
      .take(CAP),
    ctx.db.query("linkVault")
      .withIndex("by_workday_added", (q) => q.eq("openingId", jobId).eq("addedBy", userId).gte("createdAt", since))
      .take(CAP),
  ]);
  if (!job || !user) return null;
  const u = user as { fullName?: string; name?: string };
  return {
    jobId: jobId as string,
    jobTitle: job.title,
    clientName: job.clientName,
    userId: userId as string,
    userName: u.fullName || u.name || "Unnamed",
    cvsPerDay: target?.cvsPerDay ?? null,
    linksPerDay: target?.linksPerDay ?? null,
    cvsToday: cvs.length,
    linksToday: links.length,
  };
}

/** Active recruiter seats, as [jobId, userId] pairs with no repeats (a re-assignment can leave two rows). */
async function seats(ctx: QueryCtx, by: { userId: Id<"users"> } | { jobId: Id<"jobs"> } | {}): Promise<[Id<"jobs">, Id<"users">][]> {
  const rows = "userId" in by
    ? await ctx.db.query("jobAssignments").withIndex("by_userId_isActive", (q) => q.eq("userId", by.userId).eq("isActive", true)).collect()
    : "jobId" in by
      ? await ctx.db.query("jobAssignments").withIndex("by_jobId", (q) => q.eq("jobId", by.jobId)).filter((q) => q.eq(q.field("isActive"), true)).collect()
      : await ctx.db.query("jobAssignments").filter((q) => q.eq(q.field("isActive"), true)).collect();
  const seen = new Map<string, [Id<"jobs">, Id<"users">]>();
  for (const r of rows) if (RECRUITER.includes(r.assignmentRole)) seen.set(`${r.jobId}:${r.userId}`, [r.jobId, r.userId]);
  return [...seen.values()];
}

async function rowsFor(ctx: QueryCtx, pairs: [Id<"jobs">, Id<"users">][]): Promise<TargetRow[]> {
  const since = colomboDayStart(Date.now());
  const rows = await Promise.all(pairs.map(([j, u]) => build(ctx, j, u, since)));
  return rows.filter((r): r is TargetRow => r !== null);
}

/** Everyone's targets, for the Targets page. Lead and admin only. */
export const board = internalQuery({
  args: { actorId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<TargetRow[]> => {
    const actor = await optionalActor(ctx, args.actorId);
    if (!actor || !maySetTargets(actor)) return [];
    const rows = await rowsFor(ctx, await seats(ctx, {}));
    return rows.sort((a, b) => a.userName.localeCompare(b.userName) || a.jobTitle.localeCompare(b.jobTitle));
  },
});

/** The caller's own targets across their openings, for the dashboard. */
export const mine = internalQuery({
  args: { actorId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<TargetRow[]> => {
    const actor = await optionalActor(ctx, args.actorId);
    if (!actor) return [];
    const rows = await rowsFor(ctx, await seats(ctx, { userId: actor._id }));
    return rows.sort((a, b) => a.jobTitle.localeCompare(b.jobTitle));
  },
});

/** One opening's targets: a lead or admin sees every TA on it, a TA only their own. */
export const forJob = internalQuery({
  args: { actorId: v.optional(v.string()), jobId: v.string() },
  handler: async (ctx, args): Promise<TargetRow[]> => {
    const actor = await optionalActor(ctx, args.actorId);
    const jobId = ctx.db.normalizeId("jobs", args.jobId);
    if (!actor || !jobId) return [];
    const pairs = (await seats(ctx, { jobId })).filter(([, u]) => maySetTargets(actor) || u === actor._id);
    return (await rowsFor(ctx, pairs)).sort((a, b) => a.userName.localeCompare(b.userName));
  },
});

/** Set (or change) one TA's daily targets on one opening. Lead and admin only. */
export const set = internalMutation({
  args: { actorId: v.optional(v.string()), jobId: v.string(), userId: v.string(), cvsPerDay: v.number(), linksPerDay: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args.actorId);
    if (!maySetTargets(actor)) throw new Error("Only a TA lead or admin can set targets.");
    const cvs = cleanTarget(args.cvsPerDay);
    const links = cleanTarget(args.linksPerDay);
    if (cvs === null || links === null) throw new Error("Targets must be whole numbers from 0 to 1000.");
    const jobId = ctx.db.normalizeId("jobs", args.jobId);
    const userId = ctx.db.normalizeId("users", args.userId);
    if (!jobId || !userId) throw new Error("That opening or TA was not found.");
    const onJob = (await seats(ctx, { jobId })).some(([, u]) => u === userId);
    if (!onJob) throw new Error("That TA is not on this opening's team.");

    const existing = await ctx.db.query("taTargets").withIndex("by_jobId_userId", (q) => q.eq("jobId", jobId).eq("userId", userId)).first();
    const row = { cvsPerDay: cvs, linksPerDay: links, setBy: actor._id, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("taTargets", { jobId, userId, ...row });
    return { ok: true as const };
  },
});
