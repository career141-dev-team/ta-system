// The live dev link's LinkedIn search (Cloudflare Pages Function). The site itself is a
// static export with no server, so this does on Cloudflare what
// src/app/api/linkedin-search/route.ts does on a local run - keep the two the same.
// APIFY_TOKEN is a Secret in Cloudflare (Pages > ta-system-ui > Settings > Variables
// and Secrets); it never reaches the browser.
// ponytail: no sign-in yet, so anyone with the link can search; spend is held by the
// 50-profile cap here and Apify's own monthly usage limit. Gate it when sign-in exists.
const ACTOR = "harvestapi~linkedin-profile-search";

const list = (s: unknown) =>
  String(s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export const onRequestPost = async ({ request, env }: { request: Request; env: { APIFY_TOKEN?: string } }) => {
  const token = env.APIFY_TOKEN;
  if (!token) return Response.json({ error: "LinkedIn search is not switched on yet: APIFY_TOKEN is not set in Cloudflare." }, { status: 500 });

  const f = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!f) return Response.json({ error: "Bad request" }, { status: 400 });

  const titles = list(f.designation);
  const skills = list(f.skills);
  const companies = list(f.company);
  const locations = list(f.location);
  if (!titles.length && !skills.length && !companies.length && !locations.length)
    return Response.json({ error: "Fill in at least one field" }, { status: 400 });

  const input: Record<string, unknown> = {
    profileScraperMode: "Full",
    maxItems: Math.min(Math.max(Number(f.maxItems) || 10, 1), 50),
  };
  if (titles.length) input.currentJobTitles = titles;
  if (skills.length) input.searchQuery = skills.join(" ");
  if (companies.length) input.currentCompanies = companies;
  if (locations.length) input.locations = locations;
  if (f.years) input.yearsOfExperienceIds = [String(f.years)];

  const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) return Response.json({ error: body?.error?.message ?? `Apify said ${res.status}` }, { status: 502 });
  return Response.json({ items: body });
};
