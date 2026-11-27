// Run: node src/app/database/live.check.ts
import { jobIn, noticeMonths, parseSavedTurns, pastChats, personOf, readLive, serializeTurns, whoIn } from "./live.ts";
const eq = (l: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error("FAIL", l, JSON.stringify(a), JSON.stringify(b));
    process.exit(1);
  }
};
eq("a first search", readLive("SAP leads in Colombo", ""), { kind: "search", mode: "natural", q: "SAP leads in Colombo" });
eq("a refinement adds a line", readLive("8+ years", "SAP leads in Colombo"), { kind: "search", mode: "natural", q: "SAP leads in Colombo\n8+ years" });
eq("boolean as written", readLive('SAP AND "S/4HANA" NOT Dialog', "x"), { kind: "search", mode: "boolean", q: 'SAP AND "S/4HANA" NOT Dialog' });
eq("do we have", readLive("Do we have Ruwan Silva?", ""), { kind: "names", names: ["Ruwan Silva"] });
eq("a list of names", readLive("Ruwan Silva\nNimal Perera", ""), { kind: "names", names: ["Ruwan Silva", "Nimal Perera"] });
eq("people like", readLive("Find people like Kasun Perera", "x"), { kind: "like", name: "Kasun Perera" });
eq("add", readLive("Add the top 3 to Finance Manager", "x"), { kind: "add", who: "the top 3", job: "Finance Manager" });
eq("shortlist", readLive("Shortlist Kasun Perera for SAP Lead · PGP Glass", "x"), { kind: "add", who: "Kasun Perera", job: "SAP Lead · PGP Glass" });
eq("start over", readLive("Start over", "x"), { kind: "startOver" });
eq("remove", readLive("Remove in Colombo", "x"), { kind: "remove" });
eq("notice", [noticeMonths("Immediate"), noticeMonths("30 days"), noticeMonths("2 months"), noticeMonths(null)], [0, 1, 2, 99]);
const p = personOf({ id: "c1", name: "Kasun Perera", title: "SAP Lead", company: "Hayleys", city: "Colombo", years: 9, notice: "30 days", score: 82, why: "Led two rollouts", hasCv: true }, "u");
eq("person", [p.why, p.notice, p.cv, p.score], ["Led two rollouts · 9 yrs · notice 30 days", 1, "u", 82]);
const last = [p, { ...p, id: "c2", name: "Nimal Silva" }, { ...p, id: "c3", name: "Amal Fernando" }];
eq("who: named", whoIn("Add Nimal Silva to x", last).map((x) => x.id), ["c2"]);
eq("who: top 2", whoIn("Add the top 2 to x", last).map((x) => x.id), ["c1", "c2"]);
const jobs = [{ id: "j1", title: "Finance Manager", client: "Hayleys" }, { id: "j2", title: "SAP Lead", client: "PGP Glass" }];
eq("job by word", jobIn("finance manager", jobs)?.id, "j1");
eq("job unclear", jobIn("manager lead", jobs), null);
eq("past chats once", pastChats([{ id: "b", query: "SAP\n8 years", at: 2 }, { id: "a", query: "SAP", at: 1 }, { id: "c", query: "CIMA", at: 0 }]).map((r) => r.id), ["b", "c"]);
console.log("live: all checks pass");

// 26 Nov 2026: a pasted brief with a capital "OR" is plain words, not a formula.
const brief = "We are looking for a Head of Finance for a leading hospital in Sri Lanka. Should be fully qualified ACA or CIMA OR ACCA. Female candidates only.";
eq("a brief with OR is plain words", readLive(brief, ""), { kind: "search", mode: "natural", q: brief });
eq("a bracketed formula in a sentence stays boolean", readLive("Find (SAP OR ERP) AND Colombo.", ""), { kind: "search", mode: "boolean", q: "Find (SAP OR ERP) AND Colombo." });
eq("a short formula stays boolean", readLive("(SAP OR ERP) AND Colombo NOT Accenture", ""), { kind: "search", mode: "boolean", q: "(SAP OR ERP) AND Colombo NOT Accenture" });

// 27 Nov 2026: persistent chats stay independent by chatId and round-trip saved turns safely.
eq(
  "past chats keep distinct chatIds independent",
  pastChats([
    { id: "1", chatId: "c_a", query: "SAP", at: 2 },
    { id: "2", chatId: "c_b", query: "SAP", at: 1 },
    { id: "3", chatId: "c_a", query: "SAP\n8 years", at: 3 },
  ]).map((r) => r.id),
  ["1", "2"],
);
const saved = serializeTurns([{ id: "t1", from: "me", text: "hi" }, { id: "t2", from: "aura", text: "found 2" }]);
eq("saved turns round-trip", parseSavedTurns<{ id: string }>(saved).map((t) => t.id), ["t1", "t2"]);
eq("corrupt turnsJson returns empty", parseSavedTurns("not-json"), []);
