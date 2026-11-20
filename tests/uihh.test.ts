/**
 * The new UI's Headhunting tabs on the old server (D8b, 20 Nov): the three old
 * pages' reads, every button through the old action with only its own fields,
 * a sourcing seat before anything is read, sign-in first.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { HH_ACTIONS, hhCounts } from "../src/lib/uiHh";
import { readUiBody } from "../src/lib/uiLinks";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };
const route = fs.readFileSync("src/app/api/ui/hh/route.ts", "utf8");

ok("a button carries only its old form's fields", () => {
  const r = readUiBody(HH_ACTIONS, { do: "keep", openingId: "o", suggestionId: "s" });
  assert.ok(r.ok && r.action === "keep" && r.fields.length === 2);
  assert.equal(readUiBody(HH_ACTIONS, { do: "keep", openingId: "o", suggestionId: "s", keptBy: "x" }).ok, false);
  assert.equal(readUiBody(HH_ACTIONS, { do: "keep", suggestionId: "s" }).ok, false);
  assert.equal(readUiBody(HH_ACTIONS, { do: "toString", openingId: "o" }).ok, false);
});
ok("every button runs an old action", () => {
  for (const fn of ["runResearch", "runBenchmark", "pickBenchmark", "correctClientAndRerun", "editResearchField", "runSuggestions", "keepSuggestion", "dismissSuggestion", "chooseCv", "sendChatMessage", "findCv({ openingId: raw.openingId, suggestionId: raw.suggestionId })"]) assert.ok(route.includes(fn), fn);
  for (const k of Object.keys(HH_ACTIONS)) assert.ok(route.includes(` ${k}: `) || route.includes(` ${k},`), k);
});
ok("overview counts as the old page", () => {
  const c = hhCounts([{ outcome: "no_contact" }, { outcome: "cv_received", isEyeMarked: true }, { outcome: "shortlisted" }, { outcome: "declined", isEyeMarked: true }]);
  assert.deepEqual(c, { links: 4, approached: 3, notApproached: 1, reached: 2, eye: 2, eyeReached: 1 });
});
ok("reads are the old pages': seat, scope, safe sources", () => {
  assert.ok(route.includes('can(user, "opening.sourcing"') && route.includes("scopeSuggestions(repo.suggestions(openingId), user)"));
  assert.ok(route.includes("!adultHit(s)"));
  const get = route.slice(route.indexOf("export async function GET"));
  assert.ok(get.indexOf("currentUser()") < get.indexOf("primeStore(") && get.indexOf("seat.ok") < get.indexOf("repo.research("));
  assert.ok(route.includes('authorization")?.startsWith("Bearer ")') && route.includes("uiCors("));
});

console.log(`\n${n} passed, 0 failed`);
