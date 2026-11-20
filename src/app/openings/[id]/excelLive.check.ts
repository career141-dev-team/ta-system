// node "src/app/openings/[id]/excelLive.check.ts" - which old action a row change is.
import assert from "node:assert/strict";
import { actionFor, addedBucket, sheetDate, sheetsOf, type LiveRow } from "./excelRules.ts";

const row = {
  id: "r1", name: "Amal", company: "Dialog", phone: "0771234567", phoneSource: "profile", outcome: "responded",
  notes: [{ id: "n1", note: "first", mine: true }],
} as unknown as LiveRow;
const locs = [{ id: "w1", name: "Colombo office" }];
const a = (p: Record<string, unknown>, n = 1) => actionFor(row, p, "job1", n, locs);

assert.deepEqual(a({ eye: true }), { do: "eye", openingId: "job1", entryId: "r1" });
assert.equal(a({ addOn: true })?.on, "1");
assert.deepEqual(a({ interest: "no", why: "Too junior" }), { do: "interest", openingId: "job1", entryId: "r1", interest: "not_interested", reason: "Too junior" });
assert.equal(a({ notes: ["first", "second"] })?.do, "note");
assert.equal(a({ notes: ["first", "Approached: on LinkedIn"] })?.do, "log");
assert.deepEqual(a({ notes: [] }), { do: "removeNote", openingId: "job1", entryId: "r1", noteId: "n1" });
assert.deepEqual(a({ location: "Colombo office" }), { do: "location", openingId: "job1", linkId: "r1", workLocationId: "w1" });
// An edit sends the stored outcome back unchanged, and keeps the phone's source.
const up = a({ phone: "0779999999" })!;
assert.equal(up.outcome, "responded");
assert.equal(up.phoneSource, "profile");
assert.equal(a({ phone: "0779999999", via: "mutual" })?.phoneSource, "mutual_connection");
assert.equal(a({ profile: {} }), null); // a profile read stays on screen only

const now = Date.parse("2026-11-20T06:00:00Z");
assert.equal(addedBucket(now - 3600_000, now), "today");
assert.equal(addedBucket(now - 26 * 3600_000, now), "yesterday");
assert.equal(addedBucket(now - 4 * 86_400_000, now), "week");
assert.equal(addedBucket(now - 9 * 86_400_000, now), "older");
console.log("excelLive: all checks passed");

// Sheets: a lead's own empty L1 (started today) and a TA's 51 rows in L1 from 18 Nov
// read as one L1 dated 18 Nov; a row-only L2 is listed but not the viewer's.
{
  const d18 = Date.parse("2026-11-18T04:00:00Z"), d20 = Date.parse("2026-11-20T04:00:00Z");
  const rows = [...Array.from({ length: 51 }, (_, i) => ({ sheet: 1, createdAt: d18 + i * 60_000 })), { sheet: 2, createdAt: d20 }, { sheet: null, createdAt: d20 }];
  const got = sheetsOf([{ n: 1, at: d20, name: null }], rows);
  assert.deepEqual(got.map((s) => [s.n, s.at, s.own]), [[1, d18, true], [2, d20, false]]);
  assert.equal(sheetDate(got[0].at), "18 Nov");
  assert.deepEqual(sheetsOf([{ n: 3, at: d20, name: "Mine" }], []), [{ n: 3, at: d20, name: "Mine", own: true }]);
}
console.log("excelLive: sheet checks passed");
