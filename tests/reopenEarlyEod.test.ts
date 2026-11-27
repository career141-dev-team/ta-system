import assert from "node:assert/strict";
import { reopenEarlyEodEmail } from "../convex/lib/reopenEarlyEod";
import * as mail from "../convex/ta/dailyEmails";
import * as adminReopen from "../convex/admin/reopenEarlyEod";

type Row = Record<string, any>;
const tables = new Map<string, Row[]>();
const rows = (table: string) => {
  if (!tables.has(table)) tables.set(table, []);
  return tables.get(table)!;
};
const put = (table: string, row: Row) => {
  rows(table).push({ _creationTime: Date.now(), ...row });
  return row._id;
};
const db = {
  get: async (id: string) => structuredClone([...tables.values()].flat().find((r) => r._id === id) ?? null),
  patch: async (id: string, value: Row) => {
    const row = [...tables.values()].flat().find((r) => r._id === id);
    assert.ok(row, `missing row ${id}`);
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) delete row[k];
      else row[k] = structuredClone(v);
    }
  },
  normalizeId: (_: string, id: string) => id,
  query: (table: string) => {
    const predicates: ((row: Row) => boolean)[] = [];
    const query = {
      withIndex: (_: string, apply: (q: any) => unknown) => {
        const builder = {
          eq: (key: string, value: unknown) => {
            predicates.push((r) => r[key] === value);
            return builder;
          },
        };
        apply(builder);
        return query;
      },
      filter: (apply: (q: any) => (r: Row) => boolean) => {
        const q = {
          field: (key: string) => key,
          eq: (key: string, value: unknown) => (r: Row) => r[key] === value,
          neq: (key: string, value: unknown) => (r: Row) => r[key] !== value,
          and: (...ps: ((r: Row) => boolean)[]) => (r: Row) => ps.every((p) => p(r)),
          or: (...ps: ((r: Row) => boolean)[]) => (r: Row) => ps.some((p) => p(r)),
        };
        predicates.push(apply(q));
        return query;
      },
      collect: async () => structuredClone(rows(table).filter((r) => predicates.every((p) => p(r)))),
      first: async () => structuredClone(rows(table).find((r) => predicates.every((p) => p(r))) ?? null),
    };
    return query;
  },
};
const ctx: any = { db, auth: { getUserIdentity: async () => null } };

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());

// Seed user, job, workday, receipt, round, email, lead, request
put("users", { _id: "users:ta", email: "sameera@career141.com", fullName: "Sameera", role: "recruiter", taRole: "ta", isActive: true, isOnboarded: true });
put("users", { _id: "users:admin", email: "admin@career141.com", fullName: "Admin", role: "admin", taRole: "admin", isActive: true, isOnboarded: true });
put("jobs", { _id: "jobs:cfo", title: "Chief Financial Officer", status: "active", assignedTaId: "users:ta" });
put("jobAssignments", { _id: "jobAssignments:1", jobId: "jobs:cfo", userId: "users:ta", assignmentRole: "primary_recruiter", isActive: true });
put("taWorkdays", {
  _id: "taWorkdays:1",
  userId: "users:ta",
  date: today,
  finishedAt: 1000,
  closureReason: "eod",
  completion: { completedAt: 1000 },
  jobs: [{ jobId: "jobs:cfo", workType: "Follow-up", addedAt: 500 }],
});
put("taWorkdayLeads", { _id: "taWorkdayLeads:1", workdayId: "taWorkdays:1", finishedAt: 1000 });
put("taWorkdayRequests", {
  _id: "taWorkdayRequests:1",
  workdayId: "taWorkdays:1",
  status: "denied",
  reason: "Workday closed before approval",
  decidedAt: 1000,
  decidedBy: "users:ta",
});
put("taWorkdayMail", {
  _id: "taWorkdayMail:1",
  workdayId: "taWorkdays:1",
  jobId: "jobs:cfo",
  userId: "users:ta",
  dailyEmailId: "dailyEmails:1",
  submissionType: "eod",
  status: "accepted",
  finalizedAt: 1000,
});
put("reviewRounds", {
  _id: "reviewRounds:1",
  openingId: "jobs:cfo",
  sentBy: "users:ta",
  kind: "director",
  status: "awaiting",
  decisions: [],
});
const emailDoc = {
  _id: "dailyEmails:1",
  jobId: "jobs:cfo",
  userId: "users:ta",
  date: today,
  submissionType: "eod",
  number: 1,
  revision: 0,
  status: "accepted",
  fields: {},
  applicationIds: ["applications:1"],
  receiptId: "taWorkdayMail:1",
  roundId: "reviewRounds:1",
  acceptedAt: 1000,
  finalizedAt: 1000,
};
put("dailyEmails", emailDoc);

// 1. Dry run leaves everything untouched
const dry = await (adminReopen.run as any)._handler(ctx, {
  dryRun: true,
  userEmail: "sameera@career141.com",
  jobId: "jobs:cfo",
});
assert.equal(dry.dryRun, true);
assert.equal(dry.changed, false);
assert.equal(dry.summary.workdayClosed, true);
assert.equal((await db.get("dailyEmails:1"))?.recoveryReopenedAt, undefined);
assert.equal((await db.get("taWorkdays:1"))?.finishedAt, 1000);

// 2. Live reopen sets recoveryReopenedAt and reopens workday, leads, and requests
const live = await reopenEarlyEodEmail(ctx, { email: emailDoc as any, dryRun: false });
assert.equal(live.changed, true);
const reopenedEmail = await db.get("dailyEmails:1");
const reopenedReceipt = await db.get("taWorkdayMail:1");
const reopenedRound = await db.get("reviewRounds:1");
const reopenedDay = await db.get("taWorkdays:1");
const reopenedLead = await db.get("taWorkdayLeads:1");
const restoredReq = await db.get("taWorkdayRequests:1");
assert.ok(reopenedEmail && reopenedReceipt && reopenedRound && reopenedDay && reopenedLead && restoredReq);
assert.ok(reopenedEmail.recoveryReopenedAt > 0);
assert.equal(reopenedEmail.acceptedAt, 1000); // sent history preserved
assert.ok(reopenedReceipt.recoveryReopenedAt > 0);
assert.ok(reopenedRound.recoveryReopenedAt > 0);
assert.equal(reopenedDay.finishedAt, undefined);
assert.equal(reopenedDay.closureReason, undefined);
assert.equal(reopenedLead.finishedAt, undefined);
assert.equal(restoredReq.status, "pending");

// 3. Cannot reopen twice
await assert.rejects(
  () => reopenEarlyEodEmail(ctx, { email: reopenedEmail as any, dryRun: false }),
  /already been reopened/,
);

// 4. Cannot reopen when Director already recorded a decision
put("reviewRounds", {
  _id: "reviewRounds:2",
  openingId: "jobs:cfo",
  sentBy: "users:ta",
  kind: "director",
  status: "reviewed",
  decisions: [{ applicationId: "applications:2", decision: "approved" }],
});
const decidedEmail = {
  _id: "dailyEmails:2",
  jobId: "jobs:cfo",
  userId: "users:ta",
  date: today,
  submissionType: "eod",
  number: 1,
  revision: 0,
  status: "accepted",
  fields: {},
  applicationIds: ["applications:2"],
  roundId: "reviewRounds:2",
  acceptedAt: 2000,
  finalizedAt: 2000,
};
put("dailyEmails", decidedEmail);
await assert.rejects(
  () => reopenEarlyEodEmail(ctx, { email: decidedEmail as any, dryRun: false }),
  /Director has already reviewed/,
);

// 5. Role guard in ta/dailyEmails:reopenEarlyEod blocks TAs
await assert.rejects(
  () => (mail.reopenEarlyEod as any)._handler(ctx, { actorId: "users:ta", id: "dailyEmails:1" }),
  /Only a TA Lead, Director or admin/,
);

console.log("reopenEarlyEod tests passed");
