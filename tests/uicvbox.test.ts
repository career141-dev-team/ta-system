/**
 * The green box on a Prepared CV from the new UI (D11 item 4, 20 Nov 2026):
 * src/lib/uiCvBox.ts (what /api/ui/cv-box takes and sends to the old save) and
 * convex/ui/cvAgentRules.ts (what of Haiku's answer reaches the CV popup).
 */
import fs from "node:fs";
import { boxNotesToSend, ownNotes, readBoxBody } from "../src/lib/uiCvBox";
import { cleanCvAnswer, cvTurn, type BoxText } from "../convex/ui/cvAgentRules";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

// ── The route's body ──
eq("nothing sent is refused", readBoxBody(null).ok, false);
eq("no application is refused", readBoxBody({ openingId: "o1" }).ok, false);
const b = readBoxBody({ appId: "a1", openingId: "o1", designation: "  Finance Manager ", currentSalary: 450000, notes: ["Speaks Tamil", "", "x".repeat(400)], extra: "dropped" });
eq("fields trimmed, a non-text value becomes empty, extras ignored", b.ok && [b.body.designation, b.body.currentSalary, Object.keys(b.body).includes("extra")], ["Finance Manager", "", false]);
eq("empty notes dropped, long notes cut to 300", b.ok && [b.body.notes?.length, b.body.notes?.[1].length], [2, 300]);
eq("no notes key = leave the notes as they are", (readBoxBody({ appId: "a", openingId: "o" }) as { body: { notes: unknown } }).body.notes, null);
eq("notes not a list is refused", readBoxBody({ appId: "a", openingId: "o", notes: "x" }).ok, false);
eq("the system's own notes stay out of the box", ownNotes(["Matched from the database (82%)", ">Historical import", "**Strong** in audit"]), ["**Strong** in audit"]);
eq("box unchanged: the held notes go back with their marks", boxNotesToSend(null, ["**Strong** in audit"]), ["**Strong** in audit"]);
eq("box changed: its notes go", boxNotesToSend(["Strong in audit", "Speaks Tamil"], ["**Strong** in audit"]), ["Strong in audit", "Speaks Tamil"]);

// ── Haiku's answer ──
const box: BoxText = { designation: "Accountant", company: "Hayleys", currentSalary: "LKR 300k", expectedSalary: "", notice: "1 month", notes: ["ACCA part qualified"] };
eq("an answer from the CV", cleanCvAnswer({ kind: "answer", say: "  Eight years in audit. " }, box), { kind: "answer", say: "Eight years in audit." });
eq("an empty answer is refused", cleanCvAnswer({ kind: "answer", say: " " }, box), null);
eq("an unknown shape is refused", cleanCvAnswer({ kind: "send_email" }, box), null);
const changed = cleanCvAnswer({ kind: "box", content: { expectedSalary: "LKR 450k", notes: ["ACCA part qualified", "Speaks Tamil"] }, reply: "Added the expected salary and a note." }, box);
eq("a box change keeps every field it did not name", changed && changed.kind === "box" && changed.content, { ...box, expectedSalary: "LKR 450k", notes: ["ACCA part qualified", "Speaks Tamil"] });
eq("notes capped at 12, each at 200", (() => {
  const c = cleanCvAnswer({ kind: "box", content: { notes: Array.from({ length: 20 }, () => "y".repeat(250)) } }, box);
  return c && c.kind === "box" ? [c.content.notes.length, c.content.notes[0].length] : null;
})(), [12, 200]);
eq("a change with no box starts from an empty one", (() => {
  const c = cleanCvAnswer({ kind: "box", content: { notice: "Immediate" } }, null);
  return c && c.kind === "box" ? c.content : null;
})(), { designation: "", company: "", currentSalary: "", expectedSalary: "", notice: "Immediate", notes: [] });
eq("the model sees the box, the CV text (capped) and the words", (() => {
  const t = cvTurn({ said: "salary is 450k now", box, cvText: "z".repeat(20000) });
  return [t.includes('"designation":"Accountant"'), t.includes("RECRUITER: salary is 450k now"), t.length < 13000];
})(), [true, true, true]);

// ── The action and the route ──
const act = fs.readFileSync("convex/ui/cvAgent.ts", "utf8");
eq("asks ui/me:whoAmI before the model", act.indexOf("api.ui.me.whoAmI") < act.indexOf("getAnthropicClient(TIMEOUT"), true);
eq("the desk's daily allowance and the ledger ('cv')", act.includes("AI_DAY_LIMIT_USD") && act.includes('feature: "cv"'), true);
eq("saves nothing but the ledger", (act.match(/runMutation\(/g) ?? []).length, 1);
const route = fs.readFileSync("src/app/api/ui/cv-box/route.ts", "utf8");
eq("route: reading needs the Prepared CV's own test", route.includes("mayOpenCv(user, app.candidateId, app.id)"), true);
eq("route: saving goes through the old saveReviewDetails", route.includes("inline(() => saveReviewDetails(form))"), true);
eq("route: the application must be on the opening it names", route.includes("app.openingId !== b.openingId"), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
