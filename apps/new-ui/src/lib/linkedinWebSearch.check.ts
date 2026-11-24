// Run from the repo root: node --experimental-strip-types --import ./tests/alias.mjs apps/new-ui/src/lib/linkedinWebSearch.check.ts
import { readTitle, toWebFound, webQueries } from "./linkedinWebSearch";
const eq = (l: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", l, a, b); process.exit(1); } };
const ask = { titles: ["Brand Manager"], companies: ["Unilever"], locations: ["Colombo"], keywords: ["FMCG"], years: "", minYears: 0 };

eq("title, company and place first, then the skills", webQueries(ask), [
  'site:linkedin.com/in "Brand Manager" "Unilever" "Colombo"',
  'site:linkedin.com/in "Brand Manager" "FMCG" Colombo',
]);
eq("no place given: Sri Lanka", webQueries({ ...ask, companies: [], locations: [], keywords: [] }), ['site:linkedin.com/in "Brand Manager" "Sri Lanka"']);
eq("name and headline from the result title", readTitle("Oshani Ellepola - Senior Brand Manager - Unilever | LinkedIn"), { name: "Oshani Ellepola", headline: "Senior Brand Manager - Unilever" });
const f = toWebFound({ url: "https://lk.linkedin.com/in/oshani-e/", title: "Oshani Ellepola - Senior Brand Manager - Unilever", snippet: "Brand manager for Sunsilk at Unilever in Colombo, FMCG." }, ask);
eq("one link per person, on www", f.url, "https://www.linkedin.com/in/oshani-e");
eq("the brief checked against what the result says", f.checks.map((c) => c.ok), [true, true, true, true]);
eq("the place it names", f.place, "Colombo");
console.log("linkedinWebSearch: all checks pass");
