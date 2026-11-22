"use client";

// The JD chat on a real opening (22 Nov 2026; ta-system /api/ui/jd): old AURA's JD
// writer and reviser - write the JD from notes, change it in words, put an earlier
// version back. Each answer that worked keeps the JD it produced.

import { useCallback, useEffect, useState } from "react";
import { cvHeaders, OLD_SERVER } from "@/lib/backend";

const URL_JD = `${OLD_SERVER}/api/ui/jd`;
const NO_LINE = "Could not reach the TA System. Check your connection and try again.";

export type JdRow = { id: string; role: "user" | "assistant"; body: string; at: number; failed: boolean; by: string | null; jd: string | null };
type Read = { ok: true; canWrite: boolean; notes: string; chat: JdRow[] } | { ok: false; message: string };

/** The opening's JD chat, read when the screen opens and again after each change. */
export function useJdChat(on: boolean, job: string | null) {
  const [got, setGot] = useState<Read>();
  const reload = useCallback(async () => {
    if (!on || !job) return;
    const u = `${URL_JD}?${new URLSearchParams({ position: job })}`;
    const res = await fetch(u, { headers: await cvHeaders(u), signal: AbortSignal.timeout(30_000) }).catch(() => null);
    setGot(((await res?.json().catch(() => null)) as Read | null) ?? { ok: false, message: NO_LINE });
  }, [on, job]);
  useEffect(() => {
    const t = setTimeout(() => void reload(), 0);
    return () => clearTimeout(t);
  }, [reload]);
  return { got, reload };
}

/** One old JD action: "generate" { notes }, "revise" { request, currentJd }, "restore" { messageId }. */
export async function jdCall(body: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(URL_JD, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await cvHeaders(URL_JD)) },
    body: JSON.stringify(body),
    // The model writes the JD on the old server; it can take a while.
    signal: AbortSignal.timeout(120_000),
  }).catch(() => null);
  const got = (await res?.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  return { ok: !!got?.ok, message: got?.message ?? NO_LINE };
}
