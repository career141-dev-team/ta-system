// convex/ui/pipeline.ts
//
// The new UI's Pipeline board: read one opening's board, move one candidate,
// shortlist one candidate (18 Nov). Public, signed-in only - see me.ts.
//
// Reads are bounded: one opening, one indexed read per column, a page of cards
// per column, candidate rows only for the cards on screen. Writes go through
// the SAME internal mutations the old app calls (convex/ta/applications.ts):
// the collision lock, the workday gate, job access and the state machine are
// theirs, unchanged. A refusal comes back as a sentence, never as a throw, so
// the board can put the card back and say why.

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { directorReviewBlockers } from "../ta/stages";
import { projectApplication } from "../ta/model/projections";
import { isGone } from "../../src/lib/bin";
import { mayReadOpening, NotSignedIn, uiUser } from "./me";
import { BACKEND_STAGES, BOARD_STAGES, cardLimit, columnCount, COUNT_CAP, inWords, moveRefusal, toCard, type BoardStage } from "./rules";

const LABEL: Record<BoardStage, string> = {
  ta_follow_up: "TA Follow-Up",
  ai_follow_up: "AI Follow-Up",
  director_review: "Director Review",
  director_shortlist: "Director Shortlist",
  client_shortlist: "Client Shortlist",
  interview: "Interview",
  offer: "Offer",
  placed: "Placed",
  rejected: "Rejected",
  dropped_out: "Dropped out",
};

const refused = (message: string) => ({ ok: false as const, message });

// Spelled out: these call the internal API, which lists this module too, so
// TypeScript cannot infer them without going round in a circle.
type Refused = { ok: false; message: string };
type MoveResult = Refused | { ok: true; stage: BoardStage; message: string };
type ShortlistResult = Refused | { ok: true; setNumber: number | null; message: string };
type MoveStageReply = { success?: boolean; stage?: string; ownerTaId?: string };
type ShortlistReply = { ok: true; alreadyMine: boolean; setNumber: number | null } | { ok: false; ownerTaId: string };

/** One opening's board: every column's count and its first cards. */
export const board = query({
  args: {
    openingId: v.string(),
    /** Only these columns (to load more of one). All of them when left out. */
    stages: v.optional(v.array(v.string())),
    /** Cards per column; 25 when left out, 200 at most. */
    limit: v.optional(v.number()),
    as: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx, args.as);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    const jobId = ctx.db.normalizeId("jobs", args.openingId);
    const job = jobId ? await ctx.db.get(jobId) : null;
    if (!jobId || !job || isGone(job)) return refused("That opening no longer exists.");
    if (!(await mayReadOpening(ctx, user, jobId))) return refused("You are not on this opening. Ask the TA lead to add you to its team.");

    const limit = cardLimit(args.limit);
    const wanted = BOARD_STAGES.filter((s) => !args.stages || args.stages.includes(s));
    const me = user._id as string;

    // ponytail: newest-created first inside a column (the index's own order);
    // the old app sorts by last stage change. Add a [jobId, currentStage,
    // lastStageChangedAt] index if TAs ask for that order.
    const columns = await Promise.all(
      wanted.map(async (stage) => {
        const rows: Doc<"applications">[] = [];
        for (const backend of BACKEND_STAGES[stage]) {
          rows.push(
            ...(await ctx.db
              .query("applications")
              .withIndex("by_job_stage", (q) => q.eq("jobId", jobId).eq("currentStage", backend as never))
              .order("desc")
              .take(COUNT_CAP + 1)),
          );
        }
        return { stage, rows };
      }),
    );

    const owners = new Map<string, string | null>();
    for (const { rows } of columns)
      for (const a of rows.slice(0, limit)) if (a.ownerTaId && a.ownerTaId !== me) owners.set(a.ownerTaId as string, null);
    await Promise.all(
      [...owners.keys()].map(async (id) => owners.set(id, (await ctx.db.get(id as Id<"users">))?.fullName ?? null)),
    );

    const out = await Promise.all(
      columns.map(async ({ stage, rows }) => {
        const shown = rows.slice(0, limit);
        const cards = await Promise.all(
          shown.map(async (a) => {
            const candidate = await ctx.db.get(a.candidateId);
            const p = projectApplication(a);
            return toCard(
              { ...p, stage },
              candidate,
              stage === "ta_follow_up" || stage === "ai_follow_up" ? directorReviewBlockers(a, candidate) : [],
              me,
              p.ownerTaId ? owners.get(p.ownerTaId) ?? null : null,
            );
          }),
        );
        return { stage, label: LABEL[stage], ...columnCount(rows.length), cards };
      }),
    );

    return { ok: true as const, opening: { id: jobId as string, title: job.title }, columns: out };
  },
});

/** Move one candidate. Shortlists (claims) them when moved into TA Follow-Up unowned. */
export const move = mutation({
  args: { applicationId: v.string(), stage: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, args): Promise<MoveResult> => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    const no = moveRefusal(args.stage, args.reason);
    if (no) return refused(no);
    const appId = ctx.db.normalizeId("applications", args.applicationId);
    const app = appId ? await ctx.db.get(appId) : null;
    const job = app ? await ctx.db.get(app.jobId) : null;
    if (!appId || !app || !job || isGone(job)) return refused("That candidate is no longer on this opening. Reload the board.");

    try {
      // The old app's own move, with this person's id: job access, the
      // workday gate, the collision lock and the state machine are all in it.
      const result: MoveStageReply = await ctx.runMutation(internal.ta.applications.moveStage, {
        actorId: user._id,
        applicationId: appId,
        stage: args.stage,
        reason: args.reason?.trim() || undefined,
      });
      if (result?.ownerTaId) {
        const owner: Doc<"users"> | null = await ctx.db.get(result.ownerTaId as Id<"users">);
        return refused(`Already shortlisted by ${owner?.fullName ?? "another recruiter"}.`);
      }
    } catch (error) {
      return refused(inWords(error, "That move could not be made. Try again."));
    }
    const stage = args.stage as BoardStage;
    return { ok: true as const, stage, message: `Moved to ${LABEL[stage]}.` };
  },
});

/** Shortlist one candidate: the first TA to shortlist owns them (the collision lock). */
export const shortlist = mutation({
  args: { applicationId: v.string() },
  handler: async (ctx, args): Promise<ShortlistResult> => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    const appId = ctx.db.normalizeId("applications", args.applicationId);
    if (!appId) return refused("That candidate is no longer on this opening. Reload.");
    try {
      const result: ShortlistReply = await ctx.runMutation(internal.ta.applications.shortlist, { actorId: user._id, applicationId: appId });
      if (!result.ok) {
        const owner: Doc<"users"> | null = await ctx.db.get(result.ownerTaId as Id<"users">);
        return refused(`Already shortlisted by ${owner?.fullName ?? "another recruiter"}.`);
      }
      return {
        ok: true as const,
        setNumber: result.setNumber,
        message: result.alreadyMine ? "Already yours." : `Shortlisted${result.setNumber ? ` as set ${result.setNumber}` : ""} - in TA Follow-Up.`,
      };
    } catch (error) {
      return refused(inWords(error, "They could not be shortlisted. Try again."));
    }
  },
});
