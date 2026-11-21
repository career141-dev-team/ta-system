/**
 * The new UI's TA Support Excel desk (R4, 21 Nov): old /support-tables rows in the
 * new screen's words, and the route reading only the old page's reads, sign-in first.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { INTEREST_WORD, supportRow } from "../src/lib/uiSupport";
import type { LinkVaultEntry } from "../src/data/types";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };
const route = fs.readFileSync("src/app/api/ui/support-tables/route.ts", "utf8");
const now = Date.parse("2026-11-21T10:00:00+05:30");
const base = {
  id: "r1", openingId: "o1", addedBy: "u1", linkedinUrl: "https://www.linkedin.com/in/asha", name: "Asha Perera", title: "Engineer", company: "MAS",
  level: 2, isEyeMarked: true, isAddOn: false, phoneNumber: "0771234567", outcome: "pending", conversationLog: [], createdAt: now - 3600_000,
  taNotes: [{ id: "n1", by: "u1", at: now - 7200_000, note: "old" }], leadNotes: [{ id: "n2", by: "u2", at: now - 60_000, note: "Call at 4" }],
} as unknown as LinkVaultEntry;
const names = (id: string) => ({ u1: "Asha", u2: "Lead" } as Record<string, string>)[id] ?? "Unavailable user";

ok("interest words match the new Excel Tables", () => {
  assert.deepEqual(INTEREST_WORD, { pending: "To approach", interested: "Interested", not_interested: "Not interested" });
});
ok("a row carries its sheet, marks, phone and the newest note", () => {
  const r = supportRow(base, "interested", names, { sheetName: "Colombo", takenBy: "u2" }, now);
  assert.equal(r.ta, "Asha");
  assert.equal(r.sheet, 2);
  assert.equal(r.sheetName, "Colombo");
  assert.equal(r.eye, true);
  assert.equal(r.phone, "0771234567");
  assert.equal(r.interest, "Interested");
  assert.equal(r.takenBy, "Lead");
  assert.equal(r.note, "Call at 4");
  assert.equal(r.today, true);
  assert.equal(r.linkedin, "https://www.linkedin.com/in/asha");
});
ok("no sheet, no link, no phone read as empty", () => {
  const r = supportRow({ ...base, level: 0, linkedinUrl: "javascript:alert(1)", phoneNumber: null, taNotes: [], leadNotes: [] } as LinkVaultEntry, "pending", names, {}, now);
  assert.equal(r.sheet, null);
  assert.equal(r.linkedin, undefined);
  assert.equal(r.phone, undefined);
  assert.equal(r.note, undefined);
});
ok("route: only the old reads, read only, sign-in first", () => {
  for (const a of ["supportTableRows(user", "supportSheetCounts(user", "ta/supportViews:eod", 'allows(user, "tables.readAll")']) assert.ok(route.includes(a), a);
  assert.ok(!/export async function POST/.test(route));
  assert.ok(route.indexOf("currentUser()") < route.indexOf("primeStore("));
});

console.log(`\n${n} passed, 0 failed`);
