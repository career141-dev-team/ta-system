import assert from "node:assert/strict";
import { referralRows, REFERRAL_EXPORT_HEADERS, picksBySearch } from "@/lib/referralExport";
import type { ReferralPerson } from "@/lib/referralSearch";

const p = (o: Partial<ReferralPerson>): ReferralPerson => ({
  id: "1", name: "A B", designation: null, company: null, phone: null, email: null, relationship: null,
  at: 0, why: [], namedByCount: 0, namedBy: [], ...o,
});

const rows = referralRows(
  [p({ name: "Nimal Perera", designation: "HR Manager", company: "Dialog", phone: "0771", namedBy: [{ id: "c1", fullName: "X Y", title: "", employer: "" }, { id: "c2", fullName: "Z W", title: "", employer: "" }], at: Date.UTC(2025, 0, 5) }), p({})],
  new Map([["Nimal Perera", "Nimal P. Perera"]]),
);
assert.equal(rows[0].length, REFERRAL_EXPORT_HEADERS.length);
assert.deepEqual(rows[0], ["Nimal Perera", "HR Manager", "Dialog", "0771", "", "", "X Y, Z W", "Nimal P. Perera", "2025-01-05"]);
assert.deepEqual(rows[1], ["A B", "", "", "", "", "", "", "", ""]);
// 28 Nov: ticks from several searches export together, grouped by search.
const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
const two = picksBySearch(fd({ picks: JSON.stringify([{ id: "a", q: "HR at Dialog", x: [] }, { id: "b", q: "HR at Dialog", x: [] }, { id: "c", q: "Finance at MAS", x: ["MAS"] }]) }));
assert.equal(two.length, 2);
assert.deepEqual([...two[0].ids], ["a", "b"]);
assert.deepEqual(two[1].x, ["MAS"]);
// An old tab still sends one q + ids.
assert.deepEqual([...picksBySearch(fd({ q: "HR", id: ["a", "b"], x: "Dialog" }))[0].ids], ["a", "b"]);
// Broken or empty lists are nothing; at most 10 searches and 60 people.
assert.equal(picksBySearch(fd({ picks: "{oops" })).length, 0);
const many = Array.from({ length: 80 }, (_, i) => ({ id: `p${i}`, q: `s${i % 15}`, x: [] }));
const capped = picksBySearch(fd({ picks: JSON.stringify(many) }));
assert.equal(capped.length, 10);
assert.ok(capped.reduce((n, s) => n + s.ids.size, 0) <= 60);
console.log("ok referralExport");
