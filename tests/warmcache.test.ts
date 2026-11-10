/**
 * The desk stays warm (9 Nov): a reload is never thrown away, a request does
 * not wait for rows it holds, a save copies only the tables it touched, and
 * the one unbounded table is read per opening.
 *
 *   src/data/warm.ts        - overlay, ranges, wait-or-refresh
 *   src/data/unitOfWork.ts  - touched-table snapshot and recorder
 *   src/data/prime.ts       - no StaleRead, pipelineEvents scoped
 *   convex/ta/tables.ts     - eventsFor, pipelineEvents not whole
 */
import fs from "node:fs";
import path from "node:path";
import { mustWait, overlayWrites, rememberWrites, splitRanges, RECENT_WRITES_MS, type RecentWrite } from "../src/data/warm";
import { diffTables, recordingTables, renameIds, restoreTables, snapshotTables, type Tables } from "../src/data/unitOfWork";
import type { Database } from "../src/data/types";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

console.log("\noverlay: this process's saves during a fetch are kept");
const fetched = [{ id: "a", stage: "new_cvs" }, { id: "b", stage: "new_cvs" }, { id: "c", stage: "new_cvs" }];
const liveB = { id: "b", stage: "ta_follow_up" };
const liveNew = { id: "op_tmp1", stage: "new_cvs" };
const writes: RecentWrite[] = [
  { table: "applications", kind: "update", key: "b", after: liveB, at: 1_000 },
  { table: "applications", kind: "delete", key: "c", at: 1_000 },
  { table: "applications", kind: "insert", key: "op_tmp1", after: liveNew, at: 1_000 },
  { table: "candidates", kind: "update", key: "a", after: { id: "a", name: "x" }, at: 1_000 },
  { table: "applications", kind: "update", key: "a", after: { id: "a", stage: "old" }, at: 500 },
];
// The database renamed the insert; the live object carries the real id, the op key does not.
liveNew.id = "d";
const out = overlayWrites("applications", fetched, writes, 900);
eq("an updated row takes the saved version", out.find((r) => r.id === "b")?.stage, "ta_follow_up");
eq("a deleted row is gone", out.some((r) => r.id === "c"), false);
eq("an inserted row is there under its real id", out.some((r) => r.id === "d"), true);
eq("a save from before the fetch is not re-applied", out.find((r) => r.id === "a")?.stage, "new_cvs");
eq("another table's saves are ignored", out.length, 3);
eq("nothing to overlay returns the rows as fetched", overlayWrites("applications", fetched, [], 0), fetched);
const scoped = overlayWrites("applications", [{ id: "x", openingId: "o1" }], [
  { table: "applications", kind: "insert", key: "y", after: { id: "y", openingId: "o2" }, at: 5 },
  { table: "applications", kind: "insert", key: "z", after: { id: "z", openingId: "o1" }, at: 5 },
], 0, (r) => r.openingId === "o1");
eq("a scoped overlay keeps only this opening's inserts", scoped.map((r) => r.id).sort(), ["x", "z"]);
const settings = overlayWrites("settings", [{ key: "a", value: 1 }], [{ table: "settings", kind: "update", key: "a", after: { key: "a", value: 2 }, at: 5 }], 0);
eq("a table keyed by key, not id, overlays by its key", settings, [{ key: "a", value: 2 }]);

console.log("\nremembering writes");
const kept = rememberWrites([{ table: "t", kind: "insert", key: "old", at: 0 }], [{ table: "t", kind: "delete", key: "k" }], RECENT_WRITES_MS + 1);
eq("old writes are forgotten, new ones kept", kept.map((w) => w.key), ["k"]);

console.log("\nranges");
eq("six ranges cover the span without gaps", splitRanges(0, 59, 6), [[0, 10], [10, 20], [20, 30], [30, 40], [40, 50], [50, 60]]);
eq("the last range includes the newest row", splitRanges(100, 100, 3), [[100, 101]]);
eq("an empty table has no ranges", splitRanges(NaN, NaN, 6), []);
const r = splitRanges(1_700_000_000_000, 1_762_000_000_000, 6);
eq("ranges are contiguous", r.every((x, i) => i === 0 || x[0] === r[i - 1][1]), true);

console.log("\nwait or refresh");
eq("never loaded waits", mustWait(undefined, 30_000, 100_000), "wait");
eq("marked stale waits (read your own write)", mustWait(0, 30_000, 100_000), "wait");
eq("older than the lifetime refreshes in the background", mustWait(50_000, 30_000, 100_000), "refresh");
eq("within the lifetime is fresh", mustWait(90_000, 30_000, 100_000), "fresh");

console.log("\na save copies only what it touched");
const db = {
  users: [{ id: "u1" }],
  applications: [{ id: "a1", stage: "new_cvs" }],
  candidates: Array.from({ length: 5 }, (_, i) => ({ id: `c${i}` })),
  pipelineEvents: [],
  liveMirror: [{ id: "m" }],
} as unknown as Database;
const before: Tables = {};
const rec = recordingTables(db, before);
(rec as unknown as { applications: { id: string; stage: string }[] }).applications[0].stage = "ta_follow_up";
(rec as unknown as { pipelineEvents: { id: string }[] }).pipelineEvents.push({ id: "op_e1" });
eq("only the tables read or written were copied", Object.keys(before).sort(), ["applications", "pipelineEvents"]);
eq("the copy predates the change", before.applications[0].stage, "new_cvs");
const ops = diffTables(before, db);
eq("the diff sees the update and the insert and nothing else", ops.map((o) => `${o.kind}:${o.table}`).sort(), ["insert:pipelineEvents", "update:applications"]);
renameIds(db, { op_e1: "e1" }, Object.keys(before));
eq("renaming walks the touched tables", (db.pipelineEvents as unknown as { id: string }[])[0].id, "e1");
restoreTables(db, before);
eq("a refused save puts back only what it touched", [(db.applications as unknown as { stage: string }[])[0].stage, db.pipelineEvents.length, db.candidates.length], ["new_cvs", 0, 5]);
eq("snapshotTables honours a subset", Object.keys(snapshotTables(db, ["users"])), ["users"]);
eq("liveMirror is never copied", "liveMirror" in snapshotTables(db), false);

console.log("\nthe loader");
const prime = read("src/data/prime.ts");
eq("no reload is thrown away any more", prime.includes("StaleRead"), false);
eq("a fetch is overlaid with this process's saves", (prime.match(/overlay\(/g) ?? []).length >= 6, true);
eq("pipelineEvents is not loaded whole", /WHOLE_TABLES = \[[^\]]*pipelineEvents/.test(prime), false);
eq("the opening's events are read with the opening", prime.includes("backend.eventsFor(actor, openingId)"), true);
eq("a request renders from held rows and refreshes behind", prime.includes('if (need === "refresh") refreshInBackground(scope);'), true);
eq("a stale mark still makes the next request wait", prime.includes('if (need === "wait") return queue(scope);'), true);
eq("the version bumps only when rows changed", prime.includes("if (changed) state.version++;"), true);
eq("the whole tables load together, not three at a time", prime.includes("Promise.all(WHOLE_TABLES.map("), true);

const tables = read("convex/ta/tables.ts");
const whole = tables.slice(tables.indexOf("const WHOLE"), tables.indexOf("]);", tables.indexOf("const WHOLE")));
eq("the backend refuses pipelineEvents whole", whole.includes("pipelineEvents"), false);
eq("the backend reads events by opening and time", tables.includes('withIndex("by_job_time", (q) => q.eq("jobId", jobId))'), true);

const apps = read("convex/ta/applications.ts");
eq("applications are read in creation-time ranges", apps.includes("export const listRange") && apps.includes("export const creationBounds"), true);
const backend = read("src/data/convex/backend.ts");
eq("the app reads the ranges in parallel", backend.includes("ranges.map(async ([from, to])") && backend.includes("Promise.all("), true);

const store = read("src/data/store.ts");
eq("the store records what a commit wrote", store.includes("recordWrites(ops);"), true);
eq("a history read on an unprimed opening is a loud error", store.includes("missingEventsMessage(openingId)"), true);
for (const route of ["src/app/api/hh/upload/route.ts", "src/app/api/scoops/upload/route.ts"]) {
  const t = read(route);
  const get = t.slice(t.indexOf("export async function GET"));
  eq(`${route}: the poll invalidates one opening, not the desk`, get.includes("invalidateOpening(openingId)") && !/resetStore\(\)/.test(get.slice(0, get.indexOf("return answer"))), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
