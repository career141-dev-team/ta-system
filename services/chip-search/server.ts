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
import { createAgent, type AgentModelCaller, type AgentModelResponse, type AgentResult } from "./agent";

const FILE = process.env.CHIP_CARDS || "/data/cards.jsonl";
const PORT = Number(process.env.CHIP_PORT || 3311);
const KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const OPENROUTER_KEY = (process.env.OPENROUTER_API_KEY || "").trim();
const PREFER_OPENROUTER = (process.env.C141_LLM_PROVIDER || "").trim().toLowerCase() === "openrouter";
const MODEL = process.env.CHIP_MODEL || "claude-haiku-5-5";
const AGENT_MODEL = process.env.CHIP_AGENT_MODEL || "claude-sonnet-5-5";
const DEEPSEEK_MODEL = process.env.CHIP_FALLBACK_MODEL || "deepseek/deepseek-v4-flash";
// A day's AI spend stops at this; the search then runs on the word rules alone.
const DAILY_USD = Number(process.env.CHIP_DAILY_USD || 10);
const MAX_TURNS = 8;
const MAX_CHARS = 12000;

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

let spend = { day: "", usd: 0 };
const today = () => new Date().toISOString().slice(0, 10);
const addSpend = (u: { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined, model = MODEL) => {
  if (spend.day !== today()) spend = { day: today(), usd: 0 };
  const inTok = u?.input_tokens ?? u?.prompt_tokens ?? 0;
  const outTok = u?.output_tokens ?? u?.completion_tokens ?? 0;
  const sonnet = /sonnet/i.test(model);
  const deepseek = /deepseek/i.test(model);
  const inRate = sonnet ? 2 : deepseek ? 0.3 : 1;
  const outRate = sonnet ? 10 : deepseek ? 1.2 : 5;
  spend.usd += (inTok * inRate + outTok * outRate) / 1e6;
};

/** One text read: Anthropic primary, automatic fallback to OpenRouter DeepSeek V4 Flash. */
async function ask(system: string, user: string): Promise<string | null> {
  if (!KEY && !OPENROUTER_KEY) return null;
  if (spend.day === today() && spend.usd >= DAILY_USD) return null;

  if (KEY && !PREFER_OPENROUTER) {
    for (let t = 0; t < 2; t++) {
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          // No temperature: the API refuses it for this model (26 Nov 2026), and a refused call is a lost check.
          body: JSON.stringify({ model: MODEL, max_tokens: 6000, thinking: { type: "disabled" }, system, messages: [{ role: "user", content: user }] }),
          signal: AbortSignal.timeout(25_000),
        });
        if (r.status === 429 || r.status >= 500) throw new Error(String(r.status));
        const j = (await r.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } };
        addSpend(j.usage, MODEL);
        if (!r.ok) {
          log("ask refused", r.status, j?.error?.message ?? "");
          break; // Immediately fall back to OpenRouter DeepSeek on 4xx (e.g. billing/auth).
        }
        const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
        if (text) return text;
        break;
      } catch (e) {
        if (t === 1) { log("ask failed", String(e)); break; }
        await new Promise((s) => setTimeout(s, 1500));
      }
    }
  }

  if (OPENROUTER_KEY) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${OPENROUTER_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          max_tokens: 6000,
          temperature: 0,
          reasoning: { enabled: false },
          provider: { zdr: true, data_collection: "deny" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(25_000),
      });
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } };
      addSpend(j.usage, DEEPSEEK_MODEL);
      if (!r.ok) {
        log("ask openrouter refused", r.status, j?.error?.message ?? "");
        return null;
      }
      return j.choices?.[0]?.message?.content ?? null;
    } catch (e) {
      log("ask openrouter failed", String(e));
    }
  }

  return null;
}

/** Translates Anthropic-style tool-use messages to OpenRouter/OpenAI chat-completions format for DeepSeek fallback. */
async function callAgentOpenRouter(
  system: string,
  messages: { role: string; content: unknown }[],
  tools: unknown[],
): Promise<AgentModelResponse | null> {
  if (!OPENROUTER_KEY) return null;
  const oaMessages: Record<string, unknown>[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      oaMessages.push({ role: m.role, content: m.content });
      continue;
    }
    const blocks = Array.isArray(m.content) ? (m.content as Record<string, unknown>[]) : [];
    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("\n");
      const toolCalls = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: String(b.id), type: "function", function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) } }));
      oaMessages.push({ role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
    } else {
      const results = blocks.filter((b) => b.type === "tool_result");
      const texts = blocks.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("\n");
      for (const r of results) {
        oaMessages.push({ role: "tool", tool_call_id: String(r.tool_use_id), content: String(r.content ?? "") });
      }
      if (texts) oaMessages.push({ role: "user", content: texts });
    }
  }
  const oaTools = (tools as { name: string; description: string; input_schema: unknown }[]).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${OPENROUTER_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: 4096,
        temperature: 0,
        reasoning: { enabled: false },
        provider: { zdr: true, data_collection: "deny" },
        messages: oaMessages,
        tools: oaTools,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const j = (await r.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };
    addSpend(j.usage, DEEPSEEK_MODEL);
    if (!r.ok) {
      log("agent openrouter refused", r.status, j?.error?.message ?? "");
      return null;
    }
    const msg = j.choices?.[0]?.message;
    if (!msg) return null;
    const content: AgentModelResponse["content"] = [];
    if (msg.content) content.push({ type: "text", text: msg.content });
    for (const tc of msg.tool_calls ?? []) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.function.arguments || "{}"); } catch { /* empty */ }
      content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
    }
    return { content };
  } catch (e) {
    log("agent openrouter failed", String(e));
    return null;
  }
}

/** One tool-calling turn for the Database chat agent: Anthropic primary, automatic fallback to OpenRouter DeepSeek. */
const callAgentModel: AgentModelCaller = async ({ system, messages, tools }) => {
  if (!KEY && !OPENROUTER_KEY) return null;
  if (spend.day === today() && spend.usd >= DAILY_USD) return null;
  if (KEY && !PREFER_OPENROUTER) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: AGENT_MODEL, max_tokens: 4096, system, messages, tools }),
        signal: AbortSignal.timeout(25_000),
      });
      const j = (await r.json()) as AgentModelResponse & { error?: { message?: string } };
      addSpend(j.usage, AGENT_MODEL);
      if (r.ok) return j;
      log("agent refused", r.status, j?.error?.message ?? "");
    } catch (e) {
      log("agent failed", String(e));
    }
  }
  return callAgentOpenRouter(system, messages, tools);
};

type Search = ReturnType<typeof createSearch>;
type Agent = ReturnType<typeof createAgent>;
let search: Search | null = null;
let agent: Agent | null = null;
let cards = 0;
let loadedAt = "";
let loading: Promise<void> | null = null;
// Ranked lists waiting for their AI check (/check), by the search words.
const ranked = new Map<string, any>();
// Cached agent answers (15 min) so repeating the exact same prompt returns consistent results.
const agentCache = new Map<string, { at: number; r: AgentResult }>();
const AGENT_CACHE_MS = 15 * 60_000;

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
  agent = createAgent(list, search, callAgentModel);
  agentCache.clear();
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
    hits: r.hits.slice(0, max).map((h: any) => ({ id: h.card.id, score: h.score, why: h.why, ai: h.ai ?? null, aiWhy: h.aiWhy ?? "", gender: h.card.gender ?? null })),
    job: r.job,
    not: r.not,
    industry: r.industry,
    level: r.level,
    mustQuals: r.mustQuals ?? [],
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
    if (req.method !== "POST" || (req.url !== "/search" && req.url !== "/check" && req.url !== "/agent")) return send(res, 404, { ok: false, message: "Not found." });
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > MAX_CHARS * 8) return send(res, 413, { ok: false, message: "That search is too long." }); }
    const body = JSON.parse(raw || "{}");
    const turns = (Array.isArray(body.turns) ? body.turns : []).map((t: unknown) => String(t ?? "").trim()).filter(Boolean).slice(-MAX_TURNS);
    if (!turns.length) return send(res, 400, { ok: false, message: "Say who you are looking for." });
    if (!search || !agent) return send(res, 503, { ok: false, message: "The cards are still loading." });
    const key = turns.join("\n");
    if (req.url === "/agent") {
      if (process.env.C141_CHIP_AGENT === "off") return send(res, 503, { ok: false, message: "Agent disabled." });
      const currentIds = Array.isArray(body.currentIds) ? body.currentIds.map(String).filter(Boolean).slice(0, 40) : [];
      const genders = body.genders && typeof body.genders === "object" ? body.genders : {};
      const wantGender = body.wantGender === "female" || body.wantGender === "male" ? body.wantGender : null;
      const limit = Number.isFinite(Number(body.limit)) && Number(body.limit) > 0 ? Math.min(60, Math.round(Number(body.limit))) : null;
      const cacheKey = JSON.stringify({ turns, currentIds, wantGender, limit, g: Object.keys(genders).length });
      const cached = agentCache.get(cacheKey);
      if (cached && Date.now() - cached.at < AGENT_CACHE_MS) return send(res, 200, cached.r);
      const r = await agent({ turns, currentIds, genders, wantGender, limit });
      if (!r) return send(res, 502, { ok: false, message: "Agent could not answer." });
      if (agentCache.size > 100) agentCache.clear();
      agentCache.set(cacheKey, { at: Date.now(), r });
      return send(res, 200, r);
    }
    if (req.url === "/check") {
      // The AI check over the people the caller kept (26 Nov 2026: men removed by name for
      // "female only" before the check, so the check is spent on the right people).
      const held = ranked.get(key);
      if (!held) return send(res, 409, { ok: false, message: "Search first." });
      const byId = new Map(held.all.map((h: any) => [h.card.id, h]));
      const list = (Array.isArray(body.ids) ? body.ids : []).map((id: unknown) => byId.get(String(id))).filter(Boolean);
      const genders = body.genders && typeof body.genders === "object" ? body.genders : {};
      const c = await search.checkAll(key, list, genders);
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
