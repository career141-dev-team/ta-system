import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { inWorkLocation } from "../../src/lib/workLocations";

export interface ReopenEarlyEodSummary {
  userId: Id<"users">;
  jobId: Id<"jobs">;
  date: string;
  workLocationId: string | null;
  workdayId: Id<"taWorkdays"> | null;
  workdayClosed: boolean;
  emailId: Id<"dailyEmails">;
  receiptId: Id<"taWorkdayMail"> | null;
  roundId: Id<"reviewRounds"> | null;
  candidateIds: Id<"applications">[];
  acceptedAt: number | null;
  leadsToReopen: number;
  requestsToRestore: number;
}

/**
 * Reopen an accidentally sent original EOD email so the TA can continue working
 * on the opening today and send Midday or EOD again. The sent email remains in
 * history with its real send time.
 */
export async function reopenEarlyEodEmail(
  ctx: MutationCtx,
  { email, dryRun = false }: { email: Doc<"dailyEmails">; dryRun?: boolean },
): Promise<{ dryRun: boolean; changed: boolean; summary: ReopenEarlyEodSummary }> {
  if (email.submissionType !== "eod" || email.parentId || email.forDate) {
    throw new Error("Only an original end-of-day email can be reopened.");
  }
  if (email.status !== "accepted" || !email.finalizedAt) {
    throw new Error("Only a finalized accepted end-of-day email can be reopened.");
  }
  if (email.recoveryReopenedAt) {
    throw new Error("This end-of-day email has already been reopened.");
  }

  const locationId = email.workLocationId ?? "";
  const sameDayEmails = (
    await ctx.db
      .query("dailyEmails")
      .withIndex("by_user_job_date", (q) =>
        q.eq("userId", email.userId).eq("jobId", email.jobId).eq("date", email.date),
      )
      .collect()
  ).filter((e) => inWorkLocation(e, locationId));

  if (sameDayEmails.some((e) => e.status === "sending" || e.status === "uncertain")) {
    throw new Error("There is an unresolved send on this opening today. Reconcile it first.");
  }
  if (sameDayEmails.some((e) => e.parentId === email._id)) {
    throw new Error("This end-of-day email already has a revised correction.");
  }

  const receipt = email.receiptId ? await ctx.db.get(email.receiptId) : null;
  if (email.receiptId && !receipt) {
    throw new Error("The workday receipt for this email is missing.");
  }
  if (receipt) {
    if (
      receipt.userId !== email.userId ||
      receipt.jobId !== email.jobId ||
      receipt.status !== "accepted" ||
      !receipt.finalizedAt ||
      receipt.recoveryReopenedAt
    ) {
      throw new Error("The workday receipt does not match an active accepted EOD.");
    }
  }

  const round = email.roundId ? await ctx.db.get(email.roundId) : null;
  if (round) {
    if (
      round.openingId !== email.jobId ||
      round.sentBy !== email.userId ||
      round.kind !== "director" ||
      round.status !== "awaiting" ||
      round.decisions.length > 0 ||
      round.recoveryReopenedAt
    ) {
      throw new Error("The Director has already reviewed or recorded a decision on this email, so it cannot be reopened.");
    }
  }

  const days = (
    await ctx.db
      .query("taWorkdays")
      .withIndex("by_user", (q) => q.eq("userId", email.userId))
      .collect()
  ).filter((d) => d.date === email.date);
  const day = days.find((d) => d.jobs.some((entry) => entry.jobId === email.jobId)) ?? null;

  if (day && day.finishedAt !== undefined && day.closureReason !== "eod") {
    throw new Error("The workday was not closed by an end-of-day submission.");
  }

  const leads =
    day && day.finishedAt !== undefined
      ? await ctx.db
          .query("taWorkdayLeads")
          .withIndex("by_workday", (q) => q.eq("workdayId", day._id))
          .collect()
      : [];
  const requests =
    day && day.finishedAt !== undefined
      ? (
          await ctx.db
            .query("taWorkdayRequests")
            .withIndex("by_workday", (q) => q.eq("workdayId", day._id))
            .collect()
        ).filter(
          (r) =>
            r.status === "denied" &&
            r.reason === "Workday closed before approval" &&
            r.decidedAt === day.finishedAt,
        )
      : [];

  const summary: ReopenEarlyEodSummary = {
    userId: email.userId,
    jobId: email.jobId,
    date: email.date,
    workLocationId: email.workLocationId ?? null,
    workdayId: day?._id ?? null,
    workdayClosed: day?.finishedAt !== undefined,
    emailId: email._id,
    receiptId: receipt?._id ?? null,
    roundId: round?._id ?? null,
    candidateIds: email.applicationIds,
    acceptedAt: email.acceptedAt ?? null,
    leadsToReopen: leads.length,
    requestsToRestore: requests.length,
  };

  if (dryRun) return { dryRun: true, changed: false, summary };

  const at = Date.now();
  await ctx.db.patch(email._id, { recoveryReopenedAt: at });
  if (receipt) await ctx.db.patch(receipt._id, { recoveryReopenedAt: at });
  if (round) await ctx.db.patch(round._id, { recoveryReopenedAt: at });

  if (day && day.finishedAt !== undefined) {
    await ctx.db.patch(day._id, {
      finishedAt: undefined,
      closureReason: undefined,
      completion: undefined,
    });
    for (const lead of leads) {
      await ctx.db.patch(lead._id, { finishedAt: undefined });
    }
    for (const request of requests) {
      await ctx.db.patch(request._id, {
        status: "pending",
        decidedAt: undefined,
        decidedBy: undefined,
        reason: undefined,
      });
    }
  }

  return { dryRun: false, changed: true, summary };
}
