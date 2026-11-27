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
const MAX_TITLE = 120;
const MAX_TURNS_JSON = 250_000;

export const record = mutation({
  args: {
    query: v.string(),
    count: v.number(),
    chatId: v.optional(v.string()),
    title: v.optional(v.string()),
    turnsJson: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const q = a.query.trim().slice(0, MAX_QUERY);
    if (!q) return { ok: false as const, message: "Nothing to keep." };
    const chatId = a.chatId?.trim().slice(0, 80) || undefined;
    const title = a.title?.trim().slice(0, MAX_TITLE) || undefined;
    const turnsJson = a.turnsJson && a.turnsJson.length <= MAX_TURNS_JSON ? a.turnsJson : undefined;
    const resultCount = Math.max(0, Math.floor(a.count));

    // When a chatId is given, update that conversation in place so follow-up turns
    // persist on the same thread instead of spawning duplicate history rows (27 Nov 2026).
    if (chatId) {
      const recentRows = await ctx.db
        .query("searchHistory")
        .withIndex("by_user", (x) => x.eq("userId", w.user._id))
        .order("desc")
        .take(80);
      const existing = recentRows.find((r) => r.chatId === chatId);
      if (existing) {
        await ctx.db.patch(existing._id, {
          query: q,
          resultCount,
          ...(title ? { title } : {}),
          ...(turnsJson !== undefined ? { turnsJson } : {}),
        });
        return { ok: true as const, message: "Kept." };
      }
    }

    await ctx.db.insert("searchHistory", {
      userId: w.user._id,
      query: q,
      type: "natural_language",
      resultCount,
      ...(chatId ? { chatId } : {}),
      ...(title ? { title } : {}),
      ...(turnsJson !== undefined ? { turnsJson } : {}),
    });
    return { ok: true as const, message: "Kept." };
  },
});

/**
 * Delete one chat from the person's own history (25 Nov). A chat is a search and the ones it was continued
 * from (the list shows them once), so every own row whose words start the chat's words goes. Only own rows.
 * 27 Nov 2026: a row with its own chat id is a chat of its own and goes only by that id - matching it by
 * words deleted "accountant" when "accountant colombo" was deleted. Words still match the older rows.
 */
export const remove = mutation({
  args: { query: v.string(), chatId: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const q = a.query.trim().slice(0, MAX_QUERY);
    const chatId = a.chatId?.trim().slice(0, 80) || undefined;
    if (!q && !chatId) return { ok: false as const, message: "Nothing to delete." };
    const rows = await ctx.db.query("searchHistory").withIndex("by_user", (x) => x.eq("userId", w.user._id)).order("desc").take(200);
    let n = 0;
    for (const r of rows) {
      if (r.chatId ? r.chatId === chatId : !!q && q.startsWith(r.query)) {
        await ctx.db.delete(r._id);
        n++;
      }
    }
    return { ok: true as const, message: n ? "Deleted." : "Already gone." };
  },
});

/**
 * The person's last 40 searches, newest first. 27 Nov 2026: without the saved turns (up to 250 KB each) -
 * the list re-sent every chat's whole conversation after each search; `turns` reads one chat when opened.
 */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const rows = await ctx.db.query("searchHistory").withIndex("by_user", (q) => q.eq("userId", w.user._id)).order("desc").take(40);
    return {
      ok: true as const,
      searches: rows.map((r) => ({
        id: r._id as string,
        chatId: r.chatId ?? null,
        title: r.title ?? null,
        query: r.query,
        count: r.resultCount,
        at: r._creationTime,
        saved: !!r.turnsJson,
      })),
    };
  },
});

/** One chat's saved conversation, read when the chat is opened. Own rows only. */
export const turns = query({
  args: { chatId: v.string() },
  handler: async (ctx, a) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const chatId = a.chatId.trim().slice(0, 80);
    const rows = await ctx.db.query("searchHistory").withIndex("by_user", (q) => q.eq("userId", w.user._id)).order("desc").take(80);
    const row = chatId ? rows.find((r) => r.chatId === chatId) : undefined;
    return { ok: true as const, turnsJson: row?.turnsJson ?? null };
  },
});
