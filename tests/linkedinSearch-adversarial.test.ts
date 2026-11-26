/**
 * Adversarial tests (second check). Tests named "guard (was a defect):" each failed on the first build and now guard a real gap
 * against the build brief / OPEN-RISKS / plan sections 4–6. The rest are extra coverage that holds.
 * Fake Crustdata only — no real API calls.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { formFromRules, formKey } from "../convex/linkedinSearch/form";
import { checkForm } from "../convex/linkedinSearch/check";
import { agentQuery } from "../convex/linkedinSearch/query";
import * as R from "../convex/linkedinSearch/results";
import { createCrustdataClient } from "../convex/linkedinSearch/crustdata";
import { createEngine, spendToStore } from "../convex/linkedinSearch/engine";
import { memoryStore } from "../convex/linkedinSearch/store";
import type { Settings } from "../convex/linkedinSearch/types";
import { fakeClock, fakeCrustdata, makePeople, type FakeOptions } from "./linkedinSearchFake";

const form = (text: string) => formFromRules({ text });
const removedKinds = (text: string) => form(text).removed.map((r) => r.item);
const qcodes = (text: string) => checkForm(form(text)).questions.map((q) => q.code);

// =============================================================================================
// FORM — defects
// =============================================================================================

test("guard (was a defect): one-line request with the word 'salary' is wiped out entirely (role, years, location lost)", () => {
  const f = form("GM Finance, apparel, 20 years, Sri Lanka, salary 1.5M");
  assert.equal(f.function, "finance");
  assert.equal(f.location.country, "Sri Lanka");
  assert.deepEqual(f.totalYears, { min: 20, max: null });
  assert.ok(f.removed.some((r) => r.item === "salary"));
});

test("guard (was a defect): one-line request with 'notice period' / 'immediate joiner' is wiped out entirely", () => {
  const f = form("Finance Manager, Sri Lanka, 8+ years, immediate joiner, notice period 1 month");
  assert.equal(f.role, "Finance Manager");
  assert.equal(f.location.country, "Sri Lanka");
  assert.deepEqual(f.totalYears, { min: 8, max: null });
});

test("guard (was a defect): 'LKR 3 lakhs' salary on the role line wipes the whole request", () => {
  const f = form("Accountant salary LKR 3 lakhs, 3 years, Colombo");
  assert.equal(f.role, "Accountant");
  assert.equal(f.location.city, "Colombo");
});

test("guard (was a defect): age phrasing 'age 25-35' is not removed or noted", () => {
  assert.ok(removedKinds("Finance Manager, age 25-35, 8 years experience, Sri Lanka").includes("age"));
});

test("guard (was a defect): gender phrasing 'lady candidates only' is not removed or noted", () => {
  assert.ok(removedKinds("Accountant, lady candidates only, 3 years, Colombo").includes("gender"));
});

test("guard (was a defect): exclusion phrasings 'no Brandix', 'avoid MAS, Brandix', lower-case 'not at mas or brandix' are missed", () => {
  assert.deepEqual(form("Senior Merchandiser, activewear, 6+ years, Sri Lanka, no Brandix").excludeCompanies, ["Brandix"]);
  assert.deepEqual(form("Senior Merchandiser, activewear, 6+ years, Sri Lanka, avoid MAS, Brandix").excludeCompanies, ["Brandix", "MAS"]);
  assert.equal(form("Senior Merchandiser, 6 years, Sri Lanka, not at mas or brandix").excludeCompanies.length, 2);
});

test("guard (was a defect): multi-word excluded company is cut to its first word ('John Keells' → 'John')", () => {
  const f = form("Finance Manager, 8 years, Colombo, exclude Hayleys, John Keells");
  assert.deepEqual(f.excludeCompanies, ["Hayleys", "John Keells"]);
});

test("guard (was a defect): 'Sri Lanka / overseas' (seen in the real requests) raises no two-location question", () => {
  assert.ok(qcodes("Finance Manager, 8 years, Sri Lanka / overseas").some((c) => c === "clash_two_locations" || c === "overseas_where"));
  assert.ok(qcodes("Finance Manager, 8 years, Sri Lanka or overseas").some((c) => c === "clash_two_locations" || c === "overseas_where"));
});

test("guard (was a defect): all-caps one-liner puts junk into the role and the query titles", () => {
  const f = form("FINANCE MANAGER APPAREL 8 YEARS ONLY IN SRI LANKA");
  assert.equal(f.role, "Finance Manager");
  assert.ok(!agentQuery(f).query.includes("8 Years Only"));
});

test("guard (was a defect): QS test — 'Looking for a …' and dash-separated wordings give a different form / key", () => {
  const base = formKey(form("Quantity Surveyor, building projects, Sri Lanka, 5-8 years"));
  assert.equal(formKey(form("Looking for a Quantity Surveyor for building projects in Sri Lanka with 5-8 years experience")), base);
  assert.equal(formKey(form("QS - building projects - SL - 5 to 8 yrs")), base);
});

test("guard (was a defect): short JD — TA's capital instruction at the end ('MUST HAVE 4-6 YRS') loses to the JD years", () => {
  const jd = [
    "Job Title: Finance Manager",
    "Requirements:",
    "Degree in accounting",
    "8+ years experience in finance",
    "MUST HAVE 4-6 YRS AS MANAGER",
  ].join("\n");
  assert.deepEqual(form(jd).totalYears, { min: 4, max: 6 });
});

test("guard (was a defect): two roles without counts ('a Finance Manager and an HR Manager') are not split", () => {
  const f = form("Need a Finance Manager and an HR Manager, apparel, Colombo, 8 years");
  assert.equal(f.signals.splitRoles.length, 2);
  assert.ok(qcodes("Need a Finance Manager and an HR Manager, apparel, Colombo, 8 years").includes("split_roles"));
});

test("guard (was a defect): client named as 'Company: ABC Garments (Pvt) Ltd' in a pasted JD is not excluded", () => {
  const jd = [
    "Job Title: Finance Manager",
    "Company: ABC Garments (Pvt) Ltd",
    "Location - Colombo, Sri Lanka",
    "Requirements:",
    "8+ years experience in finance",
  ].join("\n");
  assert.ok(form(jd).excludeCompanies.some((c) => /ABC Garments/i.test(c)));
});

test("guard (was a defect): 'Sri Lankan' (nationality word) stays in the role and is sent as a title", () => {
  const f = form("Sri Lankan Finance Manager in Qatar, 8 years");
  assert.equal(f.location.country, "Qatar");
  assert.equal(f.role, "Finance Manager");
  assert.ok(!/Sri Lankan Finance Manager/.test(agentQuery(f).query));
});

test("guard (was a defect): Sinhala filler word ('ekak') stays in the role and the query titles", () => {
  const f = form("Finance Manager ekak one, apparel, 8 years, Colombo");
  assert.equal(f.role, "Finance Manager");
});

test("guard (was a defect): salary written 'Rs. 250k' / 'LKR 300k' leaves a stray 'k' (note text cut)", () => {
  const r = form("Accountant, Rs. 250k, 3 years, Colombo").removed.find((x) => x.item === "salary");
  assert.equal(r?.text, "Rs. 250k");
});

// =============================================================================================
// FORM — holds (extra coverage)
// =============================================================================================

test("holds: short forms AM / DGM / HOD expand and set the level", () => {
  const am = form("AM Finance, apparel, Colombo, 5-7 years");
  assert.equal(am.role, "Assistant Manager Finance");
  assert.deepEqual([am.levelLow, am.levelHigh], ["assistant_manager", "assistant_manager"]);
  const dgm = form("DGM HR for a large apparel group, 15 yrs+, Sri Lanka");
  assert.deepEqual([dgm.levelLow, dgm.levelHigh], ["dgm", "dgm"]);
  assert.equal(dgm.function, "hr");
  const hod = form("HOD Engineering, heavy manufacturing, 12+ years, Sri Lanka");
  assert.match(hod.role, /Head of Department/);
  assert.equal(hod.levelHigh, "gm");
});

test("holds: years phrasings '10 yrs+', 'minimum of 5 years', '5 - 7 years'", () => {
  assert.deepEqual(form("Finance Manager, 10 yrs+, Colombo").totalYears, { min: 10, max: null });
  assert.deepEqual(form("Finance Manager, minimum of 5 years, Colombo").totalYears, { min: 5, max: null });
  assert.deepEqual(form("Finance Manager, 5 - 7 years, Colombo").totalYears, { min: 5, max: 7 });
});

test("holds: gender / age / religion / marital / nationality phrasings removed and noted", () => {
  assert.ok(removedKinds("Finance Manager, female preferred, 8+ years, Sri Lanka").includes("gender"));
  assert.ok(removedKinds("HR Manager, under 40 years old, 10 years, Sri Lanka").includes("age"));
  assert.ok(removedKinds("Finance Manager, 8 years, Sri Lanka, below 35").includes("age"));
  assert.ok(removedKinds("Finance Manager, 8 years, Colombo. Age: 30-40").includes("age"));
  assert.ok(removedKinds("Finance Manager, 8 years, Sri Lanka, Buddhist preferred").includes("religion"));
  const mm = removedKinds("Finance Manager, 8 years, Colombo, married male preferred");
  assert.ok(mm.includes("marital_status") && mm.includes("gender"));
  assert.ok(removedKinds("Finance Manager, 8 years, Sri Lanka, Sri Lankan nationals only").includes("nationality"));
  // Removed words never reach the query.
  const q = agentQuery(form("Finance Manager, female preferred, 8+ years, Sri Lanka")).query;
  assert.ok(!/female/i.test(q));
});

test("holds: salary ranges 'Rs.300,000 - Rs.350,000' removed without losing the role", () => {
  const f = form("Finance Manager, 8 years, Colombo, Rs.300,000 - Rs.350,000");
  assert.equal(f.role, "Finance Manager");
  assert.ok(f.removed.some((r) => r.item === "salary"));
});

test("holds: 'except MAS', 'not from MAS and Brandix' exclusions", () => {
  assert.deepEqual(form("Senior Merchandiser, activewear, 6+ years, Sri Lanka, except MAS").excludeCompanies, ["MAS"]);
  assert.deepEqual(form("Senior Merchandiser, activewear, 6+ years, Sri Lanka, not from MAS and Brandix").excludeCompanies, ["Brandix", "MAS"]);
});

test("holds: two countries 'Colombo or Dubai' → two-location question; broad 'Accountant, Sri Lanka' → too broad", () => {
  assert.ok(qcodes("Finance Manager in Colombo or Dubai, 8 years").includes("clash_two_locations"));
  assert.ok(qcodes("Accountant, Sri Lanka").includes("too_broad"));
});

test("holds: '2 Merchandisers & 1 Planner' split into two searches", () => {
  const c = checkForm(form("2 Merchandisers & 1 Planner, knitwear, Katunayake, 3-5 years"));
  assert.equal(c.splitForms.length, 2);
  assert.deepEqual(c.splitForms.map((x) => x.role), ["Merchandiser", "Planner"]);
});

test("holds: three QS wordings (TA shorthand, clean, 'QS for…') share one key", () => {
  const k = new Set(
    ["need QS for building projects in SL, 5-8 yrs exp", "Quantity Surveyor, building projects, Sri Lanka, 5-8 years", "QS for building projects, Sri Lanka, 5 to 8 years"].map((t) => formKey(form(t))),
  );
  assert.equal(k.size, 1);
});

// =============================================================================================
// RESULTS — defects
// =============================================================================================

const QSF = form("Quantity Surveyor, building projects, Sri Lanka, 5-8 years");
const C = (key: string, label: string) => ({ key, label });

test("guard (was a defect): a 'LinkedIn Headline' column is read as the profile URL", () => {
  const cols = [C("name", "Name"), C("li_headline", "LinkedIn Headline"), C("profile_url", "Profile URL"), C("t", "Current title"), C("c", "Current company"), C("loc", "Location"), C("y", "Years of experience")];
  const row = R.rowFromAgent(
    { id: 5, values: { name: "A B", li_headline: "QS at X | MRICS", profile_url: "https://www.linkedin.com/in/ab", t: "Quantity Surveyor", c: "X", loc: "Colombo, Sri Lanka", y: "7" } } as never,
    cols,
    [],
    QSF,
    null,
  );
  assert.equal(row.linkedinUrl, "https://www.linkedin.com/in/ab");
  assert.equal(row.headline, "QS at X | MRICS");
});

test("guard (was a defect): 'Years at current company' (tenure) is read as total years when it comes first", () => {
  const cols = [C("name", "Name"), C("t", "Current title"), C("c", "Current company"), C("loc", "Location"), C("tenure", "Years at current company"), C("y", "Total years of experience")];
  const row = R.rowFromAgent({ id: 6, values: { name: "C D", t: "Quantity Surveyor", c: "Access Engineering", loc: "Colombo, Sri Lanka", tenure: "2", y: "9" } } as never, cols, [], QSF, null);
  assert.equal(row.totalYears.min, 9);
});

test("guard (was a defect): 'Company HQ location' column is read as the person's company when it comes first", () => {
  const cols = [C("name", "Name"), C("t", "Current title"), C("hq", "Company HQ location"), C("c", "Current company"), C("loc", "Location"), C("y", "Total years of experience")];
  const row = R.rowFromAgent({ id: 7, values: { name: "E F", t: "Quantity Surveyor", hq: "Dubai, UAE", c: "Access Engineering", loc: "Colombo, Sri Lanka", y: "9" } } as never, cols, [], QSF, null);
  assert.equal(row.currentCompany, "Access Engineering");
});

test("guard (was a defect): a null row or a missing rows array in Crustdata output throws (paid search lost)", () => {
  const cols = [C("name", "Name"), C("t", "Current title")];
  assert.doesNotThrow(() => R.rowsFromAgentRead({ person: { columns: cols, constraints: [], rows: [null, { id: 1, values: { name: "Z", t: "QS" } }] }, createdAt: null } as never, QSF));
  assert.doesNotThrow(() => R.rowsFromAgentRead({ person: { columns: cols, constraints: [] }, createdAt: null } as never, QSF));
});

test("guard (was a defect): a repeat merged by name + company loses its second URL; a later row with that URL is shown again", () => {
  const cols = [C("name", "Name"), C("u", "Profile URL"), C("t", "Current title"), C("c", "Current company")];
  const mk = (id: number | null, v: Record<string, string>) => R.rowFromAgent({ id, values: v } as never, cols, [], QSF, null);
  const a = mk(10, { name: "Kamal Perera", u: "https://lk.linkedin.com/in/Kamal-Perera-123/?originalSubdomain=lk", t: "QS", c: "MAS Holdings (Pvt) Ltd" });
  const b = mk(null, { name: "Kamal  Perera", u: "http://www.linkedin.com/in/kamal-perera-456", t: "QS", c: "MAS Holdings Pvt Ltd" });
  const c = mk(null, { name: "", u: "https://www.linkedin.com/in/kamal-perera-456/", t: "QS", c: "" });
  const out = R.removeRepeats([a, b, c]);
  assert.equal(out.rows.length, 1);
});

// =============================================================================================
// RESULTS — holds
// =============================================================================================

test("holds: years as strings / numbers / text", () => {
  const cases: [unknown, number | null, number | null, boolean][] = [
    ["10", 10, 10, true], [" 12 ", 12, 12, true], ["More than 10", 10, null, true], ["10+ years", 10, null, true],
    ["Over 20 years", 20, null, true], ["5-7", 5, 7, true], [7.5, 7.5, 7.5, true], [0, 0, 0, true], ["less than 1 year", null, 1, true],
    ["N/A", null, null, false], ["—", null, null, false], ["Since 2012", null, null, false], [null, null, null, false], [{ value: "8" }, 8, 8, true],
  ];
  for (const [v, min, max, known] of cases) {
    const y = R.parseYears(v);
    assert.deepEqual([y.min, y.max, y.known], [min, max, known], JSON.stringify(v));
  }
});

test("holds: same person with different URL forms (lk. subdomain, query, slash, case) is one person", () => {
  const u = ["https://lk.linkedin.com/in/Kamal-Perera-123/?originalSubdomain=lk", "linkedin.com/in/kamal-perera-123", "HTTP://WWW.LINKEDIN.COM/in/kamal-perera-123/#x"].map(R.normaliseUrl);
  assert.equal(new Set(u).size, 1);
});

test("holds: rows with null values / no id do not throw and are marked thin", () => {
  const rows = R.rowsFromAgentRead({ person: { columns: null, constraints: null, rows: [{ id: null, values: null }] }, createdAt: null } as never, QSF);
  assert.equal(rows.length, 1);
  R.checkRow(rows[0], QSF);
  assert.equal(rows[0].flags.thin, true);
});

test("holds: excluded group names match ('MAS' catches MAS Kreeda) but not 'Thomas Cook'", () => {
  assert.equal(R.matchesExcluded("MAS Kreeda", ["MAS Holdings"]), true);
  assert.equal(R.matchesExcluded("Brandix Apparel Solutions", ["Brandix"]), true);
  assert.equal(R.matchesExcluded("Thomas Cook", ["MAS"]), false);
});

// =============================================================================================
// ENGINE
// =============================================================================================

const QS = "Quantity Surveyor for building projects in Sri Lanka, 5-8 years experience";

function setup(opts: FakeOptions = {}, settings: Partial<Settings> = {}) {
  const clock = fakeClock();
  const fake = fakeCrustdata(clock, opts);
  const store = memoryStore();
  const now = () => new Date(clock.now());
  const crustdata = createCrustdataClient({ apiKey: "k", fetch: fake.fetch, clock, onSpend: spendToStore(store, now) });
  const engine = createEngine({ crustdata, store, now, settings });
  const paid = () => fake.calls.filter((c) => c.path === "/agent/searches" || c.path === "/person/search").length;
  return { clock, fake, store, engine, crustdata, now, paid };
}

test("guard (was a defect): 'at most N per company' leaves fewer than 30 visible although many more people exist (no top-up after the cap)", async () => {
  // Agent returns 30 people from 7 companies; the normal search has 200 people across 40 firms.
  const { engine } = setup({ agentPeople: makePeople(30, {}, 1000), people: makePeople(200, {}, 1000).map((p, i) => ({ ...p, company: `Firm ${i % 40}` })) });
  const { engine: engineAuto } = setup({ agentPeople: makePeople(30, {}, 1000), people: makePeople(200, {}, 1000).map((p, i) => ({ ...p, company: `Firm ${i % 40}` })) }, { autoTopUp: true });
  void engine;
  const out = await engineAuto.search({ text: QS }, { userId: "ta1", maxPerCompany: 2 });
  if (out.status !== "done") throw new Error(out.status);
  assert.equal(out.visible, 30);
});

test("guard (was a defect): cancel from another engine instance (separate Convex action) cannot stop a running search", async () => {
  const clock = fakeClock();
  const fake = fakeCrustdata(clock, { agentReadsUntilDone: 50 });
  const store = memoryStore();
  const crustdata = createCrustdataClient({ apiKey: "k", fetch: fake.fetch, clock, onSpend: spendToStore(store) });
  const now = () => new Date(clock.now());
  const runner = createEngine({ crustdata, store, now, newId: () => "S1" });
  const canceller = createEngine({ crustdata, store, now });
  let cancelled: boolean | null = null;
  const out = await runner.search({ text: QS }, {
    userId: "ta1",
    onProgress: (e) => {
      if (e.stage === "agent_search") queueMicrotask(async () => void (cancelled = await canceller.cancel("S1")));
    },
  });
  assert.equal(cancelled, true);
  assert.equal(out.status, "cancelled");
});

test("guard (was a defect): the same Agent search read by two client instances (no credit header) is logged as spend twice", async () => {
  const clock = fakeClock();
  const fake = fakeCrustdata(clock, { sendCreditHeader: false, agentCredits: 2.5 });
  const store = memoryStore();
  const mk = () => createCrustdataClient({ apiKey: "k", fetch: fake.fetch, clock, onSpend: spendToStore(store) });
  const q = agentQuery(form(QS));
  await mk().runAgent(q.query, q.idempotencyKey);
  await mk().runAgent(q.query, q.idempotencyKey);
  const total = (await store.spend()).reduce((a, e) => a + e.credits, 0);
  assert.equal(total, 2.5);
});

test("holds: show more twice never repeats anyone, across both pages and the first list", async () => {
  const { engine } = setup({ agentPeople: makePeople(30, {}, 1000), people: makePeople(120, {}, 1000) });
  const first = await engine.search({ text: QS }, { userId: "ta1" });
  if (first.status !== "done") throw new Error(first.status);
  const m1 = await engine.showMore(first.searchId, { userId: "ta1" });
  const m2 = await engine.showMore(first.searchId, { userId: "ta1" });
  if (m1.status !== "done" || m2.status !== "done") throw new Error("show more");
  const ids = [first, m1, m2].flatMap((o) => (o.status === "done" ? o.rows.filter((r) => !r.hidden).map((r) => r.crustdataId) : []));
  assert.equal(ids.length, 90);
  assert.equal(new Set(ids).size, 90);
});

test("holds: repeat search by another TA in another opening costs $0 and logs no spend", async () => {
  const { engine, store, paid } = setup();
  await engine.search({ text: QS }, { userId: "ta1", openingId: "op1" });
  const p = paid();
  const s = (await store.spend()).length;
  const again = await engine.search({ text: QS }, { userId: "ta2", openingId: "op2" });
  assert.equal(again.status, "done");
  if (again.status === "done") {
    assert.equal(again.engine, "reuse");
    assert.equal(again.credits, 0);
    assert.equal(again.visible, 30);
  }
  assert.equal(paid(), p);
  assert.equal((await store.spend()).length, s);
});

test("holds: timeout → cancel (free) → normal search, 30 visible, agent spend not logged", async () => {
  const { engine, store, fake } = setup({ agentOutcome: "never", people: makePeople(80) });
  const out = await engine.search({ text: QS }, { userId: "ta1" });
  if (out.status !== "done") throw new Error(out.status);
  assert.equal(out.engine, "normal");
  assert.equal(out.visible, 30);
  assert.ok(fake.calls.some((c) => c.path.endsWith("/cancel")));
  assert.ok((await store.spend()).every((e) => e.kind !== "agent"));
});

test("holds: 402 at start → failed, no fallback normal search, nothing spent", async () => {
  const { engine, fake, store } = setup({ balance: 0 });
  const out = await engine.search({ text: QS }, { userId: "ta1" });
  assert.equal(out.status, "failed");
  assert.equal(fake.calls.filter((c) => c.path === "/person/search").length, 0);
  assert.equal((await store.spend()).length, 0);
});

test("holds: learning — declined inside 6 months goes to the bottom; after 6 months shown with the date; not-relevant hidden only in its opening", async () => {
  const { engine, store, clock } = setup({ agentPeople: makePeople(30, {}, 1000), people: makePeople(30, {}, 1000) });
  const first = await engine.search({ text: QS }, { userId: "ta1", openingId: "op1" });
  if (first.status !== "done") throw new Error(first.status);
  const p0 = (await store.findProfile({ crustdataId: "1000" }))!;
  const p1 = (await store.findProfile({ crustdataId: "1001" }))!;
  const nowIso = new Date(clock.now()).toISOString();
  await store.setOutcome({ profileId: p0.profileId, outcome: "declined", at: nowIso });
  await store.setMark({ profileId: p1.profileId, openingId: "op1", userId: "ta1", verdict: "not_relevant", at: nowIso });
  const same = await engine.search({ text: QS }, { userId: "ta1", openingId: "op1" });
  if (same.status !== "done") throw new Error(same.status);
  const vis = same.rows.filter((r) => !r.hidden);
  assert.equal(vis[vis.length - 1].crustdataId, "1000");
  assert.equal(same.rows.find((r) => r.crustdataId === "1001")!.hidden, true);
  const other = await engine.search({ text: QS }, { userId: "ta2", openingId: "op2" });
  if (other.status !== "done") throw new Error(other.status);
  assert.equal(other.rows.find((r) => r.crustdataId === "1001")!.hidden, false);
  clock.t += 200 * 86_400_000;
  const later = await engine.search({ text: QS }, { userId: "ta1", openingId: "op3" });
  if (later.status !== "done") throw new Error(later.status);
  const r0 = later.rows.find((r) => r.crustdataId === "1000")!;
  assert.equal(r0.flags.declined, false);
  assert.ok(r0.warnings.some((w) => /Declined on/.test(w)));
  assert.ok(!r0.hidden && r0.rank > 0);
});

test("holds: spend is logged once per paid call across search + gap fill + top-up", async () => {
  const people = makePeople(80, {}, 1000).map((p, i) => (i < 30 && i % 3 === 0 ? { ...p, country: "India" } : p));
  const { engine, store, fake } = setup({ agentPeople: people.slice(0, 30), people, columnStyle: "blanks" });
  const out = await engine.search({ text: QS }, { userId: "ta1" });
  if (out.status !== "done") throw new Error(out.status);
  const paidCalls = fake.calls.filter((c) => c.status === 200 && (c.path === "/person/search" || (/^\/agent\/searches\/[^/]+$/.test(c.path) && (c as { method: string }).method === "GET"))).length;
  const spend = await store.spend();
  assert.ok(spend.length <= paidCalls);
  assert.equal(new Set(spend.map((e) => e.crustdataRef)).size, spend.length);
  const total = Math.round(spend.reduce((a, e) => a + e.credits, 0) * 1000) / 1000;
  assert.equal(total, Math.round(out.credits * 1000) / 1000);
});

// =============================================================================================
// ROUND 2 — try to break the fixes
// =============================================================================================

test("guard (was a round-2 defect): cutTitle cuts 'Manager Quality Assurance' to 'Manager' (function lost)", () => {
  const f = form("Manager Quality Assurance, apparel, 8 years, Sri Lanka");
  assert.match(f.role, /Quality Assurance/);
});

test("guard (was a round-2 defect): exclusion parser takes normal words after 'avoid' / 'no' / 'except' as companies", () => {
  assert.deepEqual(form("Finance Manager, 8 years, Sri Lanka, avoid Big 4 audit profiles").excludeCompanies.filter((c) => c === "Big"), []);
  assert.deepEqual(form("Finance Manager, 8 years, Sri Lanka, no Excel issues, no MBA required").excludeCompanies, []);
  assert.deepEqual(form("Sales Manager, 8 years, Sri Lanka, except weekends travel required").excludeCompanies, []);
});

test("guard (was a round-2 defect): second multi-word excluded company is dropped ('Hela Clothing or MAS Holdings' → only MAS)", () => {
  const a = form("Finance Manager, 8 years, Sri Lanka, not from Hela Clothing or MAS Holdings").excludeCompanies;
  assert.ok(a.some((c) => /Hela/.test(c)) && a.some((c) => /MAS/.test(c)), JSON.stringify(a));
  const b = form("Finance Manager, 8 years, Sri Lanka, excluding Hirdaramani and Brandix Apparel").excludeCompanies;
  assert.ok(b.some((c) => /Hirdaramani/.test(c)) && b.some((c) => /Brandix/.test(c)), JSON.stringify(b));
});

test("guard (was a round-2 defect): dash-separated one-liner — salary removal eats the location and years after it", () => {
  const f = form("Accountant - salary 200k - Kandy - 4 years");
  assert.equal(f.location.city, "Kandy");
  assert.deepEqual(f.totalYears, { min: 4, max: null });
});

test("guard (was a round-2 defect): negated industry ('no prior banking experience needed') is set as the industry to search", () => {
  assert.notEqual(form("Finance Manager, 8 years, Sri Lanka, no prior banking experience needed").industry, "banking / financial services");
});

test("guard (was a round-2 defect): company context sentence first ('We export to overseas buyers…') becomes the role", () => {
  const f = form("We export to overseas buyers in the EU. Merchandiser, 5 years, Sri Lanka");
  assert.equal(f.role, "Merchandiser");
});

test("guard (was a round-2 defect): one 'not relevant' mark flags nearly every row that has the target title as 'similar to rejected'", async () => {
  const { engine, store, clock } = setup({ agentPeople: makePeople(30, {}, 1000), people: makePeople(80, {}, 1000) });
  const first = await engine.search({ text: QS }, { userId: "ta1", openingId: "op1" });
  if (first.status !== "done") throw new Error(first.status);
  const p = (await store.findProfile({ crustdataId: "1005" }))!;
  await store.setMark({ profileId: p.profileId, openingId: "op1", userId: "ta1", verdict: "not_relevant", at: new Date(clock.now()).toISOString() });
  const out = await engine.refine(first.searchId, { totalYears: { min: 5, max: 9 } }, { userId: "ta1" });
  if (out.status !== "done") throw new Error(out.status);
  const flagged = out.rows.filter((r) => !r.hidden && (r.flags as { similarToRejected?: boolean }).similarToRejected).length;
  assert.ok(flagged < out.visible / 2, `${flagged} of ${out.visible} flagged`);
});

test("holds R2: real titles survive cutTitle", () => {
  assert.equal(form("Head of Sustainability, apparel, 15 years, Sri Lanka").role, "Head of Sustainability");
  assert.equal(form("Solar PV Engineer, 3-5 years in solar PV, Sri Lanka").role, "Solar PV Engineer");
  assert.equal(form("Assistant Manager - Strategic Planning & Insights, 5-7 years, Colombo").role, "Assistant Manager - Strategic Planning & Insights");
  assert.equal(form("Electrical and Maintenance Engineer, 5 years, Sri Lanka").role, "Electrical and Maintenance Engineer");
  assert.equal(form("Head of Department - Finance, 15 years, Sri Lanka").function, "finance");
});

test("holds R2: 'overseas buyers/customers' does not raise a two-location question; 'a Diploma and a Degree' is not split", () => {
  assert.ok(!qcodes("Merchandiser, 5 years, Sri Lanka, must handle overseas buyers").some((c) => /location|overseas/.test(c)));
  assert.ok(!qcodes("Merchandiser, 5 years, Sri Lanka, experience with overseas customers is an advantage").some((c) => /location|overseas/.test(c)));
  assert.equal(form("Merchandiser with a Diploma and a Degree, 5 years, Sri Lanka").signals.splitRoles.length, 0);
  assert.equal(form("Finance and Admin Manager, 8 years, Sri Lanka").signals.splitRoles.length, 0);
  assert.equal(form("Electrical and Maintenance Engineer, 5 years, Sri Lanka").signals.splitRoles.length, 0);
  assert.equal(form("Need a Merchandiser and a Planner, knitwear, Colombo, 4 years").signals.splitRoles.length, 2);
});

test("holds R2: segment removals keep role / city / years on one-liners", () => {
  const f = form("Finance Manager, Colombo, 8 years, age 30-40, salary 350k, male, Buddhist");
  assert.equal(f.role, "Finance Manager");
  assert.equal(f.location.city, "Colombo");
  assert.deepEqual(f.totalYears, { min: 8, max: null });
  assert.deepEqual(f.removed.map((r) => r.item).sort(), ["age", "gender", "religion", "salary"]);
  const g = form("Female Finance Manager, 8 years, Colombo");
  assert.equal(g.role, "Finance Manager");
  const h = form("Finance Manager - Colombo - 8 years - salary 300k");
  assert.equal(h.location.city, "Colombo");
  assert.deepEqual(h.totalYears, { min: 8, max: null });
});
