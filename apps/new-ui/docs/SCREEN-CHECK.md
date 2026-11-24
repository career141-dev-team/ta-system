# Screen check — new UI against the old TA System (AURA)

16 Nov 2026. Every screen of `ta-system-ui` compared, step by step, with the old TA
System (`career141-dev/ta-system`, origin/main dc21f6e6). Read from the code; the new UI
runs on sample data, so this checks that each step **exists**, not that it is wired.

✅ there · ⚠️ there but different · ❌ missing · 🟦 changed on purpose (owner's decision, not a gap)

---

## 1. Today — a TA (T1 start, T2 workday, T3 plan)

**Old home, before the day**
1. Greeting + "N open roles · N needing attention · N interviews ahead" ⚠️ T1 shows sample numbers
2. "Your targets today" (CV and LinkedIn targets the lead set) ❌
3. "Today, in order" — urgent alerts with due time and action button ❌
4. "My openings" cards (LinkedIn, Follow-up count, CVs today red under 10, days of target, next need) ❌
5. "Upcoming interviews" (confirmed / not contacted) ❌
6. "When you have a moment" (routine alerts) ❌

**Workday / Today's Checks**
1. Start = pick an assigned position + work type, then Start ⚠️ new starts with no position, positions picked after
2. Preview of the 100% position's checks before Start ❌
3. Refusals: no TA Lead on the job / day already finished / no other positions ❌
4. Starting rings the job's TA Lead ❌
5. At most 10 a day, 5 at 100% ✅ (16 Nov: a 6th 100% is refused)
6. Change work type ✅ (16 Nov: blocked once that position's EOD is sent)
7. Checklist per position ✅ (16 Nov: under the chosen position in the rail, by work type, ring = progress, "N before EOD")
8. "Couldn't do it" with a reason, edit, withdraw ✅ (16 Nov; telling the lead waits on the backend)
9. "Why this must carry forward" ❌ (candidate checks only, hidden from a TA in the old drawer too)
10. "I reviewed this CV / the JD", "why no profiles" ❌
11. Day ends by itself at the first 100% EOD ✅ (16 Nov: clock stops, "Today's workday is finished") · unclosed days expire ❌
12. Sent EOD emails (31 days) and Previous workdays on the panel ❌
13. Panel pinned on every page for a TA ❌ only on /today
14. AURA day plan, Start with X, Change something — new, no old match

## 2. Homes — Lead, Director, Ops
1. Lead: The team today table ✅ · Needs a decision ✅ · Every open role + not-on-LinkedIn ✅
2. Lead: search and paging on the lists ❌
3. Lead: team checks — filters, drill-down, approve/decline a request, review a CV as lead, reconcile an email ❌
4. Director: 4 stats, sets waiting, stage bars, by client ✅ (🟦 LKR, not $)
5. Ops: with clients, to chase, interviews, assigned to you ✅

## 3. Top bar, bell, name menu, Bin
1. Links Today, Openings, Strategy Planner, Database, TA Track (+ Excel Tables for TA Support) 🟦 every role (owner)
2. Clients, Reports, Targets, Voice agent, Extras ❌ not built
3. Search 🟦 always the Database chat (old: scoped to the page)
4. Bell: list, read on click, Mark all read ✅ · time on each, "9+" count, chime, banner ❌
5. Alerts page (All / Unread / Read, bulk) ❌
6. Name menu: Tell us, My feedback / board, Bin, People & roles, View as, Dark mode, Sign out ✅ · 🟦 Shortlist decisions and Settings removed (owner)
7. Bin: openings + clients, days left, Restore, Delete now for desk-wide ✅ · purge date ⚠️ days only

## 4. Openings list and New opening
1. Opens on "My openings" for a TA ❌ everyone sees everything
2. Tabs with counts ✅ · 4 cards + See more ⚠️ (old: 20 a page)
3. Search ⚠️ the Spotlight (⌘K)
4. Filters client, TA, sort ✅ · country, industry ❌ · TA filter for everyone ⚠️ · not in the address ❌
5. Card: client, title, priority, day of target, Needs a TA ✅ · Follow-up / Director / CVs today counts, TA names, posts, locations, footer ❌
6. Status and working-stage menus on each card ❌
7. On-website switch ❌
8. Delete to Bin ⚠️ one card at a time, no candidate count
9. Request access + the lead's approval queue ❌
10. New opening: role + client required, new client inline, locations with headcount, nationality, gender, team, auto follow-up ✅
11. Recorded brief ⚠️ speech-to-text, no audio kept, no consent check
12. After create: TA goes to the JD ⚠️ toast only · lead "Create and add another" ❌

## 5. One opening — overview
1. Access gate (request access / unavailable / client seat limits) ❌
2. Title, client, Status, Stage menus ✅ ⚠️ no permission check · Placed/Closed stamps a date ❌
3. Targets per TA editable ⚠️ fixed
4. **Overview content** — counts, health bar, JD approval card, briefs, suggested actions, stage counts, activity ❌
5. Edit details (priority, currency, headcount), Change the team ❌
6. Website switch, Delete, team initials ❌
7. Work-location tabs ❌
8. An address per view (reload, bell links) ❌

## 6. Pipeline
1. Ten stages ✅ · move rules (`checkMove`) ✅ · reasons for reject/drop-out/decline ✅
2. Book interview ⚠️ no name, place/link, interviewer, notes
3. Offer and placement (package + offer letter) ✅ · Find cover after a decline ❌
4. Claim lock, Shortlist claims ✅ · Undo on a plain move ✅
5. Card menu: Add-on, Backup, Add to another job ✅ · Back to Excel Tables ❌ · follow-up actions (call, WhatsApp, email, send/stop) ❌
6. Automations (switch, 4 standard + 12 questions) ✅ · "Ask a question" ❌
7. Filters experience, notice, add-on/backup ✅ · mine, location, Director Review by day ❌
8. Stage stats, real counts, 25 a page ❌
9. Bulk: tick, shortlist, download ZIP, move, remove ❌
10. Add candidate ❌ button does nothing (old: headhunted-CV upload)
11. Card: name to candidate page, source tag, "Didn't reply", age/education/package ❌
12. CV preview: Download, new tab, Full view ✅ · Prepared CV ❌

**Candidate page** (old `candidate/[appId]`) 🟦 owner 16 Nov: no separate page - the Pipeline card shows the details and the CV popup has "Ask about this CV". Old page had — CV, Prepared CV, History, Call log, Chat,
Reference, Company reference, previous/next, name edit, salary/notice, Replace CV, screening
call, follow-up panel, interviews, closing panel, notes, "In N openings". No new screen.

## 7. Scoops
1. Counts, upload + Shortlist for those who act, workday gate, Sent by, 10 MB / 10 files ✅
2. Progress, "Could not be read", Try again ✅ · queue survives a reload, Processing badge ❌
3. Shortlist claims, lock, row stays, Shortlist selected ✅
4. Bulk remove / move / location / download / another job ❌
5. Filters ⚠️ not in the address, no paging

## 8. LinkedIn Job
1. Counts, no-post warning, post chips + All posts ✅
2. Add/edit post with every old field, campaign code ✅
3. Pause / Resume / Go live (needs approved JD) / Reopen / Close ✅ · Back to draft ⚠️
4. Delete ⚠️ does not say how many candidates stay
5. Move CVs, Test a subject ✅
6. Applicants ⚠️ tabs + fit % (old: unscreened only, by score band) · Not a fit reason ✅
7. Bulk stage/remove ❌

## 9. Job Description
1. Own notes + Record notes ❌
2. Others' briefs ❌
3. Generate / Regenerate the JD ❌
4. Edit the JD text by hand ❌ chat only
5. AI chat, versions + restore ✅
6. Approve and open the job, stays editable ✅
7. Only an assigned TA writes ✅ · "Assigned to" line ❌
8. Job details form + Re-extract ❌ read-only chips + Re-read

## 10. Database CVs (in an opening)
1. Matched / unclaimed counts ✅ · whole-database count ❌
2. Search the whole database, Run matching again ✅ · stuck/failed messages ⚠️
3. Filters ⚠️ Fit, Notice, City only (old: companies, skills, schools, industries, titles, nationality)
4. Grouped by job level ❌
5. Shortlist + lock, Not for this job, workday gate ✅
6. Bulk shortlist / remove ❌

## 11. Snippets
1. JD-approved gate, sourcing seat, level picker, fonts, 1080 PNG ✅
2. Edit each text block ⚠️ font, colour, one size, underline only
3. Polish with AI ⚠️ chat with no model yet
4. Copy caption — new

## 12. Strategies (TA side)
1. Lead link, Accept all, Accept first, done + note + proofs, resubmit, struck rows ✅
2. Counts and empty state ⚠️
3. Pick the date done ⚠️ always today
4. Fill in a ticked row nobody is on (puts you on it) ❌

## 13. Midday & End of day email
1. Midday 1, 2…, drafts saved, sent read-only, recipients, subject, editable table, effort, referee calls ✅
2. Checks block Send, midday first, attachments, send states, revise, missed days, 31 days ✅
3. 🟦 Private-window tick removed (owner 13 Nov)
4. 🟦 Add rows and columns (owner 14 Nov) — the old server refuses a changed list; needs the backend's yes
5. Lead's reconcile buttons on "Could not confirm" ❌
6. Work-location emails ❌

## 14. Referral Search
1. 🟦 In the Database chat, Referees mode; the opening tab opens it
2. Title/company/industry chips, name list, tick, export, copy ✅ (CSV, not xlsx)
3. "Maybe — similar name" grading, copy not-found, "search it as a question", "Leave this out" ❌
4. "CV on file" column in the export ❌

## 15. Headhunting
**Overview** — counts, Next cards, eye-mark yield ✅ · sourcing-seat gate shown nowhere ❌
**Research**
1. Eight answers, hand edits kept, Run, running state, Sources, Benchmark ticks ✅
2. Once per opening (desk-wide may re-run) ❌ Run again for everyone
3. Wrong company ⚠️ unchanged notes not refused, benchmarks not cleared
4. "I reviewed" ⚠️ shown always (old: 100% stage only)
5. Competitor details, kind labels, "Generated · model" footer, not-set-up state ❌

**Suggestions**
1. 3 rounds, Refine after a decision, tabs, sort, search, Select, Not selected, locks, Find CV ✅
2. Select refuses "already in your Excel Tables", no-profile-link state ❌
3. Run summary + "wrong people" warning, round/learning tags, first-run state ❌
4. Assistant ⚠️ only "press Refine"

**Excel Tables**
1. L-sheets (lowest free, rename, delete + Undo), paste up to 100, filters, row tools, bulk bar ✅
2. Interested → pipeline ✅ ⚠️ always TA Follow-up (old: shortlist claim → Director Review)
3. "Another TA shortlisted first" lock, CV-match Same/Different person, Move back ❌
4. Work-location tabs, per-location sheets, location required ❌
5. Lead notes, Company Reference, upload headhunted CV, 7 outcomes (new has 3) ❌
6. Export ⚠️ CSV of one sheet (old: xlsx, tab per TA and L, links)

**Find CV** ✅ · match strength, reasons, has-CV tag, contact, past employers ❌
**Referee Calls** — grid, paste, limits, own-today only, Positive/Not successful, in the EOD ✅ · TA Support view of everyone ⚠️ · "select a location" warning ❌
**TA Support Excel Tables** — picker, read-only, filters, L counts ✅ · location filter, LinkedIn link, outcome, notes, paging, full EOD view ❌

## 16. Database chat
1. Chat history, auto method, refine, chips, fit bands, add to job, shortlist + lock, download ✅
2. CV count, title browse, team saved searches, delete a chat ❌
3. "142 → 38" kept, "As boolean" copy ❌
4. **Filter column** (experience, level, title, location, notice, industry) ❌
5. Spotlights (free to approach, being worked, can move in 30 days, placed before) ❌
6. Person panel ⚠️ CV only (old: on file, career, openings they were on, previous/next)
7. "Bring them back first", "already on this opening" ❌
8. Lookalike from an uploaded CV ❌ (paperclip attaches a JD)
9. `?for=<opening>` scores against the opening ❌
10. CV scanner ❌

## 17. Strategy Planner
1. Board, matrix, tick without a TA, N/A, awaiting/accepted, catalogue add/rename/retire ✅
2. One TA per strategy ⚠️ old allowed several
3. Lead "date done" and note ❌
4. Take off ⚠️ blocked once accepted
5. Submission seen again after Mark as read ❌
6. Rename changes existing rows ⚠️ old kept their name
7. AURA plan, what worked before, team week drag, reply — new

## 18. TA Track
1. Team for Lead + Director, self for a TA 🟦 (old: Admin + Lead)
2. Ranges up to 30 days, totals, per-site table, CSV, tracking card, empty state ✅
3. Inactive users marked, Refresh / every 30 s, Disconnect my browsers ❌

## 19. Feedback
1. Words or voice, screenshot paste, page link, TA → lead first ✅
2. 🟦 In the name menu (old: floating button); TA sees own items
3. Search, status filter, bulk read/delete, unseen badge ❌
4. Lead note when passing, "In progress", admin step apart from the lead ❌

---

## What is missing, by priority

**1 — a TA cannot do the day without it**
- Today's Checks: the checklist per position, excuse/carry-forward, the day ending at the 100% EOD, Start with a position.
- The candidate page, plus the follow-up actions on the card.
- JD writing: notes, Generate, hand editing, Job details form.
- "My openings" for a TA.

**2 — a lead loses control**
- Opening overview: JD approval card, counts, Edit details / Change team, priority.
- Lead team checks (approve, review, reconcile) and request-access approvals.
- Run limits on Research and Benchmark.
- Excel Tables → pipeline: shortlist claim, lock, CV match.
- Strategy Planner: several TAs, date done and note, submissions kept.

**3 — slower work**
- Bulk tools on Pipeline, Scoops, LinkedIn, Database CVs.
- Database filter column, spotlights, person details, opening context.
- Work locations everywhere (opening, Excel Tables, email).
- An address per view; the Alerts page and bell detail.

**4 — smaller**
- Feedback desk tools, TA Track Disconnect/refresh, referral "maybe" grading, xlsx exports, Snippets block editing, Bin purge date.

Each of these has no design yet. Per the rules, the owner sends a design or says to build it on the old flow.
