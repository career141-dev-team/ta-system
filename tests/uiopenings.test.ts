/**
 * The new UI's Openings and Bin on the old server (D9, 20 Nov): create an
 * opening and its client, bin one, the Bin's restore / delete now and the
 * website switch through the old actions with only their own fields, the
 * form and the Bin read as the old pages read them, sign-in first.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { readUiBody } from "../src/lib/uiLinks";
import { OPENING_ACTIONS } from "../src/lib/uiOpenings";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };
const route = fs.readFileSync("src/app/api/ui/openings/route.ts", "utf8");

ok("a button carries only its old form's fields; the team may be a list", () => {
  const r = readUiBody(OPENING_ACTIONS, { do: "create", clientId: "c", title: "SAP Lead", assignedTaIds: ["a", "b"] });
  assert.ok(r.ok && r.fields.filter(([k]) => k === "assignedTaIds").length === 2);
  assert.equal(readUiBody(OPENING_ACTIONS, { do: "create", title: "x", priority: "1" }).ok, false);
  assert.equal(readUiBody(OPENING_ACTIONS, { do: "bin", openingId: ["a", "b"] }).ok, false);
  assert.equal(readUiBody(OPENING_ACTIONS, { do: "drop", id: "x" }).ok, false);
});
ok("every button runs the old action", () => {
  for (const fn of ["createOpeningInline(form)", "createClientInline(form)", "setOpeningOnWebsite(form)", "deleteOpening", "restoreFromBin", "deleteFromBinNow"]) assert.ok(route.includes(fn), fn);
});
ok("reads are the old pages': the Bin kept from clients and viewers, the form needs opening.create", () => {
  assert.ok(route.includes('isReadOnly(user) || user.role === "client"') && route.includes("mayPurge: isDeskWide(user)"));
  assert.ok(route.includes('can(user, "opening.create")') && route.includes("assignableTas(repo.users())"));
  const get = route.slice(route.indexOf("export async function GET"));
  assert.ok(get.indexOf("currentUser()") < get.indexOf("primeStore("));
  assert.ok(route.includes('authorization")?.startsWith("Bearer ")') && route.includes("uiCors("));
});

console.log(`\n${n} passed, 0 failed`);
