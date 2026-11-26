/**
 * The chip search service (26 Nov 2026). Holds every candidate's search card in
 * memory and answers the new UI's Database chat with the Run 7 chip search
 * (convex/lib/search/chipSearch.ts): ~0.3 s for the search itself plus three
 * short Haiku reads (the request, the job, the final check of the top 60).
 *
 * Why a service of its own: 94,830 cards cannot be searched inside one Convex
 * query, and the old Next server is the slow part of AURA. This runs beside
 * them on the same server, on the app's Docker network only (no public port),
 * and reads nothing but its cards file. It never writes anywhere.
 *
 *   POST /search  { turns: string[] }  -> the ranked people (ids, never names)
 *   POST /reload                        -> read the cards file again
 *   GET  /health                        -> card count and when they were read
 */
import http from "node:http";
import fs from "node:fs";
import readline from "node:readline";
import { createSearch } from "../../convex/lib/search/chipSearch";

const FILE = process.env.CHIP_CARDS || "/data/cards.jsonl";
const PORT = Number(process.env.CHIP_PORT || 3311);
const KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.CHIP_MODEL || "claude-haiku-5-5";
// A day's AI spend stops at this; the search then runs on the word rules alone.
const DAILY_USD = Number(process.env.CHIP_DAILY_USD || 10);
const MAX_TURNS = 8;
const MAX_CHARS = 12000;

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

let spend = { day: "", usd: 0 };
const today = () => new Date().toISOString().slice(0, 10);
const addSpend = (u: { input_tokens?: number; output_tokens?: number } | undefined) => {
  if (spend.day !== today()) spend = { day: today(), usd: 0 };
  spend.usd += ((u?.input_tokens ?? 0) * 1 + (u?.output_tokens ?? 0) * 5) / 1e6;
};

/** One Haiku read; null when there is no key, the day's limit is reached, or it fails. */
async function ask(system: string, user: string): Promise<string | null> {
  if (!KEY) return null;
  if (spend.day === today() && spend.usd >= DAILY_USD) return null;
  for (let t = 0; t < 2; t++) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 6000, thinking: { type: "disabled" }, system, messages: [{ role: "user", content: user }] }),
        signal: AbortSignal.timeout(25_000),
      });
      if (r.status === 429 || r.status >= 500) throw new Error(String(r.status));
      const j = (await r.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
      addSpend(j.usage);
      if (!r.ok) return null;
      return (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    } catch (e) {
      if (t === 1) { log("ask failed", String(e)); return null; }
      await new Promise((s) => setTimeout(s, 1500));
    }
  }
  return null;
}

type Search = ReturnType<typeof createSearch>;
let search: Search | null = null;
let cards = 0;
let loadedAt = "";
let loading: Promise<void> | null = null;
// Ranked lists waiting for their AI check (/check), by the search words.
const ranked = new Map<string, any>();

/** Reads the cards line by line (the file is ~400 MB); the model's raw answer is dropped to save memory. */
async function load(): Promise<void> {
  const t0 = Date.now();
  const list: any[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(FILE, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    try {
      const c = JSON.parse(line);
      delete c.raw;
      list.push(c);
    } catch { /* a broken line is skipped, never the whole file */ }
  }
  search = createSearch(list, ask);
  cards = list.length;
  loadedAt = new Date().toISOString();
  log(`loaded ${cards} cards in ${Date.now() - t0} ms`);
}
const reload = () => (loading ??= load().catch((e) => log("load failed", String(e))).finally(() => { loading = null; }));

/** What the Database chat needs: ids and the reasons, never a name, email or phone (cards hold none). */
function answer(r: any, max = 200) {
  return {
    ok: true,
    total: r.hits.length,
    removed: r.removed.length,
    hits: r.hits.slice(0, max).map((h: any) => ({ id: h.card.id, score: h.score, why: h.why, ai: h.ai ?? null, aiWhy: h.aiWhy ?? "" })),
    job: r.job,
    not: r.not,
    industry: r.industry,
    level: r.level,
    years: r.years,
    holders: r.holders,
    missing: r.missing,
    ai: r.ai,
    ms: Math.round(r.ms),
  };
}

const send = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: !!search, cards, loadedAt, spendUsd: spend.day === today() ? Number(spend.usd.toFixed(3)) : 0 });
    if (req.method === "POST" && req.url === "/reload") { reload(); return send(res, 202, { ok: true }); }
    if (req.method !== "POST" || (req.url !== "/search" && req.url !== "/check")) return send(res, 404, { ok: false, message: "Not found." });
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > MAX_CHARS * 8) return send(res, 413, { ok: false, message: "That search is too long." }); }
    const body = JSON.parse(raw || "{}");
    const turns = (Array.isArray(body.turns) ? body.turns : []).map((t: unknown) => String(t ?? "").trim()).filter(Boolean).slice(-MAX_TURNS);
    if (!turns.length) return send(res, 400, { ok: false, message: "Say who you are looking for." });
    if (!search) return send(res, 503, { ok: false, message: "The cards are still loading." });
    const key = turns.join("\n");
    if (req.url === "/check") {
      // The AI check over the people the caller kept (26 Nov 2026: men removed by name for
      // "female only" before the check, so the check is spent on the right people).
      const held = ranked.get(key);
      if (!held) return send(res, 409, { ok: false, message: "Search first." });
      const byId = new Map(held.all.map((h: any) => [h.card.id, h]));
      const list = (Array.isArray(body.ids) ? body.ids : []).map((id: unknown) => byId.get(String(id))).filter(Boolean);
      const c = await search.checkAll(key, list);
      return send(res, 200, answer({ ...held, hits: c.final, removed: c.removed }));
    }
    if (body.inspect === false) {
      // Ranked, no AI check yet: the caller narrows the list and asks /check.
      const r = await search(turns, { inspect: false });
      if (ranked.size > 50) ranked.clear();
      ranked.set(key, r);
      return send(res, 200, answer({ ...r, hits: r.all }, 400));
    }
    return send(res, 200, answer(await search(turns)));
  } catch (e) {
    log("search failed", String(e));
    return send(res, 500, { ok: false, message: "The search failed." });
  }
});

server.listen(PORT, () => log(`chip search on :${PORT}, cards ${FILE}`));
reload();
