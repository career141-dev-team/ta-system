# The Ops System integration API

The Ops System is the client side of Career 141: enquiry, agreement,
requirement, the client's CV sets, interviews, placement, invoice, the 90-day
guarantee and the close. It is a **separate service with its own backend and
its own database**. It never touches this one. The only connection is this
API and, later, an events feed.

The rule that shapes all of it: **the TA System must keep working exactly as it
does**. Everything here is read-only, so nothing in this pull request can
change what a TA sees. The writes and the events feed come later, each on its
own.

## Credentials

The backend must have `OPS_API_TOKEN` set before these routes answer anything.
It is **a different secret from `CAPACITY_PLANNER_READ_TOKEN`**, on purpose: one
integration's key must never unlock the other's data, and either can be rotated
without touching the other. Without it the routes fail closed with HTTP 503.

At least 32 random bytes (43 base64url characters or more). An authorised
operator can generate one:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Set it through the release pipeline, never from a laptop, and give the same
value to the Ops System's own environment as `OPS_TA_TOKEN`.

## Endpoints

Base URL: the TA Convex HTTP endpoint (production: `https://api.career141.com`).
`Authorization: Bearer <OPS_API_TOKEN>` on every request.

| Method and path | Query | Answers |
|---|---|---|
| `GET /integrations/v1/people` | `active=true` | every user: `id, fullName, email, taRole, isActive` |
| `GET /integrations/v1/clients` | `q=` or `nameKey=` | `id, name, nameKey, industry, esaSignedAt, status, opsOwnerId, contacts[]` |
| `GET /integrations/v1/openings` | `clientId=`, `status=` | `id, title, clientId, status, primaryRecruiterId, taLeadId, headcount, assignedAt` |
| `GET /integrations/v1/openings/{id}` | — | the same shape, one opening |
| `GET /integrations/v1/openings/{id}/pipeline` | `stage=` | `applications[]` (`id, candidateName, currentStage, setNumber, backupForApplicationId`) and `counts` per stage |

**The body is the payload itself**, not an `{ok, data}` envelope: the Ops
client reads `response.json()` as the value and uses the status code for
failures. Errors keep this repository's existing shape, `{ "error": "..." }`
with a 4xx or 5xx status. The field names are the Ops client's own
(`ops-system/src/lib/ta.ts`), so they are the contract - do not tidy them to
match ours.

At most 100 rows per read. There is no cursor yet: nothing the Ops System
reads today is near that, and a paging scheme nobody uses is a paging scheme
nobody tests.

## Two honest gaps

- **`opsOwnerId` is always null.** Who owns a client on the Ops side is the Ops
  System's own record; we hold nothing to answer with, and inventing one would
  be worse than saying nothing.
- **A contact's role.** Our contacts carry a free-text `title` and an
  `isPrimary` flag. A client set goes to whoever Ops reads as `"hr"`, so the
  primary contact is mapped to `hr` and everyone else keeps their title. If the
  desk starts recording a real role, map it in `toOpsClient` instead.

An opening with no normalised `clientId` (a job made before the clients table
existed) is returned with an empty `clientId` rather than hidden. A position
Ops cannot match is a question for a person, not a silent gap.

## The writes

Off by default. Three things have to be true before a write does anything:

1. `OPS_API_TOKEN` is set (the same key as the reads).
2. `OPS_API_WRITES_ENABLED` says `on`. Anything else - including unset - and
   every write answers 503 saying so, and the Ops System keeps it in its own
   outbox. This is how the reads can go live weeks before the writes do.
3. `OPS_API_ACTOR_EMAIL` names an **active TA user**. Every Ops-originated
   change is recorded as that person. Unset or unknown, the writes refuse: an
   unattributable change to a live opening is worse than no change.

| Method and path | Body | What TA does |
|---|---|---|
| `POST /integrations/v1/notify` | `userId, type, title, body, jobId?` | a bell of type `from_ops`, with what Ops called it at the front of the body |
| `POST /integrations/v1/openings` | `clientId, title, country?, brief?, assignedTaIds?, requestedTaLeadId?, priorityTier?` | `ta/openings:create` - the opening, its first post and its brief, exactly as the app makes them |
| `POST /integrations/v1/openings/{id}/status` | `status` (`open · on_hold · filled · closed`), `reason` | `ta/openings:updateMasterSheet`, which refuses a change with no reason |
| `POST /integrations/v1/openings/{id}/working-stage` | `mode` (`100% · Follow-up · Add-on`), `userId?` | `ta/openings:setWorkingStage`, the same mutation the lead's own menu uses |

**Every write carries an `idempotencyKey`** of 8 to 200 characters. Ops queues
its writes and retries after an outage, so the same one will arrive twice: the
answer we gave the first time is kept in `opsApiWrites` and handed back with
`"repeated": true`, and nothing happens again. A retried hand-over cannot make
two openings.

**They go through TA's own mutations, never around them**, so TA's rules, its
audit and its bells happen exactly as they do when a person clicks. A refusal
from TA comes back as **422** with TA's own sentence, which the Ops side shows
to whoever pressed the button.

## What is not here yet

The rest of the writes - client decisions, client-owned CVs, interviews,
placements, ad channels, posts and client sets - and the events feed TA raises
for Ops. Until they exist the Ops System runs those paths against a stand-in
and says so on every screen. See `ops-system/docs/15-BUILD-PLAN.md`, Part E.
