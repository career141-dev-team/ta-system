import { isTechnicalMessage } from "./userError";

/**
 * What a TA is told when a daily email did not come back as sent (16 Nov).
 *
 * Every failure used to show "Could not confirm the email was sent. Do not send it again yet",
 * because Microsoft's own wording ("request-id", "https://…") is on the technical list in userError
 * and was swapped for that fallback. A refusal Microsoft answered, where nothing went out, told the
 * TA to wait for a Lead for no reason; the raw reason stays on the row as `sendError` for the Lead.
 *
 * "uncertain" follows the sender's own `maybeSent` (17 Nov), the same flag convex/ta/eodMail.ts files the row by:
 * only the request that actually sends can leave an email "maybe gone". The wording test is kept for a caller that
 * has no flag. A Microsoft fault while the draft or its CVs were still being uploaded sent nothing, and says so.
 */
export type SendFailure = { state: "not_sent" | "uncertain"; message: string };

export const UNCERTAIN_SEND_MESSAGE =
  "The email may or may not have gone out. Do not send it again yet: the system checks the mailbox and settles it within about 15 minutes, or your TA Lead can reconcile it in Today's Checks.";

export const isUncertainSend = (raw: string) => /could not be reached|returned 5\d\d/i.test(raw);

export function plainSendFailure(raw: string, maybeSent?: boolean): SendFailure {
  if (maybeSent ?? isUncertainSend(raw)) return { state: "uncertain", message: UNCERTAIN_SEND_MESSAGE };
  const lead = "Nothing was sent.";
  const lead2 = (said: string) => ({ state: "not_sent" as const, message: `${said} ${lead}` });
  if (/did not answer while|could not be reached|returned 5\d\d/i.test(raw))
    return lead2("Microsoft did not respond while the email was being prepared. Try again in a minute.");
  if (/Could not load the saved CVs/i.test(raw))
    return lead2("The saved CVs for this email could not be loaded. Try again; if it repeats, tell your TA Lead.");
  if (/sign-in failed|credentials are not configured|No sending mailbox/i.test(raw))
    return lead2("The system's mail connection is not working. Tell your TA Lead, who can see the reason on the email.");
  const status = Number(/returned (\d{3})/i.exec(raw)?.[1]);
  if (status === 401) return lead2("Microsoft rejected the system's sign-in. Tell your TA Lead.");
  if (status === 403 || status === 404) return lead2("Microsoft would not let your mailbox send this email. Ask your TA Lead to check your mailbox permission.");
  if (status === 413) return lead2("The attachments are too large for one email. Take some off, or ask your TA Lead.");
  if (status === 429) return lead2("Microsoft is limiting sends right now. Try again in a few minutes.");
  if (status === 400) return lead2("Microsoft refused the email as written. Check the To and Cc addresses, then try again.");
  const clean = raw.split("\n")[0].replace(/\s+/g, " ").trim();
  if (clean && !isTechnicalMessage(clean)) return lead2(clean.slice(0, 200));
  return lead2("Microsoft refused the email. Ask your TA Lead: the reason is saved on the email.");
}
