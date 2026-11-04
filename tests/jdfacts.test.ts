import assert from "node:assert/strict";
import test from "node:test";
import { HANDOVER_LINE, aboveBudget, jdForQuestions, withHandover } from "../convex/lib/jdFacts";

const JD = `ABOUT THE ROLE
The role is into heading the planning department, covering the outerwear operations.

PRE-REQUISITES
Experience with any product category except intimates.
SAP is a must.`;

test("the PRE-REQUISITES section is read apart from the role", () => {
  const j = jdForQuestions(JD);
  assert.match(j.prerequisites, /except intimates/);
  assert.match(j.prerequisites, /SAP is a must/);
  assert.doesNotMatch(j.prerequisites, /PRE-REQUISITES/);
  assert.match(j.role, /outerwear operations/);
  assert.doesNotMatch(j.role, /intimates/);
  // No heading: the whole JD is the role.
  assert.deepEqual(jdForQuestions("Just a role."), { prerequisites: "", role: "Just a role." });
  assert.equal(jdForQuestions(null).role, "");
});

test("an answer is two sentences at most, then the hand-over line once", () => {
  assert.equal(withHandover("SAP is the main skill they need."), `SAP is the main skill they need. ${HANDOVER_LINE}`);
  const long = withHandover("One. Two. Three. Four. Five.");
  assert.equal(long, `One. Two. ${HANDOVER_LINE}`);
  assert.equal(withHandover(`Outerwear planning. ${HANDOVER_LINE}`), `Outerwear planning. ${HANDOVER_LINE}`);
  assert.equal(withHandover(null), `Thank you for asking. ${HANDOVER_LINE}`);
});

test("above the budget only when both are real amounts", () => {
  assert.equal(aboveBudget(750000, 700000), true);
  assert.equal(aboveBudget(600000, 700000), false);
  assert.equal(aboveBudget(7.5, 700000), false);
  assert.equal(aboveBudget(750000, undefined), false);
});
