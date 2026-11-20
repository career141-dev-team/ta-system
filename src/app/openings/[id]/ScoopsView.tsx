"use client";

import { ViewSkeleton } from "@/app/Skeleton";
import { door, jobFromAddress, useDoorMutation, useDoorQuery, useLive, type Answer, type DoorDone, cvUrl } from "@/lib/backend";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { DUR, EASE, gsap, useExit, useGSAP, swapIn, useSwap } from "@/lib/gsap";
import { BackButton } from "./PipelineBoard";
import CvPages, { warmPdf } from "./CvPages";
import PillMenu, { type MenuOption } from "./PillMenu";
import { useFilters } from "@/lib/filters";
import { NoResults } from "@/app/FilterBits";
import Toast from "./Toast";
import { sendToPipeline } from "./pipelineInbox";
import { EXPERIENCE, inRange } from "./filters";
import WorkdayBlocked from "./WorkdayBlocked";
import { useWorkdayGate } from "@/lib/workday";
import { useLiftMenu } from "./liftMenu";

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
  /** A few skills for the row (placeholder until the CV is read). */
  skills?: string[];
  /** Notice period in days; 0 = can start now. */
  notice: number;
  /** I shortlisted this person: the row stays, marked "Shortlisted by you". */
  mine?: boolean;
  /** Another TA shortlisted this person first (the collision lock): their first name. */
  lockedBy?: string;
};

const SCOOPS: Scoop[] = [
  { id: "s1", cv: "/cvs/s1.pdf", name: "Nadeeka Dilshan", title: "Assistant Manager, Production", location: "Colombo", company: "Croydon Kowloon Designs", sentBy: "Shehan", sentDay: "today", years: 6, skills: ["Production planning","Lean","Apparel"], notice: 30 },
  { id: "s2", cv: "/cvs/s2.pdf", name: "Kasun Perera", title: "Production Supervisor", location: "Gampaha", company: "Brandix Lanka Ltd", sentBy: "Shehan", sentDay: "today", years: 9, skills: ["Line balancing","Team leadership","Apparel"], notice: 60 },
  { id: "s3", cv: "/cvs/s3.pdf", name: "Ishara Fernando", title: "Assistant Manager, Production", location: "Colombo", company: "MAS Holdings", sentBy: "Rashmi", sentDay: "yesterday", years: 11, skills: ["Production","Costing","SAP"], notice: 90, mine: true },
  { id: "s4", cv: "/cvs/s4.pdf", name: "Tharindu Silva", title: "Planning Executive", location: "Kandy", company: "Hirdaramani Group", sentBy: "Rashmi", sentDay: "yesterday", years: 4, skills: ["Planning","Merchandising","Excel"], notice: 30 },
  { id: "s5", cv: "/cvs/s5.pdf", name: "Dilani Jayasinghe", title: "Quality Assurance Lead", location: "Negombo", company: "Teejay Lanka PLC", sentBy: "Dinesh", sentDay: "2 days ago", years: 5, skills: ["Quality assurance","Textiles","ISO 9001"], notice: 0, lockedBy: "Hasini" },
  { id: "s6", cv: "/cvs/s6.pdf", name: "Ruwan Bandara", title: "Assistant Manager, Production", location: "Colombo", company: "Croydon Kowloon Designs", sentDay: "2 days ago", years: 2, skills: ["Production","Training","Apparel"], notice: 0 },
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

type Filters = { q: string; exp: string; who: string };
const NO_FILTERS: Filters = { q: "", exp: "", who: "" };

function matches(s: Scoop, f: Filters) {
  const q = f.q.trim().toLowerCase();
  if (q && ![s.name, s.title, s.company].some((t) => t.toLowerCase().includes(q))) return false;
  if (!inRange(s.years, f.exp)) return false;
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
type DoorScoops = Answer<{
  me: string;
  names: Record<string, string>;
  people: { id: string; name: string; title: string | null; company: string | null; location: string | null; years: number | null; noticeDays: number | null; ownerId: string | null; addedAt: number; sentBy: string | null }[];
}>;
const first = (n?: string) => n?.split(" ")[0];
const dayWords = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

export default function ScoopsView() {
  // Live: the opening's scoops (ui/opening:scoops). Shortlist goes through
  // ui/pipeline:shortlist, Delete through ui/manage:removeFromOpening.
  const live = useLive();
  const job = live ? jobFromAddress() : null;
  const [list, setList] = useState(live ? [] : SCOOPS);
  const real = useDoorQuery(door.scoops, job ? { openingId: job } : "skip") as DoorScoops | undefined;
  const [seenReal, setSeenReal] = useState<DoorScoops | undefined>(undefined);
  if (real !== seenReal) {
    setSeenReal(real);
    if (real?.ok)
      setList(
        real.people.map((p) => ({
          id: p.id, cv: cvUrl({ app: p.id }), name: p.name, title: p.title ?? "", company: p.company ?? "", location: p.location ?? "",
          years: p.years ?? 0, notice: p.noticeDays ?? 0, sentDay: dayWords(p.addedAt),
          sentBy: p.sentBy ? first(real.names[p.sentBy]) : undefined,
          mine: !!p.ownerId && p.ownerId === real.me,
          lockedBy: p.ownerId && p.ownerId !== real.me ? first(real.names[p.ownerId]) ?? "another TA" : undefined,
        })),
      );
  }
  const claim = useDoorMutation(door.shortlist);
  const takeOff = useDoorMutation(door.removeFromOpening);
  const uploadUrl = useDoorMutation(door.scoopUploadUrl);
  const queueScoop = useDoorMutation(door.queueScoop);
  // Signed in: each CV goes to the backend's file store, then into the scoop reading
  // queue (ui/opening:queueScoop re-checks size and type); it joins the list once read.
  const sendScoops = async (files: File[]) => {
    let sent = 0;
    let why = "";
    for (const f of files) {
      try {
        const u = (await uploadUrl({})) as { ok: boolean; url?: string; message?: string } | undefined;
        if (!u?.ok || !u.url) throw new Error(u?.message ?? "Could not start the upload.");
        const res = await fetch(u.url, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f });
        if (!res.ok) throw new Error("The file did not upload. Try again.");
        const { storageId } = (await res.json()) as { storageId: string };
        const q = (await queueScoop({ openingId: job!, storageId, fileName: f.name })) as DoorDone | undefined;
        if (q && !q.ok) throw new Error(q.message);
        sent++;
      } catch (e) {
        why = e instanceof Error ? e.message : "The file did not upload.";
      }
    }
    if (sent) say(` - each one joins the list once it is read.`, `${sent} CV${sent === 1 ? "" : "s"} sent for reading`);
    if (why) say(`${files.length - sent} not sent: ${why}`, undefined, true);
  };
  const [mode, setMode] = useState<"list" | "read">("list");
  const [chosen, setChosen] = useState(SCOOPS[0].id);
  const [picked, setPicked] = useState<string[]>([]);
  // ⋮ > "Select to shortlist / delete" turns the tickboxes on; the toolbar button then
  // carries the chosen action and the count. `done` shows the drawn tick after it runs.
  const [selecting, setSelecting] = useState<null | "shortlist" | "delete">(null);
  const [done, setDone] = useState<null | "shortlist" | "delete">(null);
  const tickPath = useRef<SVGPathElement>(null);
  useEffect(() => {
    const p = tickPath.current;
    if (!done || !p) return;
    const len = p.getTotalLength();
    gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: DUR.base, ease: EASE.out });
    const t = setTimeout(() => {
      setDone(null);
      setSelecting(null);
    }, 1200);
    return () => clearTimeout(t);
  }, [done]);
  const [notice, setNotice] = useState<{ bold?: string; rest: string; n: number; warn?: boolean } | null>(null);
  const [sentBy, setSentBy] = useState("");
  // Filters work as you type or pick (no Apply), are kept per opening for the visit,
  // and Reset clears them - src/lib/filters.ts.
  const { f: applied, set: setFilters, reset: resetFilters, active: nFilters } = useFilters(
    "scoops:" + (typeof window === "undefined" ? "" : (jobFromAddress() ?? "demo")),
    NO_FILTERS,
  );
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
  // The big CV grows out of the small one it was opened from (CvPreview `from`).
  const [cvFrom, setCvFrom] = useState<HTMLElement | null>(null);
  const [cvN, setCvN] = useState(0);
  const openBig = (s: NonNullable<typeof current>, from: Element | null) => {
    setCvFrom(from as HTMLElement | null);
    setReading(s);
    setReadingOpen(true);
    setCvN((n) => n + 1);
  };
  // Scoops just deleted, kept for Undo a few seconds, with where each stood.
  const [removed, setRemoved] = useState<{ s: Scoop; at: number }[] | null>(null);
  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => setRemoved(null), 8000);
    return () => clearTimeout(t);
  }, [removed]);

  // The workday gate: a TA uploads and shortlists only once today's workday is
  // started (FLOW-CHECK 4.4). Empty when work is allowed.
  const gate = useWorkdayGate();
  // A new notice takes the place of the Undo bar (they sit in the same spot).
  const say = (rest: string, bold?: string, warn?: boolean) => {
    setRemoved(null);
    setNotice((n) => ({ bold, rest, warn, n: (n?.n ?? 0) + 1 }));
  };
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
    if (job) {
      // Each one through the backend's own shortlist; the list re-reads itself.
      void Promise.all(take.map((s) => claim({ applicationId: s.id }) as Promise<DoorDone | undefined>)).then((all) => {
        const no = all.find((d) => d && !d.ok);
        if (no && !no.ok) say(no.message, undefined, true);
        else say(" shortlisted - moved to TA Follow-Up", take.length === 1 ? take[0].name : `${take.length} candidates`);
      });
      setPicked((p) => p.filter((x) => !ids.includes(x)));
      return;
    }
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
    if (live) return void sendScoops(Array.from(files).filter((f) => CV_FILE.test(f.name) && f.size <= MAX_BYTES).slice(0, MAX_FILES));
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

  // ⋮ > Delete: takes scoops off this job's scoops (asked once more in the menu),
  // with Undo. Another TA's shortlisted scoop stays - their claim (the lock).
  const remove = (ids: string[]) => {
    const locked = list.find((s) => ids.includes(s.id) && s.lockedBy);
    if (locked) return say(` shortlisted ${locked.name} first, so this scoop stays on the job.`, locked.lockedBy, true);
    if (gate) return say(gate + " Start it on Today, then delete scoops.", undefined, true);
    const rows = list.flatMap((s, at) => (ids.includes(s.id) ? [{ s, at }] : []));
    if (!rows.length) return;
    if (job) {
      // Saved in the backend: they go to Dropped out, and come back from there (no Undo here).
      void Promise.all(ids.map((id) => takeOff({ applicationId: id }) as Promise<DoorDone | undefined>)).then((all) => {
        const no = all.find((d) => d && !d.ok);
        say(no && !no.ok ? no.message : all[0]?.message ?? "Removed.", undefined, !!(no && !no.ok));
      });
      setPicked((p) => p.filter((x) => !ids.includes(x)));
      return;
    }
    if (mode === "read" && current && ids.includes(current.id)) {
      const i = shown.indexOf(current);
      const next = shown.slice(i + 1).find((s) => !ids.includes(s.id)) ?? shown.slice(0, i).reverse().find((s) => !ids.includes(s.id));
      if (next) setChosen(next.id);
    }
    setList((l) => l.filter((s) => !ids.includes(s.id)));
    setPicked((p) => p.filter((x) => !ids.includes(x)));
    setNotice(null);
    setRemoved(rows);
  };
  const undoRemove = () => {
    if (!removed) return;
    // Back in the places they stood (ponytail: by old index; uploads landing in
    // between can shift them by a row).
    setList((l) => {
      const next = [...l];
      removed.forEach(({ s, at }) => next.splice(Math.min(at, next.length), 0, s));
      return next;
    });
    setRemoved(null);
  };

  const failed = uploads.filter((u) => u.state === "failed");
  const mins = Math.max(1, Math.ceil(readingNow / 3));
  const pickable = picked.filter((id) => list.some((s) => s.id === id && free(s)));
  const count = selecting === "shortlist" ? pickable.length : picked.length;
  const finish = () => {
    if (!selecting || !count || done) return;
    const ids = selecting === "shortlist" ? pickable : [...picked];
    const blocked = !!gate || (selecting === "delete" && ids.some((id) => list.find((s) => s.id === id)?.lockedBy));
    if (selecting === "shortlist") shortlist(ids);
    else remove(ids);
    if (!blocked) setDone(selecting);
  };

  // Still reading this opening: a skeleton of the view, never an empty list that looks final (19 Nov).
  if (job && real === undefined) return <ViewSkeleton />;
  return (
    <div
      ref={root}
      {...(mode === "list" ? dropZone : {})}
      className="flex min-h-0 flex-1 flex-col px-[max(1.5rem,14px)] pb-[max(1.4rem,12px)] pt-[max(1.4rem,14px)] max-md:pt-11"
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

      {/* Back, the TA System's two counts (the same in both modes), Shortlist
          selected and the ⋮ menu (Upload CVs, Delete). z-30: its menu opens over the
          filter row, which is its own layer. */}
      <div data-scoop-top className="relative z-30 flex flex-wrap items-center gap-x-[max(1.4rem,12px)] gap-y-2">
        {mode === "list" ? <BackButton /> : <BackButton onClick={() => setMode("list")} label="Back to the scoops list" />}
        <Count n={list.length} label="scoops on this job" />
        <Count n={open} label="not shortlisted yet" />
        {CAN_ACT && (
          <div className="ml-auto flex items-center gap-[max(0.9rem,8px)]">
            {mode === "list" && selecting && (
              <>
                {!done && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelecting(null);
                      setPicked([]);
                    }}
                    className="h-[max(2.6rem,34px)] rounded-full px-[max(1rem,12px)] text-[max(0.9625rem,13.5px)] text-ink-2 hover:bg-surface-2 hover:text-ink"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  disabled={!count && !done}
                  onClick={finish}
                  className={
                    "flex h-[max(2.6rem,34px)] items-center gap-2 rounded-full px-[max(1.3rem,14px)] text-[max(0.9625rem,13.5px)] font-medium text-white transition-colors disabled:pointer-events-none disabled:opacity-50 " +
                    (done ? "bg-success" : selecting === "delete" ? "bg-danger hover:opacity-90" : "bg-brand hover:bg-brand-strong")
                  }
                >
                  {done ? (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="size-[1.2em]" aria-hidden="true">
                        <path ref={tickPath} d="m5 12.5 4.5 4.5L19 7.5" />
                      </svg>
                      {done === "shortlist" ? "Shortlisted" : "Deleted"}
                    </>
                  ) : (
                    <>
                      {selecting === "delete" && <Bin />}
                      {`${selecting === "shortlist" ? "Shortlist" : "Delete"} · ${count} selected`}
                    </>
                  )}
                </button>
              </>
            )}
            <MoreMenu
              listMode={mode === "list"}
              what={current ? "this scoop" : ""}
              refused={!!current?.lockedBy}
              onSelect={(k) => {
                setPicked([]);
                setDone(null);
                setSelecting(k);
              }}
              onDelete={() => remove(current ? [current.id] : [])}
            />
          </div>
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
                <p className="text-[max(0.9625rem,12.5px)] text-ink-2">PDF or Word · up to 10 at once · 10 MB each</p>
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
                  className="flex h-[max(2.6rem,34px)] items-center gap-2 rounded-full bg-brand px-[max(1.4rem,14px)] text-[max(0.9625rem,13.5px)] font-medium text-white transition-colors hover:bg-brand-strong"
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
                <p className="whitespace-nowrap text-[max(0.9625rem,13px)] font-medium text-ink">
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
                  className="ml-auto whitespace-nowrap text-[max(0.9625rem,13px)] text-ink-2 transition-colors hover:text-ink disabled:opacity-50"
                >
                  Clear finished
                </button>
              </div>
              {/* A CV that would not read stays named, with Try again and Remove (4.3). */}
              {failed.map((u) => (
                <div key={u.id} role="alert" className="mt-2 flex items-center gap-[max(0.8rem,8px)] text-[max(0.9125rem,12.5px)]">
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
                value={applied.q}
                onChange={(e) => setFilters({ q: e.target.value })}
                placeholder="Search by name, title or company"
                aria-label="Search the scoops"
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-2"
              />
            </label>
            <PillMenu options={EXPERIENCE} initial={applied.exp} onChange={(exp) => setFilters({ exp })} mark="tick" pillClass={FIELD_PILL + " text-ink-2"} />
            <PillMenu options={WHO} initial={applied.who} onChange={(who) => setFilters({ who })} mark="tick" pillClass={FIELD_PILL + " text-ink-2"} />
            {nFilters > 0 && (
              <button type="button" onClick={resetFilters} className="h-[max(2.6rem,34px)] rounded-full px-3 text-[max(0.9625rem,13.5px)] font-medium text-brand-strong hover:bg-surface-2">
                Reset{nFilters > 1 ? ` (${nFilters})` : ""}
              </button>
            )}
            <span className="text-[max(0.9625rem,13px)] text-ink-2">{shown.length} in scoops</span>
          </div>

          {shown.length === 0 && <NoResults noun="scoops" filtered={nFilters > 0} onReset={resetFilters} />}
          <ul className="mt-[max(1.1rem,10px)] min-h-0 flex-1 space-y-[max(0.95rem,8px)] overflow-y-auto pb-2 [scrollbar-width:none]" aria-label="Scoops">
            {shown.map((s) => (
              <li
                key={s.id}
                data-scoop-row={s.id}
                className="flex flex-wrap items-center gap-x-[max(1.1rem,10px)] gap-y-2 rounded-md border border-surface-3 bg-white px-[max(1.4rem,11px)] py-[max(1.2rem,10px)] transition-shadow hover:shadow-card"
              >
                {/* The tickbox shows only while a ⋮ "Select to…" is on. */}
                {selecting && (
                  <input
                    type="checkbox"
                    disabled={selecting === "shortlist" ? !free(s) : !!s.lockedBy}
                    checked={picked.includes(s.id)}
                    aria-label={`Select ${s.name}`}
                    onChange={() => setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                    className={"size-[max(1.15rem,16px)] shrink-0 cursor-pointer disabled:cursor-default disabled:opacity-30 " + (selecting === "delete" ? "accent-danger" : "accent-brand")}
                  />
                )}
                <span className="flex size-[max(3rem,34px)] shrink-0 items-center justify-center rounded-full bg-info-soft text-[max(1rem,12px)] font-medium text-info">{initials(s.name)}</span>
                <button type="button" onClick={() => openRow(s.id)} className="flex min-w-0 flex-1 items-center gap-x-[max(1.1rem,10px)] text-left" aria-label={`Read ${s.name}'s CV`}>
                  <span className="w-[max(17rem,130px)] min-w-0 shrink-0 max-md:flex-1">
                    <span className="block truncate text-[max(1.2rem,14px)] font-medium text-ink">{s.name}</span>
                    <span className="block truncate text-[max(0.9625rem,12.5px)] text-ink-2">{s.title}</span>
                    {s.skills && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {s.skills.slice(0, 3).map((k) => (
                          <span key={k} className="rounded-full bg-surface-2 px-2 py-0.5 text-caption text-ink-2">
                            {k}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 space-y-0.5 text-[max(0.9625rem,12.5px)] text-ink-2 max-md:hidden">
                    <span className="block truncate">L : {s.location}</span>
                    <span className="block truncate">C : {s.company}</span>
                    {s.years > 0 && <span className="block truncate">E : {s.years} years</span>}
                  </span>
                </button>
                <div className="ml-auto flex items-center gap-[max(1.1rem,8px)]">
                  <span className={CHIP + " bg-violet-soft text-violet"}>{s.sentBy ? `Sent by ${s.sentBy} · ${s.sentDay}` : `Uploaded ${s.sentDay}`}</span>
                  <RowAction s={s} onShortlist={() => shortlist([s.id])} />
                </div>
              </li>
            ))}
            {list.length === 0 && <li className="pt-8 text-center text-[max(0.9625rem,13px)] text-ink-2">No scoops on this job yet.</li>}
            {list.length > 0 && shown.length === 0 && (
              <li className="pt-8 text-center text-[max(0.9625rem,13px)] text-ink-2">No scoop matches these filters.</li>
            )}
          </ul>
        </>
      ) : (
        // The reading view: the same list on the left, the chosen CV on the right.
        // Owner, 17 Nov 2026 ("this slide design change"): one calm surface - compact
        // rows on the left (selected = brand stroke and tint, no lifted shadow), the CV
        // in a framed sheet on the right with Full view and Shortlist in its foot,
        // where the eye ends.
        <div className="mt-[max(1.2rem,10px)] grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-[max(1.6rem,12px)] max-md:grid-cols-1 max-md:grid-rows-[minmax(0,2fr)_minmax(0,3fr)]">
          <ul className="min-h-0 space-y-[max(0.55rem,6px)] overflow-y-auto pb-2 [scrollbar-width:none]" aria-label="Scoops">
            {shown.map((s) => {
              const on = s.id === current?.id;
              const about = [s.title, s.company, s.location].join(" · ");
              return (
                <li key={s.id} data-scoop-row={s.id}>
                  <button
                    type="button"
                    aria-current={on || undefined}
                    onClick={() => setChosen(s.id)}
                    title={`${s.name} · ${about}`}
                    className={
                      "flex w-full items-center gap-[max(0.9rem,9px)] rounded-md border px-[max(1rem,10px)] py-[max(0.75rem,8px)] text-left transition-colors " +
                      (on ? "border-brand bg-brand-tint" : "border-border bg-surface hover:border-border-strong hover:bg-surface-2")
                    }
                  >
                    <span
                      className={
                        "flex size-[max(2.5rem,30px)] shrink-0 items-center justify-center rounded-full text-[max(0.9125rem,12px)] font-medium " +
                        (on ? "bg-brand-soft text-brand" : "bg-info-soft text-info")
                      }
                    >
                      {initials(s.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 truncate text-[max(1.05rem,13.5px)] font-medium text-ink">{s.name}</span>
                        <span className="ml-auto shrink-0">
                          <ShortlistedChip s={s} />
                        </span>
                      </span>
                      <span className="block truncate text-[max(0.9125rem,12.5px)] text-ink-2">{about}</span>
                      {s.years > 0 && (
                        <span className="block truncate text-[max(0.9125rem,12.5px)] text-ink-3">
                          {s.years} years{s.skills ? " · " + s.skills.slice(0, 3).join(", ") : ""}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="pt-8 text-center text-[max(0.9625rem,13px)] text-ink-2">No scoop matches these filters.</li>}
          </ul>

          <section aria-label="CV" className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-surface-2">
            {current ? (
              <>
                {/* The whole first page in one glance, later pages a scroll away (owner,
                    12 Nov 2026). Double-click opens it big. */}
                <div
                  data-scoop-cv
                  onDoubleClick={(e) => openBig(current, e.currentTarget)}
                  title="Double-click to open this CV big"
                  className="min-h-0 flex-1 overflow-hidden p-[max(0.9rem,8px)]"
                >
                  {current.cv ? <CvPages key={current.cv} src={current.cv} fit="width" /> : <WordWaiting name={current.name} />}
                </div>
                <div className="flex items-center gap-[max(0.9rem,8px)] border-t border-border bg-surface px-[max(1.1rem,10px)] py-[max(0.65rem,7px)]">
                  <button
                    type="button"
                    onClick={(e) => openBig(current, e.currentTarget.closest("section")?.querySelector("[data-scoop-cv]") ?? null)}
                    className="flex h-[max(2.4rem,32px)] shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-[max(1rem,11px)] text-[max(0.9125rem,13px)] text-ink transition-colors hover:bg-surface-2"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[1.1em]" aria-hidden="true">
                      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                    </svg>
                    Full view
                  </button>
                  {CAN_ACT && (
                    <div className="ml-auto flex min-w-0 items-center gap-[max(1rem,10px)]">
                      {/* Another TA got there first: the TA System's collision lock (4.2). */}
                      {current.lockedBy && (
                        <p className="min-w-0 truncate text-[max(0.8625rem,12.5px)] text-ink-2" title={`Shortlisted by ${current.lockedBy}. You cannot contact.`}>
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
                          className="h-[max(2.6rem,34px)] shrink-0 rounded-full bg-brand px-[max(3rem,24px)] text-[max(0.9125rem,13.5px)] font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
                        >
                          Shortlist
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="m-auto text-[max(0.9625rem,13px)] text-ink-2">No CV to show.</p>
            )}
          </section>
        </div>
      )}

      {removed && (
        <div role="status" className="fixed bottom-[max(4rem,48px)] left-1/2 z-[90] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-[max(1.3rem,14px)] py-[max(0.7rem,8px)] text-[max(0.9125rem,13.5px)] text-white shadow-float">
          <span className="min-w-0 truncate">
            <b className="font-semibold">{removed.length === 1 ? removed[0].s.name : `${removed.length} scoops`}</b> deleted from this job&rsquo;s scoops
          </span>
          <button type="button" onClick={undoRemove} className="shrink-0 font-medium text-brand-leaf hover:underline">
            Undo
          </button>
        </div>
      )}
      {notice && <Toast key={notice.n} bold={notice.bold} rest={notice.rest} warn={notice.warn} />}
      {readingShown && reading && <CvPreview key={cvN} ref={cvBox} from={cvFrom} name={reading.name} title={reading.title} src={reading.cv} appId={job ? reading.id : undefined} openingId={job ?? undefined} onClose={() => setReadingOpen(false)} />}
    </div>
  );
}

/** Shortlist, or why there is none: mine already, or another TA's (the lock). */
function RowAction({ s, onShortlist }: { s: Scoop; onShortlist: () => void }) {
  if (s.mine || s.lockedBy) return <ShortlistedChip s={s} />;
  if (!CAN_ACT) return null;
  return (
    <button
      type="button"
      onClick={onShortlist}
      className="h-[max(2.6rem,34px)] rounded-full bg-brand px-[max(1.3rem,14px)] text-[max(0.9625rem,13.5px)] font-medium text-white transition-colors hover:bg-brand-strong"
    >
      Shortlist
    </button>
  );
}

/** "Shortlisted by you" / "Shortlisted by Hasini" (the lock), or nothing. */
function ShortlistedChip({ s }: { s: Scoop }) {
  if (s.mine) return <span className={CHIP + " bg-brand-soft text-brand"}>Shortlisted by you</span>;
  if (s.lockedBy) return <span className={CHIP + " bg-warn-soft text-warn"}>Shortlisted by {s.lockedBy}</span>;
  return null;
}

/** The round ⋮ beside the counts: Upload CVs, and Delete (the ticked scoops, or the
 *  one being read), which asks once more before it goes. `what` names what Delete
 *  takes; empty = nothing to take yet. `refused` = another TA's scoop: Delete says
 *  why straight away instead of asking. */
function MoreMenu({ listMode, what, refused, onSelect, onDelete }: { listMode: boolean; what: string; refused: boolean; onSelect: (k: "shortlist" | "delete") => void; onDelete: () => void }) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const [sure, setSure] = useState(false);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="More for scoops"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setSure(false);
          setOpen((o) => !o);
        }}
        className="flex size-[max(2.6rem,35px)] items-center justify-center rounded-full border border-border bg-surface text-ink transition-colors hover:bg-surface-2"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-[1.1em]" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {shown && (
        <div ref={panel} role="menu" className="absolute right-0 top-full z-30 mt-2 w-[max(16rem,200px)] rounded-md border border-border bg-surface p-1.5 shadow-float">
          {listMode ? (
            <>
              <button type="button" role="menuitem" onClick={pick(() => onSelect("shortlist"))} className={MENU_ITEM + " text-ink hover:bg-surface-2"}>
                Select to shortlist
              </button>
              <button type="button" role="menuitem" onClick={pick(() => onSelect("delete"))} className={MENU_ITEM + " text-danger hover:bg-danger-soft"}>
                <Bin />
                Select to delete
              </button>
            </>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled={!what}
              onClick={refused || sure ? pick(onDelete) : () => setSure(true)}
              className={MENU_ITEM + (what ? " text-danger hover:bg-danger-soft" : " cursor-default text-ink-3")}
            >
              {!what ? "Delete" : sure ? `Press again to delete ${what}` : `Delete ${what}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const MENU_ITEM = "flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-small";

function Bin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-[1.1em] shrink-0" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <p className="flex items-baseline gap-2 text-[max(0.9625rem,13px)] text-ink-2">
      <b className="text-[max(1.6rem,18px)] font-normal leading-none text-ink">{n}</b>
      {label}
    </p>
  );
}

const FIELD_PILL =
  "flex h-[max(2.6rem,34px)] items-center gap-2 whitespace-nowrap rounded-full border border-border bg-white px-[max(1.1rem,12px)] text-[max(0.9625rem,13px)]";
const CHIP = "whitespace-nowrap rounded-full px-[max(0.75rem,8px)] py-[max(0.25rem,3px)] text-[max(0.8625rem,12px)] font-medium";
const SMALL = "rounded-full border border-border bg-white px-[max(0.8rem,9px)] py-[max(0.2rem,2px)] text-[max(0.8125rem,12px)] text-ink hover:bg-surface-2";

/** A Word CV cannot be drawn in the browser; it shows once the CV has been read. */
function WordWaiting({ name }: { name: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <span className="flex size-[max(3rem,36px)] items-center justify-center rounded-xl bg-[#2b579a] text-[max(1.1rem,14px)] font-bold text-white">W</span>
      <p className="text-[max(1rem,13px)] font-semibold text-ink">{name}&rsquo;s CV is a Word file</p>
      <p className="max-w-[22rem] text-[max(0.9125rem,12.5px)] text-ink-2">It shows here as pages once the CV has been read.</p>
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
