// node "src/app/openings/[id]/excelLive.check.ts" - which old action a row change is.
import assert from "node:assert/strict";
import { actionFor, addedBucket, type LiveRow } from "./excelRules.ts";

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
