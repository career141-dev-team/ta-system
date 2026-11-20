// node "src/app/openings/[id]/refereeRules.check.ts"
import assert from "node:assert/strict";
import { changesOf, dayLabel, withIds, type Cells, type LiveCall } from "./refereeRules.ts";

const C = (...v: string[]) => [v[0] ?? "", v[1] ?? "", v[2] ?? "", v[3] ?? ""] as Cells;
const saved = new Map<string, Cells>([["a", C("Virtusa", "Kasun", "077", "ok")], ["b", C("IFS", "Nimali")], ["z", C("Theirs")]]);
const rows = [
  { id: "a", mine: true, cells: C("Virtusa", "Kasun", "077", "ok ") },  // same once trimmed
  { id: "b", mine: true, cells: C("IFS", "Nimali", "071") },              // changed
  { mine: true, cells: C("Hayleys", "Chamara") },                         // new
  { mine: true, cells: C() },                                             // empty: nothing
  { id: "z", mine: false, cells: C("Theirs", "edited") },                 // not mine: never sent
];
const ch = changesOf(new Map([...saved].filter(([k]) => k !== "z")), rows);
assert.deepEqual(ch.add, [{ company: "Hayleys", referral: "Chamara", contactNumber: "", feedback: "" }]);
assert.deepEqual(ch.update.map((u) => u.id), ["b"]);
assert.deepEqual(ch.remove, []);
assert.equal(ch.any, true);
// a deleted row and an emptied row are removed
assert.deepEqual(changesOf(saved, [{ id: "b", mine: true, cells: C() }]).remove.sort(), ["a", "b", "z"]);
assert.equal(changesOf(new Map(), []).any, false);

const call = (id: string, company: string, referral: string): LiveCall =>
  ({ id, company, referral, contactNumber: "", feedback: "", result: null, addedBy: "me", by: "", createdAt: 1 });
const got = withIds(rows, [call("a", "Virtusa", "Kasun"), call("n1", "Hayleys", "Chamara")], new Set(["a", "b"]));
assert.equal(got[2].id, "n1");
assert.equal(got[3].id, undefined);

assert.equal(dayLabel("2026-11-20", "2026-11-20"), "Today · Fri 20 Nov");
assert.equal(dayLabel("2026-11-19", "2026-11-20"), "Thu 19 Nov");
console.log("refereeRules: all checks passed");
