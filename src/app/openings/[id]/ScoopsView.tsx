"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { DUR, EASE, gsap, motionOK, useExit, useGSAP } from "@/lib/gsap";
import { BackButton } from "./PipelineBoard";
import CvPages, { warmPdf } from "./CvPages";

const CvPreview = dynamic(() => import("./CvPreview"), { ssr: false });

// Placeholder: sample scoops (CVs sent or uploaded to this opening by a TA), each
// with its own demo CV file in public/cvs (made-up people, fake contacts). With the
// backend the list is one small page of this opening's scoops, and a CV file is
// fetched only when that candidate is opened - never the whole list's CVs at once.
type Scoop = {
  id: string;
  name: string;
  title: string;
  location: string;
  company: string;
  /** The CV file to show: a PDF address, or nothing for a Word CV not read yet. */
  cv?: string;
};

const SCOOPS: Scoop[] = [
  { id: "s1", cv: "/cvs/s1.pdf", name: "Nadeeka Dilshan", title: "Assistant Manager production", location: "Colombo", company: "Croydon Kowloon Designs Ltd" },
  { id: "s2", cv: "/cvs/s2.pdf", name: "Kasun Perera", title: "Production Supervisor", location: "Gampaha", company: "Brandix Lanka Ltd" },
  { id: "s3", cv: "/cvs/s3.pdf", name: "Ishara Fernando", title: "Assistant Manager production", location: "Colombo", company: "MAS Holdings" },
  { id: "s4", cv: "/cvs/s4.pdf", name: "Tharindu Silva", title: "Planning Executive", location: "Kandy", company: "Hirdaramani Group" },
  { id: "s5", cv: "/cvs/s5.pdf", name: "Dilani Jayasinghe", title: "Quality Assurance Lead", location: "Negombo", company: "Teejay Lanka PLC" },
  { id: "s6", cv: "/cvs/s6.pdf", name: "Ruwan Bandara", title: "Assistant Manager production", location: "Colombo", company: "Croydon Kowloon Designs Ltd" },
];



const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** The Scoops view: scooped candidates on the left, the chosen one's CV on the
 *  right, and Shortlist under it. Every move is GSAP: rows arrive in turn, the CV
 *  slides in on each choice, a shortlisted row slides out and the list closes up,
 *  and a notice rises to say so. Up and down arrows move through the list. */
export default function ScoopsView() {
  const [list, setList] = useState(SCOOPS);
  const [chosen, setChosen] = useState(SCOOPS[0].id);
  const [notice, setNotice] = useState<{ bold: string; rest: string; n: number } | null>(null);
  // The pill of tools behind the corner button: fold, filter, Upload CV.
  const [tools, setTools] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [q, setQ] = useState("");
  // CV files on their way in, each shown with a progress bar until it lands.
  const [uploads, setUploads] = useState<{ id: string; file: string; size: number; url?: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const seq = useRef(0);
  // The scoop whose CV is open big in the viewer, if any.
  const [reading, setReading] = useState<Scoop | null>(null);
  const [readingOpen, setReadingOpen] = useState(false);
  const read = (s: Scoop) => {
    setReading(s);
    setReadingOpen(true);
  };
  // Each of these leaves the way it came instead of vanishing (useExit).
  const cvBox = useRef<HTMLDivElement>(null);
  const toolsEl = useRef<HTMLDivElement>(null);
  const filterEl = useRef<HTMLLabelElement>(null);
  const dropEl = useRef<HTMLDivElement>(null);
  const readingShown = useExit(readingOpen, cvBox, FADE_OUT);
  const toolsShown = useExit(tools, toolsEl, TOOLS_OUT);
  const filterShown = useExit(filterOpen, filterEl, FILTER_OUT);
  const dropShown = useExit(dragging, dropEl, FADE_OUT);
  const root = useRef<HTMLDivElement>(null);
  // Shortlisted rows still sliding out: already gone for every purpose but the eye.
  const [leaving, setLeaving] = useState<string[]>([]);
  // Where each row stood just before one was taken out, so the rest can close up
  // by moving (transform) instead of jumping.
  const tops = useRef(new Map<string, number>());
  const live = list.filter((s) => !leaving.includes(s.id));
  const current = live.find((s) => s.id === chosen) ?? live[0];
  // The next scoop's CV is opened ahead, so moving down the list shows it at once.
  const nextCv = current ? live[live.indexOf(current) + 1]?.cv : undefined;
  useEffect(() => {
    if (nextCv) warmPdf(nextCv);
  }, [nextCv]);

  // Arrive: rows in turn from the left, the CV from the right.
  useGSAP(
    () => {
      gsap.from("[data-scoop-row]", { x: -24, opacity: 0, duration: DUR.base, stagger: 0.05, delay: 0.08 });
      // The CV panel arrives with the choice animation below (one tween, not two:
      // two fades on one element on first load left it invisible).
      gsap.from("[data-shortlist]", { y: 12, opacity: 0, duration: DUR.base, delay: 0.25 });
    },
    { scope: root },
  );

  // Each choice: the CV panel glides in from the right; its pages then fade in
  // as they are drawn (CvPages).
  useGSAP(
    () => {
      // overwrite: holding an arrow key restarts it cleanly instead of stacking fades.
      gsap.fromTo("[data-scoop-cv]", { x: 24, opacity: 0 }, { x: 0, opacity: 1, duration: DUR.base, overwrite: true });
    },
    { dependencies: [chosen], scope: root, revertOnUpdate: false },
  );

  const choose = (id: string) => {
    if (id !== chosen) setChosen(id);
  };

  // A CV dropped beside the list, not on it, must not make the browser open the
  // file and leave the page.
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

  // Up and down move through the list, like the pipeline's tick scroll.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      // The big CV viewer is open: the arrows scroll it, not this list.
      if (readingOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      const i = live.findIndex((s) => s.id === chosen);
      const next = live[Math.max(0, Math.min(live.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
      if (next) {
        setChosen(next.id);
        root.current?.querySelector(`[data-scoop-row="${next.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [live, chosen, readingOpen]);

  // Shortlist: everything that matters happens on the click - the next candidate
  // is chosen, the notice rises - and the row only then slides out right. A
  // timer, not the slide's end, takes it out of the list, so a held-back frame
  // never leaves the click looking dead.
  const shortlist = () => {
    if (!current) return;
    const id = current.id;
    const i = live.findIndex((s) => s.id === id);
    const nextId = (live[i + 1] ?? live[i - 1])?.id;
    setLeaving((l) => [...l, id]);
    if (nextId) setChosen(nextId);
    setNotice((n) => ({ bold: current.name, rest: " shortlisted", n: (n?.n ?? 0) + 1 }));
    const row = root.current?.querySelector<HTMLElement>(`[data-scoop-row="${id}"]`);
    if (row) gsap.to(row, { x: 60, opacity: 0, scaleY: 0.6, transformOrigin: "50% 0%", duration: DUR.fast, ease: EASE.in });
    setTimeout(() => {
      root.current?.querySelectorAll<HTMLElement>("[data-scoop-row]").forEach((r) => {
        tops.current.set(r.dataset.scoopRow!, r.getBoundingClientRect().top);
      });
      setList((l) => l.filter((s) => s.id !== id));
      setLeaving((l) => l.filter((x) => x !== id));
    }, 250);
  };

  // The row is gone: the rows under it start where they stood and glide up.
  useLayoutEffect(() => {
    const was = tops.current;
    if (!was.size) return;
    tops.current = new Map();
    root.current?.querySelectorAll<HTMLElement>("[data-scoop-row]").forEach((r) => {
      const from = was.get(r.dataset.scoopRow!);
      const d = from === undefined ? 0 : from - r.getBoundingClientRect().top;
      if (d) gsap.fromTo(r, { y: d }, { y: 0, duration: DUR.base });
    });
  }, [list]);

  // CV files picked or dropped: PDF and Word only; each gets a progress row.
  // ponytail: the progress is a stand-in animation until the backend takes the
  // upload; then the bar follows the real upload and the row the real CV reading.
  const addFiles = (files: FileList | File[]) => {
    const all = Array.from(files);
    const ok = all.filter((f) => CV_FILE.test(f.name));
    const left = all.length - ok.length;
    if (left > 0) {
      setNotice((n) => ({
        bold: String(left),
        rest: left === 1 ? " file left out - only PDF or Word CVs" : " files left out - only PDF or Word CVs",
        n: (n?.n ?? 0) + 1,
      }));
    }
    if (!ok.length) return;
    // A PDF is shown straight from the file picked; a Word CV waits to be read.
    // ponytail: the file's address is kept for the page's life; with the backend
    // the stored CV's own address replaces it.
    setUploads((u) => [
      ...ok.map((f) => ({
        id: "up" + ++seq.current,
        file: f.name,
        size: f.size,
        url: /\.pdf$/i.test(f.name) ? URL.createObjectURL(f) : undefined,
      })),
      ...u,
    ]);
  };

  // An upload has landed: it becomes a scoop at the top of the list and opens.
  const landed = (id: string, file: string, url?: string) => {
    setUploads((u) => u.filter((x) => x.id !== id));
    const scoop: Scoop = {
      id,
      name: nameFromFile(file),
      title: "New CV - being read",
      location: "Not read yet",
      company: "Not read yet",
      cv: url,
    };
    setList((l) => [scoop, ...l]);
    setChosen(id);
    setNotice((n) => ({ bold: scoop.name, rest: " uploaded", n: (n?.n ?? 0) + 1 }));
  };

  // Files dragged anywhere over the list light it up; dropping them uploads.
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

  const query = q.trim().toLowerCase();
  const shown = query
    ? list.filter((s) => [s.name, s.title, s.company].some((t) => t.toLowerCase().includes(query)))
    : list;
  const pick = () => fileInput.current?.click();

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col px-[max(1.5rem,14px)] pb-[max(1.4rem,12px)] pt-[max(1.4rem,14px)]">
      <div className="flex items-center">
        <BackButton />
        <div className="ml-auto flex items-center">
          {toolsShown ? (
            <Tools
              ref={toolsEl}
              filterOn={filterOpen}
              onFold={() => setTools(false)}
              onFilter={() => setFilterOpen((f) => !f)}
              onUpload={pick}
            />
          ) : (
            <button
              type="button"
              aria-label="Tools: filter and upload CVs"
              aria-expanded={false}
              onClick={() => setTools(true)}
              className="flex size-[max(2.4rem,32px)] items-center justify-center rounded-full border-[1.5px] border-ink text-ink transition-colors hover:bg-soft"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-1/2" aria-hidden="true">
                <circle cx="12" cy="5" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="12" cy="19" r="1.8" />
              </svg>
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.rtf"
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="mt-[max(1rem,10px)] grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[max(4.6rem,20px)] px-[max(0.6rem,4px)]">
        {/* The scooped candidates; CV files dropped anywhere here are uploaded. */}
        <div {...dropZone} className="relative flex min-h-0 flex-col">
          {filterShown && (
            <FilterBox ref={filterEl} value={q} onChange={setQ} onClose={() => { setFilterOpen(false); setQ(""); }} />
          )}
        <ul className="min-h-0 flex-1 space-y-[max(1.5rem,10px)] overflow-y-auto pb-2 pr-1 [scrollbar-width:none]" aria-label="Scoops">
          {(list.length > 0 || uploads.length > 0) && (
            <li>
              <DropStrip onPick={pick} />
            </li>
          )}
          {uploads.map((u) => (
            <li key={u.id}>
              <UploadRow file={u.file} size={u.size} onDone={() => landed(u.id, u.file, u.url)} />
            </li>
          ))}
          {shown.map((s) => {
            const on = s.id === current?.id;
            return (
              <li
                key={s.id}
                data-scoop-row={s.id}
                inert={leaving.includes(s.id)}
                className={
                  "overflow-hidden rounded-[0.9rem] border bg-white transition-[border-color,box-shadow] " +
                  (on
                    ? "border-[#bcdccb] shadow-[0_8px_28px_rgba(27,107,71,0.12)]"
                    : "border-[#eef0f3] hover:shadow-[0_6px_22px_rgba(0,0,0,0.06)]")
                }
              >
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => choose(s.id)}
                  className="grid w-full grid-cols-[auto_minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-x-[max(0.9rem,9px)] px-[max(1.2rem,11px)] py-[max(1.55rem,11px)] text-left"
                >
                  <span className="flex size-[max(2.75rem,32px)] items-center justify-center rounded-full bg-[#e8f1fb] text-[max(0.95rem,11px)] font-semibold text-[#2f80c8]">
                    {initials(s.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[max(1.3rem,13.5px)] font-semibold text-ink">{s.name}</span>
                    <span className="block truncate text-[max(0.95rem,11px)] text-muted">{s.title}</span>
                  </span>
                  <span className="min-w-0 space-y-1 text-[max(0.8rem,10.5px)] text-muted">
                    <span className="block truncate">L : {s.location}</span>
                    <span className="block truncate">C : {s.company}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && uploads.length === 0 && (
            <li className="h-full">
              <DropEmpty onPick={pick} />
            </li>
          )}
          {list.length > 0 && shown.length === 0 && (
            <li className="pt-8 text-center text-[max(0.9rem,12px)] text-muted">No scoop matches &ldquo;{q}&rdquo;.</li>
          )}
        </ul>
          {dropShown && <DropOverlay ref={dropEl} />}
        </div>

        {/* The chosen candidate's CV, and Shortlist under it. */}
        <div className="flex min-h-0 flex-col">
          {current ? (
            // The candidate's own CV file: the whole first page in one glance, later
            // pages a scroll away (owner, 12 Nov 2026). Double-click opens it big.
            <div
              data-scoop-cv
              onDoubleClick={() => read(current)}
              title="Double-click to open this CV big"
              className="relative min-h-0 flex-1 overflow-hidden"
            >
              {current.cv ? (
                <CvPages key={current.cv} src={current.cv} fit="width" />
              ) : (
                <WordWaiting name={current.name} />
              )}
              <button
                type="button"
                onClick={() => read(current)}
                aria-label="Open this CV big"
                className="absolute right-3 top-3 flex size-[max(2.2rem,28px)] items-center justify-center rounded-full bg-white/90 text-ink shadow-[0_4px_14px_rgba(0,0,0,0.12)] transition-colors hover:bg-white"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-1/2" aria-hidden="true">
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-[1.6rem] bg-soft text-muted">No CV to show.</div>
          )}

          <div className="mt-[max(1.3rem,10px)] flex justify-end">
            <button
              data-shortlist
              type="button"
              disabled={!current}
              onClick={shortlist}
              className="h-[max(2.6rem,34px)] rounded-full bg-pill-line px-[max(3.4rem,26px)] text-[max(0.85rem,12.5px)] font-medium text-white transition-colors hover:bg-[#163d2e] disabled:opacity-40"
            >
              Shortlist
            </button>
          </div>
        </div>
      </div>

      {notice && <Toast key={notice.n} bold={notice.bold} rest={notice.rest} />}
      {readingShown && reading && (
        <CvPreview ref={cvBox} name={reading.name} title={reading.title} src={reading.cv} onClose={() => setReadingOpen(false)} />
      )}
    </div>
  );
}

/** A Word CV cannot be drawn in the browser; it shows once the CV has been read. */
function WordWaiting({ name }: { name: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <span className="flex size-[max(3rem,36px)] items-center justify-center rounded-xl bg-[#2b579a] text-[max(1.1rem,14px)] font-bold text-white">W</span>
      <p className="text-[max(1rem,13px)] font-semibold text-ink">{name}&rsquo;s CV is a Word file</p>
      <p className="max-w-[22rem] text-[max(0.85rem,11.5px)] text-muted">It shows here as pages once the CV has been read.</p>
    </div>
  );
}

/** A short notice ("... shortlisted", "... uploaded") - rises, waits, sinks away. */
function Toast({ bold, rest }: { bold: string; rest: string }) {
  const el = useRef<HTMLDivElement>(null);
  useGSAP(
    (_, contextSafe) => {
      gsap.fromTo(el.current, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: DUR.base, ease: EASE.pop });
      // The wait is real time, not animation time, so it keeps its length when the
      // system asks for less motion (which speeds every tween up).
      const sink = contextSafe!(() => gsap.to(el.current, { y: 20, opacity: 0, duration: DUR.fast, ease: EASE.in }));
      const t = setTimeout(sink, 2600);
      return () => clearTimeout(t);
    },
    { scope: el },
  );
  return createPortal(
    <div
      ref={el}
      role="status"
      className="fixed bottom-[max(4rem,48px)] left-1/2 z-[75] flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-[max(1.3rem,14px)] py-[max(0.7rem,8px)] text-[max(0.85rem,12.5px)] text-white shadow-[0_12px_40px_rgba(0,0,0,0.2)]"
    >
      <span className="flex size-[1.3em] items-center justify-center rounded-full bg-[#2e8b57]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3/5" aria-hidden="true">
          <path d="m5 12 5 5 9-10" />
        </svg>
      </span>
      <span>
        <b className="font-semibold">{bold}</b>
        {rest}
      </span>
    </div>,
    document.body,
  );
}

// How each piece leaves (useExit): the way it came, faster.
const FADE_OUT = { opacity: 0 };
const TOOLS_OUT = { opacity: 0, scaleX: 0.4 };
const FILTER_OUT = { opacity: 0, y: -8 };

const CV_FILE = /\.(pdf|docx?|rtf)$/i;

/** "jane_doe-CV.pdf" -> "Jane Doe": a first name for a CV until it has been read. */
function nameFromFile(file: string) {
  const words = file
    .replace(/\.[^.]+$/, "")
    .split(/[\s._-]+/)
    .filter((w) => w && !/^(cv|resume|curriculum|vitae|final|updated|new|\d+)$/i.test(w));
  const name = words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  return name || "New candidate";
}

const sizeText = (b: number) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");

/** The pill from the design: fold it back, filter the list, upload CVs. It grows
 *  out of the corner from the right, its buttons arriving one after another. */
function Tools({
  ref: el,
  filterOn,
  onFold,
  onFilter,
  onUpload,
}: {
  ref: RefObject<HTMLDivElement | null>;
  filterOn: boolean;
  onFold: () => void;
  onFilter: () => void;
  onUpload: () => void;
}) {
  useGSAP(
    () => {
      gsap.from(el.current, { scaleX: 0.4, opacity: 0, duration: DUR.base, ease: EASE.pop, transformOrigin: "right center" });
      gsap.from(el.current!.children, { x: 14, opacity: 0, duration: DUR.base, stagger: 0.05, delay: 0.08 });
    },
    { scope: el },
  );
  return (
    <div
      ref={el}
      className="flex items-center gap-[max(0.6rem,6px)] rounded-full bg-white p-[max(0.4rem,4px)] pl-[max(0.8rem,8px)] shadow-[0_6px_24px_rgba(0,0,0,0.1)]"
    >
      <button type="button" aria-label="Fold the tools" onClick={onFold} className="flex size-[max(2.2rem,28px)] items-center justify-center rounded-full text-pill-line hover:bg-soft">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="size-3/5" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Filter the scoops"
        aria-pressed={filterOn}
        onClick={onFilter}
        className={
          "flex size-[max(2.2rem,28px)] items-center justify-center rounded-full border-[1.5px] transition-colors " +
          (filterOn ? "border-pill-line bg-pill-line text-white" : "border-ink text-ink hover:bg-soft")
        }
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-1/2" aria-hidden="true">
          <path d="M4 7h16M7 12h10M10 17h4" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onUpload}
        className="h-[max(2.6rem,32px)] rounded-full bg-[#38a876] px-[max(1.6rem,16px)] text-[max(0.9rem,12.5px)] font-medium text-white transition-colors hover:bg-[#2e9466]"
      >
        Upload CV
      </button>
    </div>
  );
}

/** The search box the filter button opens, above the list. */
function FilterBox({
  ref: el,
  value,
  onChange,
  onClose,
}: {
  ref: RefObject<HTMLLabelElement | null>;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  useGSAP(() => {
    gsap.from(el.current, { y: -8, opacity: 0, duration: DUR.fast });
  });
  return (
    <label
      ref={el}
      className="mb-[max(1rem,8px)] flex h-[max(2.6rem,32px)] items-center gap-2 rounded-full border border-[#e3e5e8] bg-white px-[max(1rem,12px)] has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand/30"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-[max(1rem,13px)] text-muted" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        placeholder="Filter by name, role or company"
        aria-label="Filter the scoops"
        className="min-w-0 flex-1 bg-transparent text-[max(0.85rem,12px)] outline-none placeholder:text-muted"
      />
      <button type="button" aria-label="Close the filter" onClick={onClose} className="text-muted hover:text-ink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-[max(1rem,13px)]" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </label>
  );
}

function UploadIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

/** Always at the top of the list: CVs can be dropped here, or click to pick them. */
function DropStrip({ onPick }: { onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center justify-center gap-2 rounded-[0.9rem] border-[1.5px] border-dashed border-[#b9d9c7] bg-[#f6fbf8] py-[max(0.8rem,8px)] text-[max(0.85rem,11.5px)] text-muted transition-colors hover:border-[#38a876] hover:text-pill-line"
    >
      <UploadIcon className="size-[max(1.1rem,14px)] text-[#38a876]" />
      Drag CVs here, or <span className="font-semibold text-pill-line underline underline-offset-2">upload</span>
    </button>
  );
}

/** No scoops at all: the whole list is one place to drop CVs. */
function DropEmpty({ onPick }: { onPick: () => void }) {
  const el = useRef<HTMLButtonElement>(null);
  useGSAP(() => {
    gsap.from(el.current, { scale: 0.96, opacity: 0, duration: DUR.base });
    // The endless bob stops when the system asks for less motion.
    if (motionOK()) gsap.to(el.current!.querySelector("svg"), { y: -5, duration: 0.9, repeat: -1, yoyo: true, ease: "sine.inOut" });
  });
  return (
    <button
      ref={el}
      type="button"
      onClick={onPick}
      className="flex h-full min-h-[max(16rem,180px)] w-full flex-col items-center justify-center gap-[max(0.8rem,8px)] rounded-[1.2rem] border-2 border-dashed border-[#b9d9c7] bg-[#f6fbf8] text-center transition-colors hover:border-[#38a876]"
    >
      <UploadIcon className="size-[max(3rem,36px)] text-[#38a876]" />
      <span className="text-[max(1.1rem,14px)] font-semibold text-ink">Drag and drop CVs here</span>
      <span className="text-[max(0.85rem,11.5px)] text-muted">
        or <span className="font-semibold text-pill-line underline underline-offset-2">click to upload</span> - PDF or Word
      </span>
    </button>
  );
}

/** While CV files are dragged over the list. */
function DropOverlay({ ref: el }: { ref: RefObject<HTMLDivElement | null> }) {
  useGSAP(() => {
    gsap.from(el.current, { opacity: 0, scale: 0.98, duration: DUR.fast });
  });
  return (
    <div
      ref={el}
      className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[1.2rem] border-2 border-dashed border-[#38a876] bg-[#eaf6ef]/90 text-pill-line backdrop-blur-[1px]"
    >
      <UploadIcon className="size-[max(3rem,36px)]" />
      <span className="text-[max(1.1rem,14px)] font-semibold">Drop to upload</span>
    </div>
  );
}

/** One CV on its way in: its name, size and a progress bar that GSAP fills. */
function UploadRow({ file, size, onDone }: { file: string; size: number; onDone: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useGSAP(
    () => {
      const bar = el.current!.querySelector<HTMLElement>("[data-bar]");
      const pct = el.current!.querySelector<HTMLElement>("[data-pct]");
      const p = { v: 0 };
      gsap.from(el.current, { y: -10, opacity: 0, duration: DUR.fast });
      gsap
        .timeline({ onComplete: () => done.current() })
        .to(p, {
          v: 100,
          duration: 1.2 + Math.random() * 0.9,
          ease: "power1.inOut",
          onUpdate: () => {
            gsap.set(bar, { scaleX: p.v / 100 });
            if (pct) pct.textContent = Math.round(p.v) + "%";
          },
        })
        .to(el.current, { opacity: 0, y: 6, duration: DUR.fast, ease: EASE.in }, "+=0.25");
    },
    { scope: el },
  );
  return (
    <div ref={el} className="rounded-[0.9rem] border border-[#eef0f3] bg-white px-[max(1.2rem,11px)] py-[max(1rem,9px)]">
      <div className="flex items-center gap-[max(0.8rem,8px)]">
        <span className="flex size-[max(2.75rem,32px)] shrink-0 items-center justify-center rounded-full bg-[#eaf6ef] text-[#38a876]">
          <UploadIcon className="size-1/2" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[max(1rem,12.5px)] font-semibold text-ink">{file}</span>
          <span className="block text-[max(0.8rem,10.5px)] text-muted">Uploading · {sizeText(size)}</span>
        </span>
        <span data-pct className="text-[max(0.85rem,11px)] font-semibold tabular-nums text-pill-line">
          0%
        </span>
      </div>
      <div className="mt-[max(0.7rem,7px)] h-[max(0.4rem,5px)] overflow-hidden rounded-full bg-[#eef0f3]">
        <div data-bar className="h-full origin-left scale-x-0 rounded-full bg-gradient-to-r from-[#38a876] to-pill-line" />
      </div>
    </div>
  );
}
