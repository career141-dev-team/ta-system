# AURA flow check - the new UI against the old TA System

Kept by the flow-checker chat. One section per screen: what the old TA System does,
what the new UI has, and every gap. The old system is the reference (read-only copy:
`ta-system/.claude/worktrees/flow-reference`, origin/main dc21f6e6, 13 Nov 2026).
"Old" paths are in that copy; "new" paths are in this repo. The new UI is sample data
only, so nothing saves yet - gaps are about what a person can SEE and DO, and which
rules the screen must enforce once it is wired.

Severity: **MUST** = TAs rely on it, or a rule would break. **SHOULD** = expected.
**NICE** = small. Status: open / fixing / fixed / owner to decide.

Builder chats: if you are building one of these screens, read its section first.

**13 Nov, 08:50 - fixes started.** A second checker chat confirmed sections 1 to 7 with
its own reading of the old code and fixed the first batch (see "Fix log" at the end).
The Today builder: sections 6.1 to 6.5 are the workday rules your T2 / T3 screens need
(pick a position and a work type, no TA work before the day is started, the checks).

---

## 1. Opening screen (`src/app/openings/[id]/page.tsx`) - checked 13 Nov

| # | Gap | Old | New | Sev | Status |
|---|-----|-----|-----|-----|--------|
| 1.1 | Access: a TA without access gets a "request access" form, others "Opening unavailable"; a client seat sees only the JD and the pipeline from Client shortlist on; Midday/End of day only for people who can act | `openings/[id]/layout.tsx:37-61`, `ProjectSidebar.tsx:142-218`, `lib/visibility.ts` | every row for everyone | MUST | open (needs sign-in; note for wiring) |
| 1.2 | **End of day** row and view: the set/review email to the Director or client, paste the reply and "place it for me", review history | `ProjectSidebar.tsx:158`, `openings/[id]/eod/page.tsx` | missing | MUST | open |
| 1.3 | **Overview content**: counts (In pipeline, CVs today, Days in / target), health bar, **JD approval card** (gates posts, scoring, website, snippets), brief notes, job details, matching status, suggested actions (unscreened CVs, open set, ready for Director, follow-ups), per-stage counts linking to each stage, recent activity, "About this opening" (team, lead, sets, reference, needs attention) | `openings/[id]/page.tsx:82-291` | only title row + two link columns | MUST | open (no Figma for these yet - owner to decide where they go) |
| 1.4 | **Edit the details** (position, package, currency, locations, nationality, headcount, **priority P1-P5**) and **Change the team** (seats, TA lead; lead only by admin or current lead) | `OpeningAdmin.tsx:80-239`, `page.tsx:293-321` | missing; priority not shown at all | MUST | open |
| 1.5 | Status menu needs `opening.manage`, Placed/Closed stamps the close date and tells the team (no reason asked); Stage menu only for people who can act on the opening and refreshes their workday checks | `ContextBar.tsx:36-57`, `StatusMenu.tsx:86-110` | both menus for everyone, save nothing | MUST | open (wiring) |
| 1.6 | Targets per TA, editable by admin/lead | `TargetsTable`, `page.tsx:146-152` | fixed 15 / 20 | SHOULD | open |
| 1.7 | Website switch (who may, needs open + approved JD, amber when hidden) | `ContextBar.tsx:58-63`, `WebsiteSwitch.tsx` | missing | SHOULD | open |
| 1.8 | Delete opening (to the Bin, says candidate count and 7-day restore) | `OpeningMenu.tsx:76-116` | missing | SHOULD | open |
| 1.9 | Team on the opening (TA initials) in the header | `ContextBar.tsx:72-86` | missing | SHOULD | open |
| 1.10 | LinkedIn Job row lists its posts (live/paused dot, applicants, delete) and "+" adds a post; live only after JD approval | `ProjectSidebar.tsx:338-489` | one plain row | SHOULD | open (for the LinkedIn Job builder) |
| 1.11 | Midday email: "+" starts Email N, off after the EOD is sent, today's emails with status | `ProjectSidebar.tsx:491-505` | one plain row | SHOULD | open (for the Midday builder) |
| 1.12 | Missing rows: Referral Search, Headhunting Overview, Excel Tables "+ L" and the person's L1, L2 sheets, Scoops "Processing" badge | `ProjectSidebar.tsx:149-330` | missing | SHOULD | open |
| 1.13 | Work locations (tabs, rows scoped by location) | `pipeline/[stage]/page.tsx:84`, `ProjectSidebar.tsx:82-88` | missing | SHOULD | open |

## 2. Pipeline (`src/app/openings/[id]/PipelineBoard.tsx`) - checked 13 Nov

| # | Gap | Old | New | Sev | Status |
|---|-----|-----|-----|-----|--------|
| 2.1 | **Stages**: TA Follow-up, AI Follow-up, **Director Review**, Director shortlist, Client shortlist, Interview, Offer, Placed, then **Rejected** and **Dropped out** | `data/types.ts:330-341`, `ProjectSidebar.tsx:293-315` | no Director Review, Rejected, Dropped out | MUST | **fixed 13 Nov** - Director Review, Rejected and Dropped out are columns now (`pipelineRules.ts` STAGES) |
| 2.2 | **Move rules**: only allowed moves (nothing by hand into AI Follow-up; Placed not dragged back); Interview needs a booking form; Offer = "Make offer", Placed = "Record placement"; Director Review needs CV + expected salary + notice period; Director/Client shortlist only by people who decide; out of Placed only desk-wide roles | `lib/pipeline.ts:57-168`, `RowActions.tsx:158-215`, `pipelineWrites.ts:49-53` | any drop accepted | MUST | **fixed in the UI 13 Nov** - `checkMove` (`pipelineRules.ts`, with its check file) gates every drop and the card menu; a column the card may not enter turns red and a notice says why; Interview / Offer / Placed open their form first. Wiring: the backend stays the judge |
| 2.3 | **Reject / Dropped out with a required reason** (preset list + Other); on Offer, "Declined" with reason then "Find cover" | `RowActions.tsx:10-31,228-422`, `pipelineWrites.ts:55-57` | no reject at all | MUST | **fixed in the UI 13 Nov** - `MoveForm.tsx`: a reason (the old list + Other) is required before Rejected / Dropped out; at Offer it is "Declined the offer" with its own reasons. Open: "Find cover" after a decline |
| 2.4 | **Place needs package + signed offer letter**; "Record the offer" (salary, basis, currency, start, terms); "Decline" with reason; then "Mark the opening Placed" | `ClosingPanel.tsx:19-224` | drop on Placed/Offer just moves | MUST | **fixed in the UI 13 Nov** - forms: Book the interview (date, time, how, minutes), Record the offer (salary, per, currency, start), Record the placement (joining date, agreed package, signed offer letter under 10 MB - all required). Open: "Mark the opening Placed" is only a line of text in the form |
| 2.5 | Undo is a second real move once wired (stops follow-ups, fires offer/placement events, Placed is locked) | `pipelineStateMachine.ts:124-270` | local swap | MUST | **fixed 13 Nov** - a move that recorded something (reason, booking, offer, placement) has no Undo; a plain move keeps it. Wiring: Undo = a real reverse move |
| 2.6 | **Claim / owner lock**: moving into TA Follow-up claims the candidate ("Already shortlisted by X"); someone else's candidate shows "Shortlisted by X - You cannot contact" with no actions; a TA sees own + unclaimed | `pipelineWrites.ts:59-75`, `CandidateRow.tsx:158-169`, `CandidateList.tsx:140,402` | anyone drags any card | MUST | **fixed in the UI 13 Nov** - another TA's card is locked (no drag, no menu); a candidate nobody owns must be shortlisted first, and Shortlist (the card menu) claims them, gives the set number and puts them in TA Follow-Up. Open (wiring): a TA sees only own + unclaimed; "X already claimed" on a race |
| 2.7 | Card shows: name links to candidate page, source tag, "Didn't reply", "Needs CV / salary / notice", Add-on / Backup badges, working contact links, match reason, age/experience/education/package, "Saved by X", "In stage since date - Set N" | `CandidateRow.tsx:75-238` | fewer fields; Salary/Notice chips are fixed; ⋮ does nothing | MUST | partly 13 Nov - the CV / Salary / Notice Period chips now mean it (grey = on record, amber = still needed before Director Review); Add-on / Backup badges; lock. Open: name -> candidate page (3.1), source tag, "Didn't reply", age / education / package, "Saved by", "since date - Set N" |
| 2.8 | **Card actions**: Add-on, Backup (needs someone at Interview/Offer), Change stage, Reject/Declined, Back to Excel Tables, Add to another job, follow-up actions (Aura call, WhatsApp, Email -> conversation -> Send/Stop), Shortlist | `RowActions.tsx:85-258`, `CandidateRow.tsx:170-224`, `FollowUpActions.tsx` | only CV preview | MUST | partly 13 Nov - the card menu has: every allowed stage (refused ones greyed with the reason), Add-on, Backup, **Shortlist** on an unowned card, **Add to another job** (pick a job -> their TA Follow-Up, the original stays). Open: Back to Excel Tables, the follow-up actions (Call / WhatsApp / Email conversation, Stop follow-up) - they need a design (Pipeline Automations is on the screen plan) |
| 2.9 | Follow-up stage controls: Automatic follow-up On/Off, follow-up questions (standard + per job), Ask a question | `pipeline/[stage]/page.tsx:100-196` | "Automations" button does nothing | MUST | open |
| 2.10 | "Add candidate" has no old equivalent; candidates come in by: Upload headhunted CV (TA Follow-up, needs workday + work location), Scoops upload, Shortlist from Database CVs / LinkedIn Job, Excel Tables "Add to pipeline", Add to another job | `HhUpload.tsx`, `scoops/page.tsx:60`, `database/page.tsx:115` | button does nothing | SHOULD | owner to decide what it opens |
| 2.11 | Filters: search, experience 5+/10+/15+, notice <=30/<=60, Add-ons/Backups/Neither, mine, work location, kept in the address; Director Review grouped by day | `CandidateList.tsx:59-356` | All jobs / Recruiter / Priority / Source; none of the old ones; not in the address | SHOULD | **fixed in the UI 13 Nov** - Experience (5+ / 10+ / 15+), Notice (30 / 60 days or less) and Add-on / Backup pills beside the design's four; one row at 1267. Open: filters kept in the address, work location, Director Review grouped by day |
| 2.12 | Counts from real data; stage stats (at this stage, sets closed, longest waiting); "N of M"; 25 a page | `pipeline/[stage]/page.tsx:86-95`, `CandidateList.tsx:22,343-451` | fixed 96 | SHOULD | open (wiring) |
| 2.13 | Bulk: tick rows, Shortlist selected, Download CVs (ZIP), bulk move with required reason, Remove from this job, bulk work location | `CandidateList.tsx:371-394`, `BulkSelect.tsx`, `lib/bulkStages.ts` | none | SHOULD | open |
| 2.14 | List view has the full row actions | `CandidateList.tsx` | read-only table | SHOULD | open |
| 2.15 | Touch devices cannot move cards | menus work everywhere | drag only | NICE | **fixed 13 Nov** - the card menu moves a card on a phone or tablet |

## 3. Navigation - checked 13 Nov

| # | Gap | Old | New | Sev | Status |
|---|-----|-----|-----|-----|--------|
| 3.1 | **Candidate page** from a name: tabs CV, Prepared CV, History, Call Log, Chat, Reference, Company Reference; Previous/Next "N of M"; actions; interviews; closing panel; "In N openings"; Director review details; review notes | `candidate/[appId]/page.tsx` | card opens only a CV preview | MUST | open (no Figma yet - owner) |
| 3.2 | Every view and stage has its own address (links from bells, suggested actions, back from the candidate page); reload keeps the view | `pipeline/[stage]/page.tsx:42-43` | view in memory; reload returns to Overview | MUST | open |
| 3.3 | Openings list page | `openings/page.tsx` | /openings redirects to the demo opening | SHOULD | open (Binath's O1/O2) |
| 3.4 | Back: old title band returns to Overview; new Back raises the bar | `ContextBar.tsx:46-52` | Back raises the bar (owner's choice 12 Nov) | NICE | as designed by the owner |
| 3.5 | Views not built yet open "not built yet" | each is a working page in old | ComingView | SHOULD | open (builders' screen plan) |
| 3.6 | Headhunting views join the bottom bar, though view.ts says they are not in it | - | `view.ts:16-18` comment vs behaviour | NICE | open (fix the comment or the bar) |

## 4. Scoops (`src/app/openings/[id]/ScoopsView.tsx`) - checked 13 Nov

| # | Gap | Old | New | Sev | Status |
|---|-----|-----|-----|-----|--------|
| 4.1 | **Shortlist claims the scoop**: owner + set number, moves to TA Follow-up, "Shortlisted as set N - moved to TA Follow-up"; refused "X already claimed this candidate" | `actions.ts:381-494` (`claimForTa`) | removes the row, toast only | MUST | **fixed in the UI 13 Nov** - the notice says "shortlisted as set N - moved to TA Follow-Up". Open: the card does not appear on the Pipeline board yet (each view holds its own sample data); refusal "X already claimed this candidate" |
| 4.2 | Shortlisted scoops stay in the list: own rows show stage + actions (stage change, Reject with reason, Drop out); another TA's row shows "Shortlisted by X - You cannot contact"; only Dropped out is hidden | `scoops/page.tsx:37`, `CandidateRow.tsx:158-196` | row disappears | MUST | partly 13 Nov - another TA's scoop shows "Shortlisted by X" and Shortlist is off with "You cannot contact". Own shortlisted rows still leave the list (the design's slide-out) - owner to decide |
| 4.3 | **Real upload + reading status**: "Waiting for a CV reader", "Extracting...", estimate; ends "Added as a scoop" / "Not added" (held: "Already shortlisted on this opening by X") / "Could not be read" (Try again, Remove) / "Not found"; "Still not finished" after 10 min | `ScoopUpload.tsx:31-323` | fake 1-2 s bar, always succeeds | MUST | partly 13 Nov - "Could not be read" with Try again / Remove is built (sample: an empty file). Open: the real reading steps, "Not added" (held), "Still not finished" |
| 4.4 | **Workday gate**: no upload until the workday is started with this opening on it - "You cannot upload scoops yet... Open Today's Checks" | `scoops/page.tsx:41-60`, `WorkdayBlocked.tsx`, `api/scoops/upload/route.ts:64` | missing | MUST | **fixed in the UI 13 Nov** - before Start workday the upload panel is replaced by "You cannot upload or shortlist scoops yet" with a Start workday link, and Shortlist is refused in words. Open (wiring): "this opening is not on today's workday" |
| 4.5 | Only people on the opening may upload ("You are not on this opening...") | `route.ts:36-40` | missing | MUST | open (wiring) |
| 4.6 | "Sent by" picker (Not said / Director / TA Lead / Ops) | `ScoopUpload.tsx:219-235` | missing | SHOULD | **fixed in the UI 13 Nov** - "Sent by" select in the tools pill. Wiring: saved with each upload; the real Directors / TA Leads / Ops by name |
| 4.7 | File limits: PDF/DOC/DOCX only (no RTF), 10 MB, 10 per drop ("Up to 10 CVs at a time..."), 3 at once | `ScoopUpload.tsx:14,133,242`, `route.ts:48-58` | accepts RTF, no limits | SHOULD | **fixed 13 Nov** - PDF / DOC / DOCX only, 10 MB each, 10 per drop, each with its notice. Open (wiring): 3 at once |
| 4.8 | Duplicates: same person found, existing row flagged, another TA's person "held" | cv-extraction skill 6 | every upload a new row | SHOULD | open (backend; UI shows "held") |
| 4.9 | Upload queue kept across reload (24 h), "Processing" badge on the Scoops row, "Clear finished" | `ScoopUpload.tsx:52-129`, `ProjectSidebar.tsx:99-121` | in memory only | SHOULD | open |
| 4.10 | Tick scoops -> "Remove from this job" (to Dropped out, undoable) | `CandidateList.tsx:385-393` | missing | SHOULD | open |
| 4.11 | List tools: counts ("Scoops on this opening", "Not shortlisted yet"), filters in the address, 25 a page, bulk Shortlist / Download CVs / move / work location, Add to another job | `scoops/page.tsx:53-58`, `CandidateList.tsx` | text filter only | SHOULD | partly 13 Nov - the two counts are shown beside Back. The rest open |
| 4.12 | Row details (contacts, age, experience, education, package, source, Add-on/Backup, stage + since + set) and the name opens the candidate page | `CandidateRow.tsx:75-238` | name, title, location, company | SHOULD | open (needs 3.1) |

## 5. CV viewing (`CvPreview.tsx`, `CvPages.tsx`) - checked 13 Nov

| # | Gap | Old | New | Sev | Status |
|---|-----|-----|-----|-----|--------|
| 5.1 | **Download** the original CV | `CvFrame.tsx:248-255`, `api/cv/[candidateId]/route.ts:44-76` | missing | MUST | **fixed 13 Nov** - Download button on the CV preview (a plain link). Wiring: the server's CV route |
| 5.2 | **Prepared CV** (as the Director/client gets it, with the movable green CAREER141 box, saved) | `PreparedCvEditor.tsx`, `candidate/[appId]/page.tsx:668-675` | missing; the no-file fallback is a made-up sample | MUST | open |
| 5.3 | **Upload / Replace CV** (only New CV, Matched, Follow-up stages, not locked; keeps typed details) | `ReviewDetailsForm.tsx:313-586` | missing | MUST | open (lives on the candidate page, 3.1) |
| 5.4 | Word CVs shown as PDF from the server; other files "not a PDF... Download it" | `api/cv/[candidateId]/route.ts:46-55` | "Word file" placeholder | SHOULD | open (wiring) |
| 5.5 | Missing file: "...was lost when the system moved... upload their CV again" / "No CV file is on record" | `data/convex/backend.ts:787-794` | "This CV could not be opened." | SHOULD | open |
| 5.6 | Open in a new tab; real browser full screen | `CvFrame.tsx:187-245` | in-page Full view only | SHOULD | partly 13 Nov - "Open in a new tab" added. Open: real browser full screen |
| 5.7 | Pipeline card CV is hard-coded (p1/p2 by name) | - | `PipelineBoard.tsx:522-529` | SHOULD | open (sample data; wiring) |

## 6. Today and the workday (`src/app/today/`) - checked 13 Nov

| # | Gap | Old | New | Sev | Status |
|---|-----|-----|-----|-----|--------|
| 6.1 | **Start workday**: pick an assigned position + work type (100% / Follow-up / Add-on), 100% shows that position's checks first; refusals in plain words ("This job has no TA Lead yet...", "Today's workday is already finished..."); tells the TA Lead | `Workday.tsx:177-247,704-717`, `convex/ta/workdays.ts:55-83,1776-1829` | button does nothing; caption promises an AURA brief the old system does not have | MUST | open (T2/T3 designs pending - owner) |
| 6.2 | **No TA work until the day is started** (uploads, stage moves: "Your workday has not started today...", "X is not on today's workday... Add another position") | `convex/lib/workdayScope.ts:26-38` | no started-day state | MUST | **fixed in the UI 13 Nov** for "started today" - `src/lib/workday.ts` (`useWorkdayGate`, TAs only) gates Pipeline moves, marks and Shortlist, and Scoops upload and Shortlist; `WorkdayBlocked.tsx` says why. Open (wiring): which positions are on the day ("X is not on today's workday... Add another position") |
| 6.3 | **Today's checks per position** (100%: JD reviewed, LinkedIn post, Suggestions, own Excel profiles, Director Review candidates, ChatGPT research link, EOD sent, Midday; Follow-up/Add-on fewer); five can be excused with a reason; status + "Open task page" + history; they block the EOD send | `lib/workdayRequirements.ts:53-90`, `lib/workday.ts:115-182`, `Workday.tsx:249-282` | missing | MUST | open |
| 6.4 | The day ends by itself with the first final 100% EOD (or the last EOD on a Follow-up day): "Today's workday is finished - Finished <time>"; unclosed days expire at midnight | `Workday.tsx:230-233,611,706-714` | missing | MUST | open |
| 6.5 | Add another position (max 10 a day, max 5 at 100%), change work type | `Workday.tsx:694-701`, `workdays.ts:1844-1847` | missing | SHOULD | open |
| 6.6 | Old TA home: "N open roles - N needing attention - N interviews ahead", Your targets today, Today in order (alerts with due time + action), My openings cards (LinkedIn, Follow-up, CVs today, days used, what it needs next), Upcoming interviews, When you have a moment. The new three numbers do not exist in the old system | `src/app/page.tsx:89-273` | fixed line + three sample numbers | SHOULD | owner to decide (T2/T3 may cover it) |
| 6.7 | Different home per role (lead, director, ops dashboards) | `page.tsx:44-87`, `components/dash/*` | one Today for all | SHOULD | owner to decide |
| 6.8 | Today's Checks panel on every page (pinned right for TAs, drawer for leads) | `Workday.tsx:819-909`, `layout.tsx:99-112` | missing | SHOULD | owner to decide where it lives |
| 6.9 | Sent EOD emails (31 days, Edit and resend), previous workdays | `Workday.tsx:676-744` | missing | SHOULD | open |
| 6.10 | Team checks for leads/admins/directors | `Workday.tsx:747-809` | missing | NICE | open |

## 7. Top bar (`src/app/TopNav.tsx`, `NavLinks.tsx`) - checked 13 Nov

| # | Gap | Old | New | Sev | Status |
|---|-----|-----|-----|-----|--------|
| 7.1 | **Bell opens a list** of notifications (title, body, time, link; workday ones open Today's checks), real unread count ("9+"), Mark all read, checks every 10 s, chime | `NotificationBell.tsx:204-380` | link to an empty /alerts, fixed red dot | MUST | **fixed in the UI 13 Nov (sample data)** - `TopMenus.tsx`: the bell opens a list (title, body, when, link, unread dot, "N new", Mark all read, See all alerts); the red dot shows only while something is unread. Wiring: latest 30, re-check every 10 s, chime |
| 7.2 | **Alerts** (computed SLA items) are separate from notifications, with their own page (All / Unread / Read, mark read, bulk, everyone's for leads); now unreachable | `lib/sla.ts`, `app/alerts/page.tsx` | /alerts = "next to build" | MUST | owner: where do Alerts live in the new design? |
| 7.3 | **Person menu**: People and roles, Feedback, Shortlist decisions, Settings, dark mode, **Sign out**, version | `TopNav.tsx:177-235`, `SignOut.tsx` | initials only, not clickable | MUST | partly 13 Nov - the person's button is a menu: name, role, People and roles (`/people`, placeholder page), Sign out (`/signin`, placeholder page). Open: Feedback / Shortlist decisions / Settings by role, dark mode (no dark design), version |
| 7.4 | Who sees which links: Strategy Planner only admin/director/TA Lead; TA Track + Targets only admin/TA Lead; desk Excel Tables only TA Support; Voice/Feedback not TAs | `TopNav.tsx:77-87`, `lib/auth.ts` | same five for everyone - a TA now sees Strategy Planner and TA Track | SHOULD | open (by role, when sign-in is wired) |
| 7.5 | Search: on a list page it searches that list ("Search candidates in this stage"...); elsewhere /search (openings + candidates, paged, Download CVs); an ask-the-desk assistant on every page | `lib/searchScope.ts`, `app/search/page.tsx`, `layout.tsx:100` | always /search (not built) | SHOULD | open |
| 7.6 | Dropped links with no other way in: **Clients**, **Alerts** (7.2), Reports, Targets (TAs saw theirs on the old home), Voice agent, Feedback (old widget on every page), **Bin** (7-day restore), desk Excel Tables, Extras | `TopNav.tsx:18-49` | not in the owner's 5-link design | NICE | owner to decide where they live |

---

## Fix log

**13 Nov 2026, first batch (flow-checker chat).** Sample data only, nothing saves. Type-check
and lint clean; walked in the browser at 1267x587, 1920x950 and 375x667.

- New: `src/app/openings/[id]/pipelineRules.ts` (stages, allowed moves, who decides,
  reasons - the old system's own lists) with `pipelineRules.check.mjs`
  (`node "src/app/openings/[id]/pipelineRules.check.mjs"`); `MoveForm.tsx` (reason /
  interview / offer / placement, the browser's own "required"); `CardMenu.tsx`;
  `Toast.tsx` (moved out of ScoopsView, now shared, with an amber "refused" look);
  `src/app/TopMenus.tsx` (bell list, person menu); placeholder pages `/people`, `/signin`.
- Changed: `PipelineBoard.tsx` (10 columns, rules on drop, lock, chips, menu),
  `ScoopsView.tsx` (shortlist notice, lock, counts, Sent by, limits, could-not-be-read),
  `CvPreview.tsx` (Download, Open in a new tab), `TopNav.tsx` (uses TopMenus).
- For the builders: a new view that moves a candidate should call `checkMove` and open
  `MoveForm` rather than move directly; a refusal goes through `Toast` with `warn`.

**Data the backend must send for these (when wired):** per card - owner (id, first name),
what Director Review still needs (CV, expected salary, notice period), add-on / backup
marks; per person - role (TA / TA Lead / admin / Director) for `decides()`; per shortlist -
the set number; per upload - the outcome (added / held by X / could not be read); the
notifications list with unread flags.

**Next, in order:** 4.4 + 6.1 to 6.3 the workday gate (after the Today builder lands T2);
3.2 an address per view; 2.8 follow-up actions and Add to another job; 2.11 the old
filters (experience, notice, add-ons / backups); 1.2 End of day row; 1.12 Referral Search
row. Waiting on the owner: 1.3 Overview content, 3.1 the candidate page, 7.2 / 7.6 where
Alerts, Clients and Bin live, 4.2 whether a shortlisted scoop stays in the list.

**13 Nov 2026, second batch (flow-checker chat, about 11:00).** Type-check, lint and the
rules check clean; walked in the browser at 1267x587.

- New: `src/lib/workday.ts` - the started day (moved out of `today/TodayScreen.tsx`, which
  now imports it) with `useWorkday`, `startWorkday` and `useWorkdayGate`;
  `src/app/openings/[id]/WorkdayBlocked.tsx`.
- Changed: `PipelineBoard.tsx` (the gate on every move; three more filter pills; Shortlist
  for an unowned card; Add to another job; unowned sample cards only in the two follow-up
  stages), `ScoopsView.tsx` (the gate on upload and Shortlist), `pipelineRules.ts`
  (`owned: false` -> "Shortlist them first"), `CardMenu.tsx`, `MoveForm.tsx` (a "which job?"
  question).
- **For every builder:** a new view where a TA uploads, shortlists or moves someone reads
  `useWorkdayGate()` and shows `WorkdayBlocked` / refuses with the gate's sentence.
- **On a fresh browser the board and Scoops are now locked until Start workday is pressed on
  Today** - that is the TA System's rule (a TA Lead, admin, Director or Ops person is not gated).

**Not done, and why.** 3.2 (an address per view) needs `OpeningView.tsx`, which a builder
was editing at 10:53 for the Midday / End of day email view - do it when that lands.
1.2 End of day: check the builder's `DailyEmailView` against section 1.2 when it lands; the
old system has End of day as its own row. Waiting on the owner: 1.12 Referral Search (a 9th
ATS row breaks the card's 8 equal rows), 7.4 links by role (a TA would lose Strategy Planner
and TA Track from the design's five), plus the list under "Next" above.


---

## 8. Whole-system pass - 16 Nov 2026 (flow-checker chat)

Every built screen compared again with the old TA System (copy at origin/main dc21f6e6),
after the owner added all the screens. Sample data only, nothing saves.

### Fixed in this pass (tsc, eslint and all five check files clean; walked at 1267x587)

| # | What was wrong | Fix |
|---|---|---|
| 8.1 | **"View as" only changed the top bar and the homes.** The Pipeline's rules, the workday gate, whole-job views, New opening, Openings' Bin, Feedback and the email all read a fixed sample TA - a Lead was locked out of the board and could never decide a shortlist | `useMe()` in `src/lib/role.ts`; every screen reads it. `USER` and `SEES_WHOLE_JOB` removed from `src/lib/user.ts`. Checked: as Lead no workday strip on the board and "Move to Director Shortlist" allowed |
| 8.2 | **A shortlist in Scoops, LinkedIn Job, Database CVs or Excel Tables said "moved to TA Follow-Up", but the board never showed them** | `pipelineInbox.ts`: each shortlist lands at the top of the board's TA Follow-Up, with its CV, source and "needs salary / notice period". Checked: Scoops shortlist -> card on the board (96 -> 97) |
| 8.3 | **"JD approved" was three separate things**: approving the JD unlocked nothing, LinkedIn Job and Snippets were always approved | `jdState.ts`: one flag for the opening, read by JD, LinkedIn Job (go live), Snippets and Database CVs (run matching again refused before approval). Restoring a version keeps it approved, as the old system does |
| 8.4 | Renaming a LinkedIn post lost the old title as a matching name | The old title is added to "Also known as" |
| 8.5 | New opening: follow-up defaulted ON, nationality default "Any", a TA could put other TAs on it and add a new client | Follow-up OFF and local hire by default; a TA is on their own opening only; only a lead adds a new client (a TA picks one of theirs) |
| 8.6 | Database chat "Add to a job" ignored the collision lock and left people unowned | Adding claims them for this TA; someone another TA claimed is left alone and named |
| 8.7 | Strategy Planner open to every role | `strategy/PlannerOnly.tsx`: a TA or Ops person sees "Strategies are planned by your TA Lead" and a link to their openings |
| 8.8 | Feedback board: Ops could review everyone's | Ops sees only their own, as in the old desk |
| 8.9 | A lead could not settle an email that "could not confirm it was sent" | Reason box + Verified sent / Verified not sent |
| 8.10 | The workday never ended | DailyEmailView calls `endWorkday()` on the first sent original 100% End of day (Today's side built by the other chat) |

### Small list - FIXED 16 Nov (owner "Yes, fix them"), all items below except where marked

Type-check, lint, five check files and build:static green; spot-checked in the browser (LinkedIn Job, JD). Notes: Database CVs' Undo is its own bar (Toast has no button); Research/Suggestions/Referee files were also reformatted by Prettier.

~~Still open - small, fits the design~~

- LinkedIn Job: a TA sees every post and others' applicants (old: own posts + others locked); post actions not limited to the recruiters on it; links not checked; links not clickable; no "show more" (tab says 14, four rows).
- JD: no "approved by <name> · <date>" and Copy; Re-read offered before approval.
- Snippets: card contact must be the signed-in TA's own; chat "title to X" blanks the second line.
- Research: Run again / Find them again only once per opening for a TA (then lead/Director/admin/Ops); "I reviewed" only for a TA working this job at 100%.
- Suggestions: no first-round state - with nothing suggested yet, round 1 cannot be started ("Find profiles to headhunt").
- Excel Tables: no "Shortlisted first by <TA>"; no way back from Not interested; no "All" tab across sheets; "In pipeline" chip not a link; notes not readable on touch.
- Database CVs: "Not for this job" has no confirm and no way back; the job is dropped when opening the whole database.
- Strategies (TA side): no "Date done"; note and proofs only after Mark as done; proof refusals silent, no 5 MB limit.
- Email: only TAs are held to the checks (a lead's End of day link is optional); missed days need the research link and show only days with unsent candidates.
- Automations: the switch only applies on Save.
- Openings list: Bin with no confirm and no candidate count.
- Bin: deleting a client must be refused while its openings are still in the Bin.
- Today rail: a position row should open the opening and show "EOD sent <time>"; Start with no position should not be allowed.
- Referee Calls: TA Support writes own calls and sees every TA's.

### Needs the owner (no design, or a choice)

- **Per-candidate follow-up** (WhatsApp / Email / Call conversation, Take over / Hand back, Stop follow-up) - TAs use it all day; it lives on the old candidate page.
- **The candidate page** (CV, Prepared CV, History, Call log, Chat, Reference) and opening a card's name.
- **Director replies** on the End of day page: "Waiting on the Director", paste the reply -> "Read it and move them", "A reply came into shortlists@ - place it for me".
- **Openings list**: a TA sees every opening (old: their own; "My openings" default); Request access + the lead's approve queue; row facts (follow-up, CVs today, sets, JD waiting); status, working stage and Website switch on the row.
- **Lead view of a TA's day** (checks per position, reasons, "I reviewed this CV as TA Lead").
- **Excel Tables**: Upload headhunted CV; outcomes Contacted / Responded / CV received / Unreachable (HH Overview counts them); lead's "Work by person" and notes for the TA; work location tabs.
- **Database CVs / LinkedIn applicants**: bulk tick (Shortlist selected, Download CVs, Remove from this job), filters, row contact details.
- **Strategies**: several TAs per strategy; a lead taking a TA off after acceptance; submissions readable after "Mark as read".
- **Pages with no screen**: Clients, Alerts page, Reports, Targets, People, Voice, Extras, Intake (CV queue), Recruiter review, Database scan, one person outside an opening, a stage with its own address.
- Admin in "View as"; Feedback's admin step (In progress; only admin / Director mark fixed).
