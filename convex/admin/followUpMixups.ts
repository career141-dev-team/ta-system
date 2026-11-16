/**
 * Who may have had the wrong opening's "100% complete" reply (11 Nov).
 *
 * A candidate in Follow-up on two openings answered a TA's question; the
 * assistant filed it against the other opening, said "We have received all
 * your application details for Chief Operating Officer" and moved that
 * opening on, while the TA was asking about General Manager - Operations.
 * The reply rule is fixed (lib/senderRouting pickReplyApplication); this lists
 * the candidates it may already have happened to, so a TA can check each one.
 *
 * Every assistant "received all your application details" WhatsApp in the
 * last `days`, kept only where the candidate has another open application.
 * Read-only: it writes nothing and sends nothing. Run through the release
 * pipeline (run_function admin/followUpMixups:list, run_args {"days":14}).
 */
import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

const COMPLETE_REPLY = "We have received all your application details for";
/** Stops a wide window from running the query out of time. */
const SCAN_CAP = 3000;

export const list = internalQuery({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const since = Date.now() - Math.min(Math.max(args.days ?? 14, 1), 60) * 24 * 60 * 60_000;
    const sent = await ctx.db
      .query("communications")
      .withIndex("by_direction_channel_time", (q: any) =>
        q.eq("direction", "outbound").eq("channel", "whatsapp").gte("sentAt", since),
      )
      .take(SCAN_CAP);
    const replies = sent.filter((c: any) => c.senderAgent !== "ta" && String(c.body ?? "").includes(COMPLETE_REPLY));

    const rows: any[] = [];
    const seen = new Set<string>();
    for (const c of replies as any[]) {
      const key = `${c.candidateId}:${c.applicationId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const apps = await ctx.db
        .query("applications")
        .withIndex("by_candidateId", (q: any) => q.eq("candidateId", c.candidateId))
        .collect();
      const others = apps.filter(
        (a: any) => a._id !== c.applicationId && a.currentStage !== "rejected" && a.currentStage !== "placed",
      );
      if (!others.length) continue;
      const candidate: any = await ctx.db.get(c.candidateId);
      const repliedJob: any = c.jobId ? await ctx.db.get(c.jobId) : null;
      const repliedApp: any = c.applicationId ? await ctx.db.get(c.applicationId) : null;
      const otherOpenings = [];
      for (const a of others as any[]) {
        const j: any = await ctx.db.get(a.jobId);
        otherOpenings.push({ opening: j?.title ?? String(a.jobId), stage: a.currentStage, applicationId: a._id });
      }
      rows.push({
        candidate: candidate?.fullName ?? String(c.candidateId),
        candidateId: c.candidateId,
        repliedAt: new Date(Number(c.sentAt)).toISOString(),
        replyNamed: repliedJob?.title ?? String(c.jobId),
        thatApplicationNowIn: repliedApp?.currentStage ?? "gone",
        applicationId: c.applicationId,
        otherOpenings,
      });
    }
    return {
      scanned: sent.length,
      scanCapped: sent.length >= SCAN_CAP,
      completeReplies: replies.length,
      toCheck: rows.length,
      rows,
    };
  },
});
