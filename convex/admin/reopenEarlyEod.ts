/**
 * Reusable pipeline migration to reopen an accidentally sent early EOD for any
 * TA and opening. The accepted email stays in history with its real send time,
 * while today's EOD lock and workday completion are cleared so they can keep
 * working and send Midday / EOD again.
 * Run via the production release pipeline (`run_function`), dryRun=true first.
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { workdayDate } from "../../src/lib/workday";
import { inWorkLocation } from "../../src/lib/workLocations";
import { reopenEarlyEodEmail } from "../lib/reopenEarlyEod";
import { refreshWorkdayChecks } from "../ta/workdays";

export const run = internalMutation({
  args: {
    dryRun: v.boolean(),
    userEmail: v.string(),
    jobId: v.string(),
    date: v.optional(v.string()),
    workLocationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const emailNorm = args.userEmail.trim().toLowerCase();
    const users = (await ctx.db.query("users").collect()).filter(
      (u) => u.email?.trim().toLowerCase() === emailNorm && u.isActive,
    );
    if (users.length !== 1) {
      throw new Error(`Expected one active user for ${emailNorm}, found ${users.length}.`);
    }
    const user = users[0];

    const jobId = ctx.db.normalizeId("jobs", args.jobId);
    const job = jobId ? await ctx.db.get(jobId) : null;
    if (!job) throw new Error("Opening not found.");

    const targetDate = args.date?.trim() || workdayDate(Date.now());
    const emails = await ctx.db
      .query("dailyEmails")
      .withIndex("by_user_job_date", (q) =>
        q.eq("userId", user._id).eq("jobId", job._id).eq("date", targetDate),
      )
      .collect();

    const candidates = emails.filter(
      (e) =>
        e.submissionType === "eod" &&
        !e.parentId &&
        !e.forDate &&
        e.status === "accepted" &&
        !!e.finalizedAt &&
        !e.recoveryReopenedAt &&
        (!args.workLocationId || inWorkLocation(e, args.workLocationId)),
    );

    if (candidates.length === 0) {
      throw new Error(`No active finalized EOD found for ${emailNorm} on ${job.title} (${targetDate}).`);
    }
    if (candidates.length > 1) {
      throw new Error(
        `Multiple accepted EODs found on ${targetDate} across work locations; pass workLocationId to select one.`,
      );
    }

    const result = await reopenEarlyEodEmail(ctx, { email: candidates[0], dryRun: args.dryRun });
    if (!args.dryRun) {
      await refreshWorkdayChecks(ctx, job._id, user._id, result.summary.workdayId ?? undefined);
    }
    return {
      ...result,
      userName: user.fullName,
      jobTitle: job.title,
    };
  },
});
