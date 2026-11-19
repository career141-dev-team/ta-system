// convex/ui/homes.ts
//
// The Director's and Ops's desks for AURA on Today (19 Nov): like the lead's
// (ui/lead:desk), each is one read of what their old dashboard showed
// (src/components/dash/DirectorDashboard.tsx, OpsDashboard.tsx).
//   - director: the sets waiting on their review (Director Review), every
//     candidate by stage across the open roles, and each client with open roles;
//   - ops: candidates sitting with clients and for how long, interviews coming
//     up (confirmed or not), and what to chase - a client quiet 3+ days, an
//     interview within two days nobody has confirmed.
// Desk-wide people only, read only, bounded: 300 open roles, each role's stage
// read stops at 100 candidates, names are looked up for at most 50 rows per list.
//
// 19 Nov: each stage was read desk-wide (by_stage, 500 newest - mostly closed
// roles' candidates) and every role met was read whole (a jobs row is fat) only to
// be thrown away when it was not open. Now the open roles are read once and each
// role's stage from its own index (by_job_stage): only open work is read.

import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isGone } from "../../src/lib/bin";
import { colomboDaysBetween } from "../../src/lib/calendar";
import { isDeskWideUser } from "../ta/guard";
import { NotSignedIn, uiUser } from "./me";
import { BACKEND_STAGES, type BoardStage } from "./rules";
import { chaseOf, interviewWhen, STAGE_WORDS } from "./leadRules";

const MAX_ROLES = 300;
// ponytail: a role with more than this many candidates at one stage counts this many.
const PER_ROLE_CAP = 100;
const ROWS = 50;

type Gate = { ok: false; message: string } | { ok: true; user: Doc<"users"> };
async function who(ctx: QueryCtx): Promise<Gate> {
  let user: Doc<"users">;
  try {
    user = await uiUser(ctx);
  } catch (error) {
    return { ok: false, message: error instanceof NotSignedIn ? error.message : "Could not check who you are." };
  }
  return isDeskWideUser(user) ? { ok: true, user } : { ok: false, message: "Only a TA Lead, Director, Ops or an admin sees the whole desk." };
}

/** The open roles, read once. */
const openRoles = async (ctx: QueryCtx) =>
  (await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "active")).order("desc").take(MAX_ROLES)).filter((j) => !isGone(j));

/** Candidates at these backend stages on the open roles, newest first, with their role. */
async function atStages(ctx: QueryCtx, stages: string[], open: Doc<"jobs">[]) {
  const rows = await Promise.all(
    open.flatMap((j) =>
      stages.map(async (s) =>
        (await ctx.db.query("applications").withIndex("by_job_stage", (q) => q.eq("jobId", j._id).eq("currentStage", s as never)).order("desc").take(PER_ROLE_CAP)).map((a) => ({ a, j })),
      ),
    ),
  );
  return rows.flat().sort((x, y) => y.a._creationTime - x.a._creationTime);
}

const nameOf = async (ctx: QueryCtx, id: Id<"candidates">) => (await ctx.db.get(id))?.fullName?.trim() || "A candidate";

export const director = query({
  args: {},
  handler: async (ctx) => {
    const gate = await who(ctx);
    if (!gate.ok) return gate;
    const open = await openRoles(ctx);
    const board = ["ta_follow_up", "ai_follow_up", "director_review", "director_shortlist", "client_shortlist", "interview", "offer", "placed"] as BoardStage[];
    const byStage = await Promise.all(board.map((s) => atStages(ctx, BACKEND_STAGES[s], open)));
    const stages = board.map((s, i) => [STAGE_WORDS[s], byStage[i].length] as [string, number]);

    const review = byStage[board.indexOf("director_review")].slice(0, ROWS);
    const users = new Map<string, string>();
    const waiting = await Promise.all(
      review.map(async ({ a, j }) => {
        const owner = a.ownerTaId as Id<"users"> | undefined;
        if (owner && !users.has(owner as string)) users.set(owner as string, (await ctx.db.get(owner))?.fullName ?? "");
        return { who: await nameOf(ctx, a.candidateId), client: j.clientName, title: j.title, set: a.setNumber ?? 0, ta: owner ? (users.get(owner as string) ?? "").split(" ")[0] : "" };
      }),
    );

    // Each client with open roles; a set is a set number a TA has sent on one of them.
    // ponytail: sets counted from the candidates read above (100 per role per stage).
    const sets = new Map<string, Set<string>>();
    for (const { a, j } of byStage.flat()) if (typeof a.setNumber === "number") (sets.get(j.clientName) ?? sets.set(j.clientName, new Set()).get(j.clientName)!).add(`${j._id}:${a.ownerTaId}:${a.setNumber}`);
    const clientNames = [...new Set(open.map((j) => j.clientName))];
    const clients = clientNames
      .map((name) => ({ name, open: open.filter((j) => j.clientName === name).length, sets: sets.get(name)?.size ?? 0, value: 0 }))
      .sort((x, y) => y.sets - x.sets || y.open - x.open)
      .slice(0, 40);

    return { ok: true as const, waiting, stages, clients };
  },
});

export const ops = query({
  args: {},
  handler: async (ctx) => {
    const gate = await who(ctx);
    if (!gate.ok) return gate;
    const now = Date.now();
    const open = await openRoles(ctx);
    const [withClientRows, interviewRows] = await Promise.all([atStages(ctx, BACKEND_STAGES.client_shortlist, open), atStages(ctx, BACKEND_STAGES.interview, open)]);

    const withClient = await Promise.all(
      withClientRows
        .sort((x, y) => x.a.lastStageChangedAt - y.a.lastStageChangedAt)
        .slice(0, ROWS)
        .map(async ({ a, j }) => ({ who: await nameOf(ctx, a.candidateId), client: j.clientName, title: j.title, days: colomboDaysBetween(a.lastStageChangedAt, now) })),
    );

    // The interviews still to happen, soonest first.
    const booked = (
      await Promise.all(
        interviewRows.slice(0, ROWS).map(async ({ a, j }) => {
          const rows = await ctx.db.query("interviews").withIndex("by_applicationId", (q) => q.eq("applicationId", a._id)).take(10);
          const next = rows
            .filter((i) => i.scheduledAt && i.scheduledAt >= now - 2 * 3_600_000 && i.taOutcome !== "cancelled" && i.outcome !== "rescheduled")
            .sort((x, y) => (x.scheduledAt ?? 0) - (y.scheduledAt ?? 0))[0];
          return next ? { who: await nameOf(ctx, a.candidateId), title: j.title, at: next.scheduledAt!, confirmed: !!next.confirmedAt } : null;
        }),
      )
    )
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((x, y) => x.at - y.at);
    const interviews = booked.map((i) => ({ who: i.who, title: i.title, when: interviewWhen(i.at), confirmed: i.confirmed }));

    const chase = chaseOf(withClient, booked, now);
    return { ok: true as const, withClient, interviews, chase };
  },
});
