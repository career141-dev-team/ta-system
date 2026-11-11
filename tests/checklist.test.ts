/**
 * The stored checklist (11 Nov; the 29 Oct stability plan's 2.7 and 2.8).
 *
 *   - a write marks the position's checklist stale and schedules ONE recompute
 *   - the recompute is its own mutation: jobView, task events, stored view
 *   - a live day view serves a fresh stored view and names the stale ones
 *   - the API route asks for a recompute of what a poll had to compute live
 *   - the EOD send still validates live (emailPreflight is untouched)
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

const w = read("convex/ta/workdays.ts");
const refresh = w.slice(w.indexOf("export async function refreshWorkdayChecks"), w.indexOf("export const markChecklistsStale"));
eq("a write only marks and schedules", refresh.includes("await markChecklistStale(ctx, day, jobId, actorId);") && !refresh.includes("jobView("), true);
const mark = w.slice(w.indexOf("async function markChecklistStale"), w.indexOf("export async function refreshWorkdayChecks"));
eq("one recompute at a time per position", mark.includes("if (row.pendingAt) return;") && mark.includes('makeFunctionReference<"mutation">("ta/workdays:recomputeChecklist")'), true);
const recompute = w.slice(w.indexOf("export const recomputeChecklist"), w.indexOf("async function rebuildChecklist"));
eq("the recompute is its own mutation and clears the marks", recompute.includes("internalMutation({") && recompute.includes("staleAt: undefined, pendingAt: undefined"), true);
eq("a closed or past day is not rebuilt", recompute.includes("if (!day || !entry || !open) { await ctx.db.patch(row._id, { pendingAt: undefined }); return; }"), true);
const rebuild = w.slice(w.indexOf("async function rebuildChecklist"), w.indexOf("export const suggestionsCheck"));
eq("the rebuild still writes the task-event log", rebuild.includes('ctx.db.insert("taWorkdayTaskEvents"') && rebuild.includes("return result;"), true);
const view = w.slice(w.indexOf("async function view("), w.indexOf("async function summaryView("));
eq("a live view serves a fresh stored checklist", view.includes("if (row?.view && !row.staleAt && now - row.computedAt < CHECKLIST_FRESH_MS) stored.set(j.jobId, row.view as WorkdayJobView);"), true);
eq("and names the ones it had to compute", view.includes("...(live && stale.length ? { staleChecklists: stale } : {}),"), true);
eq("the shared upload scan runs only for positions computed live", view.includes("const computed = entries.filter((j) => !stored.has(j.jobId));") && view.includes('computed.some((j) => j.workType === "100%")'), true);
eq("the freshness window is written down", /const CHECKLIST_FRESH_MS = \d+ \* 60_000;/.test(w), true);
const preflight = w.slice(w.indexOf("export const emailPreflight"), w.indexOf("export const emailPreflight") + 2500);
eq("the EOD send still checks live", preflight.includes("await jobView(ctx, day, entry, Date.now());") && !preflight.includes("checklistRow("), true);

const route = read("src/app/api/workday/route.ts");
eq("the route asks for a recompute of what the poll computed live", route.includes('await convexMutation("ta/workdays:markChecklistsStale", { workdayId: d.id, jobIds: d.staleChecklists }).catch(() => {});'), true);

const schema = read("convex/schema.ts");
eq("the table and its index exist", schema.includes("taWorkdayChecklists: defineTable({") && /taWorkdayChecklists: defineTable\(\{[\s\S]*?\}\)\.index\("by_workday_job", \["workdayId", "jobId"\]\)/.test(schema), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
