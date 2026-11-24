// Run: node src/app/today/desk.check.ts - fails loudly if the desk order breaks.
import assert from "node:assert/strict";
import { answer, DESK, gaps, rank, startLine, strategiesOf } from "./desk.ts";
import type { Row } from "../strategy/data.ts";

const rows: Row[] = [
  { job: "j1", name: "LinkedIn search", state: "working", ta: "CS", when: "Today", days: [1, 1] },
  { job: "j1", name: "Company extraction", state: "waiting", ta: "CS", when: "Wed", days: [2, 2] },
  { job: "j1", name: "InMail", state: "working", ta: "DK", when: "Today", days: [1, 1] },
  { job: "j4", name: "Smart Ad", state: "na", ta: "CS" },
];
const typeOf = (d: (typeof DESK)[number]) => ({ sap: "100%", fin: "Follow-up" })[d.id as "sap"] ?? d.type;
const r = rank(DESK, typeOf, rows, "CS");
// 100% first (SAP P1, then HR P3 at its own 100%), then the rest by priority.
assert.deepEqual(r.map((x) => x.d.id), ["sap", "hr", "fin", "prod"]);
assert.equal(r[0].due.length, 1, "only my strategy due today, not another TA's");
assert.match(r[0].reason, /100% today · P1 · day 9 of 14 · 1 strategy due today/);
assert.match(r[1].reason, /past its target by 3 days/);
assert.equal(r.find((x) => x.d.id === "prod")?.suggested, false);
assert.equal(r.find((x) => x.d.id === "hr")?.suggested, true);
assert.equal(strategiesOf(rows, DESK[1], "CS").length, 0, "a struck strategy is left out");
assert.deepEqual(gaps(DESK[3]), ["JD not approved", "No live LinkedIn post", "0 CVs today (under 10)"]);
const today = r.filter((x) => ["sap", "fin"].includes(x.d.id));
assert.match(startLine(today), /^Start with SAP Transformation \(100% today, P1\)\. Due today from Rashmi: LinkedIn search on SAP Transformation\.$/);
assert.deepEqual(answer("What first?", today, r, rows, "CS")?.rows?.[0], { n: 1, main: "SAP Transformation", meta: "PGP Glass · 100% · P1 · day 9 of 14", tag: { text: "1 strategy today", tone: "brand" }, href: "/openings/demo" });
const mine = answer("my strategies today", today, r, rows, "CS");
assert.equal(mine?.say, "Rashmi gave you 2 — 1 to accept.");
assert.equal(mine?.rows?.filter((l) => l.accept).length, 1);
assert.equal(answer("Draft my EOD", today, r, rows, "CS")?.rows?.length, 2);
assert.match(answer("finance requirements", today, r, rows, "CS")?.say ?? "", /^Finance Manager — what they need/);
assert.match(answer("tell me about SAP", today, r, rows, "CS")?.say ?? "", /^SAP Transformation, PGP Glass/);
assert.equal(answer("plan my day", today, r, rows, "CS"), null, "the plan still answers this");
assert.equal(answer("What’s late?", today, r, rows, "CS"), null);
console.log("desk: ok");
