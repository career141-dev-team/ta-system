# Test report — LinkedIn Search engine

26 Nov 2026. Package: `Career141-data/linkedin-search-engine/`. Where files go: `README.md`.

## Result in one line

**138 of 138 tests pass, and the types are clean.** Three real searches worked. One search came back partial because its must-have was too narrow. The real test cost **$5.52**, which is $0.52 over the $5 cap. **$18.51 is left**, so the director's $10 is safe. The CFO search was not run, so the budget was not exceeded further.

## 1. Unit tests with a fake Crustdata server (no spend)

These run with `npm test`. Each file covers:

| File | Tests | What it covers |
|---|---|---|
| `tests/linkedinSearch-crustdata.test.ts` | 18 | Queue (6 Agent starts/min and 5 normal searches/min; the 7th waits instead of being refused), 429 waits for `x-ratelimit-reset`, 402 stops, the reserve guard, 403 locked fields dropped then retried, timeout → cancel ($0), failed search, cancel, empty result, idempotency (the same key is charged once, with or without the credit header), network retry |
| `tests/linkedinSearch-results.test.ts` | 15 | Years written as text, columns read by meaning, swapped headline and title, blanks, the real Agent output file, repeats (by link and by name + company), location check, company spread and cap, flags, the "never drop on a title check" rule, area years from dated jobs, group exclusions, the real 26 Nov column names |
| `tests/linkedinSearch-form.test.ts` | 27 | **The 11 real TA requests** and the OPEN-RISKS scenarios (see section 2), search types, refine and widen, idempotency key, the owner's location default (6 tests) |
| `tests/linkedinSearch-engine.test.ts` | 21 | Questions stop before any spend, full search, a repeat costs $0, saved people come first, timeout or failure falls back to the normal search, gap fill, column variants, wrong countries hidden and the list topped up to 30, repeats, show more, cancel, 402, learning, find one person, market count, team queue, spend report, opt-out, similar people moved lower |
| `tests/linkedinSearch-adversarial.test.ts` | 50 | Written by a **separate checking agent**. Round 1 found 24 real defects and round 2 found 7. All 31 are fixed and now stay as guards (`guard (was a defect): …`). |

The defects the checker found were all fixed:

- A one-line request was wiped out by the word "salary".
- Exclusions were missed ("no Brandix", "John Keells" cut to "John").
- "Sri Lanka / overseas" raised no question.
- An all-caps line put junk into the title.
- The QS wordings gave different keys.
- The TA's caps line at the end lost to the JD.
- "Company:" lines were not excluded.
- The "LinkedIn Headline" column was read as the URL, tenure was read as total years, and the HQ column was read as the company.
- Null rows crashed the reader.
- Merged repeats came back.
- The company cap broke the 30-row count.
- Cancel did not work across actions.
- Spend was logged twice across instances.
- A negated industry ("no banking experience") was searched.
- "Manager Quality Assurance" was cut short.
- The "similar to rejected" rule lowered every row.

## 2. Form + check on the 11 real TA requests

The full output is in `reports/FORMS.md`. Run it again with `node scripts/form-report.ts --rules` (free) or without `--rules` (uses Claude Haiku, a few cents).

| Request | Form (main points) | Questions |
|---|---|---|
| Shihab, AM Strategic Planning (2 pastes) | **Same form and key for both pastes.** Assistant Manager level, lives in Sri Lanka (Colombo), client Delmo excluded; salary, benefits and working terms removed | Years (the stored JD was cut before the years line) |
| Samali, solar JD (3 pastes) | **One key for all 3.** Assistant Engineer, executive level, 3–5 years, solar installers (not manufacturers); no place named → Sri Lanka (owner's default) | None (ready) |
| Samali, solar + "only Sri Lanka" + "solar manufacturing" | Sri Lanka, 3–5 years in solar PV, the TA's titles kept, one must-have, soft skills removed | **JD vs TA clash: installers or manufacturers?** |
| Sanduni, EHS Manager (2 tries) | EHS Manager, heavy manufacturing; lives in Sri Lanka (default / "Sri Lankans") | Years |
| Sameera, CFO Ananta | **Target AGM–GM, not CFO**; fabric, not garment; CA/CIMA checked in the headline, not sent; Ananta excluded; package removed | **Where: Sri Lanka or Sri Lankans overseas?** and years |
| Shihab, Executive Strategic Planning | Executive – Senior Executive; **the TA's 4–8 years beat the JD's 4–6**; CAPEX must-have; the TA's title list kept; "Exposure to FMCG" is a nice-to-have | **Level vs years clash** |
| Shakya, Assistant Engineer E&M | Waradala, Sri Lanka; 3–5 years; manufacturing; HV/LV must-have; **salary, nationality, gender and "suggest companies" removed** | None (ready) |

The scenario requests also work:

- The QS clean and shorthand wordings give **the same key**.
- Sri Lankans in the UAE becomes "lives in UAE, studied in Sri Lanka".
- A broad request makes the check ask first.
- The MAS/Brandix exclusion works.
- Several roles are split, and the city is read as where the person lives.
- A fresh-graduate request gets a warning.
- A COO JD with a target of GM/Director searches only the target.

**The AI reader (Claude Haiku)** fills only fields with fixed words: role, level, place, years, area and a known industry. Its must-haves are only *suggestions* for the TA, because it worded them differently on each run of the same JD. Across the 19 requests, 17 calls cost a few cents.

## 3. Real searches (Crustdata, 26 Nov)

| Search | Shown | From Agent | Time | Cost | Matches the plan's retest? |
|---|---|---|---|---|---|
| Sri Lankans in UAE, QS 8+ years | 30 | 30 | 94 s | 3.92 cr ≈ **$1.18** | **Yes.** All 30 live in the UAE (Dubai, Abu Dhabi, RAK), 8–24 years, all 5 ticks met; Turner & Townsend 9, Currie & Brown 8. The cost is higher than the earlier $0.52 because the level rule adds checks. |
| Solar Assistant Engineer, Sri Lanka | 30 | 26 (+4 from the normal search) | 172 s | 6.47 cr ≈ **$1.94** | **Yes.** All in Sri Lanka, with Assistant Engineer, Electrical Engineer and Assistant Electrical Engineer titles at solar firms; solar years shown (3.0–4.7). Gaia Greenenergy has 10 of 30, so use "at most N per company". |
| Executive Strategic Planning | 30 | **10** (+20 from the normal search) | 135 s | 7.99 cr ≈ **$2.40** | **Partly.** Crustdata found only 10 people with CAPEX experience, because the TA's "ONLY CAPEX PROFILES" became a must-have. The other 20 are basic rows (Senior Business Analyst and similar). The plan's retest had no CAPEX rule. |
| CFO fabric | not run | — | — | — | Not run, to protect the budget. |

**Bugs that only the real runs showed (all fixed and tested):**

- Crustdata named a column "Location (city and country)". It was read as the country, so all 30 people were hidden.
- `basic_profile.last_updated` is not a valid field, which made the top-up fail.
- "City not listed" and "(inferred)" in the city text were not handled.
- Normal-search rows had no company.
- Normal-search rows were ranked above Agent rows.

**Cost findings for the owner:**

- **Measured on 26 Nov (2 small calls, $0.24):** the normal search costs **0.03 credits a person** with basic fields, and **0.13 credits a person** with the company (+$0.03 a person). So "show more" with the company is about **$1.17** for 30 people. (The first top-ups that day billed 0.106 credits a person without the company. That is not explained; watch the spend log.)
- Agent Search cost $1.18–2.40 here, against $0.60–0.87 in the plan. Tighter forms add checks and cost more.
- Company now comes back on every normal-search row (5 of 5 in the cost test).

**Spend:** $5.52 in total. The UAE search was $1.18, and solar + strategy were $4.34 (Agent $3.29, normal-search top-ups $1.05). The balance went from $24.02 to **$18.51** (61.69 credits), then to **$18.27** after the $0.24 company-cost test, then to **$16.04** after the $2.22 joined-rules test. On 26 Nov another key (#40913, from a server) spent about $5.80; the CEO search then spent $2.49 (owner approved using part of the director's credit). **$7.70 left.** The reserve guard stops any paid call that would go below 35 credits.

## 3b. Joined-rules cost test (26 Nov, $2.22, owner approved up to $3.50)

| Search | Full rules | Joined rules | Same people | Quality |
|---|---|---|---|---|
| Sri Lankans in UAE, QS 8+ years | 3.92 credits, 30 people, all checks met | **3.01 credits (−23%)**, 30 people, all checks met | 22 of 30 | **Same** |
| Solar Assistant Engineer (3–5 years in solar) | 6.23 credits, 27 people, solar years for 26 | **4.41 credits (−29%)**, 26 people, solar years for 20 | 12 of 26 | **Weaker** (fewer solar years verified, more "Project Engineer") |

Decision: `queryStyle: "auto"` — joined rules only when the form has no area years and no must-haves.

**Top-up:** now off by default (owner). The joined test ran with it off: no basic-search cost; solar showed 26 and the
note "Press Show more".

## 3c. Owner's CEO request (26 Nov, $2.49)

CEO / COO / VP calibre, apparel or textile, activewear / athleisure / sportswear in their career, Sri Lankans in
Sri Lanka or anywhere. The free check first found 5 defects (industry "not apparel", location, titles, main criterion,
fake client name); all fixed with tests (144 pass). Result: **30 people**, 114 s, 8.30 credits = $2.49; all Director
to C-level, 20-40 years; 27 of 30 with activewear evidence (2 unknown); 27 live in Sri Lanka, 3 abroad
(Bangladesh 2, Ethiopia 1). MAS 4, INQUBE 3, Ananta 2, Brandix 2.
**Gap:** "lives in Sri Lanka" also lets in foreigners who live in Sri Lanka; nationality is never guessed from names.

## 4. Not covered

- The CFO fabric search and the Gulf/Bangladesh/India local searches were not run on Crustdata.
- Convex wiring was not built (the TA System team does it): the table-backed rate gate, the tables, and cancel across actions through the real store.
- The `--replay` runs reuse the recorded normal-search rows, so they cannot show the company-field fix. Only the next paid run will show it.
