/**
 * The Ops System's writes (ops docs/15 Part E).
 *
 * These change live TA data, so what is tested here is the promises, not the
 * plumbing: writes are off until somebody turns them on, every change is
 * attributed to a named person, the same write twice does one thing, and
 * nothing goes around TA's own mutations.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const door = readFileSync(path.resolve("convex/integrations/opsWriteHttp.ts"), "utf8");
const writes = readFileSync(path.resolve("convex/integrations/opsWrite.ts"), "utf8");
const http = readFileSync(path.resolve("convex/http.ts"), "utf8");
const schema = readFileSync(path.resolve("convex/schema.ts"), "utf8");

/* ── Off until somebody turns them on ──────────────────────────── */

assert.ok(door.includes("OPS_API_WRITES_ENABLED"), "The writes need their own switch");
assert.ok(
  door.includes('(process.env.OPS_API_WRITES_ENABLED ?? "").trim().toLowerCase() === "on"'),
  "Only the word on turns them on: anything else, including unset, stays off",
);
assert.ok(door.includes("OPS_API_TOKEN"), "and the same key as the reads");
assert.equal(door.includes("CAPACITY_PLANNER_READ_TOKEN"), false, "never the planner's key");

/* ── Nothing happens that nobody can be named for ──────────────── */

assert.ok(door.includes("OPS_API_ACTOR_EMAIL"), "Every change is recorded as a named TA user");
assert.ok(
  door.includes("nothing could be attributed"),
  "and refuses in words a person can act on when that user is not set up",
);

/* ── The same write twice does one thing ───────────────────────── */

assert.ok(door.includes("idempotencyKey"), "Every write carries a key");
assert.ok(door.includes("recallRef"), "and is answered from the first answer when it repeats");
assert.ok(door.includes("repeated: true"), "and says so, so the Ops side can tell");
assert.ok(
  schema.includes("opsApiWrites: defineTable"),
  "The answer we gave is kept, or a retry after an outage would do it twice",
);
assert.ok(schema.includes('.index("by_key", ["idempotencyKey"])'), "and is looked up by its key");

/* ── Through TA's own doors, never around them ─────────────────── */

for (const door_ of [
  "internal.ta.openings.create",
  "internal.ta.openings.setWorkingStage",
  "internal.ta.openings.updateMasterSheet",
]) {
  assert.ok(writes.includes(door_), "Writes go through " + door_);
}
// The one direct insert is a bell, which has no rules to go around.
const patches = [...writes.matchAll(/ctx\.db\.patch\(/g)].length;
assert.equal(patches, 0, "No Ops write patches a TA row behind its own mutation's back");
const inserts = [...writes.matchAll(/ctx\.db\.insert\("(\w+)"/g)].map((m) => m[1]);
assert.deepEqual([...new Set(inserts)].sort(), ["notifications", "opsApiWrites"].sort());

/* ── The routes ────────────────────────────────────────────────── */

for (const route of [
  '{ path: "/integrations/v1/notify", method: "POST", handler: opsWriteNotify }',
  '{ path: "/integrations/v1/openings", method: "POST", handler: opsWriteCreateOpening }',
  '{ pathPrefix: "/integrations/v1/openings/", method: "POST", handler: opsWriteUnderOpening }',
]) {
  assert.ok(http.includes(route), "Missing route: " + route);
}
// The reads are still GET and still their own handlers: adding writes must
// not have moved the door the Ops System already reads through.
assert.ok(http.includes('{ pathPrefix: "/integrations/v1/openings/", method: "GET", handler: opsReadOpening }'));

/* ── What TA refuses, Ops is told in words ─────────────────────── */

assert.ok(door.includes("422"), "TA's own refusal comes back as a refusal, not a server error");
assert.ok(
  writes.includes("Opening not found"),
  "and an opening that is gone is said plainly rather than crashing",
);

console.log("  ok  ops writes: switched off, attributed, repeat-safe, through TA's own mutations");
