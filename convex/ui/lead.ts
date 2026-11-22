// convex/ui/lead.ts
//
// The lead's desk for AURA on Today (owner 19 Nov 2026: the TA Lead does not start
// a workday; she asks AURA how each TA is doing). One read, the old lead dashboard's
// three parts (src/components/dash/LeadDashboard.tsx) plus each TA's day:
//   - the team: every active TA - their roles, LinkedIn connected, their own
//     candidates in the pipeline, CVs today on their live posts, sets, unread
//     alerts, and today's workday (started, checks done of all, EOD sent);
//   - what needs a decision: a role with nobody on it, a JD waiting for approval,
//     a role past its priority target - the lead's own roles, or the whole desk
//     when she leads none (as the old dashboard);
//   - every open role: its TAs, LinkedIn, follow-up count, day N.
// Desk-wide people only (TA Lead, Director, Ops, admin). Read only. Bounded: 300
// active roles, 40 TAs, 50 posts per role, each TA's own 100 newest candidates
// per role, 200 follow-ups per role.
//
// 19 Nov, measured live: this read never answered (30 s+). It read the newest 150
// applications of EVERY assigned role (~45,000 rows) to find each TA's own few.
// Now a TA's own candidates come straight from their index (by_workday_owner:
// job + owner) and a role's follow-ups from by_job_stage - only the rows counted.

import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isGone } from "../../src/lib/bin";
import { PRIORITY_TARGET } from "../../src/data/types";
import { mapUser } from "../../src/data/convex/map";
import { linkedinStatus } from "../../src/lib/linkedinStatus";
import { workdayDate, type WorkdayJobView } from "../../src/lib/workday";
import { isDeskWideUser } from "../ta/guard";
import { NotSignedIn, uiUser } from "./me";
import { clock, decisionOf, IN_PIPELINE, initials, tally, type Decision } from "./leadRules";
import { daysOpen } from "./rules";
import { colomboDayStart } from "../../src/lib/calendar";

const MAX_ROLES = 300;
const MAX_TAS = 40;
// ponytail: a TA's newest 100 own candidates per role, and 200 follow-ups per role; past that it counts what it read.
const OWN_PER_ROLE = 100;
const FOLLOW_UP_CAP = 200;
const ALERTS_CAP = 50;
// ponytail: today's newest 500 applications per role; a role past that counts 500.
const TODAY_CAP = 500;

export type TeamTa = {
  name: string;
  ini: string;
  roles: string[];
  li: [number, number];
  noLink: number;
  pipeline: number;
  cvs: number;
  sets: number;
  alerts: number;
  day: { started?: string; done: number; of: number; eod?: string };
};
export type TeamRole = { title: string; client: string; tas: string; on: boolean; fu: number; days: number };

export const desk = query({
  args: {},
  handler: async (ctx): Promise<{ ok: false; message: string } | { ok: true; team: TeamTa[]; decide: Decision[]; roles: TeamRole[] }> => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return { ok: false, message: error instanceof NotSignedIn ? error.message : "Could not check who you are." };
    }
    if (!isDeskWideUser(user)) return { ok: false, message: "Only a TA Lead, Director, Ops or an admin sees the whole team." };

    const now = Date.now();
    const today = workdayDate(now);
    const dayStart = colomboDayStart(now);
    const jobs = (await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "active")).order("desc").take(MAX_ROLES)).filter((j) => !isGone(j));

    // Who is on each role (the active assignments), read once per role.
    const assignments = await Promise.all(
      jobs.map((j) => ctx.db.query("jobAssignments").withIndex("by_jobId", (q) => q.eq("jobId", j._id)).take(30)),
    );
    const tasOf = new Map<string, Id<"users">[]>(jobs.map((j, i) => [j._id as string, [...new Set(assignments[i].filter((a) => a.isActive).map((a) => a.userId))]]));

    // Every active TA (TA or TA Support, as the old dashboard's isTa).
    const people = (await ctx.db.query("users").take(400)).filter((u) => u.isActive && ["ta", "ta_support"].includes(mapUser(u as never).role)).slice(0, MAX_TAS);
    const nameOf = new Map(people.map((u) => [u._id as string, u.fullName]));

    // Each role's posts and follow-up count, read once and shared by its TAs.
    const assigned = jobs.filter((j) => (tasOf.get(j._id as string) ?? []).length > 0);
    const reads = new Map(
      await Promise.all(
        assigned.map(async (j) => {
          const [posts, followUps, todays] = await Promise.all([
            ctx.db.query("jobPosts").withIndex("by_opening", (q) => q.eq("openingId", j._id)).take(50),
            ctx.db.query("applications").withIndex("by_job_stage", (q) => q.eq("jobId", j._id).eq("currentStage", "follow_up")).take(FOLLOW_UP_CAP),
            ctx.db.query("applications").withIndex("by_jobId", (q) => q.eq("jobId", j._id).gte("_creationTime", dayStart)).take(TODAY_CAP),
          ]);
          // CVs today = applicants filed to a live post since midnight Colombo, scoops
          // left out - old AURA's own count (src/data/store.ts jobPosts). The stored
          // jobPosts.cvCountToday is never increased or reset, so it read 0 (20 Nov audit).
          const live = new Set(posts.filter((p) => p.status === "live").map((p) => p._id as string));
          const cvsToday = todays.filter((a) => a.jobPostId && live.has(a.jobPostId as string) && !a.scoopByUserId && !a.scoopFromUserId).length;
          return [j._id as string, { posts, fu: followUps.length, cvsToday }] as const;
        }),
      ),
    );
    const li = (jobId: string) => linkedinStatus((reads.get(jobId)?.posts ?? []) as never);

    const team: TeamTa[] = await Promise.all(
      people.map(async (u): Promise<TeamTa> => {
        const me = u._id as string;
        const mine = assigned.filter((j) => (tasOf.get(j._id as string) ?? []).some((id) => (id as string) === me));
        // Their own candidates on their roles, newest shortlisted first.
        const apps = (
          await Promise.all(
            mine.map((j) =>
              ctx.db.query("applications").withIndex("by_workday_owner", (q) => q.eq("jobId", j._id).eq("ownerTaId", u._id)).order("desc").take(OWN_PER_ROLE),
            ),
          )
        ).flat();
        const [workday, unread] = await Promise.all([
          ctx.db.query("taWorkdays").withIndex("by_user_date", (q) => q.eq("userId", u._id).eq("date", today)).first(),
          ctx.db.query("notifications").withIndex("by_user_and_read", (q) => q.eq("userId", u._id).eq("read", false)).take(ALERTS_CAP),
        ]);
        let done = 0;
        let of = 0;
        let eodAt = 0;
        let allEod = !!workday && workday.jobs.length > 0;
        if (workday) {
          const views = await Promise.all(
            workday.jobs.map((wj) => ctx.db.query("taWorkdayChecklists").withIndex("by_workday_job", (q) => q.eq("workdayId", workday._id).eq("jobId", wj.jobId)).first()),
          );
          workday.jobs.forEach((wj, i) => {
            const view = views[i]?.view as WorkdayJobView | undefined;
            const t = tally(view, wj.workType);
            done += t.done;
            of += t.of;
            if (wj.workType === "100%") {
              if (view?.eodSentAt) eodAt = Math.max(eodAt, view.eodSentAt);
              else allEod = false;
            }
          });
          if (!workday.jobs.some((wj) => wj.workType === "100%")) allEod = !!workday.finishedAt && workday.closureReason === "eod";
        }
        const eod = workday?.finishedAt && workday.closureReason === "eod" ? workday.finishedAt : allEod && eodAt ? eodAt : 0;
        return {
          name: u.fullName,
          ini: initials(u.fullName),
          roles: mine.map((j) => j.title),
          li: [mine.filter((j) => li(j._id as string) === "connected").length, mine.length],
          noLink: mine.filter((j) => li(j._id as string) === "no_link").length,
          pipeline: apps.filter((a) => IN_PIPELINE.has(a.currentStage)).length,
          cvs: mine.reduce((n, j) => n + (reads.get(j._id as string)?.cvsToday ?? 0), 0),
          // ponytail: a set is a set number on their own candidates; the old dashboard counted closed sets only.
          sets: new Set(apps.map((a) => a.setNumber).filter((n): n is number => typeof n === "number")).size,
          alerts: unread.length,
          day: { started: workday ? clock(workday.startedAt) : undefined, done, of, eod: eod ? clock(eod) : undefined },
        };
      }),
    );

    // Decisions: the roles this person leads, or the whole desk when they lead none -
    // and a role with no TA lead at all, which no lead's list would carry (22 Nov).
    // "On it" is the same count the roles list draws: active TAs only, so a role whose
    // only seat is someone who left reads "Nobody assigned" here as it reads
    // "Unassigned" there (the lead saw 2 Unassigned roles and nothing to decide).
    const onIt = (id: string) => (tasOf.get(id) ?? []).filter((t) => nameOf.has(t as string)).length;
    const theirs = jobs.filter((j) => (j.taLeadId as string | undefined) === (user._id as string) || !j.taLeadId);
    const decide = (theirs.some((j) => j.taLeadId) ? theirs : jobs)
      .map((j) => {
        const tier = (j.priorityTier ?? "") as keyof typeof PRIORITY_TARGET;
        return decisionOf({
          title: j.title,
          client: j.clientName,
          tas: onIt(j._id as string),
          jdPending: j.jdStatus === "pending_ta_approval",
          day: daysOpen(j, now),
          target: PRIORITY_TARGET[tier]?.days ?? null,
          tier: j.priorityTier ?? null,
        });
      })
      .filter((d): d is Decision => !!d)
      .sort((a, b) => Number(!!b.red) - Number(!!a.red))
      .slice(0, 30);

    const roles: TeamRole[] = jobs.map((j) => {
      const id = j._id as string;
      const names = (tasOf.get(id) ?? []).map((t) => nameOf.get(t as string)?.split(" ")[0]).filter(Boolean);
      return {
        title: j.title,
        client: j.clientName,
        tas: names.length ? names.join(", ") : "Unassigned",
        on: li(id) === "connected",
        fu: reads.get(id)?.fu ?? 0,
        days: daysOpen(j, now),
      };
    });

    return { ok: true, team, decide, roles };
  },
});
