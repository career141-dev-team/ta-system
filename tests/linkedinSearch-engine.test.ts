import assert from "node:assert/strict";
import test from "node:test";
import { createCrustdataClient } from "../convex/linkedinSearch/crustdata";
import { createEngine, spendToStore } from "../convex/linkedinSearch/engine";
import { memoryStore } from "../convex/linkedinSearch/store";
import type { Settings } from "../convex/linkedinSearch/types";
import { fakeClock, fakeCrustdata, makePeople, type FakeOptions } from "./linkedinSearchFake";

const QS = "Quantity Surveyor for building projects in Sri Lanka, 5-8 years experience";

function setup(opts: FakeOptions = {}, settings: Partial<Settings> = {}, heldBy?: (u: string) => string | null) {
  const clock = fakeClock();
  const fake = fakeCrustdata(clock, opts);
  const store = memoryStore({ heldBy });
  const now = () => new Date(clock.now());
  const crustdata = createCrustdataClient({ apiKey: "k", fetch: fake.fetch, clock, onSpend: spendToStore(store, now) });
  const engine = createEngine({ crustdata, store, now, settings });
  const paid = () => fake.calls.filter((c) => c.path === "/agent/searches" || c.path === "/person/search").length;
  return { clock, fake, store, engine, paid };
}

test("questions stop the search before any money is spent", async () => {
  const { engine, paid } = setup();
  const out = await engine.search({ text: "EHS MANAGER FOR Heavy manufacturing sector" }, { userId: "sanduni" });
  assert.equal(out.status, "questions");
  if (out.status !== "questions") return;
  assert.deepEqual(out.check.questions.map((q) => q.code).sort(), ["missing_years"]);
  assert.equal(paid(), 0);
});

test("full search: 30 rows, fixed columns, ticks, spend logged, everyone saved", async () => {
  const { engine, store, fake } = setup({ agentCredits: 2.4 });
  const out = await engine.search({ text: QS }, { userId: "ta1", openingId: "op1" });
  assert.equal(out.status, "done");
  if (out.status !== "done") return;
  assert.equal(out.engine, "agent");
  assert.equal(out.visible, 30);
  const vis = out.rows.filter((r) => !r.hidden);
  assert.ok(vis.every((r) => r.currentTitle && r.currentCompany && r.country === "Sri Lanka" && r.linkedinUrl));
  assert.ok(vis.every((r) => r.mustHaves.location === "yes"));
  assert.deepEqual(vis.map((r) => r.rank), Array.from({ length: 30 }, (_, i) => i + 1));
  assert.equal(out.credits, 2.4);
  assert.equal(out.usd, 0.72);
  const spend = await store.spend();
  assert.equal(spend.length, 1);
  assert.equal(spend[0].userId, "ta1");
  assert.equal(spend[0].openingId, "op1");
  assert.equal(spend[0].kind, "agent");
  // Query has the fixed columns; no qualification words.
  const q = fake.calls.find((c) => c.path === "/agent/searches")!.body as { query: string };
  assert.match(q.query, /^Find 30 people\./);
  assert.ok(out.spread.length > 0);
});

test("same form again → saved result reused, no paid call ($0)", async () => {
  const { engine, paid } = setup();
  await engine.search({ text: QS }, { userId: "ta1" });
  const before = paid();
  const again = await engine.search({ text: "need QS for building projects in SL, 5-8 yrs exp" }, { userId: "ta2" });
  assert.equal(again.status, "done");
  if (again.status !== "done") return;
  assert.equal(again.engine, "reuse");
  assert.equal(again.credits, 0);
  assert.equal(paid(), before, "a repeat makes no paid call");
  assert.equal(again.visible, 30);
  assert.ok(again.rows.filter((r) => !r.hidden).every((r) => r.flags.seenBefore), "seen-before badge");
  assert.match(again.rows[0].warnings.join(" "), /Seen before: found .* by ta1/);
});

test("saved people first: a related search pays only for the gap", async () => {
  const { engine, fake } = setup({ agentPeople: makePeople(60, {}, 1000) });
  await engine.search({ text: QS }, { userId: "ta1" });
  // A different form (years 6–9) that the saved QS people match for free.
  const out = await engine.search({ text: "Quantity Surveyor for building projects in Sri Lanka, 6-9 years experience" }, { userId: "ta2" });
  assert.equal(out.status, "done");
  if (out.status !== "done") return;
  const fromSaved = out.rows.filter((r) => r.source === "saved" && !r.hidden).length;
  assert.ok(fromSaved > 0, "some saved people used");
  const second = fake.calls.filter((c) => c.path === "/agent/searches")[1]?.body as { query: string } | undefined;
  if (fromSaved >= 30) assert.equal(second, undefined, "no paid call when saved people fill the list");
  else assert.match(second!.query, new RegExp(`^Find ${Math.min(30, 30 - fromSaved + 5)} people`));
});

test("Agent Search timeout → cancelled (free) → normal search fallback, labelled", async () => {
  const { engine, fake, store } = setup({ agentOutcome: "never" }, { agentTimeoutSeconds: 60 });
  const out = await engine.search({ text: QS }, { userId: "ta1" });
  assert.equal(out.status, "done");
  if (out.status !== "done") return;
  assert.equal(out.engine, "normal");
  assert.ok(out.warnings.some((w) => /cancelled \(no cost\)/.test(w)));
  assert.ok(fake.calls.some((c) => c.path.endsWith("/cancel")));
  assert.equal(out.visible, 30);
  const kinds = (await store.spend()).map((e) => e.kind);
  assert.ok(!kinds.includes("agent"));
  assert.ok(kinds.includes("fallback"));
});

test("Agent Search failure → normal search fallback", async () => {
  const { engine } = setup({ agentOutcome: "failed" });
  const out = await engine.search({ text: QS }, { userId: "ta1" });
  assert.equal(out.status, "done");
  if (out.status === "done") {
    assert.equal(out.engine, "normal");
    assert.ok(out.warnings.some((w) => /failed \(no cost\)/.test(w)));
  }
});

test("blank columns are filled by re-fetch by id; nothing left unexplained", async () => {
  const { engine, store } = setup({ columnStyle: "blanks" });
  const out = await engine.search({ text: QS }, { userId: "ta1" });
  assert.equal(out.status, "done");
  if (out.status !== "done") return;
  const vis = out.rows.filter((r) => !r.hidden);
  assert.equal(vis.length, 30);
  assert.ok(vis.every((r) => r.currentTitle && r.currentCompany && r.country), "no blanks after gap fill");
  assert.ok(vis.some((r) => r.filled.length > 0));
  assert.ok((await store.spend()).some((e) => e.kind === "gap_fill"));
});

test("column variations (role / employer / based in / 'More than N') read correctly", async () => {
  const { engine } = setup({ columnStyle: "variant" });
  const out = await engine.search({ text: QS }, { userId: "ta1" });
  assert.equal(out.status, "done");
  if (out.status !== "done") return;
  const vis = out.rows.filter((r) => !r.hidden);
  assert.ok(vis.every((r) => r.currentTitle === "Quantity Surveyor" && r.currentCompany.startsWith("Company") && r.country === "Sri Lanka"));
  assert.ok(vis.every((r) => r.totalYears.known));
});

test("swapped title / headline columns are fixed", async () => {
  const { engine } = setup({ columnStyle: "swapped" });
  const out = await engine.search({ text: QS }, { userId: "ta1" });
  if (out.status !== "done") throw new Error(out.status);
  assert.ok(out.rows.filter((r) => !r.hidden).every((r) => r.currentTitle === "Quantity Surveyor"));
});

test("wrong countries hidden and the list topped up to 30 (when automatic top-up is switched on)", async () => {
  const mixed = [...makePeople(20, {}, 1000), ...makePeople(10, { country: "India", city: "Chennai" }, 2000)];
  const pool = [...mixed, ...makePeople(40, {}, 3000)];
  const { engine } = setup({ agentPeople: mixed, people: pool }, { autoTopUp: true });
  const out = await engine.search({ text: QS }, { userId: "ta1" });
  if (out.status !== "done") throw new Error(out.status);
  assert.equal(out.visible, 30);
  assert.equal(out.rows.filter((r) => r.hidden && /India/.test(r.hiddenReason ?? "")).length, 10);
  assert.ok(out.rows.filter((r) => !r.hidden).every((r) => r.country === "Sri Lanka"));
  assert.ok(out.warnings.some((w) => /added from the normal search/.test(w)));
});

test("repeats (same person, two profiles) removed", async () => {
  const base = makePeople(30, {}, 1000);
  const twin = { ...base[0], id: 9999, url: "https://lk.linkedin.com/in/person-1000-b" }; // same name + company
  const dupe = { ...base[1], id: 9998 }; // same link
  const { engine } = setup({ agentPeople: [base[0], twin, base[1], dupe, ...base.slice(2)] , people: [...base, ...makePeople(20, {}, 5000)] });
  const out = await engine.search({ text: QS }, { userId: "ta1" });
  if (out.status !== "done") throw new Error(out.status);
  const names = out.rows.filter((r) => !r.hidden).map((r) => r.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(out.warnings.some((w) => /repeat/.test(w)));
});

test("show more: 30 basic rows, nobody already shown", async () => {
  const { engine } = setup({ agentPeople: makePeople(30, {}, 1000), people: makePeople(100, {}, 1000) });
  const first = await engine.search({ text: QS }, { userId: "ta1", openingId: "op1" });
  if (first.status !== "done") throw new Error(first.status);
  const more = await engine.showMore(first.searchId, { userId: "ta1" });
  if (more.status !== "done") throw new Error(more.status);
  const a = new Set(first.rows.map((r) => r.crustdataId));
  const b = more.rows.filter((r) => !r.hidden).map((r) => r.crustdataId);
  assert.equal(b.length, 30);
  assert.ok(b.every((id) => !a.has(id)), "no repeats");
  const more2 = await engine.showMore(first.searchId, { userId: "ta1" });
  if (more2.status !== "done") throw new Error(more2.status);
  assert.ok(more2.rows.filter((r) => !r.hidden).every((r) => !a.has(r.crustdataId) && !b.includes(r.crustdataId)));
});

test("cancel by search id stops the poll", async () => {
  const clock = fakeClock();
  const fake = fakeCrustdata(clock, { agentReadsUntilDone: 50 });
  const store = memoryStore();
  const crustdata = createCrustdataClient({ apiKey: "k", fetch: fake.fetch, clock, onSpend: spendToStore(store) });
  let id = "";
  const engine = createEngine({ crustdata, store, now: () => new Date(clock.now()), newId: () => (id = "S1") });
  const p = engine.searchForm((await engine.prepare({ text: QS })).form, {
    userId: "ta1",
    onProgress: (e) => {
      if (e.stage === "agent_search") queueMicrotask(() => void engine.cancel(id));
    },
  });
  const out = await p;
  assert.equal(out.status, "cancelled");
  assert.equal((await store.spend()).length, 0);
  assert.ok(fake.calls.some((c) => c.path.endsWith("/cancel")));
});

test("low balance (402) → stops and reports; the search is saved as failed", async () => {
  const { engine, store } = setup({ balance: 0 });
  const out = await engine.search({ text: QS }, { userId: "ta1" });
  assert.equal(out.status, "failed");
  if (out.status === "failed") assert.match(out.error!, /balance too low/);
  const s = (store.dump() as { searches: { state: string }[] }).searches;
  assert.equal(s[0].state, "failed");
});

test("learning: declined pushed down with date; not relevant hidden for the opening; held by another TA shown", async () => {
  const { engine, store, clock } = setup({ agentPeople: makePeople(40, {}, 1000), people: makePeople(80, {}, 1000) }, {}, (u) => (u.endsWith("person-1003") ? "Shakya" : null));
  const first = await engine.search({ text: QS }, { userId: "ta1", openingId: "op1" });
  if (first.status !== "done") throw new Error(first.status);
  const p0 = await store.findProfile({ crustdataId: "1000" });
  const p1 = await store.findProfile({ crustdataId: "1001" });
  await store.setOutcome({ profileId: p0!.profileId, outcome: "declined", at: new Date(clock.now()).toISOString() });
  await store.setMark({ profileId: p1!.profileId, openingId: "op1", userId: "ta1", verdict: "not_relevant", at: new Date(clock.now()).toISOString() });
  const out = await engine.refine(first.searchId, { totalYears: { min: 5, max: 9 } }, { userId: "ta1" });
  if (out.status !== "done") throw new Error(out.status);
  assert.deepEqual(out.changed, ["years"]);
  const r0 = out.rows.find((r) => r.crustdataId === "1000")!;
  const r1 = out.rows.find((r) => r.crustdataId === "1001")!;
  assert.ok(r0.flags.declined && r0.warnings.some((w) => /Declined on/.test(w)));
  assert.ok(r0.hidden || r0.rank > 20, "declined pushed down");
  assert.equal(r1.hidden, true);
  assert.match(r1.hiddenReason!, /not relevant/);
  const held = out.rows.find((r) => r.crustdataId === "1003")!;
  assert.equal(held.flags.heldBy, "Shakya");
});

test("find one person: saved first (free), then normal search", async () => {
  const { engine, paid } = setup();
  await engine.search({ text: QS }, { userId: "ta1" });
  const before = paid();
  const a = await engine.findOnePerson({ url: "https://www.linkedin.com/in/person-1002" }, { userId: "ta1" });
  assert.equal(a.fromSaved, true);
  assert.equal(paid(), before);
  const b = await engine.findOnePerson({ name: "Person 1055" }, { userId: "ta1" });
  assert.equal(b.fromSaved, false);
  assert.equal(b.row?.name, "Person 1055");
});

test("market count shown first for narrow searches (only a few companies)", async () => {
  const { engine } = setup();
  const out = await engine.search({ type: "by_company", text: "Quantity Surveyor, Sri Lanka, 5-8 years", companies: ["Sanken", "Maga"] }, { userId: "ta1" });
  assert.equal(out.status, "market_count");
  if (out.status === "market_count") assert.equal(typeof out.marketCount, "number");
  const go = await engine.searchForm(out.form, { userId: "ta1", marketCountSeen: true });
  assert.equal(go.status, "done");
});

test("team queue: 8 searches at once all finish; starts 7–8 wait for the next minute", async () => {
  const clock = fakeClock();
  const fake = fakeCrustdata(clock, { agentReadsUntilDone: 2 });
  const store = memoryStore();
  const crustdata = createCrustdataClient({ apiKey: "k", fetch: fake.fetch, clock, onSpend: spendToStore(store) });
  const engine = createEngine({ crustdata, store, now: () => new Date(clock.now()) });
  const reqs = Array.from({ length: 8 }, (_, i) => `Quantity Surveyor for building projects in Sri Lanka, ${3 + i}-${9 + i} years experience`);
  const outs = await Promise.all(reqs.map((t, i) => engine.search({ text: t }, { userId: `ta${i}`, accepted: ["clash_level_years"] })));
  assert.ok(outs.every((o) => o.status === "done"), outs.map((o) => o.status).join(","));
  const starts = fake.calls.filter((c) => c.path === "/agent/searches");
  // 8 accepted starts (one per search); any start refused under the shared test clock was retried after the reset.
  assert.equal(starts.filter((c) => c.status === 202).length, 8);
  const first6 = starts.filter((c) => c.status === 202).slice(0, 6);
  const later = starts.filter((c) => c.status === 202).slice(6);
  assert.ok(later.every((c) => c.at - first6[0].at >= 60_000), "starts 7 and 8 waited for the next minute");
});

test("spend report and price watch", async () => {
  const { engine } = setup({ agentCredits: 2 });
  await engine.search({ text: QS }, { userId: "ta1", openingId: "op1" });
  await engine.search({ text: "Quantity Surveyor for building projects in Sri Lanka, 7-10 years experience" }, { userId: "ta2", openingId: "op2", accepted: ["clash_level_years"] });
  const rep = await engine.spendReport();
  assert.ok(rep.total.usd > 0);
  assert.ok(rep.byUser.ta1 && rep.byOpening.op1 && rep.byKind.agent);
  const pw = await engine.priceWatch();
  assert.equal(pw.alert, false);
});

test("opt-out removes every trace", async () => {
  const { engine, store } = setup();
  await engine.search({ text: QS }, { userId: "ta1" });
  const p = await store.findProfile({ crustdataId: "1000" });
  await store.optOut(p!.profileId);
  assert.equal(await store.findProfile({ crustdataId: "1000" }), null);
  const d = store.dump() as { searches: { results: { profileId: string }[] }[] };
  assert.ok(d.searches.every((s) => s.results.every((r) => r.profileId !== p!.profileId)));
});

test("not relevant lowers similar people (same title) for that opening", async () => {
  const people = [...makePeople(20, {}, 1000), ...makePeople(20, { title: "Trainee Quantity Surveyor" }, 3000)];
  const { engine, store, clock } = setup({ agentPeople: people, people });
  const first = await engine.search({ text: QS }, { userId: "ta1", openingId: "op9" });
  if (first.status !== "done") throw new Error(first.status);
  const p = await store.findProfile({ crustdataId: "3000" });
  await store.setMark({ profileId: p!.profileId, openingId: "op9", userId: "ta1", verdict: "not_relevant", at: new Date(clock.now()).toISOString() });
  const out = await engine.refine(first.searchId, { totalYears: { min: 5, max: 9 } }, { userId: "ta1" });
  if (out.status !== "done") throw new Error(out.status);
  const similar = out.rows.filter((r) => !r.hidden && r.currentTitle === "Trainee Quantity Surveyor");
  const others = out.rows.filter((r) => !r.hidden && r.currentTitle === "Quantity Surveyor");
  assert.ok(similar.length > 0 && similar.every((r) => r.flags.similarToRejected));
  assert.ok(Math.min(...similar.map((r) => r.rank)) > Math.max(...others.map((r) => r.rank)), "similar people ranked below the others");
});

// ---- Owner (26 Nov): "TAs won't be marking in the actual system; they only shortlist if good and add to the table"

test("owner rule: people already added to this opening's table are hidden in every new search for the opening", async () => {
  const { engine, store, clock } = setup({ agentPeople: makePeople(40, {}, 1000), people: makePeople(80, {}, 1000) });
  const first = await engine.search({ text: QS }, { userId: "ta1", openingId: "op7" });
  if (first.status !== "done") throw new Error(first.status);
  await store.addToTable({ openingId: "op7", linkedinUrl: "https://www.linkedin.com/in/person-1001", by: "Shakya", at: new Date(clock.now()).toISOString() });
  const out = await engine.refine(first.searchId, { totalYears: { min: 5, max: 9 } }, { userId: "ta1" });
  if (out.status !== "done") throw new Error(out.status);
  const r = out.rows.find((x) => x.crustdataId === "1001")!;
  assert.equal(r.hidden, true);
  assert.match(r.hiddenReason!, /Already added to this opening's table by Shakya/);
  assert.equal(out.visible, 29, "no automatic top-up (owner, 26 Nov)");
  assert.ok(out.warnings.some((w) => /Press "Show more"/.test(w)));
  // Not marked, not added → still shown (TAs do not mark people).
  assert.ok(out.rows.some((x) => x.crustdataId === "1002" && !x.hidden));
});

test("owner rule: in another opening, a person in a table is shown with 'held by' (not hidden)", async () => {
  const { engine, store, clock } = setup();
  await store.addToTable({ openingId: "opA", linkedinUrl: "https://www.linkedin.com/in/person-1003", by: "Samali", at: new Date(clock.now()).toISOString() });
  const out = await engine.search({ text: QS }, { userId: "ta1", openingId: "opB" });
  if (out.status !== "done") throw new Error(out.status);
  const r = out.rows.find((x) => x.crustdataId === "1003")!;
  assert.equal(r.hidden, false);
  assert.equal(r.flags.heldBy, "Samali");
});

// ---- Owner (26 Nov): top up only when the TA asks ----------------------------------------------------------

test("owner rule: a short main-search list is NOT filled automatically; the TA is told to press Show more", async () => {
  const { engine, fake } = setup({ agentPeople: makePeople(12, {}, 1000), people: makePeople(80, {}, 1000) });
  const out = await engine.search({ text: QS }, { userId: "ta1", openingId: "op1" });
  if (out.status !== "done") throw new Error(out.status);
  assert.equal(out.visible, 12);
  assert.equal(fake.calls.filter((c) => c.path === "/person/search").length, 0, "no basic-search call, no top-up cost");
  assert.ok(out.warnings.some((w) => /12 people from the main search\. Press "Show more"/.test(w)));
  const more = await engine.showMore(out.searchId, { userId: "ta1" });
  if (more.status !== "done") throw new Error(more.status);
  assert.equal(more.visible, 30);
  assert.ok(more.rows.every((r) => !r.crustdataId || +r.crustdataId >= 1012 || r.hidden), "no repeats");
});
