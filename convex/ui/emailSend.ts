// convex/ui/emailSend.ts
//
// D5 step 2 (19 Nov): the Midday email sent from the new UI, without CV
// attachments - the old app's "Send without CV attachments" path
// (src/app/actions.ts sendDailyEmail + emailEod with skipAttachments), built on
// the server instead of the Next app.
//
// What the browser may say is exactly what the old form said: the TA's edits to
// table 1's cells, the subject, the opening and closing words, the addresses
// they took off or added, the ChatGPT link and its tick. Everything else - who
// is in the email, the L-sheet line, To / Cc, the HTML, the sender - is built
// here from the database with the old app's own helpers, and then the same
// reservation (ta/dailyEmails:begin, every guard) and the same sender
// (ta/eodMail:send: test mode, outbound lock, Graph) run as they do today.
//
// Not here yet: a Midday WITH its Prepared CVs and the End of day (they need
// the PDFs and the workbook, step 3), the referee-calls block (EOD only), and
// saving the TA's cell edits back to the candidate after the send (step 4).

import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { mapUser } from "../../src/data/convex/map";
import { checkResearchSubmission, eodEmailHtml, parseAddressList, scoopsOnly, type ShortlistRow } from "../../src/lib/eod-format";
export type { CellEdit };
import { plainSendFailure, UNCERTAIN_SEND_MESSAGE } from "../../src/lib/sendFailure";
import { workdayDate } from "../../src/lib/workday";
import { inWorkLocation } from "../../src/lib/workLocations";
import type { DailyEmailSnapshot } from "../../src/lib/dailyEmail";
import { recipients, shortlistInbox } from "../lib/eodCompose";
import { NotSignedIn, uiUser } from "./me";
import { inWords, withEdits, type CellEdit } from "./rules";

type Refused = { ok: false; message: string };
const refused = (message: string): Refused => ({ ok: false, message });

const edit = v.object({ applicationId: v.string(), field: v.string(), value: v.string() });
const form = {
  jobId: v.id("jobs"),
  workLocationId: v.optional(v.string()),
  edits: v.array(edit),
  subject: v.string(),
  intro: v.string(),
  outro: v.string(),
  extraTo: v.string(),
  extraCc: v.string(),
  removed: v.string(),
  link: v.string(),
  confirmed: v.boolean(),
};

/** Build the Midday exactly as the old send does, for the signed-in person. */
export const prepareMidday = internalQuery({
  args: form,
  handler: async (ctx, a) => {
    let user;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    let built: { rows: ShortlistRow[]; effort: DailyEmailSnapshot["effort"]; subject: string; workType: DailyEmailSnapshot["workType"]; workLocationId: string | null };
    try {
      built = (await ctx.runQuery(internal.ta.dailyEmails.compose, { actorId: user._id, jobId: a.jobId, workLocationId: a.workLocationId })) as never;
    } catch (error) {
      return refused(inWords(error, "Could not build this email. Nothing was sent."));
    }
    const rows = withEdits(built.rows, a.edits);
    const extraTo = parseAddressList(a.extraTo);
    const extraCc = parseAddressList(a.extraCc);
    if (extraTo.bad.length || extraCc.bad.length) return refused("Correct the invalid To or Cc email addresses.");
    const removed = parseAddressList(a.removed).ok;
    const { to, cc } = await recipients(ctx, { removed, extraTo: extraTo.ok, extraCc: extraCc.ok });
    if (!to.length) return refused("Add an address on the To line.");
    // A Midday always carries fresh research, unless every candidate is a scoop (17 Nov) - read from the records.
    const apps = await Promise.all(rows.map((r) => ctx.db.get(r.applicationId as Id<"applications">)));
    const research = checkResearchSubmission({ role: mapUser(user as never).role, kind: "director", link: a.link, confirmed: a.confirmed, scoopsOnly: scoopsOnly(apps) });
    if (!research.ok) return refused(research.reason);
    const subject = (a.subject.trim() || built.subject).slice(0, 300);
    const html = eodEmailHtml({ rows, effort: built.effort, senderName: user.fullName, introText: a.intro, outroText: a.outro, researchLink: research.url, attachmentNote: null });
    const inbox = await shortlistInbox(ctx);
    const snapshot: DailyEmailSnapshot = {
      subject, html, from: user.email, to, cc, attachmentNames: [], attachments: [], rows, workType: built.workType,
      effort: built.effort, introText: a.intro, outroText: a.outro, researchLink: research.url ?? "",
      extraTo: extraTo.ok, extraCc: extraCc.ok, removed,
    };
    return {
      ok: true as const, actorId: user._id as string, from: user.email, to, cc, replyTo: [user.email, inbox].filter(Boolean),
      subject, html, snapshot, inbox, applicationIds: rows.map((r) => r.applicationId), workLocationId: built.workLocationId,
    };
  },
});

/** Today's unsent Midday draft for this person, or a new one (the old page made one on arrival). */
export const middayDraft = internalMutation({
  args: { jobId: v.id("jobs"), workLocationId: v.optional(v.string()) },
  handler: async (ctx, a): Promise<{ id: Id<"dailyEmails">; revision: number }> => {
    const user = await uiUser(ctx);
    const today = workdayDate(Date.now());
    const mine = await ctx.db
      .query("dailyEmails")
      .withIndex("by_user_job_date", (q) => q.eq("userId", user._id).eq("jobId", a.jobId))
      .collect();
    const open = mine
      .filter((e) => e.date === today && e.submissionType === "midday" && (e.status === "draft" || e.status === "failed") && inWorkLocation(e, a.workLocationId ?? ""))
      .sort((x, y) => y.number - x.number)[0];
    if (open) return { id: open._id, revision: open.revision };
    const id = (await ctx.runMutation(internal.ta.dailyEmails.createDraft, { actorId: user._id, ...a })) as Id<"dailyEmails">;
    return { id, revision: 0 };
  },
});

/**
 * Send a Midday without CV attachments. The answer is a sentence that says what
 * happened: sent (with to whom), nothing sent (and why), or "may or may not have
 * gone out" - the old send's own words (src/lib/sendFailure.ts).
 */
export const sendMidday = action({
  args: form,
  handler: async (ctx, a): Promise<Refused | { ok: true; message: string; id: string }> => {
    const p = await ctx.runQuery(internal.ui.emailSend.prepareMidday, a);
    if (!p.ok) return p;
    let dailyEmailId: Id<"dailyEmails">;
    try {
      const draft = await ctx.runMutation(internal.ui.emailSend.middayDraft, { jobId: a.jobId, workLocationId: p.workLocationId ?? undefined });
      const reservation = (await ctx.runMutation(internal.ta.dailyEmails.begin, {
        actorId: p.actorId, jobId: a.jobId, workLocationId: p.workLocationId ?? undefined, submissionType: "midday",
        draftId: draft.id, revision: draft.revision, applicationIds: p.applicationIds as Id<"applications">[],
        snapshot: p.snapshot, confirmed: a.confirmed, trackedAt: p.inbox,
      })) as { id: Id<"dailyEmails"> };
      dailyEmailId = reservation.id;
    } catch (error) {
      // Refused before anything was reserved: nothing went out.
      return refused(`Nothing was sent: ${inWords(error, "the email could not be prepared. Reload and try again.")}`);
    }
    let result: { ok: true; from: string; to: string; alsoTo?: string[]; cc: string[]; note: string } | { ok: false; error: string; maybeSent?: boolean };
    try {
      result = (await ctx.runAction(internal.ta.eodMail.send, {
        from: p.from, to: p.to[0], alsoTo: p.to.slice(1), cc: p.cc, replyTo: p.replyTo,
        subject: p.subject, html: p.html, attachments: [], savedIds: [], dailyEmailId,
      })) as typeof result;
    } catch (error) {
      // Reached the sender and lost the answer: the row is "uncertain" until the mailbox check settles it.
      await ctx.runMutation(internal.ta.dailyEmails.result, { id: dailyEmailId, status: "uncertain", error: `Door request failed: ${error instanceof Error ? error.message : String(error)}` }).catch(() => undefined);
      return refused(UNCERTAIN_SEND_MESSAGE);
    }
    if (!result.ok) return refused(plainSendFailure(result.error, result.maybeSent ?? false).message);
    const sentTo = [result.to, ...(result.alsoTo ?? [])].join(", ");
    return {
      ok: true, id: dailyEmailId,
      message: `Sent from ${result.from} to ${sentTo}${result.cc.length ? `, cc ${result.cc.join(", ")}` : ", no cc"}, without attachments.${result.note ? ` ${result.note.trim()}` : ""}`,
    };
  },
});
