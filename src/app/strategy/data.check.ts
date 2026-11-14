// Run: node src/app/strategy/data.check.ts - fails loudly if the planner's rules break.
import assert from "node:assert/strict";
import { minutesAgo, auraPlan, counts, job, jobStatus, liveRows, setRows, useRows, whenLabel, type Row } from "./data.ts";

void useRows;
let all: Row[] = [];
setRows((rs) => (all = rs));

assert.deepEqual(counts(all), { unplanned: 6, waiting: 5, unread: 5 });
assert.equal(jobStatus(all, "j1").text, "Not planned");
assert.equal(jobStatus(all, "j4").text, "2 waiting to accept");
assert.equal(jobStatus(all, "j6").text, "All submitted");
assert.equal(jobStatus(all, "j5").text, "In progress");
// A struck strategy is not counted; the bar runs submitted, working, waiting, open.
assert.equal(liveRows(all, "j8").length, 3);
assert.deepEqual(liveRows(all, "j7").map((x) => x.state), ["done", "done", "working", "open"]);

assert.equal(whenLabel(1), "Today");
assert.equal(whenLabel(4), "Fri");
assert.equal(whenLabel(2, 3), "Wed–Thu");

const plan = auraPlan(job("j1")!);
assert.equal(plan.rows.length, 4);
assert.match(plan.text, /^Direct headhunt and Referral extraction for Dilini \(lightest week\), LinkedIn search and post for Chathura today\.$/);
assert.deepEqual(["Yesterday", "10 min ago", "2 h ago", "3 days ago"].sort((a, b) => minutesAgo(a) - minutesAgo(b)), ["10 min ago", "2 h ago", "Yesterday", "3 days ago"]);
console.log("strategy planner: ok");
