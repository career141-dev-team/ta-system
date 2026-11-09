# Contact discovery API (for the Brevo clone)

9 Nov 2026. The Brevo clone asks CAREER141 for a contact list in plain words
("Find all Junior Developers"). CAREER141 does all the searching; Brevo only
asks and receives. Code: `convex/lib/contactRule.ts` (the rule and the
matcher), `convex/extras/contactDiscovery.ts` (the job),
`convex/integrations/contactsHttp.ts` (the routes). Tests:
`tests/contactRule.test.ts`.

## How it works

1. **Read.** One model call (DeepSeek through OpenRouter, the same route as
   the rest of the backend) turns the sentence into a rule: the job titles that
   mean the job, related and alternative titles, words that rule a title out,
   the levels asked for, and any skills the request requires. With no model
   key, or an unusable answer, the words of the request make the rule
   (`readBy: "words"`). Nothing is searched yet.
2. **Confirm.** Brevo shows the rule. A person presses Run, or edits the rule
   and then presses Run.
3. **Scan.** Every candidate is read in pages, as the Extras sales list does.
   A person is kept when their **current title** matches the rule at an
   allowed level; when their current title is another job, an **earlier
   title** can match instead and the row says "Previous role". No model is
   used per person: it costs nothing, gives the same answer every run, and
   each row says which phrase matched.
   - **A title matches** when every word of one of the rule's phrases is in
     it as a whole word, in any order ("software engineer" finds "Engineer -
     Software" and "Software Development Engineer"). Exclude words win.
   - **The level** is the title's own level word when it has one ("Senior",
     "Manager", "Head", "Intern"). Otherwise it is the level the CV reader
     stored (from years and title), then the years themselves (up to 2
     Junior, 3 to 5 Mid, 6 to 9 Senior, 10 and up Lead), then the role
     classifier. A level nobody knows is let through and the row says "Not
     known". An earlier title's level is that title's own word only.
   - 10 Nov fix: before this, a title with no level word always counted as
     Mid-level, so "Senior Developers" found about 815 of ~92,000 people.
4. **Meaning pass.** After the scan, Qdrant's nearest people to the rule
   (cosine 0.6 and up, at most 1,000) are added when the rule's levels and
   exclude words allow. They are labelled "Found by meaning, check" and never
   replace a title match. If this pass cannot run, the search still finishes
   and `meaning` says why.

Always left out: merged duplicates, do-not-contact people, and anyone without
a usable email (the first real address in the field is used, so "a@x.com /
b@y.com" keeps a@x.com). One row per email: a current-role match beats a
previous-role one, and either beats a meaning match.

Every scanned person is either on the list or counted once in `leftOut`, by
reason, so a short list explains itself.

## Safety

- Its own key, `CONTACTS_API_TOKEN` (43+ URL-safe characters). It is never the
  capacity planner's key or the Ops key. Unset, every route answers 503.
- Every search names the Brevo user (`requestedBy`, an email). It is kept with
  the search, with the query, the rule, the counts and how many times it was
  downloaded.
- One scan runs at a time. A second one is refused with 409 until the first
  finishes. A scan that has not moved for ten minutes counts as failed, so it
  never blocks the next one.
- Nothing writes to `candidates`, and nothing sends a message.
- A search and its rows are deleted after seven days.
- `contactSearches` and `contactSearchRows` are private: the partner API
  cannot read them.

## Routes

Base: the TA Convex site URL. Every call sends `Authorization: Bearer <CONTACTS_API_TOKEN>`.

### `POST /integrations/v1/contacts/discover`

```json
{ "query": "Find all Junior Developers", "requestedBy": "someone@career141.com" }
```

`201`:

```json
{
  "id": "k57…",
  "readBy": "model",
  "rule": {
    "label": "Junior developers",
    "titles": ["developer", "software engineer", "software developer", "programmer"],
    "exclude": ["business developer", "property developer"],
    "levels": [0, 1],
    "skills": [],
    "includePastRoles": true
  }
}
```

Levels: 0 Intern/Trainee, 1 Junior/Associate, 2 Mid-level, 3 Senior, 4 Lead/Assistant Manager,
5 Manager, 6 Senior Manager/Head, 7 AGM/DGM, 8 GM/VP, 9 Director/C-suite. An
empty list means every level. `400` for a bad query or `requestedBy`; `422`
when the request names no job.

### `POST /integrations/v1/contacts/discover/{id}/run`

Body `{}` runs the rule as read. `{ "rule": { … } }` runs an edited rule; it
is checked the same way (at least one title, levels 0 to 9). `202
{ "id", "status": "running" }`. `409` if this search already ran or another
one is running; `400` for a bad rule; `404` for an unknown id.

### `POST /integrations/v1/contacts/discover/{id}/stop`

Added 9 Nov at the owner's request: a person who has enough people stops the
search where it is. The search becomes `done` with everyone found so far,
`stopped: true`, and `meaning` saying how many people were checked, so its rows,
its CSV and Brevo's Save as list all work on that list. The scan ends on its next
page, which frees the one-search-at-a-time slot at once. The meaning pass does
not run on a stopped search. `200 { "id", "status": "done" }`. Stopping a
finished search changes nothing and answers 200; `409` for a search that was
never run; `404` for an unknown id.

### `GET /integrations/v1/contacts/discover/{id}`

```json
{ "id": "k57…", "status": "running", "scanned": 31200, "found": 412, "meaning": null, "stopped": false,
  "query": "…", "requestedBy": "…", "rule": { … }, "readBy": "model", "error": null,
  "createdAt": 0, "startedAt": 0, "finishedAt": null,
  "leftOut": { "not_contactable": 120, "other_job": 27100, "level": 3400,
               "skills": 0, "no_email": 610, "same_email": 45 } }
```

`leftOut` counts, during the title scan, why each other person is not on the
list: `not_contactable` (merged, duplicate or do-not-contact), `other_job` (no
title matches), `level` (the job matches but not the level asked), `skills` (a
required skill is missing), `no_email` (fits, but no usable email) and
`same_email` (fits, but another record with the same email is already on the
list). It is `null` for a search run before 10 Nov.

`status` is `read` (not run yet), `running`, `done` or `failed`. Poll every
few seconds while running. A full scan of ~92,000 people takes about four
minutes (measured 9 Nov: 92,292 checked, 1,085 junior developers found).
`stopped` is true when a person pressed Stop.

### `GET /integrations/v1/contacts/discover/{id}/rows?cursor=&limit=500`

`{ "rows": [ … ], "nextCursor": "…" | null }`, up to 500 rows per page. Each row:

| Field | Note |
|---|---|
| `email` | lower case, always present |
| `name`, `phone`, `title`, `level`, `employer`, `location`, `linkedinUrl`, `experienceYears`, `skills`, `previousRole`, `sector` | as on the CV; missing fields are left out |
| `kind` | `current`, `previous` or `meaning` |
| `matchedBy` | why the row was kept, e.g. `current title: software engineer` |

Rows can be read while the scan is still running. The list is complete only
when the status is `done`.

### `GET /integrations/v1/contacts/discover/{id}/rows.csv`

The whole list as one CSV file, which Excel opens as it is (UTF-8 with a
byte-order mark; cells that could run as a formula are defused). `409` until
the search is `done`. Each download is counted on the search.

## Setting it up (owner)

1. Make a token: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
2. Put it in the TA deployment's environment as `CONTACTS_API_TOKEN`, through
   the release pipeline, never from a laptop.
3. Put the same value on the Brevo server only (Railway), never in its browser
   code. Turn on Brevo's Clerk lock (`CLERK_SECRET_KEY`, `ALLOWED_USER_IDS`)
   first, so only named people can reach the page that uses it.
