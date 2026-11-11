/**
 * The follow-up sweep decides, and moves one candidate per mutation (11 Nov).
 *
 * Up to 60 moves ran inside the sweep's own transaction, each rebuilding every
 * TA's workday checklist for that job; the live log showed the sweep at 1.0 s
 * one run and failed at 2.9 s the next (1 s budget), and its cursor rolled
 * back with the failure, so the same window was retried every seven minutes
 * and nobody advanced. Also: two crons that did nothing still took a turn.
 */
import fs from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const crons = read("convex/crons.ts");
const helper = crons.slice(crons.indexOf("async function sweepMove("), crons.indexOf("const SWEEP_SOURCE_STAGES"));
eq("a sweep move is scheduled, not run inline", helper.includes("ctx.scheduler.runAfter(queuedMoves++ * MOVE_STAGGER_MS, internal.crons.sweepMoveOne,") && !helper.includes("executeStageTransition("), true);
eq("moves are staggered", /const MOVE_STAGGER_MS = \d+;/.test(crons), true);

const one = crons.slice(crons.indexOf("export const sweepMoveOne"), crons.indexOf("export const evaluateFollowUpStage"));
eq("one move per mutation goes through the state machine", one.includes("executeStageTransition(ctx, {") && one.includes("bypassRoleCheck: true") && one.includes("skipAutoOutreach: true"), true);
eq("a candidate who left the stage since is left alone", one.includes("!SWEEP_SOURCE_STAGES.has(app.currentStage)") && one.includes('typeof app.taTookOverAt === "number"'), true);
eq("the after-move patch is applied in the same mutation as the move", one.includes("if (args.after) await ctx.db.patch(args.appId, args.after"), true);

const sweep = crons.slice(crons.indexOf("export const evaluateFollowUpStage"), crons.indexOf("export const checkSlaBreaches"));
eq("the sweep resets the stagger each run", sweep.includes("queuedMoves = 0;"), true);
eq("the sweep itself never moves inline", sweep.includes("executeStageTransition("), false);
eq("TA Follow-up keeps its clock through the move", /sweepMove\(ctx, app\._id, "follow_up", reason, \{\s*aiFollowUpNoReply: true,[\s\S]*?followUpEnteredAt: app\.followUpEnteredAt,\s*\}\);/.test(sweep), true);
eq("the two unresponsive closes carry their followUpState patch", (sweep.match(/sweepMove\(ctx, app\._id, "unresponsive", [^\n]*, \{\s*followUpState: \{/g) ?? []).length, 2);
eq("no patch is written after a move it would race", /await sweepMove\([^\n]*\);\s*await ctx\.db\.patch\(app\._id, \{\s*(aiFollowUpNoReply|followUpState)/.test(sweep), false);
eq("the cursor is still written by the sweep", sweep.includes("await writeCursor(ctx, cursorName,"), true);

eq("the no-op stats cron is gone", crons.includes('"update-dashboard-stats-cache"') && crons.includes("internal.stats.stats.updateDashboardStatsCache"), false);
eq("the finished September re-extractor cron is gone", crons.includes('"bg-sept5-reextractor"') && crons.includes("internal.cvs.sept5ReextractorActions.runSept5ReextractionTick"), false);
eq("the sweep cron itself stays", crons.includes('"evaluate-follow-up"') && crons.includes("internal.crons.evaluateFollowUpStage"), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
