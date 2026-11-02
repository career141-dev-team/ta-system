// Is anything that reads for us quietly dead? (docs/19 §7.11, 2 Nov)
//
// Three readers bring work in: the mail pollers, the WhatsApp webhook, and the
// CV reading queue. When one stopped, nobody was told. linkedin@ went unread
// from 5 to 23 October and no screen said so; a WhatsApp outage was never
// noticed at all; CVs stuck in the queue were nobody's bell.
//
// The mailbox stall bell exists since 23 October, but at an hour, and only for
// mail. This is the same idea for all three, checked every 15 minutes, with
// thresholds that suit each reader and one bell per problem per four hours so a
// long outage does not fill the bell panel.
//
// Everything here is a pure rule: no database, no clock of its own. The caller
// passes `now`.

const MINUTE = 60_000;
const COLOMBO_OFFSET_MS = 5.5 * 60 * MINUTE;

/** How long a mailbox may go unread before the desk is told. */
export function mailStallAfterMs(mailbox: string): number {
  // job@ carries candidates' replies, which the assistant answers, so it is the
  // one where silence costs the most. The others are applications, which wait
  // safely in the mailbox.
  return mailbox.trim().toLowerCase() === "job@career141.com" ? 20 * MINUTE : 30 * MINUTE;
}

/** A WhatsApp number that has received nothing for this long, in sending hours. */
export const WHATSAPP_QUIET_AFTER_MS = 2 * 60 * MINUTE;

/** The CV queue is behind when this many uploads are waiting to be read. */
export const CV_QUEUE_DEEP = 25;

/** This many files the reader could not finish need a person to look. */
export const CV_NEEDS_REVIEW_MANY = 10;

/** One bell per problem per this long, however long the outage lasts. */
export const REPEAT_BELL_AFTER_MS = 4 * 60 * MINUTE;

/** Reminders and candidate traffic both run 08:00-20:00 Sri Lanka time. */
export function inSendingHours(at: number): boolean {
  const hour = new Date(at + COLOMBO_OFFSET_MS).getUTCHours();
  return hour >= 8 && hour < 20;
}

/**
 * Whether to raise this problem now: it is real, and either nobody has been
 * told or the last telling is old enough to repeat.
 */
export function shouldBell(o: { wrong: boolean; reportedAt?: number | null; now: number }): boolean {
  if (!o.wrong) return false;
  if (!o.reportedAt) return true;
  return o.now - o.reportedAt >= REPEAT_BELL_AFTER_MS;
}

export type ReaderProblem = {
  /** Which reader: used as the key that remembers when it was last told. */
  key: string;
  title: string;
  body: string;
};

/** A mailbox whose last full read is older than its own threshold. */
export function mailboxProblem(o: {
  mailbox: string;
  lastOkAt: number | null;
  reportedAt?: number | null;
  now: number;
}): ReaderProblem | null {
  if (o.lastOkAt === null) return null;
  const late = o.now - o.lastOkAt >= mailStallAfterMs(o.mailbox);
  if (!shouldBell({ wrong: late, reportedAt: o.reportedAt, now: o.now })) return null;
  return {
    key: `mail:${o.mailbox}`,
    title: `Problem: ${o.mailbox} has stopped`,
    body:
      `TA System has not read ${o.mailbox} since ${stamp(o.lastOkAt)}, so new applications from it are not reaching the jobs. ` +
      `Nothing is lost: they wait in the mailbox and come in once it works again. Please tell the developer.`,
  };
}

/**
 * A WhatsApp number that has received nothing for two hours of working time.
 * Outside sending hours silence is normal, so nothing is raised then.
 */
export function whatsappProblem(o: {
  phone: string;
  name: string;
  lastInboundAt: number | null;
  reportedAt?: number | null;
  now: number;
}): ReaderProblem | null {
  if (!inSendingHours(o.now)) return null;
  if (o.lastInboundAt === null) return null;
  const quiet = o.now - o.lastInboundAt >= WHATSAPP_QUIET_AFTER_MS;
  if (!shouldBell({ wrong: quiet, reportedAt: o.reportedAt, now: o.now })) return null;
  return {
    key: `whatsapp:${o.phone}`,
    title: `Problem: no WhatsApp has arrived on ${o.phone}`,
    body:
      `Nothing has come in on ${o.name}'s number (${o.phone}) since ${stamp(o.lastInboundAt)}, during working hours. ` +
      `Either nobody wrote, or Meta has stopped delivering to us and candidates' replies are not arriving. Please tell the developer.`,
  };
}

/** The CV reading queue: too deep, or too many files waiting for a person. */
export function cvQueueProblem(o: {
  waiting: number;
  needsReview: number;
  reportedAt?: number | null;
  now: number;
}): ReaderProblem | null {
  const deep = o.waiting >= CV_QUEUE_DEEP;
  const piling = o.needsReview >= CV_NEEDS_REVIEW_MANY;
  if (!shouldBell({ wrong: deep || piling, reportedAt: o.reportedAt, now: o.now })) return null;
  const parts = [
    deep ? `${o.waiting} CVs are waiting to be read` : null,
    piling ? `${o.needsReview} could not be read and need a person` : null,
  ].filter(Boolean);
  return {
    key: "cv:queue",
    title: "Problem: the CV reading queue is behind",
    body: `${parts.join(", and ")}. The files are safe; the reading has fallen behind or is failing. Please tell the developer.`,
  };
}

function stamp(at: number): string {
  return `${new Date(at).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
