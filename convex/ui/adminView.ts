// convex/ui/adminView.ts
//
// The admin's assistant (21 Nov): "what did Samira do?" and "log in as Samira".
// Admin only, read only. Finds a person by the words of their name and reports
// what the desk holds on them - today's workday, what is still unticked, their
// last recorded actions - so a "it does not work" can be checked against facts
// instead of two people's memories. Seeing the person's exact screens is the
// `as` argument on the read queries (convex/ui/me.ts uiUser); this only names who.

import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { mapUser } from "../../src/data/convex/map";
import { NotSignedIn, uiUser } from "./me";

type Refused = { ok: false; message: string };

const MAX_PEOPLE = 400;

/** People whose name holds every word asked for, active first. Pure so a test can hold it. */
export function peopleNamed(users: Doc<"users">[], asked: string): Doc<"users">[] {
  const words = asked.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  return users
    .filter((u) => words.every((w) => `${u.fullName ?? ""} ${u.email ?? ""}`.toLowerCase().includes(w)))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive));
}

export const report = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    try {
      const me = await uiUser(ctx);
      if (me.role !== "admin") return { ok: false, message: "Only an admin can look into another person's work." } as Refused;
    } catch (error) {
      return { ok: false, message: error instanceof NotSignedIn ? error.message : "Could not check who you are." } as Refused;
    }
    const found = peopleNamed(await ctx.db.query("users").take(MAX_PEOPLE), args.name);
    if (!found.length) return { ok: false, message: `I could not find anyone called "${args.name.trim()}" on the desk.` } as Refused;
    if (found.length > 1 && found[0].fullName?.toLowerCase() !== args.name.trim().toLowerCase()) {
      return { ok: true as const, several: found.slice(0, 6).map((u) => ({ id: u._id as string, name: u.fullName ?? u.email ?? "?" })) };
    }
    const person = found[0];
    const mapped = mapUser(person as never);

    const day = await ctx.db.query("taWorkdays").withIndex("by_user", (q) => q.eq("userId", person._id)).order("desc").first();
    const unticked: { position: string; label: string }[] = [];
    if (day && !day.finishedAt) {
      for (const j of day.jobs.slice(0, 10)) {
        const job = await ctx.db.get(j.jobId);
        const events = await ctx.db.query("taWorkdayTaskEvents").withIndex("by_workday_job", (q) => q.eq("workdayId", day._id).eq("jobId", j.jobId)).order("desc").take(80);
        const latest = new Map<string, (typeof events)[number]>();
        for (const e of events) if (!latest.has(e.key)) latest.set(e.key, e);
        for (const e of latest.values()) if (e.status !== "complete") unticked.push({ position: job?.title ?? "A position", label: e.label });
      }
    }
    const actions = await ctx.db.query("activityLog").withIndex("by_actorId", (q) => q.eq("actorId", person._id)).order("desc").take(8);

    return {
      ok: true as const,
      person: { id: person._id as string, name: mapped.name, role: mapped.role, active: person.isActive },
      workday: day
        ? { date: day.date, startedAt: day.startedAt, finishedAt: day.finishedAt ?? null, positions: day.jobs.length, closure: day.closureReason ?? null }
        : null,
      unticked: unticked.slice(0, 12),
      actions: actions.map((a) => ({ at: a.occurredAt, action: a.action, what: `${a.entityType} ${a.entityId}`.slice(0, 80) })),
    };
  },
});
