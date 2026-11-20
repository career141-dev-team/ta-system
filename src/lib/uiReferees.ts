/**
 * The new UI's Referee Calls (D8c, 20 Nov) - pure half.
 *
 * new.career141.com posts `{ do, ...fields }` to src/app/api/ui/referees: "save"
 * is the old sheet's one Save (saveRefereeCalls: today's adds, edits and removals
 * as JSON), "result" is the old email section's Positive / Not successful
 * (updateRefereeCall with field "result").
 */

export const REFEREE_ACTIONS = {
  save: ["openingId", "workLocationId", "day", "changes"],
  result: ["openingId", "callId", "field", "value"],
} as const;
export type RefereeAction = keyof typeof REFEREE_ACTIONS;
