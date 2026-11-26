// The wiring: the page's start → the background run → the engine on the Convex
// tables → what the page reads back. Real handlers, an in-memory database, the
// fake Crustdata server: no backend and no spend.

import assert from "node:assert/strict";
import test from "node:test";
import { getFunctionName } from "convex/server";
import * as db from "../convex/linkedinSearch/db";
import * as door from "../convex/ui/linkedinSearch";
import { run as runAction } from "../convex/ui/linkedinRun";
import { forViewer, startRefusal } from "../convex/ui/linkedinRules";
import { fakeClock, fakeCrustdata } from "./linkedinSearchFake";

type Row = Record<string, any>;

function memoryDb() {
  const tables = new Map<string, Map<string, Row>>();
  const table = (t: string) => tables.get(t) ?? tables.set(t, new Map()).get(t)!;
  let seq = 0;
  const find = (id: string) => table(id.split(":")[0]).get(id);
  const query = (t: string) => {
    const tests: ((r: Row) => boolean)[] = [];
    let desc = false;
    const range: any = {
      eq: (k: string, v: unknown) => (tests.push((r) => r[k] === v), range),
      lt: (k: string, v: any) => (tests.push((r) => r[k] < v), range),
      gte: (k: string, v: any) => (tests.push((r) => r[k] >= v), range),
    };
    const rows = () => {
      const got = [...table(t).values()].filter((r) => tests.every((f) => f(r)));
      return desc ? got.reverse() : got;
    };
    const chain: any = {
      withIndex: (_: string, f?: (q: any) => unknown) => (f?.(range), chain),
      order: (o: string) => ((desc = o === "desc"), chain),
      first: async () => rows()[0] ?? null,
      take: async (n: number) => rows().slice(0, n),
      collect: async () => rows(),
    };
    return chain;
  };
  return {
    table,
    query,
    get: async (id: string) => find(id) ?? null,
    insert: async (t: string, v: Row) => {
      const _id = `${t}:${++seq}`;
      table(t).set(_id, { ...v, _id });
      return _id;
    },
    patch: async (id: string, v: Row) => void Object.assign(find(id)!, v),
    delete: async (id: string) => void table(id.split(":")[0]).delete(id),
    normalizeId: (t: string, id: string) => (id.startsWith(`${t}:`) && find(id) ? id : null),
  };
}

const modules: Record<string, Record<string, any>> = { "linkedinSearch/db": db, "ui/linkedinSearch": door };

async function setup() {
  const store = memoryDb();
  const scheduled: string[] = [];
  const userId = await store.insert("users", { email: "ta@career141.com", fullName: "Test TA", role: "recruiter", isActive: true, isOnboarded: true, tokenIdentifier: "t1", clerkUserId: "u1" });
  const ctx: any = {
    db: store,
    auth: { getUserIdentity: async () => ({ tokenIdentifier: "t1", subject: "u1" }) },
    scheduler: { runAfter: async (_: number, __: unknown, a: { runId: string }) => void scheduled.push(a.runId) },
  };
  const call = (ref: any, args: unknown) => {
    const [mod, name] = getFunctionName(ref).split(":");
    if (mod === "ui/auraLedger") return Promise.resolve(null);
    return modules[mod][name]._handler(ctx, args);
  };
  ctx.runQuery = call;
  ctx.runMutation = call;
  const fn = (f: any, args: unknown) => f._handler(ctx, args);
  return { store, ctx, scheduled, userId, fn };
}

test("who may start a run, and when the desk's money stops it", () => {
  const ok = { role: "recruiter", keyOn: true, spentUsd: 0, limitUsd: 10, mine: 0, desk: 0 };
  assert.equal(startRefusal(ok), null);
  assert.match(startRefusal({ ...ok, role: "client" })!, /desk's own people/);
  assert.match(startRefusal({ ...ok, keyOn: false })!, /not switched on/);
  assert.match(startRefusal({ ...ok, mine: 1 })!, /still running/);
  assert.match(startRefusal({ ...ok, desk: 4 })!, /several/);
  assert.match(startRefusal({ ...ok, spentUsd: 10 })!, /allowance/);
  assert.deepEqual(forViewer({ rows: 1, usd: 2, credits: 3 }, false), { rows: 1 });
});

test("a search runs end to end, a TA sees people and no prices, show more repeats nobody", async () => {
  const clock = fakeClock(Date.now());
  const fake = fakeCrustdata(clock, { agentReadsUntilDone: 1, agentCredits: 2.4 });
  const real = { fetch: globalThis.fetch, timer: globalThis.setTimeout };
  process.env.CRUSTDATA_API_KEY = "test-key";
  delete process.env.ANTHROPIC_API_KEY;
  globalThis.fetch = fake.fetch as unknown as typeof fetch;
  // The client waits between polls; the test does not.
  globalThis.setTimeout = ((f: () => void) => real.timer(f, 0)) as unknown as typeof setTimeout;
  try {
    const { ctx, scheduled, fn } = await setup();
    const started = await fn(door.start, { kind: "search", text: "Quantity Surveyor for building projects in Sri Lanka, 5-8 years experience" });
    assert.equal(started.ok, true, started.message);
    assert.deepEqual(scheduled, [started.runId]);
    const second = await fn(door.start, { kind: "search", text: "another one" });
    assert.match(second.message, /still running/);

    await (runAction as any)._handler(ctx, { runId: started.runId });
    const got = await fn(door.run, { id: started.runId });
    assert.equal(got.run.state, "done", got.run.message ?? "");
    const out = JSON.parse(got.run.out);
    assert.equal(out.status, "done");
    assert.equal(out.visible, 30);
    assert.equal(out.usd, undefined, "a TA never sees the price");
    const spend = await ctx.db.query("liSpend").collect();
    assert.equal(spend.length, 1);
    assert.ok(spend[0].usd > 0);

    const more = await fn(door.start, { kind: "more", from: started.runId });
    assert.equal(more.ok, true, more.message);
    await (runAction as any)._handler(ctx, { runId: more.runId });
    const next = await fn(door.run, { id: more.runId });
    assert.equal(next.run.state, "done", next.run.message ?? "");
    const first = new Set(out.rows.filter((r: Row) => !r.hidden).map((r: Row) => r.linkedinUrl));
    const again = JSON.parse(next.run.out).rows.filter((r: Row) => !r.hidden && first.has(r.linkedinUrl));
    assert.equal(again.length, 0, "show more repeats nobody");

    // The day's limit stops the next paid run.
    process.env.LINKEDIN_SEARCH_DAILY_USD = "0.1";
    const over = await fn(door.start, { kind: "search", text: "Accountant in Sri Lanka, 3-5 years" });
    assert.match(over.message, /allowance/);
  } finally {
    globalThis.fetch = real.fetch;
    globalThis.setTimeout = real.timer;
    delete process.env.CRUSTDATA_API_KEY;
    delete process.env.LINKEDIN_SEARCH_DAILY_USD;
  }
});

test("a request with a question stops before any money, and the answer carries it on", async () => {
  const real = { fetch: globalThis.fetch, timer: globalThis.setTimeout };
  const clock = fakeClock(Date.now());
  const fake = fakeCrustdata(clock, { agentReadsUntilDone: 1 });
  process.env.CRUSTDATA_API_KEY = "test-key";
  globalThis.fetch = fake.fetch as unknown as typeof fetch;
  globalThis.setTimeout = ((f: () => void) => real.timer(f, 0)) as unknown as typeof setTimeout;
  try {
    const { ctx, fn } = await setup();
    const a = await fn(door.start, { kind: "search", text: "EHS MANAGER FOR Heavy manufacturing sector" });
    await (runAction as any)._handler(ctx, { runId: a.runId });
    const asked = JSON.parse((await fn(door.run, { id: a.runId })).run.out);
    assert.equal(asked.status, "questions");
    assert.equal((await ctx.db.query("liSpend").collect()).length, 0);
    const b = await fn(door.start, { kind: "answer", from: a.runId, answers: [{ code: "missing_years", answer: "5-8 years" }] });
    await (runAction as any)._handler(ctx, { runId: b.runId });
    const done = (await fn(door.run, { id: b.runId })).run;
    assert.equal(done.state, "done", done.message ?? "");
    assert.notEqual(JSON.parse(done.out).status, "questions");
  } finally {
    globalThis.fetch = real.fetch;
    globalThis.setTimeout = real.timer;
    delete process.env.CRUSTDATA_API_KEY;
  }
});
