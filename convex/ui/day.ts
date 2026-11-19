// convex/ui/day.ts
//
// D4 (19 Nov): the TA's day for the new UI - the workday, its checks, the bell
// and the opening's working stage. Every rule here already lives in an internal
// function (ta/workdays, ta/notifications, ta/openings); the old app's
// src/app/workday/actions.ts only maps a form onto them. This file is that map
// for the signed-in door: the person is the Clerk sign-in (uiUser), never an
// argument, and a refusal comes back as a sentence.

import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { mapUser } from "../../src/data/convex/map";
import { checkResearchSubmission } from "../../src/lib/eod-format";
import { NotSignedIn, uiUser } from "./me";
import { inWords } from "./rules";

type Refused = { ok: false; message: string };
type Done = Refused | { ok: true; message: string };
const refused = (message: string): Refused => ({ ok: false, message });

export async function who(ctx: QueryCtx | MutationCtx): Promise<Refused | { ok: true; user: Doc<"users"> }> {
  try {
    return { ok: true, user: await uiUser(ctx) };
  } catch (error) {
    return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
  }
}

const workType = v.union(v.literal("100%"), v.literal("Add-on"), v.literal("Follow-up"));

/** What a workday write answers, in the old action's words (src/app/workday/actions.ts). */
export function dayAnswer(op: string, result: { ok?: boolean; blockers?: string[]; pending?: boolean } | null | undefined): Done {
  if (result?.ok === false) return refused(`Complete these steps first: ${result.blockers?.slice(0, 5).join("; ") || "review the checklist"}.`);
  if (op === "finish") return { ok: true, message: "Workday finished. Your TA Lead can see the finish time." };
  if (op === "start") return { ok: true, message: "Workday started. Your TA Lead can see the start time." };
  if (op === "chatgpt") return { ok: true, message: "Research link confirmed." };
  if (result?.pending) return { ok: true, message: "Sent to the TA Lead for approval." };
  return { ok: true, message: "Saved." };
}

/**
 * Today: the person's open workday with each position's checks, the positions
 * they may add and their last days - never the reviewers' team panel (ownOnly;
 * a lead reads the team from ui/lead:desk). ta/workdays:dashboard,
 * which is already bounded (#380, #393). `staleChecklists` on a day says which
 * positions were computed live; `refreshChecks` asks for one stored recompute.
 */
export const today = query({
  args: { jobId: v.optional(v.string()), allHistory: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<Refused | { ok: true; view: unknown }> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    try {
      const view: unknown = await ctx.runQuery(internal.ta.workdays.dashboard, {
        actorId: w.user._id, detail: true, jobId: args.jobId, allHistory: args.allHistory,
        // The person's own day only: the reviewers' panel timed out for an admin (19 Nov) and Today never shows it.
        ownOnly: true,
      });
      return { ok: true as const, view };
    } catch (error) {
      return refused(inWords(error, "Could not load your workday. Try again."));
    }
  },
});

/** Mark positions computed live so one scheduled recompute stores them (the old route's step). */
export const refreshChecks = mutation({
  args: { workdayId: v.id("taWorkdays"), jobIds: v.array(v.id("jobs")) },
  handler: async (ctx, args): Promise<Done> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const day = await ctx.db.get(args.workdayId);
    if (!day || day.userId !== w.user._id) return refused("That workday is not yours.");
    await ctx.runMutation(internal.ta.workdays.markChecklistsStale, { workdayId: args.workdayId, jobIds: args.jobIds.slice(0, 20) });
    return { ok: true, message: "Refreshing." };
  },
});

/** Run one workday write as the signed-in person. */
async function act(ctx: MutationCtx, op: string, run: (actorId: string) => Promise<unknown>): Promise<Done> {
  const w = await who(ctx);
  if (!w.ok) return w;
  try {
    return dayAnswer(op, (await run(w.user._id)) as { ok?: boolean; blockers?: string[]; pending?: boolean } | null);
  } catch (error) {
    // Start is safe to press again: it returns today's workday instead of a second one.
    return refused(inWords(error, "Your workday was not changed. Try again in a moment."));
  }
}

export const start = mutation({
  args: { jobId: v.id("jobs"), workType },
  handler: (ctx, a): Promise<Done> => act(ctx, "start", (actorId): Promise<unknown> => ctx.runMutation(internal.ta.workdays.start, { actorId, ...a })),
});

export const addPosition = mutation({
  args: { workdayId: v.id("taWorkdays"), jobId: v.id("jobs"), workType },
  handler: (ctx, a): Promise<Done> => act(ctx, "addPosition", (actorId): Promise<unknown> => ctx.runMutation(internal.ta.workdays.addPosition, { actorId, ...a })),
});

export const setWorkType = mutation({
  args: { workdayId: v.id("taWorkdays"), jobId: v.id("jobs"), workType },
  handler: (ctx, a): Promise<Done> => act(ctx, "setWorkType", (actorId): Promise<unknown> => ctx.runMutation(internal.ta.workdays.setWorkType, { actorId, ...a })),
});

/** "Couldn't do it" with a reason, or take that back (withdraw). */
export const excuseCheck = mutation({
  args: { workdayId: v.id("taWorkdays"), jobId: v.id("jobs"), key: v.string(), reason: v.string(), withdraw: v.boolean() },
  handler: (ctx, a): Promise<Done> => act(ctx, "taskException", (actorId): Promise<unknown> => ctx.runMutation(internal.ta.workdays.taskException, { actorId, ...a })),
});

export const carry = mutation({
  args: { workdayId: v.id("taWorkdays"), jobId: v.id("jobs"), key: v.string(), reason: v.string(), nextAction: v.string(), dueAt: v.number() },
  handler: (ctx, a): Promise<Done> => act(ctx, "carry", (actorId): Promise<unknown> => ctx.runMutation(internal.ta.workdays.carry, { actorId, ...a })),
});

export const markReviewed = mutation({
  args: { workdayId: v.id("taWorkdays"), applicationId: v.id("applications") },
  handler: (ctx, a): Promise<Done> => act(ctx, "markReviewed", (actorId): Promise<unknown> => ctx.runMutation(internal.ta.workdays.markReviewed, { actorId, ...a })),
});

export const finish = mutation({
  args: { workdayId: v.id("taWorkdays") },
  handler: (ctx, a): Promise<Done> => act(ctx, "finish", (actorId): Promise<unknown> => ctx.runMutation(internal.ta.workdays.finish, { actorId, ...a })),
});

/** A lead approves or declines a TA's workday request. */
export const decide = mutation({
  args: { requestId: v.id("taWorkdayRequests"), approve: v.boolean(), reason: v.string() },
  handler: (ctx, a): Promise<Done> => act(ctx, "decide", (actorId): Promise<unknown> => ctx.runMutation(internal.ta.workdays.decide, { actorId, ...a })),
});

/**
 * A workday check saved by hand: JD / research reviewed, no suggestions or no
 * candidates with a reason, or the ChatGPT share link - which keeps the old
 * rule: a valid share link, and the sender confirmed it (`confirmed`).
 */
export const saveCheck = mutation({
  args: {
    jobId: v.id("jobs"),
    kind: v.union(v.literal("jd"), v.literal("research"), v.literal("emptySuggestions"), v.literal("noCandidates"), v.literal("chatgpt")),
    reason: v.optional(v.string()),
    reasons: v.optional(v.record(v.string(), v.string())),
    link: v.optional(v.string()),
    confirmed: v.optional(v.boolean()),
  },
  handler: async (ctx, a): Promise<Done> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    let link = a.link;
    if (a.kind === "chatgpt") {
      const checked = checkResearchSubmission({ role: mapUser(w.user as never).role, kind: "director", link: a.link, confirmed: !!a.confirmed });
      if (!checked.ok) return refused(checked.reason);
      if (checked.url) link = checked.url;
    }
    return act(ctx, a.kind === "chatgpt" ? "chatgpt" : "saveCheck", (actorId): Promise<unknown> =>
      ctx.runMutation(internal.ta.workdays.saveCheck, { actorId, ...a, link }),
    );
  },
});

/** The working stage a person holds on an opening (the opening page's Stage pill). */
export const setWorkingStage = mutation({
  args: { openingId: v.string(), stage: workType, userId: v.optional(v.string()) },
  handler: async (ctx, a): Promise<Done> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    try {
      await ctx.runMutation(internal.ta.openings.setWorkingStage, { actorId: w.user._id, ...a });
    } catch (error) {
      return refused(inWords(error, "The stage could not be saved. Try again."));
    }
    return { ok: true, message: `Working stage set to ${a.stage}.` };
  },
});

// ── The bell ────────────────────────────────────────────────────────────────

export const bell = query({
  args: { unreadOnly: v.optional(v.boolean()), limit: v.optional(v.number()) },
  handler: async (ctx, a): Promise<Refused | { ok: true; rows: unknown }> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const rows: unknown = await ctx.runQuery(internal.ta.notifications.listForUser, { userId: w.user._id, unreadOnly: a.unreadOnly, limit: Math.min(a.limit ?? 30, 100) });
    return { ok: true as const, rows };
  },
});

export const markRead = mutation({
  args: { notificationId: v.string() },
  handler: async (ctx, a): Promise<Done> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    await ctx.runMutation(internal.ta.notifications.markRead, { userId: w.user._id, notificationId: a.notificationId });
    return { ok: true, message: "Read." };
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx): Promise<Done> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    await ctx.runMutation(internal.ta.notifications.markAllRead, { userId: w.user._id });
    return { ok: true, message: "All read." };
  },
});
