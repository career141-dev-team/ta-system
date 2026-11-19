// convex/ui/auraLedger.ts
//
// The AI ledger for the new UI (E5, 19 Nov): what the desk spent today, and one
// row per call. Internal only; convex/ui/aura.ts (a Node action) calls them.

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

// ponytail: sums today's rows by reading them; at ~$0.001 a call the $5 limit is
// thousands of rows, still small. Keep a running total per day if it ever is not.
export const spentToday = internalQuery({
  args: { day: v.number() },
  handler: async (ctx, args): Promise<number> => {
    const rows = await ctx.db.query("aiRuns").withIndex("by_day", (q) => q.eq("day", args.day)).take(20_000);
    return rows.reduce((sum, r) => sum + r.costUsd, 0);
  },
});

export const record = internalMutation({
  args: {
    userId: v.id("users"),
    feature: v.string(),
    day: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
    ok: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("aiRuns", args);
  },
});
