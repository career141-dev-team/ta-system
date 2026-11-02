import assert from "node:assert/strict";
import { leadDigestByLead, taReminderText } from "../src/lib/eodReminders";

// One position names it; several count them.
assert.deepEqual(taReminderText(["Head of Planning"]), {
  title: "End of day not sent yet",
  body: "Head of Planning. Your workday completes when the end-of-day email is sent.",
});
assert.equal(taReminderText(["A", "B", "C"]).title, "End of day not sent yet for 3 positions");
assert.equal(taReminderText(["A", "B", "C"]).body.startsWith("A · B · C."), true);

// The lead digest groups by lead and skips rows with no lead to tell.
const digests = leadDigestByLead([
  { taName: "Sameera", title: "Head of Planning", leadId: "lead1" },
  { taName: "Sanduni", title: "Finance Manager", leadId: "lead1" },
  { taName: "Hassan", title: "COO", leadId: "lead2" },
  { taName: "Nobody", title: "Orphan", leadId: null },
]);
assert.equal(digests.size, 2);
assert.deepEqual(digests.get("lead1"), {
  title: "2 end of days still not sent",
  body: "Sameera · Head of Planning; Sanduni · Finance Manager",
});
assert.equal(digests.get("lead2")?.title, "1 end of day still not sent");
assert.equal(leadDigestByLead([]).size, 0);

console.log("EOD reminder wording passed.");
