// Run: node src/lib/askAura.check.ts
import { dayAnswer, readAsk, SAMPLE_DAY } from "./askAura.ts";
const eq = (l: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error("FAIL", l, JSON.stringify(a), JSON.stringify(b));
    process.exit(1);
  }
};
const P = [
  { id: "j1", title: "Finance Manager", client: "Hayleys" },
  { id: "j2", title: "SAP Transformation Lead", client: "PGP Glass" },
];
eq("how is my work today", readAsk("how is my work today", P), { kind: "day", topic: "overview" });
eq("how many shortlisted today", readAsk("how many shortlisted I have done today", P), { kind: "day", topic: "shortlisted" });
eq("searches", readAsk("how many searches have I done today", P), { kind: "day", topic: "searches" });
eq("director", readAsk("how many CVs did I send to director", P), { kind: "day", topic: "director" });
eq("what's next", readAsk("what is next on my plan", P), { kind: "day", topic: "plan" });
eq("open pipeline for a position", readAsk("open pipeline for finance", P), { kind: "open", path: "/openings/demo?job=j1&view=pipeline", label: "Pipeline for Finance Manager" });
eq("open a screen", readAsk("go to TA Track", P), { kind: "open", path: "/ta-track", label: "TA Track" });
eq("open a view, no position named", readAsk("open scoops", P), { kind: "open", path: "/openings", label: "Openings - pick the position" });
eq("search people", readAsk("find SAP consultants in Colombo", P), { kind: "search", q: "find SAP consultants in Colombo" });
eq("do we have", readAsk("do we have Ruwan Silva", P), { kind: "search", q: "do we have Ruwan Silva" });
eq("years", readAsk("accountants with 5 years in Kandy", P), { kind: "search", q: "accountants with 5 years in Kandy" });
eq("anything else = chat", readAsk("write a nice note to a candidate", P), { kind: "chat" });
eq("shortlisted answer", dayAnswer(SAMPLE_DAY, "shortlisted").say, "You shortlisted 3 candidates today.");
eq("overview without a workday", dayAnswer(SAMPLE_DAY, "overview").say, "Your workday has not started yet.");
eq("searches answer is honest", dayAnswer(SAMPLE_DAY, "searches").say.startsWith("I do not count"), true);
eq("searches counted", dayAnswer({ ...SAMPLE_DAY, totals: { ...SAMPLE_DAY.totals, searchesToday: 4 } }, "searches").say, "You ran 4 database searches today.");
console.log("askAura: all checks pass");
