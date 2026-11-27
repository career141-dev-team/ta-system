/**
 * R7 small fixes (21 Nov): the new UI's Excel add answers before the CV check (the
 * old page is unchanged), and the desk is warmed once at server start.
 */
import assert from "node:assert/strict";
import fs from "node:fs";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };
const actions = fs.readFileSync("src/app/actions.ts", "utf8");
const links = fs.readFileSync("src/app/api/ui/links/route.ts", "utf8");
const boot = fs.readFileSync("src/instrumentation.ts", "utf8");

ok("add: the CV check waits only when the new UI did not ask for it later", () => {
  const add = actions.slice(actions.indexOf("export async function addLink"), actions.indexOf("export async function extractLinkProfile"));
  assert.ok(add.includes('formData.get("matchLater") === "1"'));
  assert.ok(add.includes("later ? null : await matchLink(id, user.id)"));
  assert.ok(add.includes("after(() => matchLink(id, user.id)"));
});
ok("only the new UI's door asks for it, and only on add", () => {
  assert.ok(links.includes('if (read.action === "add") form.set("matchLater", "1");'));
});
ok("the desk warms at start, in the background, production node only", () => {
  assert.ok(boot.includes("export async function register()"));
  assert.ok(boot.includes('if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production")'));
  assert.ok(boot.includes("setTimeout(") && boot.includes("primeStore({})"));
});

console.log(`\n${n} passed, 0 failed`);
