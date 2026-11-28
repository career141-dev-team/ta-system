# Manual test scenarios: TA System (local copy, http://localhost:3100)

**Before you start**

- Test only on the local copy. Never on https://ta-system.career141.com.
- Use invented candidates and your own phone number and email address.
- Steps marked ⚠️ can send email or messages, or place calls. Before them, confirm `OUTREACH_LIVE` is not set in the local backend, and that test recipients are set. The End of Day and Midday emails go to the Director desk, so skip Send unless you know the local mail settings are test ones.
- Sample-data mode (`start-ui.sh`) is only good for screens. Targets and AI calls need the real local backend.

Mark each: ✅ pass, ❌ fail (note what you saw), ⏭ skipped.

## 1. Sign-in and roles

| # | Steps | Expected | Result |
|---|---|---|---|
| 1.1 | Open the site signed out | Sign-in screen, with test accounts listed | |
| 1.2 | Open `/openings` signed out | Sent to sign-in | |
| 1.3 | Sign in as Admin | Menu shows Clients, Openings, Excel Tables, Strategy Planner, Database, Alerts, Reports, TA Track, Targets, Voice agent, Feedback, Bin, Extras | |
| 1.4 | Sign in as TA | No TA Track, Targets, Feedback or Extras | |
| 1.5 | As TA, type `/targets`, `/settings`, `/extras` in the address bar | Refused, no data shown | |
| 1.6 | Sign in as TA Lead | TA Track and Targets shown, Extras hidden | |
| 1.7 | Open the user menu | Shortlist decisions only for Admin, Director, TA Lead, Ops; Settings only for Admin | |
| 1.8 | Sign out, then press Back | No protected page is usable | |

## 2. Clients and openings (Admin or TA Lead)

| # | Steps | Expected | Result |
|---|---|---|---|
| 2.1 | Add a client | Appears in Clients | |
| 2.2 | Create an opening with required fields empty | Clear message, nothing saved | |
| 2.3 | Create a valid opening, assign a TA Lead and a TA | Appears in Openings | |
| 2.4 | Sign in as that TA, then as another TA | First sees the opening, second does not | |
| 2.5 | Write and approve the JD, edit Job details | Saved, still there after reload | |
| 2.6 | Change priority and status (On hold, then Open) | Opening moves to the matching list | |
| 2.7 | Add a LinkedIn job post and a work location | Both stay after reload | |
| 2.8 | Delete the opening, then restore it from Bin | Gone, then back with its candidates | |
| 2.9 | Edit one opening in two tabs, save both | Second shows "Someone else changed this record" | |

## 3. CV upload and reading

| # | Steps | Expected | Result |
|---|---|---|---|
| 3.1 | Upload a PDF CV to a candidate or headhunting upload | Progress shows, details are filled in | |
| 3.2 | Upload a Word CV | Same | |
| 3.3 | Upload a file over 10 MB | Refused with the file name or size reason | |
| 3.4 | Upload an image or `.txt` as a scoop | "is not a PDF or a Word document" | |
| 3.5 | Upload the same CV twice | No duplicate person | |
| 3.6 | Open and download the CV | Correct file opens | |

## 4. Scoops (TA, inside an opening)

| # | Steps | Expected | Result |
|---|---|---|---|
| 4.1 | Drop one CV, choose "Sent by" | Shows Processing, then the person | |
| 4.2 | Drop 12 CVs | "Up to 10 CVs at a time" and 10 are added | |
| 4.3 | Tick one and "Remove from this job" | Moves to Dropped out; still in Database | |

## 5. Shortlist, sets and review

| # | Steps | Expected | Result |
|---|---|---|---|
| 5.1 | ⚠️ Shortlist one candidate | Moves to TA Follow-up, owned by you | |
| 5.2 | Second TA tries the same candidate | Refused as already claimed | |
| 5.3 | ⚠️ Shortlist selected, several at once | "N shortlisted and sent to Follow-up." | |
| 5.4 | ⚠️ Shortlist five in one day on one opening | One set closes | |
| 5.5 | Add a candidate to another assigned job | Appears there; original stays | |
| 5.6 | Move to Rejected, then bring back | Returns to the pipeline | |
| 5.7 | As lead, open Director Review and Shortlist decisions | Candidates and decisions shown correctly | |

## 6. Follow-up

| # | Steps | Expected | Result |
|---|---|---|---|
| 6.1 | Turn Automatic follow-up off, shortlist someone | Nothing is sent | |
| 6.2 | Add or edit the opening's follow-up questions | Saved and shown on candidates | |
| 6.3 | Fill all required details by hand | Moves to Director Review | |
| 6.4 | Leave one detail missing | Stays in Follow-up, shows what is missing | |
| 6.5 | ⚠️ Press Send (WhatsApp and Email) to your own test contact | Clear sent or not-sent reason | |
| 6.6 | Press Stop | No further reminders scheduled | |

## 7. Database search

| # | Steps | Expected | Result |
|---|---|---|---|
| 7.1 | Search in plain English | Relevant results | |
| 7.2 | Add a refinement | Results narrow, first request kept | |
| 7.3 | Boolean search | Matches the terms | |
| 7.4 | Search nonsense text | Empty state, no error | |
| 7.5 | Open a candidate, close, change page | List stays, no full re-search | |
| 7.6 | Referral search and reference-CV search | Results appear | |
| 7.7 | Opening, Database CVs tab, find matches | Matches listed | |
| 7.8 | Header search on Clients and Openings | Searches that page's list | |

Search needs data and model keys; empty results on an empty local database are not a bug.

## 8. Headhunting and Excel Tables

| # | Steps | Expected | Result |
|---|---|---|---|
| 8.1 | Paste a LinkedIn profile link | Row added | |
| 8.2 | Paste a non-profile link | "That is not a LinkedIn profile link..." | |
| 8.3 | Submit an empty link | "Paste a LinkedIn profile link first." | |
| 8.4 | Change outcome, eye-mark, interest tab | Saved; Overview counts update | |
| 8.5 | Export the table | File matches the screen | |
| 8.6 | Run Research, Suggestions, Referee Calls | Results or a clear message | |

## 9. Strategy Planner and Targets

| # | Steps | Expected | Result |
|---|---|---|---|
| 9.1 | Lead ticks a strategy and puts a TA on it | TA gets a notification | |
| 9.2 | TA accepts, adds date, note, proof picture, submits | Lead sees it | |
| 9.3 | Note over 500 characters | "Keep the note under 500 characters." | |
| 9.4 | Put the job On hold | Not listed in the planner | |
| 9.5 | Lead sets CVs and links per day | TA sees targets with today's progress | |
| 9.6 | Enter -1, 1.5 or 1001 as a target | Refused or corrected to 0–1000 whole number | |
| 9.7 | TA shortlists one CV and adds one link | Progress goes up by one each | |

## 10. Workday, Midday and End of Day

| # | Steps | Expected | Result |
|---|---|---|---|
| 10.1 | TA opens Today's Checks, starts a position | Checks listed | |
| 10.2 | Double-click Start | One day only | |
| 10.3 | Start on a job with no TA Lead | "Ask the lead to assign a TA Lead..." | |
| 10.4 | Open the End of Day page | Director Review candidates listed | |
| 10.5 | Enter an invalid extra email address | Send is stopped with a message | |
| 10.6 | ⚠️ Send Midday / End of Day (test mail settings only) | Accepted; day completes after final 100% End of Day | |

## 11. Other pages

| # | Steps | Expected | Result |
|---|---|---|---|
| 11.1 | Alerts: open and action one | Badge count drops | |
| 11.2 | Reports, TA Track | Load, numbers match what you did | |
| 11.3 | People and roles: change a test user's role | Menu changes for that user | |
| 11.4 | Deactivate a test user | Cannot get in | |
| 11.5 | Feedback: submit one | Shows for lead or admin | |
| 11.6 | ⚠️ Voice agent practice call (needs LiveKit) | Call runs, or a "not configured" message | |

## 12. Every page

| # | Check | Expected | Result |
|---|---|---|---|
| 12.1 | Phone and tablet width | Menu button; nothing cut off | |
| 12.2 | Dark theme | All text readable | |
| 12.3 | Reload and Back/Forward | Same state, no crash | |
| 12.4 | Browser console | No red errors | |
| 12.5 | Open a made-up address, e.g. `/openings/abc` | Friendly not-found, no crash | |

## Bug note template

Scenario number · role · page address · what you did · expected · what happened · screenshot
