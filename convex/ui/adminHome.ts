// convex/ui/adminHome.ts
//
// The admin's Today (owner 27 Nov 2026: "as admin we need recent activity of the TAs,
// how many workdays are open, and where the system needs attention - which part fails").
// One read, desk-wide people only, read only, bounded:
//   - today's workdays: started, still open, closed by an EOD, plus days from the last
//     week that were never closed;
//   - recent activity: workdays started/finished, Midday/EOD emails sent and candidate
//     moves by people, today, newest first (40);
//   - attention: emails that failed / may not have gone / are stuck sending, CVs that
//     could not be read or are stuck reading, AI calls that failed - each with a count.
// The team and the decisions come from ui/lead:desk, read beside this one.

import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { workdayDate } from "../../src/lib/workday";
import { colomboDayStart } from "../../src/lib/calendar";
import { isDeskWideUser } from "../ta/guard";
import { NotSignedIn, uiUser } from "./me";
import { STAGE_LABEL } from "../../src/data/types";

export type Activity = { at: number; who: string; what: string; where?: string; kind: "day" | "email" | "move" };
export type Attention = { key: string; tone: "danger" | "warn"; count: number; title: string; detail: string; who?: string[] };

const EVENTS = 80;
const FEED = 40;
const HOUR = 3_600_000;

export const today = query({
  args: {},
  handler: async (ctx) => {
    let me: Doc<"users">;
    try {
      me = await uiUser(ctx);
    } catch (error) {
      return { ok: false as const, message: error instanceof NotSignedIn ? error.message : "Could not check who you are." };
    }
    if (!isDeskWideUser(me)) return { ok: false as const, message: "Only a TA Lead, Director, Ops or an admin sees the whole desk." };

    const now = Date.now();
    const date = workdayDate(now);
    const dayStart = colomboDayStart(now);

    // Names and titles, read once each.
    const names = new Map<string, string>();
    const nameOf = async (id: Id<"users"> | undefined) => {
      if (!id) return "Someone";
      if (!names.has(id)) names.set(id, (await ctx.db.get(id))?.fullName ?? "Someone");
      return names.get(id)!;
    };
    const titles = new Map<string, string>();
    const titleOf = async (id: Id<"jobs">) => {
      if (!titles.has(id)) titles.set(id, (await ctx.db.get(id))?.title ?? "a position");
      return titles.get(id)!;
    };

    // Workdays.
    const days = await ctx.db.query("taWorkdays").withIndex("by_date", (q) => q.eq("date", date)).take(200);
    const open = days.filter((d) => d.finishedAt === undefined);
    const eod = days.filter((d) => d.closureReason === "eod");
    const weekAgo = workdayDate(now - 7 * 24 * HOUR);
    const leftOpen = (await ctx.db.query("taWorkdays").withIndex("by_finished", (q) => q.eq("finishedAt", undefined)).take(200)).filter((d) => d.date < date && d.date >= weekAgo);

    const feed: Activity[] = [];
    for (const d of days) {
      const who = await nameOf(d.userId);
      feed.push({ at: d.startedAt, who, what: "started the workday", where: `${d.jobs.length} ${d.jobs.length === 1 ? "position" : "positions"}`, kind: "day" });
      if (d.finishedAt) feed.push({ at: d.finishedAt, who, what: d.closureReason === "eod" ? "finished the day with the EOD" : "day closed", kind: "day" });
    }

    // Emails today, by status.
    const emails = async (status: Doc<"dailyEmails">["status"], since: number) =>
      ctx.db.query("dailyEmails").withIndex("by_status", (q) => q.eq("status", status).gte("startedAt", since)).take(200);
    const sent = await emails("accepted", dayStart);
    for (const e of sent.filter((x) => !x.forDate)) {
      feed.push({ at: e.acceptedAt ?? e.startedAt ?? e._creationTime, who: await nameOf(e.userId), what: `sent the ${e.submissionType === "eod" ? "EOD" : "Midday"} email`, where: await titleOf(e.jobId), kind: "email" });
    }

    // Candidate moves by people today.
    const moves = (await ctx.db.query("pipelineEvents").order("desc").take(EVENTS)).filter((m) => m._creationTime >= dayStart && m.actorType === "user" && m.toStage);
    for (const m of moves) {
      const cand = m.candidateId ? await ctx.db.get(m.candidateId) : null;
      const stage = (STAGE_LABEL as Record<string, string>)[m.toStage!] ?? m.toStage!.replace(/_/g, " ");
      feed.push({ at: m._creationTime, who: m.actorName ?? (await nameOf(m.actorId)), what: `moved ${cand?.fullName?.trim() || "a candidate"} to ${stage}`, where: await titleOf(m.jobId), kind: "move" });
    }
    feed.sort((a, b) => b.at - a.at);

    // Where the system needs attention.
    const attention: Attention[] = [];
    const people = async (rows: { userId: Id<"users"> }[]) => [...new Set(await Promise.all(rows.map((r) => nameOf(r.userId))))].slice(0, 6);
    const uncertain = await emails("uncertain", now - 3 * 24 * HOUR);
    if (uncertain.length) attention.push({ key: "uncertain", tone: "danger", count: uncertain.length, title: "Emails that may not have gone out", detail: "A TA Lead settles each one on the email screen.", who: await people(uncertain) });
    const failed = await emails("failed", dayStart);
    if (failed.length) attention.push({ key: "failed", tone: "danger", count: failed.length, title: "Emails that failed today", detail: "The TA can send them again from the composer.", who: await people(failed) });
    const stuck = (await emails("sending", now - 24 * HOUR)).filter((e) => (e.startedAt ?? 0) < now - 15 * 60_000);
    if (stuck.length) attention.push({ key: "sending", tone: "warn", count: stuck.length, title: "Emails stuck sending", detail: "Sending for more than 15 minutes.", who: await people(stuck) });

    const cvFailed = (await ctx.db.query("cvUploads").withIndex("by_status", (q) => q.eq("status", "failed")).order("desc").take(300)).filter((u) => u._creationTime >= dayStart);
    if (cvFailed.length) attention.push({ key: "cv_failed", tone: "danger", count: cvFailed.length, title: "CVs that could not be read today", detail: "The upload shows the reason and a Try again." });
    const cvStuck = (await ctx.db.query("cvUploads").withIndex("by_status", (q) => q.eq("status", "processing")).order("desc").take(300)).filter((u) => u._creationTime >= now - 24 * HOUR && u._creationTime < now - 30 * 60_000);
    if (cvStuck.length) attention.push({ key: "cv_stuck", tone: "warn", count: cvStuck.length, title: "CVs stuck reading", detail: "Reading for more than 30 minutes." });

    const ai = (await ctx.db.query("aiRuns").withIndex("by_day", (q) => q.eq("day", dayStart)).take(2000)).filter((r) => !r.ok);
    if (ai.length) {
      const features = [...new Set(ai.map((r) => r.feature))].slice(0, 6);
      attention.push({ key: "ai", tone: "warn", count: ai.length, title: "AURA answers that failed today", detail: `In: ${features.join(", ")}.` });
    }
    if (leftOpen.length) attention.push({ key: "left_open", tone: "warn", count: leftOpen.length, title: "Workdays from earlier days never closed", detail: "No EOD was sent; they close on their own.", who: await people(leftOpen) });

    return {
      ok: true as const,
      workdays: { started: days.length, open: open.length, eod: eod.length },
      activity: feed.slice(0, FEED),
      attention,
    };
  },
});
