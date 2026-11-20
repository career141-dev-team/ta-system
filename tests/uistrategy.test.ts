/**
 * The new UI's Strategy Planner on the old server (D10a, 20 Nov): the old page's
 * reads, every planner button through the old action with only its own fields,
 * the week's load counted on the Colombo week, sign-in and strategy.assign first.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { readUiBody } from "../src/lib/uiLinks";
import { LINE_FIELDS, STRATEGY_ACTIONS, weekLoad } from "../src/lib/uiStrategy";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };
const route = fs.readFileSync("src/app/api/ui/strategy/route.ts", "utf8");

ok("a button carries only its old form's fields", () => {
  const r = readUiBody(STRATEGY_ACTIONS, { do: "addTa", openingId: "o", strategyId: "s", taId: "t" });
  assert.ok(r.ok && r.fields.length === 3);
  assert.equal(readUiBody(STRATEGY_ACTIONS, { do: "addTa", openingId: "o", strategyId: "s", taId: "t", byRole: "admin" }).ok, false);
  assert.equal(readUiBody(STRATEGY_ACTIONS, { do: "line", strategyId: "s" }).ok, false);
  assert.ok(readUiBody(STRATEGY_ACTIONS, { do: "active", id: "s", active: "0" }).ok);
  assert.deepEqual([...LINE_FIELDS].sort(), ["assignedAt", "doneAt", "note", "selected"]);
});
ok("every button runs the old planner action", () => {
  for (const fn of ["updateStrategyLine", "addStrategyDoneBy", "removeStrategyDoneBy", "setStrategyNotApplicable", "saveStrategy", "setStrategyActive"]) assert.ok(route.includes(fn), fn);
  assert.ok(route.includes("LINE_FIELDS.has("));
});
ok("the week's load: this Colombo week, struck rows and other TAs left out", () => {
  const now = Date.UTC(2026, 10, 19, 6); // Thu 19 Nov, Colombo
  const day = (d: number) => Date.UTC(2026, 10, d) - 5.5 * 3_600_000; // a Colombo midnight
  const rows = [
    { doneBy: ["a"], assignedAt: day(16), notApplicable: false }, // Mon: counts
    { doneBy: ["a", "b"], assignedAt: day(22), notApplicable: false }, // Sun: counts
    { doneBy: ["a"], assignedAt: day(23), notApplicable: false }, // next Mon: not
    { doneBy: ["a"], assignedAt: day(15), notApplicable: false }, // last Sun: not
    { doneBy: ["a"], assignedAt: day(18), notApplicable: true }, // struck: not
    { doneBy: ["a"], assignedAt: null, notApplicable: false }, // no day: not
  ];
  assert.equal(weekLoad(rows, "a", now), 2);
  assert.equal(weekLoad(rows, "b", now), 1);
});
ok("reads are the old page's: strategy.assign first, the planner's own jobs", () => {
  const get = route.slice(route.indexOf("export async function GET"));
  assert.ok(get.indexOf("currentUser()") < get.indexOf('can(user, "strategy.assign")') && get.indexOf("strategy.assign") < get.indexOf("primeStore("));
  assert.ok(route.includes("plannerJobs(repo.openings()") && route.includes("isTicked(r)") && route.includes("strategyAcceptanceStatus(r, id)"));
  assert.ok(route.includes('authorization")?.startsWith("Bearer ")') && route.includes("uiCors("));
});

console.log(`\n${n} passed, 0 failed`);
