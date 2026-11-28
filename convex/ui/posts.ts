// convex/ui/posts.ts
//
// PR 1b (18 Nov): the LinkedIn Job screen's post actions, with the rules the
// old app checked in Next.js (src/app/actions.ts addJobPost / updatePost /
// setPostStatus / deleteJobPost / transferCvs, src/data/store.ts) now in the
// same transaction as the write. Who may: `opening.manage` (the recruiters on
// the opening, or a lead), as there. What the old generic save did on the
// side is done here too: the workday evidence row for a new post or a changed
// link, the workday checks refresh, and the mailbox re-read for a new link.

import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { mapUser } from "../../src/data/convex/map";
import { can } from "../../src/lib/auth";
import { isGone } from "../../src/lib/bin";
import { makeCampaignCode } from "../../src/lib/routing";
import { linkedinPostUrl } from "../../src/lib/workdayRequirements";
import { adjustJobStageStat } from "../jobs/stats";
import { linkedinJobId } from "../lib/postRouting";
import { refreshWorkdayChecks } from "../ta/workdays";
import { mayReadOpening, NotSignedIn, uiUser } from "./me";

type Refused = { ok: false; message: string };
type Done = Refused | { ok: true; message: string };
const refused = (message: string): Refused => ({ ok: false, message });

const JD_NOT_APPROVED = "This job cannot go live until its JD is approved. Approve the JD first, then set the advert live.";
const BAD_LINK = "Paste a valid LinkedIn job, Recruiter project, or job post link.";
const BAD_PUBLIC = "The public job link must be the job's own page, like https://www.linkedin.com/jobs/view/4123456789 (not a Recruiter link).";

/** The person may manage this opening (opening.manage), or the sentence why not. */
async function manager(ctx: MutationCtx, jobId: Id<"jobs">): Promise<Refused | { ok: true; user: Doc<"users">; job: Doc<"jobs"> }> {
  let user: Doc<"users">;
  try {
    user = await uiUser(ctx);
  } catch (error) {
    return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
  }
  const job = await ctx.db.get(jobId);
  if (!job || isGone(job)) return refused("That opening no longer exists.");
  const row = await ctx.db
    .query("jobAssignments")
    .withIndex("by_jobId_userId", (q) => q.eq("jobId", jobId).eq("userId", user._id))
    .filter((q) => q.eq(q.field("isActive"), true))
    .first();
  const verdict = can(mapUser(user as never), "opening.manage", {
    openingId: jobId as string,
    assignment: row ? ({ userId: user._id as string, role: row.assignmentRole } as never) : null,
  });
  return verdict.ok ? { ok: true, user, job } : refused(verdict.message);
}

/** A post on the opening named, and its manager. */
async function postFor(ctx: MutationCtx, postIdRaw: string) {
  const postId = ctx.db.normalizeId("jobPosts", postIdRaw);
  const post = postId ? await ctx.db.get(postId) : null;
  if (!postId || !post) return refused("That post no longer exists.");
  const m = await manager(ctx, post.openingId);
  if (!m.ok) return m;
  return { ...m, post, postId };
}

/** What the old generic save did beside a new post or a changed link. */
async function sideEffects(ctx: MutationCtx, jobId: Id<"jobs">, postId: Id<"jobPosts">, by: Id<"users">, link: string | null, linkChanged: boolean) {
  if (linkChanged) {
    await ctx.db.insert("taWorkdayEvidence", { jobId, recordId: postId as string, table: "jobPosts", at: Date.now(), by, version: link ?? "" } as never);
  }
  await refreshWorkdayChecks(ctx, jobId, by);
  // A new or changed link: fetch the people who applied before it was saved.
  if (link && linkChanged) await ctx.runMutation(internal.communications.emailAgent.queueRescanForLink, { url: link }).catch(() => null);
}

const isApproved = (job: Doc<"jobs">) => (job as { jdStatus?: string }).jdStatus === "approved";

/** A campaign code nobody else holds. */
async function freeCode(ctx: MutationCtx, title: string): Promise<string> {
  const taken: string[] = [];
  for (let i = 0; i < 20; i++) {
    const code = makeCampaignCode(title, taken);
    if (!(await ctx.db.query("jobPosts").withIndex("by_campaignCode", (q) => q.eq("campaignCode", code)).first())) return code;
    taken.push(code);
  }
  return makeCampaignCode(title, taken);
}

export const addPost = mutation({
  args: {
    openingId: v.string(),
    title: v.string(),
    channel: v.optional(v.string()),
    live: v.optional(v.boolean()),
    link: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Done> => {
    const jobId = ctx.db.normalizeId("jobs", args.openingId);
    if (!jobId) return refused("That opening no longer exists.");
    const m = await manager(ctx, jobId);
    if (!m.ok) return m;
    const title = args.title.trim().replace(/\s+/g, " ").slice(0, 160);
    if (!title) return refused("A post needs the title candidates see.");
    const link = args.link?.trim() || null;
    if (link && !linkedinPostUrl(link)) return refused(BAD_LINK);
    if (args.live && !isApproved(m.job)) return refused(JD_NOT_APPROVED);
    const channel = (["linkedin", "facebook", "email_campaign"] as const).find((c) => c === args.channel) ?? "linkedin";

    const opening = (await ctx.runQuery(internal.ta.openings.get, { actorId: m.user._id, openingId: jobId })) as
      | { assignedTaIds?: string[]; locations?: string[]; clientName?: string | null }
      | null;
    const team = opening?.assignedTaIds ?? [];
    const me = m.user._id as string;
    // Whoever creates it owns it unless the opening has exactly one recruiter (store.ts).
    const owner = team.includes(me) ? me : team.length === 1 ? team[0] : me;
    const country = opening?.locations?.[0] ?? null;
    const siblings = await ctx.db.query("jobPosts").withIndex("by_opening", (q) => q.eq("openingId", jobId)).take(200);
    const twin = siblings.find(
      (p) => p.title.trim().toLowerCase() === title.toLowerCase() && p.channel === channel && (p.assignedTaId ?? null) === owner && (p.country ?? null) === country,
    );
    if (twin) return refused(`There is already a post called "${twin.title}" on this job.`);

    const slug = (opening?.clientName ?? "job").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 6);
    const now = Date.now();
    const postId = await ctx.db.insert("jobPosts", {
      openingId: jobId,
      title,
      previousTitles: [],
      aliasKeywords: [],
      country,
      city: null,
      channel,
      campaignCode: await freeCode(ctx, title),
      // ponytail: the old store numbered this by the desk's whole post count;
      // a per-opening count plus the time keeps it unique without that scan.
      routingEmailAlias: `jobs+${slug}-${siblings.length + 1}${now.toString(36).slice(-3)}@career141.com`,
      assignedTaId: owner as Id<"users">,
      externalUrl: link,
      postedAt: args.live ? now : null,
      status: args.live ? "live" : "draft",
      cvCountToday: 0,
      createdAt: now,
    } as never);
    await sideEffects(ctx, jobId, postId, m.user._id, link, true);
    return { ok: true, message: `Job post "${title}" added.` };
  },
});

export const updatePost = mutation({
  args: {
    postId: v.string(),
    title: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    aliases: v.optional(v.array(v.string())),
    recruiterId: v.optional(v.string()),
    link: v.optional(v.string()),
    publicLink: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Done> => {
    const p = await postFor(ctx, args.postId);
    if (!p.ok) return p;
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) {
      const title = args.title.trim().replace(/\s+/g, " ").slice(0, 160);
      if (!title) return refused("A post needs the title candidates see.");
      // A renamed advert keeps answering to its old title (posting type 4).
      if (title !== p.post.title) patch.previousTitles = [...new Set([...(p.post.previousTitles ?? []), p.post.title])];
      patch.title = title;
    }
    if (args.city !== undefined) patch.city = args.city.trim() || null;
    if (args.country !== undefined) patch.country = args.country.trim() || null;
    if (args.aliases !== undefined) patch.aliasKeywords = args.aliases.map((x) => x.trim()).filter(Boolean);
    if (args.recruiterId !== undefined) patch.assignedTaId = (args.recruiterId && ctx.db.normalizeId("users", args.recruiterId)) || null;
    if (args.link !== undefined) {
      const url = args.link.trim();
      if (url && !linkedinPostUrl(url)) return refused(BAD_LINK);
      patch.externalUrl = url || null;
    }
    if (args.publicLink !== undefined) {
      const url = args.publicLink.trim();
      if (url && !(/linkedin\.com\/(?:comm\/)?jobs\/view\//i.test(url) && linkedinJobId(url))) return refused(BAD_PUBLIC);
      patch.publicUrl = url || null;
    }
    await ctx.db.patch(p.postId, patch);
    const changed = "externalUrl" in patch && patch.externalUrl !== (p.post.externalUrl ?? null);
    await sideEffects(ctx, p.post.openingId, p.postId, p.user._id, (patch.externalUrl as string | null) ?? null, changed);
    return { ok: true, message: "Job post saved." };
  },
});

export const setPostStatus = mutation({
  args: { postId: v.string(), status: v.union(v.literal("draft"), v.literal("live"), v.literal("paused"), v.literal("closed")) },
  handler: async (ctx, args): Promise<Done> => {
    const p = await postFor(ctx, args.postId);
    if (!p.ok) return p;
    if (args.status === "live" && p.post.status !== "live" && !isApproved(p.job)) return refused(JD_NOT_APPROVED);
    await ctx.db.patch(p.postId, { status: args.status, ...(args.status === "live" && !p.post.postedAt ? { postedAt: Date.now() } : {}) } as never);
    await refreshWorkdayChecks(ctx, p.post.openingId, p.user._id);
    const word = { draft: "a draft", live: "live", paused: "paused", closed: "closed" }[args.status];
    return { ok: true, message: `The post is ${word}.` };
  },
});

export const deletePost = mutation({
  args: { postId: v.string() },
  handler: async (ctx, args): Promise<Done> => {
    const p = await postFor(ctx, args.postId);
    if (!p.ok) return p;
    // Its applicants stay on the opening, filed under no post (store.ts deleteJobPost).
    const apps = await ctx.db.query("applications").withIndex("by_jobPostId", (q) => q.eq("jobPostId", p.postId)).collect();
    for (const a of apps) await ctx.db.patch(a._id, { jobPostId: undefined });
    await ctx.db.delete(p.postId);
    await refreshWorkdayChecks(ctx, p.post.openingId, p.user._id);
    return { ok: true, message: apps.length ? `Post deleted. Its ${apps.length} CVs stay on the job.` : "Post deleted." };
  },
});

/** Spec §6.1: moves a post's CVs (the ticked ones, or all) onto another post of the same job. */
export const moveCvs = mutation({
  args: { fromPostId: v.string(), toPostId: v.string(), applicationIds: v.optional(v.array(v.string())) },
  handler: async (ctx, args): Promise<Done> => {
    const p = await postFor(ctx, args.fromPostId);
    if (!p.ok) return p;
    const toId = ctx.db.normalizeId("jobPosts", args.toPostId);
    const to = toId ? await ctx.db.get(toId) : null;
    if (!toId || !to) return refused("That post no longer exists.");
    if (to.openingId !== p.post.openingId) return refused("That record belongs to a different opening.");
    if (toId === p.postId) return refused("Choose another post.");
    // ponytail: one transaction; a post with more CVs than one mutation may
    // write would fail here as a whole. Batch it if a post ever holds thousands.
    const all = await ctx.db.query("applications").withIndex("by_jobPostId", (q) => q.eq("jobPostId", p.postId)).collect();
    const picked = args.applicationIds && new Set(args.applicationIds);
    const apps = picked ? all.filter((a) => picked.has(a._id)) : all;
    if (picked && !apps.length) return refused("Those CVs are no longer on this post.");
    for (const a of apps) await ctx.db.patch(a._id, { jobPostId: toId });
    await refreshWorkdayChecks(ctx, p.post.openingId, p.user._id);
    return { ok: true, message: `Moved ${apps.length} ${apps.length === 1 ? "CV" : "CVs"} to "${to.title}".` };
  },
});

// Only people nobody has started on: an owner means a set number, follow-up
// messages and reviews that all belong to this opening.
const MOVABLE = new Set(["new_cvs", "matched_candidates", "rejected"]);

/** Moves the ticked CVs onto a post of another opening, where they arrive as New. */
export const moveToOpening = mutation({
  args: { fromPostId: v.string(), toPostId: v.string(), applicationIds: v.array(v.string()) },
  handler: async (ctx, args): Promise<Done> => {
    const p = await postFor(ctx, args.fromPostId);
    if (!p.ok) return p;
    const to = await postFor(ctx, args.toPostId);
    if (!to.ok) return to;
    const jobId = to.post.openingId;
    if (jobId === p.post.openingId) return refused("Choose another opening.");
    if (to.job.status !== "active") return refused("That opening is not active.");
    if (to.post.status !== "live") return refused("Choose a live post.");
    // ponytail: one transaction, so a cap; the screen ticks at most a page of 200.
    if (args.applicationIds.length > 200) return refused("Move at most 200 CVs at a time.");

    const now = Date.now();
    let moved = 0;
    let started = 0;
    let there = 0;
    for (const raw of new Set(args.applicationIds)) {
      const id = ctx.db.normalizeId("applications", raw);
      const a = id ? await ctx.db.get(id) : null;
      if (!a || a.jobPostId !== p.postId || a.jobId !== p.post.openingId) continue;
      if (a.ownerTaId || !MOVABLE.has(a.currentStage)) {
        started++;
        continue;
      }
      const twin = await ctx.db.query("applications").withIndex("by_candidate_job", (q) => q.eq("candidateId", a.candidateId).eq("jobId", jobId)).first();
      if (twin) {
        there++;
        continue;
      }
      await ctx.db.patch(a._id, {
        jobId,
        jobPostId: to.postId,
        currentStage: "new_cvs",
        lastStageChangedAt: now,
        isActive: true,
        movedFrom: { jobId: p.post.openingId, jobTitle: p.job.title, postTitle: p.post.title, at: now, by: p.user._id },
        stageHistory: [
          ...(a.stageHistory ?? []),
          { stage: "new_cvs", enteredAt: new Date(now).toISOString(), changedBy: p.user._id, note: `Moved from "${p.job.title}", post "${p.post.title}"` },
        ],
        // What was said or scored about them for the old opening stays behind.
        workLocationId: undefined,
        workdayReviewedAt: undefined,
        workdayReviewedBy: undefined,
        reappliedAt: undefined,
        aiMatchScore: undefined,
        aiMatchExplanation: undefined,
        taMatchScore: undefined,
        taMatchReason: undefined,
        taRejectionReason: undefined,
        rejectedFromStage: undefined,
        rejectedBy: undefined,
        rejectedAt: undefined,
        rejectReason: undefined,
        answers: undefined,
        customFollowUpAnswers: undefined,
      });
      await adjustJobStageStat(ctx, p.post.openingId, a.currentStage, a.currentStage, false, true);
      await adjustJobStageStat(ctx, jobId, null, "new_cvs", true);
      moved++;
    }
    const left = [
      started ? `${started} already being worked on` : "",
      there ? `${there} already on that opening` : "",
    ].filter(Boolean).join(", ");
    if (!moved) return refused(left ? `Nothing moved: ${left}.` : "Those CVs are no longer on this post.");
    await refreshWorkdayChecks(ctx, p.post.openingId, p.user._id);
    await refreshWorkdayChecks(ctx, jobId, p.user._id);
    return { ok: true, message: `Moved ${moved} ${moved === 1 ? "CV" : "CVs"} to "${to.post.title}" on "${to.job.title}".${left ? ` Not moved: ${left}.` : ""}` };
  },
});

/** The opening's posts as the LinkedIn Job screen shows them (18 Nov): links,
 *  other names, place, owner and today's CV count. A TA sees the posts they own,
 *  a lead or anyone desk-wide all of them, as in the old screen. */
export const list = query({
  args: { openingId: v.string() },
  handler: async (ctx, args) => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    const jobId = ctx.db.normalizeId("jobs", args.openingId);
    if (!jobId || !(await mayReadOpening(ctx, user, jobId))) return refused("That opening is not one of yours.");
    const rows = await ctx.db.query("jobPosts").withIndex("by_opening", (q) => q.eq("openingId", jobId)).take(200);
    const ownerIds = [...new Set(rows.flatMap((p) => (p.assignedTaId ? [p.assignedTaId] : [])))];
    const owners = await Promise.all(ownerIds.map((id) => ctx.db.get(id)));
    const nameOf = new Map(owners.flatMap((u) => (u ? [[u._id as string, u.fullName.split(" ")[0]] as const] : [])));
    return {
      ok: true as const,
      me: user._id as string,
      posts: rows.map((p) => ({
        id: p._id as string,
        title: p.title,
        status: p.status,
        channel: p.channel ?? "linkedin",
        aliases: p.aliasKeywords ?? [],
        city: p.city ?? "",
        country: p.country ?? "",
        code: p.campaignCode ?? null,
        link: p.externalUrl ?? "",
        publicLink: p.publicUrl ?? "",
        ownerId: (p.assignedTaId ?? null) as string | null,
        owner: p.assignedTaId ? nameOf.get(p.assignedTaId as string) ?? "" : "",
        today: p.cvCountToday ?? 0,
      })),
    };
  },
});
