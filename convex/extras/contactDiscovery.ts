/**
 * Contact discovery for the Brevo clone (9 Nov): Extras' sales list, for any role.
 *
 * 1. `read`: one model call turns "Find all Junior Developers" into a rule
 *    (convex/lib/contactRule.ts); without a model the words make the rule.
 *    Nothing is searched yet: Brevo shows the rule and a person presses Run.
 * 2. `start` + `scan`: every candidate is read in pages, as Extras does, and
 *    kept when the rule matches - no model per person. One search runs at a
 *    time, the action reschedules itself, so the TA backend's six concurrent
 *    actions are never taken (the 6 Oct incident).
 * 3. The meaning pass: Qdrant's nearest people to the rule, kept only when the
 *    rule's level and exclude words allow, and labelled "found by meaning" so
 *    they never mix silently with title matches.
 *
 * Merged duplicates, do-not-contact people and people without a usable email
 * never reach a row. Nothing here writes to `candidates` or sends anything.
 * Rows are personal data, so a search and its rows go after seven days.
 */
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getModelForTask, getOpenAI } from "../lib/llm";
import { LEVEL_LABEL } from "../lib/roleLevel";
import { queryCandidateVectors } from "../lib/qdrant";
import { embedText } from "../matching/agent2";
import {
  currentLevel, isMiss, matchCandidate, norm, RULE_PROMPT, ruleFromWords, sanitizeRule, usableEmail,
  type ContactRule,
} from "../lib/contactRule";

/** The reasons a candidate is not on the list. Every scanned person lands in exactly one, or on the list. */
type LeftOut = "not_contactable" | "other_job" | "level" | "skills" | "no_email" | "same_email";
const NONE_LEFT: Record<LeftOut, number> = { not_contactable: 0, other_job: 0, level: 0, skills: 0, no_email: 0, same_email: 0 };

const PAGE = 100; // candidates carry big fields; a small page keeps each read well under the limit
const PAGES_PER_RUN = 15;
const STALE_MS = 10 * 60_000; // a run with no progress for this long is dead
const KEEP_MS = 7 * 24 * 60 * 60_000;
const MEANING_FLOOR = 0.6; // cosine; below this a "nearest" person is noise
const MEANING_LIMIT = 1000;

// Not in the checked-in _generated/api yet, so referenced by name.
const ref = {
  create: makeFunctionReference<"mutation">("extras/contactDiscovery:create"),
  scanPage: makeFunctionReference<"mutation">("extras/contactDiscovery:scanPage"),
  addMeaning: makeFunctionReference<"mutation">("extras/contactDiscovery:addMeaning"),
  finish: makeFunctionReference<"mutation">("extras/contactDiscovery:finish"),
  scan: makeFunctionReference<"action">("extras/contactDiscovery:scan"),
  purge: makeFunctionReference<"mutation">("extras/contactDiscovery:purge"),
  get: makeFunctionReference<"query">("extras/contactDiscovery:getSearch"),
};

/** The model's reading, or null when there is no model or its answer is unusable. */
async function readWithModel(query: string): Promise<ContactRule | null> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.OPENROUTER_API_KEYS && !process.env.ANTHROPIC_API_KEY) return null;
  try {
    const res = await getOpenAI("jd_extraction", 20_000).chat.completions.create({
      model: getModelForTask("jd_extraction"),
      temperature: 0.1,
      max_tokens: 900,
      messages: [{ role: "system", content: RULE_PROMPT }, { role: "user", content: query }],
      response_format: { type: "json_object" },
    });
    const rule = sanitizeRule(JSON.parse(res.choices[0]?.message?.content ?? "{}"));
    return "error" in rule ? null : rule;
  } catch (e) {
    console.warn("[contactDiscovery] model reading failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Step 1: read the request into a rule and keep it. Returns what Brevo shows. */
export const read = internalAction({
  args: { query: v.string(), requestedBy: v.string() },
  handler: async (ctx, { query, requestedBy }): Promise<{ id: string; rule: ContactRule; readBy: "model" | "words" }> => {
    const model = await readWithModel(query);
    const rule = model ?? ruleFromWords(query);
    if ("error" in rule) throw new Error("That request names no job to look for. Try “Find all Sales Managers”.");
    const readBy = model ? "model" : "words";
    const id: string = await ctx.runMutation(ref.create, { query, requestedBy, rule, readBy });
    return { id, rule, readBy };
  },
});

export const create = internalMutation({
  args: { query: v.string(), requestedBy: v.string(), rule: v.any(), readBy: v.union(v.literal("model"), v.literal("words")) },
  handler: async (ctx, a) => {
    const id = await ctx.db.insert("contactSearches", { ...a, status: "read", scanned: 0, found: 0, createdAt: Date.now() });
    await ctx.scheduler.runAfter(0, ref.purge, {});
    return String(id);
  },
});

const isLive = (s: Doc<"contactSearches">) => s.status === "running" && Date.now() - (s.progressAt ?? 0) < STALE_MS;

/** Step 2: the person pressed Run, with the rule as shown or as they edited it. */
export const start = internalMutation({
  args: { id: v.string(), rule: v.optional(v.any()) },
  handler: async (ctx, { id, rule }): Promise<{ ok: true } | { ok: false; status: number; error: string }> => {
    const sid = ctx.db.normalizeId("contactSearches", id);
    const search = sid ? await ctx.db.get(sid) : null;
    if (!search) return { ok: false, status: 404, error: "No such search." };
    if (search.status !== "read") return { ok: false, status: 409, error: "This search has already been run. Start a new one to change it." };
    let checked = search.rule as ContactRule;
    if (rule !== undefined) {
      const r = sanitizeRule(rule);
      if ("error" in r) return { ok: false, status: 400, error: r.error };
      checked = r;
    }
    const running = await ctx.db.query("contactSearches").withIndex("by_status", (q) => q.eq("status", "running")).collect();
    if (running.some(isLive)) return { ok: false, status: 409, error: "Another search is running. Try again in a few minutes." };
    const now = Date.now();
    await ctx.db.patch(search._id, { rule: checked, status: "running", cursor: null, startedAt: now, progressAt: now });
    await ctx.scheduler.runAfter(0, ref.scan, { id });
    return { ok: true };
  },
});

const KIND_RANK = { current: 0, previous: 1, meaning: 2 } as const;
type Kind = keyof typeof KIND_RANK;

/** One row per email: a title match beats a meaning match, a current role beats a past one. */
async function keep(ctx: MutationCtx, searchId: Id<"contactSearches">, c: Doc<"candidates">, email: string, m: { kind: Kind; title: string; levelLabel: string; matchedBy: string }) {
  const existing = await ctx.db.query("contactSearchRows")
    .withIndex("by_search_email", (q) => q.eq("searchId", searchId).eq("email", email)).first();
  if (existing && KIND_RANK[existing.kind] <= KIND_RANK[m.kind]) return 0;
  const history = (c.jobHistory ?? []).map((j) => [j.title, j.company].filter(Boolean).join(" at ")).filter(Boolean);
  const row = {
    searchId, candidateId: c._id, email,
    name: (c.fullName ?? "").trim() || "(no name)",
    phone: c.phone?.trim() || undefined,
    title: m.title,
    level: m.levelLabel,
    employer: c.currentEmployer?.trim() || undefined,
    linkedinUrl: c.linkedinUrl?.trim() || undefined,
    experienceYears: c.totalExperienceYears,
    skills: (c.skills ?? []).slice(0, 15).join(", ") || undefined,
    previousRole: (history[1] ?? c.pastJobTitles?.[1])?.trim() || undefined,
    sector: c.sector?.trim() || undefined,
    location: c.location?.trim() || undefined,
    kind: m.kind,
    matchedBy: m.matchedBy,
  };
  if (existing) { await ctx.db.replace(existing._id, row); return 0; }
  await ctx.db.insert("contactSearchRows", row);
  return 1;
}

const reachable = (c: Doc<"candidates">) => !c.mergedInto && !c.isDuplicateOf && !c.doNotContact;

export const scanPage = internalMutation({
  args: { id: v.id("contactSearches") },
  handler: async (ctx, { id }) => {
    const search = await ctx.db.get(id);
    if (!search || search.status !== "running") return { isDone: true, stopped: true };
    const rule = search.rule as ContactRule;
    const res = await ctx.db.query("candidates").paginate({ numItems: PAGE, cursor: search.cursor ?? null });
    let added = 0;
    // Why the others were left out, so a short list explains itself (10 Nov).
    const left: Record<LeftOut, number> = { ...NONE_LEFT, ...(search.leftOut ?? {}) };
    for (const c of res.page) {
      if (!reachable(c)) { left.not_contactable++; continue; }
      const m = matchCandidate(c as any, rule);
      if (isMiss(m)) { left[m.miss]++; continue; }
      const email = usableEmail(c.email);
      if (!email) { left.no_email++; continue; }
      const kept = await keep(ctx, id, c, email, { ...m, matchedBy: `${m.kind === "current" ? "current title" : "previous title"}: ${m.matchedBy}` });
      if (!kept) left.same_email++;
      added += kept;
    }
    await ctx.db.patch(id, {
      cursor: res.continueCursor, scanned: search.scanned + res.page.length, found: search.found + added, progressAt: Date.now(),
      leftOut: left,
    });
    return { isDone: res.isDone, stopped: false };
  },
});

/** The meaning pass: people Qdrant puts near the rule that no title caught. */
export const addMeaning = internalMutation({
  args: { id: v.id("contactSearches"), hits: v.array(v.object({ candidateId: v.string(), score: v.number() })) },
  handler: async (ctx, { id, hits }) => {
    const search = await ctx.db.get(id);
    if (!search || search.status !== "running") return 0;
    const rule = search.rule as ContactRule;
    let added = 0;
    for (const h of hits) {
      const cid = ctx.db.normalizeId("candidates", h.candidateId);
      const c = cid ? await ctx.db.get(cid) : null;
      if (!c || !reachable(c)) continue;
      const email = usableEmail(c.email);
      const title = (c.currentJobTitle ?? c.currentTitle ?? "").trim();
      if (!email || !title) continue;
      const t = norm(title);
      if (rule.exclude.some((w) => t.includes(` ${w} `))) continue;
      // The same level rule as the title scan; an unknown level is let through and says so.
      const level = currentLevel(c as any, title);
      if (rule.levels.length && level != null && !rule.levels.includes(level)) continue;
      added += await keep(ctx, id, c, email, {
        kind: "meaning", title, levelLabel: level == null ? "Not known" : LEVEL_LABEL[level] ?? "Not known", matchedBy: `found by meaning (${h.score.toFixed(2)}), check`,
      });
    }
    await ctx.db.patch(id, { found: search.found + added, progressAt: Date.now() });
    return added;
  },
});

export const finish = internalMutation({
  args: { id: v.id("contactSearches"), error: v.optional(v.string()), meaning: v.optional(v.string()) },
  handler: async (ctx, { id, error, meaning }) => {
    const search = await ctx.db.get(id);
    if (!search || search.status !== "running") return;
    await ctx.db.patch(id, { status: error ? "failed" : "done", error, meaning, finishedAt: Date.now() });
  },
});

export const getSearch = internalQuery({
  args: { id: v.id("contactSearches") },
  handler: (ctx, { id }) => ctx.db.get(id),
});

export const scan = internalAction({
  args: { id: v.string() },
  handler: async (ctx, { id: raw }) => {
    const id = raw as Id<"contactSearches">;
    try {
      for (let i = 0; i < PAGES_PER_RUN; i++) {
        const r = await ctx.runMutation(ref.scanPage, { id });
        if (r.stopped) return;
        if (r.isDone) {
          let meaning: string;
          try {
            const search = await ctx.runQuery(ref.get, { id });
            const rule = search.rule as ContactRule;
            const { embedding } = await embedText(`${rule.label}. ${rule.titles.join(", ")}`, "query");
            const hits = (await queryCandidateVectors(embedding, { limit: MEANING_LIMIT }))
              .filter((h) => h.score >= MEANING_FLOOR)
              .map((h) => ({ candidateId: h.candidateId, score: h.score }));
            let added = 0;
            for (let j = 0; j < hits.length; j += 100) added += await ctx.runMutation(ref.addMeaning, { id, hits: hits.slice(j, j + 100) });
            meaning = `${added} more found by meaning`;
          } catch (e) {
            // The title scan is the list; the meaning pass only adds to it.
            meaning = `The meaning search could not run (${e instanceof Error ? e.message.slice(0, 120) : "unknown"}), so only title matches are listed.`;
          }
          await ctx.runMutation(ref.finish, { id, meaning });
          return;
        }
      }
      await ctx.scheduler.runAfter(0, ref.scan, { id: raw });
    } catch (e) {
      await ctx.runMutation(ref.finish, { id, error: e instanceof Error ? e.message.slice(0, 200) : "The search stopped." });
    }
  },
});

/** What Brevo reads while it waits. A run that stopped moving says so. */
export const status = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const sid = ctx.db.normalizeId("contactSearches", id);
    const s = sid ? await ctx.db.get(sid) : null;
    if (!s) return null;
    const stalled = s.status === "running" && !isLive(s);
    return {
      id, query: s.query, requestedBy: s.requestedBy, rule: s.rule, readBy: s.readBy,
      status: stalled ? "failed" : s.status,
      error: stalled ? "The search stopped moving. Start a new one." : s.error ?? null,
      scanned: s.scanned, found: s.found, meaning: s.meaning ?? null,
      // Searches run before 10 Nov have no counts; null says "not counted", never zero.
      leftOut: s.leftOut ?? null,
      createdAt: s.createdAt, startedAt: s.startedAt ?? null, finishedAt: s.finishedAt ?? null,
    };
  },
});

export const rows = internalQuery({
  args: { id: v.string(), cursor: v.union(v.string(), v.null()), limit: v.number() },
  handler: async (ctx, { id, cursor, limit }) => {
    const sid = ctx.db.normalizeId("contactSearches", id);
    if (!sid) return null;
    const res = await ctx.db.query("contactSearchRows").withIndex("by_search", (q) => q.eq("searchId", sid))
      .paginate({ cursor, numItems: Math.min(Math.max(1, limit), 500) });
    return {
      rows: res.page.map(({ _id, _creationTime, searchId, candidateId, ...row }) => row),
      nextCursor: res.isDone ? null : res.continueCursor,
    };
  },
});

/** A download is a bulk export of personal data; the search row counts them. */
export const markExport = internalMutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const sid = ctx.db.normalizeId("contactSearches", id);
    const s = sid ? await ctx.db.get(sid) : null;
    if (s) await ctx.db.patch(s._id, { exports: (s.exports ?? 0) + 1 });
  },
});

/** Searches older than seven days go, rows first, a thousand at a time. */
export const purge = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db.query("contactSearches").withIndex("by_createdAt", (q) => q.lt("createdAt", Date.now() - KEEP_MS)).first();
    if (!old || isLive(old)) return;
    const batch = await ctx.db.query("contactSearchRows").withIndex("by_search", (q) => q.eq("searchId", old._id)).take(1000);
    for (const r of batch) await ctx.db.delete(r._id);
    if (batch.length < 1000) await ctx.db.delete(old._id);
    await ctx.scheduler.runAfter(0, ref.purge, {});
  },
});
