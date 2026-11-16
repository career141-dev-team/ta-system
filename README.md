# Career141 TA System

The talent-acquisition platform Career141 runs its recruiting on: Next.js 16 app
(`src/`) on a self-hosted Convex backend (`convex/`).

> **This is production.** https://ta-system.career141.com runs on the live database
> behind api.career141.com (78,000+ real candidates). Read [`AGENTS.md`](AGENTS.md)
> before changing anything, and [`docs/TEAM-WORKFLOW.md`](docs/TEAM-WORKFLOW.md) for the
> full playbook.

## What it does

| Area | What it covers | Feature skill |
| --- | --- | --- |
| Openings | Client → Opening → Job Posts, status, health, Website switch (lists a job on career141.com), public job link | `openings` |
| Pipeline | Follow-up → … → Director Review → Placed, plus Rejected and Dropped out | `sets-shortlist` |
| Shortlist and Sets | Owner lock on shortlist, five CVs in a Colombo day close a set, Director/client reply reading | `sets-shortlist` |
| CV intake | TA upload, ZIP/folder, mail, WhatsApp, Workable → text/OCR → extraction into a candidate | `cv-extraction`, `email-intake` |
| Scoops | CVs a Director, Lead or Ops person sent a TA, uploaded on the opening | `scoop` |
| Follow-up | TA and AI follow-up by WhatsApp/email for CV, salary, notice period; automatic 24-hour reminders; replies answered from one number per opening | `follow-up` |
| Voice screening | Aura, the AI voice agent (LiveKit): role, current and expected salary | `voice-agent` |
| Database search | Search across the ~78k-CV database, Referral Search with Excel export of picked referees, lookalike search, per-opening matches | `database-search` |
| Headhunting | Research, Suggestions, Excel Tables (link vault, L-sheets), Referee Calls | `excel-tables` |
| Workday | Today's Checks drawer, work modes, per-job evidence, automatic completion, Team checks | `workday` |
| EOD and Midday email | Daily email to the Director desk with prepared-CV PDFs and workbook, REVISED corrections | `eod-email` |
| Targets and Strategy | Daily CV and LinkedIn-link targets per TA; Strategy Planner for Leads | `targets`, `strategy-planner` |

Each skill in [`.claude/skills/`](.claude/skills/) describes how that feature works
**today** (flows, files, tables, guards, quirks). Read it before changing the feature and
update it in the same pull request (`node .claude/skills/skill-sync/staleness.mjs check`).

## Run it locally

```bash
npm install
deploy/local/start-app.sh      # local Convex backend on 127.0.0.1 only, dev sign-in
```

`npm run dev` serves the app on http://localhost:3100. A local run must never point at a
live address.

## Before you push

```bash
npm test                    # all suites must pass
npx tsc --noEmit -p .       # app types
npx tsc --noEmit -p convex  # backend types
```

## Ground rules (short form)

- **Never touch the live backend from a laptop.** Live changes go only through the
  release pipeline ([`.github/workflows/deploy-production.yml`](.github/workflows/deploy-production.yml)).
- **Branch → pull request → `main`.** Never push straight to `main` or `production`.
- **No secrets in anything tracked.** `.env*` stays local.
- **Real candidates are real.** Outbound messages go through `convex/lib/outreachSafety.ts`
  and `convex/lib/outboundGuard.ts`; data changes are migrations with a `dryRun`.

## Where things are

| Path | What |
| --- | --- |
| `src/` | Next.js app (pages under `src/app`, API routes under `src/app/api`) |
| `convex/` | Backend: schema, functions, crons, `lib/` guards, `mailIntake/`, `pipeline/` |
| `deploy/` | Local stack (`local/`) and the production server layout ([`production/README.md`](deploy/production/README.md)) |
| `docs/` | Plans, runbooks, recovery notes, API docs ([`CI-CD.md`](docs/CI-CD.md), [`HOSTING.md`](docs/HOSTING.md), [`LOAD-REDUCTION-PLAN.md`](docs/LOAD-REDUCTION-PLAN.md)) |
| `.claude/skills/` | One skill per feature, plus `merge-teammate` and `skill-sync` |
| `tests/`, `scripts/` | Test suites and tooling |
