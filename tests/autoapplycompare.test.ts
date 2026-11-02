/**
 * Does the reply reader agree with the lead? (docs/19 §7.6)
 *
 * The owner will not turn C141_SHORTLIST_AUTO_APPLY on without the evidence, so
 * the counting has to be right: a reply only counts when the parser called it
 * clear and a lead confirmed it, and a difference is a difference whether the
 * lead changed an outcome, dropped a candidate, or added one.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { compareReplies, compareReply, type ComparedReply } from "../convex/lib/autoApplyCompare";

const reply = (over: Partial<ComparedReply> = {}): ComparedReply => ({
  id: "r1",
  receivedAt: 1_000,
  clear: true,
  proposed: [
    { applicationId: "a1", outcome: "shortlisted" },
    { applicationId: "a2", outcome: "rejected" },
  ],
  confirmed: [
    { applicationId: "a1", outcome: "shortlisted" },
    { applicationId: "a2", outcome: "rejected" },
  ],
  ...over,
});

test("a reply the lead confirmed exactly as read agrees", () => {
  const verdict = compareReply(reply());
  assert.deepEqual(verdict, { id: "r1", receivedAt: 1_000, agreed: true, differences: [] });
});

test("a changed outcome, a dropped candidate and an added one are all differences", () => {
  const changed = compareReply(reply({
    confirmed: [{ applicationId: "a1", outcome: "hold" }, { applicationId: "a2", outcome: "rejected" }],
  }));
  assert.equal(changed.agreed, false);
  assert.deepEqual(changed.differences, [{ applicationId: "a1", proposed: "shortlisted", confirmed: "hold" }]);

  const dropped = compareReply(reply({ confirmed: [{ applicationId: "a1", outcome: "shortlisted" }] }));
  assert.deepEqual(dropped.differences, [{ applicationId: "a2", proposed: "rejected", confirmed: "dropped" }]);

  const added = compareReply(reply({
    confirmed: [...reply().confirmed, { applicationId: "a3", outcome: "shortlisted" }],
  }));
  assert.deepEqual(added.differences, [{ applicationId: "a3", proposed: "not proposed", confirmed: "shortlisted" }]);
});

test("only the replies the parser called clear are counted, and the rest are reported beside them", () => {
  const result = compareReplies([
    reply({ id: "same" }),
    reply({ id: "changed", receivedAt: 2_000, confirmed: [{ applicationId: "a1", outcome: "rejected" }, { applicationId: "a2", outcome: "rejected" }] }),
    // A reply that needed a person either way says nothing about auto-apply.
    reply({ id: "unclear", clear: false, confirmed: [{ applicationId: "a1", outcome: "hold" }] }),
  ]);

  assert.equal(result.compared, 2);
  assert.equal(result.agreed, 1);
  assert.equal(result.changed, 1);
  assert.deepEqual(result.clearShare, { clear: 2, unclear: 1 });
  assert.deepEqual(result.disagreements.map((d) => d.id), ["changed"]);
  assert.match(result.summary, /1 of 2 clear replies were confirmed exactly as read \(50%\)/);
});

test("newest disagreement first, so the owner reads the recent ones", () => {
  const changed = (id: string, receivedAt: number) =>
    reply({ id, receivedAt, confirmed: [{ applicationId: "a1", outcome: "hold" }, { applicationId: "a2", outcome: "rejected" }] });
  const result = compareReplies([changed("old", 1_000), changed("new", 9_000), changed("middle", 5_000)]);
  assert.deepEqual(result.disagreements.map((d) => d.id), ["new", "middle", "old"]);
});

test("no confirmed reply yet says so instead of claiming 100%", () => {
  const result = compareReplies([]);
  assert.deepEqual([result.compared, result.agreed, result.changed], [0, 0, 0]);
  assert.match(result.summary, /nothing to compare/);
});
