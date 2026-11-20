/**
 * The new UI's Referee Calls on the old server (D8c, 20 Nov): the old page's
 * reads, the sheet's one Save and the Positive / Not successful choice through
 * the old actions with only their own fields, sign-in first.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { readUiBody } from "../src/lib/uiLinks";
import { REFEREE_ACTIONS } from "../src/lib/uiReferees";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };
const route = fs.readFileSync("src/app/api/ui/referees/route.ts", "utf8");

ok("a button carries only its old form's fields", () => {
  const r = readUiBody(REFEREE_ACTIONS, { do: "save", openingId: "o", day: "2026-11-20", changes: "{}" });
  assert.ok(r.ok && r.action === "save" && r.fields.length === 3);
  assert.equal(readUiBody(REFEREE_ACTIONS, { do: "save", openingId: "o", addedBy: "x" }).ok, false);
  assert.equal(readUiBody(REFEREE_ACTIONS, { do: "delete", openingId: "o" }).ok, false);
});
ok("the two old actions, and result only for the result field", () => {
  assert.ok(route.includes("saveRefereeCalls(form)") && route.includes("updateRefereeCall(form)"));
  assert.ok(route.includes('form.get("field") !== "result"'));
});
ok("reads are the old page's: own calls unless desk-wide, today only to change", () => {
  assert.ok(route.includes("seesEveryone || call.addedBy === user.id"));
  assert.ok(route.includes('canEdit: isTa(user) && workLocationId !== "" && day === today'));
  const get = route.slice(route.indexOf("export async function GET"));
  assert.ok(get.indexOf("currentUser()") < get.indexOf("primeStore("));
  assert.ok(route.includes('authorization")?.startsWith("Bearer ")') && route.includes("uiCors("));
});

console.log(`\n${n} passed, 0 failed`);
