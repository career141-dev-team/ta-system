// convex/ta/applicationDelete.ts
//
// Deleting one person from a job, from Dropped out (9 Nov). "Remove from this job" on someone already in Dropped
// out used to move them to Dropped out again, so they could never leave and kept their owner, which locked every
// other TA out (Dinisha De Silva: Sameera dropped her, Sanduni could not add her). Its own file so it does not
// drag in the stage machine.

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireActor } from "./guard";
import { toTaStage } from "./stages";
import { isDeskWide } from "../../src/lib/auth";
import { mapUser } from "../../src/data/convex/map";
import { removeApplicationChildren } from "../lib/applicationChildren";

/**
 * Removes the application for good, with the rows under it. The candidate and their CV stay, and the row in
 * Excel Tables offers "Add to pipeline" again.
 *
 * Only a lead or above, only from Dropped out, and never someone with a Director/client review, an interview, an
 * offer or a placement: that history is what the desk's reports and sent emails point at.
 */
export const deleteDropped = internalMutation({
  args: { actorId: v.optional(v.string()), applicationId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireActor(ctx, args.actorId);
    if (!isDeskWide(mapUser(user))) throw new Error("Only a lead, director or admin can delete someone from Dropped out.");
    const app = await ctx.db.get(args.applicationId as Id<"applications">);
    if (!app) return { ok: true as const, deleted: false };
    if (toTaStage(app.currentStage) !== "dropped_out") throw new Error("Only someone in Dropped out can be deleted from the job.");
    for (const table of ["directorReviews", "clientReviews", "interviews", "offers"] as const) {
      const held = await ctx.db.query(table).withIndex("by_applicationId", (q) => q.eq("applicationId", app._id)).first();
      if (held) throw new Error("They have a Director review, interview or offer on this job, so they stay in Dropped out.");
    }
    const placed = await ctx.db.query("placements").withIndex("by_jobId", (q) => q.eq("jobId", app.jobId)).collect();
    if (placed.some((p) => p.applicationId === app._id)) throw new Error("They were placed on this job, so they stay in Dropped out.");
    // One transaction: if the rows under them do not fit, nothing is deleted.
    let left = 1000;
    const finished = await removeApplicationChildren(ctx, app._id, async (id) => { await ctx.db.delete(id as never); left--; }, () => left);
    if (!finished) throw new Error("This application has too much history to delete here. Nothing was deleted.");
    await ctx.db.delete(app._id);
    // The candidate's overall status is worked out again from whatever else they are in.
    await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">("candidates/candidates:syncCandidateOverallStatusInternal"), { candidateId: app.candidateId });
    return { ok: true as const, deleted: true };
  },
});
