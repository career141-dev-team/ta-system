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

/* ── The sets, the placements, and the prepared CV ──────────────── */

export interface OpsClientSet {
  id: string;
  setNumber: number;
  openingId: string;
  applicationIds: string[];
  applications: { id: string; name: string; preparedCv: boolean }[];
  dispatch: string;
  status: string;
  sentAt: number | null;
  receivedAt: number | null;
}

/**
 * One round of CVs as TA keeps it.
 *
 * Ops fetches each prepared CV once and keeps its own copy, because what the
 * client actually received must still be readable a year later even if TA
 * replaces a CV. `preparedCv` says whether there is one to fetch at all - a
 * candidate with none is taken out of the set with a reason, which is exactly
 * the refusal the Ops side shows.
 */
export const opsClientSets = internalQuery({
  args: { openingId: v.string(), setNumber: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const jobId = args.openingId as Doc<"jobs">["_id"];
    const job = await ctx.db.get(jobId).catch(() => null);
    if (!job || !("title" in job)) return null;

    const rounds = (await ctx.db.query("reviewRounds").take(1000)).filter(
      (round) => round.openingId === jobId && round.kind === "client",
    );
    const wanted = args.setNumber ? rounds.filter((round) => round.setNumber === args.setNumber) : rounds;

    const sets: OpsClientSet[] = [];
    for (const round of wanted) {
      const applications = [];
      for (const applicationId of round.applicationIds) {
        const application = await ctx.db.get(applicationId).catch(() => null);
        if (!application || !("currentStage" in application)) continue;
        applications.push({
          id: application._id as string,
          name: application.candidateName ?? "",
          preparedCv: Boolean(application.cvFileId ?? application.candidateCvUploadId),
        });
      }
      sets.push({
        id: round._id as string,
        setNumber: round.setNumber ?? 0,
        openingId: round.openingId as string,
        applicationIds: round.applicationIds as unknown as string[],
        applications,
        dispatch: round.dispatch,
        status: round.status,
        sentAt: round.sentAt ?? null,
        receivedAt: round.receivedAt ?? null,
      });
    }
    return sets.sort((a, b) => a.setNumber - b.setNumber);
  },
});

export interface OpsPlacement {
  id: string;
  applicationId: string;
  openingId: string;
  clientId: string;
  candidateName: string;
  placedSalary: number | null;
  currency: string | null;
  salaryBasis: string | null;
  package: string | null;
  offerLetterFileId: string | null;
  joinDateMs: number | null;
  joinConfirmedAt: number | null;
  fellThroughAt: number | null;
  fellThroughReason: string | null;
}

/**
 * A placement, which is TA's own.
 *
 * Ops reads it rather than keeping its own version, because the package and
 * the joining day are TA's record and the invoice is built from them. The
 * joining day is a date string in TA and milliseconds here: Ops counts thirty
 * days from it, and counting on a string is how a fee goes out a day late.
 */
export const opsPlacements = internalQuery({
  args: { placementId: v.optional(v.string()), openingId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("placements").order("desc").take(500);
    const wanted = args.placementId
      ? rows.filter((row) => (row._id as string) === args.placementId)
      : args.openingId
        ? rows.filter((row) => (row.jobId as string) === args.openingId)
        : [];

    const out: OpsPlacement[] = [];
    for (const row of wanted.slice(0, OPS_READ_LIMIT)) {
      const application = await ctx.db.get(row.applicationId).catch(() => null);
      const day = Date.parse(row.joinDate);
      out.push({
        id: row._id as string,
        applicationId: row.applicationId as string,
        openingId: row.jobId as string,
        clientId: (row.clientId as string) ?? "",
        candidateName:
          application && "candidateName" in application ? (application.candidateName ?? "") : "",
        placedSalary: row.placedSalary ?? null,
        currency: row.placedSalaryCurrency ?? null,
        salaryBasis: row.salaryBasis ?? null,
        package: (row as { packageNotes?: string }).packageNotes ?? null,
        offerLetterFileId: (row as { offerLetterFileId?: string }).offerLetterFileId ?? null,
        joinDateMs: Number.isFinite(day) ? day : null,
        joinConfirmedAt: row.joinConfirmedAt ?? null,
        fellThroughAt: (row as { fellThroughAt?: number }).fellThroughAt ?? null,
        fellThroughReason: (row as { fellThroughReason?: string }).fellThroughReason ?? null,
      });
    }
    return out;
  },
});

/** Which file is an application's prepared CV, for streaming it to Ops. */
export const opsPreparedCvId = internalQuery({
  args: { applicationId: v.string() },
  handler: async (ctx, args) => {
    const application = await ctx.db.get(args.applicationId as Doc<"applications">["_id"]).catch(() => null);
    if (!application || !("currentStage" in application)) return null;
    const uploadId = application.cvFileId ?? application.candidateCvUploadId ?? null;
    return uploadId ? { uploadId: uploadId as string } : null;
  },
});

/* ── The events feed ────────────────────────────────────────────── */

/**
 * What TA has to tell Ops, in order, after a cursor.
 *
 * The cursor is the `at` of the last event Ops handled, so a reader that
 * crashes halfway through a batch asks for the same batch again - handlers on
 * the Ops side are idempotent for exactly that reason. Ordering is by time,
 * and two events in the same millisecond are broken by their own id, so the
 * cursor can never stick.
 */
export const opsEventsAfter = internalQuery({
  args: { after: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
    const after = (args.after ?? "").trim();

    // The cursor is the id of the last event the Ops reader handled - not a
    // timestamp. Its reader stops at the first event it could not handle and
    // keeps the one before it, so the cursor has to name a row exactly. A
    // plain number is still accepted, because the written contract said one
    // and somebody will send it (5 Nov, wiring the two sides).
    let from = 0;
    let skipTo: string | null = null;
    if (after) {
      if (/^\d+$/.test(after)) {
        from = Number(after);
      } else {
        const row = await ctx.db.get(after as Doc<"opsEvents">["_id"]).catch(() => null);
        if (!row || !("type" in row)) return null;
        from = row.at;
        skipTo = after;
      }
    }

    const rows = await ctx.db
      .query("opsEvents")
      .withIndex("by_at", (q) => (skipTo ? q.gte("at", from) : q.gt("at", from)))
      .order("asc")
      .take(limit + 50);

    // Two events can share a millisecond, so the row the cursor names is
    // dropped along with anything before it rather than being read twice.
    const after_ = skipTo ? rows.slice(rows.findIndex((row) => (row._id as string) === skipTo) + 1) : rows;

    return after_.slice(0, limit).map((row) => ({
      id: row._id as string,
      type: row.type,
      at: row.at,
      data: ((): Record<string, unknown> => {
        try {
          return JSON.parse(row.data) as Record<string, unknown>;
        } catch {
          return {};
        }
      })(),
    }));
  },
});
