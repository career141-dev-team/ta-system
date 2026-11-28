/**
 * The query agent (services/chip-search/agent2.ts, 28 Nov 2026) with a
 * stand-in model, so what is tested is our side of it: the queries really run,
 * errors go back to the model as text, its thinking goes back untouched, and
 * nobody reaches the screen who is outside the final query - whatever the
 * model says. Plus the worker that stops a query after its time limit.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createQueryAgent } from "../services/chip-search/agent2";
import { buildTable, runQuery, describeTable } from "../services/chip-search/table";
import { createQuerier, type Query } from "../services/chip-search/query";
import type { AgentModelCaller, AgentModelResponse, AgentMessage } from "../services/chip-search/agent";
import { resolvePlace } from "../convex/lib/search/lists/places";

let pass = 0, fail = 0;
const ok = (l: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l} ${detail}`); }
};

const person = (id: string, town: string | null, extra: Record<string, unknown> = {}) => ({
  id, searchable: true, title: "Accountant", roles: ["accountant"], level: 1, years: 4, place: town ? resolvePlace(town) : null,
  gender: null, jobs: [{ title: "Accountant", company: "Co", companyTypes: [], end: "present" }], quals: [], skills: [], languages: [], cvDate: "2026-10-01", text: "accountant", ...extra,
});
const cards = [
  person("batti-f", "Batticaloa", { gender: "female", hasEmail: true }),
  person("katt-m", "Kattankudy", { gender: "male", hasEmail: true }),
  person("ampara-f", "Ampara", { gender: "female", hasEmail: false }),
  person("kandy-f", "Kandy", { gender: "female", hasEmail: true }),
  person("india-f", "Chennai", { gender: "female", hasEmail: true }),
];
const db = buildTable(cards);
const direct: Query = async (sql, maxRows) => runQuery(db, sql, maxRows);

/** A model that plays a script: each entry sees the request and answers the next turn. */
type Step = (messages: AgentMessage[]) => AgentModelResponse | null;
const tool = (name: string, input: Record<string, unknown>, id = `t${Math.random()}`) => ({ type: "tool_use" as const, id, name, input });
function scripted(steps: Step[]) {
  const seen: { system: string; messages: AgentMessage[] }[] = [];
  let i = 0;
  const call: AgentModelCaller = async ({ system, messages }) => {
    seen.push({ system, messages: JSON.parse(JSON.stringify(messages)) });
    return steps[i++]?.(messages) ?? null;
  };
  return { call, seen };
}
const lastResult = (messages: AgentMessage[]) => {
  const m = messages[messages.length - 1];
  const b = Array.isArray(m.content) ? m.content.find((x) => x.type === "tool_result") : null;
  return JSON.parse(String((b as { content?: string } | null | undefined)?.content ?? "{}"));
};
const EASTERN_F = "select id from people where province='Eastern' and country_code='LK' and gender='female'";

console.log("a search: query, read, answer");
{
  const thinking = { type: "thinking", thinking: "", signature: "sig-1" };
  let afterQuery: any, afterRead: any;
  const m = scripted([
    () => ({ content: [thinking, tool("query", { sql: EASTERN_F })] }),
    (msgs) => { afterQuery = lastResult(msgs); return { content: [tool("read_people", { ids: ["batti-f", "ampara-f"] })] }; },
    (msgs) => { afterRead = lastResult(msgs); return { content: [tool("finish", { reply: "Two women in the Eastern Province.", searched: "Eastern Province · female: 2", final_sql: EASTERN_F, candidates: [{ id: "ampara-f", fit: 80, reason: "Accountant in Ampara" }, { id: "batti-f", fit: 90, reason: "Accountant in Batticaloa" }] })] }; },
  ]);
  const r = await createQueryAgent(cards, direct, describeTable(db), m.call)({ turns: ["female accountants in eastern"] });
  ok("the query really ran and its rows went back to the model", JSON.stringify(afterQuery.rows) === JSON.stringify([["batti-f"], ["ampara-f"]]) || JSON.stringify(afterQuery.rows) === JSON.stringify([["ampara-f"], ["batti-f"]]), JSON.stringify(afterQuery));
  ok("the cards went back to the model", afterRead.people?.length === 2 && afterRead.people[0].gender === "female", JSON.stringify(afterRead).slice(0, 200));
  ok("the answer holds the two people, in the model's order", !!r && r.candidates.map((c) => c.id).join() === "ampara-f,batti-f" && r.total === 2 && r.steps === 3, JSON.stringify(r));
  ok("'what I searched' reaches the chat", r?.read === "Eastern Province · female: 2");
  ok("the model is told the real tables and values", /create table people/.test(m.seen[0].system) && /Eastern \(3\)/.test(m.seen[0].system));
  const back = m.seen[1].messages[1];
  ok("the model's thinking goes back to it untouched", back.role === "assistant" && Array.isArray(back.content) && JSON.stringify(back.content[0]) === JSON.stringify(thinking));
}

console.log("nobody outside the final query is shown, whatever the model says");
{
  const m = scripted([
    () => ({ content: [tool("query", { sql: "select id from people" })] }),
    () => ({ content: [tool("finish", { reply: "Here they are.", searched: "Eastern · female", final_sql: EASTERN_F, candidates: [
      { id: "india-f", fit: 99, reason: "wrong country" }, { id: "kandy-f", fit: 95, reason: "wrong province" }, { id: "katt-m", fit: 90, reason: "wrong gender" },
      { id: "made-up", fit: 90, reason: "does not exist" }, { id: "batti-f", fit: 80, reason: "right" }, { id: "batti-f", fit: 80, reason: "twice" },
    ] })] }),
  ]);
  const r = await createQueryAgent(cards, direct, "", m.call)({ turns: ["only eastern, female"] });
  ok("India, Kandy, the man, the invented id and the repeat are all dropped", r?.candidates.map((c) => c.id).join() === "batti-f", JSON.stringify(r?.candidates));
  ok("the count is the final query's, not the model's", r?.total === 2);
}
{
  const m = scripted([() => ({ content: [tool("finish", { reply: "Try these.", searched: "x", candidates: [{ id: "kandy-f", fit: 90, reason: "never queried" }] })] })]);
  const r = await createQueryAgent(cards, direct, "", m.call)({ turns: ["anyone"] });
  ok("with no final query, someone no query returned is not shown", r?.candidates.length === 0);
}
{
  const m = scripted([() => ({ content: [tool("finish", { reply: "Kandy first.", searched: "on screen", candidates: [{ id: "kandy-f", fit: 90, reason: "on screen", confirmed: false }, { id: "batti-f", fit: 60, reason: "on screen" }] })] })]);
  const r = await createQueryAgent(cards, direct, "", m.call)({ turns: ["compare them"], currentIds: ["kandy-f", "batti-f"] });
  ok("people on screen can be answered about; confirmed ones come first", r?.candidates.map((c) => `${c.id}:${c.tier}`).join() === "batti-f:confirmed,kandy-f:unconfirmed", JSON.stringify(r?.candidates));
  ok("the model is shown who is on screen", /ON SCREEN NOW \(2\)/.test(String(m.seen[0].messages[0].content)));
}

console.log("honest when it goes wrong");
{
  let err: any;
  const m = scripted([
    () => ({ content: [tool("query", { sql: "select nope from people" })] }),
    (msgs) => { err = lastResult(msgs); return { content: [tool("finish", { reply: "Nobody in Jaffna. Nearest: none in the Northern Province either.", searched: "Jaffna: 0", final_sql: "select id from people where district='Jaffna'", candidates: [{ id: "batti-f", fit: 50, reason: "padding" }] })] }; },
  ]);
  const r = await createQueryAgent(cards, direct, "", m.call)({ turns: ["accountants in jaffna"] });
  ok("a wrong query goes back as its error, for the model to fix", /nope/.test(err.error ?? ""), JSON.stringify(err));
  ok("zero means zero: the padding is dropped and the reply kept", r?.candidates.length === 0 && r.total === 0 && /Nobody in Jaffna/.test(r.reply), JSON.stringify(r));
}
{
  let wrote: any;
  const m = scripted([
    () => ({ content: [tool("query", { sql: "delete from people" })] }),
    (msgs) => { wrote = lastResult(msgs); return { content: [{ type: "text", text: "There are 5 people in the database." }] }; },
  ]);
  const r = await createQueryAgent(cards, direct, "", m.call)({ turns: ["how many people do we have"] });
  ok("a write is refused", !!wrote.error && runQuery(db, "select count(*) from people").ok);
  ok("a plain answer with no list is passed on", r?.reply === "There are 5 people in the database." && r.candidates.length === 0);
}
ok("no answer from the model is no answer (the caller falls back)", (await createQueryAgent(cards, direct, "", scripted([() => null]).call)({ turns: ["x"] })) === null);
{
  let hurried = false;
  const loop: Step = (msgs) => {
    const last = msgs[msgs.length - 1];
    if (Array.isArray(last.content) && last.content.some((b) => b.type === "text" && /finish now/.test(String((b as { text?: string }).text)))) hurried = true;
    return { content: [tool("query", { sql: "select count(*) from people" })] };
  };
  const r = await createQueryAgent(cards, direct, "", scripted(Array(20).fill(loop)).call)({ turns: ["x"] });
  ok("a model that never finishes is told to, then given up on", hurried && r === null);
}

console.log("the worker: read only, and stopped when too slow");
{
  const file = path.join(os.tmpdir(), `chip-agent2-test-${process.pid}.db`);
  fs.rmSync(file, { force: true });
  buildTable(cards, file).close();
  const q = createQuerier(file, 600);
  const n = await q.query("select count(*) from people");
  ok("answers a query from the file", n.ok && n.rows[0][0] === 5, JSON.stringify(n));
  const w = await q.query("delete from people");
  ok("refuses a write", !w.ok);
  const t0 = Date.now();
  const slow = await q.query("with recursive c(x) as (select 1 union all select x+1 from c) select count(*) from c");
  ok("a query that never ends is stopped at the limit", !slow.ok && /stopped/.test(slow.error) && Date.now() - t0 < 3000, JSON.stringify(slow));
  const again = await q.query("select count(*) from people where province='Eastern'");
  ok("and the next query still works", again.ok && again.rows[0][0] === 3, JSON.stringify(again));
  q.close();
  // The killed process lets go of the file a moment later (Windows refuses the delete until then).
  await new Promise((r) => fs.rm(file, { force: true, maxRetries: 10, retryDelay: 100 }, r));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
