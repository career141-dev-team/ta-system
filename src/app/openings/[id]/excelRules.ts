// Excel Tables on real data (D8a): the pure half - row shape, words and which old
// action a change on a row is. No imports, so excelLive.check.ts runs it with node.

export type LiveRow = {
  id: string;
  sheet: number | null;
  name: string | null;
  title: string | null;
  company: string | null;
  url: string;
  phone: string | null;
  phoneSource: string | null;
  interest: "approach" | "yes" | "no";
  outcome: string;
  why: string | null;
  eye: boolean;
  hasCv: boolean;
  cvMatch: { name: string; strength: string; reasons: string[] } | null;
  addOn: boolean;
  pipeline: string | null;
  shortlistedBy: string | null;
  addedBy: string;
  mine: boolean;
  readOnly: boolean;
  createdAt: number;
  workLocationId: string | null;
  notes: { id: string; note: string; mine: boolean }[];
};
export type LiveLinks = {
  rows: LiveRow[];
  sheets: { n: number; at: number; name: string | null }[];
  undo: { n: number; name: string | null } | null;
  locations: { id: string; name: string }[];
};

/** The UI's "how did you get the number" words, and the old table's. */
export const VIA_TO: Record<string, string> = {
  mutual: "mutual_connection",
  reception: "reception_call",
  profile: "profile",
  "internal db": "internal_db",
  other: "other",
};
export const VIA_FROM: Record<string, string> = Object.fromEntries(Object.entries(VIA_TO).map(([k, v]) => [v, k]));

/** "today", "yesterday", "week" or "older", in Colombo days. */
export function addedBucket(at: number, now = Date.now()): "today" | "yesterday" | "week" | "older" {
  const day = (t: number) => new Date(t + 5.5 * 3600_000).toISOString().slice(0, 10);
  const today = day(now);
  if (day(at) === today) return "today";
  if (day(at) === day(now - 86_400_000)) return "yesterday";
  return now - at < 7 * 86_400_000 ? "week" : "older";
}

/** "19 Nov" for a sheet started on that day. */
export const sheetDate = (at: number) =>
  at ? new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Colombo" }) : "";

/**
 * Which old action a change on one row is, or null when it saves nothing (a
 * profile read for the details panel stays on screen only). A note longer than
 * before is a new note (an "Approached: " one is logged as an approach); a
 * shorter list removed one.
 */
export function actionFor(
  row: LiveRow,
  patch: Record<string, unknown>,
  opening: string,
  noteCount: number,
  locations: { id: string; name: string }[],
): Record<string, unknown> | null {
  const base = { openingId: opening, entryId: row.id };
  if ("eye" in patch) return { do: "eye", ...base };
  if ("addOn" in patch) return { do: "addon", ...base, on: patch.addOn ? "1" : "0" };
  if (patch.interest === "no") return { do: "interest", ...base, interest: "not_interested", reason: String(patch.why ?? "") };
  if ("notes" in patch && Array.isArray(patch.notes)) {
    const notes = patch.notes as string[];
    if (notes.length > noteCount) {
      const text = notes[notes.length - 1];
      return text.startsWith("Approached: ")
        ? { do: "log", ...base, note: text.slice("Approached: ".length), channel: "linkedin" }
        : { do: "note", ...base, note: text };
    }
    // Which one went: the first stored note not in the new list.
    const gone = row.notes.find((n) => !notes.includes(n.note));
    return gone ? { do: "removeNote", ...base, noteId: gone.id } : null;
  }
  if ("location" in patch) {
    const id = locations.find((l) => l.name === patch.location)?.id;
    return id ? { do: "location", openingId: opening, linkId: row.id, workLocationId: id } : null;
  }
  if ("phone" in patch || "name" in patch || "company" in patch) {
    const via = "via" in patch ? VIA_TO[String(patch.via)] ?? "" : row.phoneSource ?? "";
    return {
      do: "update",
      ...base,
      name: String(patch.name ?? row.name ?? ""),
      company: String(patch.company ?? row.company ?? ""),
      // Sent back exactly as stored: an edit never changes where they stand.
      outcome: row.outcome,
      phoneNumber: String(("phone" in patch ? patch.phone : row.phone) ?? ""),
      phoneSource: via,
    };
  }
  return null;
}

/**
 * The L-sheet chips for the rows on screen (20 Nov audit: a lead's table read
 * "L1 20 Nov 0" where old AURA read "L1 18 Nov (51)"). The TA System sends only
 * the viewer's own sheets, dated when the viewer started them, but the rows are
 * everyone's the viewer may see. So: every sheet number a row sits on, plus the
 * viewer's own; dated by the earliest of its own start and its first row; only
 * the viewer's own may be renamed or deleted.
 */
export function sheetsOf(
  own: LiveLinks["sheets"],
  rows: Pick<LiveRow, "sheet" | "createdAt">[],
): { n: number; at: number; name: string | null; own: boolean }[] {
  const out = new Map(own.map((s) => [s.n, { n: s.n, at: s.at || Infinity, name: s.name, own: true }]));
  for (const r of rows) {
    if (!r.sheet || r.sheet < 1) continue;
    const s = out.get(r.sheet) ?? { n: r.sheet, at: Infinity, name: null, own: false };
    if (r.createdAt) s.at = Math.min(s.at, r.createdAt);
    out.set(r.sheet, s);
  }
  return [...out.values()].map((s) => ({ ...s, at: s.at === Infinity ? 0 : s.at })).sort((a, b) => a.n - b.n);
}
