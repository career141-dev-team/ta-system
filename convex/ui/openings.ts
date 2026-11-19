// convex/ui/openings.ts
//
// The new UI's Openings list (18 Nov). The old app reads every jobs row into
// memory for this page (ta/openings:list collects the whole table, and a jobs
// row is fat - JD text, embedding, match results). Here each status is read
// through its own index, newest first, with a ceiling, and only the few fields
// a card shows leave the backend.
//
// Who sees what, as mayReadOpening: desk-wide roles every opening; anyone else
// the openings they are assigned to.

import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isGone } from "../../src/lib/bin";
import { isDeskWideUser } from "../ta/guard";
import { NotSignedIn, uiUser } from "./me";
import { daysOpen, openingCard, type CardStatus } from "./rules";

// ponytail: per-status ceilings; the page shows the newest of each. If a desk
// ever holds more open openings than this, page the list instead.
// 19 Nov: the finished lists were 100 each - a jobs row is fat (embedding), 700 rows
// timed out the 1 s limit on a cold backend ("Function execution timed out"), so
// only the open work keeps its big ceiling; the page already says when a list is capped.
const CAP: Record<Doc<"jobs">["status"], number> = { active: 300, draft: 40, on_hold: 60, filled: 40, cancelled: 40 };

async function deskRows(ctx: QueryCtx) {
  const rows: Doc<"jobs">[] = [];
  const capped: CardStatus[] = [];
  for (const status of Object.keys(CAP) as Doc<"jobs">["status"][]) {
    const got = await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", status)).order("desc").take(CAP[status] + 1);
    if (got.length > CAP[status]) capped.push(openingCard.status(status));
    rows.push(...got.slice(0, CAP[status]));
  }
  return { rows, capped };
}

async function myRows(ctx: QueryCtx, userId: Id<"users">) {
  const mine = await ctx.db
    .query("jobAssignments")
    .withIndex("by_userId_isActive", (q) => q.eq("userId", userId).eq("isActive", true))
    .take(300);
  const ids = [...new Set(mine.map((a) => a.jobId))];
  const rows = (await Promise.all(ids.map((id) => ctx.db.get(id)))).filter((j): j is Doc<"jobs"> => !!j);
  return { rows, capped: [] as CardStatus[] };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return { ok: false as const, message: error instanceof NotSignedIn ? error.message : "Could not check who you are." };
    }
    const { rows, capped } = isDeskWideUser(user) ? await deskRows(ctx) : await myRows(ctx, user._id);
    const jobs = rows.filter((j) => !isGone(j));

    const teamIds = [...new Set(jobs.flatMap((j) => (j.assignedTaIds ?? []) as string[]))];
    const people = await Promise.all(teamIds.map((id) => ctx.db.get(id as Id<"users">)));
    const nameOf = new Map(people.flatMap((p) => (p ? [[p._id as string, p.fullName.split(" ")[0]] as const] : [])));

    const now = Date.now();
    const openings = jobs
      .map((j) =>
        openingCard.of({
          id: j._id as string,
          client: j.clientName,
          title: j.title,
          status: j.status,
          priorityTier: j.priorityTier ?? null,
          days: daysOpen(j, now),
          team: ((j.assignedTaIds ?? []) as string[]).flatMap((id) => nameOf.get(id) ?? []),
          made: j._creationTime,
          website: !!j.websiteListedAt,
        }),
      )
      .sort((a, b) => b.made - a.made);
    return { ok: true as const, openings, capped };
  },
});
