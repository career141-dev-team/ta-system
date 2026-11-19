// convex/ui/desk.ts
//
// The TA's desk for AURA on Today (E5 group 1, 19 Nov): every open position the
// signed-in person is assigned to, with what the old system already keeps on it -
// priority and day N of target, requirements, pipeline counts, CVs today, Director
// Review waiting, JD approved, a live LinkedIn post, and this person's strategies.
// Bounded: at most 30 positions, every count capped, no CV text or embeddings.

import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isGone } from "../../src/lib/bin";
import { colomboDayStart, colomboDaysBetween } from "../../src/lib/calendar";
import { PRIORITY_TARGET } from "../../src/data/types";
import { directorReviewBlockers } from "../ta/stages";
import { NotSignedIn, uiUser } from "./me";
import { readyLine, type DeskPosition, type Thing } from "./auraRules";

const MAX_POSITIONS = 30;
// ponytail: counts read at most this many rows; the model is told "200+" past it.
const COUNT_CAP = 200;

const money = (j: Doc<"jobs">) => {
  if (!j.salaryMin && !j.salaryMax) return null;
  const k = (n?: number) => (n ? `${Math.round(n / 1000)}k` : "");
  return `${j.salaryCurrency ?? "LKR"} ${[k(j.salaryMin), k(j.salaryMax)].filter(Boolean).join("-")}`;
};

export const desk = query({
  args: {},
  handler: async (ctx): Promise<{ ok: false; message: string } | { ok: true; positions: DeskPosition[] }> => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return { ok: false, message: error instanceof NotSignedIn ? error.message : "Could not check who you are." };
    }
    const me = user._id as string;
    const mine = await ctx.db
      .query("jobAssignments")
      .withIndex("by_userId_isActive", (q) => q.eq("userId", user._id).eq("isActive", true))
      .take(100);
    const ids = [...new Set(mine.map((a) => a.jobId))];
    const jobs = (await Promise.all(ids.map((id) => ctx.db.get(id))))
      .filter((j): j is Doc<"jobs"> => !!j && j.status === "active" && !isGone(j))
      .slice(0, MAX_POSITIONS);

    const now = Date.now();
    const dayStart = colomboDayStart(now);
    const positions = await Promise.all(
      jobs.map(async (j): Promise<DeskPosition> => {
        const jobId = j._id as Id<"jobs">;
        const [recent, director, posts, strategyRows] = await Promise.all([
          ctx.db.query("applications").withIndex("by_jobId", (q) => q.eq("jobId", jobId)).order("desc").take(COUNT_CAP + 1),
          ctx.db.query("applications").withIndex("by_job_stage", (q) => q.eq("jobId", jobId).eq("currentStage", "second_shortlist")).take(51),
          ctx.db.query("jobPosts").withIndex("by_opening", (q) => q.eq("openingId", jobId)).take(50),
          ctx.db.query("strategyAssignments").withIndex("by_opening", (q) => q.eq("openingId", jobId)).take(200),
        ]);
        const tier = (j.priorityTier ?? "") as keyof typeof PRIORITY_TARGET;
        const nations = j.targetNationalities ?? [];
        return {
          id: jobId as string,
          title: j.title,
          client: j.clientName,
          priority: j.priorityTier ?? null,
          day: j.assignedAt ? colomboDaysBetween(j.assignedAt, now) : 0,
          target: PRIORITY_TARGET[tier]?.days ?? null,
          skills: j.requiredSkills.slice(0, 8),
          years: [j.experienceMinYears, j.experienceMaxYears ?? null],
          salary: money(j),
          where: `${j.location}${j.headcount ? ` · ${j.headcount} ${j.headcount === 1 ? "person" : "people"}` : ""}`,
          hiring: [nations.length ? nations.join(", ") : null, j.targetGender ?? null].filter(Boolean).join(" · ") || null,
          pipeline: Math.min(recent.length, COUNT_CAP),
          cvsToday: recent.filter((a) => a._creationTime >= dayStart).length,
          director: Math.min(director.length, 50),
          jdApproved: j.jdStatus === "approved",
          linkedinLive: posts.some((p) => p.status === "live" && /linkedin/i.test(p.channel)),
          strategies: strategyRows
            .filter((r) => !r.notApplicable && !r.submittedAt)
            .filter((r) => r.doneBy.some((d) => (d as string) === me) || (r.acknowledgements ?? []).some((a) => (a.taId as string) === me))
            .slice(0, 10)
            .map((r) => ({ name: r.strategyName, waiting: (r.acknowledgements ?? []).some((a) => (a.taId as string) === me && a.acceptedAt === null) })),
        };
      }),
    );
    return { ok: true, positions };
  },
});

// Today's "things" (E5 group 1 item 3, 19 Nov): what moved while the TA was away,
// each with one button that runs a door the UI already has. Read only.
//  - ready: a candidate of theirs in follow-up with nothing left to collect
//    (directorReviewBlockers, the board's own rule) -> Move to Director Review;
//  - strategy: strategies the lead gave them, not yet accepted -> Accept;
//  - jd: a JD on their opening waiting for approval -> Review.
// ponytail: 30 positions x 50 follow-up rows each; a TA with more sees the newest.
const MAX_THINGS = 12;
export const things = query({
  args: {},
  handler: async (ctx): Promise<{ ok: false; message: string } | { ok: true; things: Thing[] }> => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return { ok: false, message: error instanceof NotSignedIn ? error.message : "Could not check who you are." };
    }
    const me = user._id as string;
    const mine = await ctx.db
      .query("jobAssignments")
      .withIndex("by_userId_isActive", (q) => q.eq("userId", user._id).eq("isActive", true))
      .take(100);
    const jobs = (await Promise.all([...new Set(mine.map((a) => a.jobId))].map((id) => ctx.db.get(id))))
      .filter((j): j is Doc<"jobs"> => !!j && j.status === "active" && !isGone(j))
      .slice(0, MAX_POSITIONS);

    const out: Thing[] = [];
    for (const j of jobs) {
      const jobId = j._id as string;
      if (j.jdStatus === "pending_ta_approval")
        out.push({ kind: "jd", id: `jd:${jobId}`, jobId, title: `${j.title} — the JD is waiting for approval`, sub: j.clientName, at: j.requirementsExtractedAt ?? 0 });

      const strategies = await ctx.db.query("strategyAssignments").withIndex("by_opening", (q) => q.eq("openingId", j._id)).take(200);
      const waiting = strategies.filter((r) => !r.notApplicable && (r.acknowledgements ?? []).some((a) => (a.taId as string) === me && a.acceptedAt === null));
      if (waiting.length)
        out.push({
          kind: "strategy",
          id: `strategy:${jobId}`,
          jobId,
          title: `${waiting.length} new ${waiting.length === 1 ? "strategy" : "strategies"} to accept`,
          sub: `${j.title} · ${waiting.map((r) => r.strategyName).slice(0, 3).join(", ")}`,
          at: Math.max(...waiting.map((r) => (r.acknowledgements ?? []).find((a) => (a.taId as string) === me)?.assignedAt ?? 0)),
        });

      for (const stage of ["follow_up", "ta_shortlist", "ai_call"] as const) {
        const rows = await ctx.db.query("applications").withIndex("by_job_stage", (q) => q.eq("jobId", j._id).eq("currentStage", stage)).order("desc").take(50);
        for (const a of rows) {
          if ((a.ownerTaId as string | undefined) !== me) continue;
          const c = await ctx.db.get(a.candidateId);
          if (!c || directorReviewBlockers(a, c).length) continue;
          out.push({
            kind: "ready",
            id: `ready:${a._id}`,
            jobId,
            applicationId: a._id as string,
            title: `${c.fullName?.trim() || "A candidate"} is ready for Director Review`,
            sub: readyLine(j.title, c.expectedSalary ?? null, c.noticePeriodDays ?? null),
            at: a.lastCandidateReplyAt ?? a._creationTime,
          });
        }
      }
    }
    return { ok: true, things: out.sort((a, b) => b.at - a.at).slice(0, MAX_THINGS) };
  },
});
