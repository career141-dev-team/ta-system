import assert from "node:assert/strict";
import { deleteDropped } from "../convex/ta/applicationDelete";

// "Remove from this job" on someone already in Dropped out deletes them for good (9 Nov): Sameera's dropped
// Dinisha De Silva kept Sameera as owner and locked Sanduni out. Real handler, synthetic database.
type Row = Record<string, any>;
const tables = new Map<string, Row[]>();
const rows = (t: string) => { if (!tables.has(t)) tables.set(t, []); return tables.get(t)!; };
const put = (t: string, row: Row) => { rows(t).push(row); return row._id; };
const all = () => [...tables.values()].flat();
const db = {
  get: async (id: string) => structuredClone(all().find(r => r._id === id) ?? null),
  patch: async (id: string, v: Row) => { Object.assign(all().find(r => r._id === id)!, structuredClone(v)); },
  delete: async (id: string) => { for (const t of tables.values()) { const i = t.findIndex(r => r._id === id); if (i >= 0) t.splice(i, 1); } },
  normalizeId: (_: string, id: string) => id,
  query: (table: string) => {
    const preds: ((r: Row) => boolean)[] = [];
    const q: any = {
      withIndex: (_: string, apply: (b: any) => unknown) => { const b: any = { eq: (k: string, v: unknown) => { preds.push(r => r[k] === v); return b; } }; apply(b); return q; },
      collect: async () => structuredClone(rows(table).filter(r => preds.every(p => p(r)))),
      first: async () => (await q.collect())[0] ?? null,
      take: async (n: number) => (await q.collect()).slice(0, n),
    };
    return q;
  },
};
const scheduled: unknown[] = [];
const ctx = { db, auth: { getUserIdentity: async () => null }, scheduler: { runAfter: async (_: number, __: unknown, args: unknown) => { scheduled.push(args); } } } as any;
const run = (actorId: string, applicationId: string) => (deleteDropped as any)._handler(ctx, { actorId, applicationId });

const user = (id: string, role: string) => put("users", { _id: id, fullName: id, email: `${id}@example.invalid`, role: "recruiter", taRole: role, isActive: true, isOnboarded: true });
user("admin", "admin"); user("ta", "ta");
put("candidates", { _id: "cand", fullName: "Dinisha" });
const app = (id: string, stage: string) => put("applications", { _id: id, candidateId: "cand", jobId: "job", ownerTaId: "ta", currentStage: stage });

app("dropped", "unresponsive");
put("communications", { _id: "msg", applicationId: "dropped" });
put("taOutreach", { _id: "outreach", applicationId: "dropped" });
put("pipelineEvents", { _id: "event", applicationId: "dropped" });

await assert.rejects(() => run("ta", "dropped"), /Only a lead, director or admin/, "a TA cannot delete");
assert.ok(await db.get("dropped"), "and nothing was deleted");

app("live", "follow_up");
await assert.rejects(() => run("admin", "live"), /Only someone in Dropped out/, "only from Dropped out");
assert.ok(await db.get("live"));

app("reviewed", "unresponsive");
put("directorReviews", { _id: "review", applicationId: "reviewed" });
await assert.rejects(() => run("admin", "reviewed"), /stay in Dropped out/, "Director review history keeps them");
assert.ok(await db.get("reviewed"));

app("interviewed", "unresponsive");
put("interviews", { _id: "int", applicationId: "interviewed" });
await assert.rejects(() => run("admin", "interviewed"), /stay in Dropped out/, "an interview keeps them");

assert.deepEqual(await run("admin", "dropped"), { ok: true, deleted: true });
assert.equal(await db.get("dropped"), null, "the application is gone, so its owner no longer locks other TAs out");
for (const id of ["msg", "outreach", "event"]) assert.equal(await db.get(id), null, `and its ${id} row`);
assert.ok(await db.get("cand"), "the candidate stays");
assert.deepEqual(scheduled, [{ candidateId: "cand" }], "and their overall status is worked out again");
assert.deepEqual(await run("admin", "dropped"), { ok: true, deleted: false }, "deleting twice is harmless");

console.log("Delete from Dropped out: lead-only, Dropped-out-only, history guarded, candidate kept.");
