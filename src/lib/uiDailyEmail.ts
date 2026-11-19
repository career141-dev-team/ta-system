/**
 * The new UI's Midday / End of day send (D5 step 3, 19 Nov) - pure half.
 *
 * The new UI (new.career141.com) sends the same form the old page sends, and
 * the old server runs the old action on it (src/app/api/ui/daily-email). These
 * are the rules for what may come in and what goes back.
 */

/** The only page allowed to call it from a browser (src/lib/uiCors.ts). */
export { UI_ORIGINS } from "./uiCors";

/**
 * The old send form's own field names and nothing else - a browser cannot slip
 * in a field the page never had. Per-candidate cells and effort/referee fields
 * are matched by their prefixes, as the old form names them.
 */
const FIELDS = new Set([
  "openingId", "submissionType", "dailyDraftId", "dailyDraftRevision", "dailyParentId", "forDate", "workLocationId",
  "applicationIds", "subject", "introText", "outroText", "chatgptLink", "researchConfirmed", "previewConfirmed",
  "extraTo", "extraCc", "removed", "skipAttachments", "regenerateAttachments", "kind", "includeRefereeCalls", "refereeCallResults",
]);
const PREFIXES = ["shortlist_", "effort_", "target_"];

export function formFields(body: unknown): { ok: true; fields: [string, string][] } | { ok: false; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, message: "Nothing to send." };
  const fields: [string, string][] = [];
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (!FIELDS.has(k) && !PREFIXES.some((p) => k.startsWith(p))) return { ok: false, message: `The form had a field it should not: ${k.slice(0, 40)}.` };
    if (typeof v !== "string" || v.length > 20_000) return { ok: false, message: "A field on the form was not readable." };
    fields.push([k, v]);
  }
  if (!fields.some(([k]) => k === "openingId")) return { ok: false, message: "Which opening is this for? Reload and try again." };
  return { ok: true, fields };
}

/** What the old action's closing redirect said: sent or not, the sentence, the email's id. */
export function readSendRedirect(url: string): { ok: boolean; message: string; sentId: string | null } {
  const u = new URL(url, "https://x");
  const message = u.searchParams.get("msg") ?? "";
  const sentId = u.searchParams.get("sent");
  const failed = u.searchParams.get("tone") === "error" || !sentId;
  return { ok: !failed, message: message || (failed ? "Nothing was sent. Try again." : "Sent."), sentId };
}

/** NEXT_REDIRECT;replace;/path?x=1;307; -> /path?x=1 */
export function redirectUrl(digest: unknown): string | null {
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT;")) return null;
  const parts = digest.split(";");
  return parts.length >= 4 ? parts.slice(2, -2).join(";") : null;
}
