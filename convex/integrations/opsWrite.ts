/**
 * The Ops System's writes (ops docs/15 Part E, the writes).
 *
 * Reading was the easy half. These change TA's own data, so three rules shape
 * every one of them:
 *
 * 1. **Through TA's own doors, never around them.** Each write calls the
 *    mutation the app already uses - `ta/openings:create`,
 *    `ta/openings:setWorkingStage`, `ta/openings:updateMasterSheet`,
 *    `ta/notifications:create` - so TA's rules, its audit and its bells all
 *    happen exactly as they do when a person clicks. Nothing here patches a
 *    row behind their back.
 * 2. **Repeat-safe.** The Ops System queues its writes and retries after an
 *    outage, so the same write will arrive twice. Every one carries an
 *    `idempotencyKey`; the first result is kept and handed back on a repeat,
 *    so a retried hand-over cannot make two openings.
 * 3. **One actor, named.** A server-to-server call has no signed-in person,
 *    so every change is attributed to the TA user named in
 *    `OPS_API_ACTOR_EMAIL`. Unset, or no such user, and the writes refuse -
 *    an unattributable change to a live opening is worse than no change.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/* ── Repeat-safe ────────────────────────────────────────────────── */

export const recallWrite = internalQuery({
  args: { idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const seen = await ctx.db
      .query("opsApiWrites")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    return seen ? { answer: seen.answer, at: seen.createdAt } : null;
  },
});

const remember = async (ctx: MutationCtx, idempotencyKey: string, path: string, answer: unknown) => {
  await ctx.db.insert("opsApiWrites", {
    idempotencyKey,
    path,
    answer: JSON.stringify(answer ?? null).slice(0, 4000),
    createdAt: Date.now(),
  });
};

/** The one person every Ops-originated change is recorded as. */
export const opsActor = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const wanted = args.email.trim().toLowerCase();
    if (!wanted) return null;
    const users = await ctx.db.query("users").take(500);
    const actor = users.find((user) => user.email.toLowerCase() === wanted && user.isActive);
    return actor ? { id: actor._id as string, fullName: actor.fullName, role: actor.role } : null;
  },
});

/* ── The writes themselves ──────────────────────────────────────── */

/**
 * Tell somebody in the TA System something (Part E, `POST notify`).
 *
 * The smallest write there is, and the one that ends the worst habit on the
 * board: news passed by hand, arriving late. It only ever adds a bell.
 */
export const opsNotify = internalMutation({
  args: {
    idempotencyKey: v.string(),
    userId: v.string(),
    type: v.string(),
    title: v.string(),
    body: v.string(),
    jobId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("notifications", {
      userId: args.userId as Id<"users">,
      // Every bell from the Ops System carries its own type, so a TA can see
      // where it came from and this never borrows a type that means something
      // else. What Ops called it is kept at the front of the body.
      type: "from_ops" as const,
      title: args.title.slice(0, 200),
      body: (args.type && args.type !== "from_ops" ? args.type + ": " : "").concat(args.body).slice(0, 600),
      jobId: args.jobId ? (args.jobId as Id<"jobs">) : undefined,
      read: false,
      createdAt: new Date().toISOString(),
    });
    const answer = { ok: true, notificationId: id as string };
    await remember(ctx, args.idempotencyKey, "notify", answer);
    return answer;
  },
});

/**
 * Create an opening from a requirement (Part E, `POST openings`).
 *
 * This is the hand-over: the moment a client's requirement becomes the TA
 * System's job. It goes through `ta/openings:create`, so the opening, its
 * first post and its brief are made exactly as the app makes them.
 */
export const opsCreateOpening = internalMutation({
  args: {
    idempotencyKey: v.string(),
    actorId: v.string(),
    clientId: v.string(),
    title: v.string(),
    country: v.optional(v.string()),
    brief: v.optional(v.string()),
    assignedTaIds: v.optional(v.array(v.string())),
    taLeadId: v.optional(v.union(v.string(), v.null())),
    priorityTier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const made = (await ctx.runMutation(internal.ta.openings.create, {
      actorId: args.actorId,
      clientId: args.clientId,
      title: args.title,
      country: args.country,
      assignedTaIds: args.assignedTaIds ?? [],
      taLeadId: args.taLeadId ?? null,
      notesMarkdown: args.brief,
      briefKind: "management_to_lead" as const,
      priorityTier: args.priorityTier,
    })) as { openingId?: string; id?: string } | null;

    const openingId = made?.openingId ?? made?.id ?? null;
    const answer = { ok: true, openingId };
    await remember(ctx, args.idempotencyKey, "openings", answer);
    return answer;
  },
});

/**
 * Who is on an opening, and what they are doing on it today
 * (Part E, `POST openings/{id}/team` and `/working-stage`).
 *
 * The 100% day is the TA lead's to set, and Ops only records what was
 * decided in the requirement meeting - which is why this goes through the
 * same mutation the lead's own menu uses.
 */
export const opsSetWorkingStage = internalMutation({
  args: {
    idempotencyKey: v.string(),
    actorId: v.string(),
    openingId: v.string(),
    userId: v.optional(v.string()),
    mode: v.union(v.literal("100%"), v.literal("Follow-up"), v.literal("Add-on")),
  },
  handler: async (ctx, args) => {
    const done = await ctx.runMutation(internal.ta.openings.setWorkingStage, {
      actorId: args.actorId,
      openingId: args.openingId,
      userId: args.userId,
      stage: args.mode,
    });
    const answer = { ok: true, ...(done as Record<string, unknown>) };
    await remember(ctx, args.idempotencyKey, "working-stage", answer);
    return answer;
  },
});

/**
 * Open, hold, fill or close an opening (Part E, `POST openings/{id}/status`).
 *
 * Ops holds a position when a client goes quiet and reopens it when they come
 * back; TA's Master Sheet is where that lives, and it refuses a change with no
 * reason - which is the owner's own standing rule, enforced by TA rather than
 * repeated here.
 */
export const opsSetOpeningStatus = internalMutation({
  args: {
    idempotencyKey: v.string(),
    actorId: v.string(),
    openingId: v.string(),
    status: v.union(v.literal("open"), v.literal("on_hold"), v.literal("filled"), v.literal("closed")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.openingId as Id<"jobs">).catch(() => null);
    if (!job || !("title" in job)) throw new Error("Opening not found");

    const positionStatus =
      args.status === "open"
        ? ("active" as const)
        : args.status === "on_hold"
          ? ("hold" as const)
          : args.status === "filled"
            ? ("filled" as const)
            : ("lost" as const);

    const row = job as { assignedAt?: number; closedAt?: number; valueOnProgressing?: number; valueOfPlacement?: number; valueLost?: number };
    await ctx.runMutation(internal.ta.openings.updateMasterSheet, {
      actorId: args.actorId,
      openingId: args.openingId,
      positionStatus,
      assignedAt: row.assignedAt ?? null,
      closedAt: args.status === "closed" || args.status === "filled" ? Date.now() : (row.closedAt ?? null),
      valueOnProgressing: row.valueOnProgressing ?? null,
      valueOfPlacement: row.valueOfPlacement ?? null,
      valueLost: row.valueLost ?? null,
      reason: args.reason,
    });

    const answer = { ok: true, openingId: args.openingId, positionStatus };
    await remember(ctx, args.idempotencyKey, "status", answer);
    return answer;
  },
});
