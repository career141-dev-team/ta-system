// Run: node src/app/today/plan.check.ts - fails loudly if the day plan breaks.
import assert from "node:assert/strict";
import { aboutTheDay, planDay, timeIn, type DayPosition } from "./plan.ts";

const sap: DayPosition = { id: "sap", title: "SAP Transformation", client: "PGP Glass", type: "100%" };
const fin: DayPosition = { id: "fin", title: "Finance Manager", client: "Hayleys", type: "Follow-up" };

// The owner's design, step for step.
const p = planDay([sap, fin], "I have an interview at 2:30 — keep the afternoon light.");
assert.equal(p.headline, "Here’s your day. You’ll close today’s SAP set by lunch.");
assert.deepEqual(
  p.steps.map((s) => [s.at, s.what, s.where ?? ""]),
  [
    ["9:00", "Review 6 headhunting suggestions", "SAP"],
    ["10:30", "Chase 2 candidates for salary and notice", "SAP"],
    ["12:00", "Send Nimali to Director Review", "Finance"],
    ["2:30", "Interview — Dilini Perera", "PGP"],
    ["5:00", "Check AURA’s EOD drafts and send", ""],
  ],
);
assert.equal(p.first, "SAP");

assert.equal(timeIn("interview at 2:30"), 14 * 60 + 30);
assert.equal(timeIn("call at 10am"), 10 * 60);
assert.equal(timeIn("meeting 3pm"), 15 * 60);
assert.equal(timeIn("review 6 suggestions"), null);
assert.equal(timeIn("interview at 2:30 — keep it light. move the interview to 3:00"), 15 * 60);
assert.equal(timeIn("call at 4"), 16 * 60);
const moved = planDay([sap, fin], "I have an interview at 2:30 — keep the afternoon light. Move the interview to 3:00");
assert.equal(moved.steps.find((st) => st.what.startsWith("Interview"))?.at, "3:00");
assert.equal(aboutTheDay("What’s late?"), false);
assert.equal(aboutTheDay("keep the afternoon light"), true);
assert.equal(planDay([], "plan my day").steps.length, 0);
// Strategies due today come first on their position and the headline says so.
const withS = planDay([{ ...sap, todo: ["LinkedIn search", "Direct headhunt"] }, fin], "plan my day");
assert.deepEqual(withS.steps.slice(0, 2).map((st) => st.what), ["LinkedIn search — Rashmi’s strategy", "Direct headhunt — Rashmi’s strategy"]);
assert.match(withS.headline, /Rashmi’s 2 strategies for today are in it\./);
assert.equal(withS.steps.filter((st) => st.tone === "brand").length, 4);
console.log("day plan: ok");
