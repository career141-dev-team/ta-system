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
// Where TA has no mutation of its own, the write touches the row directly -
// but only on this list, and the list is here so that adding to it is a
// deliberate act somebody has to read.
const MAY_TOUCH = [
  "applications",   // only clientOwnedAt; the stage itself goes through the state machine
  "clientReviews",  // the client's own words about one candidate
  "clients",        // only who owns them on the Ops side
  "interviews",     // attendance, a cancellation, the client's decision
  "jobPosts",       // an advert's own row
  "notifications",  // a bell, which has no rules to go around
  "opsApiWrites",   // our own idempotency keys
  "placements",     // the joining day, a fall-through, the invoice's state
  "reviewRounds",   // the day the client received a set
];
const touched = [
  ...[...writes.matchAll(/ctx\.db\.insert\("(\w+)"/g)].map((m) => m[1]),
  ...[...writes.matchAll(/ctx\.db\.get\(([^)]*?)\)/g)].map(() => null),
].filter(Boolean) as string[];
for (const table of new Set(touched)) {
  assert.ok(MAY_TOUCH.includes(table), "An Ops write inserts into " + table + ", which is not on the list");
}

// The one thing that must never be written directly: a candidate's stage.
// It carries TA's own rules, its pipeline event and its rejection notice.
assert.equal(
  /patch\([^)]*currentStage/s.test(writes),
  false,
  "A candidate's stage is moved only through executeStageTransition",
);
assert.ok(writes.includes("executeStageTransition"), "which this uses for every client decision");
assert.equal(
  [...writes.matchAll(/executeStageTransition\(/g)].length >= 2,
  true,
  "both the decision and the client-owned claim go through it",
);

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

/* ── The events feed ───────────────────────────────────────────── */

const events = readFileSync(path.resolve("convex/lib/opsEvents.ts"), "utf8");
const stateMachine = readFileSync(path.resolve("convex/pipeline/pipelineStateMachine.ts"), "utf8");
const reads = readFileSync(path.resolve("convex/integrations/opsRead.ts"), "utf8");

// The promise that matters most: telling Ops can never break a TA write.
assert.ok(events.includes("try {") && events.includes("catch"), "Raising an event is wrapped");
assert.ok(events.includes("console.warn"), "and a failure is logged rather than thrown");
assert.ok(
  events.includes("Deliberately swallowed"),
  "and says why in the file, so nobody 'fixes' it into throwing",
);

// A stage change is the event the client's side turns on, and it is raised
// in the same transaction as TA's own audit row.
assert.ok(stateMachine.includes('raiseOpsEvent(ctx, "application.stage_changed"'));
assert.ok(
  stateMachine.indexOf('raiseOpsEvent(ctx, "application.stage_changed"') >
    stateMachine.indexOf('ctx.db.insert("pipelineEvents"'),
  "raised after TA's own write, never before it",
);

// The feed reads forward from a cursor and never winds backwards on a quiet
// hour, which would make Ops replay a day of events.
assert.ok(reads.includes("opsEventsAfter"), "There is a feed");
assert.ok(reads.includes('q.gt("at", after)'), "that reads strictly after the cursor");
const feed = readFileSync(path.resolve("convex/integrations/opsReadHttp.ts"), "utf8");
assert.ok(feed.includes("events.length ? events[events.length - 1].at : after"), "and holds the cursor when empty");
assert.ok(http.includes('{ path: "/integrations/v1/events", method: "GET", handler: opsReadEvents }'));

/* ── Every endpoint the Ops System actually calls ──────────────── */

for (const route of [
  '{ pathPrefix: "/integrations/v1/clients/", method: "POST", handler: opsWriteClient }',
  '{ pathPrefix: "/integrations/v1/client-sets/", method: "POST", handler: opsWriteClientSet }',
  '{ pathPrefix: "/integrations/v1/applications/", method: "POST", handler: opsWriteApplication }',
  '{ path: "/integrations/v1/reference-requests", method: "POST", handler: opsWriteReferenceRequest }',
  '{ path: "/integrations/v1/interviews", method: "POST", handler: opsWriteCreateInterview }',
  '{ pathPrefix: "/integrations/v1/interviews/", method: "POST", handler: opsWriteInterview }',
  '{ pathPrefix: "/integrations/v1/placements/", method: "POST", handler: opsWritePlacement }',
]) {
  assert.ok(http.includes(route), "Missing route: " + route);
}

console.log("  ok  ops writes and events: off by default, attributed, repeat-safe, and unable to break a TA write");
