// The LinkedIn search, "Option 2" (owner, 17 Nov 2026): read one page of 25 people
// (Short mode, $0.10, nothing per person), open only the 10 that look most likely
// ($0.004 each), check those against what the TA asked, best first. About $0.14 a
// search instead of $0.20 for opening all 25. Shared by the local route
// (src/app/api/linkedin-search/route.ts) and the dev link's Cloudflare function
// (functions/api/linkedin-search.ts), so the two cannot drift. Relative imports only:
// the Cloudflare bundler does not know the "@/" alias.
// Prices: the actors' Apify pages, 16-17 Nov 2026 (the Starter plan's Bronze discount
// makes them a little lower).
import type { Ask } from "../app/linkedin-search/read";
import { toProfile, type Profile } from "./linkedinProfile";

const SEARCH = "harvestapi~linkedin-profile-search";
const PROFILE = "harvestapi~linkedin-profile-scraper";
export const PAGE_PRICE = 0.1;
export const PROFILE_PRICE = 0.004;
export const PAGE_SIZE = 25;
export const OPEN = 10;

/** One person as the chat shows them. */
export type Found = {
  name: string;
  headline: string;
  url: string;
  place: string;
  now: string;
  /** Years since their first job (opened profiles only). */
  years?: number;
  skills: string[];
  /** What AURA checked on an opened profile, each met or not. */
  checks: { ok: boolean; text: string }[];
  /** Everything the opened profile showed (roles by year, education...), so the CV pane needs no second read. */
  profile?: Profile;
};
export type SearchResult = { checked: Found[]; others: Found[]; pages: number; opened: number; cost: number; note?: string };

// The actors' output is only partly documented: read every field defensively.
type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown) => (Array.isArray(v) ? (v as Raw[]) : []);
// The search actor's link field has more than one name (20 Nov 2026: two live searches
// found 0 people while the call itself answered - every row was dropped for "no link").
// The handle builds the link when no URL field is there.
const urlOf = (p: Raw) => {
  const u = str(p.linkedinUrl) || str(p.profileUrl) || str(p.url) || str(p.linkedinProfileUrl) || str(p.publicProfileUrl) || str(p.navigationUrl);
  if (u) return u;
  const handle = str(p.publicIdentifier) || str(p.publicId) || str(p.username);
  return handle ? `https://www.linkedin.com/in/${handle}` : "";
};
const placeOf = (p: Raw) => (typeof p.location === "string" ? p.location : str((p.location as Raw | undefined)?.linkedinText));
const nameOf = (p: Raw) => [str(p.firstName), str(p.lastName)].filter(Boolean).join(" ") || str(p.name) || "Name not shown";
const skillsOf = (p: Raw) => arr(p.skills).map((s) => (typeof s === "string" ? s : str(s.name))).filter(Boolean);
const has = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase());
/** Every word of the wanted title appears as a whole word, in any order ("C++" works too). */
export const titleMatch = (want: string, hay: string) =>
  want
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(hay));
const MONTHS =["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Years from the earliest job start to today (overlapping jobs are not double counted). */
function yearsOf(p: Raw) {
  let first = Infinity;
  for (const e of arr(p.experience)) {
    const d = e.startDate as Raw | undefined;
    const y = Number(d?.year);
    if (!y) continue;
    const m = Math.max(0, MONTHS.indexOf(str(d?.month).slice(0, 3).toLowerCase()));
    first = Math.min(first, y * 12 + m);
  }
  if (!Number.isFinite(first)) return undefined;
  const now = new Date();
  return Math.max(0, Math.floor((now.getFullYear() * 12 + now.getMonth() - first) / 12));
}

/** How likely a list row is, from its headline alone (free): decides who gets opened. */
const likely = (p: Raw, a: Ask) => {
  const text = `${str(p.headline)} ${placeOf(p)}`;
  return [...a.titles, ...a.companies, ...a.keywords, ...a.locations].filter((w) => has(text, w)).length;
};

function toFound(p: Raw, a: Ask, full: boolean): Found {
  const job = arr(p.experience)[0];
  const company = str(arr(p.currentPosition)[0]?.companyName) || str(job?.companyName);
  const title = str(job?.position);
  const base: Found = {
    name: nameOf(p),
    headline: str(p.headline),
    url: urlOf(p),
    place: placeOf(p),
    now: [title, company].filter(Boolean).join(" at "),
    skills: skillsOf(p).slice(0, 8),
    checks: [],
  };
  if (!full) return base;
  const text = [str(p.headline), title, str(p.about), skillsOf(p).join(" "), ...arr(p.experience).map((e) => `${str(e.position)} ${str(e.description)}`)].join(" ");
  const years = yearsOf(p);
  base.years = years;
  base.profile = toProfile(p);
  base.checks = [
    // Every word of the title, any order: "HR Manager" matches "Manager - HR" (live, 17 Nov 2026).
    ...a.titles.map((t) => ({
      ok: titleMatch(t, `${title} ${str(p.headline)}`),
      text: t,
    })),
    ...a.companies.map((c) => ({ ok: has(company, c), text: `At ${c}` })),
    ...a.locations.map((l) => ({ ok: has(base.place, l), text: `In ${l}` })),
    ...(a.minYears ? [{ ok: (years ?? 0) >= a.minYears, text: years === undefined ? `${a.minYears}+ years (dates not shown)` : `${years} years` }] : []),
    ...a.keywords.map((k) => ({ ok: has(text, k), text: k })),
  ];
  return base;
}

const score = (f: Found) => f.checks.filter((c) => c.ok).length;

async function run(token: string, actor: string, input: Raw): Promise<Raw[]> {
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new Error(str((body as { error?: { message?: string } } | null)?.error?.message) || `Apify said ${res.status}`);
  return arr(body);
}

// The words come from the browser: only short lists of short strings go to Apify.
const clean = (v: unknown) => arr(v).map((x) => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, 5);

/** Validates the TA's search and runs it. Returns a Response for either host. */
export async function linkedinSearch(token: string | undefined, body: unknown): Promise<Response> {
  if (!token) return Response.json({ error: "LinkedIn search is not switched on yet: the Apify key is not set." }, { status: 500 });
  const b = (body ?? {}) as Raw;
  const a: Ask = {
    titles: clean(b.titles),
    companies: clean(b.companies),
    locations: clean(b.locations),
    keywords: clean(b.keywords),
    years: /^[1-5]$/.test(String(b.years)) ? String(b.years) : "",
    minYears: Math.min(Math.max(Number(b.minYears) || 0, 0), 40),
  };
  if (!a.titles.length && !a.companies.length && !a.locations.length && !a.keywords.length)
    return Response.json({ error: "Tell me a job title, a company, a place or a skill." }, { status: 400 });

  try {
    // 1. One page of 25, Short mode: $0.10, no charge per person.
    const input: Raw = { profileScraperMode: "Short", maxItems: PAGE_SIZE };
    if (a.titles.length) input.currentJobTitles = a.titles;
    if (a.companies.length) input.currentCompanies = a.companies;
    if (a.locations.length) input.locations = a.locations;
    if (a.keywords.length) input.searchQuery = a.keywords.join(" ");
    if (a.years) input.yearsOfExperienceIds = [a.years];
    const rows = await run(token, SEARCH, input);
    const list = rows.filter((p) => urlOf(p));
    if (!list.length) {
      // Say what came back, so "nobody found" and "found but unreadable" are told apart
      // (field names only - no person's details).
      const note = rows.length
        ? `LinkedIn sent ${rows.length} people, but none had a profile link this screen can read (fields: ${Object.keys(rows[0] ?? {}).slice(0, 15).join(", ")}).`
        : undefined;
      return Response.json({ checked: [], others: [], pages: 1, opened: 0, cost: PAGE_PRICE, note } satisfies SearchResult);
    }

    // 2. Open only the 10 most likely, by headline.
    const ranked = [...list].sort((x, y) => likely(y, a) - likely(x, a));
    const pick = ranked.slice(0, OPEN);
    const rest = ranked.slice(OPEN).map((p) => toFound(p, a, false));
    let full: Raw[] = [];
    let note: string | undefined;
    try {
      // Input as the scraper's own README example; "Profile details no email" = $0.004.
      full = await run(token, PROFILE, { profileScraperMode: "Profile details no email ($4 per 1k)", queries: pick.map(urlOf) });
    } catch (e) {
      note = `Could not open the profiles (${e instanceof Error ? e.message : "Apify failed"}), so these are not checked.`;
    }
    // The two actors write the same profile's link differently (first live search,
    // 17 Nov 2026: 10 opened, none joined back), so join on the /in/ handle, or the name.
    const slug = (u: string) => (u.match(/\/in\/([^/?#]+)/i)?.[1] ?? u).toLowerCase();
    const byKey = new Map<string, Raw>();
    for (const p of full) {
      byKey.set(slug(urlOf(p)), p);
      for (const q of [str(p.query), str(p.originalQuery), str(p.publicIdentifier)]) if (q) byKey.set(slug(q), p);
      byKey.set(nameOf(p).toLowerCase(), p);
    }
    const checked = pick
      .map((p) => {
        const f = byKey.get(slug(urlOf(p))) ?? byKey.get(nameOf(p).toLowerCase());
        return f ? toFound(f, a, true) : toFound(p, a, false);
      })
      .sort((x, y) => score(y) - score(x));
    const opened = full.length;
    const result: SearchResult = {
      checked,
      others: rest,
      pages: 1,
      opened,
      cost: Math.round((PAGE_PRICE + opened * PROFILE_PRICE) * 1000) / 1000,
      note,
    };
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Apify failed" }, { status: 502 });
  }
}
