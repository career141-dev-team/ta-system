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
import { NotSignedIn, uiUser } from "./me";
import type { DeskPosition } from "./auraRules";

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
