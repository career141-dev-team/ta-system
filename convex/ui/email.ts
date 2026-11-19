// convex/ui/email.ts
//
// D5a (19 Nov): the Midday & End of day email screen, everything BEFORE the
// send - its emails (drafts, sent, 31 days), the sidebar's sent list, missed
// days, the send context, adding a midday, autosave, the pre-send checks and a
// lead settling an uncertain send. Each one is a thin signed-in wrapper over the
// rule that already lives in ta/dailyEmails or ta/workdays; the person is the
// Clerk sign-in (ui/day.ts who), never an argument.
//
// NOT here on purpose: the send. ta/dailyEmails:begin and ta/eodMail:send take
// the email's HTML and recipients as given, and today the rows, the Prepared CV
// PDFs and the workbook are built only on the Next server. A door that took
// them from the browser would let a browser mail anything from a TA's mailbox.

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { who } from "./day";
import { inWords } from "./rules";

type Refused = { ok: false; message: string };
type Done = Refused | { ok: true; message: string };
const refused = (message: string): Refused => ({ ok: false, message });

/** This opening's daily emails: a TA's own, everyone's for a lead (the rule is in ta/dailyEmails:list). */
export const emails = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, a): Promise<Refused | { ok: true; emails: unknown; missed: unknown; context: unknown }> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    try {
      const emails: unknown = await ctx.runQuery(internal.ta.dailyEmails.list, { actorId: w.user._id, jobId: a.jobId });
      const missed: unknown = await ctx.runQuery(internal.ta.dailyEmails.missedDays, { actorId: w.user._id, jobId: a.jobId }).catch(() => []);
      const context: unknown = await ctx.runQuery(internal.ta.workdays.eodContext, { actorId: w.user._id, jobId: a.jobId }).catch(() => null);
      return { ok: true, emails, missed, context };
    } catch (error) {
      return refused(inWords(error, "Could not load this opening's emails. Try again."));
    }
  },
});

/** The email as it would go now: people, L-sheet line, To / Cc, subject (ta/dailyEmails:compose). */
export const compose = query({
  args: { jobId: v.id("jobs"), workLocationId: v.optional(v.string()), forDate: v.optional(v.string()) },
  handler: async (ctx, a): Promise<Refused | { ok: true; email: unknown }> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    try {
      const email: unknown = await ctx.runQuery(internal.ta.dailyEmails.compose, { actorId: w.user._id, ...a });
      return { ok: true, email };
    } catch (error) {
      return refused(inWords(error, "Could not build this email. Try again."));
    }
  },
});

/** The sidebar's "Sent in the last 31 days", across openings. */
export const sent = query({
  args: {},
  handler: async (ctx): Promise<Refused | { ok: true; sent: unknown }> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    try {
      const sent: unknown = await ctx.runQuery(internal.ta.dailyEmails.sent, { actorId: w.user._id });
      return { ok: true, sent };
    } catch (error) {
      return refused(inWords(error, "Could not load your sent emails."));
    }
  },
});

/** Midday 2, 3...: a new draft on today's workday (the rule refuses one without a workday). */
export const addMidday = mutation({
  args: { jobId: v.id("jobs"), workLocationId: v.optional(v.string()) },
  handler: async (ctx, a): Promise<Refused | { ok: true; message: string; id: unknown }> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    try {
      const id: unknown = await ctx.runMutation(internal.ta.dailyEmails.createDraft, { actorId: w.user._id, ...a });
      return { ok: true, message: "Midday email added.", id };
    } catch (error) {
      return refused(inWords(error, "Could not add a midday email."));
    }
  },
});

/**
 * Autosave. `revision` is the draft's own lock (a stale tab is refused) and
 * `fields` is checked by ta/dailyEmails:saveDraft's own validator and allow-list.
 */
export const saveDraft = mutation({
  args: { id: v.id("dailyEmails"), revision: v.number(), fields: v.any() },
  handler: async (ctx, a): Promise<Refused | { ok: true; message: string; result: unknown }> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    try {
      const result: unknown = await ctx.runMutation(internal.ta.dailyEmails.saveDraft, { actorId: w.user._id, ...a });
      return { ok: true, message: "Draft saved.", result };
    } catch (error) {
      return refused(inWords(error, "The draft was not saved. Try again."));
    }
  },
});

/**
 * "Before you send": what still blocks this email (ta/workdays:emailPreflight).
 * Advice only - the send re-checks everything. `scoopsOnly` is not taken from
 * the browser; without it the stricter rule holds (the ChatGPT link is asked for).
 */
export const preflight = mutation({
  args: { jobId: v.id("jobs"), link: v.string(), confirmed: v.boolean(), revised: v.optional(v.boolean()), workLocationId: v.optional(v.string()) },
  handler: async (ctx, a): Promise<Refused | { ok: true; blockers: string[] }> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    try {
      const r = (await ctx.runMutation(internal.ta.workdays.emailPreflight, { actorId: w.user._id, ...a })) as { blockers?: string[] };
      return { ok: true, blockers: r.blockers ?? [] };
    } catch (error) {
      return refused(inWords(error, "Could not check this email. Try again."));
    }
  },
});

/** A lead settles a send that "may or may not have gone out" (5 minutes old, with a reason - the rule's own). */
export const settle = mutation({
  args: { id: v.id("dailyEmails"), accepted: v.boolean(), reason: v.string() },
  handler: async (ctx, a): Promise<Done> => {
    const w = await who(ctx);
    if (!w.ok) return w;
    try {
      await ctx.runMutation(internal.ta.dailyEmails.reconcile, { actorId: w.user._id, ...a });
    } catch (error) {
      return refused(inWords(error, "That email could not be settled."));
    }
    return { ok: true, message: a.accepted ? "Marked as sent." : "Marked as not sent." };
  },
});
