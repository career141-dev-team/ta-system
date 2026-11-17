"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useWorkdayGate } from "@/lib/workday";
import { useSwap } from "@/lib/gsap";
import { CLAIMED, POOL, reasonOf, type Person } from "../../database/aura";
import Count from "@/app/Count";
import { BackButton } from "./PipelineBoard";
import CvPages, { warmPdf } from "./CvPages";
import WorkdayBlocked from "./WorkdayBlocked";
import Toast from "./Toast";
import { sendToPipeline } from "./pipelineInbox";
import { useJdApproved } from "./jdState";
import { useLiftMenu } from "./liftMenu";

// ATS · Database CVs - matches from the whole database (owner's design, 14 Nov 2026).
// The old tab's rules (database-search skill §10, §13): matching reads the approved
// JD and keeps a standing list; a match is only a suggestion until a TA shortlists
// it, which claims them (another TA's claim locks the row); "Not for this job" keeps
// them out of later rounds; "Search the whole database" opens the Database chat on
// this job. Sample people from the Database screen - nothing reads the backend yet.
// Merged 14 Nov with shane123-tech's feat/database-cvs-screen: his Figma score ring
// (713:1660), the big count, the CV read ahead on hover, "Open this CV big" and the
// workday line came from there.

const CvPreview = dynamic(() => import("./CvPreview"), { ssr: false });

/** The Filters panel (owner's Figma "Filter popup", 17 Nov 2026): fit, location,
 *  notice and experience, plus the list filters under "More filters". A list filter
 *  keeps a person when any of its words matches. */
const LISTS = [
  ["company", "Company"],
  ["past", "Past companies"],
  ["skills", "Skills"],
  ["schools", "Schools"],
  ["industries", "Industries"],
  ["titles", "Job titles"],
  ["nationality", "Nationality"],
] as const;
type ListKey = (typeof LISTS)[number][0];
type Filters = {
  fit: "any" | "strong";
  /** Most months of notice; 0 = immediate; null = any. */
  notice: number | null;
  city: string;
  minYears: number | null;
  maxYears: number | null;
  lists: Record<ListKey, string[]>;
};
const NO_LISTS = Object.fromEntries(LISTS.map(([k]) => [k, []])) as unknown as Record<ListKey, string[]>;
const ANY: Filters = { fit: "any", notice: null, city: "any", minYears: null, maxYears: null, lists: NO_LISTS };
const YEARS = [2, 3, 5, 8, 10, 12, 15, 20];
const noticeLabel = (n: number) => (n === 0 ? "Immediate" : `${n} month${n > 1 ? "s" : ""} or less`);

const keep = (f: Filters) => (p: Person) => {
  // ponytail: the sample people carry only title, company, city and tags, so past
  // companies, schools, industries and nationality are looked for in all of that;
  // with the backend each list reads its own field.
  const all = [p.title, p.company, p.city, ...p.tags].join(" ").toLowerCase();
  const text: Record<ListKey, string> = {
    company: p.company.toLowerCase(),
    past: all,
    skills: [p.title, ...p.tags].join(" ").toLowerCase(),
    schools: all,
    industries: all,
    titles: p.title.toLowerCase(),
    nationality: all,
  };
  return (
    (f.fit === "any" || p.score >= 75) &&
    (f.notice === null || p.notice <= f.notice) &&
    (f.city === "any" || p.city === f.city) &&
    (f.minYears === null || p.years >= f.minYears) &&
    (f.maxYears === null || p.years <= f.maxYears) &&
    LISTS.every(([k]) => !f.lists[k].length || f.lists[k].some((w) => text[k].includes(w.toLowerCase())))
  );
};
const JOB_Q = "SAP Business Transformation, manufacturing";
const JOB_TITLE = "Head of SAP";

export default function DatabaseCvsView() {
  const gate = useWorkdayGate();
  const jdApproved = useJdApproved();
  const [rows, setRows] = useState<Person[]>(() => [...POOL].sort((a, b) => b.score - a.score));
  const [f, setF] = useState<Filters>({ ...ANY, fit: "strong", notice: 1, city: "Colombo" });
  const [pickedId, setPickedId] = useState(rows[0]?.id ?? "");
  const [matching, setMatching] = useState(false);
  const [big, setBig] = useState(false);
  // The big CV grows out of the CV pane it was opened from (CvPreview `from`).
  const [bigFrom, setBigFrom] = useState<HTMLElement | null>(null);
  const openBig = () => {
    setBigFrom(cv.current?.closest("section") ?? null);
    setBig(true);
  };
  const [ranAgo, setRanAgo] = useState("4 min ago");
  const [toast, setToast] = useState<{ bold?: string; rest: string; warn?: boolean; n: number } | null>(null);
  // ponytail: sample set number; the backend gives the real next set.
  const [setNo, setSetNo] = useState(3);
  const [sure, setSure] = useState("");
  const [undo, setUndo] = useState<Person | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);
  const root = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const shown = rows.filter(keep(f));
  const picked = shown.find((p) => p.id === pickedId) ?? shown[0];
  const open = rows.filter((p) => !CLAIMED[p.id]).length;
  useSwap(cv, picked?.id ?? "");

  const say = (rest: string, bold?: string, warn?: boolean) =>
    setToast({ rest, bold, warn, n: Date.now() });
  // The next row once this one leaves the list.
  const leave = (p: Person) => {
    const i = shown.indexOf(p);
    setPickedId((shown[i + 1] ?? shown[i - 1])?.id ?? "");
    setRows((r) => r.filter((x) => x.id !== p.id));
  };
  const shortlist = (p: Person) => {
    if (gate) return say(gate, undefined, true);
    if (CLAIMED[p.id]) return say(`${CLAIMED[p.id]} already claimed ${p.name}.`, undefined, true);
    // They show on the Pipeline board, in TA Follow-Up (source: the database).
    sendToPipeline({ name: p.name, title: p.title, company: p.company, location: p.city, years: p.years, notice: p.notice, cv: p.cv, channel: "SCOOP" });
    leave(p);
    say(` shortlisted as set ${setNo} - moved to TA Follow-Up`, p.name);
    setSetNo((n) => n + 1);
  };
  const notFor = (p: Person) => {
    if (gate) return say(gate, undefined, true);
    // Asks once: the second press takes them off.
    if (sure !== p.id) return setSure(p.id);
    setSure("");
    leave(p);
    setUndo(p);
  };
  const rerun = () => {
    if (matching) return;
    // Matching reads the approved JD; the TA System refuses it before approval.
    if (!jdApproved) return say("Approve the job description first - matching reads it.", undefined, true);
    setMatching(true);
    // ponytail: a stand-in wait; with the backend this is the reverse match.
    timer.current = setTimeout(() => {
      setMatching(false);
      setRanAgo("just now");
    }, 2500);
  };

  // Up and down move along the list while this view is on screen.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!root.current?.offsetParent || e.defaultPrevented) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [role=menu], [role=dialog]")) return;
      const i = shown.findIndex((p) => p.id === picked?.id);
      const next = shown[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      setPickedId(next.id);
      root.current.querySelector(`[data-row="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [shown, picked]);

  // Each chip clears with a functional update, so "Clear the filters" can run them all.
  const years =
    f.minYears !== null && f.maxYears !== null
      ? `${f.minYears}–${f.maxYears} years`
      : f.minYears !== null
        ? `${f.minYears}+ years`
        : `Up to ${f.maxYears} years`;
  const chips = [
    f.fit === "strong" && { label: "Fit: strong", clear: () => setF((x) => ({ ...x, fit: "any" })) },
    f.notice !== null && {
      label: f.notice === 0 ? "Notice: immediate" : `Notice ≤ ${f.notice} month${f.notice > 1 ? "s" : ""}`,
      clear: () => setF((x) => ({ ...x, notice: null })),
    },
    f.city !== "any" && { label: f.city, clear: () => setF((x) => ({ ...x, city: "any" })) },
    (f.minYears !== null || f.maxYears !== null) && { label: years, clear: () => setF((x) => ({ ...x, minYears: null, maxYears: null })) },
    ...LISTS.flatMap(([k, name]) =>
      f.lists[k].map((w) => ({
        label: `${name}: ${w}`,
        clear: () => setF((x) => ({ ...x, lists: { ...x.lists, [k]: x.lists[k].filter((v) => v !== w) } })),
      })),
    ),
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col px-[max(1.5rem,14px)] pb-[max(1.25rem,12px)] pt-[max(1.4rem,14px)] max-md:pt-11">
      <div className="flex flex-wrap items-center gap-x-[max(1.25rem,12px)] gap-y-2">
        <BackButton />
        <p className="flex items-baseline gap-2 text-small text-ink-2">
          <Count n={rows.length} className="text-h2 text-ink" /> matched to this job
          <span className="text-ink-3">· {open} nobody has claimed</span>
        </p>
        <button
          type="button"
          onClick={rerun}
          disabled={matching}
          title="Run matching again - it reads the approved JD"
          className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-small text-ink-2 hover:bg-surface-3 hover:text-ink disabled:cursor-default md:ml-auto"
        >
          <span className={"size-2 rounded-full " + (matching ? "animate-pulse bg-warn" : "bg-success")} />
          {matching ? "Matching…" : `Matching finished ${ranAgo}`}
        </button>
      </div>

      {gate && <WorkdayBlocked what="shortlist candidates" className="mt-3" />}

      <div className="mt-[max(1rem,10px)] flex flex-wrap items-center gap-2">
        {/* First in the row, so its panel always opens from the left and fits. */}
        <FiltersMenu applied={f} onApply={setF} rows={rows} />
        {chips.map((c) => (
          <span key={c.label} className="flex max-w-[max(16rem,200px)] items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1.5 text-small text-ink-2">
            <span className="truncate" title={c.label}>
              {c.label}
            </span>
            <button
              type="button"
              onClick={c.clear}
              aria-label={`Remove ${c.label}`}
              title={`Remove ${c.label}`}
              className="flex size-[1.15rem] shrink-0 items-center justify-center rounded-full opacity-50 hover:bg-surface hover:opacity-100"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="size-3" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </span>
        ))}
        <Link
          href={`/database?q=${encodeURIComponent(JOB_Q)}&for=${encodeURIComponent(JOB_TITLE)}`}
          className="ml-auto text-small font-medium text-brand hover:underline"
        >
          Search the whole database →
        </Link>
      </div>

      <div className="mt-[max(1rem,10px)] flex min-h-0 flex-1 gap-[max(1.25rem,12px)] max-md:flex-col">
        <ul aria-label="Matches" className="flex w-[38%] min-w-[max(22rem,280px)] flex-col gap-2 overflow-y-auto pr-1 max-md:max-h-[40%] max-md:w-auto max-md:min-w-0">
          {shown.length === 0 && (
            <li className="flex flex-col items-start gap-2 rounded-md bg-surface-2 p-4 text-small text-ink-2">
              {rows.length ? "Nobody here with these filters." : "No matches waiting. Run matching again for new ones."}
              {chips.length > 0 && (
                <button type="button" onClick={() => chips.forEach((c) => c.clear())} className="font-medium text-brand hover:underline">
                  Clear the filters
                </button>
              )}
            </li>
          )}
          {shown.map((p) => {
            const on = p.id === picked?.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  data-row={p.id}
                  onClick={() => setPickedId(p.id)}
                  // The CV is read ahead while the pointer is on its way, so it opens at once.
                  onPointerEnter={() => p.cv && warmPdf(p.cv)}
                  aria-current={on ? "true" : undefined}
                  className={
                    "flex w-full items-center gap-3 rounded-md border px-3.5 py-3 text-left transition-colors " +
                    (on ? "border-brand bg-brand-tint" : "border-transparent hover:bg-surface-2")
                  }
                >
                  <Ring score={p.score} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-body font-medium text-ink">{p.name}</span>
                      {CLAIMED[p.id] && (
                        <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-caption text-ink-2">
                          {CLAIMED[p.id]}&apos;s
                        </span>
                      )}
                    </span>
                    <span className="truncate text-small text-ink-3">
                      {p.title} · {p.company} · {p.city}
                    </span>
                    <span className="truncate text-small text-violet">✦ {reasonOf(p)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* White like the board, with a hairline to set it apart (owner, 17 Nov 2026). */}
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface">
          {picked ? (
            <>
              {picked.cv && (
                <button
                  type="button"
                  onClick={() => openBig()}
                  aria-label="Open this CV big"
                  title="Open this CV big (or double-click it)"
                  className="absolute right-3 top-3 z-10 flex size-[max(2.2rem,30px)] items-center justify-center rounded-full bg-surface text-ink shadow-float hover:bg-surface-2"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-1/2" aria-hidden="true">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                </button>
              )}
              <div ref={cv} onDoubleClick={() => picked.cv && openBig()} className="min-h-0 flex-1 overflow-y-auto px-[max(1.25rem,12px)] pb-[max(5.5rem,70px)] pt-[max(1.25rem,12px)]">
                {picked.cv ? (
                  <CvPages key={picked.cv} src={picked.cv} fit="width" />
                ) : (
                  <p className="pt-[20vh] text-center text-body text-ink-3">No CV file on record for {picked.name.split(" ")[0]}.</p>
                )}
              </div>
              <div className="absolute inset-x-0 bottom-[max(1.25rem,12px)] flex justify-center gap-2 px-3">
                {CLAIMED[picked.id] ? (
                  <p className="rounded-full bg-surface px-4 py-2.5 text-small text-ink-2 shadow-float">
                    {CLAIMED[picked.id]} already claimed {picked.name.split(" ")[0]}
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => notFor(picked)}
                      onBlur={() => setSure("")}
                      className={
                        "flex h-[max(2.75rem,36px)] items-center rounded-full px-[max(1.2rem,14px)] text-body font-medium shadow-float ring-1 " +
                        (sure === picked.id ? "bg-danger-soft text-danger ring-danger/40" : "bg-surface text-ink ring-border/60 hover:bg-surface-2")
                      }
                    >
                      {sure === picked.id ? "Press again to take them off" : "Not for this job"}
                    </button>
                    <button
                      type="button"
                      onClick={() => shortlist(picked)}
                      className="flex h-[max(2.75rem,36px)] items-center rounded-full bg-brand px-[max(1.4rem,16px)] text-body font-medium text-white shadow-float hover:bg-brand-strong"
                    >
                      Shortlist
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="m-auto text-body text-ink-3">Pick someone on the left to read their CV.</p>
          )}
        </section>
      </div>
      {big && picked?.cv && (
        <CvPreview from={bigFrom} name={picked.name} title={`${picked.title} · ${picked.company}`} src={picked.cv} onClose={() => setBig(false)} />
      )}
      {undo && (
        <div role="status" className="fixed bottom-[max(4rem,48px)] left-1/2 z-[90] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-[max(1.3rem,14px)] py-[max(0.7rem,8px)] text-[max(0.85rem,12.5px)] text-white shadow-float">
          <span>
            <b className="font-semibold">{undo.name}</b> will not be matched to this job again
          </span>
          <button
            type="button"
            onClick={() => {
              setRows((r) => [...r, undo].sort((a, b) => b.score - a.score));
              setPickedId(undo.id);
              setUndo(null);
            }}
            className="font-medium text-brand-leaf hover:underline"
          >
            Undo
          </button>
        </div>
      )}
      {toast && <Toast key={toast.n} bold={toast.bold} rest={toast.rest} warn={toast.warn} />}
    </div>
  );
}

/** The match score ring (Figma 713:1660, from shane123-tech's branch): a 4px arc from
 *  the top, as far round as the score - dark green from 85, leaf green below. */
function Ring({ score }: { score: number }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative flex size-[max(3.25rem,40px)] shrink-0 items-center justify-center text-small font-medium text-ink" title={`${score} match`}>
      <svg viewBox="0 0 52 52" fill="none" strokeWidth="4" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="26" cy="26" r={r} className="stroke-surface-2" />
        <circle cx="26" cy="26" r={r} strokeDasharray={`${(c * score) / 100} ${c}`} className={score >= 85 ? "stroke-brand" : "stroke-brand-leaf"} />
      </svg>
      {score}
    </span>
  );
}

/** "Filters": a lifted panel (owner's Figma "Filter popup", 17 Nov 2026). Changes are a
 *  draft until "Show N matches" applies them; Escape or a press outside leaves them. */
function FiltersMenu({ applied, onApply, rows }: { applied: Filters; onApply: (f: Filters) => void; rows: Person[] }) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const btn = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };
  return (
    <div ref={root} className="relative">
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-small text-ink-2 hover:border-border-strong hover:text-ink aria-expanded:border-border-strong aria-expanded:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-3.5" aria-hidden="true">
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        Filters
      </button>
      {shown && (
        <FiltersPanel
          panelRef={panel}
          applied={applied}
          rows={rows}
          onClose={close}
          onApply={(d) => {
            onApply(d);
            close();
          }}
        />
      )}
    </div>
  );
}

const BOX = "rounded-lg border border-border bg-surface hover:border-border-strong";
const FOCUS = "focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30";

function FiltersPanel(props: {
  panelRef: RefObject<HTMLDivElement | null>;
  applied: Filters;
  rows: Person[];
  onClose: () => void;
  onApply: (f: Filters) => void;
}) {
  const { panelRef } = props;
  const [d, setD] = useState(props.applied);
  const listCount = LISTS.reduce((n, [k]) => n + d.lists[k].length, 0);
  const [more, setMore] = useState(listCount > 0);
  const first = useRef<HTMLButtonElement>(null);
  const fitId = useId();
  const n = props.rows.filter(keep(d)).length;
  const cities = [...new Set(POOL.map((p) => p.city))];
  const clean = JSON.stringify(d) === JSON.stringify(ANY);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setD((x) => ({ ...x, [k]: v }));
  const num = (v: string) => (v === "" ? null : Number(v));

  // Fits under its button on any window: the panel scrolls inside itself, never the page.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (el) el.style.maxHeight = `${Math.max(240, window.innerHeight - el.getBoundingClientRect().top - 12)}px`;
    first.current?.focus();
  }, [panelRef]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Filters"
      onKeyDown={(e) => e.key === "Escape" && props.onClose()}
      className="absolute left-0 top-full z-30 mt-2 flex w-[max(34rem,360px)] flex-col overflow-hidden rounded-md border border-border bg-surface shadow-float max-md:fixed max-md:inset-x-3 max-md:top-[max(7rem,96px)] max-md:mt-0 max-md:w-auto"
    >
      <div className="flex items-center gap-2 px-[max(1.25rem,14px)] pb-2 pt-[max(1rem,12px)]">
        <p className="text-h3 font-medium text-ink">Filters</p>
        <button
          type="button"
          onClick={() => {
            setD(ANY);
            setMore(false);
          }}
          disabled={clean}
          className="ml-auto rounded-full px-2.5 py-1 text-small font-medium text-brand hover:bg-brand-tint disabled:text-ink-3 disabled:hover:bg-transparent"
        >
          Clear all
        </button>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close filters"
          title="Close (Esc)"
          className="flex size-[max(2rem,28px)] items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="size-[45%]" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[max(1rem,12px)] overflow-y-auto px-[max(1.25rem,14px)] pb-[max(1.25rem,14px)] pt-1">
        <div className="flex flex-col gap-1.5">
          <p id={fitId} className="text-small font-medium text-ink">
            Match
          </p>
          <div role="radiogroup" aria-labelledby={fitId} className="flex gap-1 rounded-full bg-surface-2 p-1">
            {(
              [
                ["any", "Anyone matched"],
                ["strong", "Strong fit (75+)"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                ref={v === d.fit ? first : undefined}
                type="button"
                role="radio"
                aria-checked={d.fit === v}
                onClick={() => set("fit", v)}
                className={
                  "flex-1 rounded-full px-3 py-[max(0.4rem,5px)] text-small transition-colors " +
                  (d.fit === v ? "bg-surface font-medium text-ink shadow-card" : "text-ink-2 hover:text-ink")
                }
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-[max(1rem,10px)] gap-y-[max(0.9rem,10px)]">
          <Choice label="Location" value={d.city === "any" ? "" : d.city} onChange={(v) => set("city", v || "any")}>
            <option value="">Anywhere</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Choice>
          <Choice label="Notice period" value={d.notice ?? ""} onChange={(v) => set("notice", num(v))}>
            <option value="">Any</option>
            {[0, 1, 2, 3].map((m) => (
              <option key={m} value={m}>
                {noticeLabel(m)}
              </option>
            ))}
          </Choice>
          <Choice label="Minimum experience" value={d.minYears ?? ""} onChange={(v) => set("minYears", num(v))}>
            <option value="">Any</option>
            {YEARS.map((y) => (
              <option key={y} value={y} disabled={d.maxYears !== null && y > d.maxYears}>
                {y} years
              </option>
            ))}
          </Choice>
          <Choice label="Maximum experience" value={d.maxYears ?? ""} onChange={(v) => set("maxYears", num(v))}>
            <option value="">Any</option>
            {YEARS.map((y) => (
              <option key={y} value={y} disabled={d.minYears !== null && y < d.minYears}>
                {y} years
              </option>
            ))}
          </Choice>
        </div>

        <div className="flex flex-col gap-[max(0.9rem,10px)] border-t border-border pt-[max(0.9rem,10px)]">
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            className="flex items-center gap-2 self-start rounded-full text-small font-medium text-ink-2 hover:text-ink"
          >
            More filters
            {listCount > 0 && <span className="rounded-full bg-brand-soft px-2 text-caption font-medium text-brand">{listCount}</span>}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={"size-3.5 transition-transform " + (more ? "rotate-180" : "")} aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {more && (
            <div className="grid grid-cols-2 gap-x-[max(1rem,10px)] gap-y-[max(0.9rem,10px)]">
              {LISTS.map(([k, label]) => (
                <Words key={k} label={label} values={d.lists[k]} onChange={(v) => setD((x) => ({ ...x, lists: { ...x.lists, [k]: v } }))} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border px-[max(1.25rem,14px)] py-[max(0.8rem,10px)]">
        <button
          type="button"
          onClick={() => props.onApply(d)}
          className="flex h-[max(2.75rem,36px)] w-full items-center justify-center rounded-full bg-brand text-body font-medium text-white hover:bg-brand-strong"
        >
          {n === 0 ? "Show no matches" : `Show ${n} match${n === 1 ? "" : "es"}`}
        </button>
      </div>
    </div>
  );
}

/** A labelled choice, drawn as a quiet pill with its own arrow. */
function Choice(props: { label: string; value: string | number; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-small font-medium text-ink">{props.label}</span>
      <span className={"relative flex " + BOX + " " + FOCUS}>
        <select
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          className="w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent py-[max(0.5rem,6px)] pl-3.5 pr-8 text-small text-ink outline-none"
        >
          {props.children}
        </select>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </label>
  );
}

/** A list filter: type a word and press Enter (or a comma) to add it as a chip;
 *  the cross, or Backspace in an empty box, takes one off. */
function Words(props: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const add = () => {
    const t = text.trim().replace(/\s+/g, " ");
    setText("");
    if (t && !props.values.some((v) => v.toLowerCase() === t.toLowerCase())) props.onChange([...props.values, t]);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-small text-ink-2">
        {props.label}
      </label>
      {/* A press anywhere in the box puts the caret in it (the input is the keyboard way in). */}
      <div onClick={() => input.current?.focus()} className={"flex min-h-[max(2.4rem,32px)] cursor-text flex-wrap items-center gap-1 px-2 py-1 " + BOX + " " + FOCUS}>
        {props.values.map((v) => (
          <span key={v} className="flex min-w-0 max-w-full items-center gap-0.5 rounded-full bg-surface-2 py-0.5 pl-2.5 pr-0.5 text-caption text-ink-2">
            <span className="truncate" title={v}>
              {v}
            </span>
            <button
              type="button"
              onClick={() => props.onChange(props.values.filter((x) => x !== v))}
              aria-label={`Remove ${v}`}
              className="flex size-[max(1.1rem,16px)] shrink-0 items-center justify-center rounded-full opacity-60 hover:bg-surface hover:opacity-100"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="size-2.5" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={input}
          id={id}
          value={text}
          maxLength={60}
          onChange={(e) => setText(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !text && props.values.length) {
              props.onChange(props.values.slice(0, -1));
            }
          }}
          placeholder={props.values.length ? "" : "Any"}
          className="h-[max(1.6rem,22px)] min-w-[max(4rem,48px)] flex-1 bg-transparent px-1.5 text-small text-ink outline-none placeholder:text-ink-3"
        />
      </div>
    </div>
  );
}
