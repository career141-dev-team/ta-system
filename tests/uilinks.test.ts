/**
 * The new UI's Excel Tables on the old server (D8a, 19 Nov): the rows the old
 * table would show, and every button through the old action, with only the old
 * form's own fields, only for new.career141.com, sign-in first.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { INTEREST_WORD, LINK_ACTIONS, readLinkBody, REDIRECTING } from "../src/lib/uiLinks";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };
const route = fs.readFileSync("src/app/api/ui/links/route.ts", "utf8");

ok("a button carries only its old form's fields", () => {
  const r = readLinkBody({ do: "eye", openingId: "o", entryId: "e" });
  assert.ok(r.ok && r.fields.length === 2);
  const bad = readLinkBody({ do: "eye", openingId: "o", entryId: "e", addedBy: "x" });
  assert.ok(!bad.ok && /should not: addedBy/.test(bad.message));
});
ok("the bulk bar's many rows come as a list; other fields never", () => {
  const r = readLinkBody({ do: "toPipelineMany", openingId: "o", entryId: ["a", "b", "c"] });
  assert.ok(r.ok && r.fields.filter(([k]) => k === "entryId").length === 3);
  assert.equal(readLinkBody({ do: "note", openingId: "o", entryId: "e", note: ["a", "b"] }).ok, false);
});
ok("an opening is always named; unknown buttons refused", () => {
  assert.equal(readLinkBody({ do: "remove", entryId: "e" }).ok, false);
  assert.equal(readLinkBody({ do: "dropTable", openingId: "o" }).ok, false);
});
ok("every button runs an old action by name", () => {
  for (const k of Object.keys(LINK_ACTIONS)) assert.ok(route.includes(`${k}:`) || route.includes(` ${k},`) || route.includes(` ${k} }`), k);
  for (const fn of ["addLink", "setLinkInterest", "addLinkToPipeline", "deleteLinkLevel", "toggleEyeMark", "chooseCv"]) assert.ok(route.includes(fn), fn);
  assert.deepEqual([...REDIRECTING].sort(), ["addSheet", "deleteSheet", "restoreSheet"]);
});
ok("rows are the old table's: its scope, interest and read-only rule", () => {
  assert.ok(route.includes("scopeLinks(repo.linkVault(openingId)"));
  assert.ok(route.includes("interestOf(r, app)") && route.includes("rowApplication(r, onPipeline"));
  assert.ok(route.includes("readOnly: seesEveryTaRow(user) && r.addedBy !== user.id && !deskWide.has(r.addedBy)"));
  assert.deepEqual(INTEREST_WORD, { pending: "approach", interested: "yes", not_interested: "no" });
  assert.ok(route.includes("outcome: r.outcome,")); // the edit form sends it back unchanged
});
ok("who is asking comes first; CORS only for the new UI", () => {
  const get = route.slice(route.indexOf("export async function GET"));
  assert.ok(get.indexOf("currentUser()") < get.indexOf("primeStore("));
  assert.ok(route.includes('authorization")?.startsWith("Bearer ")') && route.includes("uiCors("));
});

console.log(`\n${n} passed, 0 failed`);
