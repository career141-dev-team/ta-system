/**
 * The new UI's Openings and Bin (D9, 20 Nov) - pure half.
 *
 * new.career141.com posts `{ do, ...fields }` to src/app/api/ui/openings; this says
 * which old action each `do` runs and which of the old forms' own field names it
 * may carry (assignedTaIds may be a list, as the old form sends it).
 */

export const OPENING_ACTIONS = {
  create: ["clientId", "title", "notes", "country", "hiringFor", "targetGender", "autoFollowUp", "workLocations", "assignedTaIds"],
  client: ["name", "industry"],
  bin: ["openingId"],
  restore: ["kind", "id"],
  purge: ["kind", "id"],
  website: ["openingId", "listed"],
} as const;
export type OpeningAction = keyof typeof OPENING_ACTIONS;
