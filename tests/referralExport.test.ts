import assert from "node:assert/strict";
import { referralRows, REFERRAL_EXPORT_HEADERS } from "@/lib/referralExport";
import type { ReferralPerson } from "@/lib/referralSearch";

const p = (o: Partial<ReferralPerson>): ReferralPerson => ({
  id: "1", name: "A B", designation: null, company: null, phone: null, email: null, relationship: null,
  at: 0, why: [], namedByCount: 0, namedBy: [], ...o,
});

const rows = referralRows(
  [p({ name: "Nimal Perera", designation: "HR Manager", company: "Dialog", phone: "0771", namedBy: [{ id: "c1", fullName: "X Y", title: "", employer: "" }, { id: "c2", fullName: "Z W", title: "", employer: "" }], at: Date.UTC(2025, 0, 5) }), p({})],
  new Map([["Nimal Perera", "Nimal P. Perera"]]),
);
assert.equal(rows[0].length, REFERRAL_EXPORT_HEADERS.length);
assert.deepEqual(rows[0], ["Nimal Perera", "HR Manager", "Dialog", "0771", "", "", "X Y, Z W", "Nimal P. Perera", "2025-01-05"]);
assert.deepEqual(rows[1], ["A B", "", "", "", "", "", "", "", ""]);
console.log("ok referralExport");
