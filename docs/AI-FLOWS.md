# AI flows — the list to approve (phase E5)

19 Nov 2026. The new UI changes whole flows from forms to "tell AURA". Each one needs
its own backend. This page lists every one: how it works in the new UI, how it worked in
old AURA, and what the backend must do. **Approve or change each one, then it is built,
one at a time.**

## The rules for every AI flow

1. **AI reads, suggests and fills. A person confirms.** Nothing is created, moved, sent or
   deleted by AI on its own. The button the person presses runs the backend's normal rule.
2. **The backend's rules still decide.** AI never skips a check (workday, permissions,
   limits, the outbound lock, test mode).
3. **AI never writes to a candidate or a client.** Emails and WhatsApp stay draft, person
   approves, system sends.
4. **Every AI call is counted**: which feature, who, cost. A daily cost limit stops it.
5. **When AI is off or fails**, the screen says so in plain words and the manual way still
   works.
6. **A flow that changes an old rule is your decision**, written down with the date.

## Decisions needed from you first

| # | Decision | My recommendation |
|---|---|---|
| A | Where AI runs | **Small, quick AI jobs in the backend** (reading a brief, the chats, the CV questions) — the backend already has the AI key and already runs AI for matching. **Long jobs stay on the old server** (Research, Suggestions with Claude, CV files) and the backend asks it. |
| B | Which model | **DeepSeek V4 Flash** for the small jobs — the only model the OpenRouter account allows, under a second, fractions of a cent. **Claude (your subscription)** stays for Research and Suggestions, as today. |
| C | Daily cost limit | **$5 a day** across the desk to start; when it is reached the AI parts pause and say so. |
| D | Order | 1 New opening, 2 Database chat, 3 CV agent, 4 Today chat, 5 JD chat, 6 Strategy plan chat, 7 Research & Suggestions from the new UI, 8 LinkedIn Search + Extract with AI, 9 Snippets. |

## The features

### 1. New opening from a brief

| | |
|---|---|
| **New flow** | Write or say one paragraph, or attach a JD (PDF / Word). AURA fills the role, client, places and people, priority, team, must-haves, hiring-for. What is missing, AURA asks one at a time. The person presses **Create**. Then AURA drafts the JD. |
| **Old AURA** | A long form with every field, then "Draft JD". |
| **Rule change (yours)** | Only **role + client** are required to create; everything else takes the usual default (you decided this 14 Nov). |
| **Backend to build** | AI "read this brief" → fields (backend AI job). Read text from an attached PDF / Word (old server). **Create opening** with the old rules (team rules, a TA only puts themself, lead adds others, bells) moved into the backend. Then the JD draft (old app's JD writer, moved or called). |
| **Size** | Large |

### 2. Database chat

| | |
|---|---|
| **New flow** | One chat: "SAP leads in Colombo, 8+ years" → people. Each next message refines ("only Kandy", "people like Kasun", "do we have Nimal Perera?"). Add to a job, shortlist, download CVs from the chat. Chats are kept as history. Referees mode searches referees named on CVs. |
| **Old AURA** | A search page with filter boxes; one search at a time; saved searches. |
| **Rule change (yours)** | None — same search, same who-may-see. |
| **Backend to build** | Turn each message into a search (the existing AI step that reads a search sentence + the existing search engine, bounded). Keep the last filters so a message refines them. "People like X" (existing lookalike search). Add to a job / shortlist (old app's rule moved into the backend). Download CVs. A **new table for chat history**. Referees search (existing referee search; its sentence reader uses Claude today). |
| **Size** | Large |

### 3. CV agent ("Ask AURA" on the CV)

| | |
|---|---|
| **New flow** | In any CV popup: "add the green box", "set expected salary 900k", "move it to the top right", "add a note: strong SAP"; or a question: "how many years in SAP?". |
| **Old AURA** | The Prepared CV box editor in the candidate drawer, by hand. |
| **Rule change (yours)** | None. |
| **Backend to build** | **Save the box** (old app's rule moved into the backend) so the email attaches exactly that box. The **Prepared CV file** stays on the old server (Word to PDF). Commands already work without AI in the browser; free questions can stay browser-only (no cost) — **AI only if you want answers beyond what the CV text says**. |
| **Size** | Medium |

### 4. Today chat (AURA knows the TA's desk)

| | |
|---|---|
| **New flow** | After Start workday, AURA knows the TA's positions, priorities, pipeline, Rashmi's strategies due today; "Plan my day", "What first?", "My strategies today", "Draft my EOD"; it lays the day out in times. |
| **Old AURA** | No equivalent (only Today's Checks). |
| **Rule change (yours)** | None — AURA only advises. |
| **Backend to build** | One **"my desk" read**: positions on the day with requirements, priority, day N of target, pipeline counts, CVs today, strategies due. The answers work today **without AI** (rules in the browser). **AI only for free questions** ("what should I say to the client about…") — optional. |
| **Size** | Small (Medium with AI questions) |

### 5. JD chat

| | |
|---|---|
| **New flow** | On the Job Description: "make it shorter", "add hybrid 3 days", "rewrite for a manager level" → AURA changes the JD; versions kept; Approve. |
| **Old AURA** | The same idea exists (revise JD with AI), on the old server. |
| **Rule change (yours)** | None. |
| **Backend to build** | JD save / versions / restore and **Approve** (approve starts Research + Suggestions — see 7). The revise step: move the old JD reviser into a backend AI job, or call the old server. |
| **Size** | Medium |

### 6. Strategy plan chat

| | |
|---|---|
| **New flow** | The lead plans a job's strategies by talking: "Rashmi on LinkedIn groups tomorrow, Hasini on referrals"; AURA suggests a plan from what worked before; the lead presses **Send**. |
| **Old AURA** | Tick boxes in the planner matrix. |
| **Rule change (yours)** | None. |
| **Backend to build** | The planner's rules (put a TA on a strategy, set the day, not for this job, take off, the bell) moved into the backend. **"What worked before"**: a read of past strategies and their results. The chat works today without AI (word matching); AI optional. |
| **Size** | Medium |

### 7. Research & Suggestions from the new UI

| | |
|---|---|
| **New flow** | Research: Run / Run again / correct the client / pick benchmark / Find them. Suggestions: rounds of people to review, Select / Not this one, **Refine** and **Tell AURA** to steer the next round. |
| **Old AURA** | Same features, run on the old server (web search + Claude). |
| **Rule change (yours)** | None. |
| **Backend to build** | The new UI's buttons ask the backend; the backend asks the **old server** to run the job (it has Claude and web search); results land where they do today; reads for the screens; Select / Not this one / Find CV rules moved into the backend. |
| **Size** | Large |

### 8. LinkedIn Search + Extract with AI

| | |
|---|---|
| **New flow** | LinkedIn Search: a chat — "SAP managers at Virtusa in Colombo" → ranked profiles (~$0.14 a search). Excel Tables "Extract with AI": paste one profile link → the row fills (~$0.004). |
| **Old AURA** | No LinkedIn Search. Extract existed in a simpler form. |
| **Rule change (yours)** | **New spending** — you set who may use it and a monthly limit. |
| **Backend to build** | Run both through the backend (the Apify key server-side, cost counted, limit enforced). **Save** extracted rows and chosen profiles into Excel Tables (today Extract saves nothing). |
| **Size** | Medium |

### 9. Snippets refine

| | |
|---|---|
| **New flow** | "Make it punchier", "shorter for LinkedIn" → AURA rewrites the job snippet. |
| **Old AURA** | Same idea on the old server. |
| **Rule change (yours)** | None. |
| **Backend to build** | A small backend AI job, counted. |
| **Size** | Small |

## Not AI (already works in the browser, no cost)

- Referee Calls: Positive / Not successful read from the feedback words.
- TA Track "What stands out": plain rules over the numbers.
- The day plan's times (from the positions and what the TA said).

## What you approve

For each feature: **OK as written**, or **change** (say what). Plus decisions A–D above.
