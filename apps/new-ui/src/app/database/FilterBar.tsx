"use client";

import { useState } from "react";
import { useLiftMenu } from "../openings/[id]/liftMenu";
import { CITIES, NO_PANEL, type Panel } from "./aura";

/** The one small pill for every quiet action on this page: AURA's next steps, the
 *  examples on a new chat, Filters (owner 28 Nov 2026: one height, one hover). */
export const PILL =
  "flex h-[max(2.4rem,33px)] items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface px-[max(1rem,13px)] text-small text-ink-2 transition-colors hover:border-brand hover:text-brand disabled:opacity-40";

const SORTS: { value: Panel["sort"]; label: string }[] = [
  { value: "match", label: "Best match" },
  { value: "years", label: "Most experience" },
  { value: "notice", label: "Shortest notice" },
];
const NOTICES: { value: number | null; label: string }[] = [
  { value: null, label: "Any" },
  { value: 0, label: "Now" },
  { value: 1, label: "≤ 1 mo" },
  { value: 2, label: "≤ 2 mo" },
  { value: 3, label: "≤ 3 mo" },
];
const YEARS = [0, 3, 5, 8];

/** The Filters panel above the typing bar (owner, 19 Nov 2026: the database search had
 *  no visible filter): place, notice, experience, fit and the order. "Show people" says
 *  what it did in the chat and shows the same chips the words make, so either way works. */
export default function FilterBar({
  panel,
  busy,
  className,
  onApply,
}: {
  panel: Panel;
  busy: boolean;
  className: string;
  onApply: (p: Panel, said: string) => void;
}) {
  const { open, setOpen, root, panel: box, shown } = useLiftMenu();
  const [d, setD] = useState<Panel>(panel);
  const [seen, setSeen] = useState(panel);
  // The panel always starts from what the last answer's chips say.
  if (JSON.stringify(panel) !== JSON.stringify(seen)) {
    setSeen(panel);
    setD(panel);
  }
  const n = [panel.city, panel.notice !== null, panel.years > 0, panel.strong].filter(Boolean).length;
  const chip = (on: boolean) =>
    "rounded-full px-3 py-1.5 text-small transition-colors " + (on ? "bg-brand text-white" : "bg-surface-2 text-ink-2 hover:bg-surface-3");
  const said = (p: Panel) =>
    "Filters: " +
    ([
      p.city,
      p.notice !== null && (p.notice === 0 ? "can start now" : `notice up to ${p.notice} month${p.notice > 1 ? "s" : ""}`),
      p.years > 0 && `${p.years}+ years`,
      p.strong && "strong fit",
      p.sort !== "match" && SORTS.find((s) => s.value === p.sort)?.label.toLowerCase(),
    ]
      .filter(Boolean)
      .join(", ") || "none");
  const apply = (p: Panel) => {
    setOpen(false);
    onApply(p, said(p));
  };
  return (
    <div ref={root} className={"relative flex items-center gap-2 " + className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={PILL + (open ? " border-brand text-brand" : "")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
          <path d="M4 7h16M7 12h10M10 17h4" />
        </svg>
        Filters{n ? ` · ${n}` : ""}
      </button>
      {n > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => apply({ ...NO_PANEL, sort: panel.sort })}
          className="flex h-[max(2.4rem,33px)] items-center rounded-full px-3 text-small font-medium text-brand-strong transition-colors hover:bg-surface-2 disabled:opacity-40"
        >
          Reset filters
        </button>
      )}
      {shown && (
        <div
          ref={box}
          role="dialog"
          aria-label="Filters"
          className="absolute bottom-full left-0 z-30 mb-2 w-[min(26rem,calc(100vw-2rem))] rounded-md border border-border bg-surface p-4 shadow-float"
        >
          <p className="mb-2 text-caption font-medium uppercase text-ink-3">Place</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={chip(!d.city)} onClick={() => setD((x) => ({ ...x, city: "" }))}>
              Anywhere
            </button>
            {CITIES.map((c) => (
              <button key={c} type="button" className={chip(d.city === c)} onClick={() => setD((x) => ({ ...x, city: c }))}>
                {c}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-4 text-caption font-medium uppercase text-ink-3">Notice</p>
          <div className="flex flex-wrap gap-1.5">
            {NOTICES.map((o) => (
              <button key={o.label} type="button" className={chip(d.notice === o.value)} onClick={() => setD((x) => ({ ...x, notice: o.value }))}>
                {o.label}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-4 text-caption font-medium uppercase text-ink-3">Experience</p>
          <div className="flex flex-wrap gap-1.5">
            {YEARS.map((y) => (
              <button key={y} type="button" className={chip(d.years === y)} onClick={() => setD((x) => ({ ...x, years: y }))}>
                {y ? `${y}+ years` : "Any"}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-4 text-caption font-medium uppercase text-ink-3">Fit</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={chip(!d.strong)} onClick={() => setD((x) => ({ ...x, strong: false }))}>
              Any
            </button>
            <button type="button" className={chip(d.strong)} onClick={() => setD((x) => ({ ...x, strong: true }))}>
              Strong only
            </button>
          </div>
          <p className="mb-2 mt-4 text-caption font-medium uppercase text-ink-3">Order</p>
          <div className="flex flex-wrap gap-1.5">
            {SORTS.map((o) => (
              <button key={o.value} type="button" className={chip(d.sort === o.value)} onClick={() => setD((x) => ({ ...x, sort: o.value }))}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => apply(d)}
              className="flex h-[max(2.4rem,33px)] items-center rounded-full bg-brand px-4 text-small font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
            >
              Show people
            </button>
            <button type="button" onClick={() => setD({ ...NO_PANEL })} className="flex h-[max(2.4rem,33px)] items-center rounded-full px-3 text-small text-ink-2 transition-colors hover:bg-surface-2">
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
