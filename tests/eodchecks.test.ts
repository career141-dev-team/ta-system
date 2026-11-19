/**
 * The EOD checks box (10 Nov): "Could not load workday checks" greyed the Send
 * button every day at the end of the day.
 *
 *   - the composer asks for ONE position, not the whole day
 *   - a Follow-up or Add-on position skips the candidate queues it would drop
 *   - the eight upload scans run once per day view, not once per position
 *   - the checks read the newest suggestion rounds and one record's evidence,
 *     never every suggestion or every evidence row the job ever had
 *   - a failed poll with nothing held does not grey Send; the server re-checks
 *   - the route says which step failed
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

const workday = read("src/components/Workday.tsx");
const box = workday.slice(workday.indexOf("export function EodJobChecks"), workday.indexOf("function DailyReview"));
eq("the composer polls one position", box.includes("useWorkday(false, true, `&job=${encodeURIComponent(jobId)}`)"), true);
eq("a failed poll with nothing held does not block Send", box.includes("const unknown = !!error && !job;") && box.includes("const blocked = !unknown && ("), true);
eq("the box says the server still checks", box.includes("Send still checks every requirement before anything goes out."), true);
eq("the hook shows the route's own sentence", workday.includes("throw new Error(body?.error || \"Could not load workday checks. Please retry.\")"), true);

const route = read("src/app/api/workday/route.ts");
eq("the route passes the position to the backend", route.includes('jobId: new URL(request.url).searchParams.get("job") || undefined'), true);
eq("the route names the step that failed", route.includes("the desk is still loading") && route.includes("the checks took too long to read"), true);

const workdays = read("convex/ta/workdays.ts");
eq("dashboard takes a position", /jobId: v\.optional\(v\.string\(\)\)\s*[,}]/.test(workdays) && workdays.includes("await view(ctx, active, now, true, args.jobId)"), true);
const view = workdays.slice(workdays.indexOf("async function view("), workdays.indexOf("async function summaryView("));
eq("a day view builds one position when asked", view.includes("onlyJobId ? all.filter((j) => j.jobId === onlyJobId) : all"), true);
eq("the upload scans run once per day view", view.includes("secondaryUploads: await secondaryUploadsSince(") && workdays.includes("shared.secondaryUploads ?? (await secondaryUploadsSince(ctx, since))"), true);
const jobView = workdays.slice(workdays.indexOf("async function jobView("), workdays.indexOf("/** Editing shared text invalidates"));
eq("a Follow-up position skips the candidate queues", (jobView.match(/full \? ctx\.db/g) ?? []).length, 4);
eq("the secondary scan is skipped for a Follow-up position", jobView.includes("const secondaryQueues = [full ? (shared.secondaryUploads"), true);

const checks = read("convex/lib/workdayChecks.ts");
const required = checks.slice(checks.indexOf("export async function requiredChecks"), checks.indexOf("/** Editing shared text"));
eq("suggestions are read newest-first and bounded", required.includes('withIndex("by_opening_round"') && required.includes(".order(\"desc\").take(SUGGESTION_ROWS)"), true);
eq("no suggestion table is collected whole", /profileSuggestions"\)[^\n]*\.collect\(\)/.test(required), false);
eq("evidence is read per record", required.includes('withIndex("by_job_record"') && !/taWorkdayEvidence"\)\.withIndex\("by_job"/.test(required), true);
eq("sourcing runs are bounded", required.includes(".order(\"desc\").take(SOURCING_RUNS)"), true);
eq("a carried position's checks skip the evidence it would drop", required.includes("const full = !opts.lean;") && jobView.includes("requiredChecks(ctx, day, entry, { lean: !full })"), true);
eq("the write paths still read everything", !workdays.slice(workdays.indexOf("export const saveCheck")).includes("{ lean:"), true);

const candidatePage = read("src/app/openings/[id]/candidate/[appId]/page.tsx");
eq("the candidate page reads colleagues only on the Company Reference tab", candidatePage.includes('const wantColleagues = tab === "company_refs";') && candidatePage.includes("if (wantColleagues && isConvex() && targetCompany) {"), true);

const schema = read("convex/schema.ts");
eq("the indexes exist", schema.includes('.index("by_opening_round", ["openingId", "round"])') && schema.includes('.index("by_job_record", ["jobId", "recordId"])'), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
