// convex/ui/myDay.ts
//
// "How is my work today?" (owner 20 Nov 2026): the AURA pet's Ask box and the top bar
// sent every question to the Database page, which could not answer it. This read gives
// the signed-in person their own day in numbers, so the UI answers at once, with no
// model: the workday, the AURA plan, the day's checks, and per position the CVs that
// came in today, the people they shortlisted today, the CVs they moved to Director
// today and the CVs their accepted emails sent the Director today and yesterday.
// Read only, own data only, bounded (30 positions, 100 rows per count).

import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isGone } from "../../src/lib/bin";
import { colomboDayStart } from "../../src/lib/calendar";
import { workdayDate, type WorkdayJobView, type WorkType } from "../../src/lib/workday";
import { NotSignedIn, uiUser } from "./me";
import { tally } from "./leadRules";
import { planTally } from "./planRules";

const MAX_POSITIONS = 30;
const CAP = 100;
const DAY = 86_400_000;

/** CVs a person's accepted Midday and EOD emails sent the Director on one day (revisions not counted again). */
const sentOn = (rows: Doc<"dailyEmails">[]) => rows.filter((e) => e.status === "accepted" && !e.parentId).reduce((n, e) => n + e.applicationIds.length, 0);

export const today = query({
  args: {},
  handler: async (ctx) => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return { ok: false as const, message: error instanceof NotSignedIn ? error.message : "Could not check who you are." };
    }
    const me = user._id;
    const now = Date.now();
    const date = workdayDate(now);
    const yesterday = workdayDate(now - DAY);
    const dayStart = colomboDayStart(now);

    const [workday, plan, assigned, searches] = await Promise.all([
      ctx.db.query("taWorkdays").withIndex("by_user_date", (q) => q.eq("userId", me).eq("date", date)).first(),
      ctx.db.query("auraDayPlans").withIndex("by_user_date", (q) => q.eq("userId", me).eq("date", date)).first(),
      ctx.db.query("jobAssignments").withIndex("by_userId_isActive", (q) => q.eq("userId", me).eq("isActive", true)).take(100),
      // Database chat searches (ui/searches:record, Part 3).
      ctx.db.query("searchHistory").withIndex("by_user", (q) => q.eq("userId", me).gte("_creationTime", dayStart)).take(CAP),
    ]);

    const ids = [...new Set(assigned.map((a) => a.jobId))];
    const jobs = (await Promise.all(ids.map((id) => ctx.db.get(id)))).filter((j): j is Doc<"jobs"> => !!j && j.status === "active" && !isGone(j)).slice(0, MAX_POSITIONS);
    const onDay = new Map((workday?.jobs ?? []).map((j) => [j.jobId as string, j.workType as WorkType]));

    const positions = await Promise.all(
      jobs.map(async (j) => {
        const jobId = j._id as Id<"jobs">;
        const [cvs, shortlisted, director, sentToday, sentYesterday, checklist] = await Promise.all([
          ctx.db.query("applications").withIndex("by_jobId", (q) => q.eq("jobId", jobId).gte("_creationTime", dayStart)).take(CAP),
          ctx.db.query("applications").withIndex("by_workday_owner", (q) => q.eq("jobId", jobId).eq("ownerTaId", me).gte("shortlistedAt", dayStart)).take(CAP),
          ctx.db.query("applications").withIndex("by_job_stage", (q) => q.eq("jobId", jobId).eq("currentStage", "second_shortlist")).take(CAP),
          ctx.db.query("dailyEmails").withIndex("by_user_job_date", (q) => q.eq("userId", me).eq("jobId", jobId).eq("date", date)).take(20),
          ctx.db.query("dailyEmails").withIndex("by_user_job_date", (q) => q.eq("userId", me).eq("jobId", jobId).eq("date", yesterday)).take(20),
          workday && onDay.has(jobId as string)
            ? ctx.db.query("taWorkdayChecklists").withIndex("by_workday_job", (q) => q.eq("workdayId", workday._id).eq("jobId", jobId)).first()
            : null,
        ]);
        const workType = onDay.get(jobId as string) ?? null;
        const checks = workType ? tally(checklist?.view as WorkdayJobView | undefined, workType) : { done: 0, of: 0 };
        return {
          id: jobId as string,
          title: j.title,
          client: j.clientName,
          workType,
          cvsToday: cvs.length,
          shortlistedToday: shortlisted.length,
          directorToday: director.filter((a) => a.ownerTaId === me && (a.lastStageChangedAt ?? 0) >= dayStart).length,
          sentToday: sentOn(sentToday),
          sentYesterday: sentOn(sentYesterday),
          checks,
        };
      }),
    );

    const sum = (k: "cvsToday" | "shortlistedToday" | "directorToday" | "sentToday" | "sentYesterday") => positions.reduce((n, p) => n + p[k], 0);
    let planOut: null | { state: string; done: number; of: number; open: number; next: { title: string; startMin: number } | null; late: number } = null;
    if (plan) {
      const tasks = await ctx.db.query("auraPlanTasks").withIndex("by_plan", (q) => q.eq("planId", plan._id)).take(100);
      const nowMin = Math.floor((now - dayStart) / 60_000);
      const open = tasks.filter((t) => t.state === "planned" || t.state === "doing").sort((a, b) => a.startMin - b.startMin);
      const next = open.find((t) => t.state === "doing") ?? open[0];
      planOut = {
        state: plan.state,
        ...planTally(tasks),
        next: next ? { title: next.title, startMin: next.startMin } : null,
        late: open.filter((t) => t.startMin + t.minutes < nowMin).length,
      };
    }
    return {
      ok: true as const,
      workday: workday ? { startedAt: workday.startedAt, finishedAt: workday.finishedAt ?? null, positions: workday.jobs.length } : null,
      plan: planOut,
      checks: positions.reduce((t, p) => ({ done: t.done + p.checks.done, of: t.of + p.checks.of }), { done: 0, of: 0 }),
      totals: {
        positions: positions.length,
        cvsToday: sum("cvsToday"),
        shortlistedToday: sum("shortlistedToday"),
        directorToday: sum("directorToday"),
        sentToday: sum("sentToday"),
        sentYesterday: sum("sentYesterday"),
        searchesToday: searches.length,
      },
      positions,
    };
  },
});
