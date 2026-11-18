/**
 * Research's "Similar designation" line feeds Suggestions and the database
 * search for a job (lib/similarTitles, 18 Nov).
 */
import assert from "node:assert/strict";
import { similarTitles, joinTitles } from "@/lib/similarTitles";

// Research's own shape: semicolon separated.
assert.deepEqual(similarTitles("Head of Finance; Finance Controller ; Finance Lead", "Finance Manager"), ["Head of Finance", "Finance Controller", "Finance Lead"]);
// The job's own title and repeats are left out, whatever their case.
assert.deepEqual(similarTitles("Finance Manager; head of finance; Head of Finance", "Finance Manager"), ["head of finance"]);
// A TA's hand edit may use new lines, bullets or quotes.
assert.deepEqual(similarTitles('- "Plant Head"\n• Factory Manager.', "Plant Engineer"), ["Plant Head", "Factory Manager"]);
// Nothing written, nothing used.
assert.deepEqual(similarTitles("", "X"), []);
assert.deepEqual(similarTitles(undefined, "X"), []);
// Capped, so a long list cannot multiply the searches.
assert.equal(similarTitles("a1;b2;c3;d4;e5;f6;g7;h8", "Z").length, 6);
assert.equal(similarTitles("a1;b2;c3;d4;e5;f6;g7;h8", "Z", 4).length, 4);
// Junk entries dropped.
assert.deepEqual(similarTitles("; x ;" + "y".repeat(90) + "; CFO", "Finance Manager"), ["CFO"]);

// Joined in order, first spelling kept.
assert.deepEqual(joinTitles(["Finance Manager"], ["Head of Finance", "finance manager"], ["CFO", "Head Of Finance"]), ["Finance Manager", "Head of Finance", "CFO"]);
assert.deepEqual(joinTitles(undefined, [], ["A"]), ["A"]);

console.log("similar titles: research names feed the searches");
