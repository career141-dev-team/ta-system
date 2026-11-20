"use client";

// Excel Tables on real data (D8a, 20 Nov 2026; ta-system #32 + #34). Signed in, the
// rows and the person's L-sheets come from the old server's /api/ui/links, which
// builds them exactly as old AURA's table does, and every button posts that
// table's own action there. This file holds the reading, the row shape and which
// action a change on a row is; ExcelTablesView keeps its look and calls these.

import { useCallback, useEffect, useState } from "react";
import { cvHeaders, OLD_SERVER } from "@/lib/backend";
import type { LiveLinks } from "./excelRules";
export * from "./excelRules";

const URL_LINKS = `${OLD_SERVER}/api/ui/links`;

/** Post one old-table action; the answer is the TA System's own sentence. */
export async function sendLink(body: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(URL_LINKS, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await cvHeaders(URL_LINKS)) },
    body: JSON.stringify(body),
  }).catch(() => null);
  const got = (await res?.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  return { ok: !!got?.ok, message: got?.message ?? "Could not reach the TA System. Check your connection and try again." };
}

/** The opening's rows and sheets, read again after every change. */
export function useLiveLinks(job: string | null, on: boolean) {
  const [data, setData] = useState<LiveLinks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!on || !job) return;
    const url = `${URL_LINKS}?${new URLSearchParams({ opening: job })}`;
    const res = await fetch(url, { headers: await cvHeaders(url) }).catch(() => null);
    const got = (await res?.json().catch(() => null)) as ({ ok?: boolean; message?: string } & Partial<LiveLinks>) | null;
    if (got?.ok && got.rows) {
      setData({ rows: got.rows, sheets: got.sheets ?? [], undo: got.undo ?? null, locations: got.locations ?? [] });
      setError(null);
    } else setError(got?.message ?? "Could not load this table. Try again.");
  }, [job, on]);
  useEffect(() => {
    // The table's first read, then a read every minute so another tab's or the
    // Chrome capture's rows arrive (the old table refreshed itself too).
    const first = setTimeout(() => void reload(), 0);
    const t = setInterval(() => void reload(), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [reload]);
  return { data, error, reload };
}
