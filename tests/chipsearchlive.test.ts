/**
 * The chip search going live in the Database chat (26 Nov 2026):
 *  - the years reader (Run 7 fixes: a range wins over a single number, "max 8"
 *    and "above 20 years are too senior" read as ceilings, "max 2 yrs" alone);
 *  - the chat's client: off means off, a dead service means the old engine
 *    answers, the score and the read line.
 */
import { yearsAsked } from "../convex/lib/search/chipSearch";
import { chipReadLine, chipScore, chipSearch, genderAsked, genderByName, type ChipAnswer } from "../src/lib/chipSearchClient";

let pass = 0, fail = 0;
const ok = (l: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l} ${detail}`); }
};

console.log("the years reader");
const eq = (t: string, min: number, max: number | null) => {
  const got = yearsAsked(t);
  ok(t.slice(0, 70), !!got && got.min === min && got.max === max, JSON.stringify(got));
};
eq("MUST: 12-15 years in credit / lending. People above 20 years experience are too senior", 12, 15);
eq("experience min 6 years, max 8, AML / CFT", 6, 8);
eq("Restaurant Manager negombo resort, 5+ yrs (4-6 ok) hotel", 4, 6);
eq("Oracle DBA colombo 5+ yrs (client said not more than 8)", 5, 8);
eq("8 to 12 years of finance experience, 3+ years managing a team", 8, 12);
eq("over 5 years experience in sales", 5, null);
eq("accountant 3 yrs colombo", 3, null);
eq("call center agnet colmbo bpo, freshers ok or max 2 yrs expirence", 0, 2);
ok("no years asked", yearsAsked("senior accountant colombo CIMA") === null);
ok("an age is not years", yearsAsked("female, age 25-30, receptionist") === null, JSON.stringify(yearsAsked("female, age 25-30, receptionist")));

console.log("the chat's client");
process.env.C141_CHIP_SEARCH = "off";
ok("switched off answers nothing", (await chipSearch(["accountant"])) === null);
delete process.env.C141_CHIP_SEARCH;
process.env.C141_CHIP_SEARCH_URL = "http://127.0.0.1:9/search";
ok("a dead service answers nothing (the old engine runs)", (await chipSearch(["accountant colombo"])) === null);
ok("score fits 1-99", chipScore(0) === 1 && chipScore(400) === 99 && chipScore(9999) === 99 && chipScore(200) === 50);
const a: ChipAnswer = { ok: true, total: 3, removed: 0, hits: [], job: ["Senior Accountant", "Accountant"], not: [], industry: ["bank"], level: 2, years: [5, 8] };
ok("read line", chipReadLine(a) === "Senior Accountant, Accountant · 5-8 years · bank", chipReadLine(a));

console.log("gender asked");
ok("female candidates only", genderAsked("Head of Finance. Female candidates only.") === "female");
ok("ladies", genderAsked("receptionist kandy ladies preferred") === "female");
ok("male only", genderAsked("driver colombo male only") === "male");
ok("female not read as male", genderAsked("female accountant") === "female");
ok("no gender", genderAsked("senior accountant colombo") === null);
ok("both named = no filter", genderAsked("male or female") === null);
delete process.env.ANTHROPIC_API_KEY;
ok("no key: no name reading, nobody dropped", (await genderByName(["Nimali Perera"])) === null);

// 26 Nov 2026: the AI check's order is the mark first, then the score - never the check round;
// and the check is told the gender the route found.
{
  const { createSearch } = await import("../convex/lib/search/chipSearch");
  const seen: string[] = [];
  const fake = async (system: string, user: string) => {
    if (/checking a shortlist/.test(system)) { seen.push(user); return JSON.stringify({ r: [[1, 1, "maybe"], [2, 2, "call"], [3, 1, "maybe"]] }); }
    return null;
  };
  const search = createSearch([], fake);
  const hit = (id: string, score: number) => ({ card: { id, title: "Head of Finance", jobs: [], quals: [] }, score, why: [] });
  const r = await search.checkAll("head of finance, female", [hit("a", 100), hit("b", 50), hit("c", 300)], { a: "f" });
  console.log("the AI check order");
  ok("the mark first, then the score", r.final.map((h: any) => h.card.id).join(",") === "b,c,a", r.final.map((h: any) => h.card.id).join(","));
  ok("the check is told the gender", /\| female \|/.test(seen[0]) && /gender not on file/.test(seen[0]), seen[0]?.slice(0, 200));
  ok("nobody removed, nothing lost", r.removed.length === 0 && r.final.length === 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

