"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { DUR, EASE, gsap, useExit, useGSAP } from "@/lib/gsap";
import { useWorkdayGate } from "@/lib/workday";
import CvPages, { warmPdf } from "./CvPages";
import { EXPERIENCE, NOTICE, inRange } from "./filters";
import { BackButton } from "./PipelineBoard";
import Toast from "./Toast";
import WorkdayBlocked from "./WorkdayBlocked";

// The CV opened big comes in its own piece, like in Scoops.
const CvPreview = dynamic(() => import("./CvPreview"), { ssr: false });

// The Database CVs view (Figma 713:1620): the CVs in the database that match this
// job, best first, each with why it fits (the violet line), and the chosen one's real
// CV beside the list, read like a document, to shortlist or set aside. Placeholder
// data - made-up people, and sample CV files that carry other made-up names. With the
// backend each page of matches is one small read from the CV index (the number beside
// "matched" is a stored count, not the length of the list) and a CV file is fetched
// only when it is chosen. `MORE` stands for the matches not on this page.
const MORE = 33;

type Match = { id: string; name: string; title: string; company: string; city: string; why: string; score: number; years: number; notice: number; cv: string };

const MATCHES: Match[] = [
  { id: "m1", name: "Kasun Perera", title: "SAP S/4HANA Lead", company: "Virtusa", city: "Colombo", why: "Led 2 manufacturing rollouts", score: 92, years: 9, notice: 30, cv: "/cvs/s2.pdf" },
  { id: "m2", name: "Ishara Silva", title: "SAP Solution Architect", company: "Virtusa", city: "Colombo", why: "S/4 for a tile maker", score: 88, years: 8, notice: 60, cv: "/cvs/s3.pdf" },
  { id: "m3", name: "Chamara Weerasinghe", title: "ERP Programme Director", company: "Hayleys", city: "Colombo", why: "ERP programme for 9 plants", score: 85, years: 14, notice: 90, cv: "/cvs/s5.pdf" },
  { id: "m4", name: "Nimali Abeysekara", title: "SAP MM Lead", company: "IFS", city: "Colombo", why: "MM/PP, notice 1 month", score: 81, years: 7, notice: 30, cv: "/cvs/p2.pdf" },
  { id: "m5", name: "Tharindu Jay", title: "SAP FICO Manager", company: "Brandix", city: "Colombo", why: "FICO rollout lead", score: 77, years: 10, notice: 0, cv: "/cvs/s4.pdf" },
];

type Filters = { q: string; score: string; exp: string; notice: string };
const NO_FILTERS: Filters = { q: "", score: "", exp: "", notice: "" };
const SCORE = [
  { value: "", label: "Any score" },
  { value: "80", label: "80 or more" },
  { value: "85", label: "85 or more" },
  { value: "90", label: "90 or more" },
];
const fits = (m: Match, f: Filters) =>
  (!f.q || [m.name, m.title, m.company, m.why].join(" ").toLowerCase().includes(f.q.trim().toLowerCase())) &&
  m.score >= Number(f.score || 0) &&
  inRange(m.years, f.exp) &&
  inRange(m.notice, f.notice);

// Sizes are the frame's px / 16 on the app's rem scale (a floor for small windows);
// colours, the type scale and the shadow are DESIGN.md's tokens. The preview's
// corners (30, 20) are the frame's own.
const BTN =
  "flex items-center gap-2 whitespace-nowrap rounded-full py-[max(0.625rem,7px)] pl-[max(1.25rem,14px)] pr-[max(1.375rem,15px)] text-small font-medium transition-colors disabled:opacity-40";
const GHOST = BTN + " border border-border-strong bg-surface text-ink enabled:hover:bg-surface-2";
const FIELD =
  "h-[max(2.375rem,40px)] w-full rounded-full border border-brand/50 bg-surface px-[max(1.375rem,14px)] text-body text-ink outline-none placeholder:text-ink-3 focus:border-brand focus:ring-2 focus:ring-brand/15";
const FADE_OUT = { opacity: 0 };

/** The score ring (Figma 713:1660): a 4px arc from the top, clockwise, as far round as
 *  the score, on a light track. Dark green from 85, leaf green below; flat ends. */
function Ring({ score }: { score: number }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative flex size-13 shrink-0 items-center justify-center text-small font-medium text-ink">
      <svg viewBox="0 0 52 52" fill="none" strokeWidth="4" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="26" cy="26" r={r} className="stroke-surface-2" />
        <circle cx="26" cy="26" r={r} strokeDasharray={`${(c * score) / 100} ${c}`} className={score >= 85 ? "stroke-brand" : "stroke-brand-leaf"} />
      </svg>
      {score}
    </span>
  );
}

/** The Database CVs view: matches on the left, the chosen CV on the right. */
export default function DatabaseCvsView() {
  const gate = useWorkdayGate();
  const [list, setList] = useState(MATCHES);
  const [chosen, setChosen] = useState(MATCHES[0].id);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterBox = useRef<HTMLDivElement>(null);
  const filterShown = useExit(filterOpen, filterBox, FADE_OUT);
  const [reading, setReading] = useState(false);
  const cvBox = useRef<HTMLDivElement>(null);
  const readingShown = useExit(reading, cvBox, FADE_OUT);
  const [toast, setToast] = useState<{ key: number; bold: string; rest: string } | null>(null);
  // A new key each time, so the same words can be said twice.
  const toasts = useRef(0);

  const active = Object.values(filters).filter(Boolean).length;
  const shown = list.filter((x) => fits(x, filters));
  const m = shown.find((x) => x.id === chosen) ?? shown[0];
  // shortcut: with a filter on, the count is the length of this page's matches; with the
  // backend it is the server's count of every CV that fits.
  const count = active ? shown.length : list.length + MORE;

  // The match leaves the list and the next one (or the one before, at the end) is chosen.
  // shortcut: a shortlisted or set-aside CV only leaves this list; recording it on the
  // job's pipeline and in the database is the backend's.
  const take = (rest: string) => {
    if (!m || gate) return;
    const at = shown.indexOf(m);
    const next = shown[at + 1] ?? shown[at - 1];
    setList((l) => l.filter((x) => x.id !== m.id));
    if (next) setChosen(next.id);
    setToast({ key: ++toasts.current, bold: m.name, rest });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col px-[max(2.3rem,14px)] pb-[max(3.4rem,14px)] pt-[max(2.53rem,36px)] max-md:overflow-y-auto max-md:pt-11">
      <div className="absolute left-[max(2.3rem,14px)] top-[max(2.8rem,40px)] max-md:static max-md:mb-4">
        <BackButton />
      </div>

      <div className="flex flex-wrap items-center gap-x-7 gap-y-3 md:ml-[3.625rem]">
        <p className="flex items-center gap-2">
          <span className="text-h2 text-ink">{count}</span>
          <span className="text-small text-ink-2">matched to this job</span>
        </p>
        <div className="min-w-px flex-1 max-md:hidden" />
        <button type="button" onClick={() => setFilterOpen(true)} className={GHOST}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[max(1rem,14px)]" aria-hidden="true">
            <path d="M4 7h16M7 12h10M10 17h4" />
          </svg>
          Filters{active > 0 && ` · ${active}`}
        </button>
        {/* shortcut: searching the whole database has no screen designed yet, so it does nothing. */}
        <button type="button" className={GHOST}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[max(1rem,14px)]" aria-hidden="true">
            <ellipse cx="12" cy="5" rx="8" ry="3" />
            <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
          </svg>
          Search the whole database
        </button>
      </div>

      {gate && <WorkdayBlocked what="shortlist candidates" className="mt-4" />}

      <div className="mt-[max(1.69rem,12px)] flex min-h-0 flex-1 gap-7 max-md:flex-col">
        <ul className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto [scrollbar-width:none] md:flex-[0_1_48.75rem] max-md:w-full max-md:overflow-visible">
          {shown.map((x) => {
            const on = x.id === m?.id;
            return (
              <li key={x.id}>
                <button
                  type="button"
                  aria-current={on ? "true" : undefined}
                  onClick={() => setChosen(x.id)}
                  // The CV is read ahead while the pointer is on its way, so it opens at once.
                  onPointerEnter={() => warmPdf(x.cv)}
                  className={
                    "flex w-full items-center gap-4 rounded-md px-5 py-3.5 text-left transition-colors " +
                    (on ? "border-[1.5px] border-brand bg-brand-tint" : "border border-border bg-surface hover:bg-canvas")
                  }
                >
                  <Ring score={x.score} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[max(1.1875rem,15px)] font-medium leading-[1.3684] tracking-[-0.1px] text-ink">{x.name}</span>
                    <span className="truncate text-small text-ink-2">
                      {x.title} · {x.company} · {x.city}
                    </span>
                    <span className="truncate text-small text-violet">✦ {x.why}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="pt-2 text-small text-ink-3">
              {list.length ? (
                <>
                  No match fits these filters.{" "}
                  <button type="button" onClick={() => setFilters(NO_FILTERS)} className="font-medium text-brand hover:opacity-70">
                    Clear filters
                  </button>
                </>
              ) : (
                "No more matches on this page."
              )}
            </li>
          )}
        </ul>

        <div className="flex min-w-0 flex-1 flex-col max-md:flex-none">
          <div className="min-h-0 flex-1 overflow-hidden rounded-[1.875rem] bg-canvas px-7 pb-[1.9375rem] pt-7 md:max-h-[35rem] max-md:h-[30rem]">
            {m ? (
              // The CV file, page by page like a document reader: the first page across the
              // width, the rest a scroll away. Double-click, or the corner button, opens it big.
              <div
                onDoubleClick={() => setReading(true)}
                title="Double-click to open this CV big"
                className="relative h-full overflow-hidden rounded-[1.25rem] bg-surface shadow-card"
              >
                <CvPages key={m.cv} src={m.cv} fit="width" />
                <button
                  type="button"
                  onClick={() => setReading(true)}
                  aria-label="Open this CV big"
                  className="absolute right-3 top-3 flex size-[max(2.2rem,28px)] items-center justify-center rounded-full bg-surface/90 text-ink shadow-float transition-colors hover:bg-surface"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-1/2" aria-hidden="true">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                </button>
              </div>
            ) : (
              <p className="flex h-full items-center justify-center text-small text-ink-3">Choose a match to read its CV.</p>
            )}
          </div>
          <div className="mt-[1.125rem] flex shrink-0 justify-end gap-2.5">
            <button type="button" disabled={!m || !!gate} onClick={() => take(" is not for this job")} className={GHOST}>
              Not for this job
            </button>
            <button type="button" disabled={!m || !!gate} onClick={() => take(" shortlisted")} className={BTN + " bg-brand text-white enabled:hover:bg-brand-strong"}>
              Shortlist
            </button>
          </div>
        </div>
      </div>

      {filterShown && (
        <FilterDialog
          ref={filterBox}
          filters={filters}
          onClose={() => setFilterOpen(false)}
          onApply={(f) => {
            setFilters(f);
            setFilterOpen(false);
          }}
        />
      )}
      {readingShown && m && <CvPreview ref={cvBox} name={m.name} title={m.title} src={m.cv} onClose={() => setReading(false)} />}
      {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} />}
    </div>
  );
}

/** The Filters popup: a few fields over a blurred window. Apply keeps them; Clear
 *  empties them; Escape or a click outside closes it without keeping any change. */
function FilterDialog({ ref: root, filters, onClose, onApply }: { ref: RefObject<HTMLDivElement | null>; filters: Filters; onClose: () => void; onApply: (f: Filters) => void }) {
  const [draft, setDraft] = useState(filters);
  const set = (k: keyof Filters) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  useGSAP(
    () => {
      gsap.from("[data-veil]", { opacity: 0, duration: DUR.fast });
      gsap.from("[data-box]", { opacity: 0, y: 14, scale: 0.94, duration: DUR.base, ease: EASE.pop });
    },
    { scope: root },
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const label = "mb-1 block pl-3 text-caption font-medium text-ink-3";
  const select = (k: keyof Filters, name: string, options: { value: string; label: string }[]) => (
    <label className="block">
      <span className={label}>{name}</span>
      <select value={draft[k]} onChange={set(k)} className={FIELD + " cursor-pointer"}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return createPortal(
    <div ref={root} className="fixed inset-0 z-[80] flex items-center justify-center">
      <div data-veil className="absolute inset-0 bg-surface/20 backdrop-blur-[6px]" onClick={onClose} />
      <div
        data-box
        role="dialog"
        aria-modal="true"
        aria-labelledby="filters-title"
        className="relative max-h-[calc(100dvh-32px)] w-[max(29rem,340px)] max-w-[calc(100vw-32px)] overflow-y-auto rounded-xl bg-surface px-[max(2.25rem,22px)] pb-[max(2.25rem,22px)] pt-[max(2rem,20px)] shadow-float"
      >
        <h2 id="filters-title" className="flex items-center gap-1.5 text-small font-medium text-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-[max(1rem,14px)]" aria-hidden="true">
            <path d="M4 7h16M7 12h10M10 17h4" />
          </svg>
          Filters
        </h2>
        <form
          className="mt-[max(1.2rem,12px)] flex flex-col gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            onApply(draft);
          }}
        >
          <label className="block">
            <span className={label}>Name, job title, company or what fits</span>
            <input autoFocus value={draft.q} onChange={set("q")} placeholder="SAP, Virtusa, rollout…" aria-label="Keyword" className={FIELD} />
          </label>
          {select("score", "Match score", SCORE)}
          {select("exp", "Experience", EXPERIENCE)}
          {select("notice", "Notice period", NOTICE)}
          <div className="mt-1 flex justify-end gap-3">
            <button type="button" onClick={() => setDraft(NO_FILTERS)} className={GHOST}>
              Clear
            </button>
            <button type="submit" className={BTN + " bg-brand text-white hover:bg-brand-strong"}>
              Apply
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
