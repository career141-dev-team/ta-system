/**
 * AURA's day plan, phase 2 (19 Nov 2026): reminders. Each open task gets at most
 * four, each once - start (if not begun), nearly due, overdue, still pending - one at
 * a time, nothing before approval, and a stale wake-up does nothing.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { atOf, colomboMin, dueReminder, momentsOf, nextReminderMin, type RemindTask } from "../convex/ui/planRules";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };
const read = (p: string) => fs.readFileSync(p, "utf8");

// 9:00 for 30 minutes.
const task = (over: Partial<RemindTask> = {}): RemindTask => ({ key: "a", title: "SAP suggestions", startMin: 540, minutes: 30, priority: "normal", state: "planned", ...over });

ok("four moments: start, nearly (80%, 5 min before the end), overdue +5, pending +35", () => {
  assert.deepEqual(momentsOf(task()), [
    { moment: "start", at: 540 }, { moment: "nearly", at: 564 }, { moment: "overdue", at: 575 }, { moment: "pending", at: 605 },
  ]);
});
ok("a task already begun gets no start nudge; a 5-minute task no nearly", () => {
  assert.equal(momentsOf(task({ state: "doing" }))[0].moment, "nearly");
  assert.ok(!momentsOf(task({ minutes: 5 })).some((m) => m.moment === "nearly"));
});
ok("nothing before the start; the start nudge at the start", () => {
  assert.equal(dueReminder([task()], 539), null);
  const d = dueReminder([task()], 540)!;
  assert.equal(d.moment, "start");
  assert.equal(d.text, "Next: SAP suggestions (30 min).");
});
ok("a reminder already sent never repeats", () => {
  assert.equal(dueReminder([task({ reminded: ["start"] })], 545), null);
  assert.equal(dueReminder([task({ reminded: ["start"] })], 564)!.text, "6 minutes left on SAP suggestions.");
});
ok("done, skipped and carried tasks get nothing", () => {
  for (const state of ["done", "skipped", "carried"] as const) {
    assert.equal(dueReminder([task({ state })], 700), null);
    assert.equal(nextReminderMin([task({ state })]), null);
  }
});
ok("coming back late sends only the latest moment and drops the earlier ones", () => {
  const d = dueReminder([task()], 580)!;
  assert.equal(d.moment, "overdue");
  assert.deepEqual(d.also, ["start", "nearly"]);
  assert.equal(d.text, "SAP suggestions ran over. Need more time, or move it?");
});
ok("two due at once: the more urgent wins, then the higher priority", () => {
  const late = task({ key: "late", title: "Late one", startMin: 480 });
  const fresh = task({ key: "fresh", title: "Fresh one", startMin: 540 });
  assert.equal(dueReminder([fresh, late], 540)!.key, "late");
  const hi = task({ key: "hi", priority: "high" });
  assert.equal(dueReminder([task(), hi], 540)!.key, "hi");
});
ok("the next wake-up is the nearest reminder not yet sent", () => {
  assert.equal(nextReminderMin([task(), task({ key: "b", startMin: 600 })]), 540);
  assert.equal(nextReminderMin([task({ reminded: ["start", "nearly"] })]), 575);
  assert.equal(nextReminderMin([task({ reminded: ["start", "nearly", "overdue", "pending"] })]), null);
});
ok("Colombo minutes and back", () => {
  const at = atOf("2026-11-19", 540);
  assert.equal(new Date(at).toISOString(), "2026-11-19T03:30:00.000Z");
  assert.equal(colomboMin(at), 540);
});
ok("the wake-up: stale versions ignored, one reminder to the bell, then re-armed", () => {
  const s = read("convex/ui/planRemind.ts");
  assert.ok(s.includes("plan.version !== version) return"));
  assert.ok(s.includes('type: "aura_reminder"'));
  assert.ok(s.includes('if (plan.state !== "approved") return;'));
  assert.ok(s.includes("now + 60_000"));
});
ok("every plan change re-arms the wake-up", () => {
  const s = read("convex/ui/plan.ts");
  assert.equal(s.match(/await rearm\(ctx, plan\._id\)/g)?.length, 4); // saveDraft, approve, setTask, close
});
ok("the bell knows the new type", () => {
  assert.ok(read("convex/schema.ts").includes('v.literal("aura_reminder")'));
  assert.ok(read("convex/ta/notifications.ts").includes('v.literal("aura_reminder")'));
});

console.log(`\n${n} passed, 0 failed`);
