/**
 * The chip search service (services/chip-search) as the Database chat's first
 * choice for plain-words searches (26 Nov 2026). On the app's Docker network
 * only. Any failure - not started, still loading, slow, refused - answers
 * null and the chat falls back to the old engine, so the chat never breaks
 * because of it. C141_CHIP_SEARCH=off switches it off without a release.
 */
export type ChipHit = { id: string; score: number; why: string[]; ai: number | null; aiWhy: string; gender?: "male" | "female" | null };
export type ChipAnswer = {
  ok: true;
  total: number;
  removed: number;
  hits: ChipHit[];
  job: string[];
  not: string[];
  industry: string[];
  level: number | null;
  years: [number | null, number | null] | null;
};

export type ChipAgentCandidate = {
  id: string;
  tier: "confirmed" | "unconfirmed";
  fit: number;
  reason: string;
  gender: "male" | "female" | null;
};
export type ChipAgentAnswer = {
  ok: true;
  reply: string;
  read: string;
  total: number;
  candidates: ChipAgentCandidate[];
  steps: number;
  ms: number;
};

const URL_DEFAULT = "http://chip-search:3311/search";
const WAIT_MS = 45_000;

// The chat sends the same words again (re-opening a past chat, the full pass after the quick one).
const held = new Map<string, { at: number; a: ChipAnswer }>();
const HOLD_MS = 10 * 60_000;

async function postJson<T>(path: "/search" | "/check" | "/agent", body: unknown): Promise<T | null> {
  try {
    const url = (process.env.C141_CHIP_SEARCH_URL || URL_DEFAULT).replace(/\/search$/, path);
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(WAIT_MS) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

async function post(path: "/search" | "/check", body: unknown): Promise<ChipAnswer | null> {
  const a = await postJson<ChipAnswer>(path, body);
  return a?.ok && Array.isArray(a.hits) ? a : null;
}

/**
 * Tool-calling agent over the 94,830-card chip search engine (27 Nov 2026).
 * Returns null if disabled, unreachable, or refused so the caller falls back cleanly.
 */
export async function chipAgent(body: {
  turns: string[];
  currentIds?: string[];
  genders?: Record<string, "f" | "m">;
  wantGender?: "female" | "male" | null;
  limit?: number | null;
}): Promise<ChipAgentAnswer | null> {
  if (process.env.C141_CHIP_SEARCH === "off" || process.env.C141_CHIP_AGENT === "off") return null;
  const a = await postJson<ChipAgentAnswer>("/agent", body);
  return a?.ok && Array.isArray(a.candidates) ? a : null;
}

/** Explicit result count asked in a prompt ("show top 10", "first 5", "give me 15"), clamped 1..max. */
export function limitAsked(text: string, max = 60): number | null {
  const t = text.toLowerCase();
  const m =
    t.match(/\b(?:show|give(?:\s+me)?|list|return|send|get|only)\s+(?:the\s+)?(?:top|first|best)?\s*(\d{1,2})\b/) ??
    t.match(/\b(?:top|first|best)\s+(\d{1,2})\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? Math.min(max, n) : null;
}

/**
 * The search with its AI check. `narrow` (26 Nov 2026) removes people the search cannot
 * see - men by name for "female only" - BEFORE the AI check, so the check is spent on the
 * people who can be shown: ranked list first, narrowed here, then /check on what is left.
 */
export type Narrowed = { ids: string[]; genders: Record<string, "f" | "m"> };
export async function chipSearch(turns: string[], narrow?: (hits: ChipHit[]) => Promise<Narrowed | null>): Promise<ChipAnswer | null> {
  if (process.env.C141_CHIP_SEARCH === "off") return null;
  const key = turns.join("\n");
  const h = held.get(key);
  if (h && Date.now() - h.at < HOLD_MS) return h.a;
  let a: ChipAnswer | null = null;
  if (narrow) {
    const ranked = await post("/search", { turns, inspect: false });
    const n = ranked && (await narrow(ranked.hits));
    if (ranked && n) a = await post("/check", { turns, ids: n.ids, genders: n.genders });
  }
  a ??= await post("/search", { turns });
  if (!a) return null;
  if (held.size > 200) held.clear();
  held.set(key, { at: Date.now(), a });
  return a;
}

/** The search's own 0-450 rank as the chat's 0-99 match figure. */
export const chipScore = (rank: number) => Math.max(1, Math.min(99, Math.round(rank / 4)));

/** One line on what the search read, for the chat's "I looked for" line. */
export function chipReadLine(a: ChipAnswer): string {
  const parts: string[] = [];
  if (a.job.length) parts.push(a.job.slice(0, 4).join(", "));
  if (a.years) parts.push(`${a.years[0] ?? 0}-${a.years[1] ?? "+"} years`);
  if (a.industry.length) parts.push(a.industry.slice(0, 3).join(", "));
  return parts.join(" · ");
}

/** Which gender the request asks for, if any ("female candidates only", "ladies", "male only"). */
export function genderAsked(text: string): "female" | "male" | null {
  const t = text.toLowerCase();
  const f = /\b(female|females|women|woman|ladies|lady|girls?)\b/.test(t);
  const m = /\b(male|males|men|gentlemen|boys?)\b/.test(t.replace(/\bfe(male)/g, ""));
  return f && !m ? "female" : m && !f ? "male" : null;
}

/**
 * Gender read from first names (26 Nov 2026). Only ~12% of records say male or
 * female, so "female candidates only" let through nearly every man as "not
 * known". Haiku reads only the first names (nothing else about the person) and
 * answers f, m or ? for each; any failure answers nothing and no one is dropped.
 */
export const firstNames = (n: string) =>
  (n || "").replace(/[^A-Za-z .'-]/g, " ").trim().split(/\s+/).filter((w) => w.length > 2 && !/^[A-Z]\.?$/.test(w)).slice(0, 2).join(" ");

export async function genderByName(names: string[]): Promise<("f" | "m" | "?")[] | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !names.length) return null;
  // Blank names are never sent (a blank in a plain list shifted every answer after it);
  // each answer comes back under its own number, so a skipped one only leaves that person "?".
  const asked = names.map((n, i) => ({ i, n: firstNames(n) })).filter((x) => x.n);
  if (!asked.length) return names.map(() => "?");
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-5-5",
        max_tokens: 4000,
        thinking: { type: "disabled" },
        system: "For each numbered name (mostly Sri Lankan, also Indian and Muslim names), say if it is a woman's name (f), a man's name (m), or not clear (?). Answer only a JSON object from each number to f, m or ?, for example {\"1\":\"f\",\"2\":\"m\"}, nothing else.",
        messages: [{ role: "user", content: asked.map((x) => `${x.i + 1}. ${x.n}`).join("\n") }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    const text = (j.content ?? []).map((c) => c.text ?? "").join("");
    const o = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Record<string, unknown>;
    return names.map((_, i) => (o[String(i + 1)] === "f" || o[String(i + 1)] === "m" ? (o[String(i + 1)] as "f" | "m") : "?"));
  } catch {
    return null;
  }
}
