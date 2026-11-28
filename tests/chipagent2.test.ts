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
import { scrub, searchText } from "../services/chip-search/read";
import { fork } from "node:child_process";
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
{
  // The live fault (28 Nov): "Manish Mittal where is his location" answered "not found" with his CV open beside the chat.
  let card: any;
  const m = scripted([
    () => ({ content: [tool("read_people", { ids: ["batti-f"] })] }),
    (msgs) => { card = lastResult(msgs); return { content: [tool("finish", { reply: "She is in Batticaloa.", searched: "Nimali Perera", candidates: [{ id: "batti-f", fit: 90, reason: "the person asked about" }] })] }; },
  ]);
  const r = await createQueryAgent(cards, direct, "", m.call)({ turns: ["accountants", "Nimali Perera where is her location"], currentIds: ["batti-f", "kandy-f"], names: { "batti-f": "Nimali Perera" } });
  const first = String(m.seen[0].messages[0].content);
  ok("a name on screen is shown to the model beside that person", /#1 \[batti-f\] Nimali Perera - Accountant/.test(first) && /#2 \[kandy-f\] Accountant/.test(first), first.slice(-300));
  ok("so a question about a named person is answered from their card", card.people?.[0]?.place === "Batticaloa" && r?.candidates[0]?.id === "batti-f");
  ok("the model is told where names are", /people\.name/.test(m.seen[0].system));
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

console.log("the chat: what it searched, and the search before");
{
  const m = scripted([
    () => ({ content: [tool("query", { sql: "select count(*) from people where province='Eastern'", why: "People in the Eastern Province" }), tool("query", { sql: EASTERN_F, why: "Women among them" })] }),
    () => ({ content: [tool("finish", { reply: "Two.", searched: "Eastern · female: 2", final_sql: EASTERN_F, candidates: [{ id: "batti-f", fit: 90, reason: "r" }] })] }),
  ]);
  const r = await createQueryAgent(cards, direct, "", m.call)({ turns: ["eastern", "only female"] });
  ok("each query is kept in the agent's plain words with what it found", JSON.stringify(r?.trail) === JSON.stringify(["People in the Eastern Province: 3", "Women among them: 2"]), JSON.stringify(r?.trail));
  ok("the answer says it came from the query agent, and hands back its search", r?.agent === 2 && r.last?.sql === EASTERN_F && r.last.searched === "Eastern · female: 2");

  const next = scripted([() => ({ content: [tool("finish", { reply: "One with an email.", searched: "Eastern · female · with email: 1", final_sql: EASTERN_F + " and has_email=1", candidates: [{ id: "batti-f", fit: 90, reason: "r" }, { id: "ampara-f", fit: 80, reason: "no email" }] })] })]);
  const r2 = await createQueryAgent(cards, direct, "", next.call)({ turns: ["eastern", "only female", "with email"], last: r!.last });
  const first = String(next.seen[0].messages[0].content);
  ok("the next message is given the search before it", first.includes("YOUR LAST SEARCH IN THIS CHAT") && first.includes(EASTERN_F));
  ok("and the follow-up narrows it: the one without an email is gone", r2?.candidates.map((c) => c.id).join() === "batti-f" && r2.total === 1);
}
{
  const m = scripted([() => ({ content: [{ type: "text", text: "Three of them." }] })]);
  const keep = { searched: "Eastern", sql: "select id from people where province='Eastern'" };
  const r = await createQueryAgent(cards, direct, "", m.call)({ turns: ["eastern", "how many is that"], last: keep });
  ok("a question in between does not lose the search", r?.last?.sql === keep.sql);
}

console.log("names: anyone can be asked for by name");
{
  const ndb = buildTable(cards, ":memory:", [{ id: "kandy-f", n: "Manisha de Silva" }, { id: "india-f", n: "Manish Mittal" }, { id: "nobody", n: "Not In The Table" }], { cvText: false });
  const nq: Query = async (sql, maxRows) => runQuery(ndb, sql, maxRows);
  const hit = runQuery(ndb, "select id from people where name like '%mittal%' and name like '%manish%'");
  ok("a person is found by name, each word on its own", hit.ok && JSON.stringify(hit.rows) === JSON.stringify([["india-f"]]), JSON.stringify(hit));
  ok("someone with no name on record stays a null, and is still there", (runQuery(ndb, "select count(*) from people where name is null") as any).rows[0][0] === 3);
  ok("names go in even when the CV text cannot", !runQuery(ndb, "select count(*) from cv_text").ok);
  ok("the agent is told how names are spelled", /Names are spelled many ways/.test(describeTable(ndb)));
  let got: any;
  const m = scripted([
    () => ({ content: [tool("query", { sql: "select id from people where name like '%mittal%'", why: "People called Mittal" })] }),
    () => ({ content: [tool("read_people", { ids: ["india-f"] })] }),
    (msgs) => { got = lastResult(msgs); return { content: [tool("finish", { reply: "Manish Mittal is in Chennai, India.", searched: "Name: Manish Mittal: 1", final_sql: "select id from people where name like '%mittal%'", candidates: [{ id: "india-f", fit: 95, reason: "the person asked about" }] })] }; },
  ]);
  const r = await createQueryAgent(cards, nq, "", m.call)({ turns: ["Manish Mittal where is his location"] });
  ok("the owner's question: found by name with nobody on screen, and the card carries the name", got.people?.[0]?.name === "Manish Mittal" && got.people[0].place === "Chennai" && r?.candidates[0]?.id === "india-f" && r.total === 1, JSON.stringify(got).slice(0, 200));
}

console.log("CV text: what no column holds");
{
  ok("emails, phones and NIC numbers are taken out; dates stay", scrub("Call +94 (77) 123-4567 or a.b@x.lk, NIC 199012345678, worked 2015-06 - 2020-03, 12 years") === "Call [number] or [email], NIC [number], worked 2015-06 - 2020-03, 12 years", scrub("Call +94 (77) 123-4567 or a.b@x.lk, NIC 199012345678, worked 2015-06 - 2020-03, 12 years"));
  const st = searchText({ currentJobTitle: "Accountant", languages: ["Tamil", "English"] }, [], "Led a team of 20. Phone 0771234567");
  ok("the record and the CV's own text become one searchable text, scrubbed", /Languages: Tamil, English/.test(st) && /team of 20/.test(st) && !/0771234567/.test(st), st);

  const cvdb = buildTable(cards, ":memory:", [
    { id: "batti-f", t: "Accountant. Languages: Tamil, English. Led a team of 20 at a hospital." },
    { id: "kandy-f", t: "Accountant. Languages: Sinhala, English." },
    { id: "nobody", t: "Tamil speaker who is not in the table." },
  ]);
  const cvq: Query = async (sql, maxRows) => runQuery(cvdb, sql, maxRows);
  const speak = runQuery(cvdb, "select person_id from cv_text where cv_text match 'tamil'");
  ok("a word in the CV finds the person, and only people in the table", speak.ok && JSON.stringify(speak.rows) === JSON.stringify([["batti-f"]]), JSON.stringify(speak));
  const phrase = runQuery(cvdb, `select p.id from cv_text c join people p on p.id = c.person_id where cv_text match '"team of 20"' and p.province = 'Eastern'`);
  ok("an exact phrase, joined to the columns", phrase.ok && phrase.rows.length === 1 && phrase.rows[0][0] === "batti-f", JSON.stringify(phrase));
  ok("the agent is told the CV text exists and how to search it", /cv_text/.test(describeTable(cvdb)) && /2 people have CV text/.test(describeTable(cvdb)));
  ok("with no CV text the agent is not told of a table that is not there", !/cv_text/.test(describeTable(db)));

  let read: any;
  const m = scripted([
    () => ({ content: [tool("read_people", { ids: ["batti-f", "ampara-f"], with_cv: true })] }),
    (msgs) => { read = lastResult(msgs); return { content: [{ type: "text", text: "Done." }] }; },
  ]);
  await createQueryAgent(cards, cvq, "", m.call)({ turns: ["who speaks tamil"] });
  ok("the agent can read a CV; a person with none says so", /team of 20/.test(read.people[0].cv) && read.people[1].cv === "no CV text on file", JSON.stringify(read).slice(0, 300));
}

console.log("the table built in its own process, from the files");
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chip-build-test-"));
  const cardsFile = path.join(dir, "cards.jsonl"), cvFile = path.join(dir, "cvtext.jsonl"), out = path.join(dir, "t.db");
  fs.writeFileSync(cardsFile, cards.map((c) => JSON.stringify(c)).join("\n") + "\nnot json\n");
  fs.writeFileSync(cvFile, JSON.stringify({ id: "batti-f", t: "Speaks Tamil." }) + "\n");
  const run = (cv: string) => new Promise<any>((done, fail) => {
    const c = fork("services/chip-search/table-build.ts", [cardsFile, cv, out], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
    c.once("message", done); c.once("error", fail); c.once("exit", (code) => code && fail(new Error(`exit ${code}`)));
  });
  fs.appendFileSync(cvFile, JSON.stringify({ id: "kandy-f", n: "Manisha de Silva" }) + "\n");
  const a = await run(cvFile);
  ok("the name with no CV text is in too", a.names === 1);
  ok("everyone and the CV text are in the file; a broken line is skipped", a.rows === 5 && a.cvRows === 1 && /cv_text/.test(a.tables), JSON.stringify({ ...a, tables: "" }));
  const q = createQuerier(out);
  const hit = await q.query("select person_id from cv_text where cv_text match 'tamil'");
  ok("and the query process reads it", hit.ok && hit.rows[0]?.[0] === "batti-f", JSON.stringify(hit));
  q.close();
  const b = await run("-");
  ok("with no CV text file the table is still built", b.rows === 5 && b.cvRows === 0 && /no CV text file/.test(b.note));
  await new Promise((r) => fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }, r));
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
