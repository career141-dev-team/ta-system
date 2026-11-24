/**
 * 23 Nov: three heavy reads made lighter without changing what the app sees.
 * Source-level asserts (the Convex functions need a live deployment to run).
 */
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");
const openings = read("convex/ta/openings.ts");
const candidates = read("convex/ta/candidates.ts");
const crons = read("convex/crons.ts");

// openings:list walks newest-first and stops at the limit instead of collecting the table.
assert.ok(!/ctx\.db\.query\("jobs"\)\.collect\(\)/.test(openings), "list must not collect every job");
assert.ok(/withIndex\("by_createdAt"\)\.order\("desc"\)/.test(openings), "list walks by_createdAt desc");
assert.ok(/!isGone\(j\)/.test(openings), "binned/deleting openings stay hidden");

// vocabulary reads the cron's row and falls back to the scan.
assert.ok(/VOCABULARY_KEY/.test(candidates) && /refreshVocabulary/.test(candidates), "vocabulary has a cron-fed row");
assert.ok(/return await computeVocabulary\(ctx/.test(candidates), "vocabulary falls back to the scan");
assert.ok(/internal\.ta\.candidates\.refreshVocabulary/.test(crons), "cron registered");

console.log("loadreads2311: ok");
