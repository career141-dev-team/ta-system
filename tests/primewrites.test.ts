/**
 * Saves and the working set (the desk, 29 Sep: "I delete something and it is
 * not gone until I refresh"; 9 Nov: a save during a reload must not discard
 * the reload). A store commit is kept in `recentWrites` so a reload in flight
 * can lay it on top of what it fetched; a write made outside the store
 * (resetStore) marks every clock stale so the next request reads again. A
 * load alone is neither.
 */
import { state, bumpPrimed, resetStore, recordWrites, invalidateOpening, markTablesStale } from "@/data/primeState";

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

const w1 = state.writes;
state.version++; // what a finished load does
eq("a load finishing is not a save", state.writes, w1);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
