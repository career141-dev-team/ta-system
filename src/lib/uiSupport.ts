/**
 * The new UI's TA Support Excel desk (R4, 21 Nov 2026): old /support-tables rows
 * and sheet counts in the new screen's words. Read only, as the old page.
 */
import type { LinkVaultEntry } from "@/data/types";
import { colomboDay, type Interest } from "@/lib/linkViews";

/** The old desk's interest words as the new Excel Tables names them. */
export const INTEREST_WORD: Record<Interest, "To approach" | "Interested" | "Not interested"> = {
  pending: "To approach", interested: "Interested", not_interested: "Not interested",
};

export interface SupportRow {
  id: string; name: string; title: string; company: string; linkedin?: string;
  ta: string; taId: string; sheet: number | null; sheetName?: string; location?: string;
  phone?: string; interest: (typeof INTEREST_WORD)[Interest]; takenBy?: string;
  eye: boolean; addOn: boolean; hasCv: boolean; today: boolean; at: number; note?: string;
}

/** One old row as the screen draws it; the newest note (TA's or lead's) is shown. */
export function supportRow(
  row: LinkVaultEntry,
  interest: Interest,
  names: (id: string) => string,
  more: { sheetName?: string; location?: string; takenBy?: string },
  now = Date.now(),
): SupportRow {
  const notes = [...(row.taNotes ?? []), ...(row.leadNotes ?? [])].sort((a, b) => b.at - a.at);
  return {
    id: row.id,
    name: row.name ?? "Unnamed profile",
    title: row.title ?? "",
    company: row.company ?? "",
    linkedin: /^https?:\/\//i.test(row.linkedinUrl) ? row.linkedinUrl : undefined,
    ta: names(row.addedBy),
    taId: row.addedBy,
    sheet: row.level ? row.level : null,
    sheetName: more.sheetName,
    location: more.location,
    phone: row.phoneNumber || undefined,
    interest: INTEREST_WORD[interest],
    takenBy: more.takenBy ? names(more.takenBy) : undefined,
    eye: !!row.isEyeMarked,
    addOn: !!row.isAddOn,
    hasCv: !!row.cvMatch?.hasCv,
    today: colomboDay(row.createdAt) === colomboDay(now),
    at: row.createdAt,
    note: notes[0]?.note,
  };
}
