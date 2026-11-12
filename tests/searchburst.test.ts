/**
 * One keyword search is bounded and a database search no longer bursts (12 Nov;
 * Track A row 17 cause 3: `matching/search:searchCandidates` 9.2 s live).
 *
 *   - a search index hit is a whole row, and a candidateResumes row carries the
 *     CV text plus a 1,024-float embedding: the text index is capped
 *   - the caller's limit is clamped (Boolean mode asked 600 per term)
 *   - the "CV file missing" rows are read together, not one awaited get each
 *   - the app runs keyword terms two at a time instead of six at once
 */
import fs from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const search = read("convex/matching/search.ts");
const fn = search.slice(search.indexOf("export const searchCandidates"), search.indexOf("export const searchByEmployer"));
eq("the caller's limit is clamped", fn.includes("const limit = Math.min(args.limit ?? 20, SEARCH_LIMIT_MAX);"), true);
eq("the CV-text index has its own ceiling", fn.includes('withSearchIndex("search_text", (q: any) => q.search("rawText", args.query)).take(Math.min(limit, RESUME_HITS_MAX))'), true);
const limits = { max: Number(/const SEARCH_LIMIT_MAX = (\d+);/.exec(search)?.[1]), resume: Number(/const RESUME_HITS_MAX = (\d+);/.exec(search)?.[1]) };
eq("the ceilings are written down and the text one is the smaller", limits.max > 0 && limits.resume > 0 && limits.resume <= limits.max, true);
eq("missing-file rows are read together", fn.includes("await Promise.all(unread.map((id) => ctx.db.get(id)))") && !fn.includes("?? (await ctx.db.get(f.candidateId))"), true);

const backend = read("src/data/convex/backend.ts");
const many = backend.slice(backend.indexOf("export async function keywordSearchMany"), backend.indexOf("export async function employerSearch"));
eq("keyword terms run a few at a time", many.includes("for (let i = 0; i < terms.length; i += KEYWORD_CONCURRENCY)") && /const KEYWORD_CONCURRENCY = [1-3];/.test(backend), true);
eq("every term is still awaited and a failed one still reported", many.includes("const failed = settled.filter((r) => r.status === \"rejected\");") && !many.includes(".catch(() => [])"), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
