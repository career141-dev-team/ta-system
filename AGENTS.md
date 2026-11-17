# AGENTS.md — read this before changing anything

For every developer and every AI chat working in this repository.

## What this is

**AURA** — the new screens for the Career141 TA System, built in their own repository
so the live TA System keeps running untouched until these are complete. Only the
screens are built here; the data will come from the TA System's backend. Today every
screen runs on **sample data** (made-up people, fake contacts) and saves nothing.

The reason AURA exists is speed: the old app slows down as data grows. So every screen
must read the backend in small pieces — one small query per view, read once when the
view first opens, never "load everything".

## The two pages to read first

1. **[DESIGN.md](DESIGN.md) — the design guidelines.** Every colour, font, size,
   corner, shadow and motion comes from there. No exceptions without the owner.
2. **[docs/FLOW-CHECK.md](docs/FLOW-CHECK.md)** — the old TA System compared with
   every built screen, gap by gap. Read a screen's section before building it.

## How the screens connect (the flow)

```
Sign in ─▶ Today (/today)
            │  T1 "Good morning" ── Start workday ──▶ T2 the workday (rail + AURA)
            │
Top bar on every page: Today · Openings · Strategy Planner · Database · TA Track
            │                     · Search or ask AURA (⌘K / Ctrl+K) · bell · person
            ▼
Openings ─▶ one opening (/openings/[id])
            Overview: title row, Status / Stage, then two lists of views
              ATS:         Pipeline · Scoops · LinkedIn Job · Job Description ·
                           Database CVs · Snippets · Strategies · Midday email
              Headhunting: Overview · Research · Suggestions · Excel Tables · Referee Calls
            Clicking a view opens it IN PLACE (no page change). Every view opened
            stays alive and hidden, so coming back is instant.
            The bottom bar (rises at the bottom edge): Job (back to this opening,
            in neither set) · ATS | Headhunting switch · that set's views.
            ATS starts with Pipeline; Headhunting starts with its own Overview.
            A click switches; ← → move inside the set.
```

| Screen | File(s) | State |
|---|---|---|
| Top bar | `src/app/TopNav.tsx`, `NavLinks.tsx`, `TopMenus.tsx` | built |
| Today T1 / T2 | `src/app/today/` (`TodayScreen` picks which) | built |
| Opening overview | `src/app/openings/[id]/page.tsx`, `OpeningView.tsx`, `view.ts` | built |
| Pipeline board | `PipelineBoard.tsx`, `TickList.tsx`, `CardMenu.tsx`, `MoveForm.tsx`, `pipelineRules.ts` | built |
| CV preview | `CvPreview.tsx`, `CvPages.tsx` (pdf.js) | built |
| Scoops (list + reading view) | `ScoopsView.tsx` | built |
| Midday / End of day email | `DailyEmailView.tsx`, `EmailParts.tsx` | built |
| Pipeline Automations | `Automations.tsx` | built |
| LinkedIn Job | `LinkedInJobView.tsx`, `filters.ts`, `liftMenu.ts` | built |
| Headhunting Overview | `HhOverview.tsx` | built |
| Headhunting Research | `ResearchView.tsx` | built |
| Headhunting Suggestions | `SuggestionsView.tsx` | built |
| Headhunting Excel Tables | `ExcelTablesView.tsx`, `FindCvButton.tsx` (shared) | built |
| Database D1 + D2 (chat with AURA; a person opens in a panel beside it, Add to job / Shortlist through the chat) | `src/app/database/DatabaseView.tsx`, `aura.ts` | built |
| TA Track TT1 + TT2 (the team / one TA: rings, where the time goes, CVs to Director, trend, AURA notes; day timeline, websites with tracker detail, tracking status; Today/Week/Month/Custom, CSV) | `src/app/ta-track/TaTrackView.tsx`, `data.ts` | built (sample data shaped like whf-tracker rows) |
| Openings O1 (lists by category, filter popover, ⌘K spotlight, New opening sheet read by AURA) | `src/app/openings/page.tsx`, `OpeningsView.tsx`, `Spotlight.tsx`, `NewOpening.tsx`, `data.ts` | built |
| ATS Database CVs (matches for the job, CV beside the list, Shortlist / Not for this job) | `DatabaseCvsView.tsx` | built |
| ATS Job Description (draft, approve, chat, versions, match chips) | `JobDescriptionView.tsx` | built (shane123-tech, fitted 14 Nov) |
| ATS Snippets (1080 social card, PNG, LinkedIn caption, chat) | `SnippetsView.tsx` | built (shane123-tech, fitted 14 Nov) |
| ATS Strategies (accept, mark done, note + proofs, submit) | `StrategiesView.tsx` | built (shane123-tech, fitted 14 Nov) |
| Everything else | `src/app/NotBuilt.tsx` pages, `ComingView` in `OpeningView.tsx` | "next to build" |

Sample people and the signed-in user are placeholders (`src/lib/user.ts`); the rules
each screen enforces (who may move a candidate, upload limits, checks before an email)
are copied from the old TA System and named in comments, so they can be wired to the
backend later without guessing.

## Rules

1. **Implement the owner's Figma designs exactly**, on top of DESIGN.md. Do not design
   screens yourself; when the old TA System has something the design lacks, list it
   for the owner instead of inventing it.
2. **Animation is GSAP only**, imported from `src/lib/gsap.ts`.
3. **Never push or publish** until the owner says "push" / "publish". Uncommitted work
   is normal here.
4. **Several chats work in this folder at once.** Run `git status` and look at file
   times before writing; one chat per screen's files; never overwrite another chat's
   work.
5. Every new screen is wired into the top bar or the opening's rows the same day — no
   dead links.
6. Check every screen at 1920×950, 1267×587 (one view, no page scroll) and 375×812.

## Run it

```bash
npm install
npm run dev            # http://localhost:3000
npx tsc --noEmit       # types
npx eslint src         # lint
npm run build:static   # static site in out/ (the shared dev link)
```

This is Next.js 16 with Cache Components; APIs differ from older Next.js. Read
`node_modules/next/dist/docs/` before using something new.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
