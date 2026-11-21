// convex/ui/track.ts
//
// TA Track for the new UI (R3, 21 Nov 2026). Old AURA's /ta-track reads
// ta/tracking:report for one date through its server; the new screen asks for a
// range (today, this week, this month, up to 31 days), so this read takes the same
// rows by the same indexes, one date at a time, and adds the CVs each person's
// accepted Midday and EOD emails sent the Director (the ui/myDay rule).
//
// Who may read it: admins and TA leads only - the old rule (canViewTaTracking).
// Read only. Bounded: 31 dates, 20,000 tracker rows, 200 emails a person.

import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { mapUser } from "../../src/data/convex/map";
import { canPairTaTracking, canViewTaTracking, TRACKING_RETENTION_MS } from "../../src/lib/taTracking";
import { NotSignedIn, uiUser } from "./me";
import { datesBetween, peopleOf, type TrackRow } from "./trackRules";

const MAX_ROWS = 20_000;
const DAY = 86_400_000;

export const report = query({
  args: { from: v.string(), to: v.string(), userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let me: Doc<"users">;
    try {
      me = await uiUser(ctx);
    } catch (error) {
      return { ok: false as const, message: error instanceof NotSignedIn ? error.message : "Could not check who you are." };
    }
    if (!canViewTaTracking(mapUser(me).role)) return { ok: false as const, message: "Only admins and TA leads can view TA Track." };
    const dates = datesBetween(args.from, args.to);
    if (typeof dates === "string") return { ok: false as const, message: dates };
    const one = args.userId ? ctx.db.normalizeId("users", args.userId) : null;
    if (args.userId && !one) return { ok: false as const, message: "TA not found." };

    const rows: Doc<"taTrackingRows">[] = [];
    for (const date of dates) {
      rows.push(...(await (one
        ? ctx.db.query("taTrackingRows").withIndex("by_user_date", (q) => q.eq("userId", one).eq("date", date))
        : ctx.db.query("taTrackingRows").withIndex("by_date", (q) => q.eq("date", date))).take(MAX_ROWS + 1 - rows.length)));
      if (rows.length > MAX_ROWS) return { ok: false as const, message: "Too much activity for one read. Pick one TA or fewer days." };
    }
    const users = (await ctx.db.query("users").collect()).filter((u) => canPairTaTracking(mapUser(u).role) && (!one || u._id === one));
    const withRows = new Set(rows.map((r) => String(r.userId)));
    const people = users.filter((u) => u.isActive || withRows.has(String(u._id))).map((u) => ({ id: String(u._id), name: u.fullName }));

    const now = Date.now();
    const devices = (one
      ? await ctx.db.query("taTrackingDevices").withIndex("by_user", (q) => q.eq("userId", one)).collect()
      : await ctx.db.query("taTrackingDevices").collect())
      .map((d) => ({ userId: String(d.userId), lastSyncAt: d.lastSyncAt, enabled: d.enabled && d.expiresAt > now }));

    // CVs sent the Director: accepted emails, revisions not counted again (as ui/myDay).
    const since = Date.parse(`${dates[0]}T00:00:00+05:30`);
    const until = Date.parse(`${dates[dates.length - 1]}T00:00:00+05:30`) + DAY;
    const inRange = new Set(dates);
    const cvs: { userId: string; date: string; count: number }[] = [];
    for (const p of people) {
      const sent = await ctx.db.query("dailyEmails")
        .withIndex("by_user_accepted", (q) => q.eq("userId", ctx.db.normalizeId("users", p.id)!).gte("acceptedAt", since).lt("acceptedAt", until + DAY))
        .take(200);
      const byDate = new Map<string, number>();
      for (const e of sent) if (e.status === "accepted" && !e.parentId && inRange.has(e.date)) byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.applicationIds.length);
      for (const [date, count] of byDate) cvs.push({ userId: p.id, date, count });
    }

    const track: TrackRow[] = rows.map((r) => ({ ...r, userId: String(r.userId) }));
    return {
      ok: true as const,
      dates,
      retentionMs: TRACKING_RETENTION_MS,
      people: peopleOf(track, people, devices, cvs, now),
    };
  },
});
