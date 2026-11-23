// convex/ui/opening.ts
//
// The new UI's screens inside one opening (18 Nov): the opening page, Job
// Description, Automations, Scoops, LinkedIn Job, Database CVs, Strategies.
// Public, signed-in only - see me.ts.
//
// Reads: one opening, through its own indexes, a page at a time. Writes: ONLY
// those whose rules already live in the backend (follow-up switch, save JD,
// scoop upload), called with the person's own id. Writes whose rules still
// live in the old app (posts, strategy accept/submit, questions, removals) are
// deliberately not here yet: calling the generic save without those rules
// would let a person do what the old app refuses. Approve JD is not here
// either - the old app starts Research and Suggestions after it, and the door
// would skip them.

import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { isGone } from "../../src/lib/bin";
import { isDeskWideUser } from "../ta/guard";
import { mayReadOpening, NotSignedIn, uiUser } from "./me";
import { inWords, scoopFileRefusal } from "./rules";

const refused = (message: string) => ({ ok: false as const, message });
type Refused = { ok: false; message: string };

/** The person and the opening, or the sentence that stops the screen. */
async function openFor(ctx: QueryCtx, openingId: string, viewAs?: string): Promise<Refused | { ok: true; user: Doc<"users">; job: Doc<"jobs">; jobId: Id<"jobs"> }> {
  let user: Doc<"users">;
  try {
    user = await uiUser(ctx, viewAs);
  } catch (error) {
    return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
  }
  const jobId = ctx.db.normalizeId("jobs", openingId);
  const job = jobId ? await ctx.db.get(jobId) : null;
  if (!jobId || !job || isGone(job)) return refused("That opening no longer exists.");
  if (!(await mayReadOpening(ctx, user, jobId))) return refused("You are not on this opening. Ask the TA lead to add you to its team.");
  return { ok: true, user, job, jobId };
}

const names = async (ctx: QueryCtx, ids: string[]) => {
  const out: Record<string, string> = {};
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const u = ctx.db.normalizeId("users", id);
      const doc = u ? await ctx.db.get(u) : null;
      if (doc) out[id] = doc.fullName;
    }),
  );
  return out;
};

type OpeningRow = Record<string, unknown> & {
  posts: { id: string; title: string; status: string; channel?: string; assignedTaId: string | null }[];
  assignments: { userId: string; role: string; workingStage?: string }[];
};

/** The opening page, the JD screen and the Automations panel: one read. */
export const summary = query({
  args: { openingId: v.string(), as: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const o = await openFor(ctx, args.openingId, args.as);
    if (!o.ok) return o;
    const row = (await ctx.runQuery(internal.ta.openings.get, { actorId: o.user._id, openingId: o.jobId })) as OpeningRow | null;
    if (!row) return refused("That opening no longer exists.");
    const team = await names(ctx, row.assignments.map((a) => a.userId));
    const pick = (k: string) => row[k] ?? null;
    return {
      ok: true as const,
      opening: {
        id: o.jobId as string,
        title: pick("title"),
        client: pick("clientName"),
        status: pick("status"),
        positionStatus: pick("positionStatus"),
        priorityTier: pick("priorityTier"),
        headcount: pick("headcount"),
        locations: pick("locations"),
        createdAt: pick("createdAt"),
        stageCounts: pick("stageCounts"),
        jd: { markdown: pick("jdMarkdown"), status: pick("jdStatus"), approvedAt: pick("jdApprovedAt"), approvedBy: pick("jdApprovedBy") },
        followUp: { on: pick("autoFollowUp"), questions: pick("followUpQuestions") ?? [] },
        requirements: {
          seniority: pick("seniorityLevel"),
          requiredSkills: pick("requiredSkills"),
          niceToHave: pick("niceToHaveSkills"),
          yearsMin: pick("experienceMinYears"),
          yearsMax: pick("experienceMaxYears"),
          salaryMin: pick("salaryMin"),
          salaryMax: pick("salaryMax"),
          salaryCurrency: pick("salaryCurrency"),
        },
        team: row.assignments.map((a) => ({ id: a.userId, name: team[a.userId] ?? null, role: a.role, workingStage: a.workingStage ?? null })),
        posts: row.posts.map((p) => ({ id: p.id, title: p.title, status: p.status, channel: p.channel ?? null, recruiterId: p.assignedTaId })),
      },
    };
  },
});

/** The opening page's rings (R5, 21 Nov 2026): the old Overview's "Targets" table -
 *  ta/targets:forJob as the person asking (a TA their own row, a lead or admin every TA
 *  on the job): CVs shortlisted today and LinkedIn links added today against the TA's
 *  daily targets (null = not set). Read only. */
export const targets = query({
  args: { openingId: v.string(), as: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const o = await openFor(ctx, args.openingId, args.as);
    if (!o.ok) return o;
    const rows = (await ctx.runQuery(internal.ta.targets.forJob, { actorId: o.user._id, jobId: o.jobId })) as {
      userId: string; userName: string; cvsPerDay: number | null; linksPerDay: number | null; cvsToday: number; linksToday: number;
    }[];
    return {
      ok: true as const,
      rows: rows.map((r) => ({ userId: r.userId, name: r.userName, cvsPerDay: r.cvsPerDay, linksPerDay: r.linksPerDay, cvsToday: r.cvsToday, linksToday: r.linksToday })),
    };
  },
});

const card = (a: Doc<"applications">, c: Doc<"candidates"> | null) => ({
  id: a._id as string,
  name: c?.fullName?.trim() || "Name not on record",
  title: c?.currentJobTitle ?? null,
  company: c?.currentEmployer ?? null,
  location: c?.location ?? null,
  years: c?.totalExperienceYears ?? null,
  noticeDays: c?.noticePeriodDays ?? null,
  ownerId: (a.ownerTaId ?? null) as string | null,
  addedAt: a._creationTime,
});

/** Scoop CVs on this opening, newest first. */
export const scoops = query({
  args: { openingId: v.string(), limit: v.optional(v.number()), as: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const o = await openFor(ctx, args.openingId, args.as);
    if (!o.ok) return o;
    // ponytail: the newest 400 rows of the opening, scoops picked from them.
    // An opening with more than 400 applications since its oldest scoop
    // would hide older scoops; add an index on [jobId, scoopAt] if one does.
    const rows = (await ctx.db.query("applications").withIndex("by_jobId", (q) => q.eq("jobId", o.jobId)).order("desc").take(400))
      .filter((a) => a.scoopAt || a.taSourcingChannel === "SCOOP")
      .slice(0, Math.min(args.limit ?? 50, 200));
    const people = await Promise.all(rows.map(async (a) => ({ ...card(a, await ctx.db.get(a.candidateId)), sentBy: (a.scoopFromUserId ?? a.scoopByUserId ?? null) as string | null })));
    const who = await names(ctx, people.flatMap((p) => [p.ownerId, p.sentBy].filter((x): x is string => !!x)));
    return { ok: true as const, me: o.user._id as string, people, names: who };
  },
});

/** One LinkedIn post's applicants, newest first. */
export const postApplicants = query({
  args: { openingId: v.string(), postId: v.string(), limit: v.optional(v.number()), as: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const o = await openFor(ctx, args.openingId, args.as);
    if (!o.ok) return o;
    const postId = ctx.db.normalizeId("jobPosts", args.postId);
    const post = postId ? await ctx.db.get(postId) : null;
    if (!postId || !post || post.openingId !== o.jobId) return refused("That post is not on this opening.");
    const rows = await ctx.db.query("applications").withIndex("by_jobPostId", (q) => q.eq("jobPostId", postId)).order("desc").take(Math.min(args.limit ?? 50, 200));
    const people = await Promise.all(rows.map(async (a) => ({ ...card(a, await ctx.db.get(a.candidateId)), stage: a.currentStage })));
    const who = await names(ctx, people.map((p) => p.ownerId).filter((x): x is string => !!x));
    return { ok: true as const, me: o.user._id as string, people, names: who };
  },
});

/** Database CVs: what matching last found for this opening. */
export const matches = query({
  args: { openingId: v.string(), as: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const o = await openFor(ctx, args.openingId, args.as);
    if (!o.ok) return o;
    const found = (await ctx.runQuery(internal.ta.matching.reverseMatchResults, { actorId: o.user._id, openingId: o.jobId })) as
      | { status: string | null; matchedAt: string | null; results: { cvId: string; overallScore: number; reason: string }[] }
      | null;
    if (!found) return { ok: true as const, status: null, matchedAt: null, results: [] };
    // Who to show (18 Nov, the new UI's Database CVs): the person's details
    // beside each score, and nobody a TA took off with "Not for this job".
    const out = [];
    for (const r of found.results) {
      if (out.length >= 100) break;
      const id = ctx.db.normalizeId("candidates", r.cvId);
      if (!id) continue;
      const gone = await ctx.db.query("matchExclusions").withIndex("by_opening_candidate", (q) => q.eq("openingId", o.jobId).eq("candidateId", id)).first();
      if (gone) continue;
      const c = await ctx.db.get(id);
      if (!c) continue;
      out.push({
        ...r,
        name: c.fullName?.trim() || "Name not on record",
        title: c.currentJobTitle ?? null,
        company: c.currentEmployer ?? null,
        location: c.location ?? null,
        years: c.totalExperienceYears ?? null,
        noticeDays: c.noticePeriodDays ?? null,
      });
    }
    return { ok: true as const, status: found.status, matchedAt: found.matchedAt, results: out };
  },
});

/** Strategies on this opening: all for a lead, a director or admin; your own for a TA. */
export const strategies = query({
  args: { openingId: v.string(), as: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const o = await openFor(ctx, args.openingId, args.as);
    if (!o.ok) return o;
    const me = o.user._id as string;
    const all = isDeskWideUser(o.user);
    const rows = (await ctx.db.query("strategyAssignments").withIndex("by_opening", (q) => q.eq("openingId", o.jobId)).take(200)).filter(
      (r) => !r.notApplicable && (all || (r.acknowledgements ?? []).some((a) => (a.taId as string) === me) || r.doneBy.some((d) => (d as string) === me)),
    );
    return {
      ok: true as const,
      rows: rows.map((r) => ({
        id: r._id as string,
        name: r.strategyName,
        assignedTo: (r.acknowledgements ?? []).map((a) => a.taId as string),
        doneBy: r.doneBy.map((d) => d as string),
        doneAt: r.doneAt ?? null,
        submittedAt: r.submittedAt ?? null,
        note: r.note ?? null,
        proofs: r.proofs.length,
        // This person's own place on it: on the row, and still to accept (18 Nov).
        mine: r.doneBy.some((d) => (d as string) === me) || (r.acknowledgements ?? []).some((x) => (x.taId as string) === me),
        waiting: (r.acknowledgements ?? []).some((x) => (x.taId as string) === me && x.acceptedAt === null),
      })),
    };
  },
});

// ── Writes whose rules already live in the backend ──────────────────────────

type Done = Refused | { ok: true; message: string };

/** Automatic follow-up on or off (convex/ta/followUp.ts holds who may). */
export const setFollowUp = mutation({
  args: { openingId: v.string(), on: v.boolean() },
  handler: async (ctx, args): Promise<Done> => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    try {
      await ctx.runMutation(internal.ta.followUp.setAuto, { actorId: user._id, openingId: args.openingId, enabled: args.on });
    } catch (error) {
      return refused(inWords(error, "The switch could not be saved. Try again."));
    }
    return { ok: true, message: args.on ? "Automatic follow-up is on." : "Automatic follow-up is off." };
  },
});

/** Save the JD text (convex/ta/openings.ts saveJd holds who may and re-reads the details). */
export const saveJd = mutation({
  args: { openingId: v.string(), markdown: v.string() },
  handler: async (ctx, args): Promise<Done> => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    if (!args.markdown.trim()) return refused("Add the job description before saving it.");
    try {
      await ctx.runMutation(internal.ta.openings.saveJd, { actorId: user._id, openingId: args.openingId, jdMarkdown: args.markdown, detailsFromJd: true });
    } catch (error) {
      return refused(inWords(error, "The JD could not be saved. Try again."));
    }
    return { ok: true, message: "JD saved. The job details are read again." };
  },
});

/** Step 1 of a scoop upload: where the browser puts the file. */
export const scoopUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<Refused | { ok: true; url: string }> => {
    try {
      await uiUser(ctx);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    return { ok: true, url: await ctx.storage.generateUploadUrl() };
  },
});

/** Step 2: read the uploaded file as a scoop on this opening (job access and the workday gate are in queue). */
export const queueScoop = mutation({
  args: { openingId: v.string(), storageId: v.id("_storage"), fileName: v.string(), fromUserId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Refused | { ok: true; cvUploadId: string; message: string }> => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    // The size and type the storage itself recorded - never what the browser says.
    const file = await ctx.db.system.get(args.storageId);
    const no = scoopFileRefusal(args.fileName, file?.size ?? 0, file?.contentType ?? "");
    if (no) {
      await ctx.storage.delete(args.storageId);
      return refused(no);
    }
    try {
      const id = await ctx.runMutation(internal.ta.scoopUpload.queue, {
        actorId: user._id,
        openingId: args.openingId,
        fromUserId: args.fromUserId,
        storageId: args.storageId,
        fileName: args.fileName,
        fileSize: file!.size,
        fileType: file!.contentType ?? "application/pdf",
      });
      return { ok: true, cvUploadId: String(id), message: `Reading ${args.fileName}.` };
    } catch (error) {
      return refused(inWords(error, "The CV could not be added. Try again."));
    }
  },
});
