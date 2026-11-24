/**
 * Web search through the Anthropic API's own web_search tool (25 Nov 2026).
 *
 * Why: on the new server every free engine behind SearXNG blocks our one IP
 * after a few dozen searches (google cse "Suspended: too many requests",
 * DuckDuckGo CAPTCHA, Brave rate-limited), so a Suggestions round read 2
 * profiles from 28 searches. And with ANTHROPIC_API_KEY set, Haiku-only mode
 * switches the old subscription search (claudeSub.claudeWebSearch) off.
 *
 * Same rule as every engine: no model writes an address. Kept addresses are
 * the web_search_tool_result blocks the API returned; the model's reply only
 * lends each one a snippet, and an address it wrote that the search did not
 * return is dropped and counted.
 *
 * On when the key is there, unless C141_API_SEARCH=off. Costs about one cent a
 * search ($10 per 1,000 + Haiku tokens), so a day is capped at
 * C141_API_SEARCH_DAILY searches (default 400, about $4.50); past it SearXNG answers.
 */
import type { SearchHit, SearchResult } from "./serper";
import { jsonArrayIn } from "./claudeSub";
import { keepHit, parseBooleanQuery } from "./websearch";

const MODEL = "claude-haiku-5-5";
const TIMEOUT_MS = 30_000;

export function apiSearchEnabled(): boolean {
  if ((process.env.C141_API_SEARCH ?? "").trim().toLowerCase() === "off") return false;
  return (process.env.ANTHROPIC_API_KEY ?? "").trim().length > 10;
}

// ponytail: an in-process count per Colombo day, reset by a restart. A stored
// ledger if restarts ever make the cap leak.
let day = "";
let used = 0;
const colomboDay = (now = Date.now()) => new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);
export function dailyCap(): number {
  const n = Number(process.env.C141_API_SEARCH_DAILY ?? "");
  return Number.isFinite(n) && n >= 0 && (process.env.C141_API_SEARCH_DAILY ?? "").trim() !== "" ? n : 400;
}
/** Takes one search from today's allowance; false when the day's cap is reached. */
export function takeSearch(now = Date.now()): boolean {
  const d = colomboDay(now);
  if (d !== day) {
    day = d;
    used = 0;
  }
  if (used >= dailyCap()) return false;
  used++;
  return true;
}

interface ApiBlock {
  type?: string;
  text?: string;
  content?: unknown;
}

/** What one Messages API answer found. Pure, so the grounding rule is tested without a key. */
export function parseApiSearch(json: { content?: ApiBlock[]; error?: { message?: string } }, q: string, num: number): SearchResult & { ungrounded: number } {
  if (json.error) return { hits: [], credits: 0, error: `anthropic: ${(json.error.message ?? "error").slice(0, 200)}`, ungrounded: 0 };
  const found = new Map<string, string>();
  let text = "";
  let refused = "";
  for (const b of json.content ?? []) {
    if (b.type === "text") text += `${b.text ?? ""}\n`;
    if (b.type !== "web_search_tool_result") continue;
    const items = Array.isArray(b.content) ? b.content : [b.content];
    for (const r of items as { type?: string; url?: string; title?: string; error_code?: string }[]) {
      if (r?.type === "web_search_result" && typeof r.url === "string" && /^https?:\/\//.test(r.url)) {
        if (!found.has(r.url)) found.set(r.url, (r.title ?? "").trim());
      } else if (r?.error_code) refused = r.error_code;
    }
  }
  if (!found.size) return refused ? { hits: [], credits: 1, error: `anthropic: ${refused}`, ungrounded: 0 } : { hits: [], credits: 1, ungrounded: 0 };

  const snippets = new Map<string, string>();
  let ungrounded = 0;
  for (const r of jsonArrayIn(text)) {
    const url = typeof r?.url === "string" ? r.url.trim() : "";
    if (!url) continue;
    if (!found.has(url)) {
      ungrounded++;
      continue;
    }
    if (typeof r.snippet === "string") snippets.set(url, r.snippet.trim());
  }
  const parsed = parseBooleanQuery(q);
  const hits: SearchHit[] = [];
  for (const [url, title] of found) {
    const hit = { url, title, snippet: snippets.get(url) ?? "" };
    if (keepHit(hit, parsed)) hits.push(hit);
  }
  return { hits: hits.slice(0, num), credits: 1, ungrounded };
}

export async function anthropicWebSearch(q: string, num = 10): Promise<SearchResult> {
  if (!takeSearch()) return { hits: [], credits: 0, error: "anthropic: today's search cap reached", provider: "anthropic" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": (process.env.ANTHROPIC_API_KEY ?? "").trim(),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
        messages: [
          {
            role: "user",
            content: `Use the web_search tool once, with exactly this query and nothing added or changed:

${q}

Then answer with only a JSON array — no other text — of up to ${num} of the results it returned, in the order it returned them:
[{"url": "the result's address, exactly as the search returned it", "snippet": "one or two sentences of what that page says, from the search result"}]
Only addresses the search returned. If it returned nothing, answer [].`,
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as Parameters<typeof parseApiSearch>[0];
    if (!res.ok && !json.error) return { hits: [], credits: 0, error: `anthropic: ${res.status}`, provider: "anthropic" };
    return { ...parseApiSearch(json, q, num), provider: "anthropic" };
  } catch (e) {
    return { hits: [], credits: 0, error: `anthropic: ${String(e).slice(0, 200)}`, provider: "anthropic" };
  }
}
