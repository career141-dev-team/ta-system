"use client";

import { ViewSkeleton } from "@/app/Skeleton";
import { door, jobFromAddress, useDoorMutation, useDoorQuery, useLive, type Answer, type DoorDone, cvUrl } from "@/lib/backend";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { DUR, EASE, gsap, useExit, useGSAP, swapIn, useSwap } from "@/lib/gsap";
import { BackButton, LinkedInIcon } from "./PipelineBoard";
import { Ring } from "./DatabaseCvsView";
import { xlsx } from "@/lib/xlsx";
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
  gender?: string;
  education?: string;
  /** The match against the job description, 0-100; absent until scored. */
  score?: number;
  linkedin?: string;
  /** Contact details, for the Excel export; not sent for another TA's claim. */
  phone?: string;
  email?: string;
  /** I shortlisted this person: the row stays, marked "Shortlisted by you". */
  mine?: boolean;
  /** Another TA shortlisted this person first (the collision lock): their first name. */
  lockedBy?: string;
};

const SCOOPS: Scoop[] = [
  { id: "s1", cv: "/cvs/s1.pdf", score: 88, gender: "Female", education: "BSc Engineering", linkedin: "linkedin.com/in/sample-nadeeka", phone: "+94 70 000 0001", email: "nadeeka@example.com", name: "Nadeeka Dilshan", title: "Assistant Manager, Production", location: "Colombo", company: "Croydon Kowloon Designs", sentBy: "Shehan", sentDay: "today", years: 6, skills: ["Production planning","Lean","Apparel"], notice: 30 },
  { id: "s2", cv: "/cvs/s2.pdf", score: 81, gender: "Male", education: "BSc Management", linkedin: "linkedin.com/in/sample-kasun", phone: "+94 70 000 0002", email: "kasun@example.com", name: "Kasun Perera", title: "Production Supervisor", location: "Gampaha", company: "Brandix Lanka Ltd", sentBy: "Shehan", sentDay: "today", years: 9, skills: ["Line balancing","Team leadership","Apparel"], notice: 60 },
  { id: "s3", cv: "/cvs/s3.pdf", score: 92, gender: "Female", education: "MBA", linkedin: "linkedin.com/in/sample-ishara", phone: "+94 70 000 0003", email: "ishara@example.com", name: "Ishara Fernando", title: "Assistant Manager, Production", location: "Colombo", company: "MAS Holdings", sentBy: "Rashmi", sentDay: "yesterday", years: 11, skills: ["Production","Costing","SAP"], notice: 90, mine: true },
  { id: "s4", cv: "/cvs/s4.pdf", score: 67, gender: "Male", education: "Diploma in Planning", linkedin: "linkedin.com/in/sample-tharindu", phone: "+94 70 000 0004", email: "tharindu@example.com", name: "Tharindu Silva", title: "Planning Executive", location: "Kandy", company: "Hirdaramani Group", sentBy: "Rashmi", sentDay: "yesterday", years: 4, skills: ["Planning","Merchandising","Excel"], notice: 30 },
  { id: "s5", cv: "/cvs/s5.pdf", score: 74, gender: "Female", education: "BSc Engineering", linkedin: "linkedin.com/in/sample-dilani", phone: "+94 70 000 0005", email: "dilani@example.com", name: "Dilani Jayasinghe", title: "Quality Assurance Lead", location: "Negombo", company: "Teejay Lanka PLC", sentBy: "Dinesh", sentDay: "2 days ago", years: 5, skills: ["Quality assurance","Textiles","ISO 9001"], notice: 0, lockedBy: "Hasini" },
  { id: "s6", cv: "/cvs/s6.pdf", score: 59, gender: "Male", education: "BSc Management", linkedin: "linkedin.com/in/sample-ruwan", phone: "+94 70 000 0006", email: "ruwan@example.com", name: "Ruwan Bandara", title: "Assistant Manager, Production", location: "Colombo", company: "Croydon Kowloon Designs", sentDay: "2 days ago", years: 2, skills: ["Production","Training","Apparel"], notice: 0 },
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

type Filters = { q: string; exp: string; who: string; gender: string; education: string; location: string };
const NO_FILTERS: Filters = { q: "", exp: "", who: "", gender: "", education: "", location: "" };
const GENDERS: MenuOption[] = [
  { value: "", label: "Any gender" },
  { value: "Female", label: "Female", hint: "and anyone with no gender on file" },
  { value: "Male", label: "Male", hint: "and anyone with no gender on file" },
];
const tidy = (v?: string) => v?.trim().replace(/\s+/g, " ") ?? "";
const same = (a: string | undefined, b: string) => tidy(a).toLowerCase() === tidy(b).toLowerCase();
/** "Any ..." and each value the list holds once, however a CV spelled its case or
 *  spaces; a kept filter stays listed. */
const choices = (any: string, values: (string | undefined)[], kept: string): MenuOption[] => {
  const seen = new Map<string, string>();
  for (const v of [...values, kept].map(tidy)) if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  return [{ value: "", label: any }, ...[...seen.values()].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }))];
};
/** A link from a CV is only followed when it really is LinkedIn's. */
const profileUrl = (link?: string) => {
  const t = link?.trim();
  if (!t) return undefined;
  const url = /^https?:\/\//i.test(t) ? t : "https://" + t;
  return /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\//i.test(url) ? url : undefined;
};

function matches(s: Scoop, f: Filters) {
  const q = f.q.trim().toLowerCase();
  if (q && ![s.name, s.title, s.company].some((t) => t.toLowerCase().includes(q))) return false;
  if (!inRange(s.years, f.exp)) return false;
  // Nothing on file passes: most records hold no gender (the search fault fixed 25 Nov).
  if (f.gender && s.gender && s.gender.toLowerCase() !== f.gender.toLowerCase()) return false;
  if (f.education && !same(s.education, f.education)) return false;
  // "Colombo" also finds "Colombo 03".
  if (f.location && !(s.location ?? "").toLowerCase().includes(f.location.toLowerCase())) return false;
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

type Upload = {
  id: string; file: string; url?: string; bad?: boolean; state: "reading" | "done" | "failed"; sentBy?: string;
  // Signed in: what the CV reader itself reports (ui/opening:scoopStatus) - never a timer.
  live?: boolean; label?: string; progress?: number; note?: string; fault?: "you" | "us"; name?: string | null; attention?: boolean;
};
type DoorStatus = Answer<{ uploads: { id: string; state: "reading" | "done" | "held" | "failed" | "missing"; label?: string; progress?: number; note?: string | null; fault?: "you" | "us"; name?: string | null }[] }>;

/** Scoops, as the TA System has it: the counts, the upload panel (only for people who
 *  can act on the opening), and every scoop on the opening with Shortlist. Clicking a
 *  row opens the reading view - the list on the left, that CV on the right - and Back
 *  returns to the list. Shortlisted rows stay, marked, as in the TA System. */
type DoorScoops = Answer<{
  me: string;
  names: Record<string, string>;
  people: { id: string; name: string; title: string | null; company: string | null; location: string | null; years: number | null; noticeDays: number | null; ownerId: string | null; addedAt: number; sentBy: string | null; gender: string | null; qualification: string | null; education: string | null; score: number | null; linkedinUrl: string | null; phone: string | null; email: string | null }[];
}>;
const first = (n?: string) => n?.split(" ")[0];
const dayWords = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

/** The backend hands out its upload address on the "actions" host, which a browser on new.career141.com cannot reach
 * (25 Nov: every scoop failed with "Failed to fetch"). The API host takes the same file with the same token. */
function storageUrl(url: string): string {
  const api = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!api) return url;
  try {
    const u = new URL(url);
    return new URL(u.pathname + u.search, api).toString();
  } catch {
    return url;
  }
}

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
          gender: p.gender ?? undefined, education: p.qualification ?? p.education ?? undefined,
          score: p.score == null ? undefined : Math.round(p.score),
          linkedin: p.linkedinUrl ?? undefined, phone: p.phone ?? undefined, email: p.email ?? undefined,
          mine: !!p.ownerId && p.ownerId === real.me,
          lockedBy: p.ownerId && p.ownerId !== real.me ? first(real.names[p.ownerId]) ?? "another TA" : undefined,
        })),
      );
  }
  const claim = useDoorMutation(door.shortlist);
  const takeOff = useDoorMutation(door.removeFromOpening);
  const uploadUrl = useDoorMutation(door.scoopUploadUrl);
  const queueScoop = useDoorMutation(door.queueScoop);
  const retryScoop = useDoorMutation(door.retryScoop);
  const addLinkedin = useDoorMutation(door.addLinkedin);
  // The row where a missing LinkedIn link is being typed in.
  const [linking, setLinking] = useState<string | null>(null);
  const saveLink = (s: Scoop, link: string) => {
    if (!/linkedin\.com\/in\/[^/?#\s]+/i.test(link)) return say("Paste a LinkedIn profile link, like linkedin.com/in/name.", undefined, true);
    if (job)
      return void (addLinkedin({ applicationId: s.id, url: link }) as Promise<DoorDone | undefined>).then(
        (d) => {
          if (d && !d.ok) return say(d.message, undefined, true);
          setLinking(null);
          say(" LinkedIn link saved", s.name);
        },
        () => say("The link could not be saved. Try again.", undefined, true),
      );
    setList((l) => l.map((x) => (x.id === s.id ? { ...x, linkedin: link.trim() } : x)));
    setLinking(null);
    say(" LinkedIn link saved", s.name);
  };
  // Signed in: each CV goes to the backend's file store, then into the scoop reading
  // queue (ui/opening:queueScoop re-checks size and type); it joins the list once read.
  const sendScoops = async (files: File[]) => {
    let sent = 0;
    let why = "";
    const rows: Upload[] = [];
    for (const f of files) {
      try {
        const u = (await uploadUrl({})) as { ok: boolean; url?: string; message?: string } | undefined;
        if (!u?.ok || !u.url) throw new Error(u?.message ?? "Could not start the upload.");
        const res = await fetch(storageUrl(u.url), { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f });
        if (!res.ok) throw new Error("The file did not upload. Try again.");
        const { storageId } = (await res.json()) as { storageId: string };
        const q = (await queueScoop({ openingId: job!, storageId, fileName: f.name })) as (DoorDone & { cvUploadId?: string }) | undefined;
        if (!q?.ok || !q.cvUploadId) throw new Error(q && !q.ok ? q.message : "The CV could not be queued.");
        sent++;
        rows.push({ id: q.cvUploadId, file: f.name, state: "reading", live: true, label: "Sent - waiting for a CV reader", progress: 4, sentBy: sentBy || undefined });
      } catch (e) {
        why = e instanceof Error ? e.message : "The file did not upload.";
        // A network drop is not the person's doing; a refusal of the file itself is.
        const net = /failed to fetch|network|did not upload|load failed/i.test(why);
        rows.push({
          id: "x" + ++seq.current, file: f.name, state: "failed", live: true,
          note: net ? "The file did not reach our server - check your connection and upload it again. If it keeps happening it is on our side." : why,
          fault: net ? "us" : "you",
        });
      }
    }
    setUploads((u) => [...u, ...rows]);
    if (sent) say(` - the real progress shows below.`, `${sent} CV${sent === 1 ? "" : "s"} sent for reading`);
    if (why) say(`${files.length - sent} not sent - see the reason below`, undefined, true);
  };
  const [mode, setMode] = useState<"list" | "read">("list");
  const [chosen, setChosen] = useState(SCOOPS[0].id);
  const [picked, setPicked] = useState<string[]>([]);
  // ⋮ > "Select to shortlist / delete" turns the tickboxes on; the toolbar button then
  // carries the chosen action and the count. `done` shows the drawn tick after it runs.
  const [selecting, setSelecting] = useState<null | "shortlist" | "delete">(null);
  const [done, setDone] = useState<null | "shortlist" | "delete">(null);
  // The row whose bin was pressed once ("Delete?"), and the ticked rows' Delete asked once.
  const [sureRow, setSureRow] = useState<string | null>(null);
  const [surePicked, setSurePicked] = useState(false);
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
  // Signed in, the reading pipeline reports each CV's stage by itself (a live query).
  const watching = uploads.filter((u) => u.live && u.state === "reading").map((u) => u.id);
  const status = useDoorQuery(door.scoopStatus, watching.length ? { cvUploadIds: watching } : "skip") as DoorStatus | undefined;
  const [seenStatus, setSeenStatus] = useState<DoorStatus | undefined>(undefined);
  if (status !== seenStatus) {
    setSeenStatus(status);
    if (status?.ok) {
      const by = new Map(status.uploads.map((r) => [r.id, r]));
      setUploads((all) =>
        all.map((x) => {
          const r = x.live && x.state === "reading" ? by.get(x.id) : undefined;
          if (!r) return x;
          if (r.state === "failed") return { ...x, state: "failed", label: r.label, progress: 100, note: r.note ?? undefined, fault: r.fault ?? "us" };
          if (r.state === "missing") return { ...x, state: "failed", note: "We lost track of this upload. Upload the CV again.", fault: "us" };
          if (r.state === "done" || r.state === "held") return { ...x, state: "done", label: r.state === "held" ? "Needs attention" : "Read and added", progress: 100, name: r.name, note: r.note ?? undefined, attention: r.state === "held" };
          return { ...x, label: r.label, progress: r.progress };
        }),
      );
    }
  }
  // A status read that failed or was refused used to be ignored, so the bar sat at its first 4% until a
  // refresh (26 Nov). Now the card says so; the next good answer clears it.
  const statusFault = watching.length && status && !status.ok ? status.message : "";
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
  // The ticked scoops that may be exported (never another TA's claim).
  const exporting = list.filter((s) => picked.includes(s.id) && !s.lockedBy);
  const exportExcel = () => {
    if (!exporting.length) return;
    const rows = exporting.map((s) => [s.name, s.phone ?? "", s.email ?? "", profileUrl(s.linkedin) ?? ""]);
    const url = URL.createObjectURL(
      new Blob([xlsx("Scoops", ["Name", "Phone", "Email", "LinkedIn link"], rows)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `Scoops - ${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    say(" exported to Excel", `${rows.length} candidate${rows.length === 1 ? "" : "s"}`);
  };
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
  const failed = uploads.filter((u) => u.state === "failed");
  const finished = uploads.length - readingNow;
  // Signed in: the true overall share, the mean of what the reader reports for each CV.
  const liveUps = uploads.filter((u) => u.live && u.state !== "failed");
  const overall = liveUps.length ? Math.round(liveUps.reduce((n, u) => n + (u.state === "done" ? 100 : (u.progress ?? 0)), 0) / liveUps.length) : null;
  useGSAP(
    () => {
      const bar = root.current?.querySelector("[data-read-bar]");
      if (bar) gsap.to(bar, { scaleX: !readingNow ? 1 : overall != null ? Math.max(0.04, overall / 100) : Math.max(0.12, (finished / uploads.length) * 0.9 + 0.08), duration: DUR.slow, ease: EASE.out });
    },
    { dependencies: [readingNow, finished, uploads.length, overall], scope: root, revertOnUpdate: false },
  );
  // Each CV's own bar, by GSAP like the overall one (DESIGN.md: motion through gsap.ts only).
  useGSAP(
    () => {
      root.current?.querySelectorAll<HTMLElement>("[data-row-bar]").forEach((el) => {
        gsap.to(el, { scaleX: Number(el.dataset.rowBar) / 100, duration: DUR.slow, ease: EASE.out });
      });
    },
    { dependencies: [uploads], scope: root, revertOnUpdate: false },
  );
  // All read and none failed: the card goes by itself a few seconds later (the CVs are in the list).
  const allRead = uploads.length > 0 && !readingNow && !failed.length;
  useEffect(() => {
    if (!allRead) return;
    const t = setTimeout(() => setUploads((u) => u.filter((x) => x.state !== "done")), 4000);
    return () => clearTimeout(t);
  }, [allRead]);

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
    take.forEach((s) => sendToPipeline({ name: s.name, title: s.title, company: s.company, location: s.location, years: s.years, notice: s.notice, cv: s.cv, channel: "SCOOPS" }));
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
    if (u.live && !u.id.startsWith("x")) {
      setUploads((all) => all.map((x) => (x.id === u.id ? { ...x, state: "reading", label: "Waiting for a CV reader", progress: 4, note: undefined } : x)));
      void retryScoop({ cvUploadId: u.id }).then((r) => {
        const d = r as DoorDone | undefined;
        if (d && !d.ok) setUploads((all) => all.map((x) => (x.id === u.id ? { ...x, state: "failed", note: d.message, fault: "us" } : x)));
      });
      return;
    }
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
            {mode === "list" && !selecting && picked.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setPicked([]);
                    setSurePicked(false);
                  }}
                  className="h-[max(2.6rem,34px)] rounded-full px-[max(1rem,12px)] text-[max(0.9625rem,13.5px)] text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={!pickable.length}
                  onClick={() => {
                    shortlist(pickable);
                    setPicked([]);
                  }}
                  className="flex h-[max(2.6rem,34px)] items-center rounded-full bg-brand px-[max(1.3rem,14px)] text-[max(0.9625rem,13.5px)] font-medium text-white transition-colors hover:bg-brand-strong disabled:pointer-events-none disabled:opacity-50"
                >
                  Shortlist · {pickable.length}
                </button>
                {/* The same export as the ⋮ menu, where the ticks are. */}
                <button
                  type="button"
                  disabled={!exporting.length}
                  onClick={exportExcel}
                  className="h-[max(2.6rem,34px)] rounded-full border border-border-strong bg-surface px-[max(1.3rem,14px)] text-[max(0.9625rem,13.5px)] font-medium text-ink hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  Export · {exporting.length}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!surePicked) return setSurePicked(true);
                    setSurePicked(false);
                    remove([...picked]);
                  }}
                  onBlur={() => setSurePicked(false)}
                  className="flex h-[max(2.6rem,34px)] items-center gap-2 rounded-full bg-danger px-[max(1.3rem,14px)] text-[max(0.9625rem,13.5px)] font-medium text-white transition-opacity hover:opacity-90"
                >
                  <Bin />
                  {surePicked ? `Press again to delete ${picked.length}` : `Delete · ${picked.length}`}
                </button>
              </>
            )}
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
              exportCount={exporting.length}
              onExport={exportExcel}
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
            // The reading card (26 Nov, owner: "stuck at 4%... no close button... not the design system"):
            // a white card like the rest of the board, one overall bar, one row per CV with its own x,
            // and an x that closes the whole card. Closing never stops the reading - each CV still
            // joins the list once it is read. It closes by itself a few seconds after all are read.
            <div data-scoop-top role="status" className="mt-[max(1rem,8px)] rounded-md border border-border bg-surface px-[max(1.4rem,12px)] py-[max(1rem,10px)] shadow-card">
              <div className="flex items-center gap-[max(1rem,9px)]">
                <span className={"size-[max(0.6rem,7px)] shrink-0 rounded-full " + (readingNow ? "animate-pulse bg-brand" : failed.length ? "bg-danger" : "bg-success")} />
                <p className="min-w-0 truncate text-small font-medium text-ink">
                  {readingNow
                    ? overall != null
                      ? `Reading ${readingNow} CV${readingNow === 1 ? "" : "s"} · ${overall}% done`
                      : `Reading ${readingNow} CV${readingNow === 1 ? "" : "s"} · about ${mins} minute${mins === 1 ? "" : "s"}`
                    : `Read ${finished - failed.length} CV${finished - failed.length === 1 ? "" : "s"}${failed.length ? ` · ${failed.length} not read` : ""}`}
                </p>
                <div className="h-[max(0.4rem,5px)] w-[max(22rem,60px)] min-w-0 overflow-hidden rounded-full bg-surface-2 max-md:flex-1">
                  <div data-read-bar className="h-full origin-left scale-x-0 rounded-full bg-brand" />
                </div>
                <button
                  type="button"
                  onClick={() => setUploads([])}
                  aria-label="Close the upload progress"
                  title={readingNow ? "Close - the CVs keep reading and join the list when done" : "Close"}
                  className="ml-auto flex size-[max(2rem,28px)] shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <Cross />
                </button>
              </div>
              {statusFault && <p className="mt-2 text-small text-danger">{statusFault}</p>}
              <ul className="mt-[max(0.6rem,6px)] space-y-[max(0.6rem,6px)]">
                {uploads.map((u) => {
                  const pct = u.state === "reading" ? (u.progress ?? 0) : 100;
                  return (
                    <li key={u.id} role={u.state === "failed" ? "alert" : undefined} className="text-small">
                      <div className="flex flex-wrap items-center gap-x-[max(0.8rem,8px)] gap-y-1">
                        <span className="min-w-0 truncate font-medium text-ink">{u.name || u.file}</span>
                        {u.state === "failed" ? (
                          <span className="rounded-full bg-danger-soft px-2 text-caption font-medium text-danger">{u.fault === "you" ? "Needs your action" : u.note ? "On our side" : "Could not be read"}</span>
                        ) : (
                          <span className={u.attention ? "text-warn" : u.state === "done" ? "text-success" : "text-ink-2"}>{u.label ?? (u.state === "done" ? "Read and added" : "Reading")}</span>
                        )}
                        <span className="ml-auto flex items-center gap-[max(0.6rem,6px)]">
                          {u.state === "failed" ? (
                            <button type="button" onClick={() => retry(u)} className={SMALL}>
                              Try again
                            </button>
                          ) : (
                            <span className="font-mono text-mono tabular-nums text-ink-3">{pct}%</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setUploads((all) => all.filter((x) => x.id !== u.id))}
                            aria-label={`Hide ${u.file} from this list`}
                            className="flex size-[max(1.6rem,22px)] items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                          >
                            <Cross small />
                          </button>
                        </span>
                      </div>
                      {u.state !== "failed" && (
                        <div className="mt-1 h-[max(0.25rem,3px)] overflow-hidden rounded-full bg-surface-2">
                          <div data-row-bar={pct} className={"h-full origin-left scale-x-0 rounded-full " + (u.attention ? "bg-warn" : u.state === "done" ? "bg-success" : "bg-brand")} />
                        </div>
                      )}
                      {u.note && <p className={"mt-1 " + (u.state === "failed" ? "text-danger" : "text-ink-2")}>{u.note}</p>}
                    </li>
                  );
                })}
              </ul>
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
            <PillMenu options={GENDERS} initial={applied.gender} onChange={(gender) => setFilters({ gender })} mark="tick" pillClass={FIELD_PILL + " text-ink-2"} />
            <PillMenu options={choices("Any education", list.map((s) => s.education), applied.education)} initial={applied.education} onChange={(education) => setFilters({ education })} mark="tick" pillClass={FIELD_PILL + " text-ink-2"} />
            <PillMenu options={choices("Any location", list.map((s) => s.location), applied.location)} initial={applied.location} onChange={(location) => setFilters({ location })} mark="tick" pillClass={FIELD_PILL + " text-ink-2"} />
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
                {/* Every row has its tickbox (26 Nov, owner: uploaded CVs had no select). Ticked rows get
                    Shortlist / Delete beside the counts; the ⋮ "Select to…" modes still work. */}
                {CAN_ACT && (
                  <input
                    type="checkbox"
                    disabled={selecting === "shortlist" ? !free(s) : !!s.lockedBy}
                    checked={picked.includes(s.id)}
                    aria-label={`Select ${s.name}`}
                    onChange={() => setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                    className={"size-[max(1.15rem,16px)] shrink-0 cursor-pointer disabled:cursor-default disabled:opacity-30 " + (selecting === "delete" ? "accent-danger" : "accent-brand")}
                  />
                )}
                {s.score != null ? (
                  <Ring score={s.score} />
                ) : (
                  <span title="Not scored yet" className="flex size-[max(3.25rem,40px)] shrink-0 items-center justify-center rounded-full bg-info-soft text-[max(1rem,12px)] font-medium text-info">{initials(s.name)}</span>
                )}
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
                  {profileUrl(s.linkedin) ? (
                    <a
                      href={profileUrl(s.linkedin)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${s.name}'s LinkedIn profile`}
                      title="Open the LinkedIn profile"
                      className="flex size-[max(2.6rem,34px)] items-center justify-center rounded-full hover:bg-surface-2"
                    >
                      <LinkedInIcon className="size-[max(1.5rem,20px)]" />
                    </a>
                  ) : CAN_ACT && !s.lockedBy ? (
                    <button
                      type="button"
                      onClick={() => setLinking((id) => (id === s.id ? null : s.id))}
                      aria-expanded={linking === s.id}
                      aria-label={`Add ${s.name}'s LinkedIn link`}
                      title="No LinkedIn link - add it"
                      className="relative flex size-[max(2.6rem,34px)] items-center justify-center rounded-full hover:bg-surface-2"
                    >
                      <LinkedInIcon className="size-[max(1.5rem,20px)] opacity-30 grayscale" />
                      <span aria-hidden="true" className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-full bg-brand text-caption font-medium text-white">+</span>
                    </button>
                  ) : (
                    <span title="No LinkedIn link on record" className="flex size-[max(2.6rem,34px)] items-center justify-center opacity-25 grayscale">
                      <LinkedInIcon className="size-[max(1.5rem,20px)]" />
                    </span>
                  )}
                  <RowAction s={s} onShortlist={() => shortlist([s.id])} />
                  {CAN_ACT && !s.lockedBy && (
                    // Delete asks once more on the row itself; the second press takes it off the job.
                    <button
                      type="button"
                      onClick={() => {
                        if (sureRow !== s.id) return setSureRow(s.id);
                        setSureRow(null);
                        remove([s.id]);
                      }}
                      onBlur={() => setSureRow((r) => (r === s.id ? null : r))}
                      aria-label={sureRow === s.id ? `Press again to delete ${s.name}` : `Delete ${s.name}`}
                      title={sureRow === s.id ? "Press again to delete" : "Delete this scoop"}
                      className={
                        "flex h-[max(2.6rem,34px)] items-center justify-center gap-1.5 rounded-full transition-colors " +
                        (sureRow === s.id ? "bg-danger px-[max(1rem,12px)] text-small font-medium text-white" : "w-[max(2.6rem,34px)] text-ink-3 hover:bg-danger-soft hover:text-danger")
                      }
                    >
                      <Bin />
                      {sureRow === s.id && "Delete?"}
                    </button>
                  )}
                </div>
                {linking === s.id && !profileUrl(s.linkedin) && (
                  <form
                    className="flex w-full flex-wrap items-center justify-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveLink(s, String(new FormData(e.currentTarget).get("link") ?? ""));
                    }}
                    onKeyDown={(e) => e.key === "Escape" && setLinking(null)}
                  >
                    <input
                      autoFocus
                      name="link"
                      aria-label={`${s.name}'s LinkedIn profile link`}
                      placeholder="https://www.linkedin.com/in/name"
                      className={FIELD_PILL + " w-[max(26rem,200px)] min-w-0 text-ink outline-none placeholder:text-ink-3 focus:border-brand max-md:w-full"}
                    />
                    <button type="button" onClick={() => setLinking(null)} className="h-[max(2.6rem,34px)] rounded-full px-3 text-small text-ink-2 hover:bg-surface-2 hover:text-ink">
                      Cancel
                    </button>
                    <button type="submit" className="h-[max(2.6rem,34px)] rounded-full bg-brand px-[max(1.3rem,14px)] text-small font-medium text-white hover:bg-brand-strong">
                      Save link
                    </button>
                  </form>
                )}
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
function MoreMenu({ listMode, what, refused, onSelect, onDelete, exportCount, onExport }: { listMode: boolean; what: string; refused: boolean; onSelect: (k: "shortlist" | "delete") => void; onDelete: () => void; exportCount: number; onExport: () => void }) {
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
        <div ref={panel} role="menu" className="absolute right-0 top-full z-30 mt-2 w-[max(17rem,230px)] rounded-md border border-border bg-surface p-1.5 shadow-float">
          <button
            type="button"
            role="menuitem"
            disabled={!exportCount}
            onClick={pick(onExport)}
            className={MENU_ITEM + " mb-1 border-b border-border pb-2.5 enabled:hover:bg-success-soft disabled:cursor-default"}
          >
            <span className={"flex size-[max(2.25rem,30px)] shrink-0 items-center justify-center rounded-sm " + (exportCount ? "bg-success-soft text-success" : "bg-surface-2 text-ink-3")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[60%]" aria-hidden="true">
                <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6ZM14 3v6h6M9 12l6 6M15 12l-6 6" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className={"block font-medium " + (exportCount ? "text-ink" : "text-ink-3")}>Export to Excel{exportCount ? ` · ${exportCount}` : ""}</span>
              <span className="block text-caption text-ink-3">{exportCount ? "Phone, email and LinkedIn link" : "Tick candidates first"}</span>
            </span>
          </button>
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

function Cross({ small }: { small?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={small ? "size-[0.95em]" : "size-[1.15em]"} aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

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
