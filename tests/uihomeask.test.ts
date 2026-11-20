/**
 * D11 item 5 (20 Nov 2026): Haiku behind the lead/Director/Ops home chat and the
 * Strategy plan chat (convex/ui/homeAskRules.ts, convex/ui/homeAsk.ts).
 */
import fs from "node:fs";
import { cleanPlan, homeTurn, planTurn, HOME_SYSTEM } from "../convex/ui/homeAskRules";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

// ── The home chat ──
eq("the role is named in what the model is told", HOME_SYSTEM("Director").includes("answering the Director"), true);
eq("a big desk is cut so it cannot grow the bill", homeTurn({ team: "x".repeat(50000) }, "who is behind?").length < 30200, true);
eq("the question goes last", homeTurn({ a: 1 }, "who is behind?").endsWith("They ask: who is behind?"), true);

// ── The plan chat: only the real list and team ──
const S = ["Direct headhunt", "Referral extraction", "LinkedIn post"];
const T = ["u1", "u2"];
eq("a reading on the list and team is kept", cleanPlan({ picks: [{ name: "direct headhunt", ta: "u1" }], day: 3, off: false, tas: ["u1"] }, S, T, 2), { picks: [{ name: "Direct headhunt", ta: "u1" }], day: 3, off: false, tas: ["u1"] });
eq("a strategy not on the list is dropped", cleanPlan({ picks: [{ name: "Cold calling" }, { name: "LinkedIn post" }], tas: [] }, S, T, 0)?.picks, [{ name: "LinkedIn post" }]);
eq("a TA not on the team is dropped", cleanPlan({ picks: [{ name: "LinkedIn post", ta: "evil" }], tas: ["evil", "u2"] }, S, T, 0), { picks: [{ name: "LinkedIn post" }], off: false, tas: ["u2"] });
eq("a day past Friday or before today is not taken", [cleanPlan({ picks: [{ name: "LinkedIn post" }], day: 6 }, S, T, 1)?.day, cleanPlan({ picks: [{ name: "LinkedIn post" }], day: 0 }, S, T, 2)?.day], [undefined, undefined]);
eq("'take off' is kept", cleanPlan({ picks: [{ name: "LinkedIn post" }], off: true }, S, T, 0)?.off, true);
eq("nothing placed + a question = the question", cleanPlan({ ask: "Which strategy?" }, S, T, 0), { picks: [], off: false, tas: [], ask: "Which strategy?" });
eq("nothing placed and no question = nothing", cleanPlan({ picks: [{ name: "Nope" }] }, S, T, 0), null);
eq("the model sees the list, the team and today", (() => {
  const t = planTurn({ text: "put u1 on headhunt", strategies: S, tas: [{ id: "u1", name: "Dilini" }], today: 2 });
  return [t.includes("Direct headhunt | Referral extraction"), t.includes("u1=Dilini"), t.includes("TODAY: 2")];
})(), [true, true, true]);

// ── The actions ──
const src = fs.readFileSync("convex/ui/homeAsk.ts", "utf8");
eq("both ask ui/me:whoAmI first", (src.match(/runQuery\(api\.ui\.me\.whoAmI/g) ?? []).length, 2);
eq("the home desk is read again as the person asking", src.includes("api.ui.lead.desk") && src.includes("api.ui.homes.director") && src.includes("api.ui.homes.ops"), true);
eq("the desk's daily allowance and the ledger", src.includes("AI_DAY_LIMIT_USD") && src.includes("auraLedger.record"), true);
eq("saves nothing but the ledger", (src.match(/runMutation\(/g) ?? []).length, 1);
eq("has a time limit", /TIMEOUT_MS = 20_000/.test(src), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
