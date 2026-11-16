"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { DUR, EASE, gsap, useExit, useGSAP, swapIn, useSwap } from "@/lib/gsap";
import { BackButton } from "./PipelineBoard";
import CvPages, { warmPdf } from "./CvPages";
import PillMenu, { type MenuOption } from "./PillMenu";
import Toast from "./Toast";
import { sendToPipeline } from "./pipelineInbox";
import { EXPERIENCE, NOTICE, inRange } from "./filters";
import WorkdayBlocked from "./WorkdayBlocked";
import { useWorkdayGate } from "@/lib/workday";

const CvPreview = dynamic(() => import("./CvPreview"), { ssr: false });

/** One scoop: a CV a Director, TA Lead or Ops person sent a TA for this opening.
 *  Placeholder data (made-up people, fake contacts). With the backend the list is one
 *  small page of this opening's scoops, and a CV file is fetched only when that
 *  candidate is opened - never the whole list's CVs at once. */
type Scoop = {
  id: string;
  name: string;
  title: string;
  location: string;
  company: string;
  /** The CV file to show: a PDF address, or nothing for a Word CV not read yet. */
  cv?: string;
  /** Who sent it (first name) and when it came, for the row's chip. */
  sentBy?: string;
  sentDay: string;
  years: number;
  /** Notice period in days; 0 = can start now. */
  notice: number;
  /** I shortlisted this person: the row stays, marked "Shortlisted by you". */
  mine?: boolean;
  /** Another TA shortlisted this person first (the collision lock): their first name. */
  lockedBy?: string;
};

const SCOOPS: Scoop[] = [
  { id: "s1", cv: "/cvs/s1.pdf", name: "Nadeeka Dilshan", title: "Assistant Manager, Production", location: "Colombo", company: "Croydon Kowloon Designs", sentBy: "Shehan", sentDay: "today", years: 6, notice: 30 },
  { id: "s2", cv: "/cvs/s2.pdf", name: "Kasun Perera", title: "Production Supervisor", location: "Gampaha", company: "Brandix Lanka Ltd", sentBy: "Shehan", sentDay: "today", years: 9, notice: 60 },
  { id: "s3", cv: "/cvs/s3.pdf", name: "Ishara Fernando", title: "Assistant Manager, Production", location: "Colombo", company: "MAS Holdings", sentBy: "Rashmi", sentDay: "yesterday", years: 11, notice: 90, mine: true },
  { id: "s4", cv: "/cvs/s4.pdf", name: "Tharindu Silva", title: "Planning Executive", location: "Kandy", company: "Hirdaramani Group", sentBy: "Rashmi", sentDay: "yesterday", years: 4, notice: 30 },
  { id: "s5", cv: "/cvs/s5.pdf", name: "Dilani Jayasinghe", title: "Quality Assurance Lead", location: "Negombo", company: "Teejay Lanka PLC", sentBy: "Dinesh", sentDay: "2 days ago", years: 5, notice: 0, lockedBy: "Hasini" },
  { id: "s6", cv: "/cvs/s6.pdf", name: "Ruwan Bandara", title: "Assistant Manager, Production", location: "Colombo", company: "Croydon Kowloon Designs", sentDay: "2 days ago", years: 2, notice: 0 },
];

// Placeholder: who may have sent a scoop - the TA System lists the active Directors,
// TA Leads and Ops people, plus "Not said" (sending is optional). With the backend
// the set number also comes back from the shortlist itself.
const SENDERS: MenuOption[] = [
  { value: "", label: "Not said" },
  { value: "Shehan", label: "Shehan Fernando (Director)" },
  { value: "Rashmi", label: "Rashmi Perera (TA Lead)" },
  { value: "Dinesh", label: "Dinesh Kumar (Ops)" },
];
const OPEN_SET = 3;

// Placeholder for the TA System's access rule: upload and Shortlist only for people
// who can act on this opening (`opening.act`: the TAs on it, TA Leads, the Director,
// Ops, admin). A viewer reads the list and the CVs, nothing more.
const CAN_ACT = true;

// The TA System's own limits for a scoop upload (ScoopUpload.tsx).
const MAX_FILES = 10;
const MAX_BYTES = 10 * 1048576;
const CV_FILE = /\.(pdf|docx?)$/i;

const WHO: MenuOption[] = [
  { value: "", label: "All candidates" },
  { value: "open", label: "Not shortlisted yet" },
  { value: "mine", label: "Shortlisted by you" },
  { value: "today", label: "Sent today" },
];

type Filters = { q: string; exp: string; notice: string; who: string };
const NO_FILTERS: Filters = { q: "", exp: "", notice: "", who: "" };

function matches(s: Scoop, f: Filters) {
  const q = f.q.trim().toLowerCase();
  if (q && ![s.name, s.title, s.company].some((t) => t.toLowerCase().includes(q))) return false;
  if (!inRange(s.years, f.exp) || !inRange(s.notice, f.notice)) return false;
  if (f.who === "open") return !s.mine && !s.lockedBy;
  if (f.who === "mine") return !!s.mine;
  if (f.who === "today") return s.sentDay === "today";
  return true;
}

const free = (s: Scoop) => CAN_ACT && !s.mine && !s.lockedBy;

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

type Upload = { id: string; file: string; url?: string; bad?: boolean; state: "reading" | "done" | "failed"; sentBy?: string };

/** Scoops, as the TA System has it: the counts, the upload panel (only for people who
 *  can act on the opening), and every scoop on the opening with Shortlist. Clicking a
 *  row opens the reading view - the list on the left, that CV on the right - and Back
 *  returns to the list. Shortlisted rows stay, marked, as in the TA System. */
export default function ScoopsView() {
  const [list, setList] = useState(SCOOPS);
  const [mode, setMode] = useState<"list" | "read">("list");
  const [chosen, setChosen] = useState(SCOOPS[0].id);
  const [picked, setPicked] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ bold?: string; rest: string; n: number; warn?: boolean } | null>(null);
  const [sentBy, setSentBy] = useState("");
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const seq = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const root = useRef<HTMLDivElement>(null);
  // The scoop whose CV is open big in the viewer, if any.
  const [reading, setReading] = useState<Scoop | null>(null);
  const [readingOpen, setReadingOpen] = useState(false);
  const cvBox = useRef<HTMLDivElement>(null);
  const readingShown = useExit(readingOpen, cvBox, { opacity: 0 });

  // The workday gate: a TA uploads and shortlists only once today's workday is
  // started (FLOW-CHECK 4.4). Empty when work is allowed.
  const gate = useWorkdayGate();
  const say = (rest: string, bold?: string, warn?: boolean) => setNotice((n) => ({ bold, rest, warn, n: (n?.n ?? 0) + 1 }));
  const shown = list.filter((s) => matches(s, applied));
  const current = shown.find((s) => s.id === chosen) ?? shown[0];
  const open = list.filter((s) => !s.mine && !s.lockedBy).length;

  // The next scoop's CV is opened ahead, so moving down the list shows it at once.
  const nextCv = mode === "read" && current ? shown[shown.indexOf(current) + 1]?.cv : undefined;
  useEffect(() => {
    if (nextCv) warmPdf(nextCv);
  }, [nextCv]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // List <-> reading view, and one CV to the next: the app's one switch (swapIn).
  useSwap(root, mode);
  useGSAP(
    () => {
      if (mode === "read") swapIn("[data-scoop-cv]");
    },
    { dependencies: [chosen], scope: root, revertOnUpdate: false },
  );

  // The reading bar: filled by the share read so far, never quite full while any
  // CV is still being read.
  const readingNow = uploads.filter((u) => u.state === "reading").length;
  const finished = uploads.length - readingNow;
  useGSAP(
    () => {
      const bar = root.current?.querySelector("[data-read-bar]");
      if (bar) gsap.to(bar, { scaleX: readingNow ? Math.max(0.12, (finished / uploads.length) * 0.9 + 0.08) : 1, duration: DUR.slow, ease: EASE.out });
    },
    { dependencies: [readingNow, finished, uploads.length], scope: root, revertOnUpdate: false },
  );

  // A CV dropped beside the panel must not make the browser open the file.
  useEffect(() => {
    const stop = (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);

  // Reading view: up and down move through the list, Escape goes back to it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (mode !== "read" || readingOpen) return;
      // Scoops stays alive while another view is on screen; hidden, it takes no keys.
      if (!root.current?.offsetParent) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") return setMode("list");
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const i = shown.findIndex((s) => s.id === current?.id);
      const next = shown[Math.max(0, Math.min(shown.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
      if (next) {
        setChosen(next.id);
        root.current?.querySelector(`[data-scoop-row="${next.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [mode, shown, current, readingOpen]);

  const openRow = (id: string) => {
    setChosen(id);
    setMode("read");
  };

  // Shortlist claims the candidate for this TA, gives the set number and moves them
  // to TA Follow-Up (FLOW-CHECK 4.1). The row stays, marked "Shortlisted by you".
  const shortlist = (ids: string[]) => {
    const take = list.filter((s) => ids.includes(s.id) && free(s));
    if (!take.length) return;
    if (gate) return say(gate + " Start it on Today, then shortlist.", undefined, true);
    setList((l) => l.map((s) => (take.includes(s) ? { ...s, mine: true } : s)));
    // They show on the Pipeline board, in TA Follow-Up.
    take.forEach((s) => sendToPipeline({ name: s.name, title: s.title, company: s.company, location: s.location, years: s.years, notice: s.notice, cv: s.cv }));
    setPicked((p) => p.filter((x) => !ids.includes(x)));
    const rest = ` shortlisted as set ${OPEN_SET} - moved to TA Follow-Up`;
    if (take.length === 1) say(rest, take[0].name);
    else say(rest, `${take.length} candidates`);
  };

  // In the reading view, Shortlist moves on to the next one still open.
  const shortlistCurrent = () => {
    if (!current) return;
    shortlist([current.id]);
    const i = shown.indexOf(current);
    const next = [...shown.slice(i + 1), ...shown.slice(0, i)].find(free);
    if (next) setChosen(next.id);
  };

  // A CV takes a moment to be read; one in a while fails (sample: an empty file).
  // ponytail: stand-in timers until the backend takes the upload; then the bar
  // follows the real reading queue (GET /api/scoops/upload every 4 s).
  const read = (u: Upload) => {
    timers.current.push(
      setTimeout(() => {
        if (u.bad) {
          setUploads((all) => all.map((x) => (x.id === u.id ? { ...x, state: "failed" } : x)));
          return;
        }
        setUploads((all) => all.map((x) => (x.id === u.id ? { ...x, state: "done" } : x)));
        const scoop: Scoop = {
          id: u.id,
          name: nameFromFile(u.file),
          title: "New CV - being read",
          location: "Not read yet",
          company: "Not read yet",
          cv: u.url,
          sentBy: u.sentBy,
          sentDay: "today",
          years: 0,
          notice: 0,
        };
        setList((l) => [scoop, ...l]);
      }, 1800 + (Number(u.id.slice(2)) % 4) * 700),
    );
  };

  // CV files picked or dropped. The TA System's limits: PDF or Word, up to 10 MB
  // each, 10 at a time (FLOW-CHECK 4.7).
  const addFiles = (files: FileList | File[]) => {
    if (!CAN_ACT) return;
    if (gate) return say(gate + " Start it on Today, then upload scoops.", undefined, true);
    const all = Array.from(files);
    const fits = all.filter((f) => CV_FILE.test(f.name) && f.size <= MAX_BYTES);
    const ok = fits.slice(0, MAX_FILES);
    const left = all.length - fits.length;
    if (fits.length > MAX_FILES) say(`Up to ${MAX_FILES} CVs at a time. The first ${MAX_FILES} were taken.`, undefined, true);
    else if (left > 0) say((left === 1 ? " file" : " files") + " left out - only PDF or Word CVs, up to 10 MB", String(left), true);
    if (!ok.length) return;
    const added = ok.map<Upload>((f) => ({
      id: "up" + ++seq.current,
      file: f.name,
      // A PDF is shown straight from the file picked; a Word CV waits to be read.
      url: /\.pdf$/i.test(f.name) ? URL.createObjectURL(f) : undefined,
      // An empty file cannot be read: it ends as "Could not be read" (4.3).
      bad: f.size === 0,
      state: "reading",
      sentBy: sentBy || undefined,
    }));
    setUploads((u) => [...u, ...added]);
    added.forEach(read);
  };

  const retry = (u: Upload) => {
    const again = { ...u, bad: false, state: "reading" as const };
    setUploads((all) => all.map((x) => (x.id === u.id ? again : x)));
    read(again);
  };

  const isFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const dropZone = {
    onDragEnter: (e: React.DragEvent) => {
      if (!isFiles(e)) return;
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!isFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
  };

  const pick = () => fileInput.current?.click();
  const failed = uploads.filter((u) => u.state === "failed");
  const mins = Math.max(1, Math.ceil(readingNow / 3));
  const pickable = picked.filter((id) => list.some((s) => s.id === id && free(s)));

  return (
    <div
      ref={root}
      {...(mode === "list" ? dropZone : {})}
      className="flex min-h-0 flex-1 flex-col px-[max(2.2rem,14px)] pb-[max(1.4rem,12px)] pt-[max(1.6rem,14px)] max-md:pt-11"
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".pdf,.doc,.docx"
        hidden
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Back, the TA System's two counts, and Shortlist selected. */}
      <div data-scoop-top className="flex flex-wrap items-center gap-x-[max(1.4rem,12px)] gap-y-2">
        {mode === "list" ? <BackButton /> : <BackButton onClick={() => setMode("list")} label="Back to the scoops list" />}
        <Count n={list.length} label="scoops on this job" />
        <Count n={open} label="not shortlisted yet" />
        {mode === "list" && CAN_ACT && (
          <button
            type="button"
            disabled={!pickable.length}
            onClick={() => shortlist(pickable)}
            className="ml-auto h-[max(2.6rem,34px)] rounded-full border border-border bg-white px-[max(1.3rem,14px)] text-[max(0.9rem,12.5px)] font-medium text-ink transition-colors hover:border-brand hover:bg-brand hover:text-white disabled:pointer-events-none disabled:opacity-50"
          >
            Shortlist selected{pickable.length ? ` (${pickable.length})` : ""}
          </button>
        )}
      </div>

      {mode === "list" ? (
        <>
          {CAN_ACT && gate && <WorkdayBlocked what="upload or shortlist scoops" className="mt-[max(1.8rem,12px)]" />}
          {CAN_ACT && !gate && (
            <div
              data-scoop-top
              className={
                "mt-[max(1.8rem,12px)] flex flex-wrap items-center gap-x-[max(1.2rem,10px)] gap-y-3 rounded-md border-[1.5px] border-dashed px-[max(2rem,12px)] py-[max(1.9rem,12px)] transition-colors " +
                (dragging ? "border-solid border-brand-leaf bg-brand-soft" : "border-brand bg-brand-tint")
              }
            >
              <button
                type="button"
                onClick={pick}
                aria-label="Choose CVs to upload"
                className="flex size-[max(3.5rem,38px)] shrink-0 items-center justify-center rounded-full bg-white text-brand shadow-card"
              >
                <UploadIcon className="size-[42%]" />
              </button>
              <div className="min-w-0">
                <p className="text-[max(1.15rem,14px)] font-medium text-ink">{dragging ? "Drop to upload" : "Drop scoop CVs here"}</p>
                <p className="text-[max(0.9rem,11.5px)] text-ink-2">PDF or Word · up to 10 at once · 10 MB each</p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-[max(1.5rem,10px)]">
                <PillMenu
                  options={SENDERS}
                  initial=""
                  onChange={setSentBy}
                  prefix="Sent by"
                  mark="tick"
                  pillClass={FIELD_PILL + " font-medium"}
                />
                <button
                  type="button"
                  onClick={pick}
                  className="flex h-[max(2.6rem,34px)] items-center gap-2 rounded-full bg-brand px-[max(1.4rem,14px)] text-[max(0.9rem,12.5px)] font-medium text-white transition-colors hover:bg-brand-strong"
                >
                  <UploadIcon className="size-[1.15em]" />
                  Choose CVs
                </button>
              </div>
            </div>
          )}

          {uploads.length > 0 && (
            <div data-scoop-top className="mt-[max(1rem,8px)] rounded-md bg-surface-2 px-[max(1.4rem,12px)] py-[max(0.75rem,8px)]">
              <div className="flex items-center gap-[max(1rem,9px)]">
                <span className={"size-[max(0.6rem,7px)] shrink-0 rounded-full bg-success " + (readingNow ? "animate-pulse" : "")} />
                <p className="whitespace-nowrap text-[max(0.9rem,12px)] font-medium text-ink">
                  {readingNow
                    ? `Reading ${readingNow} CV${readingNow === 1 ? "" : "s"} — about ${mins} minute${mins === 1 ? "" : "s"}`
                    : `Read ${finished - failed.length} CV${finished - failed.length === 1 ? "" : "s"}`}
                </p>
                <div className="h-[max(0.4rem,5px)] w-[max(26rem,60px)] min-w-0 overflow-hidden rounded-full bg-white max-md:flex-1">
                  <div data-read-bar className="h-full origin-left scale-x-0 rounded-full bg-brand" />
                </div>
                <button
                  type="button"
                  disabled={!!readingNow}
                  onClick={() => setUploads((u) => u.filter((x) => x.state === "reading"))}
                  className="ml-auto whitespace-nowrap text-[max(0.9rem,12px)] text-ink-2 transition-colors hover:text-ink disabled:opacity-50"
                >
                  Clear finished
                </button>
              </div>
              {/* A CV that would not read stays named, with Try again and Remove (4.3). */}
              {failed.map((u) => (
                <div key={u.id} role="alert" className="mt-2 flex items-center gap-[max(0.8rem,8px)] text-[max(0.85rem,11.5px)]">
                  <span className="min-w-0 truncate font-medium text-ink">{u.file}</span>
                  <span className="text-danger">Could not be read</span>
                  <button type="button" onClick={() => retry(u)} className={SMALL + " ml-auto"}>
                    Try again
                  </button>
                  <button type="button" onClick={() => setUploads((all) => all.filter((x) => x.id !== u.id))} className={SMALL}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* The TA System's filters; they take effect on Apply (or Enter in the search). */}
          <div data-scoop-top className="relative z-20 mt-[max(1.2rem,10px)] flex flex-wrap items-center gap-x-[max(2rem,10px)] gap-y-2">
            <label className={FIELD_PILL + " w-[max(20rem,180px)] text-ink-2 max-md:w-full has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand/30"}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-[1.1em] shrink-0" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={draft.q}
                onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && setApplied(draft)}
                placeholder="Search by name, title or company"
                aria-label="Search the scoops"
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-2"
              />
            </label>
            <PillMenu options={EXPERIENCE} initial="" onChange={(exp) => setDraft((d) => ({ ...d, exp }))} mark="tick" pillClass={FIELD_PILL + " text-ink-2"} />
            <PillMenu options={NOTICE} initial="" onChange={(notice) => setDraft((d) => ({ ...d, notice }))} mark="tick" pillClass={FIELD_PILL + " text-ink-2"} />
            <PillMenu options={WHO} initial="" onChange={(who) => setDraft((d) => ({ ...d, who }))} mark="tick" pillClass={FIELD_PILL + " text-ink-2"} />
            <button
              type="button"
              onClick={() => setApplied(draft)}
              className="h-[max(2.6rem,34px)] rounded-full border-[1.5px] border-brand px-[max(1.3rem,14px)] text-[max(0.9rem,12.5px)] font-medium text-brand transition-colors hover:bg-brand hover:text-white"
            >
              Apply
            </button>
            <span className="text-[max(0.9rem,12px)] text-ink-2">{shown.length} in scoops</span>
          </div>

          <ul className="mt-[max(1.1rem,10px)] min-h-0 flex-1 space-y-[max(0.95rem,8px)] overflow-y-auto pb-2 [scrollbar-width:none]" aria-label="Scoops">
            {shown.map((s) => (
              <li
                key={s.id}
                data-scoop-row={s.id}
                className="flex flex-wrap items-center gap-x-[max(1.1rem,10px)] gap-y-2 rounded-md border border-surface-3 bg-white px-[max(1.4rem,11px)] py-[max(1.2rem,10px)] transition-shadow hover:shadow-card"
              >
                {/* The initials tick the row for Shortlist selected. */}
                <button
                  type="button"
                  disabled={!free(s)}
                  aria-pressed={picked.includes(s.id)}
                  aria-label={`Select ${s.name}`}
                  onClick={() => setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                  className={
                    "flex size-[max(3rem,34px)] shrink-0 items-center justify-center rounded-full text-[max(1rem,12px)] font-medium transition-colors disabled:cursor-default " +
                    (picked.includes(s.id) ? "bg-brand text-white" : "bg-info-soft text-info enabled:hover:bg-info-soft")
                  }
                >
                  {picked.includes(s.id) ? <Tick /> : initials(s.name)}
                </button>
                <button type="button" onClick={() => openRow(s.id)} className="flex min-w-0 flex-1 items-center gap-x-[max(1.1rem,10px)] text-left" aria-label={`Read ${s.name}'s CV`}>
                  <span className="w-[max(17rem,130px)] min-w-0 shrink-0 max-md:flex-1">
                    <span className="block truncate text-[max(1.2rem,14px)] font-medium text-ink">{s.name}</span>
                    <span className="block truncate text-[max(0.9rem,11.5px)] text-ink-2">{s.title}</span>
                  </span>
                  <span className="min-w-0 space-y-0.5 text-[max(0.9rem,11.5px)] text-ink-2 max-md:hidden">
                    <span className="block truncate">L : {s.location}</span>
                    <span className="block truncate">C : {s.company}</span>
                  </span>
                </button>
                <div className="ml-auto flex items-center gap-[max(1.1rem,8px)]">
                  <span className={CHIP + " bg-violet-soft text-violet"}>{s.sentBy ? `Sent by ${s.sentBy} · ${s.sentDay}` : `Uploaded ${s.sentDay}`}</span>
                  <RowAction s={s} onShortlist={() => shortlist([s.id])} />
                </div>
              </li>
            ))}
            {list.length === 0 && <li className="pt-8 text-center text-[max(0.9rem,12px)] text-ink-2">No scoops on this job yet.</li>}
            {list.length > 0 && shown.length === 0 && (
              <li className="pt-8 text-center text-[max(0.9rem,12px)] text-ink-2">No scoop matches these filters.</li>
            )}
          </ul>
        </>
      ) : (
        // The reading view: the same list on the left, the chosen CV on the right.
        <div className="mt-[max(1.2rem,10px)] grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[max(4.6rem,20px)] px-[max(0.6rem,4px)] max-md:grid-cols-1 max-md:grid-rows-[minmax(0,2fr)_minmax(0,3fr)] max-md:gap-4">
          <ul className="min-h-0 space-y-[max(1.1rem,8px)] overflow-y-auto pb-2 pr-1 [scrollbar-width:none]" aria-label="Scoops">
            {shown.map((s) => {
              const on = s.id === current?.id;
              return (
                <li
                  key={s.id}
                  data-scoop-row={s.id}
                  className={
                    "overflow-hidden rounded-md border bg-white transition-[border-color,box-shadow] " +
                    (on ? "border-brand/30 shadow-float" : "border-border hover:shadow-card")
                  }
                >
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setChosen(s.id)}
                    className="grid w-full grid-cols-[auto_minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-x-[max(0.9rem,9px)] px-[max(1.2rem,11px)] py-[max(1.3rem,10px)] text-left"
                  >
                    <span className="flex size-[max(2.75rem,32px)] items-center justify-center rounded-full bg-info-soft text-[max(0.95rem,11px)] font-semibold text-info">{initials(s.name)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[max(1.2rem,13.5px)] font-semibold text-ink">{s.name}</span>
                      <span className="block truncate text-[max(0.9rem,11px)] text-ink-2">{s.title}</span>
                    </span>
                    <span className="min-w-0 space-y-1 text-[max(0.8rem,10.5px)] text-ink-2">
                      <span className="block truncate">L : {s.location}</span>
                      <span className="block truncate">C : {s.company}</span>
                      {s.mine && <span className="block truncate font-medium text-brand">Shortlisted by you</span>}
                      {s.lockedBy && <span className="block truncate font-medium text-warn">Shortlisted by {s.lockedBy}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex min-h-0 flex-col">
            {current ? (
              // The whole first page in one glance, later pages a scroll away (owner,
              // 12 Nov 2026). Double-click opens it big.
              <div data-scoop-cv onDoubleClick={() => (setReading(current), setReadingOpen(true))} title="Double-click to open this CV big" className="relative min-h-0 flex-1 overflow-hidden">
                {current.cv ? <CvPages key={current.cv} src={current.cv} fit="width" /> : <WordWaiting name={current.name} />}
                <button
                  type="button"
                  onClick={() => (setReading(current), setReadingOpen(true))}
                  aria-label="Open this CV big"
                  className="absolute right-3 top-3 flex size-[max(2.2rem,28px)] items-center justify-center rounded-full bg-white/90 text-ink shadow-float transition-colors hover:bg-white"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-1/2" aria-hidden="true">
                    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-lg bg-surface-2 text-ink-2">No CV to show.</div>
            )}
            {current && CAN_ACT && (
              <div className="mt-[max(1.3rem,10px)] flex items-center justify-end gap-[max(1rem,10px)]">
                {/* Another TA got there first: the TA System's collision lock (4.2). */}
                {current.lockedBy && (
                  <p className="text-[max(0.8rem,11.5px)] text-ink-2">
                    Shortlisted by <b className="font-semibold text-ink">{current.lockedBy}</b>. You cannot contact.
                  </p>
                )}
                {current.mine ? (
                  <span className={CHIP + " bg-brand-soft text-brand"}>Shortlisted by you</span>
                ) : (
                  <button
                    type="button"
                    disabled={!!current.lockedBy}
                    onClick={shortlistCurrent}
                    className="h-[max(2.6rem,34px)] rounded-full bg-brand px-[max(3.4rem,26px)] text-[max(0.85rem,12.5px)] font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
                  >
                    Shortlist
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {notice && <Toast key={notice.n} bold={notice.bold} rest={notice.rest} warn={notice.warn} />}
      {readingShown && reading && <CvPreview ref={cvBox} name={reading.name} title={reading.title} src={reading.cv} onClose={() => setReadingOpen(false)} />}
    </div>
  );
}

/** Shortlist, or why there is none: mine already, or another TA's (the lock). */
function RowAction({ s, onShortlist }: { s: Scoop; onShortlist: () => void }) {
  if (s.mine) return <span className={CHIP + " bg-brand-soft text-brand"}>Shortlisted by you</span>;
  if (s.lockedBy) return <span className={CHIP + " bg-warn-soft text-warn"}>Shortlisted by {s.lockedBy}</span>;
  if (!CAN_ACT) return null;
  return (
    <button
      type="button"
      onClick={onShortlist}
      className="h-[max(2.6rem,34px)] rounded-full bg-brand px-[max(1.3rem,14px)] text-[max(0.9rem,12.5px)] font-medium text-white transition-colors hover:bg-brand-strong"
    >
      Shortlist
    </button>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <p className="flex items-baseline gap-2 text-[max(0.9rem,12px)] text-ink-2">
      <b className="text-[max(1.6rem,18px)] font-normal leading-none text-ink">{n}</b>
      {label}
    </p>
  );
}

const FIELD_PILL =
  "flex h-[max(2.6rem,34px)] items-center gap-2 whitespace-nowrap rounded-full border border-border bg-white px-[max(1.1rem,12px)] text-[max(0.9rem,12px)]";
const CHIP = "whitespace-nowrap rounded-full px-[max(0.75rem,8px)] py-[max(0.25rem,3px)] text-[max(0.8rem,11px)] font-medium";
const SMALL = "rounded-full border border-border bg-white px-[max(0.8rem,9px)] py-[max(0.2rem,2px)] text-[max(0.75rem,11px)] text-ink hover:bg-surface-2";

/** A Word CV cannot be drawn in the browser; it shows once the CV has been read. */
function WordWaiting({ name }: { name: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <span className="flex size-[max(3rem,36px)] items-center justify-center rounded-xl bg-[#2b579a] text-[max(1.1rem,14px)] font-bold text-white">W</span>
      <p className="text-[max(1rem,13px)] font-semibold text-ink">{name}&rsquo;s CV is a Word file</p>
      <p className="max-w-[22rem] text-[max(0.85rem,11.5px)] text-ink-2">It shows here as pages once the CV has been read.</p>
    </div>
  );
}

/** "jane_doe-CV.pdf" -> "Jane Doe": a first name for a CV until it has been read. */
function nameFromFile(file: string) {
  const words = file
    .replace(/\.[^.]+$/, "")
    .split(/[\s._-]+/)
    .filter((w) => w && !/^(cv|resume|curriculum|vitae|final|updated|new|\d+)$/i.test(w));
  const name = words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  return name || "New candidate";
}

function UploadIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="size-1/2" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}
