# Load reduction plan

First written 10 Nov 2026; re-checked against main and partly built 23 Nov 2026
on `hdbinath/dev`. Goal: pages load faster and the server carries less at once.

## Why pages were slow

Almost every page waits on the app's in-memory copy of the desk
(`src/data/prime.ts`, `primeState.ts`):

1. **The root layout awaited every application** (for the alert badge) before
   sending any page, and there was no root `loading.tsx`.
2. **Nearly every save wiped the copy.** ~43 call sites ran `resetStore()` /
   `markTablesStale()`. The next page then waited for all 29 tables, ~10k
   applications and ~740 alert-stage candidates with their resumes (10–28 s
   on live, by the code's own comments).
3. **The reload carries heavy fields** it never shows, and **polling**
   (bell every 10 s even when hidden, 3–4 s refresh loops) keeps triggering it.

## Status

| Stage | What | Status |
|---|---|---|
| 0 | Baseline | Build only: 4.4 MB client chunks; livekit (542 KB) was an initial chunk of `/`, `/alerts`, `/openings/[id]`. Page timings not taken (no local backend up). |
| 1 | Quick wins | **Done** `baab2fd`: root `loading.tsx`; assistant/feedback lazy; livekit loads on call start (now an async chunk, no page loads it up front); bell 30 s visible / 60 s hidden (hidden tabs still chime); 3–4 s loops → 10 s, visible-only, capped; parallel awaits (database page, opening layout, CV names); Qdrant/embed timeouts; `ui/people` primes users only; Convex reads by index (commit `locate`, director rounds, `openingAccess`, SLA check). |
| 2 | Layout stops blocking | **Done** `baab2fd` + `72a015e`: the badge counts stream to `TopNav` as a promise; only the badges suspend. |
| 3 | Saves stop wiping the cache | **Done** `3f3e371`: `staleOpening(openingId, candidateIds?)` for stage moves, follow-ups, CV upload, claim/add/shortlist, EOD sends and other single-opening writes; pages holding every application re-read only dirty openings. JD writes, opening create/delete/restore and Bin keep `resetStore()`. |
| – | Workday poll | **Done** `8d28fca`: one poll per tab; sent EODs and lead filter choices load when opened. |
| 4 | Load less into the cache | **Partly done** `0959134` + follow-up: `/reports` and its CSV no longer force a full reload (sign-in checked first); `ta/openings:list` stops at its limit; vocabulary from a 45-min cron row; database chat skips applications unless filtering by availability. |
| 5 | Remaining Convex reads | Partly folded into 1. |
| 6 | Owner decisions | Not started. |

## Still open

Stage 4/5 (need a reader rework first, found 23 Nov):
- Call transcripts stay in the in-memory copy: dropping them (tried 23 Nov,
  reverted) would stop a consent refusal from clearing the stored transcript
  (`store.ts` recordConsent writes `transcript = null`).
- `cacheMs` (`convexServer.ts`) is still unused on the hot routes; the
  `dailyEmails.ts` whole-history reads (`:33/206/381`) are unchanged.
- `intake.rawText` is read from memory by the CV-text index (`store.ts:182`);
  `parsed`/`match` by `/intake`. Loading only non-terminal intake rows needs
  that index changed first.
- `outreach.body` (Dossier, mobile) and `eodEmailCopies` (always read per
  opening, `by_opening` exists) could be read per application / opening.
- Alert badge candidates still read each resume (rawText + embedding) for
  `jobHistory`. Fix: store `jobHistory` on the candidate at extraction (a
  23 Nov attempt to prefer the candidate's own history was reverted: it can
  differ from the CV's).
- `staleOpening` still re-reads the small tables (incl. every job row) after
  each save.
- Database results page and route prime all ~400 engine hits: the filters,
  counts and sort read every hit from the store.
- Keyword search runs the resume `rawText` index; dropping it changes results
  (people matched only by CV text disappear) — owner's call.
- `ta/actor.ts`, `ta/users.ts`, `ui/track.ts` full `users` scans stay: the
  table is ~23 rows and the filters need case-insensitive / mapped-role logic.
- Deferred: the queue/generation-counter rework, and "rebuild indexes only on
  change" (a count/timestamp check misses edits to rows without `updatedAt`).

Stage 6 (owner decisions, separate PRs):
- Move `embedding` / `reverseMatchResults` off `jobs` (dryRun migration).
- Replace the blocking `Atomics.wait` save (`src/data/convex/syncCall.ts`).
- Retention for notifications and logs.
- Production container memory limit (`deploy/production/docker-compose.yml`).

## What users notice

- A skeleton shows at once on navigation; badges appear a moment after the bar.
- Notifications can arrive up to 30 s late (was 10 s), none while the tab is hidden.
- The workday filter section is closed by default; sent EOD emails load when
  their section is opened.
- Auto-refreshing panels stop after ~5 min (AutoRefresh says so; the JD
  extraction panel stops silently - reload to look again).
- `/reports` shows other people's changes up to 30 s late (your own saves
  show at once).

## Not checked

- Read-your-own-write at runtime against a backend (tests check the state
  rules and the call sites, not a live `refresh()`).
- Live table sizes and timings; the reverse proxy and Convex settings; the
  mobile client's poll rate.
