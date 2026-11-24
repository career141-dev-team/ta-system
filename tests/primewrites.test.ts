/**
 * Saves and the working set (the desk, 29 Sep: "I delete something and it is
 * not gone until I refresh"; 9 Nov: a save during a reload must not discard
 * the reload). A store commit is kept in `recentWrites` so a reload in flight
 * can lay it on top of what it fetched; a write made outside the store
 * (resetStore) marks every clock stale so the next request reads again. A
 * load alone is neither.
 */
import { state, bumpPrimed, resetStore, recordWrites, invalidateOpening, markTablesStale, staleOpening } from "@/data/primeState";
import { settleOpenings } from "@/data/warm";
import fs from "node:fs";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

const w0 = state.writes;
bumpPrimed();
eq("a store commit counts as a save", state.writes, w0 + 1);
recordWrites([{ table: "applications", kind: "update", key: "a", after: { id: "a" }, changed: ["stage"] }], 5_000);
eq("and what it wrote is remembered for a reload in flight", state.recentWrites.map((w) => [w.table, w.kind, w.key, w.at]), [["applications", "update", "a", 5_000]]);

state.tablesAt = 10;
state.slowAt = 10;
state.allAt = 10;
state.openings.set("o1", 10);
state.events.set("o1", 10);
state.candidates.set("c1", 10);
const beforeReset = Date.now();
resetStore();
eq("a backend write (resetStore) counts as a save", state.writes, w0 + 2);
eq("and leaves every table due for a fresh read, the slow ones too", [state.tablesAt, state.slowAt, state.allAt, state.openings.size, state.events.size, state.candidates.size], [0, 0, 0, 0, 0, 0]);
eq("and marks when, so a fetch that began earlier is not trusted as fresh", state.staleAt >= beforeReset, true);

state.openings.set("o2", 10);
state.events.set("o2", 10);
state.openings.set("o3", 10);
invalidateOpening("o2");
eq("invalidating one opening forgets its applications and its history only", [state.openings.has("o2"), state.events.has("o2"), state.openings.has("o3")], [false, false, true]);

state.tablesAt = 10;
state.slowAt = 10;
markTablesStale();
eq("a direct write to the tables marks them stale, with the time", [state.tablesAt, state.slowAt, state.staleAt >= beforeReset], [0, 0, true]);

// 23 Nov: a save to one opening re-reads that opening, not the desk.
state.tablesAt = 10; state.slowAt = 10; state.allAt = 10; state.staleAt = 0;
state.openings.set("o4", 10); state.events.set("o4", 10); state.openings.set("o5", 10);
state.candidates.set("c4", 10); state.candidates.set("c5", 10);
state.dirtyOpenings.clear();
const w2 = state.writes;
const beforeStale = Date.now();
staleOpening("o4", ["c4"]);
eq("staleOpening counts as a save", state.writes, w2 + 1);
eq("and re-reads the small tables and that opening, keeping the slow tables and every application",
  [state.tablesAt, state.slowAt, state.allAt, state.openings.has("o4"), state.events.has("o4"), state.openings.has("o5")], [0, 10, 10, false, false, true]);
eq("and only the named people", [state.candidates.has("c4"), state.candidates.has("c5")], [false, true]);
eq("and marks the opening dirty for pages that hold every application", state.dirtyOpenings.has("o4"), true);
eq("without the whole-desk stale mark, so a reload of every application in flight still counts", state.staleAt, 0);
eq("but with a small-tables mark, so a small-table read in flight does not", state.tablesStaleAt >= beforeStale, true);

const dirty = new Map([["a", 100], ["b", 300]]);
settleOpenings(dirty, 200);
eq("a fetch settles openings marked before it began, not after", [...dirty.keys()], ["b"]);
settleOpenings(dirty, 400, ["x"]);
eq("and only the openings it read", [...dirty.keys()], ["b"]);


// The paths a desk uses most re-read one opening, not everything (23 Nov).
const src = (p: string) => fs.readFileSync(p, "utf8");
eq("a stage move marks its opening", /deps\.staleOpening\(openingId\)/.test(src("src/lib/openings/pipelineWrites.ts")) && !/resetStore\(\)/.test(src("src/lib/openings/pipelineWrites.ts")), true);
eq("a follow-up marks its opening", /deps\.staleOpening\(openingId\)/.test(src("src/lib/candidates/followUpWrites.ts")) && !/resetStore\(\)/.test(src("src/lib/candidates/followUpWrites.ts")), true);
eq("a CV upload marks its opening and person", src("src/app/api/cv/upload/route.ts").includes("staleOpening(app.openingId, [app.candidateId])"), true);
eq("a page holding every application waits for dirty openings", src("src/data/prime.ts").includes('if (state.dirtyOpenings.size > 0) worse("wait")'), true);

const w1 = state.writes;
state.version++; // what a finished load does
eq("a load finishing is not a save", state.writes, w1);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
