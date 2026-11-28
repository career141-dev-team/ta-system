/**
 * The cards as a table the agent can query (services/chip-search/table.ts,
 * 28 Nov 2026). The owner's own examples are the checks: "Eastern" is the
 * Eastern Province of Sri Lanka and nobody from outside it, Batticaloa is
 * inside Eastern, "female with an email" is two plain conditions, and a count
 * per district is one query. Nothing may be written through it.
 */
import { buildTable, runQuery, describeTable, placeColumns } from "../services/chip-search/table";
import { resolvePlace } from "../convex/lib/search/lists/places";

let pass = 0, fail = 0;
const ok = (l: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l} ${detail}`); }
};

const place = (name: string) => resolvePlace(name);
const person = (id: string, town: string | null, extra: Record<string, unknown> = {}) => ({
  id, searchable: true, title: "Accountant", roles: ["accountant"], family: "Finance & Accounting", level: 1, years: 4,
  place: town ? place(town) : null, gender: null, jobs: [], quals: [], skills: [], languages: [], cvDate: "2026-10-01", text: "accountant", ...extra,
});
const cards = [
  person("batti-f", "Batticaloa", { gender: "female", hasEmail: true, hasPhone: true, quals: [{ id: "acca", status: "member" }] }),
  person("katt-m", "Kattankudy", { gender: "male", hasEmail: false, hasPhone: true }),
  person("ampara", "Ampara", { gender: "female", hasEmail: true }),
  person("kandy", "Kandy", { gender: "female", hasEmail: true }),
  person("colombo", "Colombo", {
    gender: "male", level: 6, title: "Head of Finance",
    jobs: [
      { title: "Head of Finance", company: "Lanka Hospitals", companyTypes: ["hospital"], country: "LK", level: 6, start: "2021", end: "present" },
      { title: "Finance Manager", company: "Cinnamon Hotels", companyTypes: ["hotel"], country: "LK", level: 4, start: "2015", end: "2021" },
    ],
  }),
  person("india", "Chennai", { gender: "female", hasEmail: true }),
  person("nowhere", null),
  person("merged", "Batticaloa", { searchable: false }),
];
for (const t of ["Batticaloa", "Kattankudy", "Ampara", "Kandy", "Colombo", "Chennai"]) ok(`the place list knows ${t}`, !!place(t));

const db = buildTable(cards);
const ids = (sql: string) => { const a = runQuery(db, sql); return a.ok ? a.rows.map((r) => String(r[0])).sort().join(",") : `ERROR ${a.error}`; };

console.log("places");
const k = placeColumns(place("Kattankudy"));
ok("Kattankudy is in Batticaloa district, Eastern province, Sri Lanka", k.town === "Kattankudy" && k.district === "Batticaloa" && k.province === "Eastern" && k.country_code === "LK", JSON.stringify(k));
ok("Eastern = the three people in Eastern, nobody from India, Kandy or Colombo", ids("select id from people where province='Eastern' and country_code='LK'") === "ampara,batti-f,katt-m");
ok("Batticaloa district = the town and Kattankudy", ids("select id from people where district='Batticaloa'") === "batti-f,katt-m");
ok("Kandy only", ids("select id from people where district='Kandy'") === "kandy");
ok("no town on file is a null, not a place", ids("select id from people where province is null and country is null") === "nowhere");
ok("a merged duplicate is not in the table", ids("select id from people where id='merged'") === "");

console.log("any combination, written by whoever asks");
ok("female in Eastern with an email", ids("select id from people where province='Eastern' and gender='female' and has_email=1") === "ampara,batti-f");
ok("male only", ids("select id from people where gender='male'") === "colombo,katt-m");
ok("gender not on file is its own answer", ids("select id from people where gender is null") === "nowhere");
ok("email not known yet stays unknown (null), never 'no'", ids("select id from people where has_email is null") === "colombo,nowhere");
ok("worked at both a hospital and a hotel", ids("select person_id from job_company_types group by person_id having sum(type='hospital')>0 and sum(type='hotel')>0") === "colombo");
ok("holds ACCA", ids("select person_id from qualifications where qual='acca'") === "batti-f");
const per = runQuery(db, "select district, count(*) from people where province='Eastern' group by 1 order by 1");
ok("how many per district", per.ok && JSON.stringify(per.rows) === JSON.stringify([["Ampara", 1], ["Batticaloa", 2]]), JSON.stringify(per));
ok("level name reads as words", ids("select level_name from people where id='colombo'").startsWith("Head"));

console.log("read only");
for (const bad of ["delete from people", "update people set gender='male'", "drop table people", "select 1; delete from people", "pragma query_only=off"]) {
  const a = runQuery(db, bad);
  ok(`refused: ${bad}`, !a.ok);
}
let wrote = false;
try { db.exec("delete from people"); wrote = true; } catch { /* the connection itself refuses */ }
ok("the connection refuses a write even past runQuery", !wrote);
ok("still everyone there", ids("select count(*) from people") === "7");
const wrong = runQuery(db, "select nope from people");
ok("a wrong query answers its error as text", !wrong.ok && /nope/.test(wrong.error));
const capped = runQuery(db, "select id from people", 3);
ok("rows are capped and say there are more", capped.ok && capped.rows.length === 3 && capped.more);

console.log("what the agent is told");
const d = describeTable(db);
ok("names the tables and the real values", /create table people/.test(d) && /Eastern \(3\)/.test(d) && /Batticaloa \(2\)/.test(d) && /not on file \(1\)/.test(d), d.slice(-600));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
