---
name: linkedin-search
description: LinkedIn Search engine (Crustdata Agent Search) - request / JD -> standard form -> free check -> saved people first -> Agent Search -> checked result rows, plus show more, find one person, refine, widen, cancel, spend log. Aliases - LinkedIn Search, li search, Crustdata, Agent Search, standard form, free check, show more. Use when changing, debugging or extending convex/linkedinSearch/ or wiring it to pages and tables.
---

# LinkedIn Search engine

## Scope and boundaries

In this skill: everything under `convex/linkedinSearch/` (engine only, no UI) and its tests `tests/linkedinSearch-*.test.ts`, `tests/linkedinSearchFake.ts`, `tests/fixtures/linkedinSearch/`.
Not built yet (the TA System team wires them): the page `src/app/linkedin-search/`, Convex tables (`liSearches`, `liProfiles`, `liResults`, `liSpend`, `liFeedback`, `liPools`, `liSettings`), permissions `linkedin.search` / `linkedin.admin`, the contact step, purge jobs.
Neighbouring skills: /excel-tables - adding a found person to the opening's Excel Table (source "LinkedIn Search"), `heldBy` / `addedToOpening` read its rows by LinkedIn URL. /database-search - the 77,000-CV search; LinkedIn Search is NOT connected to it. /openings - the opening a search belongs to.
Design source: owner's Full Plan v1.2 (25 Nov 2026) and `convex/linkedinSearch/README.md` (decisions section 4). Code is the source of truth.

## How it works now

1. `form.ts:formFromRules(request)` - rules only, deterministic. Normalises text; takes out salary, benefits, working terms, notice period, gender, age, religion, marital status, nationality, ethnicity, soft skills and chat asks (`REMOVALS`, segment-based so a one-line request keeps its role / place / years). Reads title (`readTitle`, `cutTitle`), function (`FUNCTIONS`), target level (TA's own lines win over the JD title), years (TA "strong" lines - caps / must / only - win), years in an area (`areaName`), industry + look-alikes (`INDUSTRIES`), must-haves (max 3), exclusions (`readExclusions`, client from "Company:" lines and "(Pvt) Ltd"), split roles, fresh-graduate flag, qualifications (never sent; checked in the headline).
2. Location default (owner, 26 Nov): no place -> lives in Sri Lanka; another country (also a JD job location) -> Sri Lankans living there (`studiedIn: "Sri Lanka"`); `LOCALS` words (locals, other nationality, any nationality) or type `india` -> everyone there. City is a preference only.
3. `form.ts:extractForm(request, {llm, cache})` - optional LLM (Haiku via `convex/lib/llm.ts`) fills only fixed-word fields (role, level, years, area, a known industry) and adds must-haves up to 3 (`aiMustHaves`, removable by the TA); extras go to `suggestedMustHaves`. Answers are cached per text (`LlmCache`) so the same JD gives the same form.
4. `formKey(form)` = `c141-` + SHA-256 of the search-relevant fields -> Crustdata `Idempotency-Key` and saved-search key.
5. `check.ts:checkForm(form, accepted)` - free. Questions: missing role / level / years; clashes (level vs years, JD vs TA industry, two locations, overseas without a country); too broad; too many must-haves; split roles. Warnings: JD title vs target, default location, fresh graduates, removed items, qualifications. `answerToEdits` turns an answer button into form edits.
6. `query.ts:agentQuery(form, count, style)` - template 4.4 with fixed result columns. `queryStyle` "auto" (default): joined rules when there are no area years and no must-haves (26 Nov paid test: 23% cheaper, same quality), full rules otherwise.
7. `engine.ts:searchForm` - check -> market count only if `wantsMarketCount` -> same form key done before = reuse ($0) -> saved people first (`Store.matchSaved`, free) -> Agent Search for the gap (`crustdata.ts:runAgent`, poll 10 s, timeout 300 s -> cancel, free -> normal-search fallback) -> gap fill blanks by id -> `results.ts` checks -> history (table adds, outcomes, seen-before, held-by, similar-to-rejected) -> rank -> save. No automatic top-up (`autoTopUp` off): a short list says "Press Show more".
8. `showMore` - normal search, 30 rows, leaves out everyone shown in the chain. `refine` / `widen` - one field changed, `changed` lists it. `findOnePerson` - saved first, then normal search. `cancel` - in-process flag, or `cancelRequested` on the stored running search plus Crustdata cancel.

## UI surface

None in this change. The page must show: the form and questions (free), progress / queue / cancel, rows with five ticks (function, level, years, industry, location), warnings, "approximate" area years, data date, company spread, "Show more", an AI must-have remove button. TAs never see prices. "Internal use only" notice (Crustdata terms).

## Data

Today: `store.ts:memoryStore()` only (tests). `Store` interface maps to plan tables: `saveSearch/getSearch/findDoneSearchByFormKey` -> `liSearches` (state running|done|failed|cancelled, `cancelRequested`, `crustdataSearchId`); `upsertProfile/findProfile/matchSaved` -> `liProfiles` (+ Qdrant `li_profiles`); results inside the search record -> `liResults`; `logSpend/hasSpend/spend` -> `liSpend`; `getPool/savePool` -> `liPools`; `heldBy`, `addedToOpening`, `outcomesFor` -> existing Excel Table rows by LinkedIn URL; `optOut` -> purge with dryRun.

## Backend wiring

`crustdata.ts:createCrustdataClient({ apiKey, fetch, gate, onSpend, onRaw, reserveCredits })`. Base `https://api.crustdata.com`, header `x-api-version: 2025-11-01`. Endpoints: `POST /agent/searches` (+ `Idempotency-Key`), `GET /agent/searches/{id}`, `POST /agent/searches/{id}/cancel`, `POST /person/search`, `GET /account/credits`. Limits (`LIMITS`): 6 Agent starts / min, 5 normal searches / min, 300 reads / min - production needs a Convex-table `RateGate`. Env name: `CRUSTDATA_API_KEY` (server settings only; never a value in code). `onSpend` -> `engine.ts:spendToStore`.

## Access and roles

Planned capabilities `linkedin.search` (run searches) and `linkedin.admin` (settings, spend report) in `src/lib/auth.ts` - not added yet.

## Invariants and safety

- No search before the TA presses Search; the free check runs first; questions block.
- Never search gender, age, religion, marital status, ethnicity or nationality-from-names; never send qualifications.
- A charge is logged once per Crustdata reference (`hasSpend`); repeats with the same form key cost $0; cancelled / failed / empty = $0.
- Never drop a person only because Crustdata's own title check failed; hidden rows keep `hiddenReason`.
- People already in the opening's Excel Table are hidden in new searches for that opening.
- Crustdata data is internal only: no export, no client view; delete within 30 days of an opt-out or subscription end; keep raw responses 30 days.

## Known quirks, gaps and unverified items

- Agent Search is beta; price and output shape may change (columns are read by meaning in `results.ts:columnRole`).
- Normal search costs 0.03 credits a person (basic) and 0.13 with the employer (`normalSearchWithCompany`, on) - measured 26 Nov. One unexplained 0.106 / person bill that day.
- Joined-rules quality rests on one paid search per kind (26 Nov) (unverified at scale).
- Cross-action cancel relies on the store record; with Convex, poll reads must see the latest `cancelRequested` (unverified).
- "Not relevant" marks are supported but TAs do not mark (owner, 26 Nov); learning uses table adds and director / client rejections.

## How to change it safely

Run `node tests/run.mjs linkedinSearch` (fake Crustdata, no spend), `npx tsc --noEmit -p .` and `npx tsc --noEmit -p convex`. Add a test for every rule change; keep the 11 real TA requests in `tests/fixtures/linkedinSearch/requests/` passing. Paid checks are run by the owner only.

## History

- 25-26 Nov 2026: engine built outside the repo by the owner with Claude; 2 rounds of adversarial checks (31 defects fixed); 4 paid Crustdata tests; owner decisions recorded in the README section 4. Moved into the repo in this pull request.

<!-- skill-meta
verified-commit: 147a2af1
verified-hash: 5a421e380680872d3a0dc2258297196ca4b48939
verified-date: 2026-11-26
sources:
  convex/linkedinSearch/**
  tests/linkedinSearch*.ts
  tests/fixtures/linkedinSearch/**
-->
