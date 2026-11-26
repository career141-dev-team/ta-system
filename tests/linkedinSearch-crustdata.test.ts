import assert from "node:assert/strict";
import test from "node:test";
import { createCrustdataClient, CrustdataError, type SpendEvent } from "../convex/linkedinSearch/crustdata";
import { fakeClock, fakeCrustdata, makePeople } from "./linkedinSearchFake";

function setup(opts: Parameters<typeof fakeCrustdata>[1] = {}, clientOpts: { reserveCredits?: number } = {}) {
  const clock = fakeClock();
  const fake = fakeCrustdata(clock, opts);
  const spend: SpendEvent[] = [];
  const waits: number[] = [];
  const client = createCrustdataClient({
    apiKey: "test-key",
    fetch: fake.fetch,
    clock,
    onSpend: (e) => void spend.push(e),
    onWait: (_b, ms) => void waits.push(ms),
    ...clientOpts,
  });
  return { clock, fake, client, spend, waits };
}

test("agent search: start, poll, read, charge logged once", async () => {
  const { client, spend, fake } = setup({ agentCredits: 2.9 });
  const run = await client.runAgent("Find 30 people. Hard requirements: ...", "c141-abc");
  assert.equal(run.status, "succeeded");
  assert.equal(run.read?.person?.rows.length, 30);
  assert.equal(spend.length, 1);
  assert.equal(spend[0].credits, 2.9);
  assert.equal(spend[0].usd, 0.87);
  assert.equal(spend[0].estimated, false);
  // Headers on every call.
  const start = fake.calls.find((c) => c.path === "/agent/searches")!;
  assert.equal(start.headers["x-api-version"], "2025-11-01");
  assert.equal(start.headers["Idempotency-Key"], "c141-abc");
});

test("idempotency: the same key twice returns the same search and is never charged twice", async () => {
  const { client, spend, fake } = setup();
  const a = await client.runAgent("Find 30 people. same", "c141-same");
  const b = await client.runAgent("Find 30 people. same", "c141-same");
  assert.equal(a.searchId, b.searchId);
  assert.equal(fake.searches.size, 1);
  assert.equal(spend.length, 1, "repeat logged no new charge");
  assert.equal(b.credits, 0, "the header says 0 on the repeat read");
});

test("idempotency without the credit header: body cost is logged once per search id", async () => {
  const { client, spend } = setup({ sendCreditHeader: false, agentCredits: 3 });
  await client.runAgent("Find 30 people. x", "c141-k1");
  await client.runAgent("Find 30 people. x", "c141-k1");
  assert.equal(spend.length, 1);
  assert.equal(spend[0].estimated, true);
});

test("team queue: the 7th Agent start in a minute waits instead of being refused", async () => {
  const { client, fake, waits, clock } = setup({ agentReadsUntilDone: 1 });
  const t0 = clock.now();
  for (let i = 0; i < 7; i++) await client.startAgent(`Find 30 people. q${i}`, `k${i}`);
  const starts = fake.calls.filter((c) => c.path === "/agent/searches");
  assert.equal(starts.length, 7);
  assert.ok(starts.every((c) => c.status === 202), "no start was refused");
  assert.equal(waits.length, 1);
  assert.ok(starts[6].at - t0 >= 60_000, "7th start sent after the minute");
});

test("normal search queue: 5 a minute, the 6th waits", async () => {
  const { client, fake } = setup();
  for (let i = 0; i < 6; i++) await client.personSearch({ filters: { field: "basic_profile.location.country", type: "=", value: "Sri Lanka" }, limit: 1 }, "count");
  const calls = fake.calls.filter((c) => c.path === "/person/search");
  assert.ok(calls.every((c) => c.status === 200));
  assert.ok(calls[5].at - calls[0].at >= 60_000);
});

test("429: waits for x-ratelimit-reset, then retries", async () => {
  const { client, fake, clock } = setup({ force429: { path: "/person/search", times: 2, reset: 7 } });
  const t0 = clock.now();
  const r = await client.personSearch({ limit: 2 }, "show_more");
  assert.equal(r.profiles.length, 2);
  const ps = fake.calls.filter((c) => c.path === "/person/search").map((c) => c.status);
  assert.deepEqual(ps, [429, 429, 200]);
  assert.ok(clock.now() - t0 >= 14_000, "waited the reset twice");
});

test("429 forever → gives up with rate_limited", async () => {
  const { client } = setup({ force429: { path: "/agent/searches", times: 99, reset: 1 } });
  await assert.rejects(client.startAgent("Find 30 people.", "k"), (e: CrustdataError) => e.code === "rate_limited");
});

test("402: stops and reports low balance (no retry)", async () => {
  const { client, fake } = setup({ balance: 0 });
  await assert.rejects(client.startAgent("Find 30 people.", "k"), (e: CrustdataError) => e.code === "low_balance");
  assert.equal(fake.calls.filter((c) => c.path === "/agent/searches").length, 1);
});

test("reserve: stops before a paid call that would eat the kept credit", async () => {
  const { client, fake } = setup({ balance: 34 }, { reserveCredits: 33.4 });
  await assert.rejects(client.startAgent("Find 30 people.", "k"), (e: CrustdataError) => e.code === "reserve");
  assert.equal(fake.calls.filter((c) => c.path === "/agent/searches").length, 0, "nothing paid was sent");
});

test("403 locked fields: the locked fields are dropped and the call retried once", async () => {
  const { client, fake } = setup({ lockedFields: ["experience"] });
  const r = await client.personSearch({ fields: ["crustdata_person_id", "basic_profile.name", "experience.employment_details.current"], limit: 3 }, "gap_fill");
  assert.deepEqual(r.skippedFields, ["experience.employment_details.current"]);
  assert.equal(r.profiles.length, 3);
  const ps = fake.calls.filter((c) => c.path === "/person/search");
  assert.deepEqual(ps.map((c) => c.status), [403, 200]);
});

test("403 on the endpoint itself → forbidden error", async () => {
  const { client } = setup({ lockedFields: ["basic_profile"] });
  await assert.rejects(client.personSearch({ fields: ["basic_profile.name"], limit: 1 }, "find_one"), (e: CrustdataError) => e.code === "forbidden");
});

test("timeout: a search that never ends is cancelled (free) after the limit", async () => {
  const { client, fake, spend } = setup({ agentOutcome: "never" });
  const run = await client.runAgent("Find 30 people.", "k", { timeoutSeconds: 300, pollSeconds: 10 });
  assert.equal(run.status, "timeout");
  assert.equal(run.credits, 0);
  assert.ok(fake.calls.some((c) => c.path.endsWith("/cancel")));
  assert.equal(spend.length, 0);
  assert.ok(run.seconds >= 300 && run.seconds < 320);
});

test("failed search: status failed, nothing charged", async () => {
  const { client, spend } = setup({ agentOutcome: "failed" });
  const run = await client.runAgent("Find 30 people.", "k");
  assert.equal(run.status, "failed");
  assert.equal(spend.length, 0);
});

test("cancel while running: cancelled, $0", async () => {
  const { client, spend, fake } = setup({ agentReadsUntilDone: 10 });
  let polls = 0;
  const run = await client.runAgent("Find 30 people.", "k", { isCancelled: () => ++polls > 2 });
  assert.equal(run.status, "cancelled");
  assert.equal(spend.length, 0);
  assert.ok(fake.calls.some((c) => c.path.endsWith("/cancel")));
});

test("empty result is status empty and costs what Crustdata says (0)", async () => {
  const { client, spend } = setup({ agentPeople: [], agentCredits: 0 });
  const run = await client.runAgent("Find 30 people.", "k");
  assert.equal(run.status, "empty");
  assert.equal(spend[0]?.credits ?? 0, 0);
});

test("count reads total_count", async () => {
  const { client } = setup({ people: makePeople(380) });
  const n = await client.count({ filters: { field: "basic_profile.location.country", type: "=", value: "Sri Lanka" } });
  assert.equal(n, 380);
});

test("query length guard", async () => {
  const { client } = setup();
  await assert.rejects(client.startAgent("x".repeat(10_001), "k"), (e: CrustdataError) => e.code === "bad_request");
});

test("network error is retried", async () => {
  const clock = fakeClock();
  const fake = fakeCrustdata(clock);
  let fails = 1;
  const client = createCrustdataClient({
    apiKey: "k",
    clock,
    fetch: async (u, i) => {
      if (fails-- > 0) throw new Error("socket hang up");
      return fake.fetch(u, i);
    },
  });
  const r = await client.personSearch({ limit: 1 }, "find_one");
  assert.equal(r.profiles.length, 1);
});
