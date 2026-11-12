"use client";

import { useEffect, useState } from "react";

/**
 * Export the referees ticked on the cards to Excel (12 Nov). The checkboxes live
 * in ReferralCard and point at this form with form="referral-export", so the
 * cards stay server-rendered; this bar only counts the ticks and selects all.
 * The form posts the ids plus the same search, and the server runs it again.
 */
export function ExportBar({ q, drop, openingId }: { q: string; drop: string[]; openingId?: string }) {
  const [n, setN] = useState(0);
  const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[name="id"][form="referral-export"]'));
  useEffect(() => {
    const sync = () => setN(boxes().filter((b) => b.checked).length);
    document.addEventListener("change", sync);
    return () => document.removeEventListener("change", sync);
  }, []);
  const all = (on: boolean) => {
    boxes().forEach((b) => (b.checked = on));
    setN(on ? boxes().length : 0);
  };
  return (
    <form id="referral-export" method="POST" action="/api/referral/export" className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-rule bg-surface px-4 py-2.5 text-[12.5px]">
      <input type="hidden" name="q" value={q} />
      {drop.map((d) => <input key={d} type="hidden" name="x" value={d} />)}
      {openingId && <input type="hidden" name="for" value={openingId} />}
      <label className="flex items-center gap-2 text-ink-soft">
        <input type="checkbox" checked={n > 0 && n === boxes().length} onChange={(e) => all(e.target.checked)} className="h-4 w-4" />
        Select all shown
      </label>
      <span className="tabular text-ink-faint">{n} selected</span>
      <button
        disabled={n === 0}
        className="ml-auto rounded-full border border-brand-line px-4 py-1.5 font-medium text-brand transition-colors hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        Export selected to Excel
      </button>
    </form>
  );
}
