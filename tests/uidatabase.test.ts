/**
 * The new UI's Database chat on the old server (Part 3 of Ask AURA, 20 Nov):
 * what the browser may send, how one person is shown, and that the route runs
 * the old search's engine and desk rules after sign-in and database.read.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import type { Candidate } from "../src/data/types";
import { MAX_TURNS, personOf, readSearchBody } from "../src/lib/uiDatabase";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };
const route = fs.readFileSync("src/app/api/ui/database/route.ts", "utf8");
const searches = fs.readFileSync("convex/ui/searches.ts", "utf8");
const myDay = fs.readFileSync("convex/ui/myDay.ts", "utf8");

ok("the body: words needed, the last 12 messages, two modes only", () => {
  assert.equal(readSearchBody({}).ok, false);
  assert.equal(readSearchBody({ q: "  \n " }).ok, false);
  assert.equal(readSearchBody({ q: "x", mode: "meaning" }).ok, false);
  assert.equal(readSearchBody({ q: "x".repeat(2001) }).ok, false);
  const many = readSearchBody({ q: Array.from({ length: 20 }, (_, i) => `turn ${i}`).join("\n") });
  assert.ok(many.ok && many.body.q.split("\n").length === MAX_TURNS && many.body.q.endsWith("turn 19"));
  const b = readSearchBody({ q: "SAP consultants\n\nin Colombo", mode: "boolean", full: true });
  assert.deepEqual(b, { ok: true, body: { q: "SAP consultants\nin Colombo", mode: "boolean", full: true } });
  assert.equal((readSearchBody({ q: "x", full: "yes" }) as { body: { full: boolean } }).body.full, false);
});

ok("one person: their CV counts only when the file is there", () => {
  const c = { id: "c1", fullName: "Nimal Perera", currentTitle: "Accountant", currentEmployer: "Hayleys", location: "Colombo", totalExperienceYears: 6, noticePeriodDays: 0, cvFileName: "a.pdf" } as Candidate;
  const p = personOf(c, 81.6, "Six years in audit");
  assert.deepEqual(p, { id: "c1", name: "Nimal Perera", title: "Accountant", company: "Hayleys", city: "Colombo", years: 6, notice: "Immediate", score: 82, why: "Six years in audit", hasCv: true });
  assert.equal(personOf({ ...c, cvFileMissing: true }, null, "").hasCv, false);
  assert.equal(personOf({ ...c, noticePeriodDays: 30, noticePeriod: null }, null, "").notice, "30 days");
});

ok("the route: sign-in and database.read first, the old engine and desk rules", () => {
  const post = route.slice(route.indexOf("export async function POST"));
  assert.ok(post.indexOf("currentUser()") < post.indexOf('can(user, "database.read")'));
  assert.ok(post.indexOf('can(user, "database.read")') < post.indexOf("primeStore("));
  assert.ok(route.includes("cachedEngineSearch(") && route.includes("quickEngineSearch(") && route.includes("deskCriteria(criteria)"));
  assert.ok(route.includes("keywordRetrieve(booleanTerms(q), 1200)"), "boolean reads every CV holding its words, as the old page");
  assert.ok(route.includes("uiCors(") && !/insert|repo\.(save|add|update)/.test(route), "read only");
});

ok("searches: own rows only, and today's count in my day", () => {
  assert.equal((searches.match(/await who\(ctx\)/g) ?? []).length, 4); // record, remove, recent, turns
  assert.ok(searches.includes('q.eq("userId", w.user._id)'));
  assert.ok(myDay.includes('withIndex("by_user", (q) => q.eq("userId", me).gte("_creationTime", dayStart))'));
  assert.ok(myDay.includes("searchesToday: searches.length"));
});

console.log(`\n${n} passed, 0 failed`);
