"use client";

// Openings and the Bin on real data (D9, 20 Nov 2026; ta-system #39). Signed in, the
// New opening sheet, the opening's Bin button, the website switch and the Bin page
// go through the old server's /api/ui/openings, which runs old AURA's own actions.
// The list itself is the backend's live list (ui/openings:list), so a change shows
// there by itself. The pure half of creating is createRules.ts.

import { cvHeaders, OLD_SERVER } from "@/lib/backend";
import type { Person } from "./createRules";
export * from "./createRules";

const URL_OPEN = `${OLD_SERVER}/api/ui/openings`;
const NO_LINE = "Could not reach the TA System. Check your connection and try again.";

export type OpeningForm = { clients: (Person & { industry: string })[]; tas: Person[]; isLead: boolean; canAddClient: boolean };
export type BinRow = { kind: "opening" | "client"; id: string; name: string; clientName: string | null; binnedAt: number; binnedBy: string | null; purgeAt: number };

async function read<T>(part: "form" | "bin"): Promise<({ ok: true } & T) | { ok: false; message: string }> {
  const url = `${URL_OPEN}?part=${part}`;
  const res = await fetch(url, { headers: await cvHeaders(url) }).catch(() => null);
  const got = (await res?.json().catch(() => null)) as ({ ok?: boolean; message?: string } & T) | null;
  return got?.ok ? (got as { ok: true } & T) : { ok: false, message: got?.message ?? NO_LINE };
}
/** What the old New opening page offers this person. */
export const readOpeningForm = () => read<OpeningForm>("form");
/** The old Bin page. */
export const readBin = () => read<{ items: BinRow[]; mayPurge: boolean }>("bin");

/** One old action; the TA System's own sentence, and what it made (an opening or a client). */
export async function sendOpenings(body: Record<string, unknown>): Promise<{ ok: boolean; message: string; openingId?: string; client?: Person }> {
  const res = await fetch(URL_OPEN, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await cvHeaders(URL_OPEN)) },
    body: JSON.stringify(body),
  }).catch(() => null);
  const got = (await res?.json().catch(() => null)) as { ok?: boolean; message?: string; openingId?: string; client?: Person } | null;
  return { ok: !!got?.ok, message: got?.message ?? NO_LINE, openingId: got?.openingId, client: got?.client };
}
