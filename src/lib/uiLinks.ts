/**
 * The new UI's Excel Tables (D8a, 19 Nov) - pure half.
 *
 * new.career141.com posts `{ do, ...fields }` to src/app/api/ui/links; this says
 * which old action each `do` runs and which of the old form's own field names it
 * may carry (entryId may be a list, as the old bulk bar sends it), so a browser
 * cannot slip in a field the old page never had.
 */

export const LINK_ACTIONS = {
  add: ["openingId", "workLocationId", "level", "url", "name", "note"],
  extract: ["openingId", "workLocationId", "level", "url"],
  paste: ["openingId", "workLocationId", "level", "rows"],
  // The three sheet actions answer by redirecting the old page; read as done.
  addSheet: ["openingId", "workLocationId"],
  deleteSheet: ["openingId", "workLocationId", "level"],
  restoreSheet: ["openingId", "workLocationId", "level"],
  renameSheet: ["openingId", "workLocationId", "level", "name"],
  eye: ["openingId", "entryId"],
  addon: ["openingId", "entryId", "on"],
  interest: ["openingId", "entryId", "interest", "reason"],
  toPipeline: ["openingId", "entryId"],
  toPipelineMany: ["openingId", "entryId"],
  update: ["openingId", "entryId", "name", "company", "outcome", "phoneNumber", "phoneSource"],
  log: ["openingId", "entryId", "note", "channel"],
  remove: ["openingId", "entryId"],
  leadNote: ["openingId", "entryId", "note"],
  removeLeadNote: ["openingId", "entryId", "noteId"],
  note: ["openingId", "entryId", "note"],
  removeNote: ["openingId", "entryId", "noteId"],
  location: ["openingId", "linkId", "workLocationId"],
  locationMany: ["openingId", "targetWorkLocationId", "entryId"],
  cvMatch: ["openingId", "entryId", "decision"],
  chooseCv: ["openingId", "entryId", "candidateId"],
} as const;
export type LinkAction = keyof typeof LINK_ACTIONS;
/** Actions whose old answer is a redirect back to the page, not a sentence. */
export const REDIRECTING = new Set<LinkAction>(["addSheet", "deleteSheet", "restoreSheet"]);

export function readLinkBody(body: unknown): { ok: true; action: LinkAction; fields: [string, string][] } | { ok: false; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, message: "Nothing was sent." };
  const b = body as Record<string, unknown>;
  const what = b.do;
  if (typeof what !== "string" || !(what in LINK_ACTIONS)) return { ok: false, message: "That button is not known. Reload the page." };
  const allowed = LINK_ACTIONS[what as LinkAction] as readonly string[];
  const fields: [string, string][] = [];
  for (const [k, v] of Object.entries(b)) {
    if (k === "do") continue;
    if (!allowed.includes(k)) return { ok: false, message: `The form had a field it should not: ${k.slice(0, 40)}.` };
    const values = Array.isArray(v) && k === "entryId" ? v.slice(0, 200) : [v];
    for (const one of values) {
      if (typeof one !== "string" || one.length > 50_000) return { ok: false, message: "A field on the form was not readable." };
      fields.push([k, one]);
    }
  }
  if (!fields.some(([k]) => k === "openingId")) return { ok: false, message: "Which opening is this for? Reload and try again." };
  return { ok: true, action: what as LinkAction, fields };
}

/** The new screen's three interest words, from the old table's. */
export const INTEREST_WORD: Record<string, "approach" | "yes" | "no"> = { pending: "approach", interested: "yes", not_interested: "no" };
