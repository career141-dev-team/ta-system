# Jobs on career141.com — the feed

From 10 Nov 2026 the TA System decides which jobs career141.com shows. On every
job there is a **Website** switch (on the Openings list and on the job's own
bar). On: the job is listed. Off: it is gone.

Who can press it: an admin always; ops and TA leads when an admin ticks them on
the People page under "Jobs on the website" (ops are ticked from the start).

A job is shown only while it is **open** and its **JD is approved**. A job put on
hold, placed or closed drops off by itself, and comes back if it is reopened
with the switch still on.

## The call

```
GET https://api.career141.com/http/integrations/v1/website/jobs
Authorization: Bearer <WEBSITE_API_TOKEN>
```

| Answer | Means |
|---|---|
| 200 `{ "jobs": [...] }` | The jobs to show, newest listed first |
| 401 | Wrong or missing key |
| 503 | `WEBSITE_API_TOKEN` is not set on the TA deployment yet |

Each job:

```json
{
  "id": "k57...",
  "title": "Senior Accountant",
  "locations": ["Colombo"],
  "description": "The approved JD, as Markdown",
  "skills": ["IFRS"],
  "experienceMinYears": 5,
  "experienceMaxYears": null,
  "postedAt": 1762761600000,
  "applyEmail": "cv@career141.com",
  "applySubject": "Application: Senior Accountant"
}
```

The client's name, the salary and the people working the job are never in it. The JD is cleaned first: its Client and Package line, any Package, Salary or Benefits section, and the client's name wherever else it appears ("our client").

## For the website

- Call it **from the server only** (the key must never reach a browser), and keep
  the answer for about five minutes (for example `next: { revalidate: 300 }`), so
  a page view never reaches the TA backend.
- "Apply" opens an email to `applyEmail` with `applySubject` as the subject.
  cv@ is already read by the TA System, which files a CV against the job when the subject matches one of its job posts.
- If the call fails, show the last list you had, or "No open jobs right now".

## Setting it up (owner)

1. Make a long random key.
2. TA Convex dashboard > Settings > Environment Variables: `WEBSITE_API_TOKEN`.
3. The same value in the website's server environment.
