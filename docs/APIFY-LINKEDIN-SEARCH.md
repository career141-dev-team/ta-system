# Apify LinkedIn Search – TA System Integration

Nov 16, 2026 · @Uzmaan

## Overview

We can add LinkedIn candidate search to the TA system for about **$19 a month** using Apify and the HarvestAPI search tool. Recruiters enter filters such as role, skills, location and experience, and get back full profiles with work history, skills and current company.

- **Apify** is a cloud platform that runs ready-made scraping tools ("actors") through an API. We pay Apify only.
- **HarvestAPI LinkedIn Profile Search** ([`harvestapi/linkedin-profile-search`](https://apify.com/harvestapi/linkedin-profile-search)) is the actor we would use. It needs no LinkedIn login or cookies, is rated 4.4 from 102 reviews, and has about 8,000 monthly users.
- **What recruiters get:** search by job title, location, current company and years of experience, with results showing name, headline, location, current role, full work history, education and skills.

## Pricing and budget

The Apify Starter plan at $19 a month covers our 500 profiles a month several times over. The HarvestAPI charges come out of the plan's monthly credit, so they are not billed on top.

**What the actor charges** (deducted from Apify credit; Free plan prices shown, and Starter is slightly cheaper):

| Charge | Price | When it applies |
| --- | --- | --- |
| Search page | $0.10 per page (up to 25 people) | Every page loaded, even if it returns few or no results |
| Full profile | $0.004 per person ($4 per 1,000) | Skills, experience, education. This is the mode we need |
| Full profile + email | $0.01 per person ($10 per 1,000) | Used instead of Full profile; an email is not always found |
| Platform usage | Included, $0 | Server costs are built into the prices above |

One page of 25 full profiles costs $0.10 + 25 × $0.004 = **$0.20, about $0.008 per profile**.

**Apify plans** ([pricing](https://apify.com/pricing)):

| Plan | Monthly price | Credit included | Fit for us |
| --- | --- | --- | --- |
| Free | $0 | $5 | Testing only: 10 runs of this actor in total |
| **Starter** | **$19** | **$19** | **Recommended: about 2,000–2,300 full profiles a month** |
| Scale | $199 | $199 | Only past about 25,000 profiles a month |
| Business | $999 | $999 | Not needed |

Unused credit expires at the end of each month. Usage above $19 is billed on the next invoice.

**Estimate for 500 full profiles a month:** about $4 if recruiters run a few large searches (20 pages), or about $7 if they run around 50 small searches. Adding email lookup brings it to about $10. All of these fit inside the $19 credit.

## How to connect it

The TA system's backend calls the Apify API; the browser never talks to Apify directly, so the API token stays private.

&#91;embedded content: TA system ↔ Apify integration flow\]

Results are saved in our database first, so we never pay twice to search for the same person.

**Development steps:**

1. Create an Apify account, upgrade to Starter, and copy the API token from Settings → Integrations. Store it as a server environment variable.
2. Install the official client on the backend: `npm install apify-client` (Node) or `pip install apify-client` (Python).
3. Build a search form in the TA system with fields for keywords, job title, location, current company and experience level.
4. Map the form to the actor input and start a run. For anything beyond a small search, use an async run plus an Apify webhook instead of waiting on the request.
5. Fetch the results from the run's dataset, map the fields to our candidate model, and save them, skipping profiles we already have by their LinkedIn URL.
6. Show the results to recruiters, with an option to add a candidate to a job pipeline.
7. Set a monthly usage limit in Apify and log how many searches each recruiter runs.

```js
import { ApifyClient } from 'apify-client';
const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

const run = await client.actor('harvestapi/linkedin-profile-search').call({
  searchQuery: 'software developer',
  locations: ['Sri Lanka'],
  profileScraperMode: 'Full',
  maxItems: 20,
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
// items = profiles → save to DB → show in TA system
```

## Input and output

We send search filters as JSON and get back one JSON record per person. Every input field is optional ([input schema](https://apify.com/harvestapi/linkedin-profile-search/input-schema)).

**What we send:**

| Field | Example | Notes |
| --- | --- | --- |
| `searchQuery` | "React developer" | Free-text search; supports LinkedIn search operators |
| `currentJobTitles` | \["Software Engineer"\] | Up to 50 titles |
| `locations` | \["Sri Lanka"\] or \["Colombo, Sri Lanka"\] | Must use LinkedIn's exact place names |
| `currentCompanies` | \["https://www.linkedin.com/company/wso2/"\] | LinkedIn company URLs, not names |
| `yearsOfExperienceIds` | \["3"\] | ID codes; "3" means 3–5 years |
| `profileScraperMode` | "Full" | Short, Full, or Full + email search |
| `maxItems` | 20 | Always set this to cap the cost of each search |

```json
{
  "searchQuery": "software developer",
  "locations": ["Sri Lanka"],
  "yearsOfExperienceIds": ["3"],
  "profileScraperMode": "Full",
  "maxItems": 20
}
```

**What we get back (Full mode), per person:**

- Name, headline, LinkedIn URL, profile photo
- Location
- Current company and job title
- Full work history (past roles and companies)
- Education
- Skills, certifications, languages, projects
- Email, only in "Full + email" mode and only where one is found

Check the exact field names and mode values against a real test run before you build the mapping into the TA system.

## Risks and next steps

The main risk is LinkedIn itself. Because the plan is monthly and can be cancelled, our money at risk is small.

- **Legal and vendor risk:** LinkedIn sued Proxycurl, a LinkedIn data API, in January 2025, and Proxycurl shut down on July 4, 2025 ([ZoomInfo](https://pipeline.zoominfo.com/sales/proxycurl-alternatives)). LinkedIn has since sued at least one more scraper ([Bloomberg Law](https://news.bloomberglaw.com/artificial-intelligence/linkedins-war-against-bot-scrapers-ramps-up-as-ai-gets-smarter)). The actor could stop working without notice. Keep it behind our own interface so the provider can be swapped.
- **Search limits:** LinkedIn returns at most 2,500 results per search, so split broad searches by city, title or experience level. Result counts can vary between runs.
- **No "open to work" filter:** a profile appearing in results doesn't mean the person is job-seeking. Recruiters still need to reach out.
- **Personal data:** we would store data about people who never applied. Check our obligations under Sri Lanka's data protection law (and GDPR for EU candidates), and get legal advice before going live.
