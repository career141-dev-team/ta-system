# AI flows — the full list to approve (phase E5)

19 Nov 2026, rewritten after reading the whole new UI (every screen, the removed candidate
page in git history, FLOW-CHECK and SCREEN-CHECK). The first version had 9 features and
missed many — this one has every AURA idea found.

**Where things stand today:** no AI model runs anywhere in the new UI. Every "AURA" is
browser rules, word matching, sample data or a timer pretending to think. Only two real
outside calls exist: **LinkedIn Search** and **Extract with AI** (Apify).

Columns: **Today** = how the new UI does it now · **Old** = did old AURA have it ·
**Backend** = what has to be built · **AI** = needs a model? · **Size** S / M / L.

## The rules for every AI flow

1. **AI reads, suggests and fills. A person confirms.** Nothing is created, moved, sent or deleted by AI on its own.
2. **The backend's rules still decide** (workday, permissions, limits, outbound lock, test mode).
3. **AI never writes to a candidate or a client by itself** — draft, person approves, system sends (the existing WhatsApp/email assistant keeps its own guards).
4. **Every AI call is counted** (feature, who, cost) under a daily limit.
5. **AI off or failing** → the screen says so and the manual way still works.
6. **A flow that changes an old rule is your decision**, written down with the date.

## Decisions for you first

| # | Decision | My recommendation |
|---|---|---|
| A | Where AI runs | Small, quick jobs in the backend (it already has the AI key). Long jobs (Research, Suggestions, CV files) on the old server. |
| B | Model | DeepSeek V4 Flash for small jobs (the only model the OpenRouter account allows). Claude (your subscription) for Research and Suggestions, as today. |
| C | Daily cost limit | $5 a day across the desk to start. |
| D | Voice | Typing by voice: the browser's own (free, already works). AURA **speaking** and the **screening call**: the old voice agent. |
| E | **Fix now (safety)** | LinkedIn Search and Extract with AI call Apify from public links **with no sign-in check** — anyone who finds the link can spend money. Move them behind the signed-in backend first. |
| F | Order | Groups 1 → 7 below, most-used first. |

## Group 1 — Today (the TA's day)

| # | Feature | Today | Old | Backend | AI | Size |
|---|---|---|---|---|---|---|
| 1 | **Day plan** — "interview at 2:30, keep the afternoon light" → timed steps; "Change something" re-plans | Fixed slots + sample tasks | No | The TA's real queue: suggestions to review, replies waiting, CVs ready, interviews, strategies due | Optional | M |
| 2 | **Desk questions** — "What first?", "My strategies today", "Finance requirements?" | Word rules, sample desk | No | One "my desk" read (positions, priority, day N of target, pipeline, CVs today, strategies) | For free questions | M |
| 3 | **"Things" feed** — "Kasun replied: 850k, 1 month — Move to Director Review", "AURA drafted the JD — Review", "New strategy — Accept" | Sample (hidden signed in) | Partly (reply reading exists) | A feed of AI-read replies, drafted JDs, new strategies | Uses existing AI | M |
| 4 | **Draft my EOD** — AURA drafts the email's notes and numbers | Lists the email views only | No | AI draft on top of the backend email (D5) | Yes | M |
| 5 | **Morning brief + talk to AURA** (speak, attach a file) | "Not connected yet" | No | Brief read, voice in/out, file reading | Yes | L |
| 6 | Suggested order + start line ("Start with X — P1, 100%") | Rules | No | The desk read (2) | No | S |

## Group 2 — Openings

| # | Feature | Today | Old | Backend | AI | Size |
|---|---|---|---|---|---|---|
| 7 | **New opening from a brief** — write/say a paragraph; AURA fills role, client, places + people, priority, team, must-haves; asks what is missing one at a time; person presses Create. **Rule change (yours, 14 Nov): only role + client required** | Word rules | Long form | Read the brief (model), create opening with old rules moved in | Yes | L |
| 8 | **Attach a JD (PDF / Word)** to the brief | Only .txt read | — | Text from PDF/Word (old server) | No | S |
| 9 | **JD drafted after Create** | Toast only | Yes | JD writer job | Yes | M |
| 10 | **"Search or ask AURA" (⌘K / Spotlight)** — find openings and people, "Create an opening called…", ask anything about the desk | Word match, sample | Partly (old ask-the-desk) | Desk-wide search + a desk-wide answer | Yes | M |

## Group 3 — Inside an opening

| # | Feature | Today | Old | Backend | AI | Size |
|---|---|---|---|---|---|---|
| 11 | **CV agent** — "add the green box", "expected 900k", "move top right", "add a note" | Word rules, not saved | Box editor by hand | Save the box; it goes into the email | No (AI optional) | M |
| 12 | **Prepared CV** — the CV file with the box stamped (download, email attachment, "Make it") | Timer stand-in | Yes | Stamp + Word→PDF on the old server | No | M |
| 13 | **Ask about this CV** — "years in SAP?", "email?" | CV text + word overlap | No | Nothing; a model for real answers | Optional | S |
| 14 | **JD chat** — "make it shorter", versions, restore | "Not connected yet" | Yes | Reviser + version saves | Yes | M |
| 15 | **JD generate / regenerate from the brief**, record notes by voice | Not built | Yes | JD writer | Yes | M |
| 16 | **Re-read job details** ("what candidates are matched on") | Timer stand-in | Yes | Existing re-read (exists) | Existing | S |
| 17 | **Approve JD starts AI** (re-read, rematch, Research, Suggestions) | Toast only | Yes | Approve + start the jobs on the old server | Existing | M |
| 18 | **Database CVs matching** — score ring, ✦ "why" line, Strong / Worth a look, Run again | Real score; reason from tags only; Run again off | Yes | Real match reasons; rematch (Qdrant + model) | Existing | M |
| 19 | **LinkedIn Job applicant fit score** + "Strong fit 80+" filter | Sample (0 when signed in) | Yes | Read the screening score | Existing | S |
| 20 | **Scoops CV reading** | Real queue signed in | Yes | Exists | Existing | — |
| 21 | **Research** — 8 answers with sources, benchmark people with confidence, Find them, Wrong company? correct it | Sample + timer | Yes | Run on the old server (web search + Claude), reads, edits | Existing | L |
| 22 | **Suggestions** — rounds, Refine, Tell AURA, AURA's first message ("you picked 2 from tile makers…"), why lines, "confirm before approaching" | Sample + timer | Yes | Run rounds on the old server, Select / Not this one, read the note into the next round | Yes | L |
| 23 | **Find CV** — match a LinkedIn profile to a database CV ("Same person") | Sample | Yes | Database lookup + match strength | Optional | S |
| 24 | **Extract with AI** (one profile link fills the row) | Real Apify, **saves nothing, no sign-in gate** | Simpler | Behind the backend, counted, saved | Outside service | M |
| 25 | **Snippets** — "make it punchier", snippet chat, level from title | Canned + rules | Yes (refine) | Model refine | Yes | S |
| 26 | Referee Calls Positive / Not successful; HH Overview next cards | Rules | Yes | Writes only | No | S |
| 27 | **AI Follow-Up stage on the Pipeline** — see who the assistant is chasing and its status | Counts only | Yes | Read the assistant's state (exists) | Existing | S |

## Group 4 — The candidate follow-up (lost from the new UI)

The candidate page was built 16 Nov and removed the same day. Old AURA has all of these;
the new UI has none of them now. **Where should they live?** (my suggestion: in the CV popup, beside Ask AURA).

| # | Feature | Today | Old | Backend | AI | Size |
|---|---|---|---|---|---|---|
| 28 | **Follow-up chat** — what the WhatsApp/email assistant collected, N of 3 sent, Take over / Hand back, Send next, Stop | Removed | Yes | Reads + the existing follow-up rules | Existing | M |
| 29 | **Aura screening call** — asks salary, expected, notice, the job's questions | Removed | Yes (voice agent) | The existing voice agent | Existing | M |
| 30 | **Reference checks** — Verify on LinkedIn, company references | Removed | Yes | Existing reference search | Existing | S |

## Group 5 — Database

| # | Feature | Today | Old | Backend | AI | Size |
|---|---|---|---|---|---|---|
| 31 | **Database chat** — plain words → search, each message refines, Boolean, "people like X", "do we have Nimal?", add to a job, shortlist, download CVs | Word rules, 12 sample people | Search page | Sentence → search (existing AI step), search engine, lookalike, add/shortlist rules, CV files | Yes | L |
| 32 | **Attach a JD to search** ("find people for this JD") | File name only | Search from a job | Read the file, JD → search | Yes | M |
| 33 | **Referees mode** — a sentence → title / company / industry, "We have a CV for X — maybe them" | Word rules, sample | Yes | Referee search (existing), name matching | Yes | M |
| 34 | **Why line + fit label** on each person | Rules | Fit bands | Real match reasons | Existing | S |
| 35 | **Spotlights** (free to approach, being worked, placed before), "Bring them back first", CV scanner, lookalike from an uploaded CV | Not built | Yes | Reads + existing lookalike | Existing | M |
| 36 | Chat history (and AI-named chats) | In the browser only | Saved searches | A chat history table | Optional | S |

## Group 6 — Strategy Planner

| # | Feature | Today | Old | Backend | AI | Size |
|---|---|---|---|---|---|---|
| 37 | **"Plan with AURA" / AURA suggests a plan** — who has room, which strategies | Fixed rule | No | Week loads + past results | Optional | M |
| 38 | **What worked before** — results of past strategies on similar roles | Sample | No | Past-results read; similar roles may need AI | Optional | M |
| 39 | **Tell AURA the plan** — "Dilini on direct headhunt tomorrow" | Word rules | Tick boxes | The planner's rules moved in | Optional | M |

## Group 7 — Other pages

| # | Feature | Today | Old | Backend | AI | Size |
|---|---|---|---|---|---|---|
| 40 | **LinkedIn Search chat** — "SAP managers at Virtusa in Colombo" → ranked profiles, ~$0.14 | Real Apify, **no sign-in gate**, saves nothing | No | Behind the backend, limit, save to Excel Tables, model reader | Yes | M |
| 41 | **TA Track "What stands out"** — top sender, idle up, LinkedIn time | Rules, sample | No | Tracker data + CV counts | Optional | M |
| 42 | **Feedback voice note** → transcribe, title, sort (broke / idea / question) | Recorded, not read | Voice note | Storage + transcription | Yes | S |
| 43 | **Lead / Director / Ops homes** — "needs a decision" lines, summaries | Rules, sample | Dashboards | Reads | Optional | M |
| 44 | **Voice agent page** (old top bar) | Not built | Yes | Existing voice agent | Existing | M |
| 45 | **"Aura" strategy** in the strategy catalogue (AI tools group) | A catalogue name | — | — | — | — (**what does it mean?**) |

## What you approve

For each group (or number): **OK as written** or **change** — plus decisions A–F, and where
the candidate follow-up (group 4) should live.
