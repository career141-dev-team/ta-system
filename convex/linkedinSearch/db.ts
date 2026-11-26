// What the LinkedIn Search engine remembers, on Convex tables (26 Nov 2026).
//
// The engine (engine.ts) speaks a `Store` interface; convex/ui/linkedinRun.ts
// implements it by calling these. Internal only: nothing here is reachable from
// a browser. Whole engine objects are kept as JSON text (`data`), so their shape
// can change without a schema change; only what is looked up is a column.

import { v } from "convex/values";
import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { profileLink } from "../../src/lib/url";
import { LIMITS } from "./crustdata";
import { normaliseUrl, personKey } from "./results";
import { savedMatchScore, poolKey, type SavedProfile, type SavedSearch } from "./store";
import type { ResultRow, SpendEntry, StandardForm } from "./types";

// ponytail: a free saved-people match reads the newest 2,000 people of the country.
// Move to the li_profiles vector search (README) when the saved pool outgrows that.
const MATCH_SCAN = 2_000;
const OPENING_SEARCHES = 100;
const OPENING_ROWS = 2_000;

const profileOf = (d: Doc<"liProfiles">): SavedProfile => ({ ...(JSON.parse(d.data) as SavedProfile), profileId: d._id as string });
const searchOf = (d: Doc<"liSearches">): SavedSearch => ({ ...(JSON.parse(d.data) as SavedSearch), ...(d.cancelRequested ? { cancelRequested: true } : {}) });
const countryKey = (c: string | null | undefined) => (c ?? "").trim().toLowerCase();

async function findDoc(ctx: QueryCtx, by: { crustdataId?: string | null; linkedinUrl?: string | null; name?: string; company?: string }) {
  const url = normaliseUrl(by.linkedinUrl ?? null);
  const name = by.name && by.company ? personKey(by.name, by.company) : null;
  const hit =
    (by.crustdataId ? await ctx.db.query("liProfiles").withIndex("by_cd", (q) => q.eq("crustdataId", by.crustdataId!)).first() : null) ??
    (url ? await ctx.db.query("liProfiles").withIndex("by_url", (q) => q.eq("urlKey", url)).first() : null) ??
    (name ? await ctx.db.query("liProfiles").withIndex("by_name", (q) => q.eq("nameKey", name)).first() : null);
  return hit;
}

export const findProfile = internalQuery({
  args: { crustdataId: v.optional(v.union(v.string(), v.null())), linkedinUrl: v.optional(v.union(v.string(), v.null())), name: v.optional(v.string()), company: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const d = await findDoc(ctx, a);
    return d ? JSON.stringify(profileOf(d)) : null;
  },
});

export const getProfile = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, a) => {
    const id = ctx.db.normalizeId("liProfiles", a.id);
    const d = id ? await ctx.db.get(id) : null;
    return d ? JSON.stringify(profileOf(d)) : null;
  },
});

export const upsertProfile = internalMutation({
  args: { row: v.string(), now: v.string() },
  handler: async (ctx, a): Promise<string> => {
    const r = JSON.parse(a.row) as ResultRow;
    const d = await findDoc(ctx, { crustdataId: r.crustdataId, linkedinUrl: r.linkedinUrl, name: r.name, company: r.currentCompany });
    const prev = d ? profileOf(d) : undefined;
    const area = { ...(prev?.areaYears ?? {}) };
    if (r.areaYears?.known) area["area"] = r.areaYears;
    // The newest non-blank value of each field wins; a blank never erases what was known.
    const p: SavedProfile = {
      profileId: (d?._id as string | undefined) ?? "",
      crustdataId: r.crustdataId ?? prev?.crustdataId ?? null,
      linkedinUrl: r.linkedinUrl ?? prev?.linkedinUrl ?? null,
      name: r.name || prev?.name || "",
      headline: r.headline || prev?.headline || "",
      currentTitle: r.currentTitle || prev?.currentTitle || "",
      currentCompany: r.currentCompany || prev?.currentCompany || "",
      city: r.city ?? prev?.city ?? null,
      country: r.country ?? prev?.country ?? null,
      totalYears: r.totalYears.known ? r.totalYears : prev?.totalYears ?? r.totalYears,
      areaYears: area,
      evidence: r.evidence.length ? r.evidence : prev?.evidence ?? [],
      qualificationWords: r.qualificationsInHeadline,
      dataDate: r.dataDate ?? prev?.dataDate ?? null,
      firstSeenAt: prev?.firstSeenAt ?? a.now,
      lastSeenAt: a.now,
      optedOut: false,
    };
    const fields = {
      crustdataId: p.crustdataId ?? undefined,
      urlKey: normaliseUrl(p.linkedinUrl) ?? undefined,
      nameKey: personKey(p.name, p.currentCompany) ?? undefined,
      country: countryKey(p.country),
      data: JSON.stringify(p),
    };
    if (d) {
      await ctx.db.patch(d._id, fields);
      return d._id as string;
    }
    return (await ctx.db.insert("liProfiles", fields)) as string;
  },
});

export const matchSaved = internalQuery({
  args: { form: v.string(), limit: v.number(), leaveOut: v.array(v.string()) },
  handler: async (ctx, a) => {
    const f = JSON.parse(a.form) as StandardForm;
    const country = countryKey(f.location.country);
    const rows = country
      ? await ctx.db.query("liProfiles").withIndex("by_country", (q) => q.eq("country", country)).order("desc").take(MATCH_SCAN)
      : await ctx.db.query("liProfiles").order("desc").take(MATCH_SCAN);
    const pool = await ctx.db.query("liPools").withIndex("by_role", (q) => q.eq("role", poolKey(f))).first();
    const inPool = new Set(pool?.profileIds ?? []);
    const out = new Set(a.leaveOut);
    const scored = rows
      .filter((d) => !out.has(d._id as string))
      .map((d) => {
        const p = profileOf(d);
        return { p, s: savedMatchScore(p, f), boost: inPool.has(p.profileId) ? 1 : 0 };
      })
      .filter((x) => x.s >= 0)
      .sort((x, y) => y.s + y.boost - (x.s + x.boost) || x.p.firstSeenAt.localeCompare(y.p.firstSeenAt));
    return JSON.stringify(scored.slice(0, a.limit).map((x) => x.p));
  },
});

export const saveSearch = internalMutation({
  args: { search: v.string() },
  handler: async (ctx, a) => {
    const s = JSON.parse(a.search) as SavedSearch;
    const d = await ctx.db.query("liSearches").withIndex("by_searchId", (q) => q.eq("searchId", s.searchId)).first();
    const fields = {
      searchId: s.searchId,
      formKey: s.formKey,
      userId: s.userId,
      openingId: s.openingId,
      parentSearchId: s.parentSearchId,
      state: s.state,
      startedAt: s.startedAt,
      cancelRequested: s.cancelRequested || d?.cancelRequested || undefined,
      data: a.search,
    };
    if (d) await ctx.db.patch(d._id, fields);
    else await ctx.db.insert("liSearches", fields);
    if (s.state !== "done") return;
    if (await ctx.db.query("liSeen").withIndex("by_search", (q) => q.eq("searchId", s.searchId)).first()) return;
    for (const r of s.results) if (!r.hidden) await ctx.db.insert("liSeen", { profileId: r.profileId, searchId: s.searchId });
  },
});

export const getSearch = internalQuery({
  args: { searchId: v.string() },
  handler: async (ctx, a) => {
    const d = await ctx.db.query("liSearches").withIndex("by_searchId", (q) => q.eq("searchId", a.searchId)).first();
    return d ? JSON.stringify(searchOf(d)) : null;
  },
});

export const doneByFormKey = internalQuery({
  args: { formKey: v.string() },
  handler: async (ctx, a) => {
    const rows = await ctx.db.query("liSearches").withIndex("by_formKey", (q) => q.eq("formKey", a.formKey).eq("state", "done")).order("desc").take(20);
    const d = rows.find((r) => !r.parentSearchId);
    return d ? JSON.stringify(searchOf(d)) : null;
  },
});

export const searchesForOpening = internalQuery({
  args: { openingId: v.string() },
  handler: async (ctx, a) => {
    const rows = await ctx.db.query("liSearches").withIndex("by_opening", (q) => q.eq("openingId", a.openingId)).order("desc").take(OPENING_SEARCHES);
    return JSON.stringify(rows.reverse().map(searchOf));
  },
});

/** Everyone already shown in a search's chain (it, its parents and their follow-ups) and in the opening. */
export const shownProfileIds = internalQuery({
  args: { searchId: v.optional(v.string()), openingId: v.optional(v.string()) },
  handler: async (ctx, a): Promise<string[]> => {
    const ids = new Set<string>();
    const add = (d: Doc<"liSearches">) => { for (const r of searchOf(d).results) ids.add(r.profileId); };
    const done = new Set<string>();
    const todo = a.searchId ? [a.searchId] : [];
    while (todo.length && done.size < 50) {
      const sid = todo.pop()!;
      if (done.has(sid)) continue;
      done.add(sid);
      const d = await ctx.db.query("liSearches").withIndex("by_searchId", (q) => q.eq("searchId", sid)).first();
      if (d) {
        add(d);
        if (d.parentSearchId) todo.push(d.parentSearchId);
      }
      for (const c of await ctx.db.query("liSearches").withIndex("by_parent", (q) => q.eq("parentSearchId", sid)).take(20)) todo.push(c.searchId);
    }
    if (a.openingId) {
      for (const d of await ctx.db.query("liSearches").withIndex("by_opening", (q) => q.eq("openingId", a.openingId)).order("desc").take(OPENING_SEARCHES)) add(d);
    }
    return [...ids];
  },
});

export const seenBefore = internalQuery({
  args: { profileId: v.string(), except: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const seen = await ctx.db.query("liSeen").withIndex("by_profile", (q) => q.eq("profileId", a.profileId)).order("desc").take(10);
    const out: { searchId: string; by: string; at: string; openingId?: string }[] = [];
    for (const s of seen.reverse()) {
      if (s.searchId === a.except) continue;
      const d = await ctx.db.query("liSearches").withIndex("by_searchId", (q) => q.eq("searchId", s.searchId)).first();
      if (!d) continue;
      const user = ctx.db.normalizeId("users", d.userId);
      const name = user ? (await ctx.db.get(user))?.fullName : undefined;
      out.push({ searchId: d.searchId, by: name ?? "a teammate", at: d.startedAt, openingId: d.openingId });
    }
    return out;
  },
});

// ─── What the Excel Tables already know (the TAs' feedback) ─────────────────

async function nameOf(ctx: QueryCtx, id: Id<"users">) {
  return (await ctx.db.get(id))?.fullName ?? "a teammate";
}
const rowsForUrl = (ctx: QueryCtx, url: string) =>
  ctx.db.query("linkVault").withIndex("by_url", (q) => q.eq("linkedinUrl", profileLink(url)?.url ?? url)).take(20);

export const heldBy = internalQuery({
  args: { url: v.string() },
  handler: async (ctx, a) => {
    const row = (await rowsForUrl(ctx, a.url)).sort((x, y) => x.createdAt - y.createdAt)[0];
    return row ? await nameOf(ctx, row.addedBy) : null;
  },
});

export const addedToOpening = internalQuery({
  args: { openingId: v.string() },
  handler: async (ctx, a) => {
    const id = ctx.db.normalizeId("jobs", a.openingId);
    if (!id) return [];
    const rows = await ctx.db.query("linkVault").withIndex("by_opening", (q) => q.eq("openingId", id)).order("desc").take(OPENING_ROWS);
    const names = new Map<string, string>();
    for (const r of rows) if (!names.has(r.addedBy)) names.set(r.addedBy, await nameOf(ctx, r.addedBy));
    return rows.map((r) => ({ linkedinUrl: r.linkedinUrl, by: names.get(r.addedBy)!, at: new Date(r.createdAt).toISOString() }));
  },
});

/** A person marked "declined" on any Excel Table row is shown as declined in new searches. */
export const declinedRows = internalQuery({
  args: { profileId: v.string() },
  handler: async (ctx, a) => {
    const id = ctx.db.normalizeId("liProfiles", a.profileId);
    const p = id ? await ctx.db.get(id) : null;
    const url = p ? profileOf(p).linkedinUrl : null;
    if (!url) return [];
    return (await rowsForUrl(ctx, url))
      .filter((r) => r.outcome === "declined")
      .map((r) => ({ profileId: a.profileId, openingId: r.openingId as string, outcome: "declined" as const, at: new Date(r.outcomeAt ?? r.createdAt).toISOString() }));
  },
});

// ─── Money, pools, the AI cache, the rate gate ──────────────────────────────

export const logSpend = internalMutation({
  args: { entry: v.string() },
  handler: async (ctx, a) => {
    const e = JSON.parse(a.entry) as SpendEntry;
    await ctx.db.insert("liSpend", { userId: e.userId, openingId: e.openingId, kind: e.kind, credits: e.credits, usd: e.usd, crustdataRef: e.crustdataRef, createdAt: e.createdAt, data: a.entry });
  },
});

export const hasSpend = internalQuery({
  args: { ref: v.string(), kind: v.string() },
  handler: async (ctx, a) => !!(await ctx.db.query("liSpend").withIndex("by_ref", (q) => q.eq("crustdataRef", a.ref).eq("kind", a.kind)).first()),
});

export const spend = internalQuery({
  args: { since: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const rows = await ctx.db.query("liSpend").withIndex("by_createdAt", (q) => q.gte("createdAt", a.since ?? "")).order("desc").take(5_000);
    return JSON.stringify(rows.map((r) => JSON.parse(r.data) as SpendEntry));
  },
});

export const getPool = internalQuery({
  args: { role: v.string() },
  handler: async (ctx, a) => {
    const d = await ctx.db.query("liPools").withIndex("by_role", (q) => q.eq("role", a.role)).first();
    return d ? { role: d.role, profileIds: d.profileIds, refreshedAt: d.refreshedAt } : null;
  },
});

export const savePool = internalMutation({
  args: { role: v.string(), profileIds: v.array(v.string()), now: v.string() },
  handler: async (ctx, a) => {
    const fields = { role: a.role, profileIds: [...new Set(a.profileIds)].slice(-1_000), refreshedAt: a.now };
    const d = await ctx.db.query("liPools").withIndex("by_role", (q) => q.eq("role", a.role)).first();
    if (d) await ctx.db.patch(d._id, fields);
    else await ctx.db.insert("liPools", fields);
  },
});

/** Opt-out: the person's saved record and sightings go. */
export const optOut = internalMutation({
  args: { profileId: v.string() },
  handler: async (ctx, a) => {
    const id = ctx.db.normalizeId("liProfiles", a.profileId);
    if (!id || !(await ctx.db.get(id))) return;
    await ctx.db.delete(id);
    for (const s of await ctx.db.query("liSeen").withIndex("by_profile", (q) => q.eq("profileId", a.profileId)).collect()) await ctx.db.delete(s._id);
  },
});

export const cacheGet = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, a) => (await ctx.db.query("liCache").withIndex("by_key", (q) => q.eq("key", a.key)).first())?.value ?? null,
});

export const cacheSet = internalMutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, a) => {
    if (!(await ctx.db.query("liCache").withIndex("by_key", (q) => q.eq("key", a.key)).first())) await ctx.db.insert("liCache", a);
  },
});

/** One team queue for Crustdata: 0 = go now (and the call is counted), otherwise milliseconds to wait. */
export const acquire = internalMutation({
  args: { bucket: v.union(v.literal("agent_start"), v.literal("person_search"), v.literal("read")) },
  handler: async (ctx, a): Promise<number> => {
    const now = Date.now();
    const old = await ctx.db.query("liGate").withIndex("by_bucket_at", (q) => q.eq("bucket", a.bucket).lt("at", now - 60_000)).take(50);
    for (const o of old) await ctx.db.delete(o._id);
    const live = await ctx.db.query("liGate").withIndex("by_bucket_at", (q) => q.eq("bucket", a.bucket).gte("at", now - 60_000)).take(LIMITS[a.bucket]);
    if (live.length >= LIMITS[a.bucket]) return 60_000 - (now - live[0].at) + 50;
    await ctx.db.insert("liGate", { bucket: a.bucket, at: now });
    return 0;
  },
});
