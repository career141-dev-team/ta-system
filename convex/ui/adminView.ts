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
  args: { name: v.optional(v.string()), id: v.optional(v.string()) },
  handler: async (ctx, args) => {
    try {
      const me = await uiUser(ctx);
      if (me.role !== "admin") return { ok: false, message: "Only an admin can look into another person's work." } as Refused;
    } catch (error) {
      return { ok: false, message: error instanceof NotSignedIn ? error.message : "Could not check who you are." } as Refused;
    }
    const asked = (args.name ?? "").trim();
    const byId = args.id ? ctx.db.normalizeId("users", args.id) : null;
    const one = byId ? await ctx.db.get(byId) : null;
    const found = one ? [one] : peopleNamed(await ctx.db.query("users").take(MAX_PEOPLE), asked);
    if (!found.length) return { ok: false, message: `I could not find anyone called "${asked}" on the desk.` } as Refused;
    if (found.length > 1 && found[0].fullName?.toLowerCase() !== asked.toLowerCase()) {
      return { ok: true as const, several: found.slice(0, 6).map((u) => ({ id: u._id as string, name: u.fullName ?? u.email ?? "?" })) };
    }
    const person = found[0];
    const mapped = mapUser(person as never);

    const day = await ctx.db.query("taWorkdays").withIndex("by_user", (q) => q.eq("userId", person._id)).order("desc").first();
    const unticked: { position: string; label: string }[] = [];
    const positions: { jobId: string; title: string; workType: string }[] = [];
    for (const j of day ? day.jobs.slice(0, 10) : []) {
      const job = await ctx.db.get(j.jobId);
      positions.push({ jobId: j.jobId as string, title: job?.title ?? "A position", workType: j.workType });
    }
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
      positions,
      unticked: unticked.slice(0, 12),
      actions: actions.map((a) => ({ at: a.occurredAt, action: a.action, what: `${a.entityType} ${a.entityId}`.slice(0, 80) })),
    };
  },
});

/** Everyone active on the desk, for the admin's assistant to find a name in a sentence. Admin only. */
export const people = query({
  args: {},
  handler: async (ctx) => {
    try {
      const me = await uiUser(ctx);
      if (me.role !== "admin") return { ok: false, message: "Only an admin can look into another person's work." } as Refused;
    } catch (error) {
      return { ok: false, message: error instanceof NotSignedIn ? error.message : "Could not check who you are." } as Refused;
    }
    const users = await ctx.db.query("users").take(MAX_PEOPLE);
    return { ok: true as const, people: users.filter((u) => u.isActive).map((u) => ({ id: u._id as string, name: u.fullName ?? u.email ?? "?" })) };
  },
});

/** The one person a sentence names: a whole name, or a first name only one person has. Pure so a test can hold it. */
export function personIn(text: string, people: { id: string; name: string }[]): { id: string; name: string } | "many" | null {
  const said = new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const words = (n: string) => n.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2);
  const full = people.filter((p) => words(p.name).length > 1 && words(p.name).every((x) => said.has(x)));
  if (full.length === 1) return full[0];
  const hits = full.length ? full : people.filter((p) => words(p.name).length > 0 && said.has(words(p.name)[0]));
  return hits.length === 1 ? hits[0] : hits.length > 1 ? "many" : null;
}
