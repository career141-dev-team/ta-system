// convex/ui/placements.ts
//
// How many places an opening has and how many are filled (20 Nov). The target
// is the opening's vacancies, per work location when it has them. The count is
// the candidates in Placed. Changing the target can fill or reopen the opening
// (convex/lib/placementCount.ts). Leads, admins and the opening's primary TA.

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { mapUser } from "../../src/data/convex/map";
import { isDeskWide } from "../../src/lib/auth";
import { isGone } from "../../src/lib/bin";
import { validateWorkLocations, type WorkLocation } from "../../src/lib/workLocations";
import { placedCount, settleFill, targetOf } from "../lib/placementCount";
import { NotSignedIn, mayReadOpening, uiUser } from "./me";

type Refused = { ok: false; message: string };
const refused = (message: string): Refused => ({ ok: false, message });

async function mayEdit(ctx: Parameters<typeof mayReadOpening>[0], user: Doc<"users">, jobId: Doc<"jobs">["_id"]) {
  if (isDeskWide(mapUser(user as never))) return true;
  const row = await ctx.db
    .query("jobAssignments")
    .withIndex("by_jobId_userId", (q) => q.eq("jobId", jobId).eq("userId", user._id))
    .filter((q) => q.eq(q.field("isActive"), true))
    .first();
  return row?.assignmentRole === "primary_recruiter";
}

/** Places to fill and places filled, in total and per work location. */
export const status = query({
  args: { openingId: v.string() },
  handler: async (ctx, args) => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    const jobId = ctx.db.normalizeId("jobs", args.openingId);
    const job = jobId ? await ctx.db.get(jobId) : null;
    if (!jobId || !job || isGone(job)) return refused("That opening no longer exists.");
    if (!(await mayReadOpening(ctx, user, jobId))) return refused("You are not on this opening.");

    const rows = await ctx.db
      .query("applications")
      .withIndex("by_job_stage", (q) => q.eq("jobId", jobId).eq("currentStage", "placed"))
      .take(500);
    const perLocation = new Map<string, number>();
    for (const r of rows) perLocation.set(r.workLocationId ?? "", (perLocation.get(r.workLocationId ?? "") ?? 0) + 1);
    const locations = ((job.workLocations ?? []) as WorkLocation[])
      .filter((l) => !l.archived)
      .map((l) => ({ id: l.id, name: l.name, vacancies: l.vacancies, placed: perLocation.get(l.id) ?? 0 }));
    return {
      ok: true as const,
      target: targetOf(job),
      placed: rows.length,
      state: job.status as string,
      locations,
      canEdit: await mayEdit(ctx, user, jobId),
    };
  },
});

/**
 * Change the places to fill. With work locations: the vacancies of each active
 * one (`vacancies`, by location id). Without: `total`. It cannot go below the
 * places already filled.
 */
export const setTarget = mutation({
  args: {
    openingId: v.string(),
    total: v.optional(v.number()),
    vacancies: v.optional(v.array(v.object({ id: v.string(), vacancies: v.number() }))),
  },
  handler: async (ctx, args): Promise<Refused | { ok: true; message: string }> => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    const jobId = ctx.db.normalizeId("jobs", args.openingId);
    const job = jobId ? await ctx.db.get(jobId) : null;
    if (!jobId || !job || isGone(job)) return refused("That opening no longer exists.");
    if (!(await mayEdit(ctx, user, jobId))) return refused("Only a TA Lead, an admin or the primary TA can change the places to fill.");
    if (["cancelled", "draft"].includes(job.status)) return refused("This opening is closed. Open it again first.");

    const placed = await placedCount(ctx, jobId);
    const locations = (job.workLocations ?? []) as WorkLocation[];
    let patch: Record<string, unknown>;
    let total: number;
    if (locations.length) {
      const wanted = new Map((args.vacancies ?? []).map((r) => [r.id, r.vacancies]));
      if (!wanted.size) return refused("Give the places for each city.");
      const next = locations.map((l) => (!l.archived && wanted.has(l.id) ? { ...l, vacancies: wanted.get(l.id)! } : l));
      try {
        validateWorkLocations(next, locations);
      } catch (e) {
        return refused(e instanceof Error ? e.message : "Check the places.");
      }
      total = next.filter((l) => !l.archived).reduce((n, l) => n + l.vacancies, 0);
      patch = { workLocations: next, headcount: total };
    } else {
      total = Math.floor(args.total ?? 0);
      if (!Number.isSafeInteger(total) || total < 1 || total > 10000) return refused("Places must be a whole number from 1 to 10,000.");
      patch = { headcount: total };
    }
    if (total < placed) return refused(`${placed} ${placed === 1 ? "place is" : "places are"} already filled. The target cannot be lower.`);

    await ctx.db.patch(jobId, { ...patch, updatedAt: new Date().toISOString() } as never);
    const moved = await settleFill(ctx, jobId, "target");
    return { ok: true, message: moved === "fill" ? "Saved. Every place is filled, so the opening moved to Placed." : moved === "reopen" ? "Saved. The opening is open again." : "Saved." };
  },
});
