// Run: node src/app/strategy/plan/talk.check.ts - fails loudly if AURA misreads a plan line.
import assert from "node:assert/strict";
import { readPlan } from "./talk.ts";

const NAMES = ["LinkedIn search", "L search extraction", "LinkedIn post", "Direct headhunt", "Referral extraction", "Recruiter search & post", "Aura", "Shortlist – company"];
const TAS: [string, string][] = [["DR", "Dilini"], ["CS", "Chathura"]];
const read = (s: string) => readPlan(s, NAMES, TAS, 1);

assert.deepEqual(read("Put Dilini on direct headhunt and referral extraction tomorrow"), {
  picks: [{ name: "Direct headhunt", ta: "DR" }, { name: "Referral extraction", ta: "DR" }],
  day: 2,
  off: false,
  tas: ["DR"],
});
// Each strategy goes to the TA named before it.
assert.deepEqual(read("Dilini on LinkedIn search, Chathura on LinkedIn post on Friday").picks, [
  { name: "LinkedIn search", ta: "DR" },
  { name: "LinkedIn post", ta: "CS" },
]);
assert.equal(read("Dilini on LinkedIn search, Chathura on LinkedIn post on Friday").day, 4);
// A TA named after the strategy still takes it; "&" and "–" are read as words.
assert.deepEqual(read("recruiter search and post for Chathura").picks, [{ name: "Recruiter search & post", ta: "CS" }]);
assert.deepEqual(read("shortlist company today").picks, [{ name: "Shortlist – company", ta: undefined }]);
assert.equal(read("shortlist company today").day, 1);
// Talking to AURA is not the Aura strategy; "off" takes things off.
assert.deepEqual(read("AURA, switch off LinkedIn search"), { picks: [{ name: "LinkedIn search", ta: undefined }], day: undefined, off: true, tas: [] });
assert.deepEqual(read("Put Dilini on Aura").picks, [{ name: "Aura", ta: "DR" }]);
// Nothing it knows.
assert.deepEqual(read("make it faster please"), { picks: [], day: undefined, off: false, tas: [] });
console.log("talk ok");
