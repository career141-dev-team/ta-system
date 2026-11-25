// convex/ui/searches.ts
//
// The new UI's Database chat writes down each search it ran (Part 3 of Ask AURA,
// 20 Nov 2026), so "how many searches have I done today?" has a real answer and
// the chat's history is the person's own past searches, on any computer. Uses the
// searchHistory table, which nothing wrote before. Own rows only, bounded.

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { who } from "./day";

const MAX_QUERY = 2000;

export const record = mutation({
  args: { query: v.string(), count: v.number() },
  handler: async (ctx, a) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const q = a.query.trim().slice(0, MAX_QUERY);
    if (!q) return { ok: false as const, message: "Nothing to keep." };
    await ctx.db.insert("searchHistory", { userId: w.user._id, query: q, type: "natural_language", resultCount: Math.max(0, Math.floor(a.count)) });
    return { ok: true as const, message: "Kept." };
  },
});

/**
 * Delete one chat from the person's own history (25 Nov). A chat is a search and the ones it was continued
 * from (the list shows them once), so every own row whose words start the chat's words goes. Only own rows.
 */
export const remove = mutation({
  args: { query: v.string() },
  handler: async (ctx, a) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const q = a.query.trim().slice(0, MAX_QUERY);
    if (!q) return { ok: false as const, message: "Nothing to delete." };
    const rows = await ctx.db.query("searchHistory").withIndex("by_user", (x) => x.eq("userId", w.user._id)).order("desc").take(200);
    let n = 0;
    for (const r of rows) {
      if (q.startsWith(r.query)) {
        await ctx.db.delete(r._id);
        n++;
      }
    }
    return { ok: true as const, message: n ? "Deleted." : "Already gone." };
  },
});

/** The person's last 40 searches, newest first. */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const rows = await ctx.db.query("searchHistory").withIndex("by_user", (q) => q.eq("userId", w.user._id)).order("desc").take(40);
    return { ok: true as const, searches: rows.map((r) => ({ id: r._id as string, query: r.query, count: r.resultCount, at: r._creationTime })) };
  },
});
