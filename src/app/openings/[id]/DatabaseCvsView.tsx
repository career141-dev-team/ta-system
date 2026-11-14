"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useWorkdayGate } from "@/lib/workday";
import { useSwap } from "@/lib/gsap";
import { CLAIMED, POOL, reasonOf, type Person } from "../../database/aura";
import { BackButton } from "./PipelineBoard";
import CvPages, { warmPdf } from "./CvPages";
import WorkdayBlocked from "./WorkdayBlocked";
import Toast from "./Toast";
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

type Fit = "any" | "strong";
type Notice = "any" | "month";
const JOB_Q = "SAP Business Transformation, manufacturing";

export default function DatabaseCvsView() {
  const gate = useWorkdayGate();
  const [rows, setRows] = useState<Person[]>(() => [...POOL].sort((a, b) => b.score - a.score));
  const [fit, setFit] = useState<Fit>("strong");
  const [notice, setNotice] = useState<Notice>("month");
  const [city, setCity] = useState("Colombo");
  const [pickedId, setPickedId] = useState(rows[0]?.id ?? "");
  const [matching, setMatching] = useState(false);
  const [big, setBig] = useState(false);
  const [ranAgo, setRanAgo] = useState("4 min ago");
  const [toast, setToast] = useState<{ bold?: string; rest: string; warn?: boolean; n: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const shown = rows.filter(
    (p) =>
      (fit === "any" || p.score >= 75) &&
      (notice === "any" || p.notice <= 1) &&
      (city === "any" || p.city === city),
  );
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
    leave(p);
    say("shortlisted - moved to TA Follow-Up, yours to work", p.name);
  };
  const notFor = (p: Person) => {
    if (gate) return say(gate, undefined, true);
    leave(p);
    say("will not be matched to this job again", p.name);
  };
  const rerun = () => {
    if (matching) return;
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
      if ((e.target as HTMLElement).closest("input, textarea, [role=menu]")) return;
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

  const chips = [
    fit === "strong" && { label: "Fit: strong", clear: () => setFit("any") },
    notice === "month" && { label: "Notice ≤ 1 month", clear: () => setNotice("any") },
    city !== "any" && { label: city, clear: () => setCity("any") },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col px-[max(1.5rem,14px)] pb-[max(1.25rem,12px)] pt-[max(1.4rem,14px)] max-md:pt-11">
      <div className="flex flex-wrap items-center gap-x-[max(1.25rem,12px)] gap-y-2">
        <BackButton />
        <p className="flex items-baseline gap-2 text-small text-ink-2">
          <span className="text-h2 text-ink">{rows.length}</span> matched to this job
          <span className="text-ink-3">· {open} nobody has claimed</span>
        </p>
        <button
          type="button"
          onClick={rerun}
          disabled={matching}
          title="Run matching again - it reads the approved JD"
          className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-small text-ink-2 hover:bg-surface-3 hover:text-ink disabled:cursor-default"
        >
          <span className={"size-2 rounded-full " + (matching ? "animate-pulse bg-warn" : "bg-success")} />
          {matching ? "Matching…" : `Matching finished ${ranAgo}`}
        </button>
      </div>

      {gate && <WorkdayBlocked what="shortlist candidates" className="mt-3" />}

      <div className="mt-[max(1rem,10px)] flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <span key={c.label} className="flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1.5 text-small text-ink-2">
            {c.label}
            <button
              type="button"
              onClick={c.clear}
              aria-label={`Remove ${c.label}`}
              title={`Remove ${c.label}`}
              className="flex size-[1.15rem] items-center justify-center rounded-full opacity-50 hover:bg-surface hover:opacity-100"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="size-3" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </span>
        ))}
        <FiltersMenu fit={fit} setFit={setFit} notice={notice} setNotice={setNotice} city={city} setCity={setCity} cities={[...new Set(POOL.map((p) => p.city))]} />
        <Link
          href={`/database?q=${encodeURIComponent(JOB_Q)}`}
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

        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md bg-surface-2">
          {picked ? (
            <>
              {picked.cv && (
                <button
                  type="button"
                  onClick={() => setBig(true)}
                  aria-label="Open this CV big"
                  title="Open this CV big (or double-click it)"
                  className="absolute right-3 top-3 z-10 flex size-[max(2.2rem,30px)] items-center justify-center rounded-full bg-surface text-ink shadow-float hover:bg-surface-2"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-1/2" aria-hidden="true">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                </button>
              )}
              <div ref={cv} onDoubleClick={() => picked.cv && setBig(true)} className="min-h-0 flex-1 overflow-y-auto px-[max(1.25rem,12px)] pb-[max(5.5rem,70px)] pt-[max(1.25rem,12px)]">
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
                      className="flex h-[max(2.75rem,36px)] items-center rounded-full bg-surface px-[max(1.2rem,14px)] text-body font-medium text-ink shadow-float ring-1 ring-border/60 hover:bg-surface-2"
                    >
                      Not for this job
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
        <CvPreview name={picked.name} title={`${picked.title} · ${picked.company}`} src={picked.cv} onClose={() => setBig(false)} />
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

/** "Filters": the three things the chips hold, each with Any. */
function FiltersMenu(props: {
  fit: Fit;
  setFit: (f: Fit) => void;
  notice: Notice;
  setNotice: (n: Notice) => void;
  city: string;
  setCity: (c: string) => void;
  cities: string[];
}) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const group = <T extends string>(label: string, value: T, set: (v: T) => void, options: [T, string][]) => (
    <div className="flex flex-col gap-1.5">
      <p className="text-caption font-medium uppercase text-ink-3">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="menuitemradio"
            aria-checked={value === v}
            onClick={() => set(v)}
            className={
              "rounded-full px-3 py-1 text-small transition-colors " +
              (value === v ? "bg-ink text-white" : "bg-surface-2 text-ink-2 hover:text-ink")
            }
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-small text-ink-2 hover:border-border-strong hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-3.5" aria-hidden="true">
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        Filters
      </button>
      {shown && (
        <div
          ref={panel}
          role="menu"
          className="absolute left-0 top-full z-30 mt-2 flex w-[max(18rem,240px)] flex-col gap-3 rounded-md bg-surface p-3.5 shadow-float ring-1 ring-border/60"
        >
          {group("Fit", props.fit, props.setFit, [["any", "Any"], ["strong", "Strong (75+)"]])}
          {group("Notice", props.notice, props.setNotice, [["any", "Any"], ["month", "1 month or less"]])}
          {group("Location", props.city, props.setCity, [["any", "Anywhere"], ...props.cities.map((c) => [c, c] as [string, string])])}
        </div>
      )}
    </div>
  );
}
