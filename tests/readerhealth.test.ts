/**
 * The health rules for the three readers (docs/19 §7.11).
 *
 * These decide when an admin's phone buzzes, so both halves matter: a real
 * outage must be caught within its threshold, and a quiet evening or a long
 * outage must not send a bell every fifteen minutes.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CV_NEEDS_REVIEW_MANY,
  CV_QUEUE_DEEP,
  cvQueueProblem,
  inSendingHours,
  mailStallAfterMs,
  mailboxProblem,
  REPEAT_BELL_AFTER_MS,
  shouldBell,
  whatsappProblem,
  WHATSAPP_QUIET_AFTER_MS,
} from "../convex/lib/readerHealth";

const MINUTE = 60_000;
/** 10:00 Colombo, inside sending hours, on a fixed day. */
const DAYTIME = Date.UTC(2026, 10, 2, 4, 30);
/** 23:00 Colombo. */
const NIGHT = Date.UTC(2026, 10, 2, 17, 30);

test("job@ is given 20 minutes and the application mailboxes 30", () => {
  assert.equal(mailStallAfterMs("job@career141.com"), 20 * MINUTE);
  assert.equal(mailStallAfterMs("JOB@Career141.com "), 20 * MINUTE, "spelling and spaces do not matter");
  assert.equal(mailStallAfterMs("linkedin@career141.com"), 30 * MINUTE);
  assert.equal(mailStallAfterMs("cv@career141.com"), 30 * MINUTE);
});

test("a mailbox is reported once it is past its own threshold, and not before", () => {
  const at = (minutesAgo: number) => ({ mailbox: "job@career141.com", lastOkAt: DAYTIME - minutesAgo * MINUTE, now: DAYTIME });
  assert.equal(mailboxProblem(at(19)), null, "19 minutes is not a stall for job@");
  const problem = mailboxProblem(at(21));
  assert(problem);
  assert.equal(problem.key, "mail:job@career141.com");
  assert.match(problem.title, /job@career141\.com has stopped/);
  assert.match(problem.body, /Nothing is lost/);
  // The same gap on an application mailbox is still fine.
  assert.equal(mailboxProblem({ ...at(21), mailbox: "cv@career141.com" }), null);
});

test("a mailbox nobody has ever read is not reported, since there is no outage to report", () => {
  assert.equal(mailboxProblem({ mailbox: "cv@career141.com", lastOkAt: null, now: DAYTIME }), null);
});

test("a WhatsApp number is only watched during working hours", () => {
  assert.equal(inSendingHours(DAYTIME), true);
  assert.equal(inSendingHours(NIGHT), false);
  const quiet = { phone: "+94 74 011 0130", name: "Jesmeen", lastInboundAt: DAYTIME - WHATSAPP_QUIET_AFTER_MS - MINUTE };
  assert(whatsappProblem({ ...quiet, now: DAYTIME }), "two quiet working hours is reported");
  assert.equal(
    whatsappProblem({ ...quiet, lastInboundAt: NIGHT - WHATSAPP_QUIET_AFTER_MS - MINUTE, now: NIGHT }),
    null,
    "the same silence at night is normal",
  );
  assert.equal(whatsappProblem({ ...quiet, lastInboundAt: DAYTIME - MINUTE, now: DAYTIME }), null);
  assert.equal(whatsappProblem({ ...quiet, lastInboundAt: null, now: DAYTIME }), null, "a number nothing has ever arrived on");
});

test("the CV queue is reported when it is deep, or when unread files pile up", () => {
  const none = cvQueueProblem({ waiting: CV_QUEUE_DEEP - 1, needsReview: CV_NEEDS_REVIEW_MANY - 1, now: DAYTIME });
  assert.equal(none, null);

  const deep = cvQueueProblem({ waiting: CV_QUEUE_DEEP, needsReview: 0, now: DAYTIME });
  assert(deep);
  assert.match(deep.body, new RegExp(`${CV_QUEUE_DEEP} CVs are waiting`));

  const piling = cvQueueProblem({ waiting: 0, needsReview: CV_NEEDS_REVIEW_MANY, now: DAYTIME });
  assert(piling);
  assert.match(piling.body, /need a person/);

  const both = cvQueueProblem({ waiting: CV_QUEUE_DEEP, needsReview: CV_NEEDS_REVIEW_MANY, now: DAYTIME });
  assert(both);
  assert.match(both.body, /waiting to be read, and .* need a person/);
});

test("one bell per problem per four hours, however long the outage lasts", () => {
  assert.equal(shouldBell({ wrong: false, now: DAYTIME }), false);
  assert.equal(shouldBell({ wrong: true, now: DAYTIME }), true, "nobody has been told yet");
  assert.equal(shouldBell({ wrong: true, reportedAt: DAYTIME - MINUTE, now: DAYTIME }), false, "told a minute ago");
  assert.equal(shouldBell({ wrong: true, reportedAt: DAYTIME - REPEAT_BELL_AFTER_MS, now: DAYTIME }), true, "four hours later, again");
  // And the same rule through the mailbox check, so the caller cannot forget it.
  const stalled = { mailbox: "job@career141.com", lastOkAt: DAYTIME - 60 * MINUTE, now: DAYTIME };
  assert.equal(mailboxProblem({ ...stalled, reportedAt: DAYTIME - MINUTE }), null);
  assert(mailboxProblem({ ...stalled, reportedAt: DAYTIME - REPEAT_BELL_AFTER_MS }));
});
