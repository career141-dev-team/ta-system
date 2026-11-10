/**
 * Read-only: why can Sameera and Sanduni not send their end of day (10 Nov)?
 * Lists their recent daily emails and workday mail receipts with the state that
 * blocks a new send, and the saved `sendError`. It writes nothing and prints no
 * addresses or subjects. Run only through the release pipeline (run_function).
 */
import { internalQuery } from "../_generated/server";
import { workdayDate } from "../../src/lib/workday";

export const run = internalQuery({
  args: {},
  handler: async (ctx) => {
    const since = workdayDate(Date.now() - 3 * 86400000);
    const users = (await ctx.db.query("users").collect()).filter(u => u.isActive && /\b(sameera|samira|sanduni)\b/i.test(u.fullName));
    const titles = new Map<string, string>();
    const title = async (id: any) => titles.get(id) ?? (titles.set(id, (await ctx.db.get(id) as any)?.title ?? "?"), titles.get(id)!);
    const blocks = (s: string, finalizedAt?: number) => s === "sending" || s === "uncertain" || (s === "accepted" && !finalizedAt);
    const out = [];
    for (const u of users) {
      const emails = (await ctx.db.query("dailyEmails").withIndex("by_user_job_date", q => q.eq("userId", u._id)).order("desc").take(60))
        .filter(e => e.date >= since);
      const days = await ctx.db.query("taWorkdays").withIndex("by_user", q => q.eq("userId", u._id)).order("desc").take(3);
      const receipts = [];
      for (const d of days)
        for (const r of await ctx.db.query("taWorkdayMail").withIndex("by_workday_job", q => q.eq("workdayId", d._id)).collect())
          receipts.push({ workday: d.date, job: await title(r.jobId), status: r.status, type: r.submissionType ?? "eod", location: r.workLocationId ?? null,
            started: new Date(r.startedAt).toISOString(), finalized: !!r.finalizedAt, reopened: !!r.recoveryReopenedAt, blocksSend: blocks(r.status, r.finalizedAt) });
      out.push({
        user: u.fullName, role: u.role,
        workdays: days.map(d => ({ date: d.date, finished: d.finishedAt !== undefined, closure: d.closureReason ?? null, jobs: d.jobs.length })),
        dailyEmails: await Promise.all(emails.map(async e => ({ date: e.date, job: await title(e.jobId), type: e.submissionType, status: e.status,
          location: e.workLocationId ?? null, started: e.startedAt ? new Date(e.startedAt).toISOString() : null, finalized: !!e.finalizedAt,
          reconciledBy: !!e.reconciledBy, applications: e.applicationIds?.length ?? 0, hasReceipt: !!e.receiptId, blocksSend: blocks(e.status, e.finalizedAt),
          sendError: e.sendError ?? null, reason: e.reconciliationReason ?? null }))),
        receipts,
      });
    }
    return { now: new Date().toISOString(), today: workdayDate(Date.now()), matchedUsers: users.length, out };
  },
});
