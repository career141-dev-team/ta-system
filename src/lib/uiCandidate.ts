/**
 * The new UI's candidate and job-description buttons (D7, 19 Nov) - pure half.
 *
 * new.career141.com posts `{ do, ...fields }` to src/app/api/ui/candidate; this
 * says which old action each `do` runs and which of the old form's own field names
 * it may carry, so a browser cannot slip in a field the old page never had.
 * Interview, offer, offer answer and placement go to the shared writers the phone
 * app already uses (lib/candidates/interviewWrites, closingWrites), checked by the
 * phone's own body rules (lib/mobile/candidateBodies).
 */

/** Old actions run as they are (their back()/done()/fail() answers come back as data). */
export const FORM_ACTIONS = {
  addon: ["appId", "openingId", "on"],
  backup: ["appId", "openingId", "on"],
  addjob: ["appId", "openingId", "destinationId"],
  // Database CVs "Shortlist": the old AddToOpening form.
  shortlistMatch: ["candidateId", "openingId"],
  approveJd: ["openingId", "jdMarkdown"],
  rereadJd: ["openingId"],
} as const;
export type FormAction = keyof typeof FORM_ACTIONS;

/** Written through the shared writers, with the phone app's body rules. */
export const WRITER_ACTIONS = ["interview", "closing"] as const;
export type WriterAction = (typeof WRITER_ACTIONS)[number];

export type Parsed =
  | { kind: "form"; action: FormAction; fields: [string, string][] }
  | { kind: "writer"; action: WriterAction; openingId: string; appId: string; body: unknown };

export function readBody(body: unknown): { ok: true; value: Parsed } | { ok: false; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, message: "Nothing was sent." };
  const b = body as Record<string, unknown>;
  const what = b.do;
  if (typeof what === "string" && what in FORM_ACTIONS) {
    const allowed = FORM_ACTIONS[what as FormAction] as readonly string[];
    const fields: [string, string][] = [];
    for (const [k, v] of Object.entries(b)) {
      if (k === "do") continue;
      if (!allowed.includes(k)) return { ok: false, message: `The form had a field it should not: ${k.slice(0, 40)}.` };
      if (typeof v !== "string" || v.length > 50_000) return { ok: false, message: "A field on the form was not readable." };
      fields.push([k, v]);
    }
    if (!fields.some(([k]) => k === "openingId")) return { ok: false, message: "Which opening is this for? Reload and try again." };
    return { ok: true, value: { kind: "form", action: what as FormAction, fields } };
  }
  if (typeof what === "string" && (WRITER_ACTIONS as readonly string[]).includes(what)) {
    if (typeof b.openingId !== "string" || typeof b.appId !== "string") return { ok: false, message: "Which candidate is this? Reload and try again." };
    return { ok: true, value: { kind: "writer", action: what as WriterAction, openingId: b.openingId, appId: b.appId, body: b.body } };
  }
  return { ok: false, message: "That button is not known. Reload the page." };
}
