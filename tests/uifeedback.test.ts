/**
 * The new UI's Feedback on the old server (R2, 20 Nov): the one map between the
 * old desk's statuses/categories and the new board's columns/kinds, and the route
 * running only the old actions, sign-in first.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { ADMIN_STATUS, CATEGORY_OF, LEAD_DECISION, agoOf, columnOf, itemOf, priorityOf } from "../src/lib/uiFeedback";
import type { FeedbackItem } from "../src/data/types";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };
const route = fs.readFileSync("src/app/api/ui/feedback/route.ts", "utf8");

ok("every old status lands in one column", () => {
  assert.deepEqual(columnOf("pending_lead", false), { column: "new" });
  assert.deepEqual(columnOf("pending_lead", true), { column: "review" });
  assert.deepEqual(columnOf("approved_for_admin", false), { column: "builders" });
  assert.deepEqual(columnOf("in_progress", true), { column: "builders" });
  assert.deepEqual(columnOf("resolved", true), { column: "done", outcome: "fixed" });
  assert.deepEqual(columnOf("resolved_by_lead", true), { column: "done", outcome: "answered" });
  assert.deepEqual(columnOf("declined_by_lead", true), { column: "done", outcome: "declined" });
  assert.deepEqual(columnOf("declined_by_admin", true), { column: "done", outcome: "declined" });
});
ok("kinds and buttons map to the old words", () => {
  assert.deepEqual(CATEGORY_OF, { broke: "bug", idea: "feature_request", question: "other" });
  assert.equal(priorityOf(true), "urgent");
  assert.equal(priorityOf(false), "medium");
  assert.deepEqual(LEAD_DECISION, { builders: "approved_for_admin", answered: "resolved_by_lead", declined: "declined_by_lead" });
  assert.deepEqual(ADMIN_STATUS, { working: "in_progress", fixed: "resolved", declined: "declined_by_admin" });
});
ok("a card carries the old row's words and the answer given", () => {
  const f: FeedbackItem = {
    id: "f1", submittedBy: "u1", submittedByName: "Asha Perera", submittedByRole: "ta", createdAt: 0,
    category: "ui_issue", priority: "high", title: "T", description: "D", status: "resolved_by_lead", leadNotes: "Use the Bin.",
  };
  const c = itemOf(f, true, 3 * 3600_000);
  assert.equal(c.kind, "broke");
  assert.equal(c.by, "Asha");
  assert.equal(c.blocks, true);
  assert.equal(c.answer, "Use the Bin.");
  assert.equal(c.ago, "3 h");
  assert.equal(itemOf({ ...f, status: "pending_lead" }, false).answer, undefined);
  assert.equal(agoOf(0, 2 * 86_400_000), "2 days");
});
ok("only the old actions; files through the old routes; sign-in first", () => {
  for (const a of ["submitFeedbackAction", "leadReviewFeedbackAction", "adminUpdateFeedbackAction", "markFeedbacksReadAction", "deleteFeedbacksAction", "uploadFeedbackScreenshotAction", "repo.feedbacks(user)"]) assert.ok(route.includes(a), a);
  const get = route.slice(route.indexOf("export async function GET"));
  assert.ok(get.indexOf("currentUser()") < get.indexOf("primeStore("));
  assert.ok(route.includes('authorization")?.startsWith("Bearer ")') && route.includes("uiCors("));
});

console.log(`\n${n} passed, 0 failed`);
