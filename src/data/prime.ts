import "server-only";

/**
 * Loading the working set from Convex, so `repo` can stay synchronous.
 *
 * ── Why this shape ──────────────────────────────────────────────────────────
 *
 * The obvious move when the rows come from a server is to make every `repo`
 * method async. That was tried and abandoned: it needs an `await` at 481 call
 * sites, and 138 of those sit inside `.map()`, `.filter()` and `.find()`
 * callbacks. Making a predicate async does not fail — it silently misbehaves,
 * because a promise is always truthy, so `filter` keeps everything and `find`
 * returns the first row. Worse, it typechecks: `filter` accepts
 * `(value) => unknown`. Two sweeps introduced 64 such defects between them and
 * the compiler reported none.
 *
 * So the rows are fetched FIRST, into memory, and `repo` reads them the same
 * way it reads the JSON file. A page awaits once, at the top, and every
 * component below it stays exactly as written.
 *
 * ── What gets loaded ────────────────────────────────────────────────────────
 *
 * Everything except candidates and pipeline events is small: 32 users, ~20
 * clients, 95 openings, ~10,000 applications. Those are fetched whole.
 *
 * Candidates are not — there are about 77,000. But no page needs 77,000: it
 * needs the people on one opening, or the people a search returned. So
 * candidates are fetched by id from a scope the caller names, and a page that
 * asks for somebody it did not prime gets a loud error naming this function
 * rather than a blank row. Pipeline events — one row per stage move since the
 * platform began — are read the same way, per opening (9 Nov).
 *
 * ── When a request waits ────────────────────────────────────────────────────
 *
 * A request never waits for a reload of rows it already holds (9 Nov). On the
 * live server a reload took 10-28 s, every request queued behind it, and a
 * save landing during the fetch made the loader discard the fetch and leave
 * the tables marked stale — so on a busy desk no reload ever settled. Now:
 *
 *   - rows older than their lifetime are refreshed in the BACKGROUND, and the
 *     request renders from what is held (at most the lifetime old — the same
 *     contract as before);
 *   - a request waits only when nothing is held, when the rows it needs were
 *     never loaded, or when a write made outside the store marked them stale
 *     (`resetStore`) — so a person still reads their own write;
 *   - a reload is never thrown away: it installs what it fetched and lays this
 *     process's own commits from during the fetch on top (`warm.ts`);
 *   - a warm loop refreshes, while the desk is in use, whatever pages have
 *     asked for, so the stale wait is rare.
 *
 * The state itself lives in `primeState.ts`, which does no I/O — `store.ts`
 * reads that and never imports this module, so the Convex client and the admin
 * key it carries stay out of everything that merely touches the store.
 */

import type { Application, Candidate, Database, Id } from "@/data/types";
import { isConvex } from "@/data/mode";
import { assertSafeBackend } from "@/lib/safety";
import * as backend from "@/data/convex/backend";
import { blank, CANDIDATE_EVICT_MS, CANDIDATE_TTL_MS, primedVocabulary, realId, setCommitter, SLOW_TABLES_TTL_MS, state, TABLES_TTL_MS } from "@/data/primeState";
import { convexMutationSync } from "@/data/convex/syncCall";
import { convexQuery } from "@/lib/convexServer";
import { mustWait, settleOpenings, overlayWrites } from "@/data/warm";

/*
 * How the store saves: one Convex transaction per write (convex/ta/commit.ts).
 * Registered here, with the Convex client, rather than imported by the store —
 * see primeState.setCommitter.
 */
setCommitter((ops) => convexMutationSync<{ ids: Record<string, string> }>("ta/commit:apply", { ops }));

export { primed, primedVocabulary, hasCandidate, missingCandidateMessage, resetStore, invalidateOpening, markTablesStale, staleOpening } from "@/data/primeState";

/** What a page needs on top of the small tables. */
export interface PrimeScope {
  /** An opening: brings its applications, its pipeline events and everybody on them. */
  openingId?: Id | null;
  /** Named people — search results, a candidate page, an intake match. */
  candidateIds?: Id[];
  /**
   * Every application on the desk, not just one opening's.
   *
   * The dashboards and reports genuinely need this. It is opt-in because it is
   * the one read here that grows with the desk rather than with the page.
   */
  allApplications?: boolean;
  /**
   * The people currently being chased, and their records.
   *
   * Follow-up state is not derivable from the application alone: whether a
   * step is owed depends on which answers are still missing from the
   * CANDIDATE, and whether anything can be sent at all depends on their phone
   * and email. So `repo.followUps()` reads the record, and without it a
   * follow-up is silently dropped rather than reported wrong — which is why
   * the alert badge, which counts them, needs this.
   *
   * Bounded by the stage, not by the desk: 742 of 8,378 applications, fetched
   * in parallel batches. Implies `allApplications`, since the stage cannot
   * be known before the applications are.
   */
  followUps?: boolean;
  /**
   * Read the tables and applications again unless they are a few seconds old,
   * rather than trusting the 30-second cache. Only the desk assistant asks
   * (6 Oct): "how many CVs today" is a question about now, and the answer says
   * "as of 10:42". Its per-person rate limit is what keeps this bounded.
   */
  fresh?: boolean;
  /** Reports must reflect writes from other app processes on every request. */
  alwaysFresh?: boolean;
}

/** How old "fresh" may be — enough that one burst of questions shares a read. */
const FRESH_MS = 5_000;

/**
 * Re-reads the roster alone. The small tables load once per process, so an
 * account added after startup would otherwise stay invisible to sign-in until
 * the server restarts.
 */
export async function refreshUsers(): Promise<void> {
  if (!isConvex() || !state.snapshot) return;
  state.snapshot.users = await backend.users({ id: null });
}

/*
 * One load at a time.
 *
 * A layout and the page inside it render CONCURRENTLY, and both prime. Without
 * this they both find an unprimed store, both call `blank()`, and the second
 * one's blank overwrites whatever the first had already fetched — most
 * damagingly `db.users`, which is where the session is resolved, so the page
 * decides nobody is signed in and redirects to the sign-in screen while the
 * layout around it renders the signed-in desk perfectly well. It presents as
 * "that one page logs me out", and it moves depending on which fetch happens
 * to return first.
 *
 * Serialising is the whole fix and costs nothing: the work is additive and
 * idempotent, so the second caller finds its scope already held and returns
 * without asking the backend for anything. A background refresh joins the same
 * queue; only callers that must wait (below) actually await it.
 */
let loading: Promise<void> = Promise.resolve();
let background: Promise<void> | null = null;

function queue(scope: PrimeScope): Promise<void> {
  // Refuses a backend that could message real people or poll live mailboxes — see lib/safety.ts.
  const safe = assertSafeBackend();
  // The load in flight is captured now: read inside the callback, `loading`
  // would already be this call's own promise, and it would wait on itself.
  // Queue behind whatever is in flight — including a failed one, whose
  // rejection must not cancel this caller's turn.
  const before = loading;
  const queued = performance.now();
  const mine = safe.then(() => before.catch(() => {})).then(() => loadInto(scope, queued));
  loading = mine.catch(() => {});
  return mine;
}

/**
 * Load the working set.
 *
 * Additive and idempotent: calling it again with a different scope adds to
 * what is held rather than replacing it, so a page can prime an opening and
 * then prime a search's results without losing the first.
 *
 * Resolves at once when everything the scope names is held and younger than
 * its lifetime (a background refresh may be started); waits otherwise.
 *
 * A no-op when the store is the JSON file, which is what keeps the tests — and
 * the offline build — running unchanged.
 */
export function primeStore(scope: PrimeScope = {}): Promise<void> {
  if (!isConvex()) return Promise.resolve();
  // A scope may name a row by the id it had before it was saved.
  scope = { ...scope, openingId: realId(scope.openingId ?? null), candidateIds: scope.candidateIds?.map((id) => realId(id)) };
  const now = Date.now();
  state.lastRequestAt = now;
  if (scope.allApplications) state.asked.allApplications = true;
  if (scope.followUps) state.asked.followUps = true;
  ensureWarmLoop();
  const need = whatIsNeeded(scope, now);
  if (need === "wait") return queue(scope);
  if (need === "refresh") refreshInBackground(scope);
  return Promise.resolve();
}

type Need = "wait" | "refresh" | "fresh";

/** Whether this caller must wait for rows, or may render from what is held. */
function whatIsNeeded(scope: PrimeScope, now: number): Need {
  // The desk assistant and the reports ask for the database as it is now.
  if (scope.alwaysFresh || scope.fresh) return "wait";
  let worst: Need = "fresh";
  const worse = (n: Need) => {
    if (n === "wait") worst = "wait";
    else if (n === "refresh" && worst === "fresh") worst = "refresh";
  };
  const db = state.snapshot;
  worse(db ? mustWait(state.tablesAt, TABLES_TTL_MS, now) : "wait");
  if (!db) return "wait";
  const held = (id: Id) => (state.candidates.has(id) ? "fresh" : "wait");
  if (scope.allApplications || scope.followUps) {
    worse(mustWait(state.allAt, TABLES_TTL_MS, now));
    // A save outside the store changed these openings: re-read them first (23 Nov).
    if (state.dirtyOpenings.size > 0) worse("wait");
    // The alert badge names the people on the alert stages: a stage move from
    // this process may have put somebody there whose record was never fetched.
    if (scope.followUps && state.allAt) {
      for (const a of db.applications) if (ALERT_STAGES.has(a.stage)) worse(held(a.candidateId));
    }
  } else if (scope.openingId) {
    worse(mustWait(state.openings.get(scope.openingId), TABLES_TTL_MS, now));
    worse(mustWait(state.events.get(scope.openingId), TABLES_TTL_MS, now));
    if (state.openings.get(scope.openingId)) {
      for (const a of db.applications) if (a.openingId === scope.openingId) worse(held(a.candidateId));
    }
  }
  for (const id of scope.candidateIds ?? []) worse(mustWait(state.candidates.get(id), CANDIDATE_TTL_MS, now));
  return worst;
}

/** One background refresh at a time; a second request while it runs just renders. */
function refreshInBackground(scope: PrimeScope): void {
  if (background) return;
  background = queue(scope)
    .catch((e) => console.warn("[prime] background refresh failed; keeping the rows held:", e instanceof Error ? e.message : e))
    .finally(() => {
      background = null;
    });
}

/*
 * The warm loop: while the desk is in use, refresh what pages have asked for
 * shortly before it ages out, so a request finds fresh rows instead of
 * starting the refresh itself. Idle for five minutes and it stops asking the
 * backend for anything. One timer per process (globalThis survives a dev
 * reload of this module), unref'd so it never keeps the process alive.
 */
const WARM_EVERY_MS = 10_000;
const WARM_IDLE_MS = 5 * 60_000;
const WARM_AHEAD = 0.8;
declare global {
  // eslint-disable-next-line no-var
  var __c141Warm: ReturnType<typeof setInterval> | undefined;
}

let warmStarted = false;

function ensureWarmLoop(): void {
  if (warmStarted) return;
  warmStarted = true;
  // A dev reload gives this module fresh state; the old timer would keep
  // warming the old one.
  if (globalThis.__c141Warm) clearInterval(globalThis.__c141Warm);
  const timer = setInterval(() => {
    const now = Date.now();
    if (!state.snapshot || now - state.lastRequestAt > WARM_IDLE_MS) return;
    const scope: PrimeScope = { allApplications: state.asked.allApplications, followUps: state.asked.followUps };
    const due =
      now - state.tablesAt > TABLES_TTL_MS * WARM_AHEAD ||
      ((scope.allApplications || scope.followUps) && now - state.allAt > TABLES_TTL_MS * WARM_AHEAD);
    if (due) refreshInBackground(scope);
  }, WARM_EVERY_MS);
  timer.unref?.();
  globalThis.__c141Warm = timer;
}

/*
 * A load slower than this is logged, with how much of it was spent waiting
 * behind other loads (28 Sep). Every page waits in the one queue above, so
 * "the desk is slow" is either the backend or the queue, and the log line says
 * which. Ids and counts only — never a name or a search.
 */
const SLOW_PRIME_MS = 2_000;

async function loadInto(scope: PrimeScope, queued: number): Promise<void> {
  const started = performance.now();
  let changed = false;
  try {
    changed = await refresh(scope);
  } finally {
    const done = performance.now();
    if (done - queued > SLOW_PRIME_MS) {
      const what = [
        scope.openingId && `opening=${scope.openingId}`,
        scope.candidateIds?.length && `candidates=${scope.candidateIds.length}`,
        scope.allApplications && "allApplications",
        scope.followUps && "followUps",
      ].filter(Boolean).join(" ") || "tables";
      console.warn(`[prime] slow: ${Math.round(done - queued)}ms (waited ${Math.round(started - queued)}ms in queue) ${what}`);
    }
    // Derived indexes rebuild only when rows changed (9 Nov): bumping on every
    // load made the store rebuild its maps, and the alert memo recompute, on
    // every request.
    if (changed) state.version++;
  }
}

/** Fetched rows, with this process's commits since the fetch began laid on top. */
function overlay<T>(table: string, rows: T[], since: number, within?: (row: Record<string, unknown>) => boolean): T[] {
  return overlayWrites(table, rows, state.recentWrites, since, within);
}

/** A fetch is settled unless a write outside the store marked the tables stale while it ran. */
const settledAt = (fetchStart: number, now: number) => (state.staleAt > fetchStart ? 0 : now);
/** The small tables also go stale on the narrower mark (staleOpening). */
/** One opening's rows also go stale on staleOpening (23 Nov): a fetch begun before it may predate the save. */
const openingSettledAt = (id: Id, fetchStart: number, now: number) => ((state.openingStaleAt.get(id) ?? 0) > fetchStart ? 0 : settledAt(fetchStart, now));
const tablesSettledAt = (fetchStart: number, now: number) => (state.tablesStaleAt > fetchStart ? 0 : settledAt(fetchStart, now));

async function refresh(scope: PrimeScope): Promise<boolean> {
  const now = Date.now();
  const actor = { id: null as string | null };
  let changed = false;

  /*
   * The vocabulary, from the database rather than from the working set.
   *
   * Read before anything else uses it, because the page parses its query
   * immediately after this returns. It outlives the working set — see
   * `primeState` — so this is a read once every ten minutes, not once a page.
   */
  if (!primedVocabulary()) {
    try {
      const v = await backend.vocabulary(actor);
      state.vocabulary = {
        titles: v.titles.map((t) => t.title),
        skills: v.skills,
        industries: v.industries,
        cities: v.cities,
        employers: v.employers,
        // Not sampled by the backend: degrees and institutions are not indexed,
        // so asking for them would mean a scan. The parser simply recognises no
        // qualification words until they are, which is the honest result — the
        // filter is still there for a recruiter who sets it from the chips.
        qualifications: [],
        languages: [],
        nationalities: [],
      };
      state.vocabularyAt = Date.now();
    } catch {
      // A search that cannot read the vocabulary still runs; it reads the
      // sentence less well. Better than a page that will not render.
    }
  }

  /*
   * ── The small tables ────────────────────────────────────────────────────
   *
   * Loaded into locals first and installed only once they are complete, so the
   * store is never in a "created but not loaded" state. That state is what
   * signed the whole desk out twice: a load interrupted by a backend restart
   * left an empty `db.users`, which is where the session is resolved, and
   * nothing retried it.
   *
   * A refresh that fails keeps the rows already held. They are thirty seconds
   * old; an empty list of users is not an improvement on that.
   */
  const ttl = scope.alwaysFresh ? -1 : scope.fresh ? FRESH_MS : TABLES_TTL_MS;
  if (!state.snapshot || now - state.tablesAt > ttl) {
    const fetchStart = Date.now();
    // The heavy text tables ride along only when their own clock says so, or
    // when nothing is held yet, or when a write outside the store marked the
    // tables stale (slowAt is 0 in both of those cases).
    const slowDue = now - state.slowAt > SLOW_TABLES_TTL_MS;
    try {
      const [users, openings, clients, whole] = await Promise.all([
        backend.users(actor),
        backend.openings(actor),
        backend.clients(actor),
        loadWholeTables(slowDue ? [...FAST_TABLES, ...SLOW_TABLES] : FAST_TABLES),
      ]);
      // A backend that is still starting can answer with nothing rather than an
      // error. Nobody can sign in to a desk with no users, so that is a failed
      // read, not an answer.
      if (users.length === 0) throw new Error("The backend returned no users — it may still be starting.");
      const db = state.snapshot ?? blank();
      db.users = overlay("users", users, fetchStart);
      db.openings = overlay("openings", openings, fetchStart);
      // The clients table only. Clients used to be derived from the openings'
      // free-text names when the table was empty — ids that exist nowhere, so a
      // change to one could never be saved.
      db.clients = overlay("clients", clients, fetchStart);
      // Every other table the desk keeps: interviews, offers, placements,
      // review rounds, the link vault, intake, follow-up records, settings…
      // Before, these were never loaded, and read as empty.
      for (const [table, rows] of Object.entries(whole)) {
        (db as unknown as Record<string, unknown[]>)[table] = overlay(table, rows as unknown[], fetchStart);
      }
      state.snapshot = db;
      state.tablesAt = tablesSettledAt(fetchStart, now);
      if (slowDue) state.slowAt = settledAt(fetchStart, now);
      changed = true;
    } catch (e) {
      if (!state.snapshot) throw e;
      // Said, not swallowed — rows that stop updating have a reason in the log.
      console.warn("[prime] small tables refresh failed; keeping the rows held:", e instanceof Error ? e.message : e);
    }
  }
  const db = state.snapshot!;

  // ── Applications, and the people on them ──────────────────────────────────
  const wanted = new Set<Id>(scope.candidateIds ?? []);
  // Whose CV file names a page will show: the named people and an opening's
  // people. The follow-up set below is read for the alert badge only.
  const namesFor = new Set<Id>(scope.candidateIds ?? []);

  if ((scope.allApplications || scope.followUps) && now - state.allAt > ttl) {
    const fetchStart = Date.now();
    try {
      const { applications } = await backend.allApplications(actor);
      // Replaced, not merged: an application that moved stage or was removed
      // must not survive as its old self. This process's own saves since the
      // fetch began are kept by the overlay.
      db.applications = overlay("applications", applications, fetchStart);
      state.allAt = settledAt(fetchStart, now);
      if (state.allAt) for (const o of db.openings) if (openingSettledAt(o.id, fetchStart, now)) state.openings.set(o.id, now);
      changed = true;
      settleOpenings(state.dirtyOpenings, fetchStart);
    } catch (e) {
      if (state.allAt === 0 && db.applications.length === 0) throw e;
      console.warn("[prime] applications refresh failed; keeping the rows held:", e instanceof Error ? e.message : e);
    }
  } else if (scope.openingId && now - (state.openings.get(scope.openingId) ?? 0) > TABLES_TTL_MS) {
    const openingId = scope.openingId;
    const fetchStart = Date.now();
    const mine = (r: Record<string, unknown>) => r.openingId === openingId;
    const [apps, detail] = await Promise.all([
      backend.applications(actor, openingId),
      backend.opening(actor, openingId),
    ]);
    db.applications = [...db.applications.filter((a) => a.openingId !== openingId), ...overlay("applications", apps, fetchStart, mine)];
    state.openings.set(openingId, openingSettledAt(openingId, fetchStart, now));
    settleOpenings(state.dirtyOpenings, fetchStart, [openingId]);
    // Posts and assignments come with the whole tables above, with their real
    // ids. But the opening itself must be here even when that list is not:
    // a refresh of the small tables that fails keeps the older list, and a
    // just-created opening was then missing from it — Save job went straight
    // to a 404 for an opening that had been saved (testing, 21 Sep). The
    // opening was fetched on its own anyway; it is now kept.
    if (detail) {
      db.openings = [detail.opening, ...db.openings.filter((o) => o.id !== detail.opening.id)];
      const known = new Set(db.jobPosts.map((p) => p.id));
      db.jobPosts = [...db.jobPosts, ...detail.posts.filter((p) => !known.has(p.id))];
    }
    changed = true;
  }

  /*
   * Openings a save outside the store changed (staleOpening, 23 Nov). A page
   * that holds every application re-reads only these, not all of them. One
   * that fails keeps the rows held and stays dirty, so the next page tries
   * again; it is not worth a page that will not render.
   */
  if ((scope.allApplications || scope.followUps) && state.dirtyOpenings.size > 0) {
    const ids = [...state.dirtyOpenings.keys()];
    const fetchStart = Date.now();
    try {
      const lists = await Promise.all(ids.map((id) => backend.applications(actor, id)));
      ids.forEach((openingId, i) => {
        const mine = (r: Record<string, unknown>) => r.openingId === openingId;
        db.applications = [...db.applications.filter((a) => a.openingId !== openingId), ...overlay("applications", lists[i], fetchStart, mine)];
      });
      settleOpenings(state.dirtyOpenings, fetchStart, ids);
      changed = true;
    } catch (e) {
      console.warn("[prime] re-reading changed openings failed; keeping the rows held:", e instanceof Error ? e.message : e);
    }
  }

  /*
   * The opening's history. Pipeline events were loaded whole — every stage
   * move since the platform began, on every reload — and the app reads them
   * only for one application or one opening (9 Nov).
   */
  if (scope.openingId && now - (state.events.get(scope.openingId) ?? 0) > TABLES_TTL_MS) {
    const openingId = scope.openingId;
    const fetchStart = Date.now();
    const mine = (r: Record<string, unknown>) => r.openingId === openingId;
    const events = await backend.eventsFor(actor, openingId);
    db.pipelineEvents = [...db.pipelineEvents.filter((e) => e.openingId !== openingId), ...overlay("pipelineEvents", events, fetchStart, mine)];
    state.events.set(openingId, openingSettledAt(openingId, fetchStart, now));
    changed = true;
  }

  /*
   * Whose candidate records to fetch.
   *
   * The people on a NAMED opening, because that page lists them by name — and
   * anyone asked for outright. Not everybody on every application: the
   * dashboards ask for all 8,378 applications to count stages, and pulling
   * 8,378 candidate records to do it would make the slowest page on the desk
   * out of one that only needed numbers.
   */
  if (scope.openingId) {
    for (const a of db.applications) {
      if (a.openingId === scope.openingId) {
        wanted.add(a.candidateId);
        namesFor.add(a.candidateId);
      }
    }
  }
  /*
   * The alerts name people, and the root layout computes them on every page
   * for the badge. They read candidates on the active alert stages and recent review rounds.
   */
  if (scope.followUps) {
    for (const a of db.applications) {
      if (ALERT_STAGES.has(a.stage)) wanted.add(a.candidateId);
    }
    for (const r of db.reviewRounds) {
      if (now - (r.returnedAt ?? r.sentAt) <= 3 * 86_400_000) {
        for (const appId of r.applicationIds) {
          const a = db.applications.find((x) => x.id === appId);
          if (a) wanted.add(a.candidateId);
        }
      }
    }
  }
  const stale = [...wanted].filter((id) => now - (state.candidates.get(id) ?? 0) > CANDIDATE_TTL_MS);
  if (stale.length > 0) {
    const fetchStart = Date.now();
    const people = await backend.candidatesByIds(actor, stale, { cvNamesFor: namesFor });
    const asked = new Set(stale);
    const fresh: Candidate[] = [];
    for (const id of stale) {
      const c = people.get(id);
      if (c) fresh.push(c);
    }
    // A record this process changed while the fetch ran keeps its change.
    const installed = overlay("candidates", fresh, fetchStart, (r) => asked.has(r.id as Id));
    const have = new Set(installed.map((c) => c.id));
    // Remembered even when absent, so a deleted row is not chased forever
    // and a genuine miss can still be told from a page that never asked.
    // Fetched during a stale mark: installed (a page cannot render without
    // them) but not marked fresh, so the next page reads them again.
    const at = settledAt(fetchStart, now) || 1;
    for (const id of stale) state.candidates.set(id, at);
    const gone = new Set(stale.filter((id) => !have.has(id)));
    db.candidates = merge(
      db.candidates.filter((c) => !gone.has(c.id)),
      installed,
      (c) => c.id,
    );
    // Their referees, which the reference page and follow-up read by candidate.
    const refs = await convexQuery<Database["referees"]>("ta/tables:refereesFor", { candidateIds: stale });
    db.referees = [...db.referees.filter((r) => !asked.has(r.fromCandidateId)), ...refs];
    changed = true;
  }

  // Let go of people nobody has asked for in ten minutes.
  const evict = [...state.candidates].filter(([id, at]) => now - at > CANDIDATE_EVICT_MS && !wanted.has(id));
  if (evict.length > 0) {
    const out = new Set(evict.map(([id]) => id));
    for (const id of out) state.candidates.delete(id);
    db.candidates = db.candidates.filter((c) => !out.has(c.id));
    changed = true;
  }
  return changed;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Tables loaded whole, through ta/tables:page — the TA System's own records.
 * Not here: candidates and pipelineEvents, which are read per scope.
 *
 * FAST tables are small or written by the backend too (mail intake, the
 * Director's rounds, sent EOD copies, Ops API rows), so they are re-read every
 * TABLES_TTL_MS. SLOW tables are the heavy text ones that only this app's own
 * commits change (already in memory through the overlay); they are re-read
 * every SLOW_TABLES_TTL_MS, or at once after a stale mark (10 Nov).
 * strategies and feedbacks have backend mutations of their own
 * (convex/ta/strategies.ts, feedbacks.ts), so they stay FAST.
 */
const FAST_TABLES = [
  "briefs", "jobPosts", "assignments", "reviewRounds", "linkVault", "refereeCalls", "alerts", "intake",
  "outreach", "offers", "placements", "esaRecords", "aiCalls", "settings", "matchExclusions", "callFeedback",
  "interviews", "eodEmailCopies", "strategies", "strategyAssignments", "feedbacks",
] as const;
const SLOW_TABLES = [
  "savedSearches", "savedReports", "researchReports", "benchmarks", "suggestions", "chat", "jdChat", "matchRuns",
] as const;
type WholeTable = (typeof FAST_TABLES)[number] | (typeof SLOW_TABLES)[number];

/*
 * How many whole tables are read at once. Reading all 29 together (9 Nov)
 * made every reload a burst of parallel page reads that other queries - a
 * TA's own click - then waited behind on a busy backend (candidate pages ran
 * to 2.5 s on 10 Nov). Four keeps a reload to a few seconds without taking the
 * backend's whole capacity; the process-wide gate still caps everything at 16.
 */
const WHOLE_TABLE_CONCURRENCY = 4;

async function loadWholeTable(table: WholeTable): Promise<readonly [string, unknown[]]> {
  const rows: unknown[] = [];
  let cursor: string | null = null;
  // A page that runs past the backend's one-second query limit is asked
  // for again at half the size, rather than failing the whole page load.
  let numItems = 1000;
  for (let pages = 0; pages < 400; pages++) {
    let page: { rows: unknown[]; isDone: boolean; continueCursor: string | null };
    try {
      page = await convexQuery("ta/tables:page", { table, cursor, numItems });
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (/is not loaded whole|not loaded whole/i.test(msg)) {
        if (table === "feedbacks") {
          try {
            const fbRows = await convexQuery<unknown[]>("ta/feedbacks:listFeedbacks", {});
            return [table, (fbRows ?? []) as unknown[]] as const;
          } catch {
            return [table, [] as unknown[]] as const;
          }
        }
        console.warn(`[prime] the backend does not serve "${table}" yet; read as empty until its functions are deployed.`);
        return [table, [] as unknown[]] as const;
      }
      if (numItems <= 50 || !/timed out|Server Error|fetch failed/i.test(msg)) throw e;
      numItems = Math.floor(numItems / 2);
      pages--;
      continue;
    }
    rows.push(...page.rows);
    if (page.isDone || !page.continueCursor) break;
    cursor = page.continueCursor;
  }
  return [table, rows] as const;
}

/** The named tables, WHOLE_TABLE_CONCURRENCY at a time, each table paging on its own. */
async function loadWholeTables(tables: readonly WholeTable[]): Promise<Partial<Database>> {
  const queue = [...tables];
  const entries: (readonly [string, unknown[]])[] = [];
  const worker = async () => {
    for (let table = queue.shift(); table; table = queue.shift()) entries.push(await loadWholeTable(table));
  };
  await Promise.all(Array.from({ length: Math.min(WHOLE_TABLE_CONCURRENCY, queue.length) }, worker));
  return Object.fromEntries(entries) as Partial<Database>;
}

/** Stages whose people `computeAlerts` reads by name (src/lib/sla.ts). */
const ALERT_STAGES = new Set<Application["stage"]>([
  "ai_follow_up",
  "ta_follow_up",
  "director_review",
  "director_shortlist",
  "client_shortlist",
  "interview",
  "offer",
  "placed",
]);

function merge<T>(have: T[], incoming: T[], key: (x: T) => string): T[] {
  if (incoming.length === 0) return have;
  const byKey = new Map(have.map((x) => [key(x), x]));
  for (const x of incoming) byKey.set(key(x), x);
  return [...byKey.values()];
}
