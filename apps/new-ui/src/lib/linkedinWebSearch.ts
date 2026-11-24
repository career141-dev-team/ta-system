// LinkedIn Search without Apify (25 Nov 2026). Apify's free plan stopped every run
// ("free user run limit reached") and no paid key is set yet, so every search failed.
// This reads LinkedIn's PUBLIC profile results through the Anthropic API's own web
// search (Haiku + web_search, about one cent a search): name, headline, link, and
// what the result says - checked against the brief like an opened profile, from
// that text only. Apify stays the deep read (dates, skills) once its key is set.
// Same rule as the TA System's search: an address is kept only when the search
// tool returned it, never because the model wrote it.
import type { Ask } from "../app/linkedin-search/read";
import { titleMatch, type Found, type SearchResult } from "./linkedinSearch";

export const SEARCH_PRICE = 0.011;
const has = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase());
const slug = (u: string) => (u.match(/\/in\/([^/?#]+)/i)?.[1] ?? "").toLowerCase();

/** The searches for a brief: the title in the place, then the title with the company or the skills. */
export function webQueries(a: Ask): string[] {
  const place = a.locations[0] ?? "Sri Lanka";
  const q = (...parts: string[]) => ["site:linkedin.com/in", ...parts.filter(Boolean)].join(" ");
  const title = a.titles[0] ? `"${a.titles[0]}"` : "";
  const out = [q(title, a.companies[0] ? `"${a.companies[0]}"` : "", `"${place}"`)];
  if (a.keywords.length || a.titles.length > 1 || a.companies.length > 1)
    out.push(q(a.titles[1] ? `"${a.titles[1]}"` : title, a.companies[1] ? `"${a.companies[1]}"` : "", ...a.keywords.slice(0, 2).map((k) => `"${k}"`), place));
  return out;
}

/** "Name - Headline - Company | LinkedIn" into its parts. */
export function readTitle(t: string): { name: string; headline: string } {
  const parts = t.replace(/\s*\|\s*LinkedIn.*$/i, "").split(/\s+[-–|]\s+/).map((x) => x.trim()).filter(Boolean);
  return { name: parts[0] ?? "Name not shown", headline: parts.slice(1).join(" - ") };
}

/** One result as the chat's row, with the brief checked against what it says. */
export function toWebFound(hit: { url: string; title: string; snippet: string }, a: Ask): Found {
  const { name, headline } = readTitle(hit.title);
  const text = `${hit.title} ${hit.snippet}`;
  const place = a.locations.find((l) => has(text, l)) ?? (has(text, "Sri Lanka") ? "Sri Lanka" : "");
  return {
    name,
    headline,
    url: `https://www.linkedin.com/in/${slug(hit.url)}`,
    place,
    now: headline,
    skills: [],
    checks: [
      ...a.titles.map((t) => ({ ok: titleMatch(t, text), text: t })),
      ...a.companies.map((c) => ({ ok: has(text, c), text: `At ${c}` })),
      ...a.locations.map((l) => ({ ok: has(text, l), text: `In ${l}` })),
      ...a.keywords.map((k) => ({ ok: has(text, k), text: k })),
    ],
  };
}

type Block = { type?: string; text?: string; content?: unknown };

async function oneSearch(key: string, q: string): Promise<{ url: string; title: string; snippet: string }[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-5-5",
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
      messages: [
        {
          role: "user",
          content: `Use the web_search tool once, with exactly this query and nothing added or changed:\n\n${q}\n\nThen answer with only a JSON array of up to 10 of the results it returned:\n[{"url": "the address exactly as returned", "snippet": "one sentence of what the result says about the person: current role, company, place"}]\nOnly addresses the search returned. If none, answer [].`,
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as { content?: Block[]; error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message || `web search said ${res.status}`);
  const found = new Map<string, string>();
  let text = "";
  for (const b of json.content ?? []) {
    if (b.type === "text") text += b.text ?? "";
    if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
    for (const r of b.content as { type?: string; url?: string; title?: string }[])
      if (r?.type === "web_search_result" && r.url && slug(r.url)) found.set(slug(r.url), r.title ?? "");
  }
  const snippets = new Map<string, string>();
  const at = text.indexOf("[");
  try {
    for (const r of JSON.parse(text.slice(at, text.lastIndexOf("]") + 1)) as { url?: string; snippet?: string }[])
      if (r?.url && found.has(slug(r.url)) && typeof r.snippet === "string") snippets.set(slug(r.url), r.snippet);
  } catch {
    // No readable reply: the titles alone still count.
  }
  return [...found].map(([s, title]) => ({ url: `https://www.linkedin.com/in/${s}`, title, snippet: snippets.get(s) ?? "" }));
}

export async function linkedinWebSearch(key: string, a: Ask, why: string): Promise<Response> {
  const queries = webQueries(a);
  const seen = new Map<string, Found>();
  let ran = 0;
  for (const hits of await Promise.all(queries.map((q) => oneSearch(key, q).then((h) => (ran++, h)).catch(() => [])))) {
    for (const h of hits) if (!seen.has(slug(h.url))) seen.set(slug(h.url), toWebFound(h, a));
  }
  const score = (f: Found) => f.checks.filter((c) => c.ok).length;
  const checked = [...seen.values()].sort((x, y) => score(y) - score(x));
  const result: SearchResult = {
    checked,
    others: [],
    pages: ran,
    opened: 0,
    cost: Math.round(ran * SEARCH_PRICE * 1000) / 1000,
    note: `${why} Read from LinkedIn's public results by web search: name, headline and link - open a profile for the rest.`,
  };
  return Response.json(result);
}
