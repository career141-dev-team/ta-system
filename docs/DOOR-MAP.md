# Door map — every new-UI screen and what it needs from the backend

Step E1 of the move to the new UI (master plan Track E). Written 19 Nov 2026 after
reading every screen of this repo against the TA System's code
(career141-dev-team/ta-system).

**How the new UI reaches the backend:** only through the signed-in door,
`convex/ui/*` in the TA repo. The person is their Clerk sign-in; every write calls
the backend's own rule with that person. The list of door functions this UI uses
is `door` in `src/lib/backend.tsx`.

**Words used below**
- **LIVE**: the screen reads or saves real data through the door today.
- **WIRE**: the door function exists; the screen does not call it yet.
- **S**: the rule already sits in an internal Convex function; the door needs a thin wrapper.
- **M**: the rule lives only in the old Next.js app (`src/app/actions.ts`, `src/data/store.ts repo.*`); it moves into Convex once, and both UIs use it.
- **L**: it needs AI, a file, or an outside service (model call, `claude -p`, Qdrant, Graph email, Clerk secret, Apify, the tracker extension).

## Where we are (19 Nov)

| | |
|---|---|
| Door releases | #10 (Pipeline), #11 (questions, strategies, posts, remove), #13 (Openings list, posts, named matches) |
| LIVE screens | Openings list, opening name, Pipeline board / move / shortlist, Automations, Scoops (list, shortlist, delete), LinkedIn Job (posts, applicants, every post button), Database CVs (matches, Not for this job), Strategies (accept, submit) |
| Everything else | sample data |

## Inside an opening

| Screen | LIVE | WIRE (door exists) | S | M | L |
|---|---|---|---|---|---|
| Opening page | name, client | status and stage pills (read `summary`), strategies card | stage pill change (`ta/openings:setWorkingStage`), rings (`ta/targets:forJob`) | status pill change (`writeOpeningStatus`, bells) | – |
| Pipeline | board, move, shortlist, Undo (fixed 19 Nov) | – | add to another job (`ta/applications:addToAssignedJob`) | Add-on / Backup marks, interview booking (`interviewWrites`), offer / placement (`closingWrites` + offer letter upload), add a candidate (`ta/cv:uploadUrl` + `attach`) | – |
| CV popup | Ask AURA (browser only) | – | – | the CV file (`api/cv/[candidateId]`, `cvAccess`), save the green CAREER141 box (`repo.setPreparedCvBox`) | Word to PDF, the stamped Prepared CV (`api/prepared-cv`) |
| Scoops | list, shortlist, delete | upload (`scoopUploadUrl`, `queueScoop`) | reading progress, Try again (`ta/scoopUpload:status`, `ta/hhUpload:retry`) | – | – |
| LinkedIn Job | everything | JD-approved flag (`summary.jd`) | test an application subject (`postRouting.routeShared`) | applicant CV (as CV popup) | – |
| Job Description | – | text, approved by, edit + auto-save (`summary.jd`, `saveJd`) | approve (`ta/openings:approveJd`), re-read details (`ta/requirements:reextract`) | versions / restore | AI revise chat; after approval: rematch, Research, Suggestions (run in Next `after()`) |
| Database CVs | matches, Not for this job | – | shortlist (`ta/matching:admitMatches` + `ta/applications:shortlist`) | – | run matching again (Qdrant + embeddings) |
| Snippets | – | opening text (`summary`) | – | – | AI refine (`api/snippet/refine`) |
| Strategies | rows, accept, submit | – | – | proof pictures (`api/strategy-proof`, `ta/strategies:proof*`) | – |
| Midday & EOD email | – | – | sent list, drafts, add midday, save draft, checks + ChatGPT link (`ta/workdays:emailPreflight`, `saveCheck`), settle an uncertain send, missed days | candidate rows (`isEodCandidateEligible`), edit cells (`writeCandidateReview`), referee-calls block | **send** (Graph + attachments built in Next), revise / resend, Make Prepared CV |
| Automations | everything | – | – | – | – |
| Referral Search | – | – | referee search for the job (`ta/referenceSearch:search`) | export | – |
| HH Overview | – | – | counts from `linkVault` by opening | – | – |
| Research | – | – | report + sources, "I reviewed" (`ta/workdays:markReviewed`) | edit an answer, pick a benchmark | run / run again / correct the client / find them (search + model) |
| Suggestions | – | – | cards + rounds, "no profiles" reason | select, not this one, Find CV / same person | refine = next round (`claude -p`), Tell AURA |
| Excel Tables | – | – | rows, work location | paste links / rows, sheets, interested (Yes goes to the pipeline), add to pipeline, eye-mark, note, log approach, phone, add-on, remove, export | Extract with AI (today the UI's own Apify call; nothing is saved) |
| Referee Calls | – | – | rows | edit, paste, delete, Positive / Not successful | – |

## Outside an opening

| Page | LIVE | S | M | L |
|---|---|---|---|---|
| Today (TA) | name and role | start workday, day view (`ta/workdays:dashboard`), add position, work type, "couldn't do it", carry, finish, lead approve a request | – | – |
| Today homes (Lead / Director / Ops) | name and role | – | new bounded queries (today they read the whole desk in memory) | – |
| Bell | – | list, mark read, mark all read (`ta/notifications:*`) | – | – |
| Openings | list | bin (`ta/bin:binOpening`), access requests (`ta/openingAccess:*`), client list, add a client | website switch (who may: `canPostToWebsite`), create an opening (team rules, bells) | JD drafted from the brief; a .pdf/.docx JD read on a server |
| Database | – | – | add to a job / shortlist (`repo.addCandidateToOpening`), "do we have …", download CVs, the CV in the panel, export referees | search (Qdrant + model), search with a JD, people like X, referees search (claude bridge) |
| Strategy Planner | – | – | board query, assign / day / take off / not for this job, catalogue, submissions list | – |
| TA Track | – | one day's report (`ta/tracking:report`), connect / disconnect a browser | week / month ranges; a TA seeing only themself (today's rule refuses a TA) | hour-by-hour timeline (the extension keeps day totals only) |
| Feedback | – | send, board (needs a limit), lead / admin actions (`ta/feedbacks:*`) | screenshot / voice upload, delete, mark read | – |
| People and roles | – | list, add, edit, left / back (`ta/users:*`) | desk settings | invites (Clerk secret key on the server) |
| Bin | – | list, restore, delete now (`ta/bin:*`) | – | – |
| Excel Tables (TA Support) | – | EOD tab (`ta/supportViews:eod`) | position cards and rows (`supportTables`) | – |
| LinkedIn Search | – | – | – | the UI's own Apify function; needs `APIFY_TOKEN` in Cloudflare; never run on real Apify |

## New AURA features — no old equivalent, and what each needs

| Feature | Backend it needs |
|---|---|
| Today desk chat | one "my positions" read (requirements + pipeline counts + strategies due); answers are matched in the browser |
| Day plan | nothing (browser logic over the same read) |
| New opening from a brief | create (M) + the JD draft (model) |
| Database chat history | a new table |
| CV agent (Ask AURA) | nothing to read; saving the box is M |
| Strategy lead read / reply, plan drafts | new fields or a new table |
| TA Track rings, CVs to Director, trend | counts from the pipeline per TA per day |
| Pipeline Undo, Scoops Undo | a move back through the stage rules (Pipeline done 19 Nov) |
| Email table: typed-in rows, extra columns | a place on the daily email for them |
| Workday gate | read the real workday (today it is the browser's own note) |

## The PR order (each one: backend door PR, then the screens wired, then checked signed in)

| PR | Contents | Why this order |
|---|---|---|
| **D4 The TA's day** | workday (start, day view, positions, work type, excuses, carry, finish) and the real workday gate; bell; stage pill; wire the existing doors (JD read / save / approved flag, scoop upload, status and stage reads) | Without the workday nothing gated works signed in; all S |
| **D5 Midday & EOD email** | list, drafts, checks, ChatGPT link, settle, missed days, then candidate rows and cells, then **send** with the same server rules (preflight, uncertain-send check, scoop-only rule) | The thing every TA does every day; the send is the riskiest part, so it comes last within the PR |
| **D6 The CV** | CV file in every popup, the green box saved, the Prepared CV | Needed by email, Pipeline, Scoops and LinkedIn Job |
| **D7 Pipeline and Database CVs finish** | add-on / backup, add to another job, interview, offer, placement, Database CVs shortlist, JD approve + re-read | Ends "do it in AURA" inside an opening |
| **D8 Headhunting** | Excel Tables (rows and every write), HH Overview, Research read / review, Suggestions read / select / dismiss / Find CV, Referee Calls | All M rules from `store.ts` |
| **D9 Openings and Bin** | bin, restore, access requests, website switch, create an opening, clients | – |
| **D10 Lead pages** | Strategy Planner, Lead / Director / Ops homes, People, Feedback, TA Track, TA Support Excel | Used by fewer people every day |
| **D11 AI features** (after the E5 decision) | Database search and chat, people like X, referees search, Research / Suggestions runs, JD draft and revise, Snippets refine, Extract with AI saved, LinkedIn Search key | Each needs the AI decision first |

## Bugs found while mapping

- **Pipeline Undo when signed in** put the card back on screen only; the backend kept the move. Fixed 19 Nov: Undo sends a real move back, and a refusal puts the card where the backend holds it.
- **Scoops Delete when signed in** has no Undo on purpose (it goes to Dropped out and is brought back from there).
- **Excel "Extract with AI"** fills the row on screen only; nothing is saved.
- **The workday gate** reads the browser's own note, not the real workday, so a TA signed in is gated by a day the backend never saw (D4 fixes it).
