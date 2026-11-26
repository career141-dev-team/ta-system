/**
 * store.ts — what the engine needs to remember (Full Plan v1.2, sections 6 and 11).
 *
 * `Store` is the interface the TA System implements on Convex tables (liSearches, liProfiles, liResults,
 * liSpend, liFeedback, liPools). `memoryStore()` is the in-memory version used by the tests and scripts.
 * Outcomes (declined, unreachable, shortlisted) are read from Excel Table rows by LinkedIn URL in the
 * TA System; here they are recorded with `setOutcome`.
 */
import type { Outcome, ResultRow, SeenBefore, SpendEntry, StandardForm, Verdict } from "./types";
import { normaliseUrl, personKey } from "./results";
import { functionsIn, levelIndex, levelsIn } from "./vocab";

export type SavedProfile = {
  profileId: string;
  crustdataId: string | null;
  linkedinUrl: string | null;
  name: string;
  headline: string;
  currentTitle: string;
  currentCompany: string;
  city: string | null;
  country: string | null;
  totalYears: ResultRow["totalYears"];
  areaYears: Record<string, ResultRow["totalYears"]>;
  evidence: ResultRow["evidence"];
  qualificationWords: string[];
  dataDate: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  optedOut: boolean;
};

export type SavedSearch = {
  searchId: string;
  formKey: string;
  form: StandardForm;
  query: string;
  userId: string;
  openingId?: string;
  engine: "agent" | "normal" | "saved" | "reuse";
  state: "running" | "done" | "failed" | "cancelled";
  crustdataSearchId?: string;
  note: string | null;
  reason: string | null;
  credits: number;
  startedAt: string;
  endedAt?: string;
  /** profileIds in shown order, with source and hidden state. */
  results: { profileId: string; source: ResultRow["source"]; rank: number; hidden: boolean; hiddenReason: string | null }[];
  parentSearchId?: string;
  /** Set by a cancel from another action; the running search stops at its next poll. */
  cancelRequested?: boolean;
};

export type Mark = { profileId: string; openingId?: string; userId: string; verdict: Verdict; reason?: string; at: string };
export type OutcomeRecord = { profileId: string; openingId?: string; outcome: Outcome; at: string; by?: string };

export interface Store {
  upsertProfile(r: ResultRow, now: string): Promise<string>;
  getProfile(profileId: string): Promise<SavedProfile | null>;
  findProfile(by: { crustdataId?: string | null; linkedinUrl?: string | null; name?: string; company?: string }): Promise<SavedProfile | null>;
  /** Saved people that match the form for free (saved-first). Best first. */
  matchSaved(f: StandardForm, limit: number, leaveOut: Set<string>): Promise<SavedProfile[]>;

  saveSearch(s: SavedSearch): Promise<void>;
  getSearch(searchId: string): Promise<SavedSearch | null>;
  findDoneSearchByFormKey(formKey: string): Promise<SavedSearch | null>;
  searchesForOpening(openingId: string): Promise<SavedSearch[]>;
  /** All profileIds shown in a search chain (search + its show-more / refine children) or opening. */
  shownProfileIds(scope: { searchId?: string; openingId?: string }): Promise<Set<string>>;

  seenBefore(profileId: string, exceptSearchId?: string): Promise<SeenBefore[]>;
  setMark(m: Mark): Promise<void>;
  marksFor(profileId: string): Promise<Mark[]>;
  setOutcome(o: OutcomeRecord): Promise<void>;
  outcomesFor(profileId: string): Promise<OutcomeRecord[]>;
  /** Who holds this person in an Excel Table (TA System: existing table rows by LinkedIn URL). */
  heldBy(linkedinUrl: string | null): Promise<string | null>;
  /** People already added to this opening's Excel Table (TA System: the table rows' LinkedIn URLs). TAs do not mark people. */
  addedToOpening(openingId: string): Promise<{ linkedinUrl: string; by: string; at: string }[]>;

  logSpend(e: SpendEntry): Promise<void>;
  /** True when a charge with this Crustdata reference is already logged (a charge is logged once, across actions). */
  hasSpend(crustdataRef: string, kind: SpendEntry["kind"]): Promise<boolean>;
  spend(filter?: { userId?: string; openingId?: string; since?: string }): Promise<SpendEntry[]>;

  getPool(role: string): Promise<{ role: string; profileIds: string[]; refreshedAt: string } | null>;
  savePool(role: string, profileIds: string[], now: string): Promise<void>;

  /** Opt-out: remove every trace of a person. */
  optOut(profileId: string): Promise<void>;
}

/** Pool key for repeat roles: function + level + country. */
export function poolKey(f: StandardForm): string {
  return [f.function || f.role.toLowerCase(), f.levelLow ?? "", f.levelHigh ?? "", (f.location.country ?? "").toLowerCase(), (f.location.studiedIn ?? "").toLowerCase()].join("|");
}

function savedFromRow(id: string, r: ResultRow, now: string, prev?: SavedProfile): SavedProfile {
  const area: Record<string, ResultRow["totalYears"]> = { ...(prev?.areaYears ?? {}) };
  if (r.areaYears?.known) area["area"] = r.areaYears;
  return {
    profileId: id,
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
    firstSeenAt: prev?.firstSeenAt ?? now,
    lastSeenAt: now,
    optedOut: false,
  };
}

/** Free match of a saved person against a form: country, level window, function words, exclusions. */
export function savedMatchScore(p: SavedProfile, f: StandardForm): number {
  if (p.optedOut) return -1;
  if (f.location.country && (p.country ?? "").toLowerCase() !== f.location.country.toLowerCase()) return -1;
  const company = p.currentCompany.toLowerCase();
  if (f.excludeCompanies.some((e) => e && company.includes(e.toLowerCase().split(/\s+/)[0]))) return -1;
  let s = 0;
  const lv = levelsIn(p.currentTitle);
  if (f.levelLow && f.levelHigh && lv.length) {
    const i = Math.max(...lv.map(levelIndex));
    if (i < levelIndex(f.levelLow) || i > levelIndex(f.levelHigh)) return -1;
    s += 2;
  } else if (f.levelLow) return -1; // unknown level: let the paid search decide
  const fs = functionsIn(`${p.currentTitle} ${p.headline}`);
  if (f.function && !fs.includes(f.function)) return -1;
  s += 2;
  if (f.totalYears && p.totalYears.known) {
    const lo = p.totalYears.min ?? 0;
    const hi = p.totalYears.max ?? lo;
    if ((f.totalYears.min != null && hi < f.totalYears.min) || (f.totalYears.max != null && lo > f.totalYears.max + 1)) return -1;
    s += 1;
  } else if (f.totalYears) return -1;
  // Industry: only by words in company or headline (no paid data). Must say it, else not a free match.
  if (f.industry) {
    const words = f.industry.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 4);
    if (!words.some((w) => `${p.currentCompany} ${p.headline}`.toLowerCase().includes(w))) return -1;
    s += 1;
  }
  return s;
}

export type TableAdd = { openingId: string; linkedinUrl: string; by: string; at: string };

export function memoryStore(opts: { heldBy?: (url: string) => string | null } = {}): Store & { dump(): unknown; addToTable(a: TableAdd): Promise<void> } {
  const tableAdds: TableAdd[] = [];
  const profiles = new Map<string, SavedProfile>();
  const byCd = new Map<string, string>();
  const byUrl = new Map<string, string>();
  const byKey = new Map<string, string>();
  const searches = new Map<string, SavedSearch>();
  const marks: Mark[] = [];
  const outcomes: OutcomeRecord[] = [];
  const spendLog: SpendEntry[] = [];
  const pools = new Map<string, { role: string; profileIds: string[]; refreshedAt: string }>();
  let seq = 0;

  const index = (p: SavedProfile) => {
    if (p.crustdataId) byCd.set(p.crustdataId, p.profileId);
    const u = normaliseUrl(p.linkedinUrl);
    if (u) byUrl.set(u, p.profileId);
    const k = personKey(p.name, p.currentCompany);
    if (k) byKey.set(k, p.profileId);
  };

  const store: Store & { dump(): unknown; addToTable(a: TableAdd): Promise<void> } = {
    async addToTable(a) {
      tableAdds.push(a);
    },
    async addedToOpening(openingId) {
      return tableAdds.filter((a) => a.openingId === openingId);
    },
    async upsertProfile(r, now) {
      const existing = await store.findProfile({ crustdataId: r.crustdataId, linkedinUrl: r.linkedinUrl, name: r.name, company: r.currentCompany });
      const id = existing?.profileId ?? `p${++seq}`;
      const p = savedFromRow(id, r, now, existing ?? undefined);
      profiles.set(id, p);
      index(p);
      return id;
    },
    async getProfile(id) {
      return profiles.get(id) ?? null;
    },
    async findProfile(by) {
      const id =
        (by.crustdataId && byCd.get(by.crustdataId)) ||
        (by.linkedinUrl && byUrl.get(normaliseUrl(by.linkedinUrl) ?? "")) ||
        (by.name && by.company && byKey.get(personKey(by.name, by.company) ?? "")) ||
        null;
      const p = id ? profiles.get(id) : undefined;
      return p && !p.optedOut ? p : null;
    },
    async matchSaved(f, limit, leaveOut) {
      const pool = pools.get(poolKey(f));
      const all = [...profiles.values()].filter((p) => !leaveOut.has(p.profileId));
      const scored = all
        .map((p) => ({ p, s: savedMatchScore(p, f) + (pool?.profileIds.includes(p.profileId) ? 1 : 0) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s || a.p.firstSeenAt.localeCompare(b.p.firstSeenAt));
      return scored.slice(0, limit).map((x) => x.p);
    },
    async saveSearch(s) {
      searches.set(s.searchId, structuredClone(s));
    },
    async getSearch(id) {
      const s = searches.get(id);
      return s ? structuredClone(s) : null;
    },
    async findDoneSearchByFormKey(k) {
      const hits = [...searches.values()].filter((s) => s.formKey === k && s.state === "done" && !s.parentSearchId);
      return hits.length ? structuredClone(hits[hits.length - 1]) : null;
    },
    async searchesForOpening(o) {
      return [...searches.values()].filter((s) => s.openingId === o).map((s) => structuredClone(s));
    },
    async shownProfileIds(scope) {
      const ids = new Set<string>();
      const chain = new Set<string>();
      if (scope.searchId) {
        chain.add(scope.searchId);
        let grew = true;
        while (grew) {
          grew = false;
          for (const s of searches.values()) {
            if ((s.parentSearchId && chain.has(s.parentSearchId) && !chain.has(s.searchId)) || (chain.has(s.searchId) && s.parentSearchId && !chain.has(s.parentSearchId))) {
              chain.add(s.searchId);
              if (s.parentSearchId) chain.add(s.parentSearchId);
              grew = true;
            }
          }
        }
      }
      for (const s of searches.values()) {
        if (chain.has(s.searchId) || (scope.openingId && s.openingId === scope.openingId)) for (const r of s.results) ids.add(r.profileId);
      }
      return ids;
    },
    async seenBefore(profileId, except) {
      const out: SeenBefore[] = [];
      for (const s of searches.values()) {
        if (s.searchId === except) continue;
        if (!s.results.some((r) => r.profileId === profileId && !r.hidden)) continue;
        const m = marks.filter((x) => x.profileId === profileId && (!s.openingId || x.openingId === s.openingId)).slice(-1)[0];
        out.push({ searchId: s.searchId, by: s.userId, at: s.startedAt, openingId: s.openingId, verdict: m?.verdict });
      }
      return out;
    },
    async setMark(m) {
      marks.push(m);
    },
    async marksFor(id) {
      return marks.filter((m) => m.profileId === id);
    },
    async setOutcome(o) {
      outcomes.push(o);
    },
    async outcomesFor(id) {
      return outcomes.filter((o) => o.profileId === id);
    },
    async heldBy(url) {
      if (!url) return null;
      const u = normaliseUrl(url);
      const add = tableAdds.filter((a) => normaliseUrl(a.linkedinUrl) === u).slice(-1)[0];
      return add?.by ?? (opts.heldBy ? opts.heldBy(url) : null);
    },
    async logSpend(e) {
      spendLog.push(e);
    },
    async hasSpend(ref, kind) {
      return spendLog.some((e) => e.crustdataRef === ref && e.kind === kind);
    },
    async spend(filter = {}) {
      return spendLog.filter(
        (e) => (!filter.userId || e.userId === filter.userId) && (!filter.openingId || e.openingId === filter.openingId) && (!filter.since || e.createdAt >= filter.since),
      );
    },
    async getPool(role) {
      return pools.get(role) ?? null;
    },
    async savePool(role, ids, now) {
      pools.set(role, { role, profileIds: [...new Set(ids)], refreshedAt: now });
    },
    async optOut(id) {
      const p = profiles.get(id);
      if (!p) return;
      profiles.delete(id);
      for (const m of [byCd, byUrl, byKey]) for (const [k, v] of m) if (v === id) m.delete(k);
      for (const s of searches.values()) s.results = s.results.filter((r) => r.profileId !== id);
      for (let i = marks.length - 1; i >= 0; i--) if (marks[i].profileId === id) marks.splice(i, 1);
      for (let i = outcomes.length - 1; i >= 0; i--) if (outcomes[i].profileId === id) outcomes.splice(i, 1);
      for (const pool of pools.values()) pool.profileIds = pool.profileIds.filter((x) => x !== id);
    },
    dump() {
      return { profiles: [...profiles.values()], searches: [...searches.values()], marks, outcomes, spend: spendLog, pools: [...pools.values()] };
    },
  };
  return store;
}

/** Turn a saved profile back into a result row (saved-first, reuse). */
export function rowFromSaved(p: SavedProfile): ResultRow {
  return {
    crustdataId: p.crustdataId,
    linkedinUrl: p.linkedinUrl,
    name: p.name,
    headline: p.headline,
    currentTitle: p.currentTitle,
    currentCompany: p.currentCompany,
    city: p.city,
    country: p.country,
    totalYears: p.totalYears,
    areaYears: p.areaYears["area"] ?? null,
    mustHaves: { function: "unknown", level: "unknown", years: "unknown", industry: "unknown", location: "unknown" },
    evidence: p.evidence,
    qualificationsInHeadline: p.qualificationWords,
    flags: { thin: false, aboveLevel: false, belowLevel: false, otherFunction: false, atClient: false, seenBefore: false, cityNotReported: false, declined: false, unreachable: false, similarToRejected: false, heldBy: null },
    warnings: [],
    dataDate: p.dataDate,
    source: "saved",
    rank: 0,
    hidden: false,
    hiddenReason: null,
    filled: [],
    seenBefore: [],
  };
}
