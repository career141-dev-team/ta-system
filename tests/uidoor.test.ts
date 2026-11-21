/**
 * The new UI's door (convex/ui, 18 Nov): the only public functions in the TA
 * backend. They must take the person from the signed-in Clerk identity and
 * nowhere else, reach the same internal rules the old app uses, and answer a
 * refusal in words instead of throwing.
 */
import fs from "node:fs";
import path from "node:path";
import { cardLimit, inWords, scoopFileRefusal, normalizeQuestions, strategyRowsToSubmit, matchableEmail, moveRefusal, toCard, openingCard, withEdits, BOARD_STAGES, BACKEND_STAGES, daysOpen, columnCount } from "../convex/ui/rules";
import { fillDecision, targetOf } from "../convex/lib/placementCount";
import { isEodCandidateEligible } from "../src/lib/eodEligibility";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// ── Who is asking ──────────────────────────────────────────────────────────
const dir = "convex/ui";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));
for (const f of files) {
  const src = read(`${dir}/${f}`);
  eq(`${f}: no actorId argument (the person is the Clerk identity only)`, /actorId\s*:\s*v\./.test(src), false);
  const publicFns = (src.match(/=\s*(query|mutation|action)\(\{/g) ?? []).length;
  // `act(ctx` (ui/day.ts) runs `who(ctx)` before anything else; an action
  // (ui/aura.ts) asks ui/me:whoAmI, which is uiUser, as its first read.
  const checked = (src.match(/await (uiUser|openFor|forOpening|manager|postFor|who)\(ctx|=> act\(ctx|ctx\.runQuery\(api\.ui\.me\.whoAmI/g) ?? []).length;
  if (publicFns) eq(`${f}: every public function asks uiUser first`, checked >= publicFns, true);
}
eq("unverified email is never matched", matchableEmail({ tokenIdentifier: "t", subject: "s", email: "a@b.com", emailVerified: false }), null);
eq("email matched lower-cased", matchableEmail({ tokenIdentifier: "t", subject: "s", email: " Asma@Career141.com " }), "asma@career141.com");

// ── The same rules as the old app ──────────────────────────────────────────
const pipeline = read("convex/ui/pipeline.ts");
eq("move goes through the old app's own moveStage", pipeline.includes("internal.ta.applications.moveStage"), true);
eq("shortlist goes through the old app's own shortlist (collision lock)", pipeline.includes("internal.ta.applications.shortlist"), true);
eq("the door never moves a stage itself", /executeStageTransition|currentStage:\s/.test(pipeline), false);
eq("reject needs a reason", moveRefusal("rejected", " "), "Say why they were rejected.");
eq("drop-out needs a reason", moveRefusal("dropped_out", undefined), "Say why they dropped out.");
eq("reject with a reason is fine", moveRefusal("rejected", "Salary too high"), null);
eq("nobody moved into AI Follow-Up by hand", moveRefusal("ai_follow_up", "")?.startsWith("Nobody is moved"), true);
eq("an unknown stage is refused", moveRefusal("new_cv", ""), "That stage does not exist. Reload the page.");

// ── Bounded reads ──────────────────────────────────────────────────────────
eq("cards per column default", cardLimit(undefined), 25);
eq("cards per column capped", cardLimit(10_000), 200);
eq("every column maps to backend stages", BOARD_STAGES.every((s) => BACKEND_STAGES[s].length > 0), true);
eq("the board reads through the job+stage index", pipeline.includes('withIndex("by_job_stage"'), true);
eq("the board never collects a whole table", /\.collect\(\)/.test(pipeline), false);

// ── Refusals in words ──────────────────────────────────────────────────────
eq("Convex wrapping stripped", inWords(new Error("[CONVEX M(ui/pipeline:move)] Uncaught Error: Another recruiter has claimed this candidate.\n    at handler (x.js:1)"), "x"), "Another recruiter has claimed this candidate.");
eq("empty error falls back", inWords(null, "That move could not be made. Try again."), "That move could not be made. Try again.");

// ── A card carries only what it draws ──────────────────────────────────────
const card = toCard(
  { id: "a1", stage: "ta_follow_up", ownerTaId: "u2", isAddOn: false, backupForApplicationId: null, sourcingChannel: "L", setNumber: 1 },
  { fullName: "Nimali Perera", currentJobTitle: "Accountant" },
  ["expected salary"],
  "u1",
  "Hasini Fernando",
);
eq("locked by the other TA's first name", card.lockedBy, "Hasini");
eq("not mine", card.mine, false);
eq("missing details carried", card.missing, ["expected salary"]);
eq("no CV text or scores on a card", Object.keys(card).some((k) => /cvText|explanation|embedding/i.test(k)), false);

// ── Only writes whose rules live in the backend ───────────────────────────
const opening = read("convex/ui/opening.ts");
eq("the door never calls the generic save (its rules live in the old app)", /commit\.apply|commit:apply/.test(opening + pipeline), false);
eq("approve JD is not in the door (Research and Suggestions start in the old app)", /approveJd/.test(opening.replace(/\/\/.*$/gm, "")), false);
eq("scoop size is read from storage, not the browser", opening.includes("ctx.db.system.get(args.storageId)"), true);
eq("scoop: empty file", scoopFileRefusal("a.pdf", 0, "application/pdf"), "Choose a CV file first.");
eq("scoop: over 10 MB", scoopFileRefusal("a.pdf", 11 * 1024 * 1024, "application/pdf"), "a.pdf is over 10 MB. Save a smaller PDF and try again.");
eq("scoop: rtf refused", scoopFileRefusal("a.rtf", 100, "application/rtf"), "a.rtf is not a PDF or a Word document.");
eq("scoop: docx fine", scoopFileRefusal("a.docx", 100, ""), null);

// ── PR 1b: rules moved out of the old app ──────────────────────────────────
const manage = read("convex/ui/manage.ts");
eq("questions: only the opening's recruiters or a lead (opening.manage)", manage.includes('"opening.manage"'), true);
eq("strategies: the old app's strategy.work rule", (manage.match(/"strategy\.work"/g) ?? []).length, 2);
let n = 0;
const nid = () => `q${++n}`;
eq("questions: wording kept keeps the id, blanks dropped",
  normalizeQuestions([{ id: "qa", label: "Can you start in a month?" }], ["Can you start in a month?", "  ", "Do you drive?"], nid),
  { ok: true, questions: [{ id: "qa", label: "Can you start in a month?" }, { id: "q1", label: "Do you drive?" }] });
eq("questions: a repeat refused", normalizeQuestions([], ["Do you drive?", "do you drive?"], nid).ok, false);
eq("questions: over 200 characters refused", normalizeQuestions([], ["x".repeat(201)], nid).ok, false);
eq("questions: 13 refused", normalizeQuestions([], Array.from({ length: 13 }, (_, i) => `Q ${i}`), nid).ok, false);
const srows = new Map([
  ["r1", { id: "r1", name: "Referrals", notApplicable: false, onIt: true, ticked: true }],
  ["r2", { id: "r2", name: "Groups", notApplicable: false, onIt: false, ticked: false }],
  ["r3", { id: "r3", name: "Struck", notApplicable: true, onIt: true, ticked: true }],
]);
const day = (t: string) => (t === "2026-11-18" ? 100 : null);
eq("submit: nothing given", strategyRowsToSubmit(srows, [], day, 1).ok, false);
eq("submit: a bad date refused", strategyRowsToSubmit(srows, [{ rowId: "r1", used: true, date: "soon", note: "" }], day, 1), { ok: false, message: "That is not a date (Referrals)." });
eq("submit: used with no date = today", strategyRowsToSubmit(srows, [{ rowId: "r1", used: true, date: "", note: "Posted" }], day, 7), { ok: true, rows: [{ rowId: "r1", doneAt: 7, note: "Posted" }] });
eq("submit: not mine and not ticked, or struck = none of yours", strategyRowsToSubmit(srows, [{ rowId: "r2", used: true, date: "", note: "" }, { rowId: "r3", used: true, date: "", note: "" }], day, 1), { ok: false, message: "None of those strategies are yours to update." });
eq("submit: note over 500 refused", strategyRowsToSubmit(srows, [{ rowId: "r1", used: false, date: "", note: "x".repeat(501) }], day, 1).ok, false);

const posts = read("convex/ui/posts.ts");
eq("posts: opening.manage, as the old actions", posts.includes('"opening.manage"'), true);
eq("posts: going live needs the JD approved (add and status)", (posts.match(/JD_NOT_APPROVED\)/g) ?? []).length, 2);
eq("posts: the old link check is reused", posts.includes("linkedinPostUrl(link)") && posts.includes("linkedinPostUrl(url)"), true);
eq("posts: the same post twice refused", posts.includes("There is already a post called"), true);
eq("posts: a rename keeps the old title", posts.includes("previousTitles"), true);
eq("posts: workday checks refreshed like the old save", (posts.match(/refreshWorkdayChecks\(/g) ?? []).length >= 4, true);
eq("posts: a new link re-reads the mailbox", posts.includes("queueRescanForLink"), true);
eq("posts: moving CVs stays inside one opening", posts.includes("That record belongs to a different opening."), true);

// The Openings list (ui/openings:list).
const oc = openingCard.of({ id: "j", client: "C", title: "T", status: "cancelled", priorityTier: "P1", days: 3, team: ["Ann"], made: 1, website: true });
eq("openings: cancelled reads as lost", oc.status, "lost");
eq("openings: P1 is priority 1", oc.priority, 1);
eq("openings: draft is still open work", openingCard.status("draft"), "active");
eq("openings: no tier is P3", openingCard.of({ ...oc, status: "on_hold", priorityTier: null }).priority, 3);
const openingsSrc = fs.readFileSync(path.join("convex", "ui", "openings.ts"), "utf8");
eq("openings: each status through its index", openingsSrc.includes('withIndex("by_status"'), true);
eq("openings: never the whole table", /query\("jobs"\)\.collect\(\)/.test(openingsSrc), false);
eq("openings: a TA sees only their own", openingsSrc.includes("by_userId_isActive"), true);

// 19 Nov, fast reads. Day N as the old app counts it (map.ts): assignedAt, else created.
{
  const now = Date.parse("2026-11-19T10:00:00+05:30");
  eq("days open: from assignedAt", daysOpen({ assignedAt: Date.parse("2026-11-09T09:00:00+05:30"), createdAt: "2026-10-01T00:00:00Z" }, now), 10);
  eq("days open: no assignedAt reads the created day (it read 0 on every card)", daysOpen({ createdAt: "2026-11-05T08:00:00+05:30" }, now), 14);
  eq("days open: nothing on record is 0", daysOpen({}, now), 0);
  eq("board count: under the cap is exact", columnCount(12), { count: 12, capped: false });
  eq("board count: exactly the cap is not capped", columnCount(500), { count: 500, capped: false });
  eq("board count: past the cap says so", columnCount(1002), { count: 500, capped: true });
  for (const [f, src] of [["openings", openingsSrc], ["lead", read("convex/ui/lead.ts")], ["desk", read("convex/ui/desk.ts")]] as const)
    eq(`${f}: day N never from assignedAt alone`, /j\.assignedAt \?/.test(src), false);
  eq("today: own day only, never the reviewers' panel", read("convex/ui/day.ts").includes("ownOnly: true"), true);
  eq("dashboard: ownOnly skips the desk-wide assignment scan", read("convex/ta/workdays.ts").includes('teamView ? await ctx.db.query("jobAssignments").collect()'), true);
  eq("emails: the door asks for the last 31 days without the HTML", read("convex/ui/email.ts").includes("recent: true"), true);
  const lead = read("convex/ui/lead.ts");
  eq("lead: a TA's own candidates from their index, not every role's newest", lead.includes('"by_workday_owner"'), true);
  // 20 Nov: CVs today reads a role's applications by job, but only since midnight (bounded).
  eq("lead: a role's applications by job only from today", lead.split('query("applications").withIndex("by_jobId"').slice(1).every((rest) => rest.slice(0, 80).includes('.gte("_creationTime", dayStart)')), true);
  eq("homes: open roles' stages only, never desk-wide by stage", read("convex/ui/homes.ts").includes('withIndex("by_stage"'), false);
  const compose = read("convex/lib/eodCompose.ts");
  eq("compose: only Director Review is read for the roster", compose.includes('eq("currentStage", "second_shortlist")') && !compose.includes('withIndex("by_jobId"'), true);
  eq("compose: that is the only stage the rule lets through", ["new_cvs", "ta_shortlist", "follow_up", "director_shortlist", "client_review", "rejected"].some((stage) => isEodCandidateEligible({ stage, lastStageChangedAt: 0 }, { taId: null, workType: "100%" })), false);
}

// The TA's day (ui/day, D4): thin wrappers over the workday's own rules.
const daySrc = fs.readFileSync(path.join("convex", "ui", "day.ts"), "utf8");
eq("day: no actorId argument anywhere", /args:\s*\{[^}]*actorId/.test(daySrc), false);
eq("day: every write goes through the workday's own rule", ["workdays.start", "workdays.addPosition", "workdays.setWorkType", "workdays.taskException", "workdays.carry", "workdays.finish", "workdays.decide", "workdays.saveCheck"].every((f) => daySrc.includes(`internal.ta.${f}`)), true);
eq("day: the ChatGPT link keeps its confirm rule", daySrc.includes("checkResearchSubmission"), true);
eq("day: refresh only on your own workday", daySrc.includes("That workday is not yours."), true);
eq("day: the bell reads only your own", daySrc.includes("userId: w.user._id"), true);

// The email screen before the send (ui/email, D5a): no door may send mail yet.
const emailSrc = fs.readFileSync(path.join("convex", "ui", "email.ts"), "utf8");
eq("email: nothing here sends (no begin, no eodMail)", /dailyEmails\.begin|eodMail/.test(emailSrc.replace(/\/\/.*$/gm, "")), false);
eq("email: the browser never names the scoop-only exemption", /scoopsOnly/.test(emailSrc.replace(/\/\/.*$|\*.*$/gm, "")), false);
eq("email: settling an uncertain send uses the backend's rule", emailSrc.includes("internal.ta.dailyEmails.reconcile"), true);

// The email built in the backend (D5 step 1): one roster rule for the screen and the send.
const dailySrc = fs.readFileSync(path.join("convex", "ta", "dailyEmails.ts"), "utf8");
const beginSrc = dailySrc.slice(dailySrc.indexOf("export const begin"), dailySrc.indexOf("export const", dailySrc.indexOf("export const begin") + 10));
eq("compose: begin uses the shared roster rule", beginSrc.includes("eligibleApplications(ctx"), true);
eq("compose: begin keeps no second copy of the rule", beginSrc.includes("isEodCandidateEligible"), false);
const composeSrc = dailySrc.slice(dailySrc.indexOf("export const compose"));
eq("compose: the same roster rule", composeSrc.includes("eligibleApplications(ctx"), true);
eq("compose: takes no recipients, subject or HTML from the caller", /args:\s*\{[^}]*\b(to|cc|html|subject)\b/.test(composeSrc), false);
eq("compose door: no recipients from the browser", /compose = query\(\{\s*args:\s*\{[^}]*\b(to|cc|html)\b/.test(emailSrc), false);

// The Midday send (D5 step 2): built on the server; the browser only edits cells.
const base = [{ no: 1, name: "Ann", age: "30", notice: "1 month", notes: [">a"], currentCompany: "X", currentDesignation: "Y", currentRemuneration: "1", expectedRemuneration: "2", applicationId: "a1" }];
const edited = withEdits(base as never, [
  { applicationId: "a1", field: "notice", value: " 2 months " },
  { applicationId: "a1", field: "applicationId", value: "evil" },
  { applicationId: "a1", field: "notes", value: "one\n\ntwo" },
  { applicationId: "zz", field: "name", value: "Not here" },
  { applicationId: "a1", field: "name", value: "  " },
]);
eq("send: a cell edit is applied", edited[0].notice, "2 months");
eq("send: only table-1 cells can change", edited[0].applicationId, "a1");
eq("send: notes split into lines", edited[0].notes, ["one", "two"]);
eq("send: an edit for someone not in the email is ignored", edited.length, 1);
eq("send: a blank name keeps the record's", edited[0].name, "Ann");
const sendSrc = fs.readFileSync(path.join("convex", "ui", "emailSend.ts"), "utf8");
const sendArgs = sendSrc.slice(sendSrc.indexOf("const form = {"), sendSrc.indexOf("};", sendSrc.indexOf("const form = {")));
eq("send: the browser cannot give HTML, a sender, To/Cc lists or rows", /(html|from|to|cc|rows|snapshot|applicationIds)\s*:/.test(sendArgs), false);
eq("send: the HTML is built on the server", sendSrc.includes("eodEmailHtml({ rows"), true);
eq("send: through the old reservation and its guards", sendSrc.includes("internal.ta.dailyEmails.begin"), true);
eq("send: through the old sender (test mode, outbound lock)", sendSrc.includes("internal.ta.eodMail.send"), true);
eq("send: only a Midday, and without attachments", sendSrc.includes('submissionType: "midday"') && sendSrc.includes("attachments: [], savedIds: []") && !/submissionType:\s*"eod"/.test(sendSrc), true);
eq("send: the ChatGPT rule is kept", sendSrc.includes("checkResearchSubmission"), true);

// ── AURA on Today (E5 group 1, 19 Nov) ────────────────────────────────────
{
  const { AI_DAY_LIMIT_USD, cleanReply, costOf, trimHistory } = await import("../convex/ui/auraRules");
  const ids = new Set(["j1"]);
  eq("aura: daily limit is $5", AI_DAY_LIMIT_USD, 5);
  eq("aura: Haiku 5.5 price (1M in + 1M out = $0.60)", Math.round(costOf(1_000_000, 1_000_000) * 100) / 100, 0.6);
  eq("aura: a plan keeps its steps", cleanReply({ kind: "plan", headline: "Close SAP by lunch", steps: [{ at: "9:00", what: "Review", where: "j1", tone: "brand" }] }, ids), { kind: "plan", headline: "Close SAP by lunch", steps: [{ at: "9:00", start: 540, minutes: 30, what: "Review", tone: "brand", where: "j1" }] });
  // Plan my day (D11 item 2, 20 Nov): every step carries a start and a length the saved
  // plan uses - before, a live plan was saved with every task at midnight.
  const { clockMin } = await import("../convex/ui/auraRules");
  eq("plan time: 24-hour, 12-hour, pm and a bare afternoon hour", ["14:30", "9:00", "2:30 pm", "2:30", "12:30", "9.15", "noon"].map(clockMin), [870, 540, 870, 870, 750, 555, null]);
  const dayPlan = cleanReply({ kind: "plan", headline: "h", steps: [
    { at: "14:30", minutes: 60, what: "Interview", tone: "info" },
    { at: "9:00", minutes: 400, what: "Review six suggestions", tone: "brand" },
    { at: "soon", what: "Has no time", tone: "none" },
    { at: "10:00", minutes: 20, what: "Chase two candidates", tone: "warn" },
  ] }, ids) as { steps: { at: string; start: number; minutes: number; what: string }[] };
  eq("plan: steps in time order, a step without a time dropped", dayPlan.steps.map((s) => [s.at, s.start]), [["9:00", 540], ["10:00", 600], ["2:30", 870]]);
  eq("plan: a length never runs into the next step; the last keeps its own", dayPlan.steps.map((s) => s.minutes), [60, 20, 60]);
  eq("aura: an unknown position id is dropped, not trusted", (cleanReply({ kind: "answer", say: "x", rows: [{ main: "a", where: "evil" }] }, ids) as { rows: { where?: string }[] }).rows[0].where, undefined);
  eq("aura: a bad tone becomes none", (cleanReply({ kind: "plan", headline: "h", steps: [{ at: "9", what: "w", tone: "<b>" }] }, ids) as { steps: { tone: string }[] }).steps[0].tone, "none");
  eq("aura: an answer without words is refused", cleanReply({ kind: "answer", say: " " }, ids), null);
  eq("aura: an unknown shape is refused", cleanReply({ kind: "send_email" }, ids), null);
  eq("aura: rows capped at 6", (cleanReply({ kind: "answer", say: "x", rows: Array.from({ length: 20 }, () => ({ main: "r" })) }, ids) as { rows: unknown[] }).rows.length, 6);
  eq("aura: history keeps the last 6 turns", trimHistory(Array.from({ length: 10 }, (_, i) => ({ role: "user" as const, text: `t${i}` }))).length, 6);
  const aura = read("convex/ui/aura.ts");
  eq("aura: asks who first, then checks the key and the daily limit", aura.indexOf("api.ui.me.whoAmI") < aura.indexOf("anthropicOn()") && aura.includes("spentToday"), true);
  eq("aura: every call is written to the ledger", aura.includes("internal.ui.auraLedger.record"), true);
  eq("aura: a hard time limit", /TIMEOUT_MS = 20_000/.test(aura), true);
  eq("aura: writes nothing but the ledger", /runMutation\((?!internal\.ui\.auraLedger\.record)/.test(aura), false);
  eq("desk: bounded reads only", /\.collect\(\)/.test(read("convex/ui/desk.ts")), false);

  // Today's "things" (item 3): only what is on record, the board's own Director Review rule.
  const { readyLine } = await import("../convex/ui/auraRules");
  eq("things: line with salary and notice", readyLine("SAP Lead", 850_000, 30), "SAP Lead · expects LKR 850k · notice 1 month");
  eq("things: nothing invented when unknown", readyLine("SAP Lead", null, null), "SAP Lead");
  eq("things: notice 0 = can start now", readyLine("X", null, 0), "X · can start now");
  eq("things: odd notice in days", readyLine("X", null, 45), "X · notice 45 days");
  const deskSrc = read("convex/ui/desk.ts");
  eq("things: ready uses the board's own blockers rule", deskSrc.includes("directorReviewBlockers(a, c)"), true);
  eq("things: only this TA's own candidates", deskSrc.includes("a.ownerTaId as string | undefined) !== me"), true);
  eq("things: read only", /ctx\.db\.(insert|patch|replace|delete)/.test(deskSrc), false);

  // The lead's desk (19 Nov): the old lead dashboard's rules, for AURA on the lead's Today.
  const { decisionOf, tally, clock, IN_PIPELINE } = await import("../convex/ui/leadRules");
  const role = { title: "SAP Lead", client: "PGP", tas: 1, jdPending: false, day: 3, target: 14, tier: "P1" };
  eq("lead: nobody on a role is a red decision", decisionOf({ ...role, tas: 0 }), { title: "SAP Lead", client: "PGP", why: "Nobody assigned", red: true });
  eq("lead: a JD waiting is a decision", decisionOf({ ...role, jdPending: true })?.why, "JD waiting for approval");
  eq("lead: past its target is a decision", decisionOf({ ...role, day: 20 })?.why, "Day 20 against a P1 target of 14 — close it or reassign");
  eq("lead: within target and staffed is no decision", decisionOf(role), null);
  const check = (status: "complete" | "incomplete", key: string, exception?: { reason: string; at: number; by: string }) => ({ key, status, exception }) as never;
  eq("lead: done = complete or excused", tally({ checks: [check("complete", "jd"), check("incomplete", "research", { reason: "x", at: 1, by: "u" }), check("incomplete", "daily_email")] }, "100%"), { done: 2, of: 3 });
  eq("lead: no checklist yet = nothing counted", tally(null, "100%"), { done: 0, of: 0 });
  eq("lead: Colombo clock", clock(Date.UTC(2026, 10, 19, 3, 35)), "9:05");
  eq("lead: pipeline excludes new and closed", IN_PIPELINE.has("new_cvs") || IN_PIPELINE.has("placed"), false);
  const leadSrc = read("convex/ui/lead.ts");
  eq("lead: signed in and desk-wide only", leadSrc.includes("uiUser(ctx)") && leadSrc.includes("isDeskWideUser(user)"), true);
  eq("lead: bounded reads only", /\.collect\(\)/.test(leadSrc), false);
  eq("lead: read only", /ctx\.db\.(insert|patch|replace|delete)/.test(leadSrc), false);

  // The Director's and Ops's desks (19 Nov).
  const { chaseOf, interviewWhen, STAGE_WORDS } = await import("../convex/ui/leadRules");
  const at = Date.UTC(2026, 10, 17, 5, 0); // Tue 17 Nov, 10:30 Colombo
  eq("homes: interview time in Colombo", interviewWhen(at), "Tue 17 Nov, 10:30");
  eq("homes: Director Review in the old words", STAGE_WORDS.director_review, "Director Review");
  const chase = chaseOf(
    [
      { who: "Ruwan J", client: "Dialog", days: 4 },
      { who: "Tharu B", client: "JKH", days: 1 },
    ],
    [
      { who: "Pasindu Silva", at: at, confirmed: false },
      { who: "Hiruni F", at: at, confirmed: true },
      { who: "Later P", at: at + 5 * 86_400_000, confirmed: false },
    ],
    at - 86_400_000,
  );
  eq("homes: chase a client quiet 3+ days, then an unconfirmed interview within 2 days", chase.map((c) => c.action), ["Chase the client", "Call Pasindu"]);
  const homesSrc = read("convex/ui/homes.ts");
  eq("homes: signed in and desk-wide only", homesSrc.includes("uiUser(ctx)") && homesSrc.includes("isDeskWideUser(user)"), true);
  eq("homes: bounded reads only", /\.collect\(\)/.test(homesSrc), false);
  eq("homes: read only", /ctx\.db\.(insert|patch|replace|delete)/.test(homesSrc), false);

  // AURA's day plan, phase 1 (19 Nov): draft -> approved -> closed, nothing deleted after approval.
  const { draftRefusal, taskMoveRefusal, planTally, hm } = await import("../convex/ui/planRules");
  const t = (o: Partial<{ key: string; title: string; kind: string; startMin: number; minutes: number; priority: string; jobId: string; dependsOn: string }> = {}) =>
    ({ key: "a", title: "Review suggestions", kind: "cv_review", startMin: 540, minutes: 30, priority: "normal", ...o });
  const jobs = new Set(["j1"]);
  eq("plan: a good draft saves", draftRefusal([t(), t({ key: "b", jobId: "j1", dependsOn: "a" })], 1020, jobs), null);
  eq("plan: a task needs a name", draftRefusal([t({ title: "  " })], 1020, jobs), "Every task needs a name.");
  eq("plan: 5 minutes at least", draftRefusal([t({ minutes: 2 })], 1020, jobs), "“Review suggestions” must take between 5 minutes and 8 hours.");
  eq("plan: only your own positions", draftRefusal([t({ jobId: "other" })], 1020, jobs), "“Review suggestions” is on a position you are not assigned to.");
  eq("plan: a dependency must be in the plan", draftRefusal([t({ dependsOn: "zzz" })], 1020, jobs), "“Review suggestions” waits on a task that is not in the plan.");
  eq("plan: finish between 6:00 and 23:59", draftRefusal([t()], 5 * 60, jobs), "The finish time must be between 6:00 and 23:59.");
  eq("plan: tick a planned task", taskMoveRefusal("planned", "done", "approved"), null);
  eq("plan: undo a tick", taskMoveRefusal("done", "planned", "approved"), null);
  eq("plan: skipping needs a reason", taskMoveRefusal("planned", "skipped", "approved", " "), "Say why it is skipped.");
  eq("plan: a closed plan does not change", taskMoveRefusal("planned", "done", "closed"), "Today's plan is closed.");
  eq("plan: a carried task stays carried", taskMoveRefusal("carried", "done", "approved"), "That task cannot change like that.");
  eq("plan: skipped tasks are not counted", planTally([{ state: "done" }, { state: "planned" }, { state: "skipped" }]), { done: 1, of: 2, open: 1 });
  eq("plan: clock", hm(545), "9:05");
  const planSrc = read("convex/ui/plan.ts");
  eq("plan: approve only after Start workday", planSrc.includes("Start your workday first, then approve the plan."), true);
  eq("plan: tasks are deleted only while the plan is a draft", planSrc.indexOf('plan.state !== "draft"') > 0 && planSrc.indexOf('plan.state !== "draft"') < planSrc.indexOf("ctx.db.delete"), true);
  eq("plan: closing carries open tasks, never marks them done", /state: "carried"/.test(read("convex/ui/planRemind.ts")) && !/state: "done", history: historyOf\(t\.history, \{ at: now, by, what: "Carried/.test(read("convex/ui/planRemind.ts")), true);
  eq("plan: bounded reads only", /\.collect\(\)/.test(planSrc), false);

  // Phase 2, reminders (19 Nov): four moments per task, each once, one at a time, no old burst.
  const { momentsOf, dueNow, nextWake, dayStartOf, reminderText } = await import("../convex/ui/planRules");
  const d0 = dayStartOf("2026-11-19");
  const M = 60_000;
  const task = (o: Record<string, unknown> = {}) => ({ key: "a", title: "SAP review", kind: "cv_review", startMin: 540, minutes: 30, state: "planned" as const, ...o });
  eq("remind: Colombo midnight", new Date(d0).toISOString(), "2026-11-18T18:30:00.000Z");
  eq("remind: four moments for a 30 min task", momentsOf(task(), d0).map((m) => [m.moment, (m.at - d0) / M]), [["start", 540], ["near", 564], ["over", 575], ["still", 605]]);
  eq("remind: a short task has no 'nearly due'", momentsOf(task({ minutes: 5 }), d0).map((m) => m.moment), ["start", "over", "still"]);
  eq("remind: a task already started gets no 'starting'", momentsOf(task({ state: "doing" }), d0)[0].moment, "near");
  eq("remind: done tasks are quiet", momentsOf(task({ state: "done" }), d0), []);
  const atStart = dueNow([task()], d0, d0 + 540 * M + 30_000);
  eq("remind: at the start, 'Next: ...'", atStart.deliver?.text, "Next: SAP review (30 min).");
  eq("remind: sent once", dueNow([task({ reminded: ["a:start"] })], d0, d0 + 541 * M).deliver, null);
  const late = dueNow([task()], d0, d0 + 576 * M);
  eq("remind: overdue wins over older moments", late.deliver?.moment, "over");
  eq("remind: and marks the older ones too", late.mark.get("a"), ["start", "over", "near"]);
  const midday = dueNow([task(), task({ key: "b", title: "x", startMin: 700 })], d0, d0 + 702 * M);
  eq("remind: old moments are marked, not sent (no burst after approving late)", midday.deliver?.key, "b");
  eq("remind: the old task's moments are only marked", (midday.mark.get("a") ?? []).length, 4);
  eq("remind: quiet plan sends nothing", dueNow([task()], d0, d0 + 540 * M, d0 + 600 * M).deliver, null);
  eq("remind: a snoozed task waits", dueNow([task({ snoozedUntil: d0 + 560 * M })], d0, d0 + 545 * M).deliver, null);
  eq("remind: next wake is the next moment", (nextWake([task()], d0, d0 + 500 * M)! - d0) / M, 540);
  eq("remind: next wake respects snooze", (nextWake([task({ snoozedUntil: d0 + 550 * M })], d0, d0 + 541 * M)! - d0) / M, 550);
  eq("remind: nothing left, no wake", nextWake([task({ state: "done" })], d0, d0 + 500 * M), null);
  eq("remind: midday wording", reminderText(task({ kind: "midday_email" }), "start", d0, d0), "Time for the Midday email.");
  const remindSrc = read("convex/ui/planRemind.ts");
  eq("remind: one wake-up per plan (the old one is cancelled)", remindSrc.includes("ctx.scheduler.cancel(plan.wakeJobId)"), true);
  eq("remind: an older plan's wake-up does nothing", remindSrc.includes("plan.version !== args.version"), true);
  eq("remind: every plan change re-arms", (read("convex/ui/plan.ts").match(/await arm\(ctx, plan\._id\)/g) ?? []).length >= 5, true);

  // Phase 3, changing the plan by talking (19 Nov): the doc's seven sentences, read with no model.
  const { readChange, applyChange, timeOf, minutesOf } = await import("../convex/ui/planRules");
  const day = [
    { key: "t1", title: "Review SAP suggestions", startMin: 540, minutes: 30, state: "doing" as const },
    { key: "t2", title: "Chase Finance candidates", startMin: 570, minutes: 30, state: "planned" as const },
    { key: "t3", title: "Midday email", startMin: 750, minutes: 30, state: "planned" as const },
  ];
  const now = 555; // 9:15, in the SAP review
  eq("talk: time words", [timeOf("move it to 2:30"), timeOf("at 14:30"), timeOf("by 4pm"), timeOf("till 10 pm")], [870, 870, 960, 1320]);
  eq("talk: minutes words", [minutesOf("another 15 minutes"), minutesOf("half an hour"), minutesOf("1.5 hours")], [15, 30, 90]);
  eq("talk: 'another 15 minutes' extends the task in hand", readChange("I need another 15 minutes to complete this task.", day, now), { change: { op: "extend", key: "t1", minutes: 15 } });
  eq("talk: 'move this task to 2:30 PM'", readChange("Move this task to 2:30 PM.", day, now), { change: { op: "move", key: "t1", atMin: 870 } });
  eq("talk: 'I will complete this task by 4:00 PM'", readChange("I will complete this task by 4:00 PM.", day, now), { change: { op: "set_end", key: "t1", atMin: 960 } });
  eq("talk: 'stop reminding me ... 30 minutes'", readChange("Stop reminding me about this task for the next 30 minutes.", day, now), { change: { op: "snooze", key: "t1", minutes: 30 } });
  eq("talk: 'move my pending tasks to the afternoon'", readChange("Move my pending tasks to the afternoon.", day, now), { change: { op: "shift_pending", atMin: 780 } });
  eq("talk: 'urgent recruitment activity' adds a task now", (readChange("Update my schedule because I have an urgent recruitment activity.", day, now) as { change: { op: string } }).change.op, "add");
  eq("talk: 'I will work till 10 tonight'", readChange("I'll work till 10 tonight", day, now), { change: { op: "set_finish", atMin: 1320 } });
  eq("talk: a task named by its words", readChange("move the finance chase to 11", day, now), { change: { op: "move", key: "t2", atMin: 660 } });
  eq("talk: something it cannot read goes to the model", readChange("hmm what about lunch", day, now), null);
  const ext = applyChange(day, { op: "extend", key: "t1", minutes: 15 }, 1020, now);
  eq("apply: extending slides the next task", "refused" in ext ? ext : [ext.tasks.find((t) => t.key === "t2")?.startMin, ext.changed], [585, ["t1", "t2"]]);
  eq("apply: and says so", "refused" in ext ? "" : ext.say, "Review SAP suggestions now ends at 9:45. Chase Finance candidates moves to 9:45.");
  const pastEnd = applyChange(day, { op: "move", key: "t3", atMin: 1005 }, 1020, now);
  eq("apply: a clash past the finish is said", "refused" in pastEnd ? pastEnd : pastEnd.clashes, ["Midday email now ends after your finish (17:00)."]);
  eq("apply: a done task cannot be moved", applyChange([{ ...day[0], state: "done" }], { op: "move", key: "t1", atMin: 600 }, 1020, now), { refused: "That task is not open any more." });
  const fin = applyChange(day, { op: "set_finish", atMin: 1320 }, 1020, now);
  eq("apply: a later finish", "refused" in fin ? fin : fin.finishMin, 1320);
  const talkSrc = read("convex/ui/planTalk.ts");
  eq("talk: rules first, the model only when they cannot read it", talkSrc.indexOf("readChange(") < talkSrc.indexOf("getAnthropicClient("), true);
  eq("talk: the model's answer is checked (known op, real key)", talkSrc.includes("checked(jsonIn("), true);
  eq("talk: every model call goes in the ledger with the day limit", talkSrc.includes("internal.ui.auraLedger.record") && talkSrc.includes("AI_DAY_LIMIT_USD"), true);

  // Phase 4, Midday and EOD as tasks, done from evidence (19 Nov).
  const p4 = await import("../convex/ui/planRules");
  const draft = [{ key: "a", title: "Review SAP suggestions", kind: "cv_review", startMin: 540, minutes: 30, priority: "high" }];
  const full = p4.withDayEmails(draft, 17 * 60);
  eq("evidence: every plan gets the Midday 12:30 and the EOD 16:30", full.map((t) => [t.kind, t.startMin, t.minutes]), [["cv_review", 540, 30], ["midday_email", 750, 30], ["eod_email", 990, 30]]);
  eq("evidence: the EOD the screen placed sits before the finish", p4.withDayEmails([{ key: "e", title: "EOD", kind: "eod_email", startMin: 1020, minutes: 30, priority: "high" }], 19 * 60).find((t) => t.kind === "eod_email")?.startMin, 1110);
  eq("evidence: no Midday added when the day ends before it", p4.withDayEmails([], 12 * 60).map((t) => t.kind), ["eod_email"]);
  eq("evidence: a taken key is not reused", p4.withDayEmails([{ key: "midday", title: "x", kind: "other", startMin: 600, minutes: 30, priority: "normal" }], 17 * 60).filter((t) => t.kind === "midday_email")[0].key, "midday-2");
  const ticks = [
    { key: "m", kind: "midday_email", jobId: null, state: "planned" as const },
    { key: "e1", kind: "eod_email", jobId: "J1", state: "planned" as const },
    { key: "e2", kind: "eod_email", jobId: "J2", state: "doing" as const },
    { key: "e3", kind: "eod_email", state: "skipped" as const },
  ];
  eq("evidence: a Midday ticks the Midday task", p4.ticksFor(ticks, "midday_email", "J9"), ["m"]);
  eq("evidence: an EOD ticks only its own position's task", p4.ticksFor(ticks, "eod_email", "J2"), ["e2"]);
  eq("evidence: ready check names what is open", p4.readyText([{ label: "Research link", done: false }, { label: "JD approved", done: true }, { label: "Suggestions", done: true }]), "2 of 3 checks done; still open: research link. Ready for the EOD?");
  eq("evidence: ready check when all done", p4.readyText([{ label: "A", done: true }]), "All 1 checks done. Ready for the EOD?");
  const fin2 = p4.applyChange([{ key: "e", title: "EOD", kind: "eod_email", startMin: 990, minutes: 30, state: "planned" }], { op: "set_finish", atMin: 21 * 60 }, 17 * 60, 600);
  eq("evidence: a later finish moves the EOD with it", "refused" in fin2 ? fin2 : [fin2.tasks[0].startMin, fin2.changed], [1230, ["e"]]);
  const mail = read("convex/lib/dailyEmail.ts");
  eq("evidence: every accepted email (not a revision) reaches the plan", mail.includes("if (!email.parentId) await tickFromEmail("), true);
  const ev = read("convex/ui/planEvidence.ts");
  eq("evidence: ticked by the system, approved plans only", ev.includes('doneBy: "system"') && ev.includes('plan.state !== "approved"'), true);
  const crons = read("convex/ta/eodReminders.ts");
  eq("evidence: 17:30 and 18:30 leave planned TAs to their plan", (crons.match(/withoutPlan\(ctx, await outstandingToday\(ctx\)\)/g) ?? []).length, 2);
  const remind = read("convex/ui/planRemind.ts");
  eq("evidence: the lead hears once, after the TA's own finish", remind.includes("leadTold: true") && remind.includes("LEAD_AFTER_MIN"), true);

  // Phase 5, summary, carry-over, close and the lead's view (20 Nov).
  const p5 = await import("../convex/ui/planRules");
  const day5 = [
    { title: "Review SAP", state: "done" as const, doneBy: "ta" },
    { title: "Midday email", state: "done" as const, doneBy: "system", history: [{ what: "12:30–13:00 → 14:00–14:30. Chat: “move it”" }] },
    { title: "Finance chase", state: "carried" as const },
    { title: "LinkedIn post", state: "skipped" as const, reason: "client paused" },
  ];
  eq("close: the summary counts what the plan holds", p5.summaryOf(day5), "2 of 3 done (1 ticked by AURA). Skipped: LinkedIn post (client paused). 1 moved during the day. Carried to tomorrow: Finance chase.");
  eq("close: a day with nothing left says so", p5.summaryOf([{ title: "A", state: "done" as const }]), "1 of 1 done. Nothing carried to tomorrow.");
  eq("close: open work is carried, never done", p5.summaryOf([{ title: "A", state: "planned" as const }]).endsWith("Carried to tomorrow: A."), true);
  const plan5Src = read("convex/ui/plan.ts");
  const remSrc = read("convex/ui/planRemind.ts");
  eq("close: one close for the TA, the EOD and the next morning", (plan5Src.match(/closePlan\(ctx, /g) ?? []).length === 2 && read("convex/ui/planEvidence.ts").includes('closePlan(ctx, fresh, "system"'), true);
  eq("close: open tasks become carried, and the summary is stored", remSrc.includes('state: "carried"') && remSrc.includes("summary, lastReminder"), true);
  eq("close: yesterday's plan wakes to nothing today", remSrc.includes("if (plan.date !== workdayDate(now)) return;"), true);
  eq("carry: today offers the last plan's open work, not its emails", plan5Src.includes("carried: await carriedFrom(") && plan5Src.includes('t.kind !== "eod_email"'), true);
  const teamSrc = plan5Src.slice(plan5Src.indexOf("export const team"));
  eq("lead: the team's plans are desk-wide only and read only", teamSrc.includes("isDeskWideUser(w.user)") && !/ctx\.db\.(patch|insert|delete)/.test(teamSrc), true);

  // "How is my work today?" (20 Nov): the pet's Ask box answers from the person's own day.
  const myDaySrc = read("convex/ui/myDay.ts");
  eq("myDay: asks who you are first", myDaySrc.indexOf("uiUser(ctx, args.as)") > 0 && myDaySrc.indexOf("uiUser(ctx, args.as)") < myDaySrc.indexOf("ctx.db"), true);
  eq("myDay: read only", /ctx\.db\.(patch|insert|delete|replace)/.test(myDaySrc), false);
  eq("myDay: bounded reads, no collect", /\.collect\(\)/.test(myDaySrc), false);
  eq("myDay: only the person's own shortlists, Director moves and emails", myDaySrc.includes('eq("ownerTaId", me)') && myDaySrc.includes("a.ownerTaId === me") && (myDaySrc.match(/eq\("userId", me\)/g) ?? []).length >= 4, true);
  eq("myDay: a revised email is not counted twice", myDaySrc.includes("!e.parentId"), true);
}

// ── Team after creation (20 Nov) ───────────────────────────────────────────
const teamSrc = read("convex/ui/team.ts");
eq("team: only a lead or admin changes who is on", teamSrc.includes("Only a TA Lead or an admin can change who is on an opening."), true);
eq("team: a team needs a TA", teamSrc.includes("A team needs at least one TA on it."), true);
eq("team: only active TAs can be added", teamSrc.includes("Only active TAs can."), true);
eq("team: work mode goes through the old setWorkingStage", teamSrc.includes("internal.ta.openings.setWorkingStage"), true);
eq("team: a TA changes only their own mode", teamSrc.includes("You can change only your own work mode."), true);
eq("team: new people are belled", teamSrc.includes('"opening_assigned"'), true);
eq("team: seats are switched off, never deleted", /ctx\.db\.delete/.test(teamSrc), false);

// ── Several placements on one opening (20 Nov) ─────────────────────────────
eq("target: no number = 1", targetOf({}), 1);
eq("target: headcount used", targetOf({ headcount: 4 }), 4);
eq("fill: 1 of 4 placed stays Active", fillDecision("active", 4, 1, "in"), null);
eq("fill: 4 of 4 placed moves to Placed", fillDecision("active", 4, 4, "in"), "fill");
eq("fill: a single place fills at once", fillDecision("active", 1, 1, "in"), "fill");
eq("fill: a hand-marked Placed is not overruled by a new placement", fillDecision("filled", 4, 2, "in"), null);
eq("fill: on hold is never filled by a placement", fillDecision("on_hold", 2, 2, "in"), null);
eq("reopen: one falls through, 3 of 4", fillDecision("filled", 4, 3, "out"), "reopen");
eq("reopen: still full after a move out stays Placed", fillDecision("filled", 1, 1, "out"), null);
eq("reopen: an Active opening is left alone on a fall-through", fillDecision("active", 4, 2, "out"), null);
eq("target raised on a Placed opening reopens it", fillDecision("filled", 2, 1, "target"), "reopen");
eq("target lowered to the placed number fills it", fillDecision("active", 2, 2, "target"), "fill");
const pl = read("convex/ui/placements.ts");
eq("placements: the target cannot go below the places filled", pl.includes("already filled. The target cannot be lower."), true);
eq("placements: only lead, admin or primary TA", pl.includes("Only a TA Lead, an admin or the primary TA can change the places to fill."), true);
const machine = read("convex/pipeline/pipelineStateMachine.ts");
eq("stage machine: a move into Placed settles the fill", machine.includes('settleFill(ctx, app.jobId, "in")'), true);
eq("stage machine: a move out of Placed settles the fill", machine.includes('settleFill(ctx, app.jobId, "out")'), true);

// ── Opening access requests in the door (20 Nov) ───────────────────────────
const acc = read("convex/ui/access.ts");
eq("access: requests go through the old rules", acc.includes("internal.ta.openingAccess.request") && acc.includes("internal.ta.openingAccess.decide"), true);
eq("access: the list is read by index, never the whole jobs table", acc.includes('withIndex("by_status"') && !/query\("jobs"\)\.collect\(\)/.test(acc), true);
eq("access: a lead's pending list comes from the old rule", acc.includes("listPendingForApprover"), true);
eq("access: only a TA is offered openings to ask for", acc.includes('["ta", "ta_support"].includes(roleOf(me))'), true);

console.log(`\nuidoor: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
