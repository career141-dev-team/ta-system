// convex/ui/access.ts
//
// Opening access requests for the new UI (20 Nov, step 3 of the placements plan).
// The rules are already in ta/openingAccess (who may ask, one pending request
// per opening, the TA Lead decides, approving seats the TA as a supporting
// recruiter). This file only gives the signed-in door its own bounded reads and
// maps the two writes onto those rules.
//
// `available` is NOT ta/openingAccess:listAvailable: that one collects every job
// row (fat, with the JD) and every user. Here the active openings are read by
// index, capped, and only the small directory fields go back.

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { isGone } from "../../src/lib/bin";
import { who } from "./day";
import { inWords } from "./rules";

type Refused = { ok: false; message: string };
const refused = (message: string): Refused => ({ ok: false, message });

function roleOf(user: Doc<"users">): string {
  if (user.taRole) return user.taRole;
  if (user.role === "ta_manager" || user.role === "senior_ta") return "ta_lead";
  if (user.role === "recruiter" || user.role === "test_ta") return "ta";
  return user.role;
}

/** Active openings this TA is not on and may ask to join (400 at most), with their own latest request. */
export const available = query({
  args: {},
  handler: async (ctx) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const me = w.user;
    if (!["ta", "ta_support"].includes(roleOf(me))) return { ok: true as const, canRequest: false, openings: [] };

    const [jobs, mine, requests] = await Promise.all([
      ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "active")).take(400),
      ctx.db.query("jobAssignments").withIndex("by_userId_isActive", (q) => q.eq("userId", me._id).eq("isActive", true)).take(500),
      ctx.db.query("openingAccessRequests").withIndex("by_requester_job", (q) => q.eq("requesterId", me._id)).take(500),
    ]);
    const on = new Set(mine.map((a) => a.jobId as string));
    const latest = new Map<string, Doc<"openingAccessRequests">>();
    for (const r of requests) {
      const had = latest.get(r.jobId as string);
      if (!had || r.requestedAt > had.requestedAt) latest.set(r.jobId as string, r);
    }
    const leads = new Map<string, Doc<"users"> | null>();
    const openings = [];
    for (const job of jobs) {
      if (isGone(job) || job.isConfidential) continue;
      if (on.has(job._id as string) || (job.assignedTaIds ?? []).includes(me._id)) continue;
      if (!job.taLeadId) continue;
      const key = job.taLeadId as string;
      if (!leads.has(key)) leads.set(key, await ctx.db.get(job.taLeadId));
      const lead = leads.get(key);
      if (!lead?.isActive || roleOf(lead) !== "ta_lead") continue;
      const r = latest.get(job._id as string);
      openings.push({
        id: job._id as string,
        title: job.title,
        clientName: job.clientName,
        leadName: lead.fullName,
        status: (r?.status ?? null) as "pending" | "approved" | "rejected" | null,
      });
    }
    openings.sort((a, b) => `${a.clientName} ${a.title}`.localeCompare(`${b.clientName} ${b.title}`));
    return { ok: true as const, canRequest: true, openings };
  },
});

/** Ask the opening's TA Lead for a seat. One pending request per opening. */
export const request = mutation({
  args: { openingId: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Refused | { ok: true; message: string }> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    try {
      const r = (await ctx.runMutation(internal.ta.openingAccess.request, {
        actorId: w.user._id as string, openingId: args.openingId, reason: args.reason,
      })) as { alreadyAssigned?: boolean; alreadyPending?: boolean };
      if (r.alreadyAssigned) return { ok: true, message: "You are already on this opening." };
      if (r.alreadyPending) return { ok: true, message: "You already asked. The TA Lead has not answered yet." };
      return { ok: true, message: "Request sent to the TA Lead." };
    } catch (error) {
      return refused(inWords(error, "The request could not be sent. Try again."));
    }
  },
});

/** Requests waiting for this person to decide: a TA Lead's own, or every one for an admin. Empty for anyone else. */
export const pending = query({
  args: {},
  handler: async (ctx) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    try {
      const rows = (await ctx.runQuery(internal.ta.openingAccess.listPendingForApprover, { actorId: w.user._id as string })) as {
        id: string; openingId: string; openingTitle: string; clientName: string; requesterName: string; requestReason: string | null; requestedAt: number;
      }[];
      return { ok: true as const, requests: rows.slice(0, 50) };
    } catch (error) {
      return refused(inWords(error, "Could not load the requests."));
    }
  },
});

/** Approve (the TA joins as a supporting recruiter) or decline with a reason. */
export const decide = mutation({
  args: { requestId: v.string(), approve: v.boolean(), reason: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Refused | { ok: true; message: string }> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    try {
      await ctx.runMutation(internal.ta.openingAccess.decide, {
        actorId: w.user._id as string, requestId: args.requestId, approve: args.approve, reason: args.reason,
      });
      return { ok: true, message: args.approve ? "Approved. They are on the opening now." : "Declined. They were told why." };
    } catch (error) {
      return refused(inWords(error, "That could not be saved. Try again."));
    }
  },
});
