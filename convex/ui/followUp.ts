/**
 * The new UI's follow-up chat (22 Nov 2026; AI-FLOWS item 28): what the WhatsApp and
 * email assistant has sent and collected for one candidate, and the old candidate
 * page's buttons - Send next, Take over, Hand back, Stop.
 *
 * Thin over the old backend: the reads are ta/outreach:followUpState + messagesFor
 * and ta/followUp:gateStatus (what old AURA's LiveFollowUp reads); the buttons are
 * ta/followUp:send / takeOver / handBack / stop with this person's id, so job access,
 * the "another TA's candidate" lock, the outreach guards and test mode all stay theirs.
 * Writes never take `as` (an admin viewing as a TA reads only).
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { isGone } from "../../src/lib/bin";
import { mayReadOpening, NotSignedIn, uiUser } from "./me";
import { inWords } from "./rules";

const refused = (message: string) => ({ ok: false as const, message });

type State = Record<string, unknown> | null;
type Message = { id: string; direction: string; channel: string; subject: string | null; body: string; deliveryStatus: string; stoppedSequence: boolean; sentAt: number; errorMessage?: string | null };

/** One candidate's follow-up: state, the conversation (newest 60) and whether sending is live or in test mode. */
export const chat = query({
  args: { applicationId: v.string(), as: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx, args.as);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    const appId = ctx.db.normalizeId("applications", args.applicationId);
    const app = appId ? await ctx.db.get(appId) : null;
    const job = app ? await ctx.db.get(app.jobId) : null;
    if (!appId || !app || !job || isGone(job)) return refused("That candidate is no longer on this opening.");
    if (!(await mayReadOpening(ctx, user, app.jobId))) return refused("You are not on this opening. Ask the TA lead to add you to its team.");
    const [state, messages, gate] = (await Promise.all([
      ctx.runQuery(internal.ta.outreach.followUpState, { actorId: user._id, applicationId: appId }),
      ctx.runQuery(internal.ta.outreach.messagesFor, { actorId: user._id, applicationId: appId, limit: 60 }),
      ctx.runQuery(internal.ta.followUp.gateStatus, {}),
    ])) as [State, Message[], { live: boolean }];
    return {
      ok: true as const,
      state,
      live: gate.live,
      // Oldest first, as a chat reads.
      messages: messages.map((m) => ({
        id: m.id, direction: m.direction, channel: m.channel, subject: m.subject, body: m.body,
        status: m.deliveryStatus, stopped: m.stoppedSequence, at: m.sentAt, error: m.errorMessage ?? null,
      })).reverse(),
    };
  },
});

/** The old buttons. Same words back as old AURA's candidate page (src/lib/candidates/followUpWrites.ts). */
export const act = mutation({
  args: {
    applicationId: v.string(),
    do: v.union(v.literal("send"), v.literal("takeOver"), v.literal("handBack"), v.literal("stop")),
    channel: v.optional(v.union(v.literal("whatsapp"), v.literal("email"))),
  },
  handler: async (ctx, args) => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    const appId = ctx.db.normalizeId("applications", args.applicationId);
    if (!appId || !(await ctx.db.get(appId))) return refused("That candidate is no longer on this opening.");
    const who = { actorId: user._id, applicationId: appId };
    try {
      if (args.do === "send") {
        const r = (await ctx.runMutation(internal.ta.followUp.send, { ...who, channel: args.channel })) as {
          sent: boolean; reason?: string; kind?: string; attempt?: number; maxAttempts?: number; sameRound?: boolean;
        };
        if (!r.sent) return refused(r.reason ?? "Nothing was sent.");
        const first = r.kind === "initial";
        const what = args.channel === "whatsapp"
          ? first ? "WhatsApp follow-up sent (approved template)" : "WhatsApp reminder sent"
          : args.channel === "email"
            ? first ? "Follow-up email sent" : "Reminder email sent"
            : first ? "Follow-up sent - WhatsApp template and email" : "Reminder sent";
        return { ok: true as const, message: first || r.sameRound ? `${what}. Delivery shows in the conversation in a few seconds.` : `${what} - follow-up ${r.attempt} of ${r.maxAttempts}.` };
      }
      if (args.do === "takeOver") {
        await ctx.runMutation(internal.ta.followUp.takeOver, who);
        return { ok: true as const, message: "You have this conversation. The assistant will not reply or send reminders until you hand it back." };
      }
      if (args.do === "handBack") {
        const r = (await ctx.runMutation(internal.ta.followUp.handBack, who)) as { answering?: boolean } | null;
        return { ok: true as const, message: r?.answering ? "Handed back. The assistant is answering the candidate's last message now." : "Handed back. The assistant will send the next reminder within a day." };
      }
      await ctx.runMutation(internal.ta.followUp.stop, who);
      return { ok: true as const, message: "Follow-up stopped. Nothing further will be sent." };
    } catch (error) {
      return refused(inWords(error, "That could not be done. Try again."));
    }
  },
});
