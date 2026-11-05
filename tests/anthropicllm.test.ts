// Claude Haiku 5.5 as the main text model: provider choice, request shape, the
// spend cap, and the grounded Research helpers. No network; fetch is replaced.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

delete process.env.OPENROUTER_API_KEY;
delete process.env.C141_LLM_PROVIDER;
delete process.env.C141_CLAUDE_SUB_TASKS;
process.env.ANTHROPIC_API_KEY = "test-anthropic-key-0123456789";
process.env.C141_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "anthropic-"));

const sent: { url: string; headers: Record<string, string>; body: any }[] = [];
let reply: () => Response = () => new Response("{}", { status: 500 });
globalThis.fetch = (async (url: string, init?: { headers?: Record<string, string>; body?: string }) => {
  sent.push({ url: String(url), headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : null });
  return reply();
}) as typeof fetch;
const ok = (text: string, usage = { input_tokens: 100, output_tokens: 20 }) => () =>
  new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn", usage }), { status: 200 });

const ai = await import("@/lib/ai");
const { spentSoFar } = await import("@/lib/spend");

// ── which provider ──
eq("key set -> Anthropic is the provider", ai.viaAnthropic(), true);
process.env.C141_LLM_PROVIDER = "openrouter";
eq("C141_LLM_PROVIDER=openrouter switches it off", ai.viaAnthropic(), false);
delete process.env.C141_LLM_PROVIDER;
eq("an override naming another vendor's model is ignored", (process.env.C141_MODEL_PARSE = "deepseek/x", ai.anthropicModelFor("parse")), "claude-haiku-5-5");
process.env.C141_MODEL_PARSE = "claude-sonnet-5-5";
eq("Haiku only: even a claude- override is ignored", ai.anthropicModelFor("parse"), "claude-haiku-5-5");
delete process.env.C141_MODEL_PARSE;

// ── the request ──
reply = ok("hello");
const r = await ai.write("You are terse.", "Say hi", 300, "parse");
eq("write answers", r.ok && r.text, "hello");
const req = sent.at(-1)!;
eq("goes to the Anthropic Messages API", req.url, "https://api.anthropic.com/v1/messages");
eq("model is Haiku 5.5", req.body.model, "claude-haiku-5-5");
eq("thinking is switched off", req.body.thinking, { type: "disabled" });
eq("no temperature is sent", "temperature" in req.body, false);
eq("system goes in the top-level field, marked cacheable", req.body.system, [{ type: "text", text: "You are terse.", cache_control: { type: "ephemeral" } }]);
eq("max_tokens is the caller's", req.body.max_tokens, 300);
eq("the key goes in x-api-key", req.headers["x-api-key"], process.env.ANTHROPIC_API_KEY);
eq("usage comes back", r.ok && r.usage, { inputTokens: 100, outputTokens: 20, thinkingTokens: 0 });
eq("the spend ledger counted the call (0.1/M in, 0.5/M out)", Math.abs(spentSoFar() - (100 * 0.1 + 20 * 0.5) / 1e6) < 1e-9, true);

// gemini() (rank / plan / parse) takes the same route
reply = ok("[]");
const g = await ai.gemini("rank", "rank these");
eq("gemini() goes to Claude too", g.ok && sent.at(-1)!.body.model, "claude-haiku-5-5");

// ── failures ──
reply = () => new Response("{}", { status: 400 });
eq("a 400 is a bad_response", (await ai.write("s", "p", 100, "parse")).ok, false);
reply = () => new Response(JSON.stringify({ content: [], stop_reason: "end_turn", usage: {} }), { status: 200 });
const empty = await ai.write("s", "p", 100, "parse");
eq("an empty answer is reported as empty", !empty.ok && empty.reason === "bad_response" && empty.detail, "empty");

// ── the spend cap holds ──
fs.writeFileSync(path.join(process.env.C141_DATA_DIR!, "spend.json"), JSON.stringify({ spent: 4.9999, entries: [] }));
reply = ok("never");
const before = sent.length;
const capped = await ai.write("s", "x".repeat(300_000), 8000, "jd");
eq("a call that could pass the cap is not made", !capped.ok && capped.reason === "spend_cap", true);
eq("and no request left the building", sent.length, before);

// ── Research helpers ──
eq("queries are read from a fenced JSON array", ai.parseQueries('Sure:\n```json\n["acme ceo", "acme revenue 2025", 7, "x"]\n```', 5), ["acme ceo", "acme revenue 2025"]);
eq("queries are capped", ai.parseQueries('["aaa","bbb","ccc"]', 2), ["aaa", "bbb"]);
eq("no array, no queries", ai.parseQueries("I cannot", 5), []);
const hits = [{ url: "https://a.example" }, { url: "https://b.example" }, { url: "https://c.example" }];
eq("only cited results become sources, once each", ai.citedHits("Acme is big [2]. Also [2][1]. Made-up [9].", hits).map((h) => h.url), ["https://b.example", "https://a.example"]);
eq("an answer citing nothing has no sources", ai.citedHits("No markers here.", hits), []);

// ── the Convex adapter ──
const { getAnthropicClient } = await import("../convex/lib/llm");
reply = () => new Response(JSON.stringify({ content: [{ type: "text", text: '```json\n{"a":1}\n```' }], stop_reason: "max_tokens", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 90 } }), { status: 200 });
const res: any = await getAnthropicClient().chat.completions.create({
  model: "deepseek/deepseek-v4-flash",
  temperature: 0.1,
  max_tokens: 50,
  response_format: { type: "json_object" },
  reasoning: { enabled: false },
  messages: [{ role: "system", content: "Extract." }, { role: "user", content: "CV TEXT" }],
} as any);
const creq = sent.at(-1)!;
eq("adapter: a non-claude model name becomes Haiku 5.5", creq.body.model, "claude-haiku-5-5");
eq("adapter: thinking off, no temperature, no reasoning field", [creq.body.thinking, "temperature" in creq.body, "reasoning" in creq.body], [{ type: "disabled" }, false, false]);
eq("adapter: JSON mode adds the instruction to the system prompt", /only one valid JSON object/.test(creq.body.system[0].text) && creq.body.system[0].text.startsWith("Extract."), true);
eq("adapter: the system prompt carries the cache mark", creq.body.system[0].cache_control, { type: "ephemeral" });
eq("adapter: messages carry only user/assistant turns", creq.body.messages, [{ role: "user", content: "CV TEXT" }]);
eq("adapter: a code fence round the JSON is stripped", res.choices[0].message.content, '{"a":1}');
eq("adapter: max_tokens becomes finish_reason length", res.choices[0].finish_reason, "length");
eq("adapter: prompt tokens include cache reads", [res.usage.prompt_tokens, res.usage.completion_tokens], [100, 5]);
reply = () => new Response("overloaded", { status: 529 });
let status = 0;
try { await getAnthropicClient().chat.completions.create({ model: "x", messages: [{ role: "user", content: "hi" }] } as any); } catch (e: any) { status = e.status; }
eq("adapter: an API error throws with its status", status, 529);

// ── Haiku only: nothing else is asked ──
const { hasToken, haikuOnly } = await import("@/lib/claudeSub");
process.env.CLAUDE_CODE_OAUTH_TOKEN = "x".repeat(40);
eq("the subscription route steps aside", [haikuOnly(), hasToken()], [true, false]);
const { askBridge } = await import("@/lib/claudeBridge");
eq("the CLI bridge refuses", (await askBridge({ task: "match_read", system: "s", prompt: "p" } as any)).ok, false);
process.env.C141_APP_INTERNAL_URL = "http://app.invalid";
process.env.C141_CLAUDE_BRIDGE_SECRET = "s".repeat(20);
const { askClaudeFirst } = await import("../convex/lib/claudeFirst");
const n0 = sent.length;
eq("claude-first returns null without calling anything", [await askClaudeFirst("match_read", "s", "p", 1000), sent.length], [null, n0]);
const { callHaikuVisionOCR, executeLLMWithNvidiaFallback } = await import("../convex/lib/llm");
eq("the CLI vision bridge is not asked", [await callHaikuVisionOCR({ kind: "pdf", mime: "application/pdf", base64: "x" }), sent.length], ["", n0]);

process.env.OPENROUTER_API_KEY = "or-key-0123456789";
process.env.NVIDIA_API_KEY = "nv-key-0123456789";
process.env.OPENAI_API_KEY = "oa-key-0123456789";
const n1 = sent.length;
reply = () => new Response("down", { status: 500 });
let threw = false;
try { await executeLLMWithNvidiaFallback({} as any, "cv_structuring", { messages: [{ role: "user", content: "cv" }], response_format: { type: "json_object" } }); } catch { threw = true; }
const hosts = sent.slice(n1).map((x) => new URL(x.url).host);
eq("a Haiku failure is an error, never another model's answer", threw, true);
eq("only api.anthropic.com was called (no OpenRouter, NVIDIA or OpenAI)", [...new Set(hosts)], ["api.anthropic.com"]);
reply = ok("fine");
fs.writeFileSync(path.join(process.env.C141_DATA_DIR!, "spend.json"), JSON.stringify({ spent: 0, entries: [] })); // the cap test above filled it
const n2 = sent.length;
await ai.write("s", "p", 50, "jd"); await ai.gemini("rank", "p");
await executeLLMWithNvidiaFallback({} as any, "search_ranking", { messages: [{ role: "user", content: "x" }] });
eq("every task type runs on Haiku", sent.slice(n2).map((x) => x.body.model), ["claude-haiku-5-5", "claude-haiku-5-5", "claude-haiku-5-5"]);
process.env.C141_LLM_PROVIDER = "openrouter";
eq("the switch back restores the old route", [haikuOnly(), hasToken(), ai.viaAnthropic()], [false, true, false]);
delete process.env.C141_LLM_PROVIDER;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
