/**
 * Draft my EOD (AI-FLOWS 4, 23 Nov 2026): convex/ui/eodDraftRules.ts (what Haiku is
 * told and what of its answer reaches the email's NOTES column) and the action's order.
 */
import fs from "node:fs";
import { cleanDraft, eodTurn, type DraftPerson } from "../convex/ui/eodDraftRules";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

// ── Haiku's answer ──
eq("not an object is refused", cleanDraft("no", ["a"]), null);
eq("no notes key is refused", cleanDraft({ say: "hi" }, ["a"]), null);
eq("only the people asked about", cleanDraft({ notes: { a: ["Led SAP S/4 rollout for 3 plants"], z: ["Invented person"] } }, ["a"]), { a: ["Led SAP S/4 rollout for 3 plants"] });
eq("at most 2 lines, repeats and bullets dropped", cleanDraft({ notes: { a: ["- ACCA qualified", "ACCA qualified", "Big 4 audit", "Third line"] } }, ["a"]), { a: ["ACCA qualified", "Big 4 audit"] });
eq("lines about salary, notice or age are dropped", cleanDraft({ notes: { a: ["Expects LKR 400k salary", "Notice 1 month", "Aged 34", "Strong in IFRS reporting"] } }, ["a"]), { a: ["Strong in IFRS reporting"] });
eq("each line cut to 100", cleanDraft({ notes: { a: ["x".repeat(300)] } }, ["a"])?.a?.[0].length, 100);
eq("a person with nothing left gets no entry", cleanDraft({ notes: { a: ["", "ok"], b: "not a list" } }, ["a", "b"]), {});

// ── What the model sees ──
const p: DraftPerson = { id: "app1", name: "Kasun Perera", title: "Finance Manager", employer: "Hayleys", years: 9, skills: ["IFRS", "SAP"], cvText: "z".repeat(9000) };
const t = eodTurn({ title: "Head of Finance", client: "Q Collection" }, [p]);
eq("the job, the id, the record and skills", [t.includes("JOB: Head of Finance at Q Collection"), t.includes("CANDIDATE id=app1"), t.includes("9 years"), t.includes("Skills: IFRS, SAP")], [true, true, true, true]);
eq("CV text capped at 4,000", t.length < 4500, true);

// ── The action ──
const act = fs.readFileSync("convex/ui/eodDraft.ts", "utf8");
eq("asks ui/me:whoAmI first", act.indexOf("api.ui.me.whoAmI") < act.indexOf("eodDraftRead.people"), true);
eq("reads the email as the signed-in person", act.includes("eodDraftRead.people, { userId, ...a }"), true);
eq("the desk's daily allowance and the ledger ('eod')", act.includes("AI_DAY_LIMIT_USD") && act.includes('feature: "eod"'), true);
eq("saves nothing but the ledger", (act.match(/runMutation\(/g) ?? []).length, 1);
const read = fs.readFileSync("convex/ui/eodDraftRead.ts", "utf8");
eq("the rows come from ta/dailyEmails:compose (its access check)", read.includes("internal.ta.dailyEmails.compose"), true);
eq("the read is internal", read.includes("internalQuery") && !/\bquery\(\{/.test(read), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
