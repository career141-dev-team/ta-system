"use client";

// Referee Calls on real data (D8c, 20 Nov 2026; ta-system #38). Signed in, the sheet
// reads the old server's /api/ui/referees, which gives what old AURA's page shows,
// and saves through the old sheet's own Save. The pure half is refereeRules.ts.

import { cvHeaders, OLD_SERVER } from "@/lib/backend";
import type { LiveCall, LiveReferees } from "./refereeRules";
export * from "./refereeRules";

const URL_REF = `${OLD_SERVER}/api/ui/referees`;
const NO_LINE = "Could not reach the TA System. Check your connection and try again.";

/** The sheet for one work day and location (blank = what the TA System opens on). */
export async function readReferees(job: string, day: string, location: string): Promise<{ ok: true; data: LiveReferees } | { ok: false; message: string }> {
  const q = new URLSearchParams({ opening: job, ...(day ? { day } : {}), ...(location ? { location } : {}) });
  const url = `${URL_REF}?${q}`;
  const res = await fetch(url, { headers: await cvHeaders(url) }).catch(() => null);
  const got = (await res?.json().catch(() => null)) as ({ ok?: boolean; message?: string } & Partial<LiveReferees>) | null;
  if (got?.ok && got.calls) return { ok: true, data: got as LiveReferees };
  return { ok: false, message: got?.message ?? NO_LINE };
}

/** One old action ("save" or "result"); the TA System's answer, with the calls it now holds. */
export async function sendReferees(body: Record<string, unknown>): Promise<{ ok: boolean; message: string; calls?: LiveCall[]; call?: LiveCall }> {
  const res = await fetch(URL_REF, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await cvHeaders(URL_REF)) },
    body: JSON.stringify(body),
  }).catch(() => null);
  const got = (await res?.json().catch(() => null)) as { ok?: boolean; message?: string; calls?: LiveCall[]; call?: LiveCall } | null;
  return { ok: !!got?.ok, message: got?.message ?? NO_LINE, calls: got?.calls, call: got?.call };
}
