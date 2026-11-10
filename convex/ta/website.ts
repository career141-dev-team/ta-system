// convex/ta/website.ts
//
// The "On website" switch and the list career141.com reads (10 Nov).
// The rules are src/lib/websiteJobs.ts, shared with the screens; this is the
// backend's second line, as convex/ta/guard.ts explains.

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireActor } from "./guard";
import { mapUser } from "../../src/data/convex/map";
import { isGone } from "../../src/lib/bin";
import {
  WEBSITE_POSTERS_KEY,
  canPostToWebsite,
  parseWebsitePosters,
  websiteJob,
  websiteRefusal,
} from "../../src/lib/websiteJobs";

const APP_STATUS: Record<string, string> = { active: "open", draft: "open", on_hold: "on_hold", filled: "filled", cancelled: "closed" };

export const setListed = internalMutation({
  args: { actorId: v.string(), openingId: v.string(), listed: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireActor(ctx, args.actorId);
    const setting = await ctx.db
      .query("taSettings")
      .withIndex("by_key", (q) => q.eq("key", WEBSITE_POSTERS_KEY))
      .first();
    if (!canPostToWebsite(mapUser(user as never).role, parseWebsitePosters(setting?.value))) {
      throw new Error("Only an admin, or someone the admin has allowed, can put jobs on the website.");
    }
    const jobId = args.openingId as Id<"jobs">;
    const job = await ctx.db.get(jobId);
    if (!job || isGone(job)) throw new Error("Opening not found");
    if (args.listed) {
      const refusal = websiteRefusal({ status: APP_STATUS[job.status] ?? "open", jdStatus: job.jdStatus });
      if (refusal) throw new Error(refusal);
      if (job.websiteListedAt) return { ok: true, listed: true };
      await ctx.db.patch(jobId, { websiteListedAt: Date.now(), websiteListedBy: user._id, updatedAt: new Date().toISOString() });
    } else {
      await ctx.db.patch(jobId, { websiteListedAt: undefined, websiteListedBy: undefined, updatedAt: new Date().toISOString() });
    }
    return { ok: true, listed: args.listed };
  },
});

/** Every job on the website, newest first. Read through the index, so only the listed jobs are loaded. */
export const listed = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("jobs")
      .withIndex("by_websiteListedAt", (q) => q.gt("websiteListedAt", 0))
      .order("desc")
      .take(500);
    return rows.map((j) => websiteJob(j as never)).filter((j) => j !== null);
  },
});
