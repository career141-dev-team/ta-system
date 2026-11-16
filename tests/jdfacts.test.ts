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

test("an answer is one sentence, then the hand-over line once", () => {
  assert.equal(withHandover("SAP is the main skill they need."), `SAP is the main skill they need. ${HANDOVER_LINE}`);
  const long = withHandover("One. Two. Three. Four. Five.");
  assert.equal(long, `One. ${HANDOVER_LINE}`);
  assert.equal(withHandover(`Outerwear planning. ${HANDOVER_LINE}`), `Outerwear planning. ${HANDOVER_LINE}`);
  assert.equal(withHandover(null), `Thank you for asking. ${HANDOVER_LINE}`);
});

test("above the budget only when both are real amounts", () => {
  assert.equal(aboveBudget(750000, 700000), true);
  assert.equal(aboveBudget(600000, 700000), false);
  assert.equal(aboveBudget(7.5, 700000), false);
  assert.equal(aboveBudget(750000, undefined), false);
});

test("WhatsApp replies are one crisp line and never promise a stage (owner, 13 Nov)", async () => {
  const { oneLine, doneReply, nextAsk, reminderAsk } = await import("../convex/lib/jdFacts");
  assert.equal(oneLine("Hi Srishanker,\n\nThank you! One.\n\nTwo. Three."), "Hi Srishanker, Thank you! One.");
  assert.doesNotMatch(doneReply("Srishanker"), /100%|advanced|selected|complete/i);
  // An opening's question is asked as itself, not glued into "still waiting on your ...".
  const q = "Are you available to commence on Friday, 13th November 2026?";
  assert.equal(nextAsk([q], "Srishanker"), `Thanks, Srishanker! ${q}`);
  assert.equal(nextAsk(["Notice Period"], "Ann"), "Thanks, Ann! Could you share your notice period?");
  assert.equal(nextAsk(["CV Document"], "Ann"), "Thanks, Ann! Could you share your CV?");
  assert.equal(nextAsk([], "Ann"), null);
  assert.doesNotMatch(reminderAsk(["Current Salary", "Notice Period"], "Ann", "Intern"), /\n|•/);
});
