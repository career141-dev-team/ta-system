// node src/app/strategy/strategyRules.check.ts
import assert from "node:assert/strict";
import { mondayOf, screenRow, stepsFor, weekOf, ymd, type LiveRow } from "./strategyRules.ts";

const now = Date.UTC(2026, 10, 19, 6); // Thu 19 Nov, Colombo
const day = (d: number) => Date.UTC(2026, 10, d) - 5.5 * 3_600_000;
assert.equal(ymd(mondayOf(now)), "2026-11-16");
assert.deepEqual(weekOf(now), { labels: ["Mon 16", "Tue 17", "Wed 18", "Thu 19", "Fri 20"], today: 3 });
assert.equal(weekOf(Date.UTC(2026, 10, 22, 6)).today, 4); // Sunday sits on Friday

const base: LiveRow = { job: "j", strategyId: "s", name: "LinkedIn search", ticked: true, na: false, doneBy: [], assignedAt: null, doneAt: null, note: null, proofs: 0, submittedAt: null, submittedBy: null };
assert.equal(screenRow({ ...base, ticked: false }, now), null);
assert.equal(screenRow(base, now)!.state, "open");
assert.equal(screenRow({ ...base, na: true }, now)!.state, "na");
const w = screenRow({ ...base, doneBy: [{ id: "t", pending: true }], assignedAt: day(18) }, now)!;
assert.equal(w.state, "waiting");
assert.deepEqual(w.days, [2, 2]);
assert.equal(screenRow({ ...base, doneBy: [{ id: "t", pending: false }], assignedAt: day(9) }, now)!.when, "9 Nov");
const d = screenRow({ ...base, doneBy: [{ id: "t", pending: false }], submittedAt: now - 3_600_000, note: "ok", proofs: 2 }, now)!;
assert.equal(d.state, "done");
assert.equal(d.read, false);
assert.equal(d.ago, "1 h ago");

const dayOf = (i: number) => ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"][i];
// plan a new one for a TA on Wednesday
assert.deepEqual(stepsFor(undefined, { state: "waiting", ta: "t", days: [2, 2] }, dayOf), [
  { do: "line", field: "selected", value: "1" }, { do: "addTa", taId: "t" }, { do: "line", field: "assignedAt", value: "2026-11-18" },
]);
// change the TA only
assert.deepEqual(stepsFor({ state: "waiting", ta: "a", days: [2, 2] }, { state: "waiting", ta: "b", days: [2, 2] }, dayOf), [
  { do: "removeTa", taId: "a" }, { do: "addTa", taId: "b" },
]);
// strike, then bring back
assert.deepEqual(stepsFor({ state: "open" }, { state: "na" }, dayOf), [{ do: "na", na: "1" }]);
assert.deepEqual(stepsFor({ state: "na" }, { state: "open" }, dayOf), [{ do: "na", na: "0" }, { do: "line", field: "selected", value: "1" }]);
// take off
assert.deepEqual(stepsFor({ state: "waiting", ta: "a" }, undefined, dayOf), [{ do: "removeTa", taId: "a" }, { do: "line", field: "selected", value: "0" }]);
assert.deepEqual(stepsFor({ state: "na" }, undefined, dayOf), [{ do: "na", na: "0" }]);
// nothing changed
assert.deepEqual(stepsFor({ state: "open", ta: "a", days: [1, 1] }, { state: "open", ta: "a", days: [1, 1] }, dayOf), []);
console.log("strategyRules: all checks passed");
