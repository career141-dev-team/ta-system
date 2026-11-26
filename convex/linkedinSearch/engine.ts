/**
 * engine.ts — one call per TA action (Full Plan v1.2, sections 2, 5 and 6).
 *
 *   search(request, ctx)  → form + free check (stop if questions) → market count when needed →
 *                           same form reused ($0) → saved people first (free) → Agent Search for the gap →
 *                           gap fill → checks → learning → always 30 (top-up by normal search) → save.
 *   showMore, findOnePerson, refine, widen, cancel, spendReport, priceWatch.
 *
 * Every outside thing comes in through `EngineDeps`.
 */
import type { CheckQuestion, CheckResult, Llm, ResultRow, SearchRequest, Settings, SpendEntry, StandardForm } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { extractForm, formKey, refineForm, widenForm } from "./form";
import { checkForm } from "./check";
import { agentQuery, BASIC_FIELDS, COMPANY_FIELDS, findOneBody, normalSearchBody, refetchBody } from "./query";
import type { AgentRun, CrustdataClient, SpendEvent } from "./crustdata";
import { CrustdataError } from "./crustdata";
import {
  agentWarnings, blanks, capPerCompany, checkRow, companySpread, fillFrom, hideClientStaff, locationCheck, normaliseUrl,
  personKey, rank, removeRepeats, rowFromProfile, rowsFromAgentRead, type CompanySpread,
} from "./results";
import { poolKey, rowFromSaved, type SavedSearch, type Store } from "./store";

export type EngineDeps = {
  crustdata: Pick<CrustdataClient, "runAgent" | "personSearch" | "count" | "cancelAgent">;
  store: Store;
  llm?: Llm;
  settings?: Partial<Settings>;
  now?: () => Date;
  newId?: () => string;
};

export type SearchContext = {
  userId: string;
  openingId?: string;
  /** Question codes the TA answered "keep as is". */
  accepted?: CheckQuestion["code"][];
  /** The TA has seen the market count (or does not want it). */
  marketCountSeen?: boolean;
  maxPerCompany?: number | null;
  onProgress?: (e: { stage: string; detail?: string }) => void;
  /** Internal: refine / show-more parent. */
  parentSearchId?: string;
  /** Internal: show more leaves out everyone already shown; refine hides people already judged. */
  leaveOutShown?: boolean;
  hideJudged?: boolean;
};

export type SearchOutcome =
  | { status: "questions"; form: StandardForm; check: CheckResult }
  | { status: "market_count"; form: StandardForm; check: CheckResult; marketCount: number | null }
  | {
      status: "done" | "cancelled" | "failed";
      searchId: string;
      form: StandardForm;
      check: CheckResult;
      engine: SavedSearch["engine"];
      rows: ResultRow[];
      visible: number;
      warnings: string[];
      spread: CompanySpread;
      credits: number;
      usd: number;
      changed?: string[];
      error?: string;
    };

/** Spend events from the client → liSpend rows. Pass as `onSpend` when creating the client. */
export function spendToStore(store: Store, now: () => Date = () => new Date()) {
  return async (e: SpendEvent) => {
    const m = (e.meta ?? {}) as { userId?: string; searchId?: string; openingId?: string };
    // A charge is logged once, even when two actions read the same search (no credit header).
    if (e.kind === "agent" && (await store.hasSpend(e.crustdataRef, e.kind))) return;
    const entry: SpendEntry = {
      userId: m.userId ?? "unknown",
      searchId: m.searchId,
      openingId: m.openingId,
      kind: e.kind,
      credits: e.credits,
      usd: e.usd,
      crustdataRef: e.crustdataRef,
      createdAt: now().toISOString(),
    };
    await store.logSpend(entry);
  };
}

export function createEngine(deps: EngineDeps) {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(deps.settings ?? {}) };
  const now = deps.now ?? (() => new Date());
  let seq = 0;
  const newId = deps.newId ?? (() => `s${Date.now().toString(36)}${(++seq).toString(36)}`);
  const running = new Map<string, { cancelled: boolean; crustdataSearchId?: string }>();
  const cd = deps.crustdata;
  const store = deps.store;
  const progress = (ctx: SearchContext, stage: string, detail?: string) => ctx.onProgress?.({ stage, detail });
  const usd = (c: number) => Math.round(c * settings.creditPriceUSD * 100) / 100;

  /** Learning, seen-before and held-by, on every row (section 6). */
  async function applyHistory(rows: ResultRow[], ctx: SearchContext, searchId: string, f: StandardForm): Promise<void> {
    const t = now().getTime();
    // Titles of people marked not relevant / rejected for this opening ("lower similar people").
    const rejectedTitles = new Set<string>();
    const titleKey = (x: string) => x.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
    // People already added to this opening's table (TAs shortlist by adding; they do not mark).
    const added = new Map<string, { by: string; at: string }>();
    if (ctx.openingId) for (const a of await store.addedToOpening(ctx.openingId)) added.set(normaliseUrl(a.linkedinUrl) ?? "", a);
    if (ctx.openingId) {
      for (const s of await store.searchesForOpening(ctx.openingId)) {
        for (const res of s.results) {
          const p = await store.getProfile(res.profileId);
          if (!p) continue;
          const m = (await store.marksFor(p.profileId)).filter((x) => x.openingId === ctx.openingId).slice(-1)[0];
          const o = (await store.outcomesFor(p.profileId)).some((x) => x.openingId === ctx.openingId && /rejected/.test(x.outcome));
          if ((m?.verdict === "not_relevant" || o) && p.currentTitle) rejectedTitles.add(titleKey(p.currentTitle));
        }
      }
      // A person rejected with the searched title is about that person, not the title: never lower the target role.
      for (const t of [f.role, ...f.titles]) rejectedTitles.delete(titleKey(t));
    }
    for (const r of rows) {
      const p = await store.findProfile({ crustdataId: r.crustdataId, linkedinUrl: r.linkedinUrl, name: r.name, company: r.currentCompany });
      if (r.currentTitle && rejectedTitles.has(titleKey(r.currentTitle))) {
        r.flags.similarToRejected = true;
        r.warnings.push("Same title as someone marked not relevant for this opening — moved lower.");
      }
      const inThis = added.get(normaliseUrl(r.linkedinUrl) ?? "-");
      if (inThis && !r.hidden) {
        r.hidden = true;
        r.hiddenReason = `Already added to this opening's table by ${inThis.by} on ${inThis.at.slice(0, 10)}.`;
      }
      const held = inThis ? null : await store.heldBy(r.linkedinUrl);
      if (held) {
        r.flags.heldBy = held;
        r.warnings.push(`Already in an Excel Table, held by ${held}.`);
      }
      if (!p) continue;
      const seen = await store.seenBefore(p.profileId, searchId);
      if (seen.length) {
        r.flags.seenBefore = true;
        r.seenBefore = seen;
        const last = seen[seen.length - 1];
        r.warnings.push(`Seen before: found ${last.at.slice(0, 10)} by ${last.by}${last.verdict ? `, marked ${last.verdict.replace("_", " ")}` : ""}.`);
      }
      for (const o of await store.outcomesFor(p.profileId)) {
        const days = (t - new Date(o.at).getTime()) / 86_400_000;
        if (o.outcome === "declined") {
          r.flags.declined = days < settings.declinedHideDays;
          r.warnings.push(`Declined on ${o.at.slice(0, 10)}.`);
        } else if (o.outcome === "unreachable") {
          r.flags.unreachable = true;
          r.warnings.push(`Marked unreachable on ${o.at.slice(0, 10)}.`);
        } else if ((o.outcome === "rejected_by_director" || o.outcome === "rejected_by_client") && ctx.openingId && o.openingId === ctx.openingId) {
          r.hidden = true;
          r.hiddenReason = `${o.outcome === "rejected_by_client" ? "Client" : "Director"} rejected for this opening.`;
        }
      }
      if (ctx.openingId) {
        const m = (await store.marksFor(p.profileId)).filter((x) => x.openingId === ctx.openingId).slice(-1)[0];
        if (m?.verdict === "not_relevant" && !r.hidden) {
          r.hidden = true;
          r.hiddenReason = `Marked not relevant for this opening on ${m.at.slice(0, 10)}.`;
        } else if (m && ctx.hideJudged && !r.hidden) {
          r.hidden = true;
          r.hiddenReason = `Already judged for this opening (${m.verdict.replace("_", " ")}).`;
        }
      }
    }
  }

  /** Re-fetch blank title / company / location by Crustdata id (≈ 0.03 credits a person). */
  async function gapFill(rows: ResultRow[], f: StandardForm, meta: Record<string, unknown>, warnings: string[]): Promise<number> {
    const need = rows.filter((r) => r.crustdataId && blanks(r).some((b) => b !== "url"));
    if (!need.length) return 0;
    const companyMissing = need.some((r) => !r.currentCompany);
    try {
      const res = await cd.personSearch(refetchBody(need.map((r) => r.crustdataId!), companyMissing ? COMPANY_FIELDS : BASIC_FIELDS), "gap_fill", meta);
      const byId = new Map(res.profiles.map((p) => [String(p.crustdata_person_id), rowFromProfile(p, f)]));
      for (const r of need) {
        const p = byId.get(r.crustdataId!);
        if (p) fillFrom(r, p);
      }
      if (res.skippedFields.length) warnings.push(`Some fields are locked on our Crustdata plan and were skipped: ${res.skippedFields.join(", ")}.`);
      return res.credits;
    } catch (e) {
      warnings.push(`Gap fill did not run: ${(e as Error).message}`);
      return 0;
    }
  }

  async function normalRows(f: StandardForm, limit: number, leaveOut: (string | number)[], kind: "show_more" | "fallback", meta: Record<string, unknown>) {
    const fields = settings.normalSearchWithCompany ? COMPANY_FIELDS : BASIC_FIELDS;
    const res = await cd.personSearch(normalSearchBody(f, { limit, leaveOut, fields }), kind, meta);
    return { rows: res.profiles.map((p) => rowFromProfile(p, f, "normal")), credits: res.credits };
  }

  async function finish(
    f: StandardForm,
    check: CheckResult,
    ctx: SearchContext,
    searchId: string,
    rows: ResultRow[],
    warnings: string[],
    engine: SavedSearch["engine"],
    credits: number,
    extra: Partial<SavedSearch>,
    topUpMeta: Record<string, unknown> | null,
  ): Promise<SearchOutcome & { status: "done" }> {
    const N = f.count;
    const shownIds = ctx.leaveOutShown ? await store.shownProfileIds({ searchId: ctx.parentSearchId, openingId: ctx.openingId }) : new Set<string>();
    const shownUrls = new Set<string>();
    const shownKeys = new Set<string>();
    const shownCd = new Set<string>();
    if (ctx.leaveOutShown) {
      // Show more: never repeat people already shown in this chain.
      for (const id of shownIds) {
        const p = await store.getProfile(id);
        if (!p) continue;
        const u = normaliseUrl(p.linkedinUrl);
        if (u) shownUrls.add(u);
        const k = personKey(p.name, p.currentCompany);
        if (k) shownKeys.add(k);
        if (p.crustdataId) shownCd.add(p.crustdataId);
      }
    }
    let { rows: list, removed } = removeRepeats(rows, { urls: shownUrls, keys: shownKeys, ids: shownCd });
    if (removed) warnings.push(`${removed} repeat${removed > 1 ? "s" : ""} removed.`);

    const finalise = async (xs: ResultRow[]) => {
      for (const r of xs) checkRow(r, f);
      locationCheck(xs, f);
      await applyHistory(xs, ctx, searchId, f);
      hideClientStaff(xs, settings.hideClientStaff);
    };
    const cap = ctx.maxPerCompany ?? settings.maxPerCompany;
    await finalise(list);
    // "At most N per company" before the top-up, so the top-up fills the places the cap freed.
    capPerCompany(list, cap);

    // Always N: top up from the normal search, leaving out everyone already in the list or shown.
    let rounds = 0;
    while (topUpMeta && list.filter((r) => !r.hidden).length < N && rounds < 3) {
      rounds++;
      const missing = N - list.filter((r) => !r.hidden).length;
      const leave = [...new Set([...list.map((r) => r.crustdataId).filter(Boolean), ...shownCd])] as string[];
      try {
        progress(ctx, "top_up", `${missing} more`);
        const extraRows = await normalRows(f, Math.min(100, cap ? missing * 3 : missing + 5), leave, "fallback", topUpMeta);
        credits += extraRows.credits;
        if (!extraRows.rows.length) break;
        const before = list.length;
        const merged = removeRepeats([...list, ...extraRows.rows], { urls: shownUrls, keys: shownKeys, ids: shownCd });
        list = merged.rows;
        await finalise(list.slice(before));
        capPerCompany(list, cap);
        const added = list.length - before;
        if (added) warnings.push(`${added} people added from the normal search (basic rows, fewer checks).`);
        if (!added) break;
      } catch (e) {
        warnings.push(`Top-up did not run: ${(e as Error).message}`);
        break;
      }
    }
    // Keep N visible; extras stay hidden ("more available").
    list = rank(list);
    let visible = 0;
    for (const r of list) {
      if (r.hidden) continue;
      if (++visible > N) {
        r.hidden = true;
        r.hiddenReason = "Beyond the 30 shown.";
        r.rank = 0;
        visible--;
      }
    }
    if (visible < N) {
      warnings.push(
        topUpMeta || engine === "normal" || engine === "reuse"
          ? `Only ${visible} people found for this form. Loosen one field (Widen) for more.`
          : `${visible} people from the main search. Press "Show more" for more people (basic search, fewer checks).`,
      );
    }

    // Save everyone found (shared with all TAs).
    const at = now().toISOString();
    const results: SavedSearch["results"] = [];
    for (const r of list) {
      const id = await store.upsertProfile(r, at);
      results.push({ profileId: id, source: r.source, rank: r.rank, hidden: r.hidden, hiddenReason: r.hiddenReason });
    }
    const saved: SavedSearch = {
      searchId,
      formKey: formKey(f),
      form: f,
      query: extra.query ?? "",
      userId: ctx.userId,
      openingId: ctx.openingId,
      engine,
      state: "done",
      note: extra.note ?? null,
      reason: extra.reason ?? null,
      credits,
      startedAt: extra.startedAt ?? at,
      endedAt: at,
      results,
      crustdataSearchId: extra.crustdataSearchId,
      parentSearchId: ctx.parentSearchId,
    };
    await store.saveSearch(saved);
    if (!ctx.parentSearchId && engine !== "reuse") {
      const pk = poolKey(f);
      const pool = await store.getPool(pk);
      await store.savePool(pk, [...(pool?.profileIds ?? []), ...results.filter((r) => !r.hidden).map((r) => r.profileId)], at);
    }
    return {
      status: "done",
      searchId,
      form: f,
      check,
      engine,
      rows: list,
      visible,
      warnings: [...new Set(warnings)],
      spread: companySpread(list),
      credits,
      usd: usd(credits),
    };
  }

  async function searchForm(f: StandardForm, ctx: SearchContext, check?: CheckResult): Promise<SearchOutcome> {
    const chk = check ?? checkForm(f, ctx.accepted);
    if (!chk.ok) return { status: "questions", form: f, check: chk };
    const searchId = newId();
    const meta = { userId: ctx.userId, openingId: ctx.openingId, searchId };
    if (chk.wantsMarketCount && !ctx.marketCountSeen) {
      try {
        const n = await cd.count(normalSearchBody(f, { limit: 1 }), meta);
        return { status: "market_count", form: f, check: chk, marketCount: n };
      } catch {
        // A failed count never blocks the search.
      }
    }
    const key = formKey(f);
    const startedAt = now().toISOString();

    // Same form → reuse the saved result ($0).
    if (!ctx.parentSearchId) {
      const prev = await store.findDoneSearchByFormKey(key);
      if (prev) {
        progress(ctx, "reuse");
        const rows: ResultRow[] = [];
        for (const r of prev.results) {
          const p = await store.getProfile(r.profileId);
          if (!p) continue;
          const row = rowFromSaved(p);
          row.source = r.source;
          rows.push(row);
        }
        const out = await finish(f, chk, ctx, searchId, rows, [`Same search as ${prev.startedAt.slice(0, 10)} — saved result reused, no cost.`], "reuse", 0, { startedAt, note: prev.note, reason: prev.reason, query: prev.query }, null);
        return out;
      }
    }

    running.set(searchId, { cancelled: false });
    // Saved as "running" so a cancel from another action (another engine instance) can find it.
    const runningRecord: SavedSearch = {
      searchId, formKey: key, form: f, query: "", userId: ctx.userId, openingId: ctx.openingId, engine: "agent", state: "running",
      note: null, reason: null, credits: 0, startedAt, results: [], parentSearchId: ctx.parentSearchId,
    };
    await store.saveSearch(runningRecord);
    const warnings: string[] = [];
    let credits = 0;
    try {
      // Saved people first (free), only the gap is paid for.
      const judged = ctx.openingId ? await store.shownProfileIds({ openingId: ctx.openingId }) : new Set<string>();
      const saved = await store.matchSaved(f, f.count, judged);
      const savedRows = saved.map((p) => {
        const r = rowFromSaved(p);
        r.evidence = []; // evidence belonged to another search's checks
        return r;
      });
      if (savedRows.length) warnings.push(`${savedRows.length} saved people matched first (free).`);
      const gap = f.count - savedRows.length;
      let agentRows: ResultRow[] = [];
      let engine: SavedSearch["engine"] = savedRows.length >= f.count ? "saved" : "agent";
      let run: AgentRun | null = null;
      const q = agentQuery(f, savedRows.length ? Math.min(f.count, gap + 5) : f.count, settings.queryStyle);
      if (gap > 0) {
        progress(ctx, "agent_search", "about 1–2 minutes");
        try {
          run = await cd.runAgent(q.query, q.idempotencyKey, {
            timeoutSeconds: settings.agentTimeoutSeconds,
            pollSeconds: settings.pollSeconds,
            isCancelled: async () => (running.get(searchId)?.cancelled ?? false) || ((await store.getSearch(searchId))?.cancelRequested ?? false),
            onStarted: (sid) => {
              const s = running.get(searchId);
              if (s) s.crustdataSearchId = sid;
              void store.getSearch(searchId).then((cur) => cur && store.saveSearch({ ...cur, crustdataSearchId: sid }));
            },
            meta,
          });
        } catch (e) {
          if (e instanceof CrustdataError && (e.code === "low_balance" || e.code === "reserve" || e.code === "unauthorized")) throw e;
          run = { status: "failed", read: null, searchId: null, seconds: 0, credits: 0 };
          warnings.push(`Agent Search could not start: ${(e as Error).message}`);
        }
        if (run.status === "cancelled") {
          const cancelled: SavedSearch = {
            searchId, formKey: key, form: f, query: q.query, userId: ctx.userId, openingId: ctx.openingId, engine: "agent", state: "cancelled",
            crustdataSearchId: run.searchId ?? undefined, note: null, reason: null, credits: 0, startedAt, endedAt: now().toISOString(), results: [],
          };
          await store.saveSearch(cancelled);
          return { status: "cancelled", searchId, form: f, check: chk, engine: "agent", rows: [], visible: 0, warnings: ["Cancelled — no cost."], spread: [], credits: 0, usd: 0 };
        }
        credits += run.credits;
        if (run.status === "succeeded" || run.status === "empty") {
          agentRows = rowsFromAgentRead(run.read!, f);
          warnings.push(...agentWarnings(run.read!));
        } else {
          // Failure fallback: Agent Search failed or ran too long → cancelled (free) → normal search, labelled.
          warnings.push(
            run.status === "timeout"
              ? `Agent Search ran over ${Math.round(settings.agentTimeoutSeconds / 60)} minutes and was cancelled (no cost). Showing the normal search instead (fewer checks).`
              : "Agent Search failed (no cost). Showing the normal search instead (fewer checks).",
          );
          const n = await normalRows(f, gap, savedRows.map((r) => r.crustdataId).filter(Boolean) as string[], "fallback", meta);
          agentRows = n.rows;
          credits += n.credits;
          engine = "normal";
        }
      }
      credits += await gapFill(agentRows, f, meta, warnings);
      return await finish(f, chk, ctx, searchId, [...savedRows, ...agentRows], warnings, engine, credits, {
        query: q.query, note: run?.read?.note ?? null, reason: run?.read?.reason ?? null, startedAt, crustdataSearchId: run?.searchId ?? undefined,
      }, settings.autoTopUp ? meta : null);
    } catch (e) {
      const msg = (e as Error).message;
      await store.saveSearch({
        searchId, formKey: key, form: f, query: "", userId: ctx.userId, openingId: ctx.openingId, engine: "agent", state: "failed",
        note: msg, reason: null, credits, startedAt, endedAt: now().toISOString(), results: [],
      });
      return { status: "failed", searchId, form: f, check: chk, engine: "agent", rows: [], visible: 0, warnings, spread: [], credits, usd: usd(credits), error: msg };
    } finally {
      running.delete(searchId);
    }
  }

  const engine = {
    settings,

    /** Read the request into a form and run the free check only (no cost). */
    async prepare(req: SearchRequest, accepted: CheckQuestion["code"][] = []) {
      const form = await extractForm(req, { llm: deps.llm });
      return { form, check: checkForm(form, accepted) };
    },

    /** The main call: request → form → check → search. Stops with questions when the check finds any. */
    async search(req: SearchRequest, ctx: SearchContext): Promise<SearchOutcome> {
      const form = await extractForm(req, { llm: deps.llm });
      return searchForm(form, ctx);
    },

    /** Run a form the TA already confirmed (after answering questions). */
    searchForm,

    /** 30 basic rows from the normal search, leaving out everyone already shown. */
    async showMore(searchId: string, ctx: SearchContext): Promise<SearchOutcome> {
      const parent = await store.getSearch(searchId);
      if (!parent) throw new Error(`No search ${searchId}`);
      const shown = await store.shownProfileIds({ searchId, openingId: ctx.openingId ?? parent.openingId });
      const leave: string[] = [];
      for (const id of shown) {
        const p = await store.getProfile(id);
        if (p?.crustdataId) leave.push(p.crustdataId);
      }
      const childId = newId();
      const c2 = { ...ctx, openingId: ctx.openingId ?? parent.openingId, parentSearchId: searchId, leaveOutShown: true };
      const meta = { userId: ctx.userId, openingId: c2.openingId, searchId: childId };
      const f = { ...parent.form, count: settings.showMoreSize };
      const res = await normalRows(f, settings.showMoreSize, leave, "show_more", meta);
      const warnings = ["Show more: basic rows from the normal search (fewer checks)."];
      const out = await finish(f, checkForm(f, ["missing_years", "missing_level", "missing_location"]), c2, childId, res.rows, warnings, "normal", res.credits, { query: "show more" }, null);
      return out;
    },

    /** Name + company, or a link → one basic row. Saved people first (free). */
    async findOnePerson(p: { name?: string; company?: string; url?: string }, ctx: SearchContext): Promise<{ row: ResultRow | null; credits: number; fromSaved: boolean }> {
      const saved = await store.findProfile({ linkedinUrl: p.url, name: p.name, company: p.company });
      if (saved) return { row: rowFromSaved(saved), credits: 0, fromSaved: true };
      const res = await cd.personSearch(findOneBody(p), "find_one", { userId: ctx.userId, openingId: ctx.openingId });
      const row = res.profiles.length ? rowFromProfile(res.profiles[0], null, "normal") : null;
      if (row) await store.upsertProfile(row, now().toISOString());
      return { row, credits: res.credits, fromSaved: false };
    },

    /** Change one field; show what changed; hide people already judged. */
    async refine(searchId: string, edits: NonNullable<SearchRequest["edits"]>, ctx: SearchContext): Promise<SearchOutcome> {
      const parent = await store.getSearch(searchId);
      if (!parent) throw new Error(`No search ${searchId}`);
      const { form, changed } = refineForm(parent.form, edits);
      const out = await searchForm(form, { ...ctx, openingId: ctx.openingId ?? parent.openingId, parentSearchId: searchId, hideJudged: true });
      return out.status === "done" || out.status === "failed" || out.status === "cancelled" ? { ...out, changed } : out;
    },

    /** One-click "Widen" on a result list. */
    async widen(searchId: string, field: Parameters<typeof widenForm>[1], ctx: SearchContext): Promise<SearchOutcome> {
      const parent = await store.getSearch(searchId);
      if (!parent) throw new Error(`No search ${searchId}`);
      const { form, changed } = widenForm(parent.form, field);
      const out = await searchForm(form, { ...ctx, openingId: ctx.openingId ?? parent.openingId, parentSearchId: searchId, hideJudged: true, accepted: ["clash_level_years"] });
      return out.status === "done" ? { ...out, changed } : out;
    },

    /** Cancel while running (cancelled = $0). */
    async cancel(searchId: string): Promise<boolean> {
      const r = running.get(searchId);
      if (r) {
        r.cancelled = true;
        return true;
      }
      // Another action runs it: mark it (the runner checks at each poll) and cancel at Crustdata if started.
      const s = await store.getSearch(searchId);
      if (s?.state !== "running") return false;
      await store.saveSearch({ ...s, cancelRequested: true });
      if (s.crustdataSearchId) await cd.cancelAgent(s.crustdataSearchId);
      return true;
    },

    /** Spend by TA, by opening and by kind (reporting only; no limits). */
    async spendReport(filter: { since?: string } = {}) {
      const rows = await store.spend(filter);
      const sum = (key: (e: SpendEntry) => string) => {
        const m: Record<string, { credits: number; usd: number; count: number }> = {};
        for (const e of rows) {
          const k = key(e);
          m[k] ??= { credits: 0, usd: 0, count: 0 };
          m[k].credits += e.credits;
          m[k].usd += e.usd;
          m[k].count++;
        }
        return m;
      };
      return {
        total: { credits: rows.reduce((a, e) => a + e.credits, 0), usd: rows.reduce((a, e) => a + e.usd, 0), entries: rows.length },
        byUser: sum((e) => e.userId),
        byOpening: sum((e) => e.openingId ?? "none"),
        byKind: sum((e) => e.kind),
      };
    },

    /** Price watch: alert when this week's average Agent Search cost is 30% above the 4 weeks before. */
    async priceWatch(): Promise<{ thisWeek: number | null; before: number | null; alert: boolean }> {
      const t = now().getTime();
      const week = 7 * 86_400_000;
      const agent = (await store.spend()).filter((e) => e.kind === "agent" && e.credits > 0);
      const avg = (xs: SpendEntry[]) => (xs.length ? xs.reduce((a, e) => a + e.usd, 0) / xs.length : null);
      const thisWeek = avg(agent.filter((e) => t - new Date(e.createdAt).getTime() < week));
      const before = avg(agent.filter((e) => {
        const d = t - new Date(e.createdAt).getTime();
        return d >= week && d < 5 * week;
      }));
      return { thisWeek, before, alert: thisWeek != null && before != null && thisWeek > before * 1.3 };
    },
  };
  return engine;
}

export type Engine = ReturnType<typeof createEngine>;
