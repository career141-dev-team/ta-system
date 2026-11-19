/**
 * The new UI's door (convex/ui, 18 Nov): the only public functions in the TA
 * backend. They must take the person from the signed-in Clerk identity and
 * nowhere else, reach the same internal rules the old app uses, and answer a
 * refusal in words instead of throwing.
 */
import fs from "node:fs";
import path from "node:path";
import { cardLimit, inWords, scoopFileRefusal, normalizeQuestions, strategyRowsToSubmit, matchableEmail, moveRefusal, toCard, openingCard, BOARD_STAGES, BACKEND_STAGES } from "../convex/ui/rules";

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
  const checked = (src.match(/await (uiUser|openFor|forOpening|manager|postFor)\(ctx/g) ?? []).length;
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

console.log(`\nuidoor: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
