// convex/lib/placementCount.ts
//
// Several placements on one opening (20 Nov). The number to fill is the
// opening's vacancies (headcount = the active work locations added up); the
// number filled is the candidates in Placed. The opening stays Active until the
// last place is filled, then moves to Placed by itself, and comes back when a
// placement falls through or the target is raised.
//
// Two rules keep a person's own choice safe: a move INTO Placed can only fill
// an Active opening, and a move OUT of Placed can only reopen a Placed one -
// so a lead who marked it Placed or on hold by hand is never overruled by a
// placement elsewhere.

import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export type FillMove = "in" | "out" | "target";

/** How many places the opening has to fill. Old openings with no number count as one. */
export function targetOf(job: { headcount?: number | null }): number {
  const n = job.headcount;
  return typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Whether the opening should change status after `move`, or null to leave it. */
export function fillDecision(status: string, target: number, placed: number, move: FillMove): "fill" | "reopen" | null {
  if (status === "active" && placed >= target && (move === "in" || move === "target")) return "fill";
  if (status === "filled" && placed < target && (move === "out" || move === "target")) return "reopen";
  return null;
}

/** Candidates in Placed on this opening (bounded: no opening has 500 places). */
export async function placedCount(ctx: MutationCtx, jobId: Id<"jobs">): Promise<number> {
  const rows = await ctx.db
    .query("applications")
    .withIndex("by_job_stage", (q) => q.eq("jobId", jobId).eq("currentStage", "placed"))
    .take(500);
  return rows.length;
}

/**
 * Run after a move into or out of Placed, or after the target changed. Never
 * throws: a failure here must not undo the stage move that called it.
 */
export async function settleFill(ctx: MutationCtx, jobId: Id<"jobs">, move: FillMove): Promise<"fill" | "reopen" | null> {
  try {
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    const placed = await placedCount(ctx, jobId);
    const target = targetOf(job);
    const decision = fillDecision(job.status, target, placed, move);
    if (!decision) return null;
    const now = Date.now();
    if (decision === "fill") {
      await ctx.db.patch(jobId, { status: "filled", positionStatus: "filled", closedAt: job.closedAt ?? now, filledAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() } as never);
    } else {
      await ctx.db.patch(jobId, { status: "active", positionStatus: "active", closedAt: undefined, filledAt: undefined, updatedAt: new Date(now).toISOString() } as never);
    }
    const lead = (job as { taLeadId?: Id<"users"> }).taLeadId;
    if (lead) {
      await ctx.db.insert("activityLog", {
        actorId: lead,
        actorName: "System",
        action: decision === "fill" ? "status_changed_filled" : "status_changed_active",
        entityType: "job",
        entityId: jobId as string,
        metadata: { auto: true, placed, target },
        occurredAt: new Date(now).toISOString(),
      } as never);
      await ctx.db.insert("notifications", {
        userId: lead,
        type: "opening_changed",
        title: decision === "fill" ? "An opening is fully placed" : "An opening is open again",
        body: decision === "fill"
          ? `${job.title} has ${placed} of ${target} placed, so it moved to Placed.`
          : `${job.title} has ${placed} of ${target} placed, so it is open again.`,
        jobId,
        read: false,
        createdAt: new Date(now).toISOString(),
      } as never);
    }
    return decision;
  } catch (e) {
    console.error("[placementCount] settleFill failed:", e);
    return null;
  }
}
