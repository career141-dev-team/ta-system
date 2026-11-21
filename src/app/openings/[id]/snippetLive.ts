"use client";

// Snippets on a real opening (R6, 21 Nov 2026; ta-system /api/ui/snippet): the card's
// fields from the opening and its approved JD, and the old refine (DeepSeek, word rules
// when it does not answer). Saves nothing. Signed out, the sample card stays.

import { useEffect, useState } from "react";
import { cvHeaders, OLD_SERVER } from "@/lib/backend";

const URL_SN = `${OLD_SERVER}/api/ui/snippet`;
const NO_LINE = "Could not reach the TA System. Check your connection and try again.";

export type SnipFields = {
  jobTitle: string; titleLead?: string; titleMain?: string; industry: string; location: string; company: string;
  package: string; gender: string; bullets: string[]; email: string; mobile: string;
};
type Read = { ok: true; approved: boolean; fields?: SnipFields } | { ok: false; message: string };

/** The opening's card, read once per opening. */
export function useSnippet(on: boolean, job: string | null): Read | undefined {
  const [got, setGot] = useState<{ job: string; read: Read }>();
  useEffect(() => {
    if (!on || !job) return;
    let gone = false;
    void (async () => {
      const u = `${URL_SN}?${new URLSearchParams({ position: job })}`;
      const res = await fetch(u, { headers: await cvHeaders(u), signal: AbortSignal.timeout(30_000) }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as Read | null;
      if (!gone) setGot({ job, read: body ?? { ok: false, message: NO_LINE } });
    })();
    return () => {
      gone = true;
    };
  }, [on, job]);
  return got?.job === job ? got.read : undefined;
}

/** The old refine: every label polished, 3-4 short requirements. */
export async function refineSnippet(body: Omit<SnipFields, "email" | "mobile" | "jobTitle"> & { level: string }) {
  const res = await fetch(URL_SN, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await cvHeaders(URL_SN)) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40_000),
  }).catch(() => null);
  const got = (await res?.json().catch(() => null)) as { ok?: boolean; data?: Omit<SnipFields, "email" | "mobile" | "jobTitle">; error?: string } | null;
  return got?.ok && got.data ? { ok: true as const, data: got.data } : { ok: false as const, message: got?.error ?? NO_LINE };
}
