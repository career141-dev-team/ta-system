// node src/app/today/checks.check.ts
import assert from "node:assert/strict";
import { checksFor, leftBeforeEod, progress } from "./checks.ts";

const full = checksFor("100%", ["jd_review"]);
assert.equal(full.length, 8);
assert.ok(full.find((c) => c.key === "director_cv")!.done, "director_cv is always complete");

const fu = checksFor("Follow-up", []);
assert.deepEqual(fu.map((c) => c.key), ["director_cv", "chatgpt", "daily_email"]);
assert.deepEqual(leftBeforeEod(fu).map((c) => c.key), ["chatgpt"], "the EOD itself never blocks the EOD");

const excused = fu.map((c) => (c.key === "chatgpt" ? { ...c, excuse: "no research today" } : c));
assert.equal(leftBeforeEod(excused).length, 0, "an excuse settles a check");
assert.equal(Math.round(progress(excused) * 3), 2);
console.log("checks ok");
