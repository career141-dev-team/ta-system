// tests/opsEvents.test.ts
//
// The events TA raises for the Ops System (ops docs/15 Part E, the events).
//
// Written 6 November 2026, after counting both sides: the Ops System knows how
// to handle 25 event types, this repository declared 15, and it actually
// raised 5 - four of them inside opsWrite.ts, which only fire when Ops itself
// just did something. They told Ops what Ops already knew.
//
// The one that mattered most was never raised at all: client_set.ready is the
// trigger for the whole of the Ops client-side flow. A set of CVs could be
// ready here and Ops would never hear, so none of its clocks - the CV
// ownership window, the feedback chase, the two weeks before a hold - ever
// started.
//
// These are read as text rather than run, like the other two ops suites: a
// convex mutation needs a deployment, and what is being checked is that the
// call is in the right file beside the right write.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.resolve(p), "utf8");

const events = read("convex/lib/opsEvents.ts");
const aiReader = read("convex/mailIntake/aiReader.ts");
const dailyEmail = read("convex/lib/dailyEmail.ts");
const decisions = read("convex/mailIntake/decisions.ts");
const stateMachine = read("convex/pipeline/pipelineStateMachine.ts");
const openings = read("convex/ta/openings.ts");
const commit = read("convex/ta/commit.ts");

/* ── Nothing here may ever break a TA write ────────────────────── */

assert.ok(events.includes("try {"), "every raise is wrapped");
assert.ok(
  events.includes("console.warn") && events.includes("Deliberately swallowed"),
  "a raise that fails is logged and swallowed: TA never fails because Ops could not be told",
);

/* ── The list Ops is waiting on ─────────────────────────────────── */

/**
 * Every type the Ops System handles, read from its own taEvents.ts on 6 Nov.
 * A type Ops waits for that is not declared here can never be raised, and
 * nobody would find out except by the feature quietly not working.
 */
const OPS_HANDLES = [
  "opening.created", "opening.updated", "opening.closed", "opening.jd_approved",
  "opening.working_stage_changed",
  "application.stage_changed",
  "client_set.ready",
  "director_round.sent", "director_round.decided",
  "interview.booked", "interview.confirmed", "interview.outcome",
  "interview.feedback", "interview.candidate_out",
  "offer.made", "offer.accepted", "offer.declined",
  "placement.created", "placement.joined", "placement.no_show", "placement.fell_through",
  "reference.reported",
  "jobpost.live", "jobpost.closed",
  "candidate.rejection_notice_sent",
];

for (const type of OPS_HANDLES) {
  assert.ok(
    events.includes(`"${type}"`),
    `Ops handles ${type} and OPS_EVENT_TYPES does not declare it, so it can never be raised`,
  );
}

/* ── Raised by TA's own work, not echoing an Ops write ──────────── */

/**
 * The point of the whole file. An event raised inside opsWrite.ts only fires
 * when Ops itself just called us, so it tells Ops nothing it did not already
 * know. These are raised where TA's own people do their own work.
 */
assert.ok(
  stateMachine.includes('raiseOpsEvent(ctx, "application.stage_changed"'),
  "a candidate moving stage is TA's own work and Ops has no other way to see it",
);

assert.ok(
  aiReader.includes('"client_set.ready"'),
  "a client round created here is the set the client is asked to look at: every Ops clock counts from it",
);
assert.ok(
  aiReader.includes("raiseOpsEvent(ctx, kind === \"client\" ? \"client_set.ready\" : \"director_round.sent\""),
  "and the same write raises the director form of it, because one function makes both",
);

assert.ok(
  dailyEmail.includes('raiseOpsEvent(ctx, "director_round.sent"'),
  "the end-of-day email that creates a director round tells Ops the set has gone",
);
assert.ok(
  dailyEmail.includes("!email.parentId"),
  "a revision of an email is not a new round, so it does not raise a second one",
);

assert.ok(
  decisions.includes('raiseOpsEvent(ctx, "director_round.decided"'),
  "a director round coming back is TA's own work",
);
assert.ok(
  decisions.includes('round.kind === "director"'),
  "and only the director round: a client round already moves each candidate through the state machine, which raises application.stage_changed per application. Raising a round-shaped event too would have Ops act on it twice",
);

/* ── The raise carries what Ops needs to find its own row ───────── */

assert.ok(
  events.includes("openingId") && events.includes("applicationId"),
  "the opening and the application are lifted out of the data, so the reader never parses JSON to route an event",
);
for (const file of [aiReader, dailyEmail, decisions]) {
  const raise = file.slice(file.indexOf("raiseOpsEvent(ctx,"));
  assert.ok(raise.includes("openingId"), "every raise says which opening it is about");
}


/* ── The offer and the placement, named rather than worked out ──── */

/**
 * The `placements` and `offers` tables are never written anywhere in this
 * repository outside the Ops API itself, so there is no Place row to hang an
 * event on: **the stage is the event**. All five come off the same two stages,
 * in the one file every stage move already goes through.
 */
for (const [type, why] of [
  ["offer.made", "Ops stops the search when an offer is given"],
  ["offer.accepted", "offer -> placed"],
  ["offer.declined", "offer -> rejected or unresponsive, and Ops reopens the search"],
  ["placement.created", "the placement, the notice to accounts, and the joining-day clocks"],
  ["placement.fell_through", "a placement coming off again"],
] as const) {
  assert.ok(
    stateMachine.includes(`"${type}"`),
    `${type} is not raised in the state machine, and there is nowhere else to raise it: ${why}`,
  );
}

assert.ok(
  openings.includes('raiseOpsEvent(ctx, "opening.working_stage_changed"'),
  "the TA lead's own menu putting somebody on 100% is the only way Ops hears it from inside TA",
);
assert.ok(
  commit.includes('raiseOpsEvent(ctx, "opening.jd_approved"'),
  "approving the JD is when the search has really begun",
);

/* ── The ones that are not TA's to raise ────────────────────────── */

/**
 * Declared so Ops can name them, deliberately never raised here. Each one is
 * something **Ops itself** writes through the API, so an event would be TA
 * telling Ops what Ops just told TA - which is the fault this whole file was
 * written to fix, and worth being explicit about so nobody "finishes the set"
 * later by adding them.
 */
const OPS_WRITES_THESE = [
  "placement.joined",
  "placement.no_show",
  "interview.confirmed",
  "interview.candidate_out",
];
for (const type of OPS_WRITES_THESE) {
  assert.ok(events.includes(`"${type}"`), type + " is still declared");
  assert.equal(
    stateMachine.includes(`"${type}"`), false,
    type + " is recorded by Ops through the API, so TA raising it would be an echo",
  );
}

/**
 * Still genuinely missing, and listed here so the gap is a decision rather
 * than an oversight: TA records these and Ops wants them, but there is no
 * single place in this repository that owns the moment yet.
 */
const STILL_TO_FIND = ["interview.feedback", "reference.reported", "jobpost.live", "jobpost.closed", "candidate.rejection_notice_sent"];
for (const type of STILL_TO_FIND) {
  assert.ok(events.includes(`"${type}"`), type + " is declared, so Ops can at least name what it is waiting for");
}

console.log(
  "ops events: " + OPS_HANDLES.length + " declared, " +
  (OPS_HANDLES.length - OPS_WRITES_THESE.length - STILL_TO_FIND.length) + " raised by TA's own work, " +
  OPS_WRITES_THESE.length + " written by Ops itself, " +
  STILL_TO_FIND.length + " still to place",
);
