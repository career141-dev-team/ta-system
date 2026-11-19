// convex/ta/eodReminders.ts
//
// Who still has an end-of-day email to send today. Nothing reminded a TA, so a
// forgotten EOD surfaced the next morning when the lead opened the panel, and
// the day had already closed as "expired" (2 Nov). Two daily crons
// (convex/crons.ts): 17:30 Colombo tells each TA, 18:30 tells each lead. A TA with an
// approved AURA day plan is left to the plan, which tells them 30 minutes before their
// own planned finish and their lead 30 minutes after it (ui/planRemind, 19 Nov).
//
// Reads only today's open days through `by_finished_date` (the dashboard's own
// bounded read), never a TA's history. Only 100% positions count: a returning
// (Follow-up / Add-on) position has no required EOD of its own.

import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isGone } from "../../src/lib/bin";
import { workdayDate } from "../../src/lib/workday";
import { jobEodComplete } from "../lib/workLocationEmails";
import { leadDigestByLead, taReminderText, type OutstandingEod } from "../../src/lib/eodReminders";

interface Outstanding extends OutstandingEod {
  userId: Id<"users">;
  jobId: Id<"jobs">;
  workdayId: Id<"taWorkdays">;
}

/** Every 100% position on today's open days whose EOD is not accepted yet - one TA's
 *  when `userId` is given (AURA's plan asks at that TA's own finish, phase 4). */
export async function outstandingToday(ctx: MutationCtx, userId?: Id<"users">): Promise<Outstanding[]> {
  const today = workdayDate(Date.now());
  const days = userId
    ? (await ctx.db.query("taWorkdays").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", today)).take(1)).filter((d) => !d.finishedAt)
    : await ctx.db.query("taWorkdays").withIndex("by_finished_date", (q) => q.eq("finishedAt", undefined).eq("date", today)).take(100);
  const out: Outstanding[] = [];
  for (const day of days) {
    const user = await ctx.db.get(day.userId);
    if (!user) continue;
    for (const entry of day.jobs) {
      if (entry.workType !== "100%") continue;
      const job = await ctx.db.get(entry.jobId);
      if (!job || isGone(job)) continue;
      const receipts = await ctx.db.query("taWorkdayMail").withIndex("by_workday_job", (q) => q.eq("workdayId", day._id).eq("jobId", entry.jobId)).collect();
      if (await jobEodComplete(ctx, entry, receipts)) continue;
      out.push({ userId: day.userId, jobId: entry.jobId, workdayId: day._id, taName: user.fullName, title: job.title, leadId: entry.leadId ?? job.taLeadId ?? null });
    }
  }
  return out;
}

/** TAs with an approved AURA plan today: their EOD reminder and the lead's bell follow
 *  their own planned finish (ui/planRemind), not 17:30 / 18:30 (owner, Decision 1, 19 Nov). */
async function withoutPlan(ctx: MutationCtx, rows: Outstanding[]): Promise<Outstanding[]> {
  const today = workdayDate(Date.now());
  const planned = new Set<string>();
  for (const userId of new Set(rows.map((r) => r.userId))) {
    const plan = await ctx.db.query("auraDayPlans").withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", today)).first();
    if (plan?.state === "approved") planned.add(userId);
  }
  return rows.filter((r) => !planned.has(r.userId));
}

export async function bell(ctx: MutationCtx, userId: Id<"users">, type: Doc<"notifications">["type"], text: { title: string; body: string }, jobId?: Id<"jobs">) {
  await ctx.db.insert("notifications", { userId, type, ...text, ...(jobId ? { jobId } : {}), read: false, createdAt: new Date().toISOString() });
}

/** 17:30 Colombo: each TA with a 100% position and no accepted EOD gets one bell. */
export const remindMissingEods = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await withoutPlan(ctx, await outstandingToday(ctx));
    const byTa = new Map<Id<"users">, Outstanding[]>();
    for (const row of rows) byTa.set(row.userId, [...(byTa.get(row.userId) ?? []), row]);
    for (const [userId, list] of byTa) {
      // Linked to the opening when there is one, so the bell opens its composer.
      await bell(ctx, userId, "eod_reminder", taReminderText(list.map((r) => r.title)), list.length === 1 ? list[0].jobId : undefined);
    }
    return { reminded: byTa.size, positions: rows.length };
  },
});

/** 18:30 Colombo: each lead gets one bell listing their TAs' positions still without an EOD. */
export const digestMissingEods = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await withoutPlan(ctx, await outstandingToday(ctx));
    const digests = leadDigestByLead(rows);
    for (const [leadId, text] of digests) await bell(ctx, leadId as Id<"users">, "eod_lead_digest", text);
    return { leads: digests.size, positions: rows.length };
  },
});
