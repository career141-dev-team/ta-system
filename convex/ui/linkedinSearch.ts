// convex/ui/linkedinSearch.ts
//
// The new UI's LinkedIn Search (26 Nov 2026). The browser starts a RUN here; the
// engine does the work in the background (ui/linkedinRun.ts) and the page watches
// the run's row, so a two-minute search needs no open request and can be cancelled.
// Signed in only; a run belongs to the person who started it.

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { NotSignedIn, mayReadOpening, uiUser } from "./me";
import { colomboDayStart } from "../../src/lib/calendar";
import { dayLimit, forViewer, startRefusal, STUCK_MS } from "./linkedinRules";

const runAction = makeFunctionReference<"action">("ui/linkedinRun:run");

async function who(ctx: QueryCtx | MutationCtx) {
  try {
    return { ok: true as const, user: await uiUser(ctx) };
  } catch (error) {
    return { ok: false as const, message: error instanceof NotSignedIn ? error.message : "Could not check who you are." };
  }
}

async function spentToday(ctx: QueryCtx | MutationCtx): Promise<number> {
  const since = new Date(colomboDayStart(Date.now())).toISOString();
  const rows = await ctx.db.query("liSpend").withIndex("by_createdAt", (q) => q.gte("createdAt", since)).take(5_000);
  return rows.reduce((sum, r) => sum + r.usd, 0);
}

/** Whether the page can search, and (for an admin) what today has cost. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const admin = w.user.role === "admin";
    return {
      ok: true as const,
      on: !!process.env.CRUSTDATA_API_KEY,
      spentUsd: admin ? Math.round((await spentToday(ctx)) * 100) / 100 : null,
      limitUsd: admin ? dayLimit(process.env.LINKEDIN_SEARCH_DAILY_USD) : null,
    };
  },
});

export const start = mutation({
  args: {
    kind: v.union(v.literal("search"), v.literal("answer"), v.literal("confirm"), v.literal("more"), v.literal("widen"), v.literal("refine"), v.literal("find")),
    openingId: v.optional(v.string()),
    /** The run being answered, confirmed or followed on from. */
    from: v.optional(v.id("liRuns")),
    text: v.optional(v.string()),
    answers: v.optional(v.array(v.object({ code: v.string(), answer: v.string() }))),
    field: v.optional(v.string()),
    mustHaves: v.optional(v.array(v.string())),
    person: v.optional(v.object({ name: v.optional(v.string()), company: v.optional(v.string()), url: v.optional(v.string()) })),
  },
  handler: async (ctx, a) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const from = a.from ? await ctx.db.get(a.from) : null;
    if (a.from && (!from || from.userId !== w.user._id)) return { ok: false as const, message: "That search is not yours." };
    if (a.kind !== "search" && a.kind !== "find" && !from) return { ok: false as const, message: "Start with a search." };
    const openingId = a.openingId ?? from?.openingId;
    if (openingId) {
      const job = ctx.db.normalizeId("jobs", openingId);
      if (!job || !(await mayReadOpening(ctx, w.user, job))) return { ok: false as const, message: "You are not on this opening." };
    }
    const text = a.text?.trim().slice(0, 20_000);
    if (a.kind === "search" && !text && !openingId) return { ok: false as const, message: "Say who you are looking for, or pick an opening." };
    if (a.kind === "find" && !a.person?.url?.trim() && !(a.person?.name?.trim() && a.person.company?.trim())) {
      return { ok: false as const, message: "Give a LinkedIn link, or a name and a company." };
    }

    const now = Date.now();
    const running = (await ctx.db.query("liRuns").withIndex("by_state", (q) => q.eq("state", "running")).order("desc").take(50)).filter((r) => now - r.createdAt < STUCK_MS);
    const refusal = startRefusal({
      role: w.user.role,
      keyOn: !!process.env.CRUSTDATA_API_KEY,
      spentUsd: await spentToday(ctx),
      limitUsd: dayLimit(process.env.LINKEDIN_SEARCH_DAILY_USD),
      mine: running.filter((r) => r.userId === w.user._id).length,
      desk: running.length,
    });
    if (refusal) return { ok: false as const, message: refusal };

    const runId = await ctx.db.insert("liRuns", {
      userId: w.user._id,
      openingId,
      kind: a.kind,
      state: "running",
      input: JSON.stringify({ ...a, text, openingId }),
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, runAction, { runId });
    return { ok: true as const, runId };
  },
});

function shown(r: Doc<"liRuns">, admin: boolean) {
  const stuck = r.state === "running" && Date.now() - r.createdAt >= STUCK_MS;
  return {
    id: r._id,
    kind: r.kind,
    openingId: r.openingId ?? null,
    state: stuck ? ("failed" as const) : r.state,
    stage: r.stage ?? null,
    message: stuck ? "That search stopped without an answer. Run it again." : r.message ?? null,
    asked: (JSON.parse(r.input) as { text?: string }).text ?? null,
    out: r.out ? JSON.stringify(forViewer(JSON.parse(r.out) as Record<string, unknown>, admin)) : null,
    at: r.createdAt,
  };
}

/** One run, watched live by the page. */
export const run = query({
  args: { id: v.id("liRuns") },
  handler: async (ctx, a) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const r = await ctx.db.get(a.id);
    if (!r || r.userId !== w.user._id) return { ok: false as const, message: "That search is not yours." };
    return { ok: true as const, run: shown(r, w.user.role === "admin") };
  },
});

/** The person's last runs, newest first, without their results. */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const rows = await ctx.db.query("liRuns").withIndex("by_user", (q) => q.eq("userId", w.user._id)).order("desc").take(20);
    return { ok: true as const, runs: rows.map((r) => shown({ ...r, out: undefined }, false)) };
  },
});

/** Stop a running search. A cancelled Agent Search costs nothing. */
export const cancel = mutation({
  args: { id: v.id("liRuns") },
  handler: async (ctx, a) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const r = await ctx.db.get(a.id);
    if (!r || r.userId !== w.user._id) return { ok: false as const, message: "That search is not yours." };
    if (r.state !== "running") return { ok: true as const, message: "It had already finished." };
    await ctx.db.patch(a.id, { cancelRequested: true });
    return { ok: true as const, message: "Cancelling." };
  },
});

// ─── For the background action only ─────────────────────────────────────────

/** The run, what was asked before it, and what the opening says (its client is left out of the search). */
export const forRun = internalQuery({
  args: { runId: v.id("liRuns") },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.runId);
    if (!r) return null;
    const from = (JSON.parse(r.input) as { from?: string }).from;
    const prevId = from ? ctx.db.normalizeId("liRuns", from) : null;
    const prev = prevId ? await ctx.db.get(prevId) : null;
    const jobId = r.openingId ? ctx.db.normalizeId("jobs", r.openingId) : null;
    const job = (jobId ? await ctx.db.get(jobId) : null) as { title?: string; location?: string; jobDescription?: string; clientId?: string } | null;
    const clientId = job?.clientId ? ctx.db.normalizeId("clients", job.clientId) : null;
    const client = (clientId ? await ctx.db.get(clientId) : null) as { name?: string; companyName?: string } | null;
    return {
      userId: r.userId as string,
      kind: r.kind,
      openingId: r.openingId ?? null,
      input: r.input,
      previous: prev?.out ?? null,
      opening: job
        ? { id: r.openingId!, title: job.title, location: job.location, jd: job.jobDescription?.slice(0, 20_000), client: client?.name ?? client?.companyName }
        : null,
    };
  },
});

export const cancelled = internalQuery({
  args: { runId: v.id("liRuns") },
  handler: async (ctx, a) => !!(await ctx.db.get(a.runId))?.cancelRequested,
});

export const update = internalMutation({
  args: {
    runId: v.id("liRuns"),
    state: v.optional(v.union(v.literal("running"), v.literal("done"), v.literal("failed"), v.literal("cancelled"))),
    stage: v.optional(v.string()),
    out: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { runId, ...fields }) => {
    // A late progress line never overwrites a finished run.
    const r = await ctx.db.get(runId);
    if (!r || (!fields.state && r.state !== "running")) return;
    await ctx.db.patch(runId, fields);
  },
});
