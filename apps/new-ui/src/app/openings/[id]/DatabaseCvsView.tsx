"use client";

import { ViewSkeleton } from "@/app/Skeleton";
import { door, jobFromAddress, useDoorMutation, useDoorQuery, useLive, type Answer, type DoorDone, cvUrl, OLD_SERVER, saveLiveFile, candidateCall } from "@/lib/backend";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useWorkdayGate } from "@/lib/workday";
import { useSpeech } from "@/lib/useSpeech";
import ListenPulse from "../../ListenPulse";
import { DUR, EASE, gsap, popPanel, useSwap } from "@/lib/gsap";
import { CLAIMED, POOL, fitOf, reasonOf, type Person } from "../../database/aura";
import AuraBarGlow from "@/app/AuraBarGlow";
import Count from "@/app/Count";
import { BackButton } from "./PipelineBoard";
import CvPages, { warmPdf } from "./CvPages";
import WorkdayBlocked from "./WorkdayBlocked";
import Toast from "./Toast";
import { sendToPipeline } from "./pipelineInbox";
import { useJdApproved, getJd } from "./jdState";

// ATS · Database CVs - matches from the whole database (owner's design, 14 Nov 2026).
// The old tab's rules (database-search skill §10, §13): matching reads the approved
// JD and keeps a standing list; a match is only a suggestion until a TA shortlists
// it, which claims them (another TA's claim locks the row); "Not for this job" keeps
// them out of later rounds; "Search the whole database" opens the Database chat on
// this job. Sample people from the Database screen - nothing reads the backend yet.
// Merged 14 Nov with shane123-tech's feat/database-cvs-screen: his Figma score ring
// (713:1660), the big count, the CV read ahead on hover, "Open this CV big" and the
// workday line came from there.

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

type DoorMatches = Answer<{
  results: { cvId: string; overallScore: number; name: string; title: string | null; company: string | null; location: string | null; years: number | null; noticeDays: number | null; jobs?: { title: string | null; company: string | null; startDate: string | null; endDate: string | null }[] }[];
}>;

/** "2020 – Now", "2016 – 2020", or one year. The CV's own dates are free text, so only the year is read. */
function periodOf(start: string | null, end: string | null): string {
  const year = (s: string | null) => s?.match(/(?:19|20)\d{2}/)?.[0] ?? "";
  const from = year(start);
  const to = !end?.trim() || /present|current|now|ongoing|date/i.test(end) ? "Now" : year(end);
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from || to;
}

export default function DatabaseCvsView() {
  const gate = useWorkdayGate();
  const jdApproved = useJdApproved();
  const live = useLive();
  const job = live ? jobFromAddress() : null;
  const [rows, setRows] = useState<Person[]>(() => (live ? [] : [...POOL].sort((a, b) => b.score - a.score)));
  // Live: the opening's real matches (ui/opening:matches), best first; anyone taken
  // off with "Not for this job" is already left out by the backend.
  const real = useDoorQuery(door.matches, job ? { openingId: job } : "skip") as DoorMatches | undefined;
  const [seenReal, setSeenReal] = useState<DoorMatches | undefined>(undefined);
  if (real !== seenReal) {
    setSeenReal(real);
    if (real?.ok)
      setRows(
        real.results.map((m) => ({
          id: m.cvId, cv: cvUrl({ candidate: m.cvId }), name: m.name, title: m.title ?? "", company: m.company ?? "", city: m.location ?? "",
          years: m.years ?? 0, notice: m.noticeDays == null ? 0 : Math.round(m.noticeDays / 30), tags: [], score: Math.round(m.overallScore),
          // No history on the CV: leave it out and the row shows the current job as "Now".
          career: m.jobs?.length ? m.jobs.map((j) => ({ period: periodOf(j.startDate, j.endDate), title: j.title ?? "", company: j.company ?? "" })) : undefined,
        })),
      );
  }
  const notForJob = useDoorMutation(door.notForJob);
  const rerunLive = useDoorMutation(door.rerunMatching);
  // Real matches start unfiltered: the design's sample filters would hide most of them.
  const [f, setF] = useState<Filters>(live ? { ...ANY } : { ...ANY, fit: "strong", notice: 1, city: "Colombo" });
  const [fOpen, setFOpen] = useState(false);
  const fBtn = useRef<HTMLButtonElement>(null);
  const [pickedId, setPickedId] = useState(rows[0]?.id ?? "");
  const [matching, setMatching] = useState(false);
  // The CV and details panel that slides in from the right when a row is clicked.
  const [panel, setPanel] = useState(false);
  const panelEl = useRef<HTMLElement>(null);
  // The AURA bar: what is typed, and the words the list is narrowed by.
  const [ask, setAsk] = useState("");
  const mic = useSpeech((t) => setAsk((x) => (x ? x + " " : "") + t));
  const [asked, setAsked] = useState("");
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

  // shortcut: the words are looked for in the record's text, not understood; with the backend AURA reads them.
  const words = asked.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows
    .filter(keep(f))
    .filter((p) => {
      const all = [p.name, p.title, p.company, p.city, ...p.tags, ...(p.career ?? []).flatMap((x) => [x.title, x.company])].join(" ").toLowerCase();
      return words.every((w) => all.includes(w));
    });
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
    if (live && job) {
      // The old Database CVs "Shortlist" (addToOpening, D7): claims them on this job,
      // into TA Follow-Up; another TA's claim is refused with their name.
      void candidateCall({ do: "shortlistMatch", candidateId: p.id, openingId: job }).then((r) => {
        if (!r.ok) return say(r.message, undefined, true);
        leave(p);
        say(` ${r.message}`, p.name);
      });
      return;
    }
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
    if (job) {
      // Saved for good in the backend, so there is no Undo here.
      void (notForJob({ openingId: job, candidateId: p.id }) as Promise<DoorDone | undefined>).then((done) => {
        if (done && !done.ok) return say(done.message, undefined, true);
        leave(p);
        say(" taken off this job's matches.", p.name);
      });
      return;
    }
    leave(p);
    setUndo(p);
  };
  const rerun = () => {
    if (matching) return;
    // Live: the real engine run (ui/opening:rerunMatching, 25 Nov); the list follows by itself when it saves.
    if (live) {
      setMatching(true);
      void (rerunLive({ openingId: job! }) as Promise<DoorDone | undefined>).then(
        (r) => {
          say(r?.message ?? "Matching could not start. Try again.", undefined, !r?.ok);
          timer.current = setTimeout(() => setMatching(false), r?.ok ? 90_000 : 0);
        },
        () => {
          setMatching(false);
          say("Matching could not start. Try again.", undefined, true);
        },
      );
      return;
    }
    // Matching reads the approved JD; the TA System refuses it before approval.
    if (!jdApproved) return say("Approve the job description first - matching reads it.", undefined, true);
    setMatching(true);
    // ponytail: a stand-in wait; with the backend this is the reverse match.
    timer.current = setTimeout(() => {
      setMatching(false);
      setRanAgo("just now");
    }, 2500);
  };

  // While this view is on screen: up and down move along the list, S shortlists, X takes
  // them off, Space opens the CV and Esc closes it (the hints under the list).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!root.current?.offsetParent || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [role=menu]") || (t.closest("[role=dialog]") && !t.closest("aside"))) return;
      const k = e.key.toLowerCase();
      if (k === "escape" && panel) {
        e.preventDefault();
        setPanel(false);
      } else if (k === "arrowdown" || k === "arrowup") {
        const i = shown.findIndex((p) => p.id === picked?.id);
        const next = shown[i + (k === "arrowdown" ? 1 : -1)];
        if (!next) return;
        e.preventDefault();
        setPickedId(next.id);
        root.current.querySelector(`[data-row="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
      } else if (picked && k === "s") shortlist(picked);
      else if (picked && k === "x") notFor(picked);
      else if (picked && k === " " && !t.closest("button, a")) {
        e.preventDefault();
        setPanel((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // shortlist and notFor are rebuilt every render and read the same state as these two.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, picked, panel, sure, rows, gate]);

  // The panel slides in from the right with a little overshoot, then its parts settle in.
  useLayoutEffect(() => {
    const el = panelEl.current;
    if (!panel || !el) return;
    popPanel(el);
  }, [panel]);

  // Each chip clears with a functional update, so "Clear the filters" can run them all.
  const years =
    f.minYears !== null && f.maxYears !== null
      ? `${f.minYears}–${f.maxYears} years`
      : f.minYears !== null
        ? `${f.minYears}+ years`
        : `Up to ${f.maxYears} years`;
  const chips = [
    asked && { label: `AURA: ${asked}`, clear: () => setAsked("") },
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

  const idx = picked ? shown.indexOf(picked) : -1;
  const step = (d: number) => {
    const n = shown[idx + d];
    if (n) setPickedId(n.id);
  };
  const tick = (ok: boolean) => <FitTick ok={ok} />;
  const pill = "flex h-[2.23rem] shrink-0 items-center justify-center rounded-full px-[1.14rem] text-[max(0.8395rem,11.5px)] font-medium";
  const keyHint = "rounded-xs bg-white/15 px-1.5 py-0.5 text-caption font-medium text-white";

  // Still reading this opening: a skeleton of the view, never an empty list that looks final (19 Nov).
  if (job && real === undefined) return <ViewSkeleton />;
  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col px-[max(1.5rem,14px)] pb-[max(1.25rem,12px)] pt-[max(1.4rem,14px)] max-md:pt-11 md:max-[1400px]:pt-[max(3.4rem,34px)]">
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
          className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-small text-ink-2 hover:bg-surface-3 hover:text-ink disabled:cursor-default"
        >
          <span className={"size-2 rounded-full " + (matching ? "animate-pulse bg-warn" : "bg-success")} />
          {matching ? "Matching…" : `Matching finished ${ranAgo}`}
        </button>
        <div className="flex items-center gap-2 md:ml-auto">
          <button
            ref={fBtn}
            type="button"
            onClick={() => setFOpen((v) => !v)}
            aria-expanded={fOpen}
            className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-small font-medium text-ink hover:border-border-strong aria-expanded:border-border-strong aria-expanded:bg-surface-2"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-3.5" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Filters
          </button>
          <Link
            href={`/database?for=${encodeURIComponent(getJd().title)}`}
            className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-small font-medium text-ink hover:border-border-strong"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
              <ellipse cx="12" cy="5.5" rx="8" ry="3" />
              <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
            </svg>
            Search the whole database
          </Link>
        </div>
      </div>

      {gate && <WorkdayBlocked what="shortlist candidates" className="mt-3" />}

      {chips.length > 0 && (
        <div className="mt-[max(0.9rem,10px)] flex flex-wrap items-center gap-2">
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
        </div>
      )}

      <div className="relative mt-[max(1rem,10px)] flex min-h-0 flex-1 gap-[max(1.25rem,12px)] max-md:flex-col">
        {/* The filters slide in from the left edge; the list gives way. */}
        {fOpen && (
          <FiltersPanel
            applied={f}
            rows={rows}
            onClose={() => {
              setFOpen(false);
              fBtn.current?.focus();
            }}
            onApply={(d) => {
              setF(d);
              setFOpen(false);
              fBtn.current?.focus();
            }}
          />
        )}
        {/* One row per person (owner's Figma 1515:7533): score, who, career, why. */}
        <ul aria-label="Matches" className="flex min-w-0 flex-1 flex-col overflow-y-auto">
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
            const career = p.career ?? [{ period: "Now", title: p.title, company: p.company }];
            const bits = reasonOf(p).split(" · ");
            const fit = [...bits.slice(0, -2).map((t) => ({ ok: true, t })), { ok: true, t: `${p.years} years of experience` }, { ok: p.notice <= 1, t: bits[bits.length - 1] }].slice(0, 3);
            return (
              <li key={p.id} className="group relative border-b border-border last:border-0">
                <button
                  type="button"
                  data-row={p.id}
                  onClick={() => {
                    setPickedId(p.id);
                    setPanel(true);
                  }}
                  // The CV is read ahead while the pointer is on its way, so it opens at once.
                  onPointerEnter={() => p.cv && warmPdf(p.cv)}
                  aria-current={on ? "true" : undefined}
                  className={
                    "grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,0.3fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-[max(1rem,10px)] rounded-md py-4 pl-7 pr-[max(11rem,120px)] text-left transition-colors max-xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] max-xl:[&>:nth-child(2)]:hidden max-xl:[&>:nth-child(4)]:hidden max-md:grid-cols-1 " +
                    (on ? "bg-canvas" : "hover:bg-canvas/60")
                  }
                >
                  <span className="flex min-w-0 items-center gap-4">
                    <Ring score={p.score} />
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-h3 font-medium text-ink">{p.name}</span>
                        {CLAIMED[p.id] && (
                          <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-caption text-ink-2">{CLAIMED[p.id]}&apos;s</span>
                        )}
                      </span>
                      <span className="truncate text-small text-ink-3">
                        {p.years} years · {p.city}
                      </span>
                    </span>
                  </span>
                  <span className="flex flex-col gap-1.5 text-small max-md:hidden">
                    {career.map((c, i) => (
                      <span key={i} className={"truncate " + (i === 0 ? "font-medium text-brand" : "text-ink-3")}>
                        {c.period}
                      </span>
                    ))}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1.5 text-small max-md:mt-2">
                    {career.map((c, i) => (
                      <span key={i} className="truncate text-ink">
                        {c.title} <span className="ml-1 text-ink-3">{c.company}</span>
                      </span>
                    ))}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1.5 text-small text-ink-2 max-md:hidden">
                    {fit.map((x) => (
                      <span key={x.t} className="flex items-center gap-2">
                        {tick(x.ok)}
                        <span className="truncate">{x.t}</span>
                      </span>
                    ))}
                  </span>
                </button>
                {/* Shown on the picked row and on hover; a tap picks the row first on a phone. */}
                {!CLAIMED[p.id] && (
                  <div className={"absolute right-7 top-1/2 flex -translate-y-1/2 items-center gap-2 " + (on ? "" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100")}>
                    <button
                      type="button"
                      onClick={() => notFor(p)}
                      onBlur={() => setSure("")}
                      aria-label={sure === p.id ? "Press again to take them off" : "Not for this job"}
                      title={sure === p.id ? "Press again to take them off" : "Not for this job (X)"}
                      className={"flex size-[max(2.6rem,34px)] items-center justify-center rounded-full border " + (sure === p.id ? "border-danger/40 bg-danger-soft text-danger" : "border-border-strong bg-surface text-ink-2 hover:bg-surface-2")}
                    >
                      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" aria-hidden="true">
                        <path d="M12 4 4 12M4 4l8 8" />
                      </svg>
                    </button>
                    <button type="button" onClick={() => shortlist(p)} title="Shortlist (S)" className="flex h-[max(2.6rem,34px)] items-center rounded-full bg-brand px-5 text-small font-medium text-white hover:bg-brand-strong">
                      Shortlist
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* The CV and details slide in from the right over the list (owner's Figma 1515:7813,
            "CV peek", 728 wide at 1920; every size below is that frame's). */}
        {panel && picked && (
          <aside
            ref={panelEl}
            role="dialog"
            aria-label={`${picked.name}'s CV`}
            className="absolute inset-y-0 right-0 z-20 flex w-[min(54rem,100%)] flex-col gap-[0.725rem] rounded-[1.45rem] border border-border bg-surface p-[1.036rem] shadow-float max-md:fixed max-md:inset-3 max-md:w-auto"
          >
            <div className="flex shrink-0 items-center gap-[0.62rem]">
              <span className="flex size-[2.487rem] shrink-0 items-center justify-center rounded-full bg-info-soft text-[max(0.7875rem,11px)] font-medium text-info">
                {picked.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
              </span>
              <div className="flex min-w-0 flex-col">
                <p className="truncate text-[max(1.036rem,13px)] font-medium text-ink">{picked.name}</p>
                <p className="truncate text-[max(0.7875rem,11px)] text-ink-2">
                  {picked.title} · {picked.company} · {picked.years} yrs
                </p>
              </div>
              <span className="shrink-0 rounded-[0.52rem] bg-brand-soft px-[0.415rem] py-[0.1rem] text-[max(0.7875rem,11px)] text-brand">{picked.score}</span>
              <span className="ml-auto shrink-0 text-[max(0.7365rem,11px)] text-ink-3">
                {idx + 1} of {shown.length}
              </span>
              {(
                [
                  ["Previous", -1, "m10 3-5 5 5 5"],
                  ["Next", 1, "m6 3 5 5-5 5"],
                ] as const
              ).map(([l, d, path]) => (
                <button
                  key={l}
                  type="button"
                  disabled={!shown[idx + d]}
                  onClick={() => step(d)}
                  aria-label={l}
                  title={`${l} (${d < 0 ? "↑" : "↓"})`}
                  className="flex size-[2.07rem] shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-ink-2 hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-surface"
                >
                  <svg viewBox="0 0 16 16" className="size-[0.83rem]" fill="none" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={path} />
                  </svg>
                </button>
              ))}
              <button
                type="button"
                autoFocus
                onClick={() => setPanel(false)}
                aria-label="Close CV"
                title="Close (Esc)"
                className="flex size-[2.07rem] shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-ink-2 hover:bg-surface-2"
              >
                <svg viewBox="0 0 16 16" className="size-[0.83rem]" fill="none" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 4 4 12M4 4l8 8" />
                </svg>
              </button>
            </div>
            <p className="flex shrink-0 items-center gap-[0.62rem] rounded-[0.93rem] bg-brand-tint px-[0.83rem] py-[0.62rem] text-[max(0.7875rem,11px)] font-medium text-ink">
              <Image src="/aura-mark.png" alt="" width={24} height={24} className="size-[1.45rem] shrink-0 rounded-full bg-black" />
              {fitOf(picked.score)} fit. {reasonOf(picked)}.
            </p>
            <div ref={cv} className="min-h-0 flex-1 overflow-y-auto rounded-[0.725rem] border border-border bg-surface">
              {picked.cv ? (
                <CvPages key={picked.cv} src={picked.cv} fit="width" />
              ) : (
                <p className="pt-[15vh] text-center text-body text-ink-3">No CV file on record for {picked.name.split(" ")[0]}.</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-[0.52rem]">
              {picked.cv && (
                <a href={picked.cv} download onClick={(e) => { if (picked.cv?.startsWith(OLD_SERVER)) { e.preventDefault(); void saveLiveFile(picked.cv, `${picked.name} - CV.pdf`); } }} className={pill + " gap-[0.415rem] border border-border-strong bg-surface text-ink hover:bg-surface-2"}>
                  <svg viewBox="0 0 12 12" className="size-[0.725rem] text-ink-2" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 1.5v6M3.4 5.4 6 8l2.6-2.6M1.8 10h8.4" />
                  </svg>
                  Download
                </a>
              )}
              {CLAIMED[picked.id] ? (
                <p className="ml-auto text-small text-ink-2">
                  {CLAIMED[picked.id]} already claimed {picked.name.split(" ")[0]}
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => notFor(picked)}
                    onBlur={() => setSure("")}
                    className={pill + " ml-auto border " + (sure === picked.id ? "border-danger/40 bg-danger-soft text-danger" : "border-border-strong bg-surface text-ink hover:bg-surface-2")}
                  >
                    {sure === picked.id ? "Press again to take them off" : "Not for this job"}
                  </button>
                  <button type="button" onClick={() => shortlist(picked)} className={pill + " bg-brand text-white hover:bg-brand-strong"}>
                    Shortlist
                  </button>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* The AURA bar and the key hints (Figma 1515:7783 / 1515:7533): ask AURA in words to
          narrow the list; Enter keeps the people whose record has all the words. */}
      <div className="relative isolate mt-3 flex shrink-0 flex-wrap items-center justify-center gap-5">
        <AuraBarGlow />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = ask.trim();
            if (!t) return;
            setAsked(t);
            setAsk("");
          }}
          className="flex h-[3.75rem] w-[min(40rem,100%)] items-center gap-3 rounded-full border-[1.5px] border-transparent bg-[linear-gradient(white,white),linear-gradient(90deg,var(--color-aura-1),var(--color-aura-2),var(--color-aura-3),var(--color-aura-4))] [background-clip:padding-box,border-box] [background-origin:border-box] py-2 pl-2.5 pr-2 shadow-float"
        >
          <Image src="/aura-mark.png" alt="" width={40} height={40} className="size-10 shrink-0 rounded-full bg-black" />
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="Type or speak — ask AURA to narrow the list"
            aria-label="Ask AURA to narrow the list"
            className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
          />
          <button type="button" disabled title="Chat with AURA opens here once it is wired to the backend" aria-label="Open chat" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 opacity-60">
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.33" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z" />
            </svg>
          </button>
          <button type="button" disabled={!mic.ok} onClick={mic.toggle} aria-pressed={mic.on} title={mic.ok ? (mic.on ? "Stop listening" : "Speak") : "Speaking is not available in this browser"} aria-label={mic.on ? "Stop listening" : "Speak"} className={"relative flex size-5 shrink-0 items-center justify-center disabled:opacity-40 " + (mic.on ? "text-danger" : "text-ink-2 hover:text-ink")}>
            {mic.on && <ListenPulse />}
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <rect x="7.5" y="2.5" width="5" height="10" rx="2.5" />
              <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
            </svg>
          </button>
          <button disabled={!ask.trim()} aria-label="Send" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-white hover:bg-ink/85 disabled:opacity-40">
            <svg viewBox="0 0 18 18" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 15V3M3.8 8.2 9 3l5.2 5.2" />
            </svg>
          </button>
        </form>
        {/* The keys only do something with people in the list (owner, 20 Nov 2026: the box showed on an empty one). */}
        {shown.length > 0 && <p className="flex items-center gap-4 rounded-full bg-ink px-5 py-3 text-small text-white max-md:hidden">
          <span className="flex items-center gap-2"><kbd className={keyHint}>↑ ↓</kbd> move</span>
          <span className="flex items-center gap-2"><kbd className={keyHint}>S</kbd> shortlist</span>
          <span className="flex items-center gap-2"><kbd className={keyHint}>X</kbd> not for this job</span>
          <span className="flex items-center gap-2"><kbd className={keyHint}>Space</kbd> open the CV</span>
        </p>}
      </div>
      {undo && (
        <div role="status" className="fixed bottom-[max(4rem,48px)] left-1/2 z-[90] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-[max(1.3rem,14px)] py-[max(0.7rem,8px)] text-[max(0.9125rem,13.5px)] text-white shadow-float">
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
export function FitTick({ ok }: { ok: boolean }) {
  return (
    <span aria-hidden="true" className={"flex size-[1.05rem] shrink-0 items-center justify-center rounded-full " + (ok ? "bg-success-soft text-success" : "bg-warn-soft text-warn")}>
      <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={ok ? "m2.5 6.2 2.3 2.3 4.7-4.9" : "M3 6h6"} />
      </svg>
    </span>
  );
}

export function Ring({ score }: { score: number }) {
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

const BOX = "rounded-lg border border-border bg-surface hover:border-border-strong";
const FOCUS = "focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30";

function FiltersPanel(props: {
  applied: Filters;
  rows: Person[];
  onClose: () => void;
  onApply: (f: Filters) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
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

  // Slides in from the left, pushing the list and the CV over.
  useLayoutEffect(() => {
    if (panelRef.current) gsap.from(panelRef.current, { width: 0, opacity: 0, duration: DUR.base, ease: EASE.out, clearProps: "width,opacity" });
    first.current?.focus();
  }, []);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Filters"
      onKeyDown={(e) => e.key === "Escape" && props.onClose()}
      className="flex w-[max(24rem,300px)] shrink-0 flex-col overflow-hidden rounded-md border border-border bg-surface max-md:max-h-[60%] max-md:w-auto"
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
