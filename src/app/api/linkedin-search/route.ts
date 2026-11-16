// Server-side only: the Apify token never reaches the browser (APIFY_TOKEN in .env.local).
// shortcut: waits for the run (Apify's sync endpoint, 5 min cap) and keeps nothing; for big
// searches use an async run + webhook and save results by LinkedIn URL.
const ACTOR = "harvestapi~linkedin-profile-search";

const list = (s: unknown) =>
  String(s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export async function POST(req: Request) {
  const token = process.env.APIFY_TOKEN;
  if (!token) return Response.json({ error: "APIFY_TOKEN is not set in .env.local" }, { status: 500 });

  const f = await req.json().catch(() => null);
  if (!f) return Response.json({ error: "Bad request" }, { status: 400 });

  const titles = list(f.designation);
  const skills = list(f.skills);
  const companies = list(f.company);
  const locations = list(f.location);
  if (!titles.length && !skills.length && !companies.length && !locations.length)
    return Response.json({ error: "Fill in at least one field" }, { status: 400 });

  const input: Record<string, unknown> = {
    profileScraperMode: "Full",
    // Every search costs money (about $0.008 a profile): always capped.
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
  const body = await res.json().catch(() => null);
  if (!res.ok) return Response.json({ error: body?.error?.message ?? `Apify said ${res.status}` }, { status: 502 });
  return Response.json({ items: body });
}
