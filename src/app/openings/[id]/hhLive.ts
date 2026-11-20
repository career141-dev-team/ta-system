"use client";

// Headhunting on real data (D8b, 20 Nov 2026; ta-system #37). Signed in, HH
// Overview, Research and Suggestions read the old server's /api/ui/hh, which
// builds them exactly as old AURA's three pages do, and every button posts that
// page's own action there. The pure half is hhRules.ts.

import { useCallback, useEffect, useState } from "react";
import { cvHeaders, OLD_SERVER } from "@/lib/backend";
import type { HhData } from "./hhRules";
export * from "./hhRules";

const URL_HH = `${OLD_SERVER}/api/ui/hh`;

/** Post one old Headhunting action and read its whole answer (Find CV returns people). */
export async function askHh<T extends object>(body: Record<string, unknown>): Promise<({ ok: true } & T) | { ok: false; message: string }> {
  const res = await fetch(URL_HH, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await cvHeaders(URL_HH)) },
    body: JSON.stringify(body),
  }).catch(() => null);
  const got = (await res?.json().catch(() => null)) as ({ ok?: boolean; message?: string } & T) | null;
  if (got?.ok) return got as { ok: true } & T;
  return { ok: false, message: got?.message ?? "Could not reach the TA System. Check your connection and try again." };
}

/** Post one old Headhunting action; the answer is the TA System's own sentence. */
export async function sendHh(body: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
  const got = await askHh<{ message?: string }>(body);
  return { ok: got.ok, message: got.message ?? "Saved." };
}

/** The opening's Headhunting reads, once when the tab opens and again after each change. */
export function useHh(job: string | null, on: boolean) {
  const [data, setData] = useState<HhData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!on || !job) return;
    const url = `${URL_HH}?${new URLSearchParams({ opening: job })}`;
    // A read that never answered left Research on "Reading the research…" for good
    // (20 Nov, right after a release restarted the old server, which loads the desk
    // on its first request). Each try stops at 30 s and a timed-out try gets one
    // more; after that the screen says so instead of waiting for ever.
    type Got = ({ ok?: boolean; message?: string } & Partial<HhData>) | null;
    let got = null as Got;
    let slow = false;
    for (let tries = 0; tries < 2; tries++) {
      slow = false;
      const res = await fetch(url, { headers: await cvHeaders(url), signal: AbortSignal.timeout(30_000) }).catch((e: Error) => {
        slow = e?.name === "TimeoutError";
        return null;
      });
      got = (await res?.json().catch(() => null)) as Got;
      if (!slow) break;
    }
    if (got?.ok && got.research && got.suggestions && got.overview) {
      setData({ overview: got.overview, research: got.research, suggestions: got.suggestions });
      setError(null);
    } else
      setError(
        got?.message ??
          (slow ? "The TA System is slow to answer right now. Reload the page in a minute." : "Could not load Headhunting. Try again."),
      );
  }, [job, on]);
  useEffect(() => {
    const first = setTimeout(() => void reload(), 0);
    return () => clearTimeout(first);
  }, [reload]);
  return { data, error, reload };
}
