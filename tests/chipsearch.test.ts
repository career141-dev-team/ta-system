/**
 * The chip search core (convex/lib/search), moved from the search lab
 * (branch claude/cool-pasteur-0n60za, 17 Nov 2026):
 *  - the rule reader on the lab's phrasings: what TAs type into chips, with
 *    nothing read backwards ("not in Kandy" must never mean Kandy);
 *  - the profile builder's code checks (years from job dates, an unreadable
 *    date, values off the lists dropped);
 *  - the engine: every must applied to everyone, unknowns counted.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readConversation } from "../convex/lib/search/ruleReader";
import { finishProfile, yearsFromJobs, decodeNic, jsonOf } from "../convex/lib/search/profile";
import { Engine } from "../convex/lib/search/engine";
import { PHRASINGS, type Phrasing } from "./chipsearch/phrasings";
import { parseDsl } from "./chipsearch/dsl";
import { compare } from "./chipsearch/compare";

let pass = 0, fail = 0;
const ok = (l: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l} ${detail}`); }
};

console.log("the rule reader on the phrasings");
const here = path.dirname(fileURLToPath(import.meta.url));
const holdout = JSON.parse(fs.readFileSync(path.join(here, "chipsearch/holdout.json"), "utf8")).phrasings as Phrasing[];
for (const [name, list, floor] of [["tuning", PHRASINGS, 0.97], ["held out", holdout, 0.7]] as const) {
  let right = 0, reversed = 0;
  const wrong: string[] = [];
  for (const p of list) {
    const v = compare(parseDsl(p.expect), readConversation(p.text.split(" >> ")).chips);
    if (v.correct) right++; else if (wrong.length < 5) wrong.push(p.text);
    if (v.reversed) reversed++;
  }
  ok(`${name}: ${right}/${list.length} fully right (at least ${floor * 100}%)`, right / list.length >= floor, JSON.stringify(wrong));
  ok(`${name}: nothing read backwards`, reversed === 0, `${reversed} reversed`);
}
const neg = readConversation(["accountant not in Kandy"]).chips.find((c) => c.field === "place");
ok("'not in Kandy' is an exclusion", !!neg?.not);
const age = readConversation(["accountant 25-35 years old"]).chips;
ok("'25-35 years old' is age, not experience", age.some((c) => c.field === "age") && !age.some((c) => c.field === "years"));

console.log("\nthe profile builder's checks");
const today = new Date("2026-11-25T00:00:00Z");
ok("years from job dates, overlaps once", yearsFromJobs([
  { role: null, level: null, title: "A", company: "X", companyTypes: [], country: null, start: "2018-01", end: "2022-01", internship: false },
  { role: null, level: null, title: "B", company: "Y", companyTypes: [], country: null, start: "2022-01", end: "present", internship: false },
], today).years === 8.9);
let threw = false;
try {
  yearsFromJobs([{ role: null, level: null, title: "A", company: "X", companyTypes: [], country: null, start: "Sept-2019", end: "present", internship: false }], today);
} catch { threw = true; }
ok("an unreadable start date does not crash (25 Nov: it stopped the whole card build)", !threw);
const nic = decodeNic("NIC NO : 922420300V MOBILE");
ok("NIC gives birth date and gender", nic?.dob === "1992-08-29" && nic?.gender === "male");
const p = finishProfile(
  { id: "a", cvText: "", cvDate: "2026-11-01", taYears: null, mergedInto: null, cvFileMissing: false },
  jsonOf('```json\n{"roles":["accountant","not_a_role"],"level":12,"residence":{"place":"Nugegoda","country":"LK"},"gender":"female","jobs":[]}\n```'),
);
ok("off-list role dropped, accountant kept", p.roles.join() === "accountant");
ok("a level off the ladder is unknown", p.level === null && p.gaps.includes("level"));
ok("place resolved from the town", !!p.place && p.country === "LK");

console.log("\nthe engine");
const card = (id: string, place: string, gender: string | null) =>
  finishProfile({ id, cvText: "", cvDate: "2026-11-01", taYears: null, mergedInto: null, cvFileMissing: false },
    { roles: ["accountant"], level: 1, title: "Accountant", residence: { place, country: "LK" }, gender, jobs: [{ role: "accountant", level: 1, title: "Accountant", company: "Z", start: "2020-01", end: "present" }] } as never);
const engine = new Engine([card("kandy", "Kandy", "female"), card("col", "Nugegoda", "male"), card("gal", "Galle", null)]);
const r1 = await engine.search(readConversation(["accountant not in Kandy"]));
ok("'not in Kandy' leaves the Kandy accountant out", !r1.hits.some((h) => h.id === "kandy") && r1.hits.length === 2, JSON.stringify(r1.hits.map((h) => h.id)));
const r2 = await engine.search(readConversation(["female accountant"]));
ok("a gender must keeps only stated women; unknown gender left out and counted", r2.hits.map((h) => h.id).join() === "kandy" && (r2.counts.unknown.gender?.leftOut ?? 0) === 1, JSON.stringify(r2.counts.unknown));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
