// Run: node src/app/database/referees.check.ts - fails loudly if Referees mode breaks.
import assert from "node:assert/strict";
import { refereeReply, toCsv, REFEREES } from "./referees.ts";

const a = refereeReply("HR Managers at Dialog", []);
assert.deepEqual(a.chips!.map((c) => c.label), ["HR Manager", "Dialog"]);
assert.deepEqual(a.referees!.map((r) => r.name), ["Shalini Gunawardena"]);
// A refinement keeps the title and swaps the company.
const b = refereeReply("at Hemas", a.chips!);
assert.deepEqual(b.referees!.map((r) => r.name), ["Anjali Wijeratne"]);
// Taking a chip off widens it.
const c = refereeReply("Remove Dialog", a.chips!);
assert.equal(c.referees!.length, 2);
assert.equal(refereeReply("General Managers in retail", []).referees!.length, 2);
assert.ok(refereeReply("hello", []).warn);
assert.match(toCsv([{ ...REFEREES[0], name: "=HYPERLINK()" }]), /"'=HYPERLINK\(\)"/);
console.log("referees: ok");
