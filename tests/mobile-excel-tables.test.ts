/** The phone Excel Tables payload keeps the website's row ownership wall. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "c141-mobile-excel-tables-"));
process.chdir(tmp);
const { repo } = await import("@/data/store");
const { mobileExcelTables } = await import("@/lib/mobile/excelTables");

test("an assigned recruiter receives their cards, sheet counts and actions", () => {
  repo.reset();
  const ta = repo.users().find((user) => user.role === "ta" && user.isActive)!;
  const opening = repo.openingsForUser(ta)[0]!;
  const id = repo.addLink(opening.id, "https://www.linkedin.com/in/mobile-table-person", ta.id, "Mobile Table Person");
  repo.updateLink(id, { company: "Ceylon Consumer PLC", title: "Senior Accountant", phoneNumber: "+94 77 111 2233" });
  const payload = mobileExcelTables(ta, opening.id);
  assert(payload);
  assert.equal(payload.context.openingId, opening.id);
  assert(payload.rows.some((row) => row.id === id && row.company === "Ceylon Consumer PLC"));
  assert.equal(payload.counts.all, payload.rows.length);
  assert(payload.sheets.some((sheet) => sheet.count > 0));
  assert.equal(payload.permissions.canAdd, true);
});

test("another recruiter's row stays outside a TA's phone payload", () => {
  repo.reset();
  const tas = repo.users().filter((user) => user.role === "ta" && user.isActive);
  const ta = tas[0]!;
  const other = tas[1];
  if (!other) return;
  const opening = repo.openingsForUser(ta)[0]!;
  const id = repo.addLink(opening.id, "https://www.linkedin.com/in/other-recruiter-private-row", other.id, "Other Recruiter Row");
  const payload = mobileExcelTables(ta, opening.id);
  assert(payload);
  assert.equal(payload.rows.some((row) => row.id === id), false);
});

test("a client seat cannot read Excel Tables", () => {
  repo.reset();
  const client = { id: "u_excel_client", name: "Client", email: "client@example.test", phone: null, routingEmail: null, role: "client" as const, initials: "CL", isActive: true };
  assert.equal(mobileExcelTables(client, repo.openings()[0]!.id), null);
});
