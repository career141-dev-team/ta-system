// The one check of the move rules. Run: node "src/app/openings/[id]/pipelineRules.check.mjs"
import assert from "node:assert/strict";
import { checkMove, movesFrom, STAGES } from "./pipelineRules.ts";

const ready = { missing: [] };
const TA = "Talent Acquisition";
const LEAD = "TA Lead";
const ok = (v) => v.ok === true;

// The daily path.
assert.ok(ok(checkMove(ready, "TA Follow-Up", "Director Review", TA)));
assert.equal(checkMove(ready, "Client Shortlist", "Interview", TA).needs, "interview");
assert.equal(checkMove(ready, "Interview", "Offer", TA).needs, "offer");
assert.equal(checkMove(ready, "Offer", "Placed", TA).needs, "placement");

// A reason before every reject and drop-out, from any open stage.
for (const s of STAGES.filter((s) => !s.closed && s.name !== "Placed"))
  for (const end of ["Rejected", "Dropped out"]) assert.equal(checkMove(ready, s.name, end, TA).needs, "reason", s.name);

// Refusals.
assert.ok(!ok(checkMove(ready, "TA Follow-Up", "Placed", TA)), "no skipping to Placed");
assert.ok(!ok(checkMove(ready, "TA Follow-Up", "AI Follow-Up", TA)), "nobody into AI Follow-Up by hand");
assert.ok(!ok(checkMove({ missing: ["Notice Period"] }, "TA Follow-Up", "Director Review", TA)), "Director Review needs the details");
assert.ok(!ok(checkMove(ready, "Director Review", "Director Shortlist", TA)), "a TA does not decide the shortlist");
assert.ok(ok(checkMove(ready, "Director Review", "Director Shortlist", LEAD)));
assert.ok(!ok(checkMove(ready, "Placed", "Rejected", TA)), "Placed is locked for a TA");
assert.ok(ok(checkMove(ready, "Placed", "Rejected", LEAD)));
assert.ok(!ok(checkMove(ready, "Placed", "Offer", LEAD)), "Placed never goes back a stage");

assert.ok(!ok(checkMove({ missing: [], owned: false }, "AI Follow-Up", "Director Review", TA)), "shortlist comes first");

// Back in from an ending.
assert.ok(ok(checkMove(ready, "Rejected", "TA Follow-Up", TA)));

// The menu lists the next stages and both endings.
assert.deepEqual(
  movesFrom(ready, "Client Shortlist", TA).map((m) => m.name),
  ["Interview", "Offer", "Rejected", "Dropped out"],
);
console.log("pipeline rules: ok");
