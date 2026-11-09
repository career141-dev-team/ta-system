import assert from "node:assert/strict";
import { isMiss, levelFromYears, matchCandidate, ruleFromWords, sanitizeRule, stopPatch, storedLevel, usableEmail, type ContactRule } from "../convex/lib/contactRule";

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

// A miss says why, so every search can count its drop-outs.
const why = (c: Parameters<typeof matchCandidate>[0], r: ContactRule) => {
  const m = matchCandidate(c, r);
  return isMiss(m) ? m.miss : m.kind;
};
const lvl = (c: Parameters<typeof matchCandidate>[0], r: ContactRule) => {
  const m = matchCandidate(c, r);
  return isMiss(m) ? m.miss : m.level;
};

// Whole words only, and the exclude list wins.
const devRule = rule({ titles: ["developer", "software engineer"], exclude: ["business developer"], levels: [0, 1] });
assert.equal(why({ currentJobTitle: "Junior Developer" }, devRule), "current");
assert.equal(why({ currentJobTitle: "Business Developer" }, devRule), "other_job");
assert.equal(why({ currentJobTitle: "Business Development Executive" }, devRule), "other_job");
// Words in any order (10 Nov): "Engineer - Software" and "Software Development Engineer" are software engineers.
const swe = rule({ titles: ["software engineer"] });
assert.equal(why({ currentTitle: "Engineer - Software" }, swe), "current");
assert.equal(why({ currentTitle: "Software Development Engineer" }, swe), "current");
assert.equal(why({ currentTitle: "Civil Engineer" }, swe), "other_job");
// currentTitle (what the CV reader writes) is read before currentJobTitle.
assert.equal(why({ currentTitle: "Software Engineer", currentJobTitle: "Sales Executive" }, swe), "current");

// Level: a bare title takes the CV reader's stored level, then the years (10 Nov:
// it was always mid-level, so "815 senior developers out of 92,000").
const senior = rule({ titles: ["developer", "software engineer"], levels: [3, 4] });
assert.equal(lvl({ currentTitle: "Software Engineer", seniorityLevel: "Senior", totalExperienceYears: 8 }, senior), 3);
assert.equal(lvl({ currentTitle: "Software Engineer", totalExperienceYears: 8 }, senior), 3);
assert.equal(lvl({ currentTitle: "Software Engineer", yearsOfExperience: 12 }, senior), 4);
assert.equal(lvl({ currentTitle: "Software Engineer", seniorityLevel: "Lead/Principal" }, senior), 4);
assert.equal(why({ currentTitle: "Software Engineer", totalExperienceYears: 3 }, senior), "level");
// A level word in the title still decides, whatever the years.
assert.equal(why({ currentTitle: "Junior Developer", totalExperienceYears: 9 }, senior), "level");
assert.equal(lvl({ currentTitle: "Senior Developer", totalExperienceYears: 1 }, senior), 3);
// Nobody knows the level: let through, labelled.
const unknown = matchCandidate({ currentTitle: "Developer" }, senior);
assert.ok(!isMiss(unknown) && unknown.level === null && unknown.levelLabel === "Not known");
// Junior: one year is junior, three is not.
assert.equal(lvl({ currentJobTitle: "Software Engineer", totalExperienceYears: 1 }, devRule), 1);
assert.equal(why({ currentJobTitle: "Software Engineer", totalExperienceYears: 6 }, devRule), "level");
// A senior now is not on a junior list because they were junior once.
assert.equal(why({ currentJobTitle: "Senior Developer", jobHistory: [{ title: "Junior Developer", startDate: "2019-01" }] }, devRule), "level");
// The classifier's level is the last resort.
assert.equal(why({ currentJobTitle: "Developer", currentRoleRank: 3 }, devRule), "level");
assert.equal(why({ currentJobTitle: "Developer", currentRoleRank: 3, totalExperienceYears: 1 }, devRule), "current");

// The stored level's words.
assert.equal(storedLevel("Senior Manager"), 6);
assert.equal(storedLevel("Mid-Senior level"), 2);
assert.equal(storedLevel("Lead/Principal"), 4);
assert.equal(storedLevel("Entry level"), 1);
assert.equal(storedLevel(""), null);
assert.equal(storedLevel("something else"), null);
assert.deepEqual([0, 1, 2, 3, 5, 6, 9, 10].map(levelFromYears), [null, 1, 1, 2, 2, 3, 3, 4]);

// An earlier title counts only when the current one is another job, and says so.
const cx = rule({ titles: ["customer experience manager", "customer success manager"] });
const past = matchCandidate({
  currentJobTitle: "Operations Director",
  jobHistory: [{ title: "Customer Success Manager", startDate: "2021-03" }, { title: "Customer Experience Manager", startDate: "2018-01" }],
}, cx);
assert.ok(!isMiss(past));
if (!isMiss(past)) assert.deepEqual({ kind: past.kind, title: past.title, matchedBy: past.matchedBy }, { kind: "previous", title: "Customer Success Manager", matchedBy: "customer success manager" });
assert.equal(why({ currentJobTitle: "Operations Director", pastJobTitles: ["CX lead", "Customer Experience Manager"] }, cx), "previous");
assert.equal(why({ currentJobTitle: "Operations Director", pastJobTitles: ["Customer Experience Manager"] }, { ...cx, includePastRoles: false }), "other_job");
assert.equal(why({}, cx), "other_job");
// An earlier title's level is its own word, never today's years.
assert.equal(why({ currentTitle: "Director", totalExperienceYears: 15, pastJobTitles: ["Junior Developer"] }, senior), "level");
assert.equal(why({ currentTitle: "Director", totalExperienceYears: 15, pastJobTitles: ["Developer"] }, senior), "previous");

// Skills, when asked, must all be there.
const react = rule({ titles: ["developer"], skills: ["React", "TypeScript"] });
assert.equal(why({ currentJobTitle: "Developer", skills: ["React", "TypeScript", "CSS"] }, react), "current");
assert.equal(why({ currentJobTitle: "Developer", skills: ["React"] }, react), "skills");
assert.equal(why({ currentJobTitle: "Developer", skills: ["React"], summary: "Five years of TypeScript." }, react), "current");

// A CV's "N/A" is never a contact; the first real address in the field is.
assert.equal(usableEmail(" Asha@Example.COM "), "asha@example.com");
assert.equal(usableEmail("N/A"), null);
assert.equal(usableEmail(""), null);
assert.equal(usableEmail("a@b"), null);
assert.equal(usableEmail("asha@example.com / asha.p@work.lk"), "asha@example.com");
assert.equal(usableEmail("Email: <asha@example.com>"), "asha@example.com");
assert.equal(usableEmail("mailto:asha@example.com"), "asha@example.com");

// The door: only the five shapes it serves, and cells Excel will not run.
const { parseDiscoverPath, csvCell } = await import("../convex/integrations/contactsHttp");
const id = "k57abcdefghij0123";
assert.deepEqual(parseDiscoverPath(`/integrations/v1/contacts/discover/${id}`), { id, rest: "" });
assert.deepEqual(parseDiscoverPath(`/integrations/v1/contacts/discover/${id}/run`), { id, rest: "run" });
assert.deepEqual(parseDiscoverPath(`/integrations/v1/contacts/discover/${id}/stop`), { id, rest: "stop" });
assert.deepEqual(parseDiscoverPath(`/integrations/v1/contacts/discover/${id}/rows.csv`), { id, rest: "rows.csv" });
assert.equal(parseDiscoverPath(`/integrations/v1/contacts/discover/${id}/delete`), null);
assert.equal(parseDiscoverPath(`/integrations/v1/contacts/discover/../tables`), null);
assert.equal(csvCell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
assert.equal(csvCell("+94 77 123 4567"), "+94 77 123 4567");
assert.equal(csvCell("+cmd|' /C calc'!A0"), `'+cmd|' /C calc'!A0`);
assert.equal(csvCell("Smith, Jane"), `"Smith, Jane"`);
assert.equal(csvCell(undefined), "");

// Stop (9 Nov): a running search ends "done" with what it found; a finished one is left alone; one never run is refused.
{
  const r = stopPatch({ status: "running", scanned: 31200 }, 1000);
  assert.ok(r.ok && r.patch);
  assert.equal(r.patch!.status, "done");
  assert.equal(r.patch!.stoppedAt, 1000);
  assert.equal(r.patch!.meaning, "Stopped by you after checking 31,200 people.");
  const done = stopPatch({ status: "done", scanned: 92292 }, 1000);
  assert.ok(done.ok && done.patch === null);
  const failed = stopPatch({ status: "failed", scanned: 10 }, 1000);
  assert.ok(failed.ok && failed.patch === null);
  const notRun = stopPatch({ status: "read", scanned: 0 }, 1000);
  assert.ok(!notRun.ok && notRun.status === 409);
}

// The new tables are private to their own token, like Extras.
const { PARTNER_PRIVATE_TABLES } = await import("../convex/integrations/partnerRead");
for (const t of ["contactSearches", "contactSearchRows"]) assert.ok((PARTNER_PRIVATE_TABLES as readonly string[]).includes(t));

console.log("contactRule: ok");
