// The live dev link's LinkedIn search (Cloudflare Pages Function). The site itself is a
// static export with no server, so this runs on Cloudflare what
// src/app/api/linkedin-search/route.ts runs locally - both call src/lib/linkedinSearch.ts.
// APIFY_TOKEN is a Secret in Cloudflare (Pages > ta-system-ui > Settings > Variables
// and Secrets); it never reaches the browser.
// ponytail: no sign-in yet, so anyone with the link can search; spend is held by one
// page + 10 profiles a search and Apify's own monthly usage limit. Gate it when sign-in exists.
import { linkedinSearch } from "../../src/lib/linkedinSearch";

export const onRequestPost = async ({ request, env }: { request: Request; env: { APIFY_TOKEN?: string } }) =>
  linkedinSearch(env.APIFY_TOKEN, await request.json().catch(() => null));
