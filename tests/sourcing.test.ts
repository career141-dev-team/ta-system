import { parseExclusions, plain, sameName, profileFacts, rankFields } from "../src/lib/sourcing";

let passed = 0;
let failed = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("reading a ranked line");
const seven = rankFields("[3] | 82 | priority | Jane Perera | Senior Accountant at Hayleys | CIMA, 6 years at Hayleys | NONE");
ok("seven fields with a score", seven?.score === 82 && seven.tier === "priority" && seven.name === "Jane Perera");
const six = rankFields("3 | screen | Jane | Accountant | reason | concern");
ok("the older six-field form still reads, without a score", six?.score === null && six.tier === "screen" && six.concern === "concern");
ok("a line that is not a row is ignored", rankFields("Here are the candidates:") === null);

console.log("\nplain text");
ok("markdown bold is removed", plain("**Sri Lanka-based.** 3 years") === "Sri Lanka-based. 3 years");

console.log("\nfacts from the search result, never from the model");
ok("company from 'Name - Title - Company'", profileFacts({ title: "Kasun Silva - Senior Engineer - WSO2", snippets: [] }).company === "WSO2");
ok("company from 'Title at Company'", profileFacts({ title: "Kashmetha M. - Software Engineer at Axiata Digital Labs", snippets: [] }).company === "Axiata Digital Labs");
ok("location from the snippet", profileFacts({ title: "A - B", snippets: ["Experience: WSO2 · Location: Colombo · 500+ connections"] }).location === "Colombo");
ok("nothing invented when absent", profileFacts({ title: "Name only", snippets: ["no facts"] }).company === null);

console.log("\nreading the reject list, whatever form the model uses");
const pipe = parseExclusions("3 | different discipline\n[5] | too junior\nINDEX | REASON", 10);
ok("the asked-for pipe form", pipe.size === 2 && pipe.get(3) === "different discipline" && pipe.get(5) === "too junior");
const dash = parseExclusions("[0] Reject - aviation pricing, not freight\n\n[11] Reject - level far below", 20);
ok("'[n] Reject - reason', as DeepSeek wrote it", dash.size === 2 && dash.get(11) === "level far below", JSON.stringify([...dash]));
ok("a kept line is not a rejection", parseExclusions("[2] Keep - right work\n4: Reject: wrong sector", 10).size === 1);
ok("NONE rejects nobody", parseExclusions("NONE", 10).size === 0);
// Haiku's walk-through form (25 Nov): every row, each ending with its verdict.
const walk = parseExclusions("0 | Oshani Ellepola: Senior Brand Manager at Unilever. Strong match. Keep.\n3 | Priyanjali: Finance Manager. Wrong discipline (finance). Reject.\n12 | Gayendra: level borderline, keep rather than reject, as the evidence is thin. Keep, as the level is borderline.", 20);
ok("a line ending in Keep is kept; one ending in Reject is rejected", walk.size === 1 && walk.has(3));
ok("the profile's own name matches", sameName("Oshani Ellepola", "Oshani Ellepola") && sameName("", "Anyone") && sameName("Gayendra N. Rajapaksha", "Gayendra Rajapaksha"));
ok("a name from another person does not", !sameName("Roy Khanna", "Gayan Abeysinghe") && !sameName("Pranavan Raveendran", "Jayampathi Mawilmada"));
ok("'Not rejected; retained.' is a keep", parseExclusions("2 | Not rejected; retained.\n3 | Discipline mismatch: finance manager.\n4 | Do not reject: right work", 10).size === 1);
ok("the explicit KEEP/REJECT form", (() => { const x = parseExclusions("0 | KEEP | right work\n1 | REJECT | finance, not brand\n2 | **KEEP** - fits, so no rejection\n3 | a direct fit, so no rejection", 10); return x.size === 1 && x.get(1) === "finance, not brand"; })());
ok("an index past the list is ignored", parseExclusions("[40] | wrong", 10).size === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
