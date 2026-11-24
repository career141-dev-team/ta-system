// Run: node src/app/today/homeAnswers.check.ts
import assert from "node:assert/strict";
import { answer, brief, startStats } from "./homeAnswers.ts";

// A name finds that TA, with their numbers.
const c = answer("Lead", "How is Chathura doing?");
assert.match(c.say, /^Chathura:/);
assert.equal(c.stats?.[1][0], "12");
// Who has not started: Ravindu only, in the sample.
assert.deepEqual(answer("Lead", "who hasn't started?").rows?.map((r) => r.main), ["Ravindu Mendis"]);
// Under 10 CVs, fewest first.
assert.deepEqual(answer("Lead", "who is under 10 CVs?").rows?.map((r) => r.main), ["Ravindu Mendis", "Sewwandi Perera", "Dinuka Kumara"]);
// The team: one row per TA.
assert.equal(answer("Lead", "team checks now").rows?.length, 5);
// Decisions and LinkedIn.
assert.equal(answer("Lead", "what needs a decision?").rows?.length, 3);
assert.equal(answer("Lead", "roles not on linkedin").rows?.length, 3);
// Nothing understood: says what it can do, no rows.
assert.equal(answer("Lead", "banana").rows, undefined);
// The brief names who is behind.
assert.ok(brief("Lead").groups?.find((g) => g.label === "Not started")?.items.some((i) => i.name === "Ravindu"));
// Director and Ops.
assert.equal(answer("Director", "sets waiting for me").rows?.length, 3);
assert.equal(answer("Ops", "interviews to arrange").rows?.length, 3);
assert.equal(startStats("Lead")[0][0], "4");
console.log("homeAnswers: all checks pass");
