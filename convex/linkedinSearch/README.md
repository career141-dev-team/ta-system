# LinkedIn Search engine (no UI) — hand-over to the TA System team

Built 25–26 Nov 2026 from `BUILD-BRIEF-LINKEDIN-SEARCH-ENGINE.md` and the Full Plan v1.2 (sections 3–9).
TypeScript, no runtime dependencies. Pure functions where possible; every outside call is passed in.
Test results and the real-search report: `TEST-REPORT.md`.

## 1. Files (already in place in this pull request)

| File | What it does |
|---|---|
| `convex/linkedinSearch/types.ts` | Standard form, check result, result row, settings, `Llm` type |
| `convex/linkedinSearch/vocab.ts` | Levels, short forms, functions, places, qualifications, industries + look-alikes, pure SHA-256 |
| `convex/linkedinSearch/form.ts` | Request / JD / opening → standard form (rules; optional LLM), form key, refine, widen |
| `convex/linkedinSearch/check.ts` | Free check: questions, warnings, removed items, split roles; `answerToEdits` for answer buttons |
| `convex/linkedinSearch/query.ts` | Agent Search query (full / joined / auto), normal-search, re-fetch and find-one bodies |
| `convex/linkedinSearch/crustdata.ts` | The only Crustdata caller: queue, retries, 402/403/429, timeout → cancel, spend + raw logs |
| `convex/linkedinSearch/results.ts` | Columns by meaning, years, area years, gap-fill merge, repeats, location check, flags, spread, rank |
| `convex/linkedinSearch/store.ts` | `Store` interface (→ Convex tables) + in-memory version for tests |
| `convex/linkedinSearch/engine.ts` | `search`, `searchForm`, `prepare`, `showMore`, `findOnePerson`, `refine`, `widen`, `cancel`, `spendReport`, `priceWatch` |
| `convex/linkedinSearch/index.ts` | Public surface |
| `tests/linkedinSearch-*.test.ts`, `tests/linkedinSearchFake.ts`, `tests/fixtures/linkedinSearch/` | 138 tests with a fake Crustdata server (no spend); run in `npm test` |

Nothing here is wired yet: no Convex functions, tables, pages or settings use it. The pure modules (`form`, `check`,
`query`, `results`, `vocab`, `types`) have no Convex or Node imports, so pages can import them too.

## 2. Interfaces you wire

| Interface | Where | Wire it to |
|---|---|---|
| `HttpFetch` | `createCrustdataClient({ fetch })` | `globalFetch` (Convex actions have `fetch`) |
| `apiKey` | `createCrustdataClient({ apiKey })` | `process.env.CRUSTDATA_API_KEY` — **server settings only, set through the release pipeline**. Never the owner's test key. |
| `RateGate` | `createCrustdataClient({ gate })` | **A Convex-table version** (one row per call, `by_bucket_time`): several actions run at once, so the in-memory gate is not enough in production. Limits in `LIMITS`: 6 Agent starts / min, 5 normal searches / min, 300 reads / min. |
| `onSpend` | client option | `spendToStore(store)` → insert into **`liSpend`** (kind, credits, usd, crustdataRef, userId, searchId, openingId). |
| `onRaw` | client option | Insert raw responses into a raw-response table; **delete after 30 days** (plan, section 9). |
| `reserveCredits` | client option | `liSettings` (0 in production; tests used 35 to keep the director's $10). |
| `Store` | `createEngine({ store })` | Convex tables `liSearches`, `liProfiles`, `liResults`, `liSpend`, `liFeedback`, `liPools` (plan section 11). `matchSaved` = the free saved-people match (use the `li_profiles` Qdrant collection + `savedMatchScore`). `heldBy(url)` and outcomes = existing Excel Table rows by LinkedIn URL. `optOut` = delete every trace (purge migration with `dryRun`). |
| `Llm` | `createEngine({ llm })` | A thin wrapper over `convex/lib/llm.ts` (Claude Haiku, `jd_extraction`): `({system,user,maxTokens}) => text`. Optional — without it the rules run alone. |
| `LlmCache` | `extractForm(req, { cache })` | A small table keyed by text hash, so the same JD always gives the same form. |
| `Settings` | `createEngine({ settings })` | `liSettings` (results 30, show more 30, declined 180 days, hide client staff, timeout 300 s, credit price, reserve, max per company, poll 10 s, company in normal search, auto top-up off, query style auto). |
| `onProgress` | `SearchContext` | Page progress line ("waiting in the team queue", "searching, about 1–2 minutes"). |

`engine.cancel(searchId)` works inside the same action. Across actions, store the Crustdata search id
(`liSearches.crustdataSearchId`, set by `onStarted`) and call `client.cancelAgent(id)` from the cancel mutation's action.

## 3. How the page uses it

```ts
const engine = createEngine({ crustdata, store, llm, settings });
const { form, check } = await engine.prepare(request);            // free: form + questions
// TA answers: answerToEdits(form, code, answer) → refineForm(form, edits); "keep" → add code to `accepted`
const out = await engine.searchForm(form, { userId, openingId, accepted });
// out.status: "questions" | "market_count" (show count, call again with marketCountSeen) | "done" | "cancelled" | "failed"
await engine.showMore(out.searchId, { userId });                   // 30 basic rows, no repeats
await engine.refine(out.searchId, { totalYears: { min: 6, max: 10 } }, { userId }); // one field, judged people hidden
await engine.widen(out.searchId, "level", { userId });
await engine.findOnePerson({ name, company } | { url }, { userId });
```

Each `ResultRow` has: must-have ticks (function, level, years, industry, location), title, company, city, country,
total years, years in the area (approximate), LinkedIn link, data date, Crustdata evidence, qualifications in the
headline, flags (thin, above / below level, other function, at client, seen before, city not reported, declined,
unreachable, held by) and plain warnings. Hidden rows keep a `hiddenReason`. TAs do not see prices.

## 4. Decisions taken in the build (please confirm)

1. **AI must-haves are added (owner, 26 Nov).** For a pasted JD the AI adds must-haves up to 3 in all
   (`form.aiMustHaves`); the page shows a remove button on each, and extras stay as one-click suggestions
   (`form.suggestedMustHaves`). The AI answer is kept per JD text (`LlmCache`), so the same JD still gives the same
   search and a repeat stays free. Removed items (salary, gender, degrees, soft skills) never come back through the AI.
2. **Location default (owner, 26 Nov): Sri Lanka or Sri Lankans, unless the request says otherwise.**
   No place named → lives in Sri Lanka (no question; a note says so). Another country named (also a JD job location
   such as "Location - Dhaka") → Sri Lankans living there (lives there, studied in Sri Lanka). Only when the request asks
   for locals, another nationality or any nationality (or the India search type) → everyone in that country.
   City is a preference, country is the rule ("lives in Sri Lanka, preferably near Katunayake").
3. A **bare profession title with no level word** ("Quantity Surveyor") gets its level from the years (5–8 years →
   Senior Executive – Assistant Manager), with a note. With no years either, the check asks.
4. **"Sri Lankans" alone** = lives in Sri Lanka (same as the default in item 2). Never read as nationality from names.
5. **TAs do not mark people (owner, 26 Nov); they add good people to the opening's Excel Table.** People already in
   this opening's table are hidden in every new search, refine and show more for that opening ("already added by …"),
   and the place is filled by someone new. In other openings they show with "held by …". Show more never repeats
   anyone already shown. Wire `Store.addedToOpening(openingId)` to the opening's Excel Table rows (LinkedIn URLs).
6. **Company is always asked for (owner: "company is important").** The normal search (show more, top-up,
   fallback) asks for the current employer. **Measured 26 Nov: basic fields 0.03 credits a person; with the employer
   0.13 credits a person** (+$0.03 a person, about +$0.90 per 30). 5 of 5 rows came back with a company.
7. Working terms (hours, employment type, reporting line) are removed like salary, but not shown to the TA as a warning.
8. **Top-up only when the TA asks (owner, 26 Nov).** A short main-search list is shown as it is, with "N people from
   the main search. Press Show more for more people." (setting `autoTopUp`, off). Show more of 30 with the company
   costs about 3.9 credits ≈ **$1.17**.
11. **Joined rules where quality holds (setting `queryStyle: "auto"`).** Paid test 26 Nov ($2.22): UAE QS with joined
    rules cost 23% less, same quality (30/30 met every check, 22 of 30 same people). Solar (has years in an area) cost
    29% less but was weaker (solar years shown for 20 instead of 26). So joined rules are used only when the form has
    no area years and no must-haves; otherwise the full rules. Evidence is one search each — watch the first month.
9. **Agent rows rank first**; rows added from the normal search come after them, labelled.
10. **Rejections lower similar people**: same title as someone the director or client rejected for the opening
    (or marked not relevant, if marks are ever used) → moved lower with a note. Not hidden. Never the searched title.

## 5. Run the tests

```bash
node tests/run.mjs linkedinSearch
```

The paid test tools (`live-search`, `company-cost`, `form-report`) and the recorded Crustdata answers stay on the
owner's machine (`Career141-data/linkedin-search-engine/`). Crustdata data is internal only and is not in this repo
beyond one 3-row sample used by a test.
