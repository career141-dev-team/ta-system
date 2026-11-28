"use client";

import { useEffect, useState } from "react";

/** One ticked referee and the search that showed them (the server runs it again). */
export type Pick = { id: string; q: string; x: string[] };

const KEY = (openingId?: string) => `referral-picks:${openingId ?? "db"}`;
const load = (openingId?: string): Pick[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(openingId)) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/**
 * Export the referees ticked on the cards to Excel (12 Nov). The checkboxes live
 * in ReferralCard and point at this form with form="referral-export", so the
 * cards stay server-rendered; this bar only counts the ticks and selects all.
 *
 * 28 Nov (TA feedback): ticks used to vanish with the next search, so a TA
 * exported once per search. Now each tick is kept in this browser with the
 * search that showed it (per opening, or the Database tab), the next search's
 * ticks join it, and one export sends them all. The server runs each search
 * again and keeps only the ticked people it returns, as before.
 */
export function ExportBar({ q, drop, openingId }: { q: string; drop: string[]; openingId?: string }) {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [shownIds, setShownIds] = useState<string[]>([]);
  const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[name="id"][form="referral-export"]'));
  const save = (next: Pick[]) => {
    setPicks(next);
    try {
      localStorage.setItem(KEY(openingId), JSON.stringify(next));
    } catch {
      // Private mode: ticks still count on this page.
    }
  };
  useEffect(() => {
    const held = load(openingId);
    setPicks(held);
    setShownIds(boxes().map((b) => b.value));
    const ids = new Set(held.map((p) => p.id));
    boxes().forEach((b) => (b.checked = ids.has(b.value)));
    const sync = (e: Event) => {
      const b = e.target as HTMLInputElement;
      if (b.name !== "id" || b.getAttribute("form") !== "referral-export") return;
      const rest = load(openingId).filter((p) => p.id !== b.value);
      save(b.checked ? [...rest, { id: b.value, q, x: drop }] : rest);
    };
    document.addEventListener("change", sync);
    return () => document.removeEventListener("change", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingId, q, drop.join("\n")]);
  const shown = new Set(shownIds);
  const here = picks.filter((p) => shown.has(p.id)).length;
  const earlier = picks.length - here;
  const all = (on: boolean) => {
    boxes().forEach((b) => (b.checked = on));
    const rest = picks.filter((p) => !shown.has(p.id));
    save(on ? [...rest, ...[...shown].map((id) => ({ id, q, x: drop }))] : rest);
  };
  const clear = () => {
    boxes().forEach((b) => (b.checked = false));
    save([]);
  };
  return (
    <form id="referral-export" method="POST" action="/api/referral/export" className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-rule bg-surface px-4 py-2.5 text-[12.5px]">
      <input type="hidden" name="picks" value={JSON.stringify(picks)} />
      {openingId && <input type="hidden" name="for" value={openingId} />}
      <label className="flex items-center gap-2 text-ink-soft">
        <input type="checkbox" checked={shown.size > 0 && here === shown.size} onChange={(e) => all(e.target.checked)} className="h-4 w-4" />
        Select all shown
      </label>
      <span className="tabular text-ink-faint">
        {picks.length} selected{earlier > 0 && ` (${earlier} from earlier searches)`}
      </span>
      {picks.length > 0 && (
        <button type="button" onClick={clear} className="text-accent hover:underline">
          Clear
        </button>
      )}
      <button
        disabled={picks.length === 0}
        className="ml-auto rounded-full border border-brand-line px-4 py-1.5 font-medium text-brand transition-colors hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        Export selected to Excel
      </button>
    </form>
  );
}
