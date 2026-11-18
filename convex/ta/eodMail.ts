"use node";

// convex/ta/eodMail.ts
//
// Sending the end-of-day email through Microsoft Graph.
//
// The TA System builds the email (src/app/actions.ts `sendEod`): from the TA's
// own mailbox, to the job-orders box (plus anyone the TA adds), copying the
// desk's fixed Cc list (lib/eod-format EOD_CC_DEFAULTS), anyone the TA adds, and
// the shortlist inbox that watches for the reply, with the day's two tables and the prepared
// CVs attached. This only carries it, through the one Graph sender every email
// uses (lib/graphMail.ts), so the test-mode and outbound-lock gates apply here
// too. The Graph credentials live on the backend, which is why this is here and
// not in the Next server.

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getGraphToken } from "../lib/graphClient";
import { findSentMessage, sendFollowUpMail, type MailResult } from "../lib/graphMail";
import { makeFunctionReference } from "convex/server";

/**
 * Settles uncertain sends by asking Graph, so a dropped connection no longer needs a TA Lead to open the mailbox
 * (Sameera, 9 Nov). Runs from a cron. Never sends: it only reads Sent Items and records what it found.
 */
export const checkUncertain = internalAction({
  args: {},
  handler: async (ctx) => {
    const list = await ctx.runQuery(makeFunctionReference<"query">("ta/dailyEmails:uncertainToCheck"), {}) as { id: Id<"dailyEmails">; from: string; subject: string; since: number }[];
    const systemInbox = process.env.MS_SENDER_EMAIL || process.env.OUTBOUND_EMAIL_SENDER || "job@career141.com";
    let settled = 0;
    for (const e of list) {
      const found = await findSentMessage([e.from, systemInbox], e.subject, e.since, getGraphToken);
      if (found === "unknown") continue;
      await ctx.runMutation(makeFunctionReference<"mutation">("ta/dailyEmails:autoReconcile"), { id: e.id, sent: found === "found" });
      settled++;
    }
    return { checked: list.length, settled };
  },
});

export const send = internalAction({
  args: {
    from: v.string(),
    to: v.string(),
    alsoTo: v.optional(v.array(v.string())),
    cc: v.array(v.string()),
    replyTo: v.array(v.string()),
    subject: v.string(),
    html: v.string(),
    attachments: v.array(
      v.object({
        name: v.string(),
        contentType: v.string(),
        base64: v.string(),
      }),
    ),
    // CVs already saved for this email: read from storage here, not passed as arguments.
    savedIds: v.optional(v.array(v.id("dailyEmailAttachments"))),
    workdayMailId: v.optional(v.id("taWorkdayMail")),
    dailyEmailId: v.optional(v.id("dailyEmails")),
  },
  handler: async (ctx, args): Promise<MailResult> => {
    const systemInbox =
      process.env.MS_SENDER_EMAIL ||
      process.env.OUTBOUND_EMAIL_SENDER ||
      "job@career141.com";
    let result: MailResult;
    try {
      const stored = args.savedIds?.length
        ? await ctx.runQuery(makeFunctionReference<"query">("ta/dailyEmails:storedFiles"), { ids: args.savedIds }) as { name: string; storageId: Id<"_storage"> }[]
        : [];
      const files = [];
      for (const f of stored) {
        const blob = await ctx.storage.get(f.storageId);
        if (!blob) throw new Error(`The saved CV ${f.name} is missing from storage.`);
        files.push({ name: f.name, contentType: "application/pdf", base64: Buffer.from(await blob.arrayBuffer()).toString("base64") });
      }
      result = await sendFollowUpMail(
        {
          from: args.from,
          fallbackFrom: systemInbox,
          to: args.to,
          alsoTo: args.alsoTo,
          cc: args.cc,
          replyTo: args.replyTo,
          subject: args.subject,
          html: args.html,
          attachments: [...files, ...args.attachments],
          // A five-CV set regularly exceeds Graph's one-request sendMail
          // payload. Build a draft, attach every CV separately (using an
          // upload session for a file at least 3 MB), then send the draft.
          attachmentMode: "draft",
          testInbox: "EOD_TEST_EMAIL",
          // Internal only: in test mode the desk still gets it beside the test inbox.
          keepInternalInTest: "career141.com",
        },
        getGraphToken,
      );
    } catch (error) {
      // sendFollowUpMail never throws, so this is the saved CVs failing to load: before Microsoft, nothing sent
      // (17 Nov). It used to be filed uncertain and thrown, which blocked the TA behind a reconcile.
      result = { ok: false, error: `Could not load the saved CVs for this email: ${(error as Error).message}`, blocked: false, maybeSent: false };
    }
    if (args.dailyEmailId) await ctx.runMutation(makeFunctionReference<"mutation">("ta/dailyEmails:result"), {
      id: args.dailyEmailId,
      status: result.ok ? "accepted" : result.maybeSent ? "uncertain" : "failed",
      ...(result.ok ? { delivered: { from: result.from, to: [result.to, ...(result.alsoTo ?? [])], cc: result.cc } } : { error: result.error }),
    });
    if (args.workdayMailId)
      await ctx.runMutation(
        makeFunctionReference<"mutation">("ta/workdays:mailResult"),
        {
          id: args.workdayMailId,
          status: result.ok ? "accepted" : result.maybeSent ? "uncertain" : "failed",
        },
      );
    console.log(
      result.ok
        ? `[End of day] Sent via Microsoft Graph from ${result.from} to ${[result.to, ...(result.alsoTo ?? [])].join(", ")}, cc ${result.cc.join(", ") || "nobody"}${result.note}`
        : `[End of day] Not sent: ${result.error}`,
    );
    return result;
  },
});
