/**
 * Daily targets (convex/lib/targetsAccess): who may set them, what a valid
 * target is, and the progress shown (3 Nov).
 */
import { cleanTarget, maySetTargets, progressPct } from "../convex/lib/targetsAccess";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

console.log("\nwho may set targets");
eq("admin may", maySetTargets({ role: "admin" }), true);
eq("a lead stored as ta_manager with taRole ta_lead may", maySetTargets({ role: "ta_manager", taRole: "ta_lead" }), true);
eq("senior_ta with no taRole reads as a lead and may", maySetTargets({ role: "senior_ta" }), true);
eq("a TA may not", maySetTargets({ role: "recruiter" }), false);
eq("ops may not", maySetTargets({ role: "ops" }), false);
eq("a client may not", maySetTargets({ role: "client" }), false);

console.log("\nvalid targets");
eq("0 is valid", cleanTarget(0), 0);
eq("a whole number is valid", cleanTarget(25), 25);
eq("negative is refused", cleanTarget(-1), null);
eq("a fraction is refused", cleanTarget(2.5), null);
eq("NaN (an empty box) is refused", cleanTarget(NaN), null);
eq("over 1000 is refused", cleanTarget(1001), null);
eq("a string is refused", cleanTarget("5"), null);

console.log("\nprogress");
eq("3 of 10 is 30%", progressPct(3, 10), 30);
eq("over target caps at 100%", progressPct(15, 10), 100);
eq("a zero target counts as met", progressPct(0, 0), 100);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
