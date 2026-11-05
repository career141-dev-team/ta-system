/**
 * The Ops System's read API (ops docs/15 Part E).
 *
 * What is tested here is the contract, not Convex: the shapes the Ops client
 * already declares in `ops-system/src/lib/ta.ts`, the honest gaps where we
 * have nothing to give, and the routing - because the Ops side keys
 * everything on these field names and would fail silently if one were
 * renamed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hasPartnerBearerToken } from "../convex/lib/partnerReadAuth";
import { toOpsClient, toOpsOpening, toOpsPerson, toOpsPipeline } from "../convex/integrations/opsRead";

/* ── The shapes are the Ops client's ───────────────────────────── */

const person = toOpsPerson({
  _id: "u1",
  fullName: "A Recruiter",
  email: "ta@career141.test",
  role: "recruiter",
  isActive: true,
} as never);
assert.deepEqual(person, {
  id: "u1",
  fullName: "A Recruiter",
  email: "ta@career141.test",
  taRole: "recruiter",
  isActive: true,
});

const client = toOpsClient({
  _id: "c1",
  name: "SAMPLE CLIENT",
  nameKey: "sampleclient",
  industry: "Manufacturing",
  contacts: [
    { name: "Their HR", title: "HR Manager", email: "hr@example.test", isPrimary: true },
    { name: "Their MD", title: "Managing Director", email: "md@example.test", isPrimary: false },
  ],
  esaSignedAt: 1_762_000_000_000,
  status: "active",
} as never);
assert.equal(client.id, "c1");
assert.equal(client.nameKey, "sampleclient");
assert.equal(client.esaSignedAt, 1_762_000_000_000);
// The primary contact is who a client set goes to, which is what Ops reads as
// "hr". Everyone else keeps their own title rather than being invented a role.
assert.deepEqual(client.contacts, [
  { name: "Their HR", email: "hr@example.test", role: "hr", phone: null },
  { name: "Their MD", email: "md@example.test", role: "Managing Director", phone: null },
]);
// We hold no ops owner: who owns a client on the Ops side is their record.
assert.equal(client.opsOwnerId, null);

// An industry nobody filled in comes back as null, not an empty string: Ops
// shows "not known" for one and an empty box for the other.
assert.equal(
  toOpsClient({ _id: "c2", name: "X", nameKey: "x", industry: "", contacts: [], status: "active" } as never).industry,
  null,
);

const opening = toOpsOpening({
  _id: "j1",
  title: "Head of finance",
  clientId: "c1",
  status: "active",
  positionStatus: "searching",
  primaryRecruiterId: "u1",
  taLeadId: "u2",
  headcount: 2,
  assignedAt: 1_762_100_000_000,
} as never);
assert.deepEqual(opening, {
  id: "j1",
  title: "Head of finance",
  clientId: "c1",
  // The Master Sheet column wins where it is set, because it is the one the
  // desk keeps true.
  status: "searching",
  primaryRecruiterId: "u1",
  taLeadId: "u2",
  headcount: 2,
  assignedAt: 1_762_100_000_000,
});

// An older job has no normalised client and no headcount. It is still
// returned - a position Ops cannot match is a question for a person, not a
// silent gap - with one head, which is what one opening means.
const old = toOpsOpening({ _id: "j2", title: "Old role", status: "closed" } as never);
assert.equal(old.clientId, "");
assert.equal(old.headcount, 1);
assert.equal(old.taLeadId, null);

const pipeline = toOpsPipeline([
  { _id: "a1", candidateName: "One", currentStage: "client_review", setNumber: 1, backupForApplicationId: null },
  { _id: "a2", candidateName: "Two", currentStage: "client_review", setNumber: 1 },
  { _id: "a3", currentStage: "interview", setNumber: null, backupForApplicationId: "a1" },
] as never);
assert.equal(pipeline.applications.length, 3);
assert.deepEqual(pipeline.counts, { client_review: 2, interview: 1 });
assert.equal(pipeline.applications[1].backupForApplicationId, null);
assert.equal(pipeline.applications[2].candidateName, "", "a nameless row is empty, never undefined");

/* ── The door ──────────────────────────────────────────────────── */

const token = "o".repeat(43);
assert.equal(await hasPartnerBearerToken(`Bearer ${token}`, token), true);
assert.equal(await hasPartnerBearerToken(`Bearer ${"x".repeat(43)}`, token), false);
assert.equal(await hasPartnerBearerToken(`Bearer ${token}`, undefined), false, "no key set is not a way in");

const http = readFileSync(path.resolve("convex/http.ts"), "utf8");
for (const route of [
  '{ path: "/integrations/v1/people", method: "GET", handler: opsReadPeople }',
  '{ path: "/integrations/v1/clients", method: "GET", handler: opsReadClients }',
  '{ path: "/integrations/v1/openings", method: "GET", handler: opsReadOpenings }',
  '{ pathPrefix: "/integrations/v1/openings/", method: "GET", handler: opsReadOpening }',
]) {
  assert.ok(http.includes(route), "Missing route: " + route);
}

// The Ops endpoints have their own key. If this ever reads the planner's
// token, one integration's key silently unlocks the other's data.
const handlers = readFileSync(path.resolve("convex/integrations/opsReadHttp.ts"), "utf8");
assert.ok(handlers.includes("process.env.OPS_API_TOKEN"), "Ops reads must use their own token");
assert.equal(handlers.includes("CAPACITY_PLANNER_READ_TOKEN"), false, "and never the planner's");
// Read-only, and provably so: nothing that changes a row.
for (const word of ["runMutation", "ctx.db.insert", "ctx.db.patch", "ctx.db.delete"]) {
  assert.equal(handlers.includes(word), false, "The Ops read API must not " + word);
}
// There is exactly one action, and it is the partner API's own CV download -
// a read that has to sign a URL. Any other action here would need its own
// reason, so the test names this one rather than allowing actions in general.
const actions = [...handlers.matchAll(/ctx\.runAction\((\w+)/g)].map((m) => m[1]);
assert.deepEqual(actions, ["cvDownloadRef"], "The only action is the signed CV download");
assert.ok(
  handlers.includes('"integrations/partnerRead:getCvDownload"'),
  "and it is the partner API's own, not a second copy of it",
);

console.log("  ok  ops read API: shapes, honest gaps, routes, its own key, read-only");
