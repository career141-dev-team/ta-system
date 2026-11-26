/**
 * Form + free check on the 11 real TA requests (test/fixtures/requests/*.json)
 * and the scenario requests in OPEN-RISKS.md. Rules only (no LLM), so the results are fixed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { formFromRules, formKey, refineForm, widenForm } from "../convex/linkedinSearch/form";
import { answerToEdits, checkForm } from "../convex/linkedinSearch/check";
import { agentQuery, normalSearchBody } from "../convex/linkedinSearch/query";
import type { StandardForm } from "../convex/linkedinSearch/types";

const dir = new URL("./fixtures/linkedinSearch/requests/", import.meta.url);
const req = (id: string): string => JSON.parse(readFileSync(new URL(`${id}.json`, dir), "utf8")).request;
const codes = (f: StandardForm, accepted: Parameters<typeof checkForm>[1] = []) => checkForm(f, accepted).questions.map((q) => q.code).sort();
const removedKinds = (f: StandardForm) => f.removed.map((r) => r.item).sort();

// ---- The 11 real TA requests -------------------------------------------------------------------

test("TA 1–2 (Shihab): AM Strategic Planning JD, pasted twice with different headers → same form", () => {
  const a = formFromRules({ text: req("16ac31cabd0696b1") });
  const b = formFromRules({ text: req("24f8fa39b8beef7a") });
  assert.equal(formKey(a), formKey(b));
  assert.equal(a.role, "Assistant Manager - Strategic Planning & Insights");
  assert.equal(a.function, "strategy");
  assert.deepEqual([a.levelLow, a.levelHigh], ["assistant_manager", "assistant_manager"]);
  assert.deepEqual(a.location, { country: "Sri Lanka", city: "Colombo", studiedIn: null });
  assert.deepEqual(a.excludeCompanies, ["Delmo Chicken & Agro"], "the client is left out");
  assert.equal(a.industry, null, "the client's own industry is not a requirement");
  assert.deepEqual(removedKinds(a), ["benefits", "salary", "working_terms"]);
  // The stored JD was cut at 2,000 characters before the years line → ask.
  assert.deepEqual(codes(a), ["missing_years"]);
});

test("TA 3–5 (Samali): solar JD pasted three times → one form; location missing → ask", () => {
  const forms = ["231a6f0c10b14b2f", "6907bd11645d0b3b", "aca37ac20ca5484a"].map((id) => formFromRules({ text: req(id) }));
  assert.equal(new Set(forms.map(formKey)).size, 1, "re-running the same JD gives the same search (repeat = $0)");
  const f = forms[0];
  assert.equal(f.role, "Assistant Engineer - Renewable Energy");
  assert.equal(f.function, "renewable_engineering");
  assert.deepEqual([f.levelLow, f.levelHigh], ["executive", "executive"]);
  assert.deepEqual(f.totalYears, { min: 3, max: 5 });
  assert.equal(f.industry, "solar PV installers / EPC contractors");
  assert.deepEqual(f.notIndustries, ["solar panel manufacturers"]);
  assert.deepEqual(codes(f), [], "no place → Sri Lanka by default (owner's rule, 26 Nov)");
  assert.equal(f.location.country, "Sri Lanka");
});

test("TA 6 (Samali): solar JD + 'only from Sri Lanka' + 'from Solar Manufacturing companies' → JD vs TA clash", () => {
  const f = formFromRules({ text: req("bd220fe2e51583de") });
  assert.equal(f.location.country, "Sri Lanka");
  assert.equal(f.location.studiedIn, null);
  assert.deepEqual(f.areaYears, { area: "solar PV", min: 3, max: 5 });
  assert.ok(f.titles.includes("Electrical Engineer") && f.titles.includes("Assistant Engineer"), "TA's designations kept");
  assert.equal(f.signals.taIndustryHint, "solar_manufacturing");
  assert.equal(f.signals.jdIndustryHint, "solar_installation");
  assert.deepEqual(f.mustHaves, ["Practical exposure to both ground-mounted and rooftop solar PV installations"]);
  assert.ok(removedKinds(f).includes("soft_skills"));
  const c = checkForm(f);
  assert.deepEqual(c.questions.map((q) => q.code), ["clash_jd_ta_industry"]);
  assert.match(c.questions[0].question, /installation.*manufacturers/i);
  // The TA answers "installers" → no more questions.
  const g = refineForm(f, { industry: "solar PV installers / EPC contractors", notIndustries: ["solar panel manufacturers"] }).form;
  assert.deepEqual(codes(g, ["clash_jd_ta_industry"]), []);
});

test("TA 7–8 (Sanduni): 'EHS MANAGER FOR Heavy manufacturing' — short, no years, no location", () => {
  const a = formFromRules({ text: req("53bc33ff9bba2fec") });
  assert.equal(a.role, "EHS Manager");
  assert.equal(a.function, "ehs");
  assert.deepEqual([a.levelLow, a.levelHigh], ["manager", "manager"]);
  assert.match(a.industry!, /heavy manufacturing/);
  assert.deepEqual(codes(a), ["missing_years"]);
  assert.equal(a.location.country, "Sri Lanka", "default");
  // Second try added ", Sri Lankans" → read as "lives in Sri Lanka" with a warning; never as nationality.
  const b = formFromRules({ text: req("6bbd7b899b5ef37c") });
  assert.equal(b.location.country, "Sri Lanka");
  assert.deepEqual(codes(b), ["missing_years"]);
  assert.equal(b.signals.locationDefault, null, "named by the TA, not the default");
});

test("TA 9 (Sameera): CFO JD, target GM / Head / AGM / DGM, fabric only, Sri Lanka / overseas", () => {
  const f = formFromRules({ text: req("7c8f0e3037a1fd11") });
  assert.equal(f.function, "finance");
  assert.deepEqual([f.levelLow, f.levelHigh], ["agm", "gm"], "target level, not the CFO title");
  assert.equal(f.signals.jdTitleLevel, "c_level");
  assert.ok(!f.titles.some((t) => /chief|cfo/i.test(t)), "CFO not searched");
  assert.equal(f.industry, "fabric / textile manufacturers");
  assert.deepEqual(f.notIndustries, ["garment / apparel makers"]);
  assert.deepEqual(f.qualifications, ["CA", "CIMA"], "checked in the headline, not sent");
  assert.deepEqual(f.excludeCompanies, ["Ananta"]);
  assert.deepEqual(removedKinds(f), ["salary"]);
  const c = checkForm(f);
  assert.deepEqual(c.questions.map((q) => q.code).sort(), ["missing_years", "overseas_where"]);
  assert.ok(c.warnings.some((w) => /Searching AGM – GM \/ Head as asked/.test(w)));
  const q = agentQuery(f).query;
  assert.doesNotMatch(q, /\bCIMA\b|\bCA\b|Chief Financial/);
  assert.match(q, /not garment \/ apparel makers/);
  assert.match(q, /exclude Director or more senior and Senior Manager or more junior/);
  // TA answers: Sri Lankans living in Bangladesh, 15+ years.
  const e = answerToEdits(f, "overseas_where", "Sri Lankans living in Bangladesh")!;
  const g = refineForm(f, { ...e, ...answerToEdits(f, "missing_years", "15+ years")! }).form;
  assert.deepEqual(g.location, { country: "Bangladesh", city: null, studiedIn: "Sri Lanka" });
  assert.deepEqual(codes(g, ["overseas_where"]), []);
  assert.match(agentQuery(g).query, /lives in Bangladesh and studied at a school or university in Sri Lanka/);
});

test("TA 10 (Shihab): Executive JD + 'SENIOR EXECUTIVES' + 4–8 years + CAPEX + Sri Lanka → level vs years clash", () => {
  const f = formFromRules({ text: req("cac6203e7eb630c4") });
  assert.equal(f.role, "Executive - Strategic Planning & Insights");
  assert.deepEqual([f.levelLow, f.levelHigh], ["executive", "senior_executive"]);
  assert.deepEqual(f.totalYears, { min: 4, max: 8 }, "the TA's line wins over the JD's 4–6");
  assert.deepEqual(f.signals.yearsFromJd, { min: 4, max: 6 });
  assert.equal(f.location.country, "Sri Lanka");
  assert.deepEqual(f.mustHaves, ["Capex experience"]);
  assert.ok(f.titles.includes("Strategy Analyst") && f.titles.includes("Corporate Planning Executive"), "TA's title list kept");
  assert.ok(f.titles.length <= 12);
  assert.ok(f.niceToHaves.some((n) => /FMCG/.test(n)), "'Exposure to …' is a nice-to-have, not the industry");
  assert.equal(f.industry, null);
  assert.deepEqual(codes(f), ["clash_level_years"]);
  assert.match(checkForm(f).questions[0].question, /Executive – Senior Executive with 4–8 years/);
});

test("TA 11 (Shakya): Assistant Engineer E&M — salary, nationality, gender, chat ask removed", () => {
  const f = formFromRules({ text: req("efc361b08559073b") });
  assert.equal(f.role, "Assistant Engineer - Electrical and Maintenance");
  assert.equal(f.function, "electrical_maintenance");
  assert.deepEqual([f.levelLow, f.levelHigh], ["executive", "executive"]);
  assert.deepEqual(f.location, { country: "Sri Lanka", city: "Waradala", studiedIn: null });
  assert.deepEqual(f.totalYears, { min: 3, max: 5 });
  assert.equal(f.industry, "manufacturing");
  assert.equal(f.mustHaves.length, 1);
  assert.match(f.mustHaves[0], /high-voltage and low-voltage systems, generators, transformers/);
  assert.deepEqual(removedKinds(f), ["chat_ask", "gender", "nationality", "salary"]);
  const q = agentQuery(f).query;
  assert.doesNotMatch(q, /male|gender|nationals?|suggest|LKR/i);
  assert.deepEqual(codes(f), []);
  const c = checkForm(f);
  assert.ok(c.ok);
  assert.ok(c.warnings.some((w) => /Gender is never searched/.test(w)));
  assert.ok(c.warnings.some((w) => /Chat requests/.test(w)));
});

test("all 11 real requests give a role, a function, a level and no salary / gender in the query", () => {
  const ids = ["16ac31cabd0696b1", "231a6f0c10b14b2f", "24f8fa39b8beef7a", "53bc33ff9bba2fec", "6907bd11645d0b3b", "6bbd7b899b5ef37c", "7c8f0e3037a1fd11", "aca37ac20ca5484a", "bd220fe2e51583de", "cac6203e7eb630c4", "efc361b08559073b"];
  for (const id of ids) {
    const f = formFromRules({ text: req(id) });
    assert.ok(f.role, `${id} role`);
    assert.ok(f.function, `${id} function`);
    assert.ok(f.levelLow && f.levelHigh, `${id} level`);
    assert.equal(f.count, 30);
    const q = agentQuery(f).query;
    assert.doesNotMatch(q, /salary|LKR|USD|gender|males?\b|nationality|allowance/i, id);
    assert.match(q, /Show exactly these columns for every person: current job title \(not the headline\), current company, location \(city and country\), total years of experience/);
    assert.ok(q.length < 10_000);
  }
});

// ---- Scenario requests (OPEN-RISKS.md) ----------------------------------------------------------

test("QS: clean wording vs TA shorthand give the same form (same search, same key)", () => {
  const a = formFromRules({ text: "Quantity Surveyor for building projects in Sri Lanka, 5-8 years experience" });
  const b = formFromRules({ text: "need QS for building projects in SL, 5-8 yrs exp" });
  assert.equal(formKey(a), formKey(b));
  assert.equal(agentQuery(a).query, agentQuery(b).query);
  assert.equal(a.role, "Quantity Surveyor");
  assert.equal(a.industry, "construction / building contractors and consultants");
  assert.deepEqual([a.levelLow, a.levelHigh], ["senior_executive", "assistant_manager"], "level read from the years");
  assert.deepEqual(codes(a), []);
});

test("Sri Lankans in the UAE, QS 8+ years → lives in UAE, studied in Sri Lanka (never from names)", () => {
  const f = formFromRules({ text: "Sri Lankans in the UAE, Quantity Surveyor, 8+ years" });
  assert.deepEqual(f.location, { country: "United Arab Emirates", city: null, studiedIn: "Sri Lanka" });
  assert.deepEqual(f.totalYears, { min: 8, max: null });
  assert.match(agentQuery(f).query, /lives in United Arab Emirates and studied at a school or university in Sri Lanka/);
  assert.doesNotMatch(agentQuery(f).query, /nationality|Sri Lankan nationals/i);
});

test("Broad 'Accountant, Sri Lanka' → too broad / missing years asked first", () => {
  const f = formFromRules({ text: "Accountant, Sri Lanka" });
  const c = codes(f);
  assert.ok(c.includes("too_broad"));
  assert.ok(c.includes("missing_years"));
  assert.equal(checkForm(f).ok, false);
});

test("Exclusion: Senior Merchandiser, activewear, not MAS or Brandix", () => {
  const f = formFromRules({ text: "Senior Merchandiser, activewear, Sri Lanka, 5-8 years, not at MAS or Brandix (any group company)" });
  assert.deepEqual(f.excludeCompanies, ["Brandix", "MAS"]);
  assert.equal(f.industry, "apparel manufacturers making activewear / sportswear");
  assert.deepEqual(f.notIndustries, ["intimates / lingerie makers"]);
  assert.match(agentQuery(f).query, /not currently at Brandix, MAS or any of their group companies/);
  const body = normalSearchBody(f, { limit: 30 }) as { filters: { conditions: { type: string; value: unknown }[] } };
  assert.ok(body.filters.conditions.some((c) => c.type === "not_in" && JSON.stringify(c.value).includes("MAS")));
});

test("Several roles: '2 merchandisers and 1 production planner, knitwear, Katunayake' → split; city is where people live", () => {
  const f = formFromRules({ text: "2 merchandisers and 1 production planner, knitwear, Katunayake, 3-5 years" });
  assert.deepEqual(f.signals.splitRoles, ["Merchandiser", "Production Planner"]);
  const c = checkForm(f);
  assert.ok(c.questions.some((q) => q.code === "split_roles"));
  assert.equal(c.splitForms.length, 2);
  assert.deepEqual(c.splitForms.map((x) => x.role), ["Merchandiser", "Production Planner"]);
  assert.equal(f.location.city, "Katunayake");
  assert.match(agentQuery(f).query, /lives in Sri Lanka \(preferably in or near Katunayake\).*not the employer's head office/);
});

test("Fresh graduates → warning (LinkedIn data is weak)", () => {
  const f = formFromRules({ text: "Management Trainee Finance, fresh graduates, Colombo" });
  const c = checkForm(f);
  assert.ok(c.warnings.some((w) => /Fresh-graduate roles/.test(w)));
});

test("'COO … looking for GM Operations / Directors who can step up' → searches the target level only", () => {
  const f = formFromRules({ text: "COO - apparel group, Sri Lanka, 18+ years\nLooking for GM Operations / Directors who can step up" });
  assert.deepEqual([f.levelLow, f.levelHigh], ["gm", "director"]);
  assert.ok(!agentQuery(f).query.includes("Chief Operating Officer"));
  assert.ok(checkForm(f).warnings.some((w) => /JD title/.test(w)));
});

test("Removed items: age, religion, marital status, notice period, soft skills, ethnicity", () => {
  const f = formFromRules({
    text: "HR Manager, Colombo, 8-12 years, apparel\nAge below 35\nBuddhist preferred\nMarried candidates\nNotice period 1 month, immediate joiners\nExcellent communication skills\nSinhalese candidates only",
  });
  assert.deepEqual(removedKinds(f), ["age", "ethnicity", "marital_status", "notice_period", "religion", "soft_skills"]);
  assert.deepEqual(f.totalYears, { min: 8, max: 12 }, "'below 35' is age, not years");
  const q = agentQuery(f).query;
  assert.doesNotMatch(q, /35|buddhist|married|notice|communication|sinhalese/i);
});

test("More than 3 must-haves → asked to keep 3; market count wanted", () => {
  const f = formFromRules({
    text: "Production Manager, knitwear, Sri Lanka, 10+ years\nOnly lean manufacturing\nOnly SAP\nOnly Bangladesh plant start-up\nOnly ISO 14001 audits",
  });
  assert.equal(f.mustHaves.length, 3);
  const c = checkForm(f);
  assert.ok(c.questions.some((q) => q.code === "too_many_must_haves"));
  assert.ok(c.wantsMarketCount);
});

test("Search types produce the same standard form shape", () => {
  const byCompany = formFromRules({ type: "by_company", text: "Finance Manager, Sri Lanka, 8-12 years", companies: ["MAS Holdings (Pvt) Ltd", "Hirdaramani"] });
  assert.deepEqual(byCompany.currentCompanies, ["Hirdaramani", "MAS Holdings"]);
  assert.match(agentQuery(byCompany).query, /currently works at Hirdaramani, MAS Holdings/);
  const home = formFromRules({ type: "gulf_now_home", text: "Quantity Surveyor, 8+ years" });
  assert.equal(home.location.country, "Sri Lanka");
  assert.ok(home.extraRules[0].includes("Gulf"));
  const back = formFromRules({ type: "ready_to_come_home", text: "Quantity Surveyor in the UAE, 8+ years, Sri Lankans" });
  assert.equal(back.location.studiedIn, "Sri Lanka");
  assert.ok(back.extraRules.some((r) => /open to work/.test(r)));
  const like = formFromRules({ type: "more_like_this", likePerson: { title: "Senior Merchandiser", company: "Hela", industry: "activewear", years: 9, country: "Sri Lanka" } });
  assert.equal(like.role, "Senior Merchandiser");
  assert.deepEqual(like.totalYears, { min: 6, max: 12 });
  const bool = formFromRules({ type: "boolean", text: '("Quantity Surveyor" OR "Cost Engineer") AND Colombo NOT Maga' });
  assert.ok(bool.titles.includes("Quantity Surveyor") && bool.titles.includes("Cost Engineer"));
  assert.ok(bool.excludeCompanies.includes("Maga"));
  const lang = formFromRules({ type: "languages", text: "Customer Service Executive, Colombo, 2-4 years", languages: ["Tamil", "English"] });
  assert.ok(lang.extraRules[0].includes("Tamil"));
  const contract = formFromRules({ type: "contract", text: "SAP consultant, Sri Lanka, 5+ years" });
  assert.ok(contract.extraRules[0].includes("contract"));
});

test("Refine changes one field and says which; widen loosens one field", () => {
  const f = formFromRules({ text: "Quantity Surveyor for building projects in Sri Lanka, 5-8 years experience" });
  const r = refineForm(f, { totalYears: { min: 6, max: 10 } });
  assert.deepEqual(r.changed, ["years"]);
  assert.notEqual(formKey(r.form), formKey(f));
  const w = widenForm(f, "level");
  assert.deepEqual(w.changed, ["level"]);
  assert.deepEqual([w.form.levelLow, w.form.levelHigh], ["executive", "manager"]);
  const y = widenForm(f, "years");
  assert.deepEqual(y.form.totalYears, { min: 3, max: 10 });
});

test("Idempotency key: same form → same key; count is part of the key", () => {
  const f = formFromRules({ text: "Quantity Surveyor for building projects in Sri Lanka, 5-8 years experience" });
  assert.equal(agentQuery(f).idempotencyKey, agentQuery(structuredClone(f)).idempotencyKey);
  assert.notEqual(agentQuery(f, 12).idempotencyKey, agentQuery(f).idempotencyKey);
  assert.match(agentQuery(f).idempotencyKey, /^c141-[0-9a-f]{40}$/);
});

// ---- Owner's rule (26 Nov): "the main default have it Sri Lanka or Sri Lankans only; if the prompt and JD
// specify others, then yes." ------------------------------------------------------------------------------

test("owner rule: no place named → lives in Sri Lanka by default (no question)", () => {
  const f = formFromRules({ text: "EHS MANAGER FOR Heavy manufacturing sector, Special for the environment Health & Safety" });
  assert.deepEqual(f.location, { country: "Sri Lanka", city: null, studiedIn: null });
  assert.ok(!codes(f).includes("missing_location"));
  assert.ok(checkForm(f).warnings.some((w) => /No location given.*Sri Lanka/.test(w)));
});

test("owner rule: a JD with no place → Sri Lanka", () => {
  const f = formFromRules({ text: req("231a6f0c10b14b2f") });
  assert.equal(f.location.country, "Sri Lanka");
  assert.deepEqual(codes(f), []);
});

test("owner rule: another country named → Sri Lankans living there (not everyone there)", () => {
  const f = formFromRules({ text: "Finance Manager in Qatar, 8+ years, construction" });
  assert.deepEqual(f.location, { country: "Qatar", city: null, studiedIn: "Sri Lanka" });
  assert.match(agentQuery(f).query, /lives in Qatar and studied at a school or university in Sri Lanka/);
  assert.ok(checkForm(f).warnings.some((w) => /Sri Lankans living in Qatar/.test(w)));
});

test("owner rule: the request says locals / another nationality → everyone in that country", () => {
  for (const t of ["Finance Manager in Qatar, 8+ years, construction, local candidates", "Finance Manager, Dhaka, 8+ years, apparel, Bangladeshi nationals", "Finance Manager, Dubai, 8+ years, any nationality"]) {
    const f = formFromRules({ text: t });
    assert.equal(f.location.studiedIn, null, t);
    assert.notEqual(f.location.country, "Sri Lanka", t);
  }
});

test("owner rule: India search type stays local people in India", () => {
  const f = formFromRules({ type: "india", text: "Merchandiser, Tiruppur, 5-8 years, knitwear" });
  assert.deepEqual([f.location.country, f.location.studiedIn], ["India", null]);
});

test("owner rule: the JD names a job abroad (Location - Dhaka) → Sri Lankans living in Bangladesh", () => {
  const f = formFromRules({ text: "Production Manager\nLocation - Dhaka\nKnitwear, 10+ years" });
  assert.deepEqual(f.location, { country: "Bangladesh", city: "Dhaka", studiedIn: "Sri Lanka" });
  assert.ok(checkForm(f).warnings.some((w) => /Sri Lankans living in Bangladesh/.test(w)));
});

// ---- Owner (26 Nov): "add it [AI must-haves]; if they want to remove anything they can" -----------------

test("owner rule: AI must-haves are added to the search (up to 3) and listed so the TA can remove them", async () => {
  const { extractForm } = await import("../convex/linkedinSearch/form");
  let calls = 0;
  const llm = async () => {
    calls++;
    return JSON.stringify({ role: "Assistant Engineer", mustHaves: ["Solar PV installation experience", "Rooftop and ground-mounted systems", "Site supervision", "Inverter commissioning"] });
  };
  const text = req("231a6f0c10b14b2f");
  const f = await extractForm({ text }, { llm });
  assert.deepEqual(f.mustHaves, ["Solar PV installation experience", "Rooftop and ground-mounted systems", "Site supervision"]);
  assert.deepEqual(f.aiMustHaves, f.mustHaves, "the page shows these with a remove button");
  assert.deepEqual(f.suggestedMustHaves, ["Inverter commissioning"], "the 4th stays a suggestion");
  assert.match(agentQuery(f).query, /solar PV installation experience/);
  // TA removes one → the search changes, the AI list follows.
  const r = refineForm(f, { mustHaves: f.mustHaves.filter((m) => m !== "Site supervision") });
  assert.deepEqual(r.changed, ["must"]);
  assert.doesNotMatch(agentQuery(r.form).query, /site supervision/i);
  // Same JD again → same form and key (the AI answer is kept by text), no new AI call.
  const g = await extractForm({ text }, { llm });
  assert.equal(formKey(g), formKey(f));
  assert.equal(calls, 1);
});

test("owner rule: AI must-haves never bring back removed items (salary, gender, degrees, soft skills)", async () => {
  const { extractForm } = await import("../convex/linkedinSearch/form");
  const llm = async () => JSON.stringify({ mustHaves: ["Male candidate", "Degree in Electrical Engineering", "Good communication skills", "HV / LV maintenance"] });
  const f = await extractForm({ text: "Maintenance Engineer, manufacturing, Sri Lanka, 3-5 years, unique-text-1" }, { llm });
  assert.deepEqual(f.mustHaves, ["HV / LV maintenance"]);
});

test("joined query style: fewer rules, same content, its own key", () => {
  const f = formFromRules({ text: "Sri Lankans in the UAE, Quantity Surveyor for building projects, 8+ years, not at Arabtec" });
  const full = agentQuery(f, undefined, "full");
  const joined = agentQuery(f, undefined, "joined");
  const rules = (q: string) => (q.match(/\(\d+\)/g) ?? []).length;
  assert.ok(rules(joined.query) < rules(full.query), `${rules(joined.query)} < ${rules(full.query)}`);
  for (const must of ["United Arab Emirates", "Sri Lanka", "Quantity Surveyor", "Assistant Manager to Manager", "at least 8 years", "construction", "Arabtec"]) assert.ok(joined.query.includes(must), must);
  assert.notEqual(joined.idempotencyKey, full.idempotencyKey);
});

test("auto query style (paid test 26 Nov): joined only without area years and must-haves", () => {
  const simple = formFromRules({ text: "Sri Lankans in the UAE, Quantity Surveyor for building projects, 8+ years" });
  const area = formFromRules({ text: "Assistant Engineer Renewable Energy, solar PV installers, Sri Lanka, 3-5 years in solar PV" });
  assert.equal(agentQuery(simple, undefined, "auto").query, agentQuery(simple, undefined, "joined").query);
  assert.equal(agentQuery(area, undefined, "auto").query, agentQuery(area, undefined, "full").query);
});

// ---- Owner's CEO request (26 Nov): activewear CEO / COO / VP, Sri Lankans in Sri Lanka or anywhere -------------

const ceo = () =>
  formFromRules({
    text: readFileSync(new URL("./fixtures/linkedinSearch/ceo-request.txt", import.meta.url), "utf8"),
    taNote: readFileSync(new URL("./fixtures/linkedinSearch/ceo-note.txt", import.meta.url), "utf8"),
  });

test("CEO request: 'apparel or textile industry' is both, never 'not apparel'", () => {
  const f = ceo();
  assert.equal(f.industry, "apparel or textile manufacturers");
  assert.deepEqual(f.notIndustries, []);
  assert.ok(!codes(f).includes("clash_jd_ta_industry"));
});

test("CEO request: 'either in Sri Lanka or anywhere outside' → Sri Lankans anywhere, no question", () => {
  const f = ceo();
  assert.deepEqual(f.location, { country: null, city: null, studiedIn: "Sri Lanka" });
  assert.deepEqual(codes(f), []);
  const q = agentQuery(f, undefined, "auto").query;
  assert.match(q, /either lives in Sri Lanka, or lives in another country and studied at a school or university in Sri Lanka/);
  assert.doesNotMatch(q, /lives in Bangladesh/);
});

test("CEO request: COO / CEO / VP calibre, general management titles incl. marketing and operations", () => {
  const f = ceo();
  assert.deepEqual([f.levelLow, f.levelHigh], ["director", "c_level"]);
  assert.equal(f.role, "Chief Executive Officer");
  for (const t of ["Chief Executive Officer", "Chief Operating Officer", "Managing Director", "Vice President Operations", "Vice President Marketing"]) {
    assert.ok(f.titles.includes(t), t);
  }
  assert.ok(!f.titles.some((t) => /Production Officer|\(CEO\)/.test(t)));
});

test("CEO request: the TA's main criterion is the must-have (career activewear / athleisure / sportswear)", () => {
  const f = ceo();
  assert.equal(f.mustHaves.length, 1);
  assert.match(f.mustHaves[0], /activewear or athleisure wear or sportswear experience/i);
});

test("CEO request: 'Leading Apparel Manufacturing …' is a description, not a company to exclude", () => {
  assert.deepEqual(ceo().excludeCompanies, []);
});

test("CEO-style COO JD with a GM / Director target still searches only the target level", () => {
  const f = formFromRules({ text: "COO - apparel group, Sri Lanka, 18+ years\nLooking for GM Operations / Directors who can step up" });
  assert.ok(!agentQuery(f).query.includes("Chief Operating Officer"));
});
