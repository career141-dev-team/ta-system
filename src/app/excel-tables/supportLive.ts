"use client";

// TA Support's Excel desk on real data (R4, 21 Nov 2026; ta-system /api/ui/support-tables):
// the old /support-tables reads - every position, one position's Excel Tables rows and
// L counts, a day's saved EOD emails. Read only. Signed out, the sample stays.

import { useEffect, useState } from "react";
import { cvHeaders, OLD_SERVER } from "@/lib/backend";

const URL_ST = `${OLD_SERVER}/api/ui/support-tables`;
const NO_LINE = "Could not reach the TA System. Check your connection and try again.";

export type LivePos = { id: string; title: string; client: string };
export type LiveRow = {
  id: string; name: string; title: string; company: string; linkedin?: string; ta: string; taId: string;
  sheet: number | null; sheetName?: string; location?: string; phone?: string;
  interest: "To approach" | "Interested" | "Not interested"; takenBy?: string;
  eye: boolean; addOn: boolean; hasCv: boolean; today: boolean; at: number; note?: string;
};
export type LiveCount = { ta: string; taId: string; sheet: number | null; name?: string; location?: string; total: number; today: number };
export type LiveEod = { id: string; ta: string; date: string; status: string; revision: number; location?: string; subject?: string; html?: string };

type Got<T> = { ok: true } & T;
/** One read from the old server; undefined while it comes, a sentence when it cannot. */
export function useSupport<T>(on: boolean, params: Record<string, string> | null): (Got<T> | { ok: false; message: string }) | undefined {
  const key = params ? new URLSearchParams(params).toString() : null;
  const [got, setGot] = useState<{ key: string; value: Got<T> | { ok: false; message: string } }>();
  useEffect(() => {
    if (!on || key === null) return;
    let gone = false;
    void (async () => {
      const u = `${URL_ST}${key ? `?${key}` : ""}`;
      const res = await fetch(u, { headers: await cvHeaders(u), signal: AbortSignal.timeout(30_000) }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as (Got<T> | { ok: false; message: string }) | null;
      if (!gone) setGot({ key, value: body ?? { ok: false, message: NO_LINE } });
    })();
    return () => {
      gone = true;
    };
  }, [on, key]);
  return got && got.key === key ? got.value : undefined;
}
