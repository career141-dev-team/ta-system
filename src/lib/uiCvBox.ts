// The green box's body for /api/ui/cv-box (D11 item 4, 20 Nov 2026) - pure, so
// tests/uicvbox.test.ts holds every rule.

export type BoxBody = {
  appId: string;
  openingId: string;
  designation: string;
  company: string;
  currentSalary: string;
  expectedSalary: string;
  notice: string;
  /** Absent = the application's notes are left as they are. */
  notes: string[] | null;
};

const str = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");

/** Only the box's own fields, sized as the box can hold them. */
export function readBoxBody(raw: unknown): { ok: true; body: BoxBody } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object") return { ok: false, message: "Nothing was sent." };
  const r = raw as Record<string, unknown>;
  const appId = str(r.appId, 64);
  const openingId = str(r.openingId, 64);
  if (!appId || !openingId) return { ok: false, message: "Which CV is this? Reload and try again." };
  let notes: string[] | null = null;
  if (r.notes !== undefined) {
    if (!Array.isArray(r.notes)) return { ok: false, message: "The notes could not be read." };
    notes = r.notes.map((n) => str(n, 300)).filter(Boolean).slice(0, 20);
  }
  return {
    ok: true,
    body: {
      appId,
      openingId,
      designation: str(r.designation, 120),
      company: str(r.company, 120),
      currentSalary: str(r.currentSalary, 80),
      expectedSalary: str(r.expectedSalary, 80),
      notice: str(r.notice, 80),
      notes,
    },
  };
}

/** The system's own notes stay out of the box (the old save keeps them by itself). */
const SYSTEM = (n: string) => /^Matched from the database/i.test(n) || /^>Historical/i.test(n);
export const ownNotes = (notes: string[]) => notes.filter((n) => !SYSTEM(n));

/** What the old save is sent: the box's notes when it changed them, else the
 *  application's own notes exactly as they are (their marks kept). */
export const boxNotesToSend = (sent: string[] | null, held: string[]) => (sent === null ? held : sent);
