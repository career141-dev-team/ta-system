// Run: node src/app/linkedin-search/read.check.ts
import assert from "node:assert/strict";
import { readAsk, bandOf } from "./read.ts";

const a = readAsk("We need software engineers at WSO2 in Colombo with 5 years experience");
assert.deepEqual(a.titles, ["software engineer"]);
assert.deepEqual(a.companies, ["WSO2"]);
assert.deepEqual(a.locations, ["Colombo"]);
assert.equal(a.minYears, 5);
assert.equal(a.years, "3");

const b = readAsk("Find 10 Java developers in Kandy with Spring and React");
assert.deepEqual(b.titles, ["Java developer"]);
assert.deepEqual(b.locations, ["Kandy"]);
assert.deepEqual(b.keywords, ["Spring", "React"]);

// A refinement keeps the last search and changes what it says.
const c = readAsk("only Colombo", b);
assert.deepEqual(c.titles, ["Java developer"]);
assert.deepEqual(c.locations, ["Colombo"]);
assert.deepEqual(c.keywords, ["Spring", "React"]);

const d = readAsk("now 6+ years", a);
assert.equal(d.minYears, 6);
assert.equal(d.years, "4");
assert.deepEqual(d.companies, ["WSO2"]);

// A new prompt starts again.
const e = readAsk("HR managers", a);
assert.deepEqual(e.titles, ["HR manager"]);
assert.deepEqual(e.companies, []);

assert.deepEqual([0, 2, 5, 6, 10, 11].map(bandOf), ["1", "2", "3", "4", "4", "5"]);
console.log("read: all checks passed");
