/**
 * The TA judge on a reverse match (convex/lib/taJudge): anonymous lines, the
 * n|score|reason answer, the order it makes, and one person once.
 */
import { applyJudge, dedupeByPerson, judgeLine, judgePrompt, readJudge, JUDGE_FLOOR } from "../convex/lib/taJudge";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

console.log("\nthe line the model reads");
{
  const line = judgeLine(3, { title: "Garment Technologist", company: "Brandix", years: 5.34, location: "Horana", skills: ["fit", "tech pack|x", "AQL"] });
  eq("title, employer, years, place, skills — and no pipe inside", line, "3. Garment Technologist at Brandix · 5.3 yrs · Horana · fit, tech pack x, AQL");
  eq("missing parts are said", judgeLine(1, { title: "", company: "", years: null, location: "", skills: [] }), "1. title not stated at employer not stated · years not stated · place not stated");
  const p = judgePrompt({ title: "Brand Manager", minYears: 5, location: "Colombo", industry: "FMCG" }, ["1. x"]);
  eq("the prompt carries the job and the format", [p.user.includes("Experience: 5+ years"), p.user.includes("n|score|reason")], [true, true]);
}

console.log("\nreading the answer");
{
  const v = readJudge("Here you go:\n1|88|Garment technologist at the right level\n2 | 40 | Cutting manager, different work\n[3] 71 - close\n9|90|not asked\n1|10|repeat", 3);
  eq("three read, the extra and the repeat ignored", [...v.keys()], [1, 2, 3]);
  eq("score and reason", v.get(1), { score: 88, reason: "Garment technologist at the right level" });
}

console.log("\nthe order it makes");
{
  const rows = [
    { cvId: "a", overallScore: 100, reason: "engine A" },
    { cvId: "b", overallScore: 99, reason: "engine B" },
    { cvId: "c", overallScore: 98, reason: "" },
  ];
  const out = applyJudge(rows, new Map([[1, { score: 72, reason: "close" }], [2, { score: 91, reason: "exact" }], [3, { score: JUDGE_FLOOR - 1, reason: "no" }]]));
  eq("best judged first, under the floor out", out.map((r) => [r.cvId, r.overallScore]), [["b", 91], ["a", 72]]);
  eq("the judge's reason leads", out[0].reason, "exact — engine B");
  eq("no answer: the engine's list stands", applyJudge(rows, new Map()).map((r) => r.cvId), ["a", "b", "c"]);
  eq("judge would leave nobody: the engine's list stands", applyJudge(rows, new Map([[1, { score: 5, reason: "" }]])).length, 3);
}

console.log("\none person once");
{
  const rows = dedupeByPerson([
    { candidateName: "Shanthini Perera", candidateRole: "Marketing Manager" },
    { candidateName: "shanthini  perera", candidateRole: "Marketing Manager" },
    { candidateName: "Shanthini Perera", candidateRole: "Brand Manager" },
    { candidateName: "", candidateRole: "x" },
    { candidateName: "", candidateRole: "x" },
  ]);
  eq("same name and title once; a different title or no name kept", rows.length, 4);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
