---
name: targets
description: Daily targets (Targets nav item, "targets", "daily CV target", "LinkedIn links target", "L's target") - a TA lead or admin sets, per TA per opening, CVs per day and LinkedIn links (Excel sheet) per day; the TA sees them with today's progress inside the opening and on the dashboard. Use when changing, debugging or extending targets.
---

# Targets

## Scope and boundaries

In this skill: the `taTargets` table, `convex/ta/targets.ts`, the `/targets` page, the targets table on the opening Overview and on the TA dashboard.
Neighbours: seats and openings /openings; the Excel sheet (`linkVault`) /excel-tables; shortlisting /sets-shortlist; workday checks /workday.

## How it works now

- One row per (job, TA) in `taTargets`: `cvsPerDay`, `linksPerDay`, `setBy`, `updatedAt`. Same numbers every day until changed; no date ranges.
- Progress is today (Colombo day, `colomboDayStart`): CVs = `applications` the TA shortlisted on that job today (`by_workday_owner`, `shortlistedAt`); links = `linkVault` rows the TA added today (`by_workday_added`). These are the counts the workday checks use.
- Rows are built only for active recruiter seats (`jobAssignments`, primary/supporting). A TA with no target row shows "no target set".

## UI surface

- Top nav "Targets" (`src/components/TopNav.tsx`) for `admin` and `ta_lead`; page `src/app/targets/page.tsx` groups by TA, editable.
- Opening Overview (`src/app/openings/[id]/page.tsx`): "Your targets" for a TA (own row), "Targets" for lead/admin (every TA on the job, editable).
- TA dashboard (`src/app/page.tsx`): "Your targets today". Shared table: `src/components/TargetsTable.tsx`.

## Backend wiring

`ta/targets:board` (lead/admin, all), `mine`, `forJob` (lead/admin see all TAs, a TA only self), `set` (mutation). Web wrappers `targetsBoard/targetsMine/targetsForJob` in `src/data/convex/backend.ts`; server action `setTargets` in `src/app/actions.ts`. Non-Convex (local in-memory) mode shows no targets.

## Access and roles

`maySetTargets` in `convex/lib/targetsAccess.ts` (uses `deskRole`, so leads stored as ta_manager/senior_ta count). Directors are not included. The `/targets` page checks the web role as well as the backend.

## Invariants and safety

Targets are whole numbers 0-1000 (`cleanTarget`). `set` refuses a TA not on the job's team. Targets never message candidates.

## Known quirks, gaps and unverified items

- CVs count shortlisted today, not "sent to the Director" (the EOD effort rule); the two can differ until the EOD is sent (unverified with the owner).
- Soft-deleted (binned) openings are not filtered out of the board (unverified).
- No history of past days' progress.

## How to change it safely

Keep counting rules in sync with `convex/ta/workdays.ts`. Schema change reaches live only through the release pipeline.

## History

3 Nov: added.

<!-- skill-meta
verified-commit: 9dda426
verified-hash: 73ca5543638b65d2e2787bcdd606942abee8456c
verified-date: 2026-11-03
sources:
  convex/ta/targets.ts
  convex/lib/targetsAccess.ts
  src/app/targets/**
  src/components/TargetsTable.tsx
  tests/targets.test.ts
-->
