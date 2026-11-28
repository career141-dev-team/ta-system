// convex/ui/searches.ts
//
// The new UI's Database chat writes down each search it ran (Part 3 of Ask AURA,
// 20 Nov 2026), so "how many searches have I done today?" has a real answer and
// the chat's history is the person's own past searches, on any computer. Uses the
// searchHistory table, which nothing wrote before. Own rows only, bounded.

import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { who } from "./day";

const MAX_QUERY = 2000;
const MAX_TITLE = 120;
const MAX_TURNS_JSON = 250_000;
const MAX_NAME = 80;
const MAX_GUIDE = 2000;
const MAX_PROJECTS = 50;

/** One of this person's own projects, or null (a made-up or someone else's id is never used). */
async function ownProject(ctx: QueryCtx, userId: Id<"users">, raw?: string | null) {
  const id = raw ? ctx.db.normalizeId("searchProjects", raw) : null;
  const p = id ? await ctx.db.get(id) : null;
  return p && p.userId === userId ? p : null;
}

export const record = mutation({
  args: {
    query: v.string(),
    count: v.number(),
    chatId: v.optional(v.string()),
    title: v.optional(v.string()),
    turnsJson: v.optional(v.string()),
    projectId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    // A new chat started inside a project files itself there; a project that is not theirs is ignored.
    const project = a.projectId ? await ownProject(ctx, w.user._id, a.projectId) : null;
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
          ...(project && !existing.projectId ? { projectId: project._id } : {}),
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
      ...(project ? { projectId: project._id } : {}),
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
        projectId: (r.projectId as string | undefined) ?? null,
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

// Projects (owner 28 Nov 2026, like ChatGPT Projects): a folder of search chats for one
// position, with guidelines that every search inside it keeps. Own projects only.

/** The person's projects, newest first. */
export const projects = query({
  args: {},
  handler: async (ctx) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const rows = await ctx.db.query("searchProjects").withIndex("by_user", (q) => q.eq("userId", w.user._id)).order("desc").take(MAX_PROJECTS);
    return { ok: true as const, projects: rows.map((p) => ({ id: p._id as string, name: p.name, guide: p.guide ?? "", at: p.at })) };
  },
});

/** Make a project, or rename it / change its guidelines (with an id). */
export const saveProject = mutation({
  args: { id: v.optional(v.string()), name: v.string(), guide: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const name = a.name.trim().slice(0, MAX_NAME);
    if (!name) return { ok: false as const, message: "Give the project a name." };
    const guide = a.guide === undefined ? undefined : a.guide.trim().slice(0, MAX_GUIDE);
    if (a.id) {
      const p = await ownProject(ctx, w.user._id, a.id);
      if (!p) return { ok: false as const, message: "That project is gone." };
      await ctx.db.patch(p._id, { name, ...(guide !== undefined ? { guide } : {}) });
      return { ok: true as const, id: p._id as string, message: "Saved." };
    }
    const have = await ctx.db.query("searchProjects").withIndex("by_user", (q) => q.eq("userId", w.user._id)).take(MAX_PROJECTS);
    if (have.length >= MAX_PROJECTS) return { ok: false as const, message: `You have ${MAX_PROJECTS} projects. Delete one first.` };
    const id = await ctx.db.insert("searchProjects", { userId: w.user._id, name, ...(guide ? { guide } : {}), at: Date.now() });
    return { ok: true as const, id: id as string, message: "Project made." };
  },
});

/** Delete a project. Its chats are kept and go back to the history list. */
export const removeProject = mutation({
  args: { id: v.string() },
  handler: async (ctx, a) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const p = await ownProject(ctx, w.user._id, a.id);
    if (!p) return { ok: true as const, message: "Already gone." };
    const rows = await ctx.db.query("searchHistory").withIndex("by_user", (q) => q.eq("userId", w.user._id)).order("desc").take(200);
    for (const r of rows) if (r.projectId === p._id) await ctx.db.patch(r._id, { projectId: undefined });
    await ctx.db.delete(p._id);
    return { ok: true as const, message: "Project deleted. Its chats are back in your history." };
  },
});

/** Move one of the person's chats into a project, or out of it (no projectId). */
export const moveChat = mutation({
  args: { chatId: v.string(), projectId: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const w = await who(ctx);
    if (!w.ok) return w;
    const chatId = a.chatId.trim().slice(0, 80);
    const project = a.projectId ? await ownProject(ctx, w.user._id, a.projectId) : null;
    if (a.projectId && !project) return { ok: false as const, message: "That project is gone." };
    const rows = await ctx.db.query("searchHistory").withIndex("by_user", (q) => q.eq("userId", w.user._id)).order("desc").take(80);
    const row = chatId ? rows.find((r) => r.chatId === chatId) : undefined;
    if (!row) return { ok: false as const, message: "Run a search in this chat first, then move it." };
    await ctx.db.patch(row._id, { projectId: project?._id });
    return { ok: true as const, message: project ? `Moved to ${project.name}.` : "Moved back to your history." };
  },
});
