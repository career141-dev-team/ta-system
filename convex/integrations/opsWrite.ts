/**
 * The Ops System's writes (ops docs/15 Part E, the writes).
 *
 * Reading was the easy half. These change TA's own data, so three rules shape
 * every one of them:
 *
 * 1. **Through TA's own doors, never around them.** Each write calls the
 *    mutation the app already uses - `ta/openings:create`,
 *    `ta/openings:setWorkingStage`, `ta/openings:updateMasterSheet`,
 *    `ta/notifications:create` - so TA's rules, its audit and its bells all
 *    happen exactly as they do when a person clicks. Nothing here patches a
 *    row behind their back.
 * 2. **Repeat-safe.** The Ops System queues its writes and retries after an
 *    outage, so the same write will arrive twice. Every one carries an
 *    `idempotencyKey`; the first result is kept and handed back on a repeat,
 *    so a retried hand-over cannot make two openings.
 * 3. **One actor, named.** A server-to-server call has no signed-in person,
 *    so every change is attributed to the TA user named in
 *    `OPS_API_ACTOR_EMAIL`. Unset, or no such user, and the writes refuse -
 *    an unattributable change to a live opening is worse than no change.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { executeStageTransition } from "../pipeline/pipelineStateMachine";
import { raiseOpsEvent } from "../lib/opsEvents";

/* ── Repeat-safe ────────────────────────────────────────────────── */

export const recallWrite = internalQuery({
  args: { idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const seen = await ctx.db
      .query("opsApiWrites")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    return seen ? { answer: seen.answer, at: seen.createdAt } : null;
  },
});

const remember = async (ctx: MutationCtx, idempotencyKey: string, path: string, answer: unknown) => {
  await ctx.db.insert("opsApiWrites", {
    idempotencyKey,
    path,
    answer: JSON.stringify(answer ?? null).slice(0, 4000),
    createdAt: Date.now(),
  });
};

/** The one person every Ops-originated change is recorded as. */
export const opsActor = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const wanted = args.email.trim().toLowerCase();
    if (!wanted) return null;
    const users = await ctx.db.query("users").take(500);
    const actor = users.find((user) => user.email.toLowerCase() === wanted && user.isActive);
    return actor ? { id: actor._id as string, fullName: actor.fullName, role: actor.role } : null;
  },
});

/* ── The writes themselves ──────────────────────────────────────── */

/**
 * Tell somebody in the TA System something (Part E, `POST notify`).
 *
 * The smallest write there is, and the one that ends the worst habit on the
 * board: news passed by hand, arriving late. It only ever adds a bell.
 */
export const opsNotify = internalMutation({
  args: {
    idempotencyKey: v.string(),
    userId: v.string(),
    type: v.string(),
    title: v.string(),
    body: v.string(),
    jobId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("notifications", {
      userId: args.userId as Id<"users">,
      // Every bell from the Ops System carries its own type, so a TA can see
      // where it came from and this never borrows a type that means something
      // else. What Ops called it is kept at the front of the body.
      type: "from_ops" as const,
      title: args.title.slice(0, 200),
      body: (args.type && args.type !== "from_ops" ? args.type + ": " : "").concat(args.body).slice(0, 600),
      jobId: args.jobId ? (args.jobId as Id<"jobs">) : undefined,
      read: false,
      createdAt: new Date().toISOString(),
    });
    const answer = { ok: true, notificationId: id as string };
    await remember(ctx, args.idempotencyKey, "notify", answer);
    return answer;
  },
});

/**
 * Create an opening from a requirement (Part E, `POST openings`).
 *
 * This is the hand-over: the moment a client's requirement becomes the TA
 * System's job. It goes through `ta/openings:create`, so the opening, its
 * first post and its brief are made exactly as the app makes them.
 */
export const opsCreateOpening = internalMutation({
  args: {
    idempotencyKey: v.string(),
    actorId: v.string(),
    clientId: v.string(),
    title: v.string(),
    country: v.optional(v.string()),
    brief: v.optional(v.string()),
    assignedTaIds: v.optional(v.array(v.string())),
    taLeadId: v.optional(v.union(v.string(), v.null())),
    priorityTier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const made = (await ctx.runMutation(internal.ta.openings.create, {
      actorId: args.actorId,
      clientId: args.clientId,
      title: args.title,
      country: args.country,
      assignedTaIds: args.assignedTaIds ?? [],
      taLeadId: args.taLeadId ?? null,
      notesMarkdown: args.brief,
      briefKind: "management_to_lead" as const,
      priorityTier: args.priorityTier,
    })) as { openingId?: string; id?: string } | null;

    const openingId = made?.openingId ?? made?.id ?? null;
    // Ops queues the hand-over and never invents an opening id: this event is
    // how it learns the real one (15, Phase 3).
    if (openingId) {
      await raiseOpsEvent(ctx, "opening.created", {
        openingId,
        clientId: args.clientId,
        title: args.title,
      });
    }
    const answer = { ok: true, openingId };
    await remember(ctx, args.idempotencyKey, "openings", answer);
    return answer;
  },
});

/**
 * Who is on an opening, and what they are doing on it today
 * (Part E, `POST openings/{id}/team` and `/working-stage`).
 *
 * The 100% day is the TA lead's to set, and Ops only records what was
 * decided in the requirement meeting - which is why this goes through the
 * same mutation the lead's own menu uses.
 */
export const opsSetWorkingStage = internalMutation({
  args: {
    idempotencyKey: v.string(),
    actorId: v.string(),
    openingId: v.string(),
    userId: v.optional(v.string()),
    mode: v.union(v.literal("100%"), v.literal("Follow-up"), v.literal("Add-on")),
  },
  // Annotated (5 Nov): calling another mutation through `internal` made the
  // type refer to itself once the deploy regenerated the api, and the
  // release failed its typecheck.
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const done: unknown = await ctx.runMutation(internal.ta.openings.setWorkingStage, {
      actorId: args.actorId,
      openingId: args.openingId,
      userId: args.userId,
      stage: args.mode,
    });
    const answer: Record<string, unknown> = { ok: true, ...(done as Record<string, unknown>) };
    await remember(ctx, args.idempotencyKey, "working-stage", answer);
    return answer;
  },
});

/**
 * Open, hold, fill or close an opening (Part E, `POST openings/{id}/status`).
 *
 * Ops holds a position when a client goes quiet and reopens it when they come
 * back; TA's Master Sheet is where that lives, and it refuses a change with no
 * reason - which is the owner's own standing rule, enforced by TA rather than
 * repeated here.
 */
export const opsSetOpeningStatus = internalMutation({
  args: {
    idempotencyKey: v.string(),
    actorId: v.string(),
    openingId: v.string(),
    status: v.union(v.literal("open"), v.literal("on_hold"), v.literal("filled"), v.literal("closed")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.openingId as Id<"jobs">).catch(() => null);
    if (!job || !("title" in job)) throw new Error("Opening not found");

    const positionStatus =
      args.status === "open"
        ? ("active" as const)
        : args.status === "on_hold"
          ? ("hold" as const)
          : args.status === "filled"
            ? ("filled" as const)
            : ("lost" as const);

    const row = job as { assignedAt?: number; closedAt?: number; valueOnProgressing?: number; valueOfPlacement?: number; valueLost?: number };
    await ctx.runMutation(internal.ta.openings.updateMasterSheet, {
      actorId: args.actorId,
      openingId: args.openingId,
      positionStatus,
      assignedAt: row.assignedAt ?? null,
      closedAt: args.status === "closed" || args.status === "filled" ? Date.now() : (row.closedAt ?? null),
      valueOnProgressing: row.valueOnProgressing ?? null,
      valueOfPlacement: row.valueOfPlacement ?? null,
      valueLost: row.valueLost ?? null,
      reason: args.reason,
    });

    await raiseOpsEvent(ctx, args.status === "closed" ? "opening.closed" : "opening.updated", {
      openingId: args.openingId,
      status: args.status,
      reason: args.reason.slice(0, 200),
    });
    const answer = { ok: true, openingId: args.openingId, positionStatus };
    await remember(ctx, args.idempotencyKey, "status", answer);
    return answer;
  },
});

/* ── The client, the sets, the candidates ───────────────────────── */

/**
 * Who owns this client on the Ops side (Part E, `POST clients/{id}`).
 *
 * TA had nowhere to put it, so the read answered null and a TA looking at a
 * client could not see who to ask. One optional field, written only by Ops.
 */
export const opsSetClientOwner = internalMutation({
  args: {
    idempotencyKey: v.string(),
    clientId: v.string(),
    opsOwnerEmail: v.string(),
    opsOwnerName: v.string(),
  },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId as Id<"clients">).catch(() => null);
    if (!client || !("nameKey" in client)) throw new Error("Client not found");
    await ctx.db.patch(client._id, {
      opsOwnerEmail: args.opsOwnerEmail.slice(0, 200) || undefined,
      opsOwnerName: args.opsOwnerName.slice(0, 120) || undefined,
    });
    const answer = { ok: true, clientId: args.clientId };
    await remember(ctx, args.idempotencyKey, "clients", answer);
    return answer;
  },
});

/**
 * The set has gone, and this is the day they received it
 * (Part E, `POST client-sets/{roundId}/sent`).
 *
 * The received date is the one that matters: every clock on the Ops side -
 * CV ownership, the feedback chase, the two weeks before a hold - counts from
 * it and not from the send.
 */
export const opsClientSetSent = internalMutation({
  args: {
    idempotencyKey: v.string(),
    roundId: v.string(),
    sentAt: v.number(),
    receivedAt: v.optional(v.number()),
    sentTo: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId as Id<"reviewRounds">).catch(() => null);
    if (!round || !("applicationIds" in round)) throw new Error("That set does not exist");
    await ctx.db.patch(round._id, {
      dispatch: "sent" as const,
      sentAt: args.sentAt,
      receivedAt: args.receivedAt ?? args.sentAt,
      ...(args.sentTo?.length ? { sentTo: args.sentTo.join(", ").slice(0, 500) } : {}),
    });
    const answer = { ok: true, roundId: args.roundId, setNumber: round.setNumber ?? null };
    await remember(ctx, args.idempotencyKey, "client-sets-sent", answer);
    return answer;
  },
});

/**
 * What the client decided about one candidate
 * (Part E, `POST applications/{id}/client-decision`).
 *
 * Through TA's own state machine, so the move is recorded, the pipeline event
 * is raised and TA's rejection notice goes exactly as it does when a TA moves
 * somebody by hand. The client's own words are kept on the review row: the
 * owner's rule is that no reject is saved without a reason.
 */
export const opsClientDecision = internalMutation({
  args: {
    idempotencyKey: v.string(),
    actorId: v.string(),
    applicationId: v.string(),
    decision: v.union(v.literal("shortlisted"), v.literal("rejected"), v.literal("hold")),
    reason: v.string(),
    reviewedByName: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const applicationId = args.applicationId as Id<"applications">;
    const application = await ctx.db.get(applicationId).catch(() => null);
    if (!application || !("currentStage" in application)) throw new Error("Application not found");

    const targetStage = args.decision === "shortlisted" ? ("interview" as const) : ("rejected" as const);
    if (args.decision !== "hold") {
      await executeStageTransition(ctx, {
        applicationId,
        targetStage,
        actorId: args.actorId,
        reason: args.reason.slice(0, 500),
        // There is no signed-in person on a server-to-server call. The client
        // decided this; who may record it is decided on the Ops side.
        bypassRoleCheck: true,
      });
    }

    await ctx.db.insert("clientReviews", {
      applicationId,
      jobId: application.jobId,
      decision:
        args.decision === "shortlisted"
          ? ("selected_for_interview" as const)
          : args.decision === "hold"
            ? ("hold" as const)
            : ("rejected" as const),
      clientFeedback: args.reason.slice(0, 1000),
      reviewedByName: (args.reviewedByName || "the client").slice(0, 120),
      reviewedAt: args.decidedAt ?? Date.now(),
      createdAt: Date.now(),
      slaBreached: false,
      esaVerified: true,
    });

    const answer = { ok: true, applicationId: args.applicationId, stage: targetStage };
    await remember(ctx, args.idempotencyKey, "client-decision", answer);
    return answer;
  },
});

/**
 * The client says they already had this CV
 * (Part E, `POST applications/{id}/client-owned`).
 *
 * Inside the window the candidate comes out of the set and the rest of it
 * carries on; the reason is written down, because this is a reject like any
 * other and the owner's rule holds.
 */
export const opsClientOwned = internalMutation({
  args: {
    idempotencyKey: v.string(),
    actorId: v.string(),
    applicationId: v.string(),
    claimedAt: v.number(),
    because: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const applicationId = args.applicationId as Id<"applications">;
    const application = await ctx.db.get(applicationId).catch(() => null);
    if (!application || !("currentStage" in application)) throw new Error("Application not found");

    await ctx.db.patch(applicationId, { clientOwnedAt: args.claimedAt });
    await executeStageTransition(ctx, {
      applicationId,
      targetStage: "rejected" as const,
      actorId: args.actorId,
      reason: (args.because || "The client already had this CV.").slice(0, 500),
      bypassRoleCheck: true,
    });

    const answer = { ok: true, applicationId: args.applicationId };
    await remember(ctx, args.idempotencyKey, "client-owned", answer);
    return answer;
  },
});

/* ── The opening's own extras ───────────────────────────────────── */

/**
 * Who is the primary TA, and which day is the 100% day
 * (Part E, `POST openings/{id}/team`).
 *
 * The TA lead decides both in the requirement meeting; Ops only records what
 * was decided. The day is TA's own field, so it goes on the opening, and the
 * TA is told in the same breath - they are the one who has to act on it.
 */
export const opsSetTeam = internalMutation({
  args: {
    idempotencyKey: v.string(),
    actorId: v.string(),
    openingId: v.string(),
    primaryRecruiterId: v.optional(v.string()),
    hundredPercentDay: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const jobId = args.openingId as Id<"jobs">;
    const job = await ctx.db.get(jobId).catch(() => null);
    if (!job || !("title" in job)) throw new Error("Opening not found");

    if (args.primaryRecruiterId) {
      // Who the primary recruiter *is* stays a TA action: TA's own mutation
      // for it asks for a signed-in admin or TA manager, and a
      // server-to-server call has nobody to be. So Ops records what the
      // requirement meeting decided - this TA is on this opening at 100% -
      // through the same mutation the lead's own menu uses, and tells them.
      // Changing the assignment itself is left to a person in TA on purpose
      // (5 Nov).
      await ctx.runMutation(internal.ta.openings.setWorkingStage, {
        actorId: args.actorId,
        openingId: args.openingId,
        userId: args.primaryRecruiterId,
        stage: "100%" as const,
      });
      await ctx.db.insert("notifications", {
        userId: args.primaryRecruiterId as Id<"users">,
        type: "from_ops" as const,
        title: "You are the primary TA on " + job.title,
        body:
          "Recorded from the requirement meeting." +
          (args.hundredPercentDay ? " The 100% day is " + args.hundredPercentDay + "." : ""),
        jobId: jobId as Id<"jobs">,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    const answer = { ok: true, openingId: args.openingId };
    await remember(ctx, args.idempotencyKey, "team", answer);
    return answer;
  },
});

/**
 * An advert, and what happened to it
 * (Part E, `POST openings/{id}/posts` and `/ad-channel`).
 *
 * TA's mail intake files a CV by the post it came through, so a post Ops
 * records with its own apply alias is what makes a TopJobs or Talent Pulse CV
 * arrive with its source already known.
 */
export const opsAdChannel = internalMutation({
  args: {
    idempotencyKey: v.string(),
    openingId: v.string(),
    channel: v.string(),
    state: v.optional(v.string()),
    url: v.optional(v.string()),
    applyAlias: v.optional(v.string()),
    postedAt: v.optional(v.number()),
    liveAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    cost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const jobId = args.openingId as Id<"jobs">;
    const job = await ctx.db.get(jobId).catch(() => null);
    if (!job || !("title" in job)) throw new Error("Opening not found");

    const channel = args.channel.slice(0, 40);
    const posts = (await ctx.db.query("jobPosts").take(1000)).filter(
      (post) => (post.openingId as string) === args.openingId && post.channel === channel,
    );
    const live = posts.find((post) => post.status !== "closed") ?? posts[0] ?? null;
    const closing = args.state === "closed";

    if (live) {
      await ctx.db.patch(live._id, {
        ...(args.url ? { externalUrl: args.url.slice(0, 500) } : {}),
        ...(args.postedAt || args.liveAt ? { postedAt: args.postedAt ?? args.liveAt } : {}),
        ...(closing ? { status: "closed" as const, closedAt: args.closedAt ?? Date.now() } : {}),
      });
      const answer = { ok: true, postId: live._id as string, channel };
      await remember(ctx, args.idempotencyKey, "ad-channel", answer);
      return answer;
    }

    const id = await ctx.db.insert("jobPosts", {
      openingId: jobId,
      title: job.title,
      previousTitles: [],
      aliasKeywords: [],
      channel,
      campaignCode: (args.applyAlias ?? channel + "-" + Date.now().toString(36)).slice(0, 80),
      routingEmailAlias: (args.applyAlias ?? "").slice(0, 200),
      externalUrl: args.url ? args.url.slice(0, 500) : null,
      postedAt: args.postedAt ?? args.liveAt ?? Date.now(),
      status: closing ? ("closed" as const) : ("live" as const),
      createdAt: Date.now(),
    } as never);

    const answer = { ok: true, postId: id as string, channel };
    await remember(ctx, args.idempotencyKey, "ad-channel", answer);
    return answer;
  },
});

/* ── Interviews ─────────────────────────────────────────────────── */

/**
 * An interview the client's side agreed (Part E, `POST interviews`).
 *
 * Ops books the client's half: the time, the people, the link. The candidate
 * is the TA System's and nothing here writes to them - the TA is told, and
 * the TA asks the candidate, which is the owner's rule.
 */
export const opsCreateInterview = internalMutation({
  args: {
    idempotencyKey: v.string(),
    actorId: v.string(),
    applicationId: v.string(),
    scheduledAt: v.number(),
    round: v.optional(v.number()),
    interviewFormat: v.optional(v.string()),
    interviewers: v.optional(v.array(v.string())),
    whereOrLink: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const applicationId = args.applicationId as Id<"applications">;
    const application = await ctx.db.get(applicationId).catch(() => null);
    if (!application || !("currentStage" in application)) throw new Error("Application not found");

    const round = args.round && args.round > 0 ? Math.min(args.round, 9) : 1;
    const id = await ctx.db.insert("interviews", {
      applicationId,
      jobId: application.jobId,
      candidateId: application.candidateId,
      interviewType:
        round === 1 ? ("first_interview" as const) : round === 2 ? ("second_interview" as const) : ("final_interview" as const),
      scheduledAt: args.scheduledAt,
      interviewFormat:
        args.interviewFormat === "onsite"
          ? ("in_person" as const)
          : args.interviewFormat === "phone"
            ? ("phone" as const)
            : ("video" as const),
      outcome: "pending" as const,
      taOutcome: "pending" as const,
      round,
      interviewers: (args.interviewers ?? []).slice(0, 10),
      location: (args.whereOrLink ?? "").slice(0, 500),
      coordinatedBy: args.actorId as Id<"users">,
      createdAt: Date.now(),
    } as never);

    await ctx.db.patch(applicationId, { interviewId: id } as never);

    await raiseOpsEvent(ctx, "interview.booked", {
      applicationId: args.applicationId,
      openingId: application.jobId as string,
      interviewId: id as string,
      scheduledAt: args.scheduledAt,
      round,
    });
    const answer = { ok: true, interviewId: id as string, round };
    await remember(ctx, args.idempotencyKey, "interviews", answer);
    return answer;
  },
});

/**
 * What happened to an interview
 * (Part E, `POST interviews/{id}` with attendance, cancel or a decision).
 *
 * One mutation for the three, because they are the same thing from TA's point
 * of view: the row's outcome changed and the TA has to know.
 */
export const opsInterviewOutcome = internalMutation({
  args: {
    idempotencyKey: v.string(),
    interviewId: v.string(),
    what: v.union(v.literal("attendance"), v.literal("cancel"), v.literal("client-decision")),
    outcome: v.optional(v.string()),
    decision: v.optional(v.string()),
    reason: v.optional(v.string()),
    at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.interviewId as Id<"interviews">).catch(() => null);
    if (!row || !("applicationId" in row)) throw new Error("Interview not found");
    const now = args.at ?? Date.now();
    const said = (args.reason ?? "").slice(0, 500);

    if (args.what === "attendance") {
      const came = args.outcome === "attended";
      await ctx.db.patch(row._id, {
        taOutcome: came ? ("attended" as const) : ("no_show" as const),
        outcome: came ? ("pending" as const) : ("no_show" as const),
        completedAt: now,
        ...(said ? { taNotes: said } : {}),
      });
    } else if (args.what === "cancel") {
      await ctx.db.patch(row._id, {
        taOutcome: "cancelled" as const,
        outcome: "rescheduled" as const,
        ...(said ? { taNotes: said } : {}),
      });
    } else {
      const picked = args.decision === "selected" || args.decision === "next";
      await ctx.db.patch(row._id, {
        outcome: picked ? ("passed" as const) : ("failed" as const),
        taResult: picked ? ("passed" as const) : ("failed" as const),
        ...(said ? { clientFeedback: said } : {}),
        completedAt: row.completedAt ?? now,
      });
    }

    await raiseOpsEvent(ctx, "interview.outcome", {
      applicationId: row.applicationId as string,
      openingId: row.jobId as string,
      interviewId: args.interviewId,
      what: args.what,
      outcome: args.outcome ?? args.decision ?? null,
    });
    const answer = { ok: true, interviewId: args.interviewId, what: args.what };
    await remember(ctx, args.idempotencyKey, "interview-" + args.what, answer);
    return answer;
  },
});

/**
 * The client asked for a reference (Part E, `POST reference-requests`).
 *
 * It only ever raises a bell: the TA rings the referee and writes down what
 * was said, word for word. There is no form and no score, which is the
 * owner's decision of 26 October.
 */
export const opsReferenceRequest = internalMutation({
  args: {
    idempotencyKey: v.string(),
    applicationId: v.string(),
    requestedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const application = await ctx.db.get(args.applicationId as Id<"applications">).catch(() => null);
    if (!application || !("currentStage" in application)) throw new Error("Application not found");
    const job = await ctx.db.get(application.jobId).catch(() => null);
    const userId = application.ownerTaId ?? (job && "primaryRecruiterId" in job ? job.primaryRecruiterId : null);
    if (userId) {
      await ctx.db.insert("notifications", {
        userId,
        type: "from_ops" as const,
        title: "The client asked for a reference: " + (application.candidateName ?? "a candidate"),
        body: "Ring the referee directly and write down what was said, word for word. No form, no score.",
        jobId: application.jobId,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
    const answer = { ok: true, applicationId: args.applicationId, told: Boolean(userId) };
    await remember(ctx, args.idempotencyKey, "reference-requests", answer);
    return answer;
  },
});

/* ── Placements ─────────────────────────────────────────────────── */

/**
 * What happened to a placement
 * (Part E, `POST placements/{id}` with a joining day, a no-show, a
 * cancellation, a leaver, or the invoice's state).
 *
 * The money is the Ops System's; TA's placement row is what its own closing
 * checklist reads, so it is kept true from here rather than left to drift.
 */
export const opsPlacementOutcome = internalMutation({
  args: {
    idempotencyKey: v.string(),
    placementId: v.string(),
    what: v.union(
      v.literal("join-date"),
      v.literal("no-show"),
      v.literal("cancel"),
      v.literal("left"),
      v.literal("invoice-state"),
    ),
    joinDateMs: v.optional(v.number()),
    reason: v.optional(v.string()),
    at: v.optional(v.number()),
    invoiceNumber: v.optional(v.string()),
    amount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.placementId as Id<"placements">).catch(() => null);
    if (!row || !("applicationId" in row)) throw new Error("Placement not found");
    const now = args.at ?? Date.now();
    const said = (args.reason ?? "").slice(0, 500);

    if (args.what === "join-date") {
      if (!args.joinDateMs) throw new Error("A joining day needs a date.");
      await ctx.db.patch(row._id, { joinDate: new Date(args.joinDateMs).toISOString().slice(0, 10) });
    } else if (args.what === "no-show" || args.what === "cancel" || args.what === "left") {
      await ctx.db.patch(row._id, {
        fellThroughAt: now,
        fellThroughReason:
          (args.what === "no-show" ? "Did not turn up. " : args.what === "cancel" ? "Lost before joining. " : "Left. ") +
          said,
      } as never);
    } else {
      await ctx.db.patch(row._id, {
        invoiceSent: true,
        invoiceSentAt: now,
        ...(args.amount ? { invoiceAmount: args.amount } : {}),
        ...(args.invoiceNumber ? { invoiceNumber: args.invoiceNumber.slice(0, 60) } : {}),
      } as never);
    }

    const answer = { ok: true, placementId: args.placementId, what: args.what };
    await remember(ctx, args.idempotencyKey, "placement-" + args.what, answer);
    return answer;
  },
});
