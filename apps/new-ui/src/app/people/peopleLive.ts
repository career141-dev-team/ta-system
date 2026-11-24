"use client";

// People and roles on real data (R1, 20 Nov 2026; ta-system #54). Signed in, the page
// reads the old server's /api/ui/people - what old AURA's /people shows this person -
// and every button runs that page's own action there (admin only, inside the action).

import { useCallback, useEffect, useState } from "react";
import { cvHeaders, OLD_SERVER } from "@/lib/backend";

const URL_PEOPLE = `${OLD_SERVER}/api/ui/people`;
const NO_LINE = "Could not reach the TA System. Check your connection and try again.";

export type LivePerson = { id: string; name: string; email: string; phone: string; routingEmail: string; role: string; active: boolean; workCountry: string };
export type LiveInvite = { id: string; email: string; role: string | null; createdAt: number };
export type LiveAccount = { email: string; fullName: string; oldAppRole: string; isActive: boolean; duplicates: number; canSignInHere: boolean };
export type LivePeople = { me: string; canEdit: boolean; people: LivePerson[]; invites: LiveInvite[]; accounts: LiveAccount[] };

/** The desk, once when the page opens and again after each change. */
export function usePeopleLive(on: boolean) {
  const [data, setData] = useState<LivePeople | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!on) return;
    const res = await fetch(URL_PEOPLE, { headers: await cvHeaders(URL_PEOPLE), signal: AbortSignal.timeout(30_000) }).catch(() => null);
    const got = (await res?.json().catch(() => null)) as ({ ok?: boolean; message?: string } & Partial<LivePeople>) | null;
    if (got?.ok && got.people) {
      setData({ me: got.me ?? "", canEdit: !!got.canEdit, people: got.people, invites: got.invites ?? [], accounts: got.accounts ?? [] });
      setError(null);
    } else setError(got?.message ?? NO_LINE);
  }, [on]);
  useEffect(() => {
    const first = setTimeout(() => void reload(), 0);
    return () => clearTimeout(first);
  }, [reload]);
  return { data, error, reload };
}

/** One old /people action; the answer is the TA System's own sentence. */
export async function sendPeople(body: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(URL_PEOPLE, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await cvHeaders(URL_PEOPLE)) },
    body: JSON.stringify(body),
  }).catch(() => null);
  const got = (await res?.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  return { ok: !!got?.ok, message: got?.message ?? NO_LINE };
}
