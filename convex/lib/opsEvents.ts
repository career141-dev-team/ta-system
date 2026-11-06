/**
 * Telling the Ops System what happened here (ops docs/15 Part E, the events).
 *
 * The rule that shapes this file, and the reason it is three lines long:
 * **TA never waits for Ops.** A TA write records a row and carries on. Ops
 * reads the feed every minute with a cursor; if Ops is down the rows wait,
 * and nothing in TA slows down or fails because of it.
 *
 * So every raise is wrapped. A bell the Ops System never hears is bad; a
 * Place that fails because telling Ops failed is far worse, and that is the
 * only way this can hurt anybody.
 */

import type { MutationCtx } from "../_generated/server";

export const OPS_EVENT_TYPES = [
  "opening.created",
  "opening.updated",
  "opening.closed",
  "opening.jd_approved",
  "application.stage_changed",
  "client_set.ready",
  "interview.booked",
  "interview.outcome",
  "offer.made",
  "offer.accepted",
  "offer.declined",
  "placement.created",
  "placement.joined",
  "placement.no_show",
  "reference.reported",
  // Added 6 Nov. The Ops System already knows how to handle all of these; the
  // list here declared fifteen while Ops handled twenty-five, so an event it
  // was waiting for could not even be named. Declaring one costs nothing and
  // raising it is one line beside the mutation that already happened.
  "director_round.sent",
  "director_round.decided",
  "interview.confirmed",
  "interview.feedback",
  "interview.candidate_out",
  "placement.fell_through",
  "jobpost.live",
  "jobpost.closed",
  "opening.working_stage_changed",
  "candidate.rejection_notice_sent",
] as const;

export type OpsEventType = (typeof OPS_EVENT_TYPES)[number];

/**
 * Write one event for Ops. Never throws.
 *
 * `openingId` and `applicationId` are pulled out of the data on purpose: Ops
 * finds its own row by them, and parsing JSON to route an event is how a
 * feed reader ends up guessing.
 */
export async function raiseOpsEvent(
  ctx: MutationCtx,
  type: OpsEventType,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await ctx.db.insert("opsEvents", {
      type,
      at: Date.now(),
      openingId: typeof data.openingId === "string" ? data.openingId : null,
      applicationId: typeof data.applicationId === "string" ? data.applicationId : null,
      data: JSON.stringify(data ?? {}).slice(0, 4000),
    });
  } catch (error) {
    // Deliberately swallowed. See the file's own note: nothing in TA may fail
    // because the Ops System could not be told something.
    console.warn("[ops-events] could not record " + type, error);
  }
}
