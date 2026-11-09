import assert from "node:assert/strict";
import { matchCandidate, ruleFromWords, sanitizeRule, usableEmail, type ContactRule } from "../convex/lib/contactRule";

const rule = (r: Partial<ContactRule> & { titles: string[] }) => {
  const s = sanitizeRule(r);
  if ("error" in s) throw new Error(s.error);
  return s;
};

// The rule is checked before it is trusted.
assert.deepEqual(sanitizeRule({ titles: [] }), { error: "The rule needs at least one job title to look for." });
assert.deepEqual(sanitizeRule(null), { error: "The rule needs at least one job title to look for." });
const s = rule({ titles: ["  Customer Experience Manager ", "CX-Manager", "customer experience manager", 7 as any], levels: [5, 99, -1, 2.5, 5] as any });
assert.deepEqual(s.titles, ["customer experience manager", "cx manager"]);
assert.deepEqual(s.levels, [5]);
assert.equal(s.label, "customer experience manager");
assert.equal(s.includePastRoles, true);

// Without a model: the request words go, the seniority word becomes levels, only the last word is made singular.
const dev = ruleFromWords("Get all Junior Developers");
assert.ok(!("error" in dev));
if (!("error" in dev)) { assert.deepEqual(dev.titles, ["developer"]); assert.deepEqual(dev.levels, [0, 1]); assert.equal(dev.label, "Junior Developers"); }
const sales = ruleFromWords("Find all Sales Managers");
if (!("error" in sales)) assert.deepEqual(sales.titles, ["sales manager"]);
const fin = ruleFromWords("financial professionals");
if (!("error" in fin)) assert.deepEqual(fin.titles, ["financial professional"]);
assert.ok("error" in ruleFromWords("find all candidates"));

// Whole words only, and the exclude list wins.
const devRule = rule({ titles: ["developer", "software engineer"], exclude: ["business developer"], levels: [0, 1] });
assert.equal(matchCandidate({ currentJobTitle: "Junior Developer" }, devRule)?.kind, "current");
assert.equal(matchCandidate({ currentJobTitle: "Business Developer" }, devRule), null);
assert.equal(matchCandidate({ currentJobTitle: "Business Development Executive" }, devRule), null);
// Level: a bare "Software Engineer" is junior only with under two years.
assert.equal(matchCandidate({ currentJobTitle: "Software Engineer", totalExperienceYears: 1 }, devRule)?.level, 1);
assert.equal(matchCandidate({ currentJobTitle: "Software Engineer", totalExperienceYears: 6 }, devRule), null);
// A senior now is not on a junior list because they were junior once.
assert.equal(matchCandidate({ currentJobTitle: "Senior Developer", jobHistory: [{ title: "Junior Developer", startDate: "2019-01" }] }, devRule), null);
// The classifier's level, when the record has one, beats the title words.
assert.equal(matchCandidate({ currentJobTitle: "Developer", currentRoleRank: 3 }, devRule), null);

// An earlier title counts only when the current one is another job, and says so.
const cx = rule({ titles: ["customer experience manager", "customer success manager"] });
const past = matchCandidate({
  currentJobTitle: "Operations Director",
  jobHistory: [{ title: "Customer Success Manager", startDate: "2021-03" }, { title: "Customer Experience Manager", startDate: "2018-01" }],
}, cx);
assert.deepEqual(past && { kind: past.kind, title: past.title, matchedBy: past.matchedBy }, { kind: "previous", title: "Customer Success Manager", matchedBy: "customer success manager" });
assert.equal(matchCandidate({ currentJobTitle: "Operations Director", pastJobTitles: ["CX lead", "Customer Experience Manager"] }, cx)?.kind, "previous");
assert.equal(matchCandidate({ currentJobTitle: "Operations Director", pastJobTitles: ["Customer Experience Manager"] }, { ...cx, includePastRoles: false }), null);
assert.equal(matchCandidate({}, cx), null);

// Skills, when asked, must all be there.
const react = rule({ titles: ["developer"], skills: ["React", "TypeScript"] });
assert.ok(matchCandidate({ currentJobTitle: "Developer", skills: ["React", "TypeScript", "CSS"] }, react));
assert.equal(matchCandidate({ currentJobTitle: "Developer", skills: ["React"] }, react), null);
assert.ok(matchCandidate({ currentJobTitle: "Developer", skills: ["React"], summary: "Five years of TypeScript." }, react));

// A CV's "N/A" is never a contact.
assert.equal(usableEmail(" Asha@Example.COM "), "asha@example.com");
assert.equal(usableEmail("N/A"), null);
assert.equal(usableEmail(""), null);
assert.equal(usableEmail("a@b"), null);

// The door: only the five shapes it serves, and cells Excel will not run.
const { parseDiscoverPath, csvCell } = await import("../convex/integrations/contactsHttp");
const id = "k57abcdefghij0123";
assert.deepEqual(parseDiscoverPath(`/integrations/v1/contacts/discover/${id}`), { id, rest: "" });
assert.deepEqual(parseDiscoverPath(`/integrations/v1/contacts/discover/${id}/run`), { id, rest: "run" });
assert.deepEqual(parseDiscoverPath(`/integrations/v1/contacts/discover/${id}/rows.csv`), { id, rest: "rows.csv" });
assert.equal(parseDiscoverPath(`/integrations/v1/contacts/discover/${id}/delete`), null);
assert.equal(parseDiscoverPath(`/integrations/v1/contacts/discover/../tables`), null);
assert.equal(csvCell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
assert.equal(csvCell("+94 77 123 4567"), "+94 77 123 4567");
assert.equal(csvCell("+cmd|' /C calc'!A0"), `'+cmd|' /C calc'!A0`);
assert.equal(csvCell("Smith, Jane"), `"Smith, Jane"`);
assert.equal(csvCell(undefined), "");

// The new tables are private to their own token, like Extras.
const { PARTNER_PRIVATE_TABLES } = await import("../convex/integrations/partnerRead");
for (const t of ["contactSearches", "contactSearchRows"]) assert.ok((PARTNER_PRIVATE_TABLES as readonly string[]).includes(t));

console.log("contactRule: ok");
