---
name: database-search
description: Finding and matching candidates in the ~78k-CV database - Database page, results, Referral Search, lookalike/reference-CV search, header search scopes, per-opening Database CVs (auto matches, MatchingStatus, findMatchesNow), the engines (engineSearch, dbMatch, reverse match agent2), Claude-first/DeepSeek scoring, Qdrant embeddings, saved searches. Also "candidate search", "matching", "db match". Use when changing, debugging or extending any of these.
---

# Database search and matching

Every claim below was read from the code in this worktree. "(unverified)" marks anything not confirmed in code. Line numbers are deliberately omitted; grep the function name.

## Scope and boundaries

In this skill: everything that finds people we already hold and turns them into suggestions.

- Pages: `/database`, `/database/results`, `/database/referral`, `/database/match`, `/database/scan`, `/search`, the header search scopes, `/candidates/[id]` (as the destination of a search row).
- Opening side: the Database CVs tab (`/openings/[id]/database`), `MatchingStatus`, `findMatchesNow`, the nightly route, `matchRuns`/`matchExclusions`.
- Engines: `src/lib/engineSearch.ts`, `src/lib/dbMatch.ts`, `src/lib/claudeMatch.ts`, `convex/matching/agent2.ts` (reverse match), `convex/matching/search.ts`, `convex/lib/jdParser.ts`, `convex/cvs/cvScoring.ts` (`scoreCandidateAgainstRequirements`, `scoreWithLLM`, `scoreBatchWithLLM`), `convex/lib/claudeFirst.ts`, the Claude bridge, embeddings/Qdrant.

Neighbours (go there for the rest):

- /follow-up: what happens after a TA claims a match (TA Follow-up, AI call, outreach). Search only hands over through `backend.shortlist`.
- /sets-shortlist: set numbers, director shortlist; the claim here creates the set number.
- /scoop: scoop uploads; database picks are filed as sourcing channel `SCOOP`.
- /excel-tables: LinkedIn rows; `src/lib/cvMatch.ts` ("Find CV", is this LinkedIn person already in the database) lives there, and linked people are hidden from Database CVs.
- /cv-extraction: how a CV becomes a `candidates` row, per-CV embedding scheduling, dedup (`mergedInto`, `candidateLocks`, `cvReplace`). Search only reads the result.
- /openings: JD approval, Job details panel and its locked fields (`convex/ta/requirements.ts`) that feed matching.
- /strategy-planner, /voice-agent, /email-intake, /workday, /eod-email: not touched here; /workday gates which opening a TA may shortlist from (inside `ta/applications:shortlist`).

## How it works now

### 1. Plain-English search (the main flow)

Trigger: a TA types in `SearchBox` (on `/database`, on `/database/results`, or the header bar on those two pages) and presses Enter or Search. Actor: anyone with `database.read` (everyone except role `client`).

1. `runDatabaseSearch` (`src/app/actions.ts`): authorizes `database.read`; optional `cvFile` goes through `extractBlueprintFromFile` (see flow 7); a reply carries `prior`, and the messages are kept one per line: `turns = [...prior lines, new message]`. Over 4,000 characters the oldest refinement (index 1) is dropped, never the first request. Redirects to `/database/results?q=<turns joined by \n>[&ref=][&mode=boolean|meaning][&for=<openingId>]`. Boolean never carries `prior`.
2. `ResultsPage` (`src/app/database/results/page.tsx`) renders the frame at once and streams `Results` inside `<Suspense key={searchKey}>`. The key is `resultsKeyOf(sp)` (`src/lib/query.ts`): every string param except `page`, `candidate`, `msg`, `below`, `lvl`, with `q` reduced to its first message. Paging, opening a candidate, a level tick and a chat reply keep the list on screen (a reply shows its wait under the chat box, `SearchBox key={q}` starts clean when the new results land); a new first message, mode, opening, reference or edited chip shows the full "Searching" scene. The page's own links (`pageHref`, `levelHref`, `broaderHref`, `candidateHref`, `closeHref`) are built from `searchParamsOf(sp, drop)`, the address as it is: rebuilt from parsed criteria they wrote chips into the URL, which flipped `edited`, re-ran the engine and replayed the scene (28 Oct). Chip removal and widen links still go through `withoutChip`/`withValue`.
3. `Results` decides which of the three modes runs. `natural` plus Convex store plus a non-empty `q` goes to the engine; `boolean` and `meaning` do not (see flows 3, 4).
4. Engine path: `cachedEngineSearch` first (answer held, no wait). Otherwise `engineSearch(q, criteria, ENGINE_LIMIT=400, edited, referenceProfile)` is started and `quickEngineSearch` (no model, about a second) is awaited and shown with a "First results, AI is still refining them" banner inside a Suspense whose child `EngineResults` awaits the full run and replaces the list. If the full run throws, `engineError` is set and the words-only fallback runs (`keywordRetrieve(terms, 150)`) with the banner "Ranked on words only - the matching engine could not run (...)".
5. `runEngine` (`src/lib/engineSearch.ts`) is a hand copy of `convex/matching/search.ts aiSearch`, not a call to it. Steps:
   - `readSearchIntent(turns)` gives the memory object (flow 8); `intentToEngineHints` yields `mustHave`/`niceToHave`.
   - In parallel: `vectorPool` (embedQuery, then `searchVectors(vec, 200, {minExperience})`; if a minExperience filter returns nothing it retries unfiltered) and `backend.keywordSearchMany([q, last two turns, title chips, first 3 skill chips], FETCH_LIMIT=100)`. `keywordSearchMany` throws when any term fails (29 Oct); it used to turn a failed term into `[]`, so a timed-out search read as "no matches".
   - With the model: `extractConversationRequirements(turns, {roleAware:true})` (cached 5 min per lower-cased turns). Without it (quick pass, or reading `usage.model === "regex-fallback"`) requirements come from the chips (`requirementsFromChips`, `quickRolePhrase`).
   - `readOccupation` builds `searchOccupation` (target occupation, equivalent titles, reporting context, explicit vs inferred skills). A reference profile overrides title, seniority, years, industry, education and skills.
   - If a company was asked for: `backend.employerSearch` (index `search_employers_all`, up to 5 companies, 200 rows, scope `current` or `any`), a second occupation keyword pass (up to 6 terms) and the pool merge `mergeSearchPool` (up to 200 keyword ids then up to 200 vector ids, deduped).
   - If a route was down and every route returned nothing: throws "The search could not reach part of the database just now, so this is not a real "nothing found"..." (not cached; 21 Sep fix).
   - `candidateDocsByIds(..., "search")` loads the search shape (summary, past titles, all employers). Candidates with `cvFileMissing` and the reference profile's own source candidate are dropped.
   - `strictFilters`: employer in/out, location substring ("remote" matches remote/wfh/home), min/max experience (null years passes), edited skill chips (every term must appear in skills, certifications, summary or name), edited industry. `maxExperience >= 20` is treated as no limit.
   - `scoreCandidateAgainstRequirements(doc, req, i, {pastTitles:true, searchOccupation})` then sort by `compareSearchCandidates` (supported careers before "broader", then score, title score, recency, id).
   - Re-rank only with the model: `searchReviewPool` picks up to 20 profiles (10 supported with weakest skill scores, 10 uncertain, refilled), `scoreBatchWithLLM(..., "search_ranking", {roleAware:true})`. AI cannot override the occupation grouping; failure leaves deterministic scores.
   - Hits with `score > 0` or any role evidence, sliced to `limit`, carry `reason`, `roleEvidence`, a words-only `breakdown`, and `employerLine`.
6. Score cut-off (17 Nov): for a plain engine search (not keyword-list, not `?for=`, not a reference CV) `searchCutOn` (`src/lib/scoring.ts`) sets the floor to `SEARCH_CUT` = 40, so people the engine scored under 40 are hidden and "Show N weaker matches" (`below=1`) brings them back from the held answer. Reference search keeps its 60 bar. `ResultsView` applies the desk rules the engine does not know (`deskCriteria` empties place, years, titles, skills, industries, employers, qualifications and keeps notice, salary, availability, nationality, language) through `repo.searchDatabase`, orders by engine order, applies the Level filter (flow 6) then pages at `PAGE = 25`.

Years and what was typed (28 Oct):

- A bare "N years" is a band, not a floor: `parseQuery` sets `minExperience N` and `maxExperience yearsBand(N)` (N + max(2, ceil(N/2)): 2 gives 4, 5 gives 8, 10 gives 15). "at least / min / over / N+" stay open; "up to / under / less than N" set a ceiling only; "a-b years" is as written. In a conversation a later message that sets a minimum replaces both bounds; one that sets only a ceiling keeps the earlier floor. The natural-language prompt asks the model for `maxYearsExperience` by the same rule, and `requirementsIn(..., keepMaxYears)` keeps it only for searches (conversation and sentence reads, or a JD read with `{keepMaxYears:true}`), never for Job details or applicant scoring.
- `strictFilters` filters on the chips' years, else the model's (`req.minYearsExperience`/`maxYearsExperience`); a reference CV's range stays a score. People with no recorded years pass. `buildFilter` in `qdrantSearch.ts` adds the ceiling as "in range or `totalExperienceYears` empty".
- `runDatabaseSearch` flattens the first message to one line (a pasted JD used to become dozens of "refinements").
- `searchKindOf(turns, known)` (`searchIntent.ts`, words only) names the search `job_description` (over 400 characters, or over 100 with JD headings), `keywords` ("profiles with X, Y", "keywords: ...", or a list of 3+ short comma parts), `name` (2-4 capitalised words and no vocabulary hit) or `role`. A JD is keyword-searched on `buildSearchTerms` of what the model read; a keyword list searches the keywords themselves, takes no occupation, and every keyword must be in skills, certifications, summary, name, a title or an employer (`customFilters`); a name runs `ta/candidates:quickSearch` and puts people whose name holds every typed word first ("Name match", score 100) before the normal list. `interpretation.kind` reaches `AiPanel` as the "Read as ..." label.

Shared reads (28 Oct): the quick pass and the full run start together, so the keyword searches, the Qdrant search and each person's search-shaped document are read once per 30 s (`share`/`searchDocs` in `engineSearch.ts`, up to 1,500 entries); a failed read is dropped at once and each caller still sees the failure. `DbCandidateDrawer` gets `cv` as a promise: the profile shows at once and the CV section waits for `backend.cvFile` behind its own Suspense.

Caches: `engineCache` 5 min, 50 entries, keyed by the full args JSON, in-flight runs shared; failed runs removed, and so are answers with `incomplete` set (a route was down; 29 Oct). The results page then says "Part of the search could not run just now, so some matching people may be missing" instead of "Nothing in the database matched". Sentence reading cache `intents` 5 min, 50. `embedQuery` cache 500 entries (process memory only; assumes one app container).

Refusals and messages: no embedding key in `meaning` mode shows "No embedding key is set..."; Boolean syntax errors show `parseBoolean(q).error`; zero hits shows "Nothing in the database matched that search."; empty list shows "Nobody matches all of that" with "Without X" blocker chips (not when the engine ranked).

### 2. Which score the row shows

- With `?for=<openingId>`: `assess(target.id, ...)` (the same fit score every list shows, `src/lib/assessment.ts`). The engine's number is not shown beside it (one number per row, 21 Sep review).
- Without an opening and engine ranked: `scoreFromEngine(hit)` (`FIT_BANDS`: strong 75, worth a look 60). Bars are band midpoints (strong 90, partial 65, loose 35, different 20, not specified 0); weights are even 0.2 each and explicitly not the engine's real weights.
- Boolean without opening: `booleanScore(booleanTerms(q), candidate)`.
- Chips (`hitsAndMisses`): skill hit/miss chips only when the recruiter edited the chips (`edited`), because the vocabulary parser reads "Campaign Management and Brand Strategy" as the single skill "Management".

### 3. Boolean mode

`mode=boolean`, no engine. `parseBoolean`/`evalBoolean` (`src/lib/query.ts`) over `haystackFor(candidate)`. Retrieval first: `booleanTerms(q)` then `keywordRetrieve(terms, 1200)` then `primeStore({candidateIds})` (without this it only searched the ~740 follow-up people loaded, 21 Sep). Score ring via `booleanScore` (17 Sep).

### 4. By meaning mode

`mode=meaning`: `embedQuery(conversationText(q))`, `nearestCandidates(vec, 1000)` (Convex: Qdrant `searchVectors`, over-fetch `min(k*4, 2000)`), similarity bar `RELEVANT_SIMILARITY` (0.3, or `C141_RELEVANT_SIMILARITY`) and `BELOW_BAR` 0.08 under it; "show N more just below the bar" link adds `below=1`. On embed failure it falls back to words with the banner "Search by meaning could not run (...)". In file store mode `refreshCandidateVectors` runs; on Convex it must not (it cost about 17 s and money).

### 5. Search results page extras

Spotlights counts (free to approach, already being worked, can move in 30 days, placed before), Widen-the-area chips (only when the engine did not rank), `AiPanel` (current filters as removable chips, "As boolean" copy string for LinkedIn Recruiter, clarifying-question links), bulk bar (`addManyToOpening` when `for` opening is open, `DownloadCvsButton`), `DbCandidateDrawer` for `?candidate=` with prev/next and the CV via `/api/cv/[id]` (Word shown as PDF with `?view=pdf`).

### 5a. The chat rail (29 Oct)

The left rail is a chat (`AiPanel.tsx`): each message the TA typed is a bubble and the reply under it says how many people that message showed ("142 candidates", then "38 · narrowed from 142", then "12 · narrowed from 38"); every message adds to the search before it. The newest reply also carries the reading (`engineRead`), company rules, intent summary, search terms, clarifying questions and a "How this search works" fold (first message only). The conversation scrolls inside the rail and stays at the newest message; the reply box (`SearchBox`) is pinned under it and the rail is `lg:h-[calc(100vh-96px)]`. The earlier counts are what the TA saw at the time and travel in the address as `n` ("142,38"): `SearchBox` posts `history` as hidden `n`, `runDatabaseSearch` re-validates it (one entry per earlier message or none, trimmed with the turns it drops), `turnCounts` in `query.ts` reads it and the page adds today's `foundTotal` (before any filter beside the list). `resultsKeyOf` ignores `n`. A turn with no known count gets no reply bubble. Clarification links are replies: they carry `n`, and carry filter chips only when `edited`.

Layout: three columns from `lg` (1024px: chat 300, results, filters 220) and wider from `xl` (400 / 240). Below `lg` everything stacks (chat, filters, results). It used to start at `xl` (1280px), so on a narrower window the chat filled a screen and the filters were far below it.

### 5b. Filters beside the results (29 Oct)

The right-hand column (sticky, scrolls inside) holds, top to bottom: "Clear all filters · N of M shown" (only while one is on), the Experience range slider, Level, then tick lists for Job title, Location, Notice period, Availability and Industry (`src/lib/facets.ts`, `FacetFilter.tsx`, `ExperienceRange.tsx`). Params: `xmin`/`xmax` (the range, 0 to 30 where 30 is "30+"; a full-width slider writes nothing), `lvl`, `jt`, `loc`, `np`, `av`, `ind` (repeated); `FILTER_PARAMS` in `query.ts` lists them and `resultsKeyOf` ignores them, so a filter never shows the loading scene (the old list stays, then swaps).

Strict: a filter hides everyone it does not match, even if that leaves one or two people; clearing it returns the list. OR within one tick list, AND across lists, the range and Level (`rowMatches`). People with no `totalExperienceYears` are hidden while the range is narrowed (the box says how many). Counts on an option are what ticking it would give with every other filter applied (`facetOptions`); Level's own counts are still over the whole list. Job title is the current title lower-cased with punctuation dropped; location is the part of `location` before the first comma; notice bands are 0-14, 15-30, 31-60, over 60, not stated; availability reads the row's `signals`. All of it is in memory over the engine's held list (up to 400), so a change is a re-render, not a search; after the 5-minute engine cache expires a filter click re-runs the search behind the old list. Spotlight counts, pager, drawer previous/next and bulk bar follow the filters. A chat reply clears them and saved searches do not keep them.

### 6. Levels

Ladder in `convex/lib/roleLevel.ts` (0 Intern, 1 Junior/Associate, 2 Mid, 3 Senior, 4 Lead/Asst Manager, 5 Manager, 6 Senior Manager/Head, 7 AGM/DGM, 8 GM/VP, 9 Director/C-suite). `jobLevelRank` maps a job's `seniorityLevel` onto it (unmapped or "other" returns null, gate skipped). `levelFromTitle` is the title fallback (no level word: 2, or 1 under 2 years). `src/lib/levels.ts`: `candidateLevel` = `currentLevel` else title; `openingLevel` = requirements seniority else title; `levelOptions` counts levels (nearest the job first); `inSelectedLevels`. `LevelFilter` hides itself when under two options. Ticks live in `?lvl=` (repeated), kept through paging and the drawer; total, pager and prev/next follow the ticks. On an opening's Database CVs list `levelSectionFor(opening, candidate)` still groups under headings (this job's level, then each below, above, "Level not known").

`currentRoleGate(jobRank, candRank)`: above the job = `excluded_overqualified`; same or one below = `pass`; more than one below = `pass_with_penalty` of `max(-40, -12 * (delta - 1))`; unknown candidate level passes; null job rank = `skipped_other`. Same-level people used to be dropped because job and candidate used different ladders (5 Oct fix, `8380236`).

### 7. Reference CV / lookalike search

Trigger: paperclip "Attach CV" in `SearchBox` (`accept .pdf,.docx,.txt`, limit `MAX_REFERENCE_CV_BYTES` 10 MB, `referenceCvFileProblem`), or "Find similar" on `/candidates/[id]` which links `/database/match?candidateId=`.

- Upload: `runDatabaseSearch` -> `extractBlueprintFromFile` (`src/lib/referenceCv.ts`; DeepSeek `deepseek/deepseek-v4-flash` on OpenRouter, `gpt-4o-mini` fallback when OPENAI key exists, heuristic blueprint with no keys, 10-minute cache by SHA-256) -> `referenceProfileFromBlueprint` -> `serializeReferenceProfile` into `?ref=` (max 4,096 characters, validated, PII-scrubbed: emails and phones are rejected in `referenceSearchProfile.ts`). If `q` is empty it becomes "Find candidates similar to this reference CV."
- `/database/match?candidateId=`: builds the blueprint from the candidate record (seniority by title regex, years -2/+3, first 6 skills core, next 8 supporting) and redirects to results with "Find candidates similar to this reference profile." Without a candidate it redirects to `/database`.
- With a reference the engine uses the profile as occupation and requirement overrides; the source candidate is excluded; the bar is `FIT_BANDS.worth/100` unless `below=1` ("Show N broader matches"); `AiPanel` shows strong vs broader counts.
- `POST /api/cv/reference` (session, JSON `candidateId` / pasted text >= 20 characters / multipart file, 10 MB, 413 over) returns a blueprint; `POST /api/lookalike/search` (`searchLookalikes`, limit capped at 100, default 50) runs `engineSearch(queryTerms, criteria, limit, true)` and re-scores with `scoreLookalikeCandidate`. Their only UI consumer, `src/components/db/CvMatcher.tsx`, is not mounted by any page (grep confirms) (dead UI, live routes).

### 8. Conversational memory and saved searches

- `src/lib/searchIntent.ts`: `readSearchIntent(turns)` is deterministic (no model): `targetRole`, `mustHave`, `niceToHave`, `dealBreakers`, `softPreferences`, `strictness` (`strict|balanced|flexible`), `unknowns`, `clarifyingQuestions`, `summary`. It is a hint layer over the engine; strict desk chips still own hard filters. It holds no contact data or CV text.
- Save: the form under the box calls `saveSearch` (`database.read`): stores `name` (default first 60 characters of the query), `query`, `mode`, `openingId`, `count`, `intent` (re-validated by `safeSearchIntent`), `turns` (last 20), `referenceProfile` (re-validated). Convex path: `ta/search:saveSearch` (sets `lastRunAt` and `lastResultCount` at save time only; nothing updates them on later runs).
- Read: `/database` calls `ta/search:savedSearches` ("Your saved searches", "Saved by the team", the latter every owner's). Delete: `deleteSearch`; the mutation refuses other owners unless role `admin` or `ta_manager`. Saved reports are `savedReports` (reports skill), not here.

### 9. Referral Search

Names (29 Oct): the box is `ReferralSearchBox` (a textarea that grows to eight lines; Enter searches, Shift+Enter is a new line; up to 4,000 characters, a question is still cut to 500 before a model reads it). `nameList(q)` (`src/lib/nameMatch.ts`) reads a pasted block as names when every chunk (split on lines, commas, semicolons, tabs, bars; numbering, bullets and Mr/Dr stripped; at most 100) is two to five words with no role or company word ("HR Managers at Dialog" is not a name). Two or more names show the Name check instead of the referee search: `findByNames` (`src/lib/nameCheck.ts`) runs `ta/candidates:quickSearch` per name (6 at a time, kept 5 minutes; a name nobody matches is retried word by word), primes the hits, and grades each with `nameMatch` (`same`, `likely` for a middle name or an initial, `maybe` for a one-letter typo; sharing only a first name or surname is nothing). Rows say "In our system", "Maybe — similar name" or "Not found", link to `/candidates/[id]`, and the not-found names can be copied. "Not names? Search it as a question" (`?as=search`) forces the referee search. One name shows its check above the referee results only if someone was found. Under every referee card, `ReferralCard` says "We have a CV for X — maybe them, open it to check" when `findByNames(..., { loose: false })` (one indexed search each, up to 60) finds the same or a similar name. A failed lookup throws for the list ("Could not check the names just now", never "not found") and shows nothing for the referee lines. Match is by name only and gives name, title, employer and place, never contact details.

`/database/referral`: GET form `?q=` (max 500 characters) and `x=` for dropped chips (max 30). `referralSearch` (`src/lib/referralSearch.ts`): `readReferralQuery` (cached 5 min, 200 entries) asks Claude (`askBridge` task `match_read`), then DeepSeek (`getOpenAI("jd_extraction", 20_000)`, `max_tokens 500`, spend reserved), then `ruleRead` words. Then `ta/referenceSearch:search` (no model, deterministic): up to `MAX_TERMS = 8` terms, `PER_TERM = 400` rows per search index (`search_company`, `search_designation`, `search_name` on `referees`), `SHOW = 60` people, 5 named-by candidates each, `isPlausibleReferee` filter, "deep" flag when an index hit its limit. Not available outside Convex mode (page says so). Returns phone and email, so internal query only.

Opening and export (12 Nov): the results are `src/components/db/ReferralResults.tsx`, shared by `/database/referral` and `/openings/[id]/referral` (sidebar entry "Referral Search" after Database CVs; needs a sourcing seat on the opening via `requireSourcingSeat` plus `database.read`). `basePath` keeps chip and "search it as a question" links on the page you are on. Each card has a checkbox (`name="id"`, `form="referral-export"`); `ExportBar` counts them, selects all shown (at most 60) and POSTs ids plus `q`/`x`/`for` to `/api/referral/export`, which re-runs `referralSearch`, keeps only the ticked ids, adds a "CV on file" column from `findByNames(..., {loose:false})`, and returns an .xlsx (`src/lib/referralExport.ts`, `buildXlsx`). Same permission checks as the pages; each export is logged to the server console only. The pasted-names list is not exportable. Since 28 Nov the ticks survive the next search: `ExportBar` keeps each ticked id with the search that showed it in localStorage (`referral-picks:<openingId|db>`), shows "N selected (M from earlier searches)" + Clear, and posts them as `picks` JSON; `picksBySearch` (referralExport.ts, tested) groups them by search (max 10 searches, 60 people) and the route re-runs each search, so the file still holds only rows a search returned. The new UI's Referees chat keeps ticks per chat across its searches the same way (`RefereeList` basket in `apps/new-ui/src/app/database/DatabaseView.tsx`).

### 10. Per-opening database matches

Triggers: (a) JD approval (`approveJd` in `actions.ts`: `markMatching`, then `after(rematchWhenRequirementsSettle(...,"jd_approved"))`); (b) after a Job details save or Re-extract (the other `markMatching` call sites, same helper); (c) "Run matching"/"Run again" button (`findMatchesNow`, authorize `opening.sourcing`, then `startMatching`); (d) the mobile route `POST /api/mobile/v1/openings/[id]/matching`; (e) the nightly route (flow 12).

`rematchWhenRequirementsSettle` (`src/lib/openings/matching.ts`): polls `backend.opening` up to 30 x 3 s while `requirementsStatus === "extracting"`, `resetStore()`, `primeStore({openingId})`, `findDatabaseMatches(openingId, trigger)`. In `finally` it always `clearMatching` (with the failure sentence from `matchFailureText`) and revalidates. `startMatching` refuses unless `jdStatus === "approved"` ("Approve the JD first - matching reads it.").

`findDatabaseMatches` (`src/lib/dbMatch.ts`):

- Refuses: `no_opening`, `not_open` (status not open), `jd_not_approved` (`requirementsFor` returns null; `assessmentUnavailable`).
- On Convex with `engine !== "local"`: `matchViaEngine`. `backend.runReverseMatch` calls mutation `jobs/jobs:triggerReverseMatch` (status `running`, schedules `internal.matching.agent2.runReverseMatch`, schedules the watchdog), then polls `ta/matching:reverseMatchResults` every 2.5 s up to 90 s (`done` returns rows; `error` or timeout returns not ok, which falls through to the local route).
- Filter: drop anyone already on the opening (applications and Excel Tables links) or in `matchExclusions`; prime them; `failsHardRules` per person.
- Room: `LIMITS.shown = 30` minus matched-and-unclaimed already waiting (a standing list of 30, not 30 more each night).
- Claude pass (only when `claudeMatchOn()` and pool non-empty): pool is `kept.slice(0, min(room + CLAUDE_EXTRA(10), CLAUDE_POOL_MAX(40)))`; `claudeMatchScores`; `pickByScore(pool, results, room, RULES_FLOOR = FIT_BANDS.worth = 60)`: best first, nobody under 60, anyone not answered for is left out. If neither model answers, the engine order and scores stand (`kept.slice(0, room)`).
- Each chosen person: `repo.addCandidateToOpening(id, openingId, by, null, {kind:"auto_match", note, reason, score})`, which creates an application at stage `matched`, `sourcingChannel: "SCOOP"`, `ownerTaId: null`, with `matchReason`/`matchScore` (stored as `applications.taMatchReason`/`taMatchScore`). `by` = first assigned TA, else a director, else "system". Already on opening returns "Already on this opening".
- Saves one `matchRuns` row: `considered`, `afterRules`, `added`, `embedModel` ("reverse-match (agent2)"), `assessmentVersion`, `note` (ruled-out counts, "N matches already waiting", Claude/DeepSeek line).
- Local route (engine unavailable or file store): Qdrant nearest 300 (`LIMITS.nearest`) plus up to 500 by title (`LIMITS.byTitle`, `titleScore >= 50` against current title or the latest two history titles), hard rules, `assess` score, keep `>= 60` or (`>= 50` and similarity `>= 0.75` with a real embedding model), rank = score + 8 if title >= 80 or +4 if >= 60, fill the same room. A 13 Sep model-review step was removed after a blind test (header comment).

`failsHardRules` reasons: `cv_missing`, `nationality` (only a known and different nationality), `location` (only if `localOnly` and another country), `years` (known years < 70% of minimum; years = max(record, history)), `client_rejected` (same client, rejected within 182 days), `offer_out`, `recently_placed` (182 days). Nothing here sends anything; the match is a suggestion.

### 11. Reverse match engine (backend)

`runReverseMatch` (`convex/matching/agent2.ts`, internalAction, `// @ts-nocheck` file):

1. Optional TA preferences text parsed by a model (`reverse_matching`) into overrides (seniority, location, strict location, certifications, min/max years, negative keywords).
2. Writes `reverseMatchStatus: "running"`, `synthesizeJobRequirements` (`convex/lib/jobSynthesizer.ts`, DeepSeek `jd_extraction`, `max_tokens 1000`), job embedding (cached on the job; cleared by every requirements write) built from title, domain, synthesized prompt, core/general skills and the first 1,500 characters of the JD.
3. Retrieval: keyword (`matching/search:searchCandidates`, first 3 terms, 50 each) plus Qdrant `queryCandidateVectors(jobEmbedding, {limit: 1000})`; Convex `vectorSearch` fallback (64) only when Qdrant gives nothing. Up to 3 keyword-only candidates are embedded on the fly.
4. Role family and level: `classifyJobRoleFamily` (model task `jd_matching`, no Claude) and `classifyCurrentRolesBatch` (batches of 20, Claude first via `match_role`, then DeepSeek), cached per candidate by `currentRoleCacheFingerprint` (fields `currentRoleRank`, `currentRoleRankLabel`, `currentRoleConfidence`, `roleFamily`).
5. Score: `scoreCandidateAgainstRequirements` with `currentRolePenalty` and `roleFamilyMatch`; then `normVector` (0.30 cosine = 35, 0.60+ = 100) blended 55% heuristic and 45% vector; domain multiplier x1.15 for an `exact` role family, x0.75 for `unrelated`; specialised-domain gate caps at 42.
6. Keep: score >= 60 (`safetyFloor`), drop `excluded_overqualified` and `excluded_mismatch` location for people not already acted on; if none qualify the top 10 are surfaced tagged "[Outside typical domain / Review manually]"; top 30 plus any previously TA-acted matches that fell out; saved inline on the job (`reverseMatchResults`, `reverseMatchStatus: done|error`, `reverseMatchedAt`).
7. Watchdog: every `running` write schedules `expireStaleReverseMatch` after 15 min; it flips to `error` if nothing was written for 12 min (1 Oct fix).
8. Publish also triggers it when `reverseMatchOnPublish` is true (`jobs/jobs.ts`).

### 12. Nightly

`POST /api/cron/nightly` (`maxDuration 800`): 404 when `C141_CRON_SECRET` is unset, 403 on a wrong bearer (`timingSafeEqual`), else `nightly()` = `findDatabaseMatches(id, "nightly")` sequentially for every opening with `status === "open"` and `jdStatus === "approved"`. Nothing in the repo schedules it: `docs/HOSTING.md` shows a host crontab line (02:30, loopback port 3110) as a server step; whether it is installed on live is (unverified). There is no Convex cron for matching.

### 13. How a match becomes work (claim hand-off)

A `matched` unclaimed row is only a suggestion. On Database CVs the TA ticks rows and presses "Shortlist selected" (`confirmShortlist`, per row `can(opening.act)`), or per-row Shortlist (`claimCandidate`); both call `backend.shortlist` = `ta/applications:shortlist`: `assertJobAccess WORKS_THE_DESK`, `assertWorkdayScope`, refuses rejected/dropped-out ("Bring them back first"), then `claimForTa` in one transaction: if another TA owns it returns `{ok:false, ownerTaId}` ("X already claimed this candidate."); else sets owner, next set number, moves `new_cv`/`matched`/... into TA Follow-up. From the search results `addToOpening` (row "Add to opening", bulk `addManyToOpening`) does the same: creates the application if missing (stage `matched`, channel SCOOP), revives rejected/dropped-out via `reinstate`, then claims. Removing a `matched` application (`repo.removeApplication`) writes a `matchExclusions` row so it is never matched again; `ta/applications:excludeFromMatches` exists but no UI calls it (grep).

### 14. Contact discovery for the Brevo clone (9 Nov)

A different job from search: not the best few hundred, but **everyone** whose title fits, with an email, for an email campaign. The engine (flow 1) caps its pool at about 400 and Convex text search at about 1,024, so it is not used here. Instead, Extras' sales list, for any role:

- `convex/lib/contactRule.ts` (pure): `ContactRule` (`titles`, `exclude`, `levels` on the `roleLevel.ts` ladder, `skills`, `includePastRoles`), `sanitizeRule` (every rule from the model or from Brevo goes through it), `ruleFromWords` (no-model fallback: request words dropped, the seniority word becomes levels, only the last word made singular), `RULE_PROMPT`, `matchCandidate` (returns a match or a `ContactMiss` reason `other_job|level|skills`; a phrase matches when all its words are whole words of the title in any order; the current title (`currentTitle` before `currentJobTitle`) decides; `currentLevel` = the title's own level word (detected by asking `levelFromTitle` with and without one year: equal means a word decided), else `storedLevel(seniorityLevel)` (the CV reader's years-and-title level, `deriveSeniorityLevel`), else `levelFromYears` (<=2 Junior, <=5 Mid, <=9 Senior, else Lead), else `currentRoleRank`, else null = unknown, let through as "Not known"; an earlier title only when the current one is another job, kind `previous`, level from that title's own word only), `usableEmail` (first plausible address in the field). 10 Nov: a bare title used to be Mid-level always, so "Senior Developers" found ~815 of ~92,000.
- `convex/extras/contactDiscovery.ts`: `read` (one model call through `getOpenAI("jd_extraction")`, else words) -> `contactSearches` row at `read`; `start` (refuses a second live run; stale after 10 min of no progress) -> `scan` action, 15 pages of 100 per run, then reschedules; then the meaning pass (`embedText` + `queryCandidateVectors`, cosine >= 0.6, limit 1000, kind `meaning`, still level- and exclude-checked); `finish`. `stop` (9 Nov, `stopPatch` in `convex/lib/contactRule.ts`): a running search becomes `done` with `stoppedAt` and what it found so far; `scanPage` then sees it is not running and the scan ends, freeing the slot; a finished search is left alone, a never-run one is refused 409. Merged, duplicate-of and do-not-contact people and anyone without a usable email are never kept; one row per email (current > previous > meaning). Every scanned person not kept is counted once in `contactSearches.leftOut` (`not_contactable`, `other_job`, `level`, `skills`, `no_email`, `same_email`; the job is checked before the email, so `no_email` means "fits but has no email"), returned by `status` (null for older searches). `purge` deletes searches older than 7 days.
- `convex/integrations/contactsHttp.ts`: six routes under `/integrations/v1/contacts/discover` (`POST {id}/stop` added 9 Nov), key `CONTACTS_API_TOKEN` (503 unset). Status carries `stopped`. `rows.csv` defuses formula cells but leaves phone numbers alone.
- Tables `contactSearches`, `contactSearchRows` are in `PARTNER_PRIVATE_TABLES`. API contract: `docs/CONTACT-DISCOVERY-API.md`. Test: `tests/contactRule.test.ts`.

## UI surface

| Place | Component / file | Triggers | Who |
|---|---|---|---|
| `/database` | `page.tsx`, `SearchBox`, `DbTabs`, `Suggestion`, `Illustration` | `runDatabaseSearch`; saved list links; `deleteSearch` (X) | `database.read` |
| `/database/results` | `results/page.tsx`, `AiPanel`, `LevelFilter`, `ResultRow`, `DbCandidateDrawer`, `Pager`, `BulkSelect` | `saveSearch`, `addToOpeningInline`, `addManyToOpening`, CV download | `database.read` |
| `/database/referral` | `referral/page.tsx`, `ReferralCard`, `DbTabs` | GET `?q=&x=` | `database.read` |
| `/database/match` | redirect only | `?candidateId=` | `database.read` |
| `/database/scan` | `scan/page.tsx`, `src/lib/scan.ts listScans` | none; shows "Not ready yet. You can't start a new scan from here"; scanner itself is `convex/cvScanner/*` | `database.read`; linked only from its own search scope |
| `/search` | `search/page.tsx` | `ta/candidates:quickSearch` (name and title search indexes, limit 12 default, excludes `mergedInto` and `cvFileMissing`, needs 2+ characters) + `repo.search`; 20 per page | `database.read` |
| `/openings/[id]/database` | `page.tsx`, `FilterPanel`, `CandidateList claimable scored`, `MatchingStatus`, `StatRow` | "Search the whole database" link (`/database/results?for=<id>&q=<title>`), Run matching, Shortlist | opening sourcing seat (`requireSourcingSeat`) |
| `/candidates/[id]` | `candidates/[id]/page.tsx` | "Find similar" -> `/database/match` | `database.read` |
| Mobile | `/api/mobile/v1/search` (names and titles via `ta/candidates:quickSearch`), `/openings/[id]/matching` | | per route |

Header search scopes (`src/lib/searchScope.ts`, `searchScopeFor(pathname)`): `/database` and `/database/results` search `/database/results` keeping `mode`, `for`, `openingId`; `/database/scan` searches scanned CVs; on an opening `/database` sub-page it filters "matched candidates" (keeps `post minExp maxExp maxNotice location mine company past skill school industry title nationality sort band`); everything else falls back to `/search`. `/database/referral` is not special-cased (falls to the global scope). Test: `tests/searchScope.test.ts`.

Database CVs list: applications at `matched`, or `SCOOP` at `new_cv`, minus anyone on the opening's Excel Tables (`linkedCandidates`). Stat row: matched, nobody has claimed, whole database (`backend.candidateStats`). `MatchingStatus` states (`matchingState`): `reading`, `running`, `slow` (> 5 min), `error`, `finished` (shown 10 min), `idle`; the in-process mark goes stale after 6 min; auto refresh every 3 s while running. Shared with mobile through `matchingSnapshot`.

## Data

- `candidates`: identity and profile; `currentJobTitle`, `skills`, `summary`, `employersText` (search_employers_all), `currentRoleRank*`, `currentRoleCacheFingerprint`, `roleFamily`, `mergedInto`, `hasEmbedding`, cv file flags (`cvFileMissing` via `src/lib/cvMissing.ts`). Search indexes: `search_skills`, `search_title`, `search_summary`, `search_name`, `search_employer`, `search_employers_all`.
- `candidateResumes`: `rawText`/`rawTextKey`, `embedding` (1024 floats), `hasEmbedding`; `vector_index_candidates` (1024 dims), `search_text`. Qdrant collection `candidate_vectors`, cosine, payload filters `locationCity`, `locationCountry`, `totalExperienceYears`, `seniorityLevel`, `skills`.
- `jobs`: `requiredSkills`, `niceToHaveSkills`, `seniorityLevel`, `experienceMinYears`, `location`, `requirementsStatus` (`extracting`/`extracted`), `requirementsLockedFields`, `taPreferences`, `embedding`, `roleFamily`, `reverseMatchStatus` (`running|done|error`), `reverseMatchedAt`, `reverseMatchResults` (inline array), `reverseMatchOnPublish`, `scoreWeightSkills/Experience/JobTitle/Industry/Location` (defaults 35/15/30/15/5), `minMatchScoreToShow` (default 60). No UI edits the weights or the threshold (grep in `src`); they are set at job creation in the backend (unverified who sets them).
- `applications`: `currentStage` (`matched_candidates` = TA stage `matched`), `taSourcingChannel` `SCOOP`, `taMatchScore`, `taMatchReason`, `ownerTaId`, `aiMatchScore`/`aiMatchExplanation` (applicant scoring). Mapping in `convex/ta/model/tables.ts` (`applications`, `matchRuns`, `matchExclusions`, `savedSearches`, via `identity(...)`), stage names in `convex/ta/stages.ts`.
- `matchRuns` (index `by_opening`; `trigger` `jd_approved|nightly|manual`), `matchExclusions` (`by_opening`, `by_opening_candidate`), `savedSearches` (`by_owner`, `by_opening`), `referees` (indexes above), `match_scores` (history row per applicant score, `scoreSource "search"`).
- Vocabulary for the box: `databaseShelf()` (`src/lib/retrieve.ts`) on Convex: total, titles with counts, skills, industries, cities, employers.

## Backend wiring

Convex (all internal, reachable only with the admin key the app holds):

- `matching/search`: `searchCandidates` (query; 12 Nov: the caller's limit is clamped to `SEARCH_LIMIT_MAX`=300, the CV-text index `search_text` returns at most `RESUME_HITS_MAX`=100 whole resume rows - a resume row carries the CV text and the 1,024-float embedding, and the missing-CV-file rows are read together), `searchByEmployer` (query), `aiSearch` (action; not called by the app, only by `scripts/e2e/p4-profiles-search.ts`; see quirks), `parseNLQuery`, `semanticSearch`, `bulkAddToPipeline`.
- `matching/agent2`: `embedText` (OpenRouter `openai/text-embedding-3-small`, then `baai/bge-m3`, then NVIDIA models; vectors longer than 1024 are sliced to 1024), `generateAndStoreEmbedding` (called by `cvs/cvExtraction.ts` after extraction; embeds the first 15,000 characters of `rawText`, upserts Qdrant, sets `hasEmbedding`), `generateJobEmbedding`, `runReverseMatch`, `backfillCandidateEmbeddings`, `runEmpiricalVectorBenchmark`.
- `matching/reindexVectors`: `startReindex` -> `reindexWorker` (`BATCH_SIZE 50`, `BATCHES_PER_WORKER 2`, self-rescheduling), `checkProgress`, `getCandidateCounts`, `getEstimatedUsageCost`. It calls OpenAI directly (`text-embedding-3-small`, `dimensions: 1024`, needs `OPENAI_API_KEY`) on a short profile text (name, title, headline, 30 skills, 500 characters of summary, city, industry), not the CV text.
- `matching/queries`: batch readers and embedding writers. `ta/matching`: `runsForOpening`, `recordRun`, `exclusionsForOpening`, `reverseMatchResults`, `admitMatches` (stage `matched_candidates`, channel `database`/`SCOOP`; used for tests/legacy, the app adds through the store instead (unverified that nothing else calls it)).
- `ta/search`: `resultRows`, `pipelineSignals`, `savedSearches`, `saveSearch`, `deleteSearch`. `ta/referenceSearch:search`. `ta/candidates:quickSearch`. `ta/requirements` + `requirementsActions:extract` (JD to Job details; DeepSeek via `extractSearchRequirements(text, "job_description")`, no Claude). `ta/employersText:backfill`.
- `jobs/jobs`: `triggerReverseMatch`, `saveReverseMatchResults`, `expireStaleReverseMatch`, `stopReverseMatch`, publish trigger.
- `cvs/cvScoringActions:processCvScoring` (applicant scoring when a CV arrives; waits for an approved JD via `scoringWaitsForJd`): weighted heuristic from the job's five weights; Tier 1 `scoreWithLLM` (Claude first then DeepSeek, 3 retries 1/2/4 s), final = 0.6 heuristic + 0.4 model; Tier 2 DeepSeek short prompt (2 retries), final the same 0.6/0.4; Tier 3 heuristic only. `saveMatchScore`: stores `aiMatchScore`, inserts `match_scores`, and if `score >= minMatchScoreToShow` (default 60) and stage `new_cvs`, moves to `ta_shortlist` and calls `initiateFollowUpOutreach` (outbound; its gates are in `convex/lib/outreachSafety.ts`/`outboundGuard.ts`, not in search code).

Next: `/api/internal/claude` (POST, header `x-c141-secret`, 404 without a valid secret of 16+ characters, 400 bad request, 503 for any refusal), `/api/lookalike/search`, `/api/cv/reference`, `/api/cron/nightly`, `/api/cv/[id]`, mobile search and matching routes.

Claude bridge (`src/lib/claudeBridge.ts`): tasks `match_role`, `match_score`, `match_rank`, `match_read`; one answer limit `CLAUDE_ANSWER_MS` 90 s (`convex/lib/claudeFirst.ts`); queue wait per task `CLAUDE_QUEUE_MS` (role 60 s, score 60 s, rank 20 s, read 20 s); caller budget `claudeBudgetMs = queue + 90 s + 5 s`; concurrency default 3 (`C141_CLAUDE_MATCH_CONCURRENCY`); after any failure Claude rests `REST_MS` 2 min and every call answers DeepSeek at once; max prompt 60,000 characters; runs `claude -p ... --tools ""` (no tools) via `runClaude` in `src/lib/claudeSub.ts`; default model `claude-sonnet-5-5`, override `C141_CLAUDE_MATCH_MODEL`. `askClaudeFirst` returns null for anything short of an answer; callers then run the original DeepSeek code. Inside the web app (`engineSearch`, referral) `answerInProcess` / `askBridge` skip HTTP; the backend uses `C141_APP_INTERNAL_URL` + `C141_CLAUDE_BRIDGE_SECRET` over the docker network; unset means DeepSeek only. `claudeMatch.ts` (dbMatch scoring) does not use the bridge: it calls `runClaude` directly with `TIMEOUT_MS` 180 s, gated by `claudeMatchOn()` = `C141_CLAUDE_MATCH=on` and `CLAUDE_CODE_OAUTH_TOKEN` present.

Model table (every search-related call; DeepSeek = `deepseek/deepseek-v4-flash` via OpenRouter, `OPENROUTER_PRIMARY_MODEL`):

| Call | Task / flag | First | Then | Last resort |
|---|---|---|---|---|
| Read a search sentence (`readRequirements`, claudeFirst true) | `match_read` | Claude | DeepSeek (`jd_extraction`, `max_tokens 1400`, reasoning off), NVIDIA `meta/llama-3.1-70b-instruct` only if `NVIDIA_API_KEY` | `fallbackRequirements` words ("regex-fallback"; engine then uses chips) |
| Read a pasted JD / Job details | `jd_extraction` | DeepSeek | NVIDIA if key | regex (extraction marked failed, not written) |
| Re-rank uncertain profiles (`scoreBatchWithLLM`) | `match_rank` | Claude (no names: `Candidate #n` or role-evidence JSON) | DeepSeek `search_ranking`, then `cv_structuring` client | deterministic score and `searchEvidenceReason` |
| Score one applicant CV (`scoreWithLLM`) | `match_score` | Claude (no name) | DeepSeek `cv_scoring`, tier 2 DeepSeek, tier 3 heuristic | heuristic |
| Current role level of candidates | `match_role` | Claude | DeepSeek | fail-open "Unclassified", gate passes |
| Job role family (`classifyJobRoleFamily`) | `jd_matching` | DeepSeek (NVIDIA fallback helper) | | default |
| Job synthesis (reverse match) | `jd_extraction` | DeepSeek | | |
| TA preferences parse (reverse match) | `reverse_matching` | DeepSeek | | none |
| Score the 30-room pool (`claudeMatchScores`) | `C141_CLAUDE_MATCH=on` | Claude (`n|score|reason`, 15-word reasons) | DeepSeek via `write("", prompt, 1500, "rank")` (OpenRouter only; never the metered Anthropic key) | engine scores |
| Referral query | `match_read` | Claude | DeepSeek (`max_tokens 500`) | `ruleRead` |
| Reference CV blueprint | n/a | DeepSeek (`max_tokens 800`) | `gpt-4o-mini` if OpenAI key | heuristic |
| Embeddings | n/a | OpenRouter text-embedding-3-small (1024) | `baai/bge-m3`, NVIDIA; app side OpenAI direct if `OPENAI_API_KEY` | `local-words-v1` stand-in (not semantic, labelled) |

Env flags and kill switches (names only): `C141_CLAUDE_MATCH` (on/off, default off), `C141_CLAUDE_MATCH_MODEL`, `C141_CLAUDE_MATCH_CONCURRENCY`, `C141_CLAUDE_BRIDGE_SECRET`, `C141_APP_INTERNAL_URL` (Convex env), `CLAUDE_CODE_OAUTH_TOKEN`, `C141_CLAUDE_BIN`, `C141_CRON_SECRET`, `C141_EMBED_MODEL`, `C141_RELEVANT_SIMILARITY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY(S)`, `NVIDIA_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `C141_STORE` (convex vs file), `C141_DATA_DIR` (turns the $5 `TEST_CAP_USD` spend cap on, `src/lib/spend.ts`; the cap is a constant, not a setting). Search code reserves spend with `reserve(label, maxModelCost(...))` before model calls in `engineSearch` and `referralSearch`.

## Access and roles

- `database.read` (`src/lib/auth.ts can()`): everyone except role `client` ("The database search covers every client's work"). Viewer passes (`READS`). Page gate is `pageUser("database.read")`; actions use `authorize(formData, "database.read")`.
- `opening.sourcing`: needed for Run matching (`findMatchesNow`, mobile route). Desk-wide roles (admin, director, ta_lead, ops) always; others need an assignment; a row owned by another TA is denied only for table rows.
- `opening.act` with `ownerTaId`: the collision lock: "Another recruiter has claimed this candidate." Leads and directors may still act. `confirmShortlist` checks it per row.
- Seat gate on Database CVs: `requireSourcingSeat(id)`. Workday gate: `assertWorkdayScope` inside `ta/applications:shortlist`. `assertJobAccess(..., WORKS_THE_DESK)` in Convex.
- "Hiding a control is a courtesy, not a permission check": every action re-checks; Convex functions are internal and the app is the only caller.
- `deleteSearch` in Convex: owner, or role `admin`/`ta_manager`.
- `ta/requirements` writes (Job details that feed matching) skip the per-opening check for desk-wide users (`isDeskWideUser`), matching the web's desk-wide `opening.manage` (docs/19 A1, 2 Nov).
- Contact discovery (flow 14) has no user at all on the TA side: it is the `CONTACTS_API_TOKEN` holder, and each search records the `requestedBy` email Brevo sends.
- Bridge route: secret only, no session.

## Invariants and safety

- Matching never contacts anyone. A match is a suggestion; outbound starts only when a TA claims and Follow-up runs. If you add anything that sends, it must go through `convex/lib/outreachSafety.ts` and `convex/lib/outboundGuard.ts`; never set `OUTREACH_LIVE` in code. Applicant scoring (`saveMatchScore`) is the one search-adjacent path that auto-advances into Follow-up outreach at `>= minMatchScoreToShow`; the owner kept applicant scoring unchanged on 9 Oct (`107f3f0`: only Database search passes `pastTitles: true`). Do not let the past-title or occupation changes leak into `processCvScoring`.
- No names or contacts to Claude: `matchLine` (title @ employer, years, place, 8 skills, 2 earlier titles, degree) for dbMatch; `Candidate #n` or role-evidence for ranking; role-level and CV scoring send no name (5 Oct `1b318b2`). Review payloads scrub email/phone patterns from summaries. Saved `intent` and `referenceProfile` hold no contact data (validated on save). Keep it that way when extending prompts.
- Claude is off by default and always falls through: never make a search or match wait on it beyond `claudeBudgetMs`; never throw from `askClaudeFirst` (a matching call must not fail because Claude did). Rest after failure (2 min) protects a usage limit.
- Never fall back silently to the metered Anthropic key in matching (`claudeMatchScores` DeepSeek path is OpenRouter only).
- Engine failure is not "nothing found": `engineSearch` throws when a route is down and everything is empty; failed runs are not cached; `matchViaEngine` returns null so the local route runs; `matchingState` shows `error` instead of `finished`.
- No silent relaxation of explicit filters (employer, place, years, edited chips): an empty eligible set stays empty (`docs/DATABASE-SEARCH-ROLE-EVIDENCE.md`).
- `deskCriteria` must keep emptying words/titles/skills/employers: leaving them in admitted the whole 742-person working set on a zero score (399 results for an 18-hit search).
- Hard rules at match time protect the client relationship (client rejected 182 days, offer out, placed 182 days, removed-from-matches, CV file lost). `matchExclusions` is written when a `matched` application is removed.
- Standing list of 30: never add 30 more per run (`room = 30 - waiting`).
- `markMatching` is in-process memory (one app container; gone after restart) and always cleared in `finally`; the page must never say "running" for a dead run (25 Sep). The engine status has its own watchdog (12 min dead, 15 min check).
- Level gate runs both ladders as one (5 Oct). If you touch levels, change `convex/lib/roleLevel.ts` only and re-run `tests/rolelevel.test.ts` and `tests/levelfilter.test.ts`.
- Colombo-day rules do not apply to search itself; `colomboGreeting()` (2 Oct) is only the page greeting.
- Past-title scoring is Database search only; current-title bug fix (newer CV titles unread) applies to all.
- Real candidates: nothing here may be run against live from a laptop; reindexing, backfills and data fixes are migrations.

## Known quirks, gaps and unverified items

- `engineSearch.ts` duplicates `aiSearch` orchestration and `applyFiltersStrictly`. Nothing in the app calls `aiSearch` (only `scripts/e2e/p4-profiles-search.ts`). A change to `aiSearch` does not change the UI, and the reverse is true; shared pieces are `jdParser`, `cvScoring`, `searchRoleEvidence`, `employers`.
- Reindexer text (short profile including `fullName`) differs from per-CV embedding text (first 15,000 characters of `rawText`), so vectors for the same person differ depending on which wrote them. `embedText` slices long vectors to 1024; the reindexer asks OpenAI for `dimensions: 1024`; whether those two are equivalent spaces is (unverified).
- `reindexVectors.checkProgress` message still says "out of ~46,798" (stale constant in text).
- `agent2.ts` is `@ts-nocheck`: `npx tsc --noEmit -p convex` does not protect it.
- Saved searches: `lastRunAt` and `lastResultCount` are set only at save time; the "N results, run X ago" on `/database` can be stale.
- `CvMatcher` has no mount; `/api/lookalike/search` and `/api/cv/reference` are live without UI (the attach button in `SearchBox` uses `runDatabaseSearch`, not these routes).
- `/database/scan` cannot start a scan; `/database/referral` has no special header scope; `ta/applications:excludeFromMatches` has no caller.
- Nothing in repo calls `/api/cron/nightly`; live crontab unverified. The route iterates `repo.openings()` of a store primed with `allApplications`, which may not hold every opening (unverified).
- Widen-the-area chips and "Without X" blockers are not offered when the engine ranked.
- `scoreWeight*`/`minMatchScoreToShow` have no UI.
- Quick pass shows deterministic scores that can differ from the full run; ordering rule is shared.
- Reason texts mix sources: Claude (15 words), DeepSeek (under 25 words), deterministic `searchEvidenceReason`.
- `findDatabaseMatches` fallback local route skips the Claude pass.
- `admitMatches` (Convex) channel `database` differs from the store path channel `SCOOP`; the `matched` Database CVs filter accepts only `matched` or `SCOOP` + `new_cv`.

## How to change it safely

Where to edit:

| Change | Edit | Also change |
|---|---|---|
| Ranking of search results | `convex/lib/searchRoleEvidence.ts`, `scoreCandidateAgainstRequirements` in `convex/cvs/cvScoring.ts` | mirror in `aiSearch` if you want parity; `docs/DATABASE-SEARCH-ROLE-EVIDENCE.md`; applicant scoring uses the same function, guard new behaviour behind an `opts` flag like `pastTitles` |
| Hard filters on search | `strictFilters` in `src/lib/engineSearch.ts` (+ `applyFiltersStrictly` in `convex/matching/search.ts`) | `deskCriteria` so the page does not double-apply |
| Desk rules on matches | `failsHardRules` in `src/lib/dbMatch.ts` | `tests/dbmatch.test.ts` |
| Number of matches / floor | `LIMITS`, `RULES_FLOOR`, `CLAUDE_EXTRA`, `CLAUDE_POOL_MAX` in `dbMatch.ts`; `safetyFloor` and the top-30 slice in `agent2.ts` | `MatchingStatus` copy |
| Levels | `convex/lib/roleLevel.ts`, `src/lib/levels.ts` | `LevelFilter`, `levelSectionFor` call sites |
| Prompts / which model | `convex/lib/jdParser.ts`, `cvScoring.ts`, `claudeMatch.ts`, `referralSearch.ts`; budgets in `claudeFirst.ts` | the model table above and `~/.claude` ai-model-map skill; keep name-free |
| A new URL param | `resultsKeyOf` (decide whether it is a new search), the `*Href` builders in `ResultsView` (they copy the address via `searchParamsOf`, so a new param survives unless a builder drops it), `criteriaToParams` for chip links | else it is lost on paging or back |
| Header search scope | `src/lib/searchScope.ts` | `tests/searchScope.test.ts` |
| Saved search fields | `convex/schema.ts savedSearches`, `convex/ta/search.ts`, `convex/ta/model/tables.ts` (the `identity(...)` column list), `saveSearch` action, `/database` page type | additive optional fields only |
| New matches field on applications | `convex/schema.ts`, `convex/ta/model/tables.ts` (`applications` `toDoc`/`fromDoc`), `src/data/types.ts`, `repo.addCandidateToOpening` | seed, mobile projections |
| Vectors | `convex/lib/qdrant.ts` (`QDRANT_VECTOR_DIM 1024`), `agent2.embedText`, `reindexVectors.ts`, `src/lib/embed.ts LIVE_DIMS` | all four, plus `vector_index_candidates` dimension and a full reindex migration |

Tests (all under `tests/`, run with `npm test`; one file: `npm test -- <part of name>`): `dbmatch`, `linkdbmatch`, `claudematch`, `claudebridge`, `claudefirstsites`, `booleanscore`, `levelfilter`, `rolelevel`, `searchEngineRoleRanking`, `searchRoleEvidence`, `searchContextDates`, `searchintent`, `searchchat`, `searchScope`, `referencesearch`, `referenceSearchProfile`, `lookalikeMatch`, `lookalikeEndToEnd`, `matchingstate`, `jobrequirements`, `scoring`, `mobile-search`, `dedup`. Extend the closest one; engine ranking changes belong in `searchEngineRoleRanking.test.ts` / `searchRoleEvidence.test.ts` with synthetic data (no real candidate data). Always run:

```
npm test
npx tsc --noEmit -p .
npx tsc --noEmit -p convex
```

Pre-merge checklist:

1. `matchViaEngine` null path still falls to the local route; `findDatabaseMatches` refusal codes and `matchFailureText` stay in step.
2. No new prompt carries a name, phone, email, LinkedIn URL or CV text.
3. New Claude call: goes through `askClaudeFirst` (task in `ClaudeFirstTask` and `BRIDGE_TASKS`, queue time in `CLAUDE_QUEUE_MS`) and has a DeepSeek path unchanged.
4. Any new paid call reserves spend like `engineSearch` does.
5. Row score shown once per row (job fit or engine score, never both).
6. Results URL still reproduces the search (reload, share, back from profile).
7. Anything that changes what users see or what candidates receive (score numbers, who appears on lists, reasons, thresholds, Follow-up entry) is flagged to the owner to decide, as in `merge-teammate`.

Repo hard rules that apply: never touch the live backend from a laptop (no `convex deploy`/`run`/`import`/`env set` against `api.career141.com`, `ta-system-api.career141.com` or the VPS); outbound only through `outreachSafety.ts` and `outboundGuard.ts`; data changes (backfilling `employersText`, reindexing, clearing `currentRoleRank` caches) are migration functions with a `dryRun` argument run by the pipeline; work on a branch and merge by pull request; no secrets in code or docs. Run local with `deploy/local/start-app.sh` only.

## History
- 2026-11-28 Referral Search ticks carry across searches (TA feedback: they exported once per search): old app keeps them in the browser per opening and exports all at once (`picks`, `picksBySearch`); new UI keeps them per chat.
- 2026-11-26 The new UI's Database chat asks the chip search first (`src/lib/chipSearchClient.ts` in `src/app/api/ui/database/route.ts`, plain-words mode only; Boolean unchanged). The chip search is its own service, `services/chip-search` (`server.ts`), on the app's Docker network as `http://chip-search:3311`: every candidate's search card in memory (94,830, ~0.8 GB), the Run 7 search `convex/lib/search/chipSearch.ts` (job title tier, then town / industry / level / specialist word / years, then a Haiku check of the top 60), three Haiku reads per search, $10/day cap (`CHIP_DAILY_USD`). Any failure answers null and the old engine runs; `C141_CHIP_SEARCH=off` switches it off. Cards: built once on the server (25-26 Nov, read-only export + Haiku batches), new candidates nightly by `build.ts` (`nightly.sh`, read-only export via `export.sql`, at most 3,000 a night; changed records keep their card). Measured on 200 blind-graded jobs: useful top 10 63%, years in range 99%. Old AURA's own Database page is unchanged. Test: `tests/chipsearchlive.test.ts`.
- 2026-11-25 Reverse match: one person once (`dedupeByPerson`, same name and title) and a TA judge on the engine's best 40 (`convex/lib/taJudge.ts`, called in `matching/agent2.ts`): anonymous lines (title, employer, years, place, skills) to the text model, `n|score|reason` back; its score orders the list, under 50 leaves it, its reason leads the row; no answer = the engine's list stands. Engine scores sat at 93-100 on real openings and a product engineer headed the Garment Technologist list. Test: `tests/tajudge.test.ts`.

- 2026-09-13 (pre-repo, in `dbMatch.ts` header): database matches agreed: nearest 300, hard rules, rules score; model review removed after a blind test of 184 CVs; MEANING_FLOOR 50 and CLOSE_IN_MEANING 0.75 set from a 704-profile blind test.
- 2026-09-14 `7470f4f` new TA platform with search, matching and P1 safeguards.
- 2026-09-15 `6986358` retrieve before filtering so search sees the whole database (working set is not the database); `04329ed` the tuned engine finds and ranks (invented people came from the wrong store, vocabulary was empty at parse time); `fc4dcb0` query embedded into the index's own space and searched in Qdrant; `ab1c9b9` search vectors get a place so city filters work; `8afac49` run the tuned reverse-match engine, then apply the desk's own rules (client rejection, offers, placed, removed).
- 2026-09-16 `f22f3ca` hybrid AI search on Database results: heuristic ranking first, AI ranking streams in via Suspense, cache; `9deb84d` engine no longer fails without an NVIDIA key; `fe0c173` side panel shows the candidate's CV.
- 2026-09-17 `e9dfe8e` Boolean search scores with a ring.
- 2026-09-21 `1b6c3ba` a route-down empty answer is no longer cached as "nothing matched"; `79cec69` the inflated fit score from `5ba3d06` was not taken; one score per row.
- 2026-09-24 `442a01f` nightly/find-matches stopped crashing on the vector-cache write (EACCES); `docs/HOSTING.md` documents the cron as a server step.
- 2026-09-25 `86b9b11` MatchingStatus and step-by-step loading scenes (`markMatching` so a run shows as started).
- 2026-09-28 `9158cf4` max experience filter; `c53414b` LinkedIn profile matched to the CV already held.
- 2026-10-01 `b70fd65` Excel "Find CV"; `4e9bf8e` a headhunted row already in the database is one person (linked people hidden from Database CVs); reverse-match watchdog added for runs stuck on "running".
- 2026-10-05 `896f887` search becomes a conversation, each message refines it; `09366eb` level sections; `8380236` one ladder, same-level people no longer dropped as overqualified; `1b318b2` Claude first, DeepSeek straight after, for every matching call (bridge route, concurrency 3, 2-min rest); `bee19f0` Claude scores database matches (`number|score|reason`, floor 60, `taMatchScore`); `1243b75` Claude writes each match's reason.
- 2026-10-06 `4f9e247` Claude reads the search sentence first; `5aa41eb` Claude actually answers scoring and search (time budgets `claudeBudgetMs`, queue instead of "busy", in-process ask for the web app); `073f53a` compact batch prompt and recalibrated vectors in reverse match.
- 2026-10-08 `df1cbe6` Referral Search tab; `9446651` Level filter replaces headings on search.
- 2026-10-09 `03fe680` search reads the whole chat and finds people by company now or before (`employersText`, `search_employers_all`); `107f3f0` past titles raise Database search only, not applicants'.
- 2026-10-12 `5ea7802` conversational intent memory (saved with searches).
- 2026-10-14 `58a2eaf` lookalike by reference CV upload (#188); `873baac` and `3bcb09f` career evidence ranked before broad similarity, reporting context honoured, ended roles respected (`searchRoleEvidence.ts`, `docs/DATABASE-SEARCH-ROLE-EVIDENCE.md`).
- 2026-10-15 `1690586` better reference CV matching; `9cd8c5e` CV attach built into the search chat bar (`SearchBox`, `cvFile`).
- 2026-10-20 `c0a68c7` friendly error recovery (`safeErrorMessage`).
- 2026-10-22 `cb821c3`, `7865d66`, `5d98c89` mobile endpoints; matching state moved to `matchingSnapshot` and `src/lib/openings/matching.ts` so web and mobile share one run.
- 2026-10-29 filters beside the results: experience range, job title, location, notice period, availability, industry (strict, in memory, no reload).
- 2026-10-28 the full "Searching" scene no longer replays on a chat reply, a profile, a page or a level tick (links keep the address; the boundary keys on the first message).
- 2026-10-28 years band (a bare "2 years" no longer returns 5, 10, 23 years), a pasted JD read as one message, and keyword lists and names read as such (owner: TAs rarely paste a JD).
- 2026-10-29 A failed keyword term is reported, not swallowed; an answer with a route down carries `incomplete`, is shown with a warning and never cached; "too many system operations" is no longer retried (`src/lib/convexResilience.ts`).
- 2026-11-09 contact discovery for the Brevo clone (flow 14): a rule read once, every candidate checked against it with no model, a labelled meaning pass, its own key and routes.
- 2026-11-20 the new UI's Database chat (Ask AURA part 3): POST `/api/ui/database` on the old server runs this same search for new.career141.com (Clerk Bearer, `database.read`, read only) - natural words get the cached or quick engine answer and start the full one, `full: true` waits for it; Boolean reads every CV holding its words; desk rules still narrow (`deskCriteria`). `ui/searches:record` keeps each chat search in `searchHistory` (nothing wrote it before), `ui/searches:recent` lists them, `ui/myDay:today` counts today's.
- 2026-11-10 contact discovery recall: level from the title's word, else the CV reader's stored level, else years (a bare title was always Mid-level: ~815 senior developers of ~92,000); phrase words in any order; the first email in the field; drop-out counts by reason on every search.
- 2026-11-12 one keyword search bounded and the burst gone: `searchCandidates` clamps the limit (300) and caps CV-text hits (100 whole resume rows); `keywordSearchMany` runs terms two at a time (a database search ran two six-term passes together, measured 9.2 s live).
- 2026-11-18 a search for a job (`/database/results?for=<opening>`, natural/meaning, first arrival only - not once the URL carries edited criteria) adds up to 4 of the opening's Research "Similar designation" titles to `criteria.titles` after the job's own title (`similarTitles`/`joinTitles`, src/lib/similarTitles.ts). Titles score as any-of (match.ts `titleScore`, engine `alternativeTitles` = titles.slice(1)), so it widens and never narrows; they show as removable chips.
- 2026-11-20 `sanjeev200009/search-parallel`: "Part of the search could not run" seen on fresh searches, old page and new UI alike, answers at 30/60/90 s = the app's 30 s backend wait. `matching/search:searchCandidates` now reads its four indexes together (`Promise.all`, same reads, same results), and the warning names the part that failed (`incompleteProblem` in lib/engineSearch: the word / meaning / company search).
- 2026-11-20 `sanjeev200009/search-reason`: after #50 one live full pass still failed "the word search" in 10 s (not the 30 s wait, so the backend refused the query). `/api/ui/database` now also answers `detail`: each failed part's own message, cut to 300 characters, not shown on screen - read it to find which backend limit is hit.
- 2026-11-23 `/api/ui/database` primes only the tables up front and loads all applications (`allApplications`) just when the parsed criteria set an availability rule (free / in pipeline / placed before): that rule is the only thing the chat route reads from applications (rows carry no pipeline markers). The old results page still primes them (it counts free / in-pipeline / placed over every result and filters on them). Both still prime every engine hit: totals and the desk-rule narrowing run over all hits, not one page.
- 2026-11-27 Database chat history: `ui/searches:recent` no longer sends each chat's saved turns (up to 250 KB each, re-sent after every search); it says `saved`, and `ui/searches:turns({chatId})` reads one chat when it is opened. `ui/searches:remove` deletes a row with its own `chatId` only by that id (deleting "accountant colombo" had also deleted "accountant"); older rows still match by words.
- 2026-11-28 Database chat projects (like ChatGPT Projects): a TA makes a project (a folder for one position) in the chat list, writes its guidelines on the project page, starts chats inside it or moves chats in/out. Table `searchProjects` (own rows, `by_user`, 50 max) and `searchHistory.projectId`; `convex/ui/searches.ts` projects/saveProject/removeProject (chats go back to history)/moveChat, and record files a new chat into its project. The guidelines ride to `/api/ui/database` as `guide` (`readSearchBody`, 2,000 chars) and are read as the first thing said in the chat: the agent/chip search get a labelled first turn, gender/limit/old engine read them before the TA's words. Boolean searches ignore them.
- 2026-11-28 `sanjeev200009/chip-table` (step 1 of the "chat like ChatGPT" plan; owner: Eastern / Batticaloa / female / with-email did not filter, and every fix was one more rule in code): `services/chip-search/table.ts` builds the cards as an in-memory read-only SQLite database when the service loads them (`node:sqlite`, no new dependency; tables `people` with town / district / province / country columns from the place list, `jobs`, `job_company_types`, `qualifications`, `skills`, `languages`, `levels`; merged and lost-CV cards left out; `pragma query_only`). `runQuery` takes one SELECT, caps rows, answers errors as text; `describeTable` is what the agent will be told. Nothing reads the table yet: `/health` shows `tableRows`, and a failed build never stops the search. `export.sql` now adds `hasEmail` / `hasPhone` yes/no flags (addresses still removed) and `build.ts` puts them on new cards and refreshes them on kept ones. Ceiling: `runQuery` has no time limit until step 2 runs it in a worker. Measured on 95,000 made-up cards: build 3 s, queries ~20 ms. Not run on the server; the changed `export.sql` was not run against Postgres. Test: `tests/chiptable.test.ts`.
- 2026-11-28 `sanjeev200009/chip-agent2` (step 2): the query agent `services/chip-search/agent2.ts` writes its own SELECT on the cards table for every request (tools `query`, `read_people`, `finish`; up to 8 rounds, told to finish after 35 s). Our code only keeps it honest: `finish` carries `final_sql` and only people that query returns are shown (without one, only people a query or card read returned this turn, or who are on screen); `total` is the final query's count; `searched` goes out as `read`. Queries run in a child process on a read-only file copy of the table (`query.ts` + `query-worker.mjs` + `sql.ts`), one at a time, killed after 2 s - a process, because a worker thread stuck inside one SQLite step cannot be stopped. `server.ts` builds the table into the container's temp folder on each load and removes the old file. Model call `callAgent2Model`: `CHIP_AGENT2_MODEL` (default `claude-sonnet-5-5`), adaptive thinking, `output_config.effort` `CHIP_AGENT2_EFFORT` (default medium), system text cached, 45 s, DeepSeek when Anthropic fails; `addSpend` now counts cached tokens. Switch `C141_CHIP_AGENT2` on the service: `on` = every `/agent` call, `test` = only calls with `v2: true`, anything else = the first agent (default). If the query agent cannot answer, the first agent does. `/health` shows `agent2`. The chat route is not changed (step 4). Never run on a real model or the real cards. Test: `tests/chipagent2.test.ts`.
- 2026-11-28 `sanjeev200009/chip-agent2-chat` (step 4, the chat around the query agent): the agent's `query` tool takes `why` (plain words) and each query is kept as `trail` ("People in the Eastern Province: 3"); the answer carries `agent: 2`, `trail` and `last` (`searched` + the final query). `server.ts` keeps `last` per chat in memory under the chat's words so far (2 h, 500 chats) and hands it to the next message, so a follow-up changes the last search instead of starting over; a question in between keeps it; after a restart the agent reads the conversation alone. `/api/ui/database`: when the answer says `agent: 2` the route's own gender word check (`genderAsked` over the whole chat, then names) is skipped - the agent already filtered by what the chat asked; it still runs for the first agent and the chip search. The route passes `trail` (12 at most). New UI Database chat: under AURA's reply a line "Searched: ..." (`read`, which was dropped whenever a reply existed) and a fold "How I searched" with the trail. Not built: steps shown live while it works (needs the answer streamed through service, route and screen); with the query agent "female only" now shows only people whose gender is on file (about 12% of cards) and says how many are not on file - no name guessing. Not seen in a browser. Test: `tests/chipagent2.test.ts` (26).
- 2026-11-28 `sanjeev200009/chip-agent2-cvtext` (step 3, CV text): for what no column holds (a language, a tool, a school, "led a team of 20"). `export.sql` also exports the start of `candidateResumes.rawText` (12,000 characters); `build.ts` writes `cvtext.jsonl` beside the cards every night, no AI: `searchText` in `read.ts` = the record as CV-like text plus the CV's own text, emails / phone numbers / NIC-length numbers replaced (`scrub`), 4,000 characters a person. The table gets `cv_text` (SQLite FTS5: `person_id`, `body`), searched by the agent with `MATCH` in its own SQL; `describeTable` tells it how only when the table exists; `read_people` takes `with_cv` (10 people, 3,000 characters each). The table is now built by `table-build.ts` in a child process from the two files (so the full-text build never holds a search) and falls back to no CV text if FTS5 is missing or the file is bad; `/health` shows `cvTextRows`. Names inside CV text are not removed. Measured on 20,000 made-up people with 3,000 characters each: 1.8 s, 100 MB file. Not built: the meaning (vector) tool - the query sentence would have to be embedded exactly as the index was (model, width), which is easy to get silently wrong and cannot be tried without the server; left until the blind test shows what CV text alone misses. `export.sql` not run on Postgres. Test: `tests/chipagent2.test.ts` (36).
- 2026-11-28 `sanjeev200009/chip-chat-names` (owner's two live screenshots): (1) "Manish Mittal where is his location" answered "not found" with his CV open beside the chat - the cards hold no names, so neither agent could tell the name was someone on screen. `/api/ui/database` now sends `names` (id -> full name, only the people on screen) with `/agent`; both agents show the name on that person's line ("#1 [id] Name - title @ company"); the query agent is told the tables hold no names and what to say when a name is not on screen. The new UI sends the person open in the side panel first in `currentIds` (only 40 are sent). (2) Scores looked out of order (70, 66, 66, 70, 70): the list is confirmed people first, then people the agent could not fully confirm, each group by score, with nothing on screen saying so. Rows now carry `unsure` and the list shows one line above the first of them: "Not everything you asked is on file for the people below". (3) The reply showed `**not found**`: the route strips markdown marks and the query agent is told to write plain text. Still open: a person who is NOT on screen cannot be found by name through the agent (the name search is the chat's own "do we have ..." path); putting names in the table is the owner's decision. Not seen in a browser. Test: `tests/chipagent2.test.ts` (39).
- 2026-11-28 `sanjeev200009/chip-table-names` (owner: "Yes, add names", then "a quick way, today"): the query agent's table has `people.name`. `export.sql` no longer removes `fullName`; `build.ts` writes it as `n` on the person's line of `cvtext.jsonl` (never on a card, never in the text a card is built from; "Unnamed candidate" and empty names left out); `buildTable(cards, file, extra, { cvText })` sets names from that file even when the CV text cannot go in; `describeTable` tells the agent to match each word of a name with LIKE; `read_people` returns the name with the card. So a name now reaches the model whenever the agent reads people. CEILING the owner was told: names and CV text are as old as the last nightly run (03:30 Colombo) - a candidate added or renamed today is found by name tomorrow, unless `nightly.sh` is run by hand. A live name lookup was not built. Test: `tests/chipagent2.test.ts` (45).
- 2026-11-28 same branch, three more parts (owner: "complete one by one, now"). (1) CV TEXT FROM CLOUDFLARE: the CV reader keeps each CV's full text in R2 (`cv-rawtext/...`) and only `rawTextKey` in the database, so the export held almost none of it. `export.sql` now exports the key (`k`); `r2.ts` fetches by key with a hand-made Signature V4 GET (checked against Amazon's published example), keeps a copy under `/opt/chip-search/data/raw` so each CV is fetched once, and the keys come from `/opt/chip-search/r2.env` (`R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; without the file only the disk copy is read). `build.ts text` / `nightly.sh text` writes names + CV text only: no cards, no AI. Text per person is now 8,000 characters. (2) SCORE TOOL `rank`: the agent hands a SELECT of ids (5,000 at most) and the job in words; the chip search's own scoring orders that list and returns the best 60 with score and reasons, and how many it could not place (no title match). (3) VECTOR TOOL `similar` (`vectors.ts`): the sentence is embedded with `openai/text-embedding-3-small` through OpenRouter and cut to 1,024 numbers, as `convex/matching/agent2.ts embedText` does for CVs, then Qdrant `candidate_vectors` is searched, limited to the ids the agent's query kept; offered only when `OPENROUTER_API_KEY` and `QDRANT_URL` are set (`start.sh` passes `QDRANT_URL`, default `http://qdrant:6333`, and `QDRANT_API_KEY`); `/health` shows `meaningSearch`. `start.sh` also passes `C141_CHIP_AGENT2`. None of the three has run against the real Cloudflare, Qdrant or model. Test: `tests/chipagent2.test.ts` (59).

## Model provider (5 Nov 2026)

With `ANTHROPIC_API_KEY` set (and `C141_LLM_PROVIDER` not `openrouter`) the DeepSeek rows in the model table above are answered by Claude Haiku 5.5 on the Anthropic API instead: `convex/lib/llm.ts` `getAnthropicClient` for the Convex calls, `src/lib/ai.ts` `callAnthropicTask` for the app's (`write`, `gemini`, referenceCv). The subscription bridge still goes first where it did. Research runs Serper/SearXNG searches and Haiku answers from those results (`researchGrounded`); sources are only the results it cites. Embeddings stay on OpenAI / OpenRouter.

**Haiku only, and cached (5 Nov 2026, later):** with the key set, `askClaudeFirst`, `askBridge`, the CLI scoring (`claudeMatch`), CLI web search and the CV vision bridge all step aside (`hasToken()` is false, `haikuOnly()` in `src/lib/claudeSub.ts`), so every answer is `claude-haiku-5-5` on the API. `anthropicModelFor` ignores `C141_MODEL_*`; `C141_RESEARCH_PROVIDER` does not apply; the reference-CV parser drops its OpenRouter/OpenAI fallbacks; the jdParser drops NVIDIA. System prompts carry `cache_control` in both runtimes.

<!-- skill-meta
verified-commit: 8728b251
verified-hash: 86b98d4bc6c2c42e4a6aabab01d66d34595baafb
verified-date: 2026-11-28
sources:
  src/lib/engineSearch.ts
  src/lib/scoring.ts
  src/lib/dbMatch.ts
  src/lib/claudeMatch.ts
  src/lib/claudeBridge.ts
  src/lib/booleanScore.ts
  src/lib/levels.ts
  src/lib/searchScope.ts
  src/lib/searchIntent.ts
  src/lib/referralSearch.ts
  src/lib/referralExport.ts
  src/components/db/ReferralResults.tsx
  src/app/api/referral/**
  src/app/openings/[id]/referral/**
  src/lib/referenceCv.ts
  src/lib/lookalikeMatch.ts
  src/lib/matchingNow.ts
  src/lib/matchingSnapshot.ts
  src/lib/openings/matching.ts
  src/lib/embed.ts
  src/app/database/**
  src/app/search/page.tsx
  src/app/openings/[id]/database/page.tsx
  src/app/api/internal/claude/route.ts
  src/app/api/lookalike/search/route.ts
  src/app/api/cron/nightly/route.ts
  src/components/db/**
  src/components/MatchingStatus.tsx
  convex/matching/**
  convex/lib/jdParser.ts
  convex/lib/claudeFirst.ts
  convex/lib/roleLevel.ts
  convex/lib/currentRoleClassifier.ts
  convex/lib/searchRoleEvidence.ts
  convex/lib/referralSearch.ts
  convex/lib/qdrant.ts
  convex/cvs/cvScoring.ts
  convex/cvs/cvScoringActions.ts
  convex/ta/matching.ts
  convex/ta/search.ts
  convex/ta/referenceSearch.ts
  convex/ta/requirements.ts
  docs/DATABASE-SEARCH-ROLE-EVIDENCE.md
  tests/dbmatch.test.ts
  tests/searchEngineRoleRanking.test.ts
  convex/lib/contactRule.ts
  convex/extras/contactDiscovery.ts
  convex/integrations/contactsHttp.ts
  docs/CONTACT-DISCOVERY-API.md
  tests/contactRule.test.ts
-->
