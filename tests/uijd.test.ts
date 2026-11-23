/**
 * The new UI's JD chat (22 Nov): old AURA's JD page through its own actions -
 * write from the notes, change in words, put a version back - sign-in first.
 */
import assert from "node:assert/strict";
import fs from "node:fs";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };
const route = fs.readFileSync("src/app/api/ui/jd/route.ts", "utf8");

ok("only the old JD actions, through inline()", () => {
  for (const a of ["generateJdWithModel", "reviseJd", "restoreJdVersion", "inline(() => run(form))"]) assert.ok(route.includes(a), a);
});
ok("the chat and the person's own notes from the old store", () => {
  assert.ok(route.includes("repo.jdChat(id)") && route.includes("b.capturedBy === user.id"));
});
ok("write rule is the old page's canWrite", () => {
  assert.ok(route.includes('allows(user, "opening.manage"') && route.includes("o.assignedTaIds.includes(user.id)"));
});
ok("sign-in first; an unknown button refused", () => {
  const get = route.slice(route.indexOf("export async function GET"));
  assert.ok(get.indexOf("currentUser()") < get.indexOf("primeStore("));
  assert.ok(route.includes('authorization")?.startsWith("Bearer ")') && route.includes("That button is not known"));
});

console.log(`\n${n} passed, 0 failed`);
