/**
 * The Ops System's read API (ops docs/15 Part E, the reads).
 *
 * The Ops System is a separate service with its own backend and its own
 * database. It never touches this one: it asks these endpoints and reads an
 * events feed. This module is the read half - five answers, all of them
 * read-only, so nothing here can change anything a TA sees.
 *
 * Two deliberate choices, both worth knowing before changing anything:
 *
 * 1. **The shapes are the Ops client's, not ours.** `ops-system/src/lib/ta.ts`
 *    already declares TaPerson, TaClient, TaOpening and TaPipeline, and its
 *    screens are built on them. The mappers below turn our rows into exactly
 *    those shapes, so the field names here are the contract and should not be
 *    "tidied" to match our own.
 * 2. **The body is the payload itself**, not an `{ok, data}` envelope. The Ops
 *    client does `response.json() as T` and reads the status code for
 *    failures, so an envelope would break it. Errors keep the existing
 *    partner-API shape, `{error}` with a 4xx/5xx status (4 Nov).
 *
 * The mappers are plain functions, exported on their own so the tests can
 * check the contract without a database.
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/** How many rows a single read may ever return. */
export const OPS_READ_LIMIT = 100;

export interface OpsPerson {
  id: string;
  fullName: string;
  email: string;
  taRole: string | null;
  isActive: boolean;
}

export function toOpsPerson(user: Doc<"users">): OpsPerson {
  return {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    taRole: user.role ?? null,
    isActive: user.isActive,
  };
}

export interface OpsContact {
  name: string;
  email: string;
  role: string | null;
  phone: string | null;
}

export interface OpsClient {
  id: string;
  name: string;
  nameKey: string;
  industry: string | null;
  esaSignedAt: number | null;
  status: string;
  opsOwnerId: string | null;
  contacts: OpsContact[];
}

/**
 * A client, as Ops reads one.
 *
 * Two honest gaps, rather than invented data:
 *
 * - We have no `opsOwnerId`: who owns a client on the Ops side is the Ops
 *   System's own record. It is always null here.
 * - Our contacts carry a free-text `title` and an `isPrimary` flag, not a
 *   role. A client set goes to whoever Ops reads as "hr", so the primary
 *   contact is mapped to "hr" and everyone else keeps their title. If the
 *   desk starts recording a real role, map it here instead.
 */
export function toOpsClient(client: Doc<"clients">): OpsClient {
  return {
    id: client._id,
    name: client.name,
    nameKey: client.nameKey,
    industry: client.industry || null,
    esaSignedAt: client.esaSignedAt ?? null,
    status: client.status,
    opsOwnerId: null,
    contacts: client.contacts.map((contact) => ({
      name: contact.name,
      email: contact.email,
      role: contact.isPrimary ? "hr" : contact.title || null,
      phone: null,
    })),
  };
}

export interface OpsOpening {
  id: string;
  title: string;
  clientId: string;
  status: string;
  primaryRecruiterId: string | null;
  taLeadId: string | null;
  headcount: number;
  assignedAt: number | null;
}

/**
 * An opening, as Ops reads one.
 *
 * `clientId` is the normalised client record. A job created before the
 * clients table existed has none; Ops keys everything on it, so such a job is
 * returned with an empty clientId rather than being hidden - a position Ops
 * cannot match is a question for a person, not a silent gap.
 */
export function toOpsOpening(job: Doc<"jobs">): OpsOpening {
  return {
    id: job._id,
    title: job.title,
    clientId: job.clientId ?? "",
    status: job.positionStatus || job.status,
    primaryRecruiterId: job.primaryRecruiterId ?? null,
    taLeadId: job.taLeadId ?? null,
    headcount: job.headcount ?? 1,
    assignedAt: job.assignedAt ?? null,
  };
}

export interface OpsPipeline {
  applications: {
    id: string;
    candidateName: string;
    currentStage: string;
    setNumber: number | null;
    backupForApplicationId: string | null;
  }[];
  counts: Record<string, number>;
}

/**
 * The pipeline of one opening, which is what the Ops depth rules are counted
 * from: five shortlisted holds the search, three or fewer waiting sends the
 * TA back out. Ops counts them itself from these rows, so the counts here are
 * a convenience and never the source of a decision.
 */
export function toOpsPipeline(applications: Doc<"applications">[]): OpsPipeline {
  const counts: Record<string, number> = {};
  for (const application of applications) {
    counts[application.currentStage] = (counts[application.currentStage] ?? 0) + 1;
  }
  return {
    applications: applications.map((application) => ({
      id: application._id,
      candidateName: application.candidateName ?? "",
      currentStage: application.currentStage,
      setNumber: application.setNumber ?? null,
      backupForApplicationId: application.backupForApplicationId ?? null,
    })),
    counts,
  };
}

/* ── The queries themselves ─────────────────────────────────────── */

export const opsPeople = internalQuery({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").take(500);
    const wanted = args.activeOnly ? users.filter((user) => user.isActive) : users;
    return wanted.map(toOpsPerson);
  },
});

export const opsClients = internalQuery({
  args: { q: v.optional(v.string()), nameKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // The dedup key is indexed, so an exact match is one lookup; a search is a
    // scan of a small table (clients number in the dozens, not the thousands).
    if (args.nameKey) {
      const exact = await ctx.db
        .query("clients")
        .withIndex("by_nameKey", (q) => q.eq("nameKey", args.nameKey as string))
        .take(OPS_READ_LIMIT);
      return exact.filter((client) => !client.binnedAt).map(toOpsClient);
    }
    const all = await ctx.db.query("clients").take(500);
    const live = all.filter((client) => !client.binnedAt);
    const needle = (args.q ?? "").trim().toLowerCase();
    const matching = needle
      ? live.filter(
          (client) => client.name.toLowerCase().includes(needle) || client.nameKey.includes(needle),
        )
      : live;
    return matching.slice(0, OPS_READ_LIMIT).map(toOpsClient);
  },
});

export const opsOpenings = internalQuery({
  args: { clientId: v.optional(v.string()), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const jobs = args.clientId
      ? await ctx.db
          .query("jobs")
          .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId as Doc<"clients">["_id"]))
          .take(OPS_READ_LIMIT)
      : await ctx.db.query("jobs").order("desc").take(OPS_READ_LIMIT);
    const wanted = args.status ? jobs.filter((job) => (job.positionStatus || job.status) === args.status) : jobs;
    return wanted.map(toOpsOpening);
  },
});

export const opsOpening = internalQuery({
  args: { openingId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.openingId as Doc<"jobs">["_id"]).catch(() => null);
    if (!job || !("title" in job)) return null;
    return toOpsOpening(job as Doc<"jobs">);
  },
});

export const opsPipeline = internalQuery({
  args: { openingId: v.string(), stage: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const jobId = args.openingId as Doc<"jobs">["_id"];
    const job = await ctx.db.get(jobId).catch(() => null);
    if (!job || !("title" in job)) return null;
    // Only live applications: a withdrawn or duplicate row is not part of the
    // pipeline a client's shortlist depth is counted from.
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
      .take(1000);
    const live = applications.filter((application) => application.isActive !== false);
    const wanted = args.stage ? live.filter((application) => application.currentStage === args.stage) : live;
    return toOpsPipeline(wanted);
  },
});
