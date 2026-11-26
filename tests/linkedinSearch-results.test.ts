import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { formFromRules } from "../convex/linkedinSearch/form";
import {
  capPerCompany, checkRow, columnRole, companySpread, locationCheck, normaliseUrl, parseYears, removeRepeats, rowFromAgent,
  rowFromProfile, rowsFromAgentRead, areaYearsFromJobs, matchesExcluded,
} from "../convex/linkedinSearch/results";
import type { AgentRead } from "../convex/linkedinSearch/crustdata";

const qsForm = formFromRules({ text: "Quantity Surveyor for building projects, Sri Lanka, 5-8 years" });

test("years as text are parsed; otherwise unknown", () => {
  assert.deepEqual([parseYears("21").min, parseYears("21").known], [21, true]);
  assert.deepEqual([parseYears("6 to 10 years").min, parseYears("6 to 10 years").max], [6, 10]);
  assert.deepEqual([parseYears("More than 10").min, parseYears("More than 10").max], [10, null]);
  assert.equal(parseYears("15+").min, 15);
  assert.equal(parseYears("3 years 6 months").min, 3.5);
  assert.equal(parseYears("Not listed").known, false);
  assert.equal(parseYears(null).known, false);
  assert.equal(parseYears("").text, "unknown");
  assert.equal(parseYears(12).min, 12);
});

test("columns are read by meaning, not exact name", () => {
  assert.equal(columnRole({ key: "current_title", label: "Current title" }), "title");
  assert.equal(columnRole({ key: "role", label: "Current role" }), "title");
  assert.equal(columnRole({ key: "employer", label: "Employer" }), "company");
  assert.equal(columnRole({ key: "current_company" }), "company");
  assert.equal(columnRole({ key: "experience", label: "Years of experience" }), "years");
  assert.equal(columnRole({ key: "total_exp", label: "Total experience" }), "years");
  assert.equal(columnRole({ key: "solar_years", label: "Years of experience in solar PV" }, "solar PV"), "areaYears");
  assert.equal(columnRole({ key: "location_country", label: "Country", field: "basic_profile.location.country" }), "country");
  assert.equal(columnRole({ key: "based_in", label: "Based in" }), "location");
  assert.equal(columnRole({ key: "profile_url", label: "Profile URL" }), "url");
  assert.equal(columnRole({ key: "basic_profile_headline", label: "Headline" }), "headline");
  assert.equal(columnRole({ key: "skills_professional_network_", label: "Skills" }), "other");
  assert.equal(columnRole({ key: "name", label: "Name" }), "name");
});

test("swapped headline and title are put back", () => {
  const r = rowFromAgent(
    { id: 1, values: { current_title: "Senior QS at Sanken | Building projects | MRICS", basic_profile_headline: "Senior Quantity Surveyor", name: "A" } },
    [{ key: "current_title", label: "Current title" }, { key: "basic_profile_headline", label: "Headline" }, { key: "name" }],
    [],
    qsForm,
    null,
  );
  assert.equal(r.currentTitle, "Senior Quantity Surveyor");
  assert.match(r.headline, /Sanken/);
});

test("blanks and object values are read safely", () => {
  const r = rowFromAgent(
    { id: 2, values: { name: "B", current_title: "{}", current_company: "Not listed", location: { city: "Kandy", country: "Sri Lanka" }, experience: "Not listed" } },
    [{ key: "name" }, { key: "current_title" }, { key: "current_company" }, { key: "location" }, { key: "experience" }],
    [],
    qsForm,
    null,
  );
  assert.equal(r.currentTitle, "");
  assert.equal(r.currentCompany, "");
  assert.equal(r.city, "Kandy");
  assert.equal(r.country, "Sri Lanka");
  assert.equal(r.totalYears.known, false);
});

test("real Agent output (saved test search) reads complete rows", () => {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/linkedinSearch/agent-output-sample.json", import.meta.url), "utf8"));
  const read: AgentRead = {
    searchId: raw.search_id, state: raw.state, note: raw.output.note, reason: raw.output.reason, person: raw.output.person,
    creditsBody: raw.credits_used.total_cost, creditsHeader: null, error: null, createdAt: raw.created_at,
  };
  const f = formFromRules({ text: "GM / Head / Director Merchandising, activewear, Sri Lanka, 15+ years" });
  const rows = rowsFromAgentRead(read, f).map((r) => checkRow(r, f));
  assert.equal(rows.length, 3);
  const first = rows[0];
  assert.equal(first.name, "Sisira Senanayake");
  assert.equal(first.currentTitle, "General Manager - Merchandising");
  assert.equal(first.currentCompany, "Hirdaramani Group");
  assert.equal(first.country, "Sri Lanka");
  assert.equal(first.totalYears.min, 21);
  assert.equal(first.mustHaves.location, "yes");
  assert.equal(first.mustHaves.level, "yes");
  assert.equal(first.dataDate, "2026-11-25");
  assert.ok(first.evidence.length >= 4);
  // No unexplained blanks: every row has a title or a thin flag.
  for (const r of rows) assert.ok(r.currentTitle || r.flags.thin || r.headline, `row ${r.name} blank`);
});

test("repeats removed by link (country subdomain, slash, query) and by name + company", () => {
  const f = qsForm;
  const mk = (id: number, url: string, name: string, company: string) =>
    rowFromProfile({ crustdata_person_id: id, basic_profile: { name, current_title: "QS", location: { country: "Sri Lanka" } }, social_handles: { professional_network_identifier: { profile_url: url } }, experience: { employment_details: { current: [{ name: company }] } } }, f);
  const rows = [
    mk(1, "https://www.linkedin.com/in/amal-perera/", "Amal Perera", "Sanken"),
    mk(2, "https://lk.linkedin.com/in/amal-perera?trk=x", "Amal P", "Sanken"),
    mk(3, "https://www.linkedin.com/in/amal-perera-2", "Amal Perera", "Sanken (Pvt) Ltd"),
    mk(4, "https://www.linkedin.com/in/nimal", "Nimal Silva", "Maga"),
  ];
  const { rows: out, removed } = removeRepeats(rows);
  assert.equal(removed, 2);
  assert.deepEqual(out.map((r) => r.crustdataId), ["1", "4"]);
  assert.equal(normaliseUrl("https://lk.linkedin.com/in/X/"), "linkedin.com/in/x");
});

test("location check: other countries hidden; city not reported kept", () => {
  const f = qsForm;
  const rows = [
    rowFromProfile({ crustdata_person_id: 1, basic_profile: { name: "A", current_title: "QS", location: { country: "India", city: "Chennai" } } }, f),
    rowFromProfile({ crustdata_person_id: 2, basic_profile: { name: "B", current_title: "QS", location: { country: "Sri Lanka" } } }, f),
    rowFromProfile({ crustdata_person_id: 3, basic_profile: { name: "C", current_title: "QS", location: { country: "Sri Lanka", city: "Galle" } } }, f),
  ].map((r) => checkRow(r, f));
  const hidden = locationCheck(rows, f);
  assert.equal(hidden, 1);
  assert.equal(rows[0].hidden, true);
  assert.match(rows[0].hiddenReason!, /India/);
  assert.equal(rows[1].hidden, false);
  assert.equal(rows[1].flags.cityNotReported, true);
});

test("company spread and at most N per company", () => {
  const f = qsForm;
  const rows = Array.from({ length: 6 }, (_, i) =>
    rowFromProfile({ crustdata_person_id: i, basic_profile: { name: `P${i}`, current_title: "QS", location: { country: "Sri Lanka" } }, experience: { employment_details: { current: [{ name: i < 4 ? "Hela Clothing" : "Other" }] } } }, f),
  );
  assert.deepEqual(companySpread(rows)[0], { company: "Hela Clothing", count: 4 });
  assert.equal(capPerCompany(rows, 2), 2);
  assert.equal(rows.filter((r) => r.hidden).length, 2);
});

test("flags: above level, other function, at client, thin, qualifications", () => {
  const f = formFromRules({ text: "Chief financial officer - Ananta Bangladesh\nFabric companies, Sri Lanka, 15+ years\nCA/ CIMA fully qualified\nLooking for GM/ Heads/ AGM/DGM" });
  const mk = (title: string, company: string, headline = "") =>
    checkRow(rowFromProfile({ crustdata_person_id: 1, basic_profile: { name: "X", current_title: title, headline, location: { country: "Sri Lanka" } }, experience: { employment_details: { current: [{ name: company }] } } }, f), f);
  const above = mk("Group Finance Director", "Brandix");
  assert.equal(above.flags.aboveLevel, true);
  assert.ok(above.warnings.some((w) => /Above the level/.test(w)));
  assert.equal(mk("General Manager Finance", "Ocean Lanka").mustHaves.level, "yes");
  assert.equal(mk("Head of HR", "Ocean Lanka").flags.otherFunction, true);
  assert.equal(mk("DGM Finance", "Ananta Apparels").flags.atClient, true);
  const thin = checkRow(rowFromProfile({ crustdata_person_id: 9, basic_profile: { name: "T", location: { country: "Sri Lanka" } } }, f), f);
  assert.equal(thin.flags.thin, true);
  assert.ok(thin.warnings.some((w) => /call or message/.test(w)));
  const q = mk("Finance Manager", "X", "Finance Manager | ACMA CGMA");
  assert.deepEqual(q.qualificationsInHeadline, ["ACMA", "CGMA"]);
  assert.ok(q.warnings.some((w) => /CA \/ CIMA not in the headline/.test(w)));
});

test("never dropped because Crustdata's title check failed", () => {
  const f = qsForm;
  const r = checkRow(
    rowFromAgent(
      { id: 5, values: { name: "D", current_title: "Senior Quantity Surveyor", location: "Colombo, Sri Lanka" }, constraints: [{ constraint_id: "c2", assessment: "violated", evidence: "Title not matched" }] },
      [{ key: "name" }, { key: "current_title" }, { key: "location" }],
      [{ id: "c2", text: "The person's current title is Quantity Surveyor." }],
      f,
      null,
    ),
    f,
  );
  locationCheck([r], f);
  assert.equal(r.hidden, false);
  assert.equal(r.evidence[0].verdict, "no");
});

test("years in an area from dated jobs, including company-name keywords (employer without industry tag)", () => {
  const y = areaYearsFromJobs(
    [
      { name: "Green Energy Lanka", title: "Electrical Engineer", start_date: "2020-01-01", end_date: "2022-01-01" },
      { name: "ABC Holdings", title: "Solar PV Engineer", start_date: "2022-01-01", end_date: "2023-07-01" },
      { name: "Ceylon Tobacco", title: "Electrical Engineer", start_date: "2018-01-01", end_date: "2020-01-01" },
    ],
    "solar PV",
  );
  assert.equal(y, 3.5);
});

test("excluded companies match group names", () => {
  assert.ok(matchesExcluded("MAS Intimates (Pvt) Ltd", ["MAS"]));
  assert.ok(matchesExcluded("Brandix Bangladesh", ["Brandix"]));
  assert.ok(!matchesExcluded("Hela Clothing", ["MAS", "Brandix"]));
  assert.ok(!matchesExcluded("Christmas Ltd", ["MAS"]));
});

test("real Agent output, 26 Nov: 'Location (city and country)' column is a location, not a country", () => {
  const f = formFromRules({ text: "Sri Lankans in the UAE, Quantity Surveyor for building projects, 8+ years" });
  const cols = [
    { key: "title", label: "Current job title", field: null },
    { key: "location", label: "Location (city and country)", field: null },
    { key: "normalized_title_matched_tit", label: "Title", field: "basic_profile.normalized_title.matched_title" },
  ];
  assert.equal(columnRole(cols[1]), "location");
  const r = checkRow(rowFromAgent({ id: 1, values: { location: "Dubai, United Arab Emirates", normalized_title_matched_tit: "Cost Manager", title: "Senior Quantity Surveyor" } }, cols, [], f, null), f);
  assert.equal(r.country, "United Arab Emirates");
  assert.equal(r.city, "Dubai");
  assert.equal(r.currentTitle, "Senior Quantity Surveyor", "the asked-for column wins over the normalized title");
  assert.equal(locationCheck([r], f), 0);
  assert.equal(f.role, "Quantity Surveyor");
});

test("Crustdata city notes: 'City not listed' is blank, '(inferred)' is dropped", () => {
  const f = formFromRules({ text: "Sri Lankans in the UAE, Quantity Surveyor for building projects, 8+ years" });
  const cols = [{ key: "location", label: "Location (city and country)" }];
  const a = rowFromAgent({ id: 1, values: { location: "City not listed, United Arab Emirates" } }, cols, [], f, null);
  const b = rowFromAgent({ id: 2, values: { location: "Abu Dhabi (inferred), United Arab Emirates" } }, cols, [], f, null);
  assert.deepEqual([a.city, a.country], [null, "United Arab Emirates"]);
  assert.deepEqual([b.city, b.country], ["Abu Dhabi", "United Arab Emirates"]);
});

test("HoF search (26 Nov): one person with two profiles at 'Pegasus Reef Hotel' and 'Pegasus Reef Hotel Sri Lanka' is one person", () => {
  const f = formFromRules({ text: "Head of Finance, hotels, Sri Lanka, 10+ years" });
  const mk = (id: number, url: string, company: string) =>
    rowFromProfile({ crustdata_person_id: id, basic_profile: { name: "Kapila Gunathilaka", current_title: "Head of Finance", location: { country: "Sri Lanka" } }, social_handles: { professional_network_identifier: { profile_url: url } }, experience: { employment_details: { current: [{ name: company }] } } }, f);
  const out = removeRepeats([mk(1, "https://www.linkedin.com/in/kapila-a", "Pegasus Reef Hotel"), mk(2, "https://www.linkedin.com/in/kapila-b", "Pegasus Reef Hotel Sri Lanka")]);
  assert.equal(out.rows.length, 1);
});

test("HoF search (26 Nov): post-qualification years are a minimum — 25 years total is not a years ✘", () => {
  const f = formFromRules({ text: "Head of Finance, hotels, Sri Lanka, 8-10 years post-qualification experience" });
  const r = checkRow(rowFromAgent({ id: 1, values: { t: "Head of Finance", y: "25", loc: "Colombo, Sri Lanka" } }, [{ key: "t", label: "Current title" }, { key: "y", label: "Total years of experience" }, { key: "loc", label: "Location" }], [], f, null), f);
  assert.equal(r.mustHaves.years, "yes");
  const young = checkRow(rowFromAgent({ id: 2, values: { t: "Head of Finance", y: "8", loc: "Colombo, Sri Lanka" } }, [{ key: "t", label: "Current title" }, { key: "y", label: "Total years of experience" }, { key: "loc", label: "Location" }], [], f, null), f);
  assert.equal(young.mustHaves.years, "no", "8 years in total cannot hold 8 years after qualifying");
});
