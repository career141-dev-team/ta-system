"use client";

import dynamic from "next/dynamic";
import Automations from "./Automations";
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { DUR, EASE, gsap, useExit, useGSAP } from "@/lib/gsap";
import { useRole } from "@/lib/role";
import { SHOW_TABS } from "./view";
import PillMenu, { type MenuOption } from "./PillMenu";
import TickList from "./TickList";
import { warmCv, warmPdf } from "./CvPages";
import CardMenu from "./CardMenu";
import MoveForm from "./MoveForm";
import AddCandidate from "./AddCandidate";
import Toast from "./Toast";
import { STAGES, checkMove, movesFrom, type Needs } from "./pipelineRules";
import WorkdayBlocked from "./WorkdayBlocked";
import { arrivals, onArrival, type Arrival } from "./pipelineInbox";
import { useWorkdayGate } from "@/lib/workday";
import { useFilters } from "@/lib/filters";
import { NoResults } from "@/app/FilterBits";
import { LIVE, door, jobFromAddress, STAGE_KEYS, useDoorMutation, useDoorQuery, useLive, type DoorBoard, type DoorCard, type DoorDone, type DoorOpenings, cvUrl, candidateCall, candidateOffers } from "@/lib/backend";

// The CV preview is its own download, fetched while the screen is idle (OpeningView).
const CvPreview = dynamic(() => import("./CvPreview"), { ssr: false });

// Placeholder: sample candidates from the design, until the board reads the backend.
// When it does, each column reads its own first page (about 20 cards) from an index
// and loads the next page on scroll; the count beside a stage is a stored number,
// not a count of rows. Nothing here may read a whole stage at once.
type Person = {
  name: string;
  title: string;
  company: string;
  location: string;
  years: string;
  phone: string;
  email: string;
};

// The filters, filled with what the TA System really has (read from its code,
// 12 Nov 2026), not made-up choices:
// - Source = the application's sourcing channel (`SourcingChannel` + `CHANNEL_LABEL`,
//   the Guidelines tab's codes).
// - All jobs = this opening only, or every opening you work on.
const JOBS: MenuOption[] = [
  { value: "all", label: "All my jobs", pillLabel: "All jobs" },
  { value: "this", label: "This job only" },
];
const SOURCES: MenuOption[] = [
  { value: "", label: "All sources", pillLabel: "Source" },
  { value: "DA", label: "Direct applicant", hint: "Snippet, WhatsApp status or channel" },
  { value: "IM", label: "In-Mail" },
  { value: "FB", label: "Facebook" },
  { value: "E", label: "Email" },
  { value: "L", label: "LinkedIn" },
  { value: "HH", label: "Direct hunt" },
  { value: "SCOOP", label: "Database", hint: "Shortlisted and reviewed" },
];
const CHANNELS = SOURCES.slice(1).map((o) => o.value);
const NOTICE: MenuOption[] = [
  { value: "", label: "Any notice", pillLabel: "Notice" },
  { value: "30", label: "30 days or less" },
  { value: "60", label: "60 days or less" },
];
const MARKS: MenuOption[] = [
  { value: "", label: "All candidates", pillLabel: "Add-on / Backup" },
  { value: "addOn", label: "Add-ons only" },
  { value: "backup", label: "Backups only" },
  { value: "neither", label: "Neither" },
];

type Card = Person & {
  id: string;
  mine: boolean;
  owned: boolean;
  channel: string;
  /** Still needed before Director Review: "CV", "Salary", "Notice Period". */
  missing: string[];
  addOn?: boolean;
  backup?: boolean;
  /** The candidate's LinkedIn profile address, when the backend has it. */
  linkedin?: string;
  /** Years of experience and notice period in days, for the two filters. */
  yearsN: number;
  noticeDays: number;
  /** Their own CV file, when they came from a view that had it. */
  cv?: string;
  /** The backend holds no CV file for them yet: nothing to open (19 Nov). */
  noCv?: boolean;
};

/** The candidate's CV file. Sample: the two demo CVs in public/cvs; the real board
 *  reads each candidate's own. */
const cvFileOf = (c: Card) => c.cv ?? (c.noCv ? "" : c.name === "Rashini Kaweesha" ? "/cvs/p1.pdf" : "/cvs/p2.pdf");

/** Someone shortlisted in another view of this opening, as a card: theirs to work,
 *  with the CV they came with; salary and notice period still to come from the
 *  follow-up, so Director Review waits for them (the old rule). */
const fromArrival = (a: Arrival, n: number): Card => ({
  name: a.name,
  title: a.title,
  company: a.company || "Not on record",
  location: a.location || "Not on record",
  years: a.years ? a.years + " years" : "Not on record",
  phone: "+94 77 000 0000",
  email: "candidate@example.com",
  id: "in-" + n,
  mine: true,
  owned: true,
  channel: a.channel ?? "",
  missing: [...(a.cv ? [] : ["CV"]), "Salary", "Notice Period"],
  yearsN: a.years ?? 0,
  noticeDays: a.notice ?? 0,
  cv: a.cv,
});

/** Placeholder: the person's other open jobs (the same sample ones as Today), and
 *  the set a shortlist joins, until the backend sends them. */
const OTHER_JOBS = ["Finance Manager - Hayleys", "Production Executive - MAS Holdings", "HR Business Partner - Dialog"].map((label) => ({ id: label, label }));
const OPEN_SET = 3;

/** The door's words for what is missing, in the board's own chips. */
const MISSING: Record<string, string> = { "a CV": "CV", "expected salary": "Salary", "notice period": "Notice Period" };

/** A real card from the backend door (src/lib/backend.tsx), in this board's shape. */
const fromDoor = (c: DoorCard): Card => ({
  id: c.id,
  name: c.name,
  title: c.title ?? "Not on record",
  company: c.company ?? "Not on record",
  location: c.location ?? "Not on record",
  years: c.years != null ? `${c.years} years` : "Not on record",
  phone: c.phone ?? "Not on record",
  email: c.email ?? "Not on record",
  mine: c.mine,
  owned: c.owned,
  channel: c.channel ?? "",
  missing: c.missing.map((m) => MISSING[m] ?? m),
  addOn: c.addOn,
  backup: c.backup,
  linkedin: c.linkedinUrl ?? undefined,
  // Not known stays not known (NaN): a "30 days or less" filter must not let an
  // unknown notice through as 0 (19 Nov audit).
  yearsN: c.years ?? Number.NaN,
  noticeDays: c.noticeDays ?? Number.NaN,
  // The candidate's own CV (D6); none when the backend says it is still missing -
  // then the card says so instead of opening a sample PDF.
  ...(c.missing.includes("a CV") ? { noCv: true } : { cv: cvUrl({ app: c.id }) }),
});

/** Moves whose details (dates, package, signed offer letter) the backend does not check yet (PR 1b). */
// Interview, Offer and Placed are written by the old server's shared rules (D7,
// ta-system #30): the interview booked, the offer made, the placement recorded with
// its signed letter; each moves the card itself, as in AURA.
const MODE: Record<string, "in_person" | "video" | "phone"> = { "In person": "in_person", Video: "video", Phone: "phone" };
async function closingWrite(to: string, openingId: string, appId: string, f: FormData): Promise<{ ok: boolean; message: string }> {
  const v = (k: string) => String(f.get(k) ?? "").trim();
  const money = { salary: Number(v("salary")), salaryBasis: v("per") === "year" ? "annual" : "monthly", currency: v("currency") === "USD" ? "USD" : "LKR" };
  if (to === "Interview")
    return candidateCall({ do: "interview", openingId, appId, body: {
      action: "schedule", title: "Interview", date: v("date"), time: v("time"), timezone: "Asia/Colombo", location: v("where"),
      mode: MODE[v("how")] ?? "video", interviewers: [], durationMins: Number(v("minutes")) || null, notes: "",
    } });
  if (to === "Offer") return candidateCall({ do: "closing", openingId, appId, body: { action: "offer", ...money, startDate: v("start"), terms: "" } });
  // A placement is for the candidate's offer still standing (pending or accepted).
  const offers = await candidateOffers(openingId, appId);
  if (offers === null) return { ok: false, message: "Could not read their offer. Try again." };
  const offer = offers.find((o) => o.status === "accepted") ?? offers.find((o) => o.status === "pending");
  if (!offer) return { ok: false, message: "Make them an offer first (move them to Offer), then place them." };
  const letter = f.get("letter");
  return candidateCall(
    { do: "closing", openingId, appId, body: { action: "place", offerId: offer.id, joinDate: v("join"), ...money, packageNotes: v("package") } },
    letter instanceof File && letter.size > 0 ? letter : null,
  );
}

/** Placeholder: the other TAs on this opening, until the backend sends the team. */

const PEOPLE: Person[] = [
  {
    name: "Rashini Kaweesha",
    title: "UI/UX Designer",
    company: "MAS Bodyline (Pvt) Ltd",
    location: "Colombo",
    years: "5 years",
    phone: "+94 77 000 0000",
    email: "nipuna@example.com",
  },
  {
    name: "Nipuna Akalanka",
    title: "Assistant Manager production",
    company: "MAS Bodyline (Pvt) Ltd",
    location: "Colombo",
    years: "5 years",
    phone: "+94 77 000 0000",
    email: "nipuna@example.com",
  },
];

// The stages and the rules of a move live in pipelineRules.ts (the TA System's own).

/** A column's count as the backend gives it: 500 at most, then "500+". */
const shownCount = (col: { count: number; capped: boolean } | undefined, have: number) =>
  col ? `${col.count}${col.capped ? "+" : ""}` : String(have);

/** A card-shaped placeholder while the real board is read. */
const CardSkeleton = () => (
  <div role="status" aria-label="Loading" className="flex flex-col gap-[max(0.6rem,7px)] rounded-md border border-border bg-white p-[max(1rem,12px)]">
    <div className="flex items-center gap-[max(0.6rem,7px)]">
      <span className="shimmer size-[max(2.4rem,32px)] shrink-0 rounded-full" />
      <span className="flex flex-1 flex-col gap-1.5">
        <span className="shimmer h-3 w-3/4 rounded-sm" />
        <span className="shimmer h-2.5 w-1/2 rounded-sm" />
      </span>
    </div>
    {[90, 70, 80, 60].map((w) => (
      <span key={w} className="shimmer h-2.5 rounded-sm" style={{ width: `${w}%` }} />
    ))}
    <div className="flex gap-1.5">
      {[0, 1, 2].map((k) => (
        <span key={k} className="shimmer h-4 w-12 rounded-md" />
      ))}
    </div>
  </div>
);

/** Six sample cards per stage; the first stage starts with the design's first card.
 *  Owner and source vary so the filters have something to filter; every third card
 *  is yours or nobody's yet - another TA's candidates are not on the board at all
 *  (owner, 18 Nov 2026: the backend sends a TA only their own, so no ash locked card) -
 *  and in the two follow-up stages every other card still lacks its notice period, so
 *  the Director Review rule has something to refuse. */
const cardsFor = (i: number): Card[] =>
  [0, 1, 2, 3, 4, 5].filter((n) => n % 3 !== 1).map((n) => ({
    ...(i === 0 && n === 0 ? PEOPLE[0] : PEOPLE[1]),
    id: `${i}-${n}`,
    mine: n % 3 === 0,
    // Nobody owns a candidate only before the first shortlist, so only in the
    // two follow-up stages; from Director Review on, everyone has an owner.
    owned: i >= 2 || n % 3 !== 2,
    missing: i < 2 && n % 2 === 0 ? ["Notice Period"] : [],
    channel: CHANNELS[(i + n) % CHANNELS.length],
    yearsN: [5, 3, 8, 12, 16, 6][n],
    years: [5, 3, 8, 12, 16, 6][n] + " years",
    noticeDays: [30, 60, 90, 30, 45, 60][n],
  }));

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** How an overlay (the moved box, the CV preview) leaves: it fades. */
const FADE_OUT = { opacity: 0 };
const MENU_OUT = { opacity: 0, y: -6, scale: 0.97 };

const TOOL_PILL =
  "flex h-[max(2.4rem,33px)] items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-white px-[max(1rem,13px)] text-[max(0.9125rem,13.5px)] text-ink";

/** The element on screen for `sel`: Next keeps earlier visits of this page in the
 *  document, hidden, so a page-wide lookup could find a copy nobody sees. */
const onScreen = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((el) => el.getClientRects().length > 0) ?? null;

export default function PipelineBoard() {
  // Filters are kept per opening for the visit (Back, reload and tab switches find them
  // as left) and Reset puts them all back - src/lib/filters.ts.
  const { f, set, reset, active } = useFilters(
    "pipeline:" + (typeof window === "undefined" ? "" : (jobFromAddress() ?? "demo")),
    { mode: "board" as "board" | "list", q: "", job: "all", source: "", noticeMax: "", marks: "" },
    ["mode"],
  );
  const { mode, q, job, source, noticeMax, marks } = f;
  const setMode = (v: "board" | "list") => set({ mode: v });
  const setQ = (v: string) => set({ q: v });
  const setJob = (v: string) => set({ job: v });
  const setSource = (v: string) => set({ source: v });
  const setNoticeMax = (v: string) => set({ noticeMax: v });
  const setMarks = (v: string) => set({ marks: v });
  // The box shows each key at once; the board filters a beat behind, so typing
  // never waits on seven columns being drawn again.
  const searched = useDeferredValue(q);

  // The board itself: the cards of each stage, by stage name. Dragging a card onto
  // another column moves it there (owner, 12 Nov 2026: "track and drop everyone
  // into every where they want"). Sample cards, held in the page for now; with the
  // backend a drop is one stage move through the TA System's own transition, which
  // can still refuse (a reject needs a reason, a Director decision is the Director's).
  // Set by the real board below: saves a move, or puts the card back with the reason.
  const sendMove = useRef<((card: Card, from: string, to: string, note?: string, form?: FormData) => void) | null>(null);
  // A live opening starts empty and shows skeletons until its board arrives - never the
  // sample people (owner, 19 Nov 2026: the sample flashed while the real board loaded).
  const [board, setBoard] = useState<Record<string, Card[]>>(() =>
    Object.fromEntries(STAGES.map((s, i) => [s.name, LIVE && jobFromAddress() ? [] : cardsFor(i)])),
  );
  // People shortlisted in the other views land at the top of TA Follow-Up. Each
  // board keeps its own place in the list (see pipelineInbox).
  const seenIn = useRef(0);
  useEffect(() => {
    const land = () => {
      const from = seenIn.current;
      if (arrivals.length <= from) return;
      seenIn.current = arrivals.length;
      const cards = arrivals.slice(from).map((a, i) => fromArrival(a, from + i));
      setBoard((bd) => ({ ...bd, "TA Follow-Up": [...cards.reverse(), ...bd["TA Follow-Up"]] }));
      // The board is usually hidden while the shortlist happens elsewhere, and a
      // hidden column cannot scroll; once it shows, bring the column back to the top
      // so the new card is the first thing seen.
      // ponytail: checks twice a second for up to a minute, then gives up.
      let tries = 0;
      const toTop = () => {
        const list = document.querySelector<HTMLElement>('[data-panel="pipeline"]:not(.hidden) [data-col][aria-label="TA Follow-Up"] [data-card-id]')?.parentElement;
        if (list) list.scrollTo({ top: 0, behavior: "smooth" });
        else if (++tries < 120) setTimeout(toTop, 500);
      };
      setTimeout(toTop, 0);
    };
    land();
    return onArrival(land);
  }, []);
  // A drop waiting to land: the floating copy flies into the card's new place.
  const landing = useRef<{ id: string; ghost: HTMLElement } | null>(null);
  // The move just made, told back to the person AFTER it happens (owner, 12 Nov 2026:
  // "no need confirm before... after moving I need this"), with Undo. `at` is where
  // the card stood in its old column, so Undo puts it back in the same place.
  // `note` is the answer a move needed first (the reason, the booking, the offer);
  // such a move has no Undo - taking it back is a second real move in the TA System.
  const [moved, setMoved] = useState<{ card: Card; from: string; to: string; at: number; note?: string } | null>(null);
  // The box shows while this is true; `moved` stays behind it so the box can fade
  // out with its words still in it.
  const [movedOpen, setMovedOpen] = useState(false);
  const movedBox = useRef<HTMLDivElement>(null);
  const movedShown = useExit(movedOpen, movedBox, FADE_OUT);
  const boardRow = useRef<HTMLDivElement>(null);
  useBoardWheel(boardRow, mode === "board");
  const [undone, setUndone] = useState<{ id: string; n: number } | null>(null);
  // A move the rules refuse says why, in a notice at the bottom (FLOW-CHECK 2.2).
  const [toast, setToast] = useState<{ bold?: string; rest: string; n: number; warn?: boolean } | null>(null);
  // The candidate whose CV is open in the preview, if any.
  const [cvFor, setCvFor] = useState<Card | null>(null);
  const [cvOpen, setCvOpen] = useState(false);
  const cvBox = useRef<HTMLDivElement>(null);
  const cvShown = useExit(cvOpen, cvBox, FADE_OUT);
  // The card it was opened from: the preview grows out of it (CvPreview `from`).
  // A fresh preview each time (`cvN`), so one opened again mid-close starts clean.
  const [cvFrom, setCvFrom] = useState<HTMLElement | null>(null);
  const [cvN, setCvN] = useState(0);
  const openCv = useCallback((p: Card) => {
    if (p.noCv) return setToast((t) => ({ bold: p.name, rest: "has no CV on record yet.", warn: true, n: (t?.n ?? 0) + 1 }));
    setCvFrom(onScreen('[data-card-id="' + p.id + '"]'));
    setCvFor(p);
    setCvOpen(true);
    setCvN((n) => n + 1);
  }, []);

  const refuse = useCallback((why: string) => setToast((t) => ({ rest: why, warn: true, n: (t?.n ?? 0) + 1 })), []);
  const tell = useCallback((bold: string, rest: string) => setToast((t) => ({ bold, rest, n: (t?.n ?? 0) + 1 })), []);

  // The real board (18 Nov): with the backend switched on and ?job=<id> in the
  // address, the columns are that opening's, read through the signed-in door
  // and kept live; a move is saved there and put back with the reason if the
  // backend refuses it. Without either, the sample board stays as it was.
  const live = useLive();
  const [jobId] = useState(jobFromAddress);
  const realBoard = useDoorQuery(door.board, live && jobId ? { openingId: jobId, limit: 50 } : "skip") as DoorBoard | undefined;
  // The real board's own numbers per column: its count (500 at most, then "500+")
  // and how many cards it sent; a refusal is said where the board would be.
  const liveBoard = live && !!jobId;
  const boardLoading = liveBoard && realBoard === undefined;
  const boardWhy = liveBoard && realBoard && !realBoard.ok ? realBoard.message : null;
  const liveCount = useMemo(
    () => new Map(realBoard?.ok ? realBoard.columns.map((c) => [c.stage, c] as const) : []),
    [realBoard],
  );
  const saveMove = useDoorMutation(door.move);
  // Add to another job, signed in: the TA's other open jobs.
  const myJobs = useDoorQuery(door.openings, live ? {} : "skip") as DoorOpenings | undefined;
  const otherJobs = useMemo(
    () => (myJobs?.ok ? myJobs.openings.filter((o) => o.status === "active" && o.id !== jobId).map((o) => ({ id: o.id, label: `${o.title} - ${o.client}` })) : []),
    [myJobs, jobId],
  );
  const saveShortlist = useDoorMutation(door.shortlist);
  // Each new answer from the backend replaces the columns (adjusted while
  // rendering, React's pattern for state that follows a changing value).
  const [seenBoard, setSeenBoard] = useState<DoorBoard | undefined>(undefined);
  if (realBoard !== seenBoard) {
    setSeenBoard(realBoard);
    if (realBoard?.ok) setBoard(Object.fromEntries(STAGES.map((s, i) => [s.name, (realBoard.columns.find((c) => c.stage === STAGE_KEYS[i])?.cards ?? []).map(fromDoor)])));
  }
  useEffect(() => {
    sendMove.current =
      live && jobId
        ? async (card, from, to, note, form) => {
            const key = STAGE_KEYS[STAGES.findIndex((st) => st.name === to)];
            const putBack = (why: string) => {
              setBoard((bd) => ({ ...bd, [to]: bd[to].filter((c) => c.id !== card.id), [from]: [card, ...bd[from].filter((c) => c.id !== card.id)] }));
              refuse(why);
            };
            if (to === "Interview" || to === "Offer" || to === "Placed") {
              if (!form) return putBack(`Moving to ${to} needs its details. Use the card's menu.`);
              const r = await closingWrite(to, jobId, card.id, form);
              return r.ok ? tell(card.name, ` ${r.message}`) : putBack(r.message);
            }
            try {
              const r = (await saveMove({ applicationId: card.id, stage: key, reason: to === "Rejected" || to === "Dropped out" ? note : undefined })) as DoorDone;
              if (!r.ok) putBack(r.message);
            } catch {
              putBack("Could not reach the TA System. Check your connection and try again.");
            }
          }
        : null;
  }, [live, jobId, saveMove, refuse, tell]);
  const [adding, setAdding] = useState(false);

  // The workday gate: a TA moves nobody until today's workday is started (6.2).
  // In a ref as well, because the drag handler below is made once.
  // Who is looking decides some moves (a TA does not decide a shortlist; only a
  // lead moves someone out of Placed). It follows "View as"; in a ref as well,
  // because the drag handler below is made once.
  const role = useRole();
  const roleNow = useRef(role);
  useEffect(() => {
    roleNow.current = role;
  }, [role]);
  const gate = useWorkdayGate();
  const gateNow = useRef(gate);
  useEffect(() => {
    gateNow.current = gate;
  }, [gate]);
  const GATE_HINT = " Start it on Today, then move candidates.";

  // A move that needs an answer first (a reason, a booking, an offer, a placement):
  // the form opens, and the card moves only when it is saved (2.3, 2.4).
  const [ask, setAsk] = useState<{ card: Card; from: string; to: string; needs: Needs | "job" } | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const askBox = useRef<HTMLDivElement>(null);
  const askShown = useExit(askOpen, askBox, FADE_OUT);
  const openAsk = useCallback((card: Card, from: string, to: string, needs: Needs | "job") => {
    setAsk({ card, from, to, needs });
    setAskOpen(true);
  }, []);

  // The card whose ⋮ menu is open (2.8).
  const [menu, setMenu] = useState<{ card: Card; stage: string; at: DOMRect } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBox = useRef<HTMLDivElement>(null);
  const menuShown = useExit(menuOpen, menuBox, MENU_OUT);
  const menuFor = useRef<string | null>(null);
  const closeMenu = useCallback(() => {
    menuFor.current = null;
    setMenuOpen(false);
  }, []);
  // A second press on the same ⋮ closes it.
  const openMenu = useCallback((card: Card, stage: string, el: HTMLElement) => {
    if (menuFor.current === card.id) {
      menuFor.current = null;
      setMenuOpen(false);
      return;
    }
    menuFor.current = card.id;
    setMenu({ card, stage, at: el.getBoundingClientRect() });
    setMenuOpen(true);
  }, []);

  // The one place a card changes column: a drop, the menu, or a saved form. With
  // the backend this is one stage move through the TA System's own transition.
  // `pop` is for a move with no carried copy to land (menu, form): the card pops in.
  const moveCard = useCallback((card: Card, from: string, to: string, opts?: { note?: string; pop?: boolean; form?: FormData }) => {
    setBoard((bd) => {
      setMoved({ card, from, to, at: bd[from].findIndex((c) => c.id === card.id), note: opts?.note });
      setMovedOpen(true);
      return {
        ...bd,
        [from]: bd[from].filter((c) => c.id !== card.id),
        [to]: [card, ...bd[to].filter((c) => c.id !== card.id)],
      };
    });
    if (opts?.pop) setUndone((u) => ({ id: card.id, n: (u?.n ?? 0) + 1 }));
    sendMove.current?.(card, from, to, opts?.note, opts?.form);
  }, []);

  // From the menu: the same rules as a drop.
  const menuMove = (to: string) => {
    if (!menu) return;
    if (gate) return refuse(gate + GATE_HINT);
    const { card, stage } = menu;
    const v = checkMove(card, stage, to, role);
    if (!v.ok) return refuse(v.why);
    closeMenu();
    if (v.needs) openAsk(card, stage, to, v.needs);
    else moveCard(card, stage, to, { pop: true });
  };

  // Shortlist, for a candidate nobody owns yet: it claims them for this TA, gives
  // the set number and puts them in TA Follow-Up (FLOW-CHECK 2.6), as the TA
  // System's row does. Already there, the card only changes owner.
  const shortlistCard = () => {
    if (!menu) return;
    if (gate) return refuse(gate + GATE_HINT);
    const { card, stage } = menu;
    const mine = { ...card, owned: true, mine: true };
    closeMenu();
    if (stage === "TA Follow-Up" && live && jobId) {
      // The real shortlist: the backend's collision lock decides, and names the set.
      void (saveShortlist({ applicationId: card.id }) as Promise<DoorDone>).then(
        (r) => (r.ok ? tell(card.name, ` ${r.message}`) : refuse(r.message)),
        () => refuse("Could not reach the TA System. Check your connection and try again."),
      );
    } else if (stage === "TA Follow-Up") {
      setBoard((bd) => ({ ...bd, [stage]: bd[stage].map((c) => (c.id === card.id ? mine : c)) }));
      tell(card.name, ` shortlisted as set ${OPEN_SET}`);
    } else moveCard(mine, stage, "TA Follow-Up", { note: `Shortlisted as set ${OPEN_SET}. They are yours from now on.`, pop: true });
  };

  // Add to another job: the candidate joins that job's TA Follow-Up and stays here too.
  const addToJob = () => {
    if (!menu) return;
    if (gate) return refuse(gate + GATE_HINT);
    closeMenu();
    openAsk(menu.card, menu.stage, "TA Follow-Up", "job");
  };

  // Add-on and Backup marks. A backup only makes sense behind someone at interview
  // or offer (the TA System refuses it otherwise).
  const toggleMark = (mark: "addOn" | "backup") => {
    if (!menu) return;
    if (gate) return refuse(gate + GATE_HINT);
    const { card, stage } = menu;
    if (mark === "backup" && !card.backup && board.Interview.length + board.Offer.length === 0)
      return refuse("Nobody on this role is at interview or offer yet, so there is nobody to back up.");
    const next = { ...card, [mark]: !card[mark] };
    setBoard((bd) => ({ ...bd, [stage]: bd[stage].map((c) => (c.id === card.id ? next : c)) }));
    setMenu({ ...menu, card: next });
    // Signed in the TA System saves it (and says who it told); a refusal puts it back.
    if (live && jobId)
      void candidateCall({ do: mark === "addOn" ? "addon" : "backup", appId: card.id, openingId: jobId, on: next[mark] ? "1" : "0" }).then((r) => {
        if (r.ok) return tell(card.name, ` ${r.message}`);
        setBoard((bd) => ({ ...bd, [stage]: bd[stage].map((c) => (c.id === card.id ? card : c)) }));
        refuse(r.message);
      });
  };

  /**
   * Pick up, carry and drop, all moved by GSAP (owner, 12 Nov 2026: the browser's own
   * drag had "no smooth animation... need to feel premium"). Pressing a card and
   * moving a few pixels lifts a floating copy of it; the copy follows the pointer
   * with a soft lag and sways with its speed; the column under it opens a slot;
   * letting go flies the copy into the slot, or back home when it is not over another
   * column. Only the copy's transform moves while carrying, and nothing goes through
   * React until the drop: the column under the pointer is marked on the element
   * itself (`data-over`) and its slot opened by GSAP, so a drag re-draws nothing.
   * One function for every card (it takes the card), so a card can skip re-drawing
   * when the board does.
   */
  const pickUp = useCallback((e: React.PointerEvent<HTMLElement>, card: Card, from: string) => {
    if (e.button !== 0) return;
    // A finger scrolls the column and the board; it does not carry a card (13 Nov
    // 2026). ponytail: no drag and drop by touch; a long press to pick up is the
    // way to add it if phones and tablets need to move candidates.
    if (e.pointerType === "touch") return;
    const el = e.currentTarget;
    const sx = e.clientX;
    const sy = e.clientY;
    let ghost: HTMLElement | null = null;
    let target: string | null = null;
    // A column this card may not go to, while the pointer is on it: it is marked
    // and opens no slot; letting go there says why (2.2).
    let barred: string | null = null;
    let lastX = sx;
    let xTo: (v: number) => void = () => {};
    let yTo: (v: number) => void = () => {};
    let tilt: (v: number) => void = () => {};
    // Where the pointer is, for the edge scroll below.
    let px = sx;
    let py = sy;
    let frame = 0;
    // The carried card's height: the slot opens to it.
    let h = 0;
    const board = el.closest<HTMLElement>("[data-board]");
    let edges: DOMRect | null = null;
    const colOf = (name: string) => board?.querySelector<HTMLElement>(`[data-col][aria-label="${name}"]`);
    const slotOf = (name: string) => board?.querySelector<HTMLElement>(`[data-slot="${name}"]`);

    // The slot in the column under the carried card opens smoothly to the card's
    // height, and closes the same way when the pointer moves on, so the cards under
    // it never jump.
    const openSlot = (name: string) => {
      colOf(name)?.setAttribute("data-over", "");
      const slot = slotOf(name);
      if (!slot) return;
      slot.parentElement?.scrollTo({ top: 0, behavior: "smooth" });
      gsap.set(slot, { display: "block" });
      gsap.fromTo(slot, { height: 0, opacity: 0 }, { height: h, opacity: 1, duration: DUR.base, overwrite: true });
    };
    const closeSlot = (name: string) => {
      colOf(name)?.removeAttribute("data-over");
      const slot = slotOf(name);
      if (!slot) return;
      gsap.to(slot, { height: 0, opacity: 0, duration: DUR.fast, ease: EASE.in, overwrite: true });
      // Out of the flow once closed - on a timer, not the tween's end (see lib/gsap).
      setTimeout(() => {
        if (target !== name) gsap.set(slot, { display: "none" });
      }, 250);
    };

    // Which column is under the pointer (not the one it came from).
    const aim = () => {
      const col = document.elementFromPoint(px, py)?.closest("[data-col]");
      const name = col?.getAttribute("aria-label") ?? null;
      const over = name && name !== from ? name : null;
      const next = over && checkMove(card, from, over, roleNow.current).ok ? over : null;
      const no = over && !next ? over : null;
      if (no !== barred) {
        if (barred) colOf(barred)?.removeAttribute("data-no");
        barred = no;
        if (no) colOf(no)?.setAttribute("data-no", "");
      }
      if (next !== target) {
        if (target) closeSlot(target);
        target = next;
        if (next) openSlot(next);
      }
    };

    // Carried near the left or right edge of the board, the board scrolls that way
    // on its own, faster the nearer the edge, so a column out of sight (Offer,
    // Placed) can be reached and dropped on (owner, 12 Nov 2026: "if I pick a card I
    // need to go with side scroll"). It runs frame by frame only while the pointer
    // is in an edge zone.
    const edgeScroll = () => {
      frame = 0;
      if (!ghost || !board || !edges) return;
      const zone = Math.min(140, edges.width * 0.14);
      let v = 0;
      if (px > edges.right - zone) v = ((px - (edges.right - zone)) / zone) * 24;
      else if (px < edges.left + zone) v = -((edges.left + zone - px) / zone) * 24;
      if (v === 0) return;
      const before = board.scrollLeft;
      board.scrollLeft += v;
      if (board.scrollLeft !== before) aim(); // the columns slid under the pointer
      frame = requestAnimationFrame(edgeScroll);
    };

    const lift = () => {
      const r = el.getBoundingClientRect();
      edges = board?.getBoundingClientRect() ?? null;
      h = r.height;
      const g = el.cloneNode(true) as HTMLElement;
      g.removeAttribute("data-card-id"); // only the real card answers to its id
      // The shadow is set once, not animated: only the copy's transform moves.
      Object.assign(g.style, {
        position: "fixed",
        left: r.left + "px",
        top: r.top + "px",
        width: r.width + "px",
        margin: "0",
        zIndex: "70",
        pointerEvents: "none",
        willChange: "transform",
        boxShadow: "0 26px 60px rgba(17, 44, 32, 0.22)",
      });
      document.body.append(g);
      document.body.style.cursor = "grabbing";
      gsap.set(g, { transformOrigin: sx - r.left + "px " + (sy - r.top) + "px", opacity: 1, scale: 1 });
      gsap.to(g, { scale: 1.05, rotation: -2, duration: DUR.fast });
      el.dataset.hold = "1"; // the column wheel leaves the faded original alone
      gsap.to(el, { opacity: 0.22, scale: 0.96, duration: DUR.fast });
      xTo = gsap.quickTo(g, "x", { duration: DUR.base });
      yTo = gsap.quickTo(g, "y", { duration: DUR.base });
      tilt = gsap.quickTo(g, "rotation", { duration: DUR.slow });
      ghost = g;
    };

    const move = (ev: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        lift();
      }
      xTo(ev.clientX - sx);
      yTo(ev.clientY - sy);
      // Sway with the speed across the board, settling upright when still.
      tilt(Math.max(-9, Math.min(9, (ev.clientX - lastX) * 0.7)) - 2);
      lastX = ev.clientX;
      px = ev.clientX;
      py = ev.clientY;
      aim();
      if (!frame) frame = requestAnimationFrame(edgeScroll);
    };

    const up = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.style.cursor = "";
      const g = ghost as HTMLElement | null;
      if (!g) return; // a plain click, never lifted: the card's own click opens the CV
      // A drag that ends over its own card must not also count as a click on it.
      el.dataset.dragged = "1";
      setTimeout(() => delete el.dataset.dragged, 0);
      // The slot goes at once: the card takes its place in the same frame.
      const to = target;
      const no = barred;
      target = null;
      barred = null;
      if (to) colOf(to)?.removeAttribute("data-over");
      if (no) colOf(no)?.removeAttribute("data-no");
      board?.querySelectorAll<HTMLElement>("[data-slot]").forEach((slot) => {
        gsap.killTweensOf(slot);
        gsap.set(slot, { display: "none", height: 0, opacity: 0 });
      });
      const v = to ? checkMove(card, from, to, roleNow.current) : null;
      const shut = gateNow.current;
      if (shut && (to || no)) {
        // Before the day is started nothing moves, whatever the stage rules say.
        gsap.to(g, { x: 0, y: 0, rotation: 0, scale: 1, duration: DUR.base, onComplete: () => g.remove() });
        gsap.to(el, { opacity: 1, scale: 1, duration: DUR.base, delay: 0.1, onComplete: () => delete el.dataset.hold });
        refuse(shut + " Start it on Today, then move candidates.");
      } else if (to && v?.ok && !v.needs) {
        landing.current = { id: card.id, ghost: g };
        moveCard(card, from, to);
      } else {
        // Not moved (yet): glide home and settle. A move that needs an answer
        // first opens its form; a column the rules refuse says why.
        gsap.to(g, { x: 0, y: 0, rotation: 0, scale: 1, duration: DUR.base, onComplete: () => g.remove() });
        gsap.to(el, { opacity: 1, scale: 1, duration: DUR.base, delay: 0.1, onComplete: () => delete el.dataset.hold });
        if (to && v?.ok && v.needs) openAsk(card, from, to, v.needs);
        else if (no) {
          const r = checkMove(card, from, no, roleNow.current);
          if (!r.ok) refuse(r.why);
        }
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [moveCard, openAsk, refuse]);

  // Undo: the card goes back to its old column, in the place it stood, with a pop.
  const undoMove = () => {
    if (!moved || !movedOpen) return; // already answered; the box is only fading out
    const { card, from, to, at } = moved;
    setBoard((bd) => {
      const back = [...bd[from]];
      back.splice(Math.max(0, Math.min(at, back.length)), 0, card);
      return { ...bd, [to]: bd[to].filter((c) => c.id !== card.id), [from]: back };
    });
    setUndone((u) => ({ id: card.id, n: (u?.n ?? 0) + 1 }));
    setMovedOpen(false);
    // Signed in, the move is already saved: Undo is a second real move back. If the
    // stage rules refuse it, the card goes back where the backend holds it, with why.
    sendMove.current?.(card, to, from);
  };

  useEffect(() => {
    if (!undone) return;
    const card = onScreen('[data-card-id="' + undone.id + '"]');
    if (!card) return;
    card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    gsap.fromTo(card, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: DUR.base, ease: EASE.pop });
  }, [undone]);

  // After a drop has re-drawn the board: fly the floating copy onto the card's new
  // place at the top of its column, then hand over to the real card.
  useLayoutEffect(() => {
    const l = landing.current;
    if (!l) return;
    landing.current = null;
    const card = onScreen('[data-card-id="' + l.id + '"]');
    if (!card) {
      l.ghost.remove();
      return;
    }
    if (card.parentElement) card.parentElement.scrollTop = 0;
    card.dataset.hold = "1"; // TickList leaves its opacity alone while it lands
    gsap.set(card, { opacity: 0 });
    const r = card.getBoundingClientRect();
    gsap.to(l.ghost, {
      x: r.left - parseFloat(l.ghost.style.left),
      y: r.top - parseFloat(l.ghost.style.top),
      rotation: 0,
      scale: 1,
      duration: DUR.slow,
      ease: EASE.inOut,
      onComplete: () => {
        delete card.dataset.hold;
        gsap.set(card, { opacity: 1, scale: 1 });
        l.ghost.remove();
      },
    });
  });

  const query = searched.trim().toLowerCase();
  const filtering = !!(query || source || noticeMax || marks);
  // ponytail: filters the sample cards in the browser; with the backend each
  // filter is part of the column's indexed, paged query instead.
  const match = useCallback(
    (p: Card) =>
      (!query || [p.name, p.title, p.company].some((s) => s.toLowerCase().includes(query))) &&
      (!source || p.channel === source) &&
      (!noticeMax || p.noticeDays <= Number(noticeMax)) &&
      (!marks || (marks === "addOn" ? !!p.addOn : marks === "backup" ? !!p.backup : !p.addOn && !p.backup)),
    [query, source, noticeMax, marks],
  );
  // Each column's cards, worked out again only when the board or a filter changes.
  const columns = useMemo(
    () => STAGES.map((s) => ({ s, all: board[s.name], cards: board[s.name].filter(match) })),
    [board, match],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Row one: back, and the two actions. On a phone the rows sit lower, clear
          of the view's name notch, and row two wraps (13 Nov 2026). */}
      <div data-intro className="flex items-center px-[max(1.5rem,14px)] pt-[max(1.4rem,14px)] max-md:pt-11">
        <BackButton />
        <div className="ml-auto flex items-center gap-[max(0.6rem,8px)]">
          <Automations pillClass={TOOL_PILL} icon={<SlidersIcon />} />
          <button
            type="button"
            onClick={() => (gate ? refuse(gate + " Start it on Today, then add candidates.") : setAdding(true))}
            className="flex h-[max(2.6rem,35px)] items-center gap-1.5 whitespace-nowrap rounded-full bg-brand px-[max(1.3rem,16px)] text-[max(0.9125rem,13.5px)] font-medium text-white hover:bg-brand-strong"
          >
            <PlusIcon />
            Add candidate
          </button>
        </div>
      </div>

      {/* Row two: search, filters, and Board / List. It sits above the board
          (relative z-20): the entrance animation leaves this row as its own layer,
          so a filter menu's own z-index counted only inside the row and the menus
          opened behind the cards (owner, 12 Nov 2026). */}
      <div data-intro className="relative z-20 flex items-center gap-[max(0.5rem,6px)] px-[max(1.5rem,14px)] flex-wrap pb-[max(1.2rem,12px)] pt-[max(1.1rem,11px)]">
        <label className="flex h-[max(2.4rem,33px)] w-[max(15.5rem,200px)] items-center gap-2 max-md:w-full rounded-full border border-border bg-white px-[max(1rem,13px)] has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand/30">
          <SearchIcon />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search candidates..."
            aria-label="Search candidates"
            className="min-w-0 flex-1 bg-transparent text-[max(0.9125rem,13.5px)] outline-none placeholder:text-ink-2"
          />
        </label>
        <PillMenu options={JOBS} initial={job} onChange={setJob} mark="tick" pillClass={TOOL_PILL} />
        <PillMenu options={SOURCES} initial={source} onChange={setSource} mark="tick" pillClass={TOOL_PILL} />
        {/* The list view keeps only the first two filters. */}
        {mode === "board" && (
          <>
            <PillMenu options={NOTICE} initial={noticeMax} onChange={setNoticeMax} mark="tick" pillClass={TOOL_PILL} />
            <PillMenu options={MARKS} initial={marks} onChange={setMarks} mark="tick" pillClass={TOOL_PILL} />
          </>
        )}

        {active > 0 && (
          <button type="button" onClick={reset} className="h-[max(2.4rem,33px)] rounded-full px-3 text-[max(0.9125rem,13.5px)] font-medium text-brand-strong hover:bg-surface-2">
            Reset{active > 1 ? ` (${active})` : ""}
          </button>
        )}
        <div className="ml-auto flex items-center rounded-full bg-surface-2 p-[3px] text-[max(0.9125rem,13.5px)]">
          {(
            [
              ["board", "Board", <BoardIcon key="b" />],
              ["list", "List", <ListIcon key="l" />],
            ] as const
          ).map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={
                "flex h-[max(2.1rem,29px)] items-center gap-1.5 rounded-full px-[max(0.9rem,12px)] transition-colors " +
                (mode === value ? "bg-white text-ink shadow-sm" : "text-ink-2 hover:text-ink")
              }
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      {gate && mode === "board" && <WorkdayBlocked what="move candidates" className="mx-[max(1.5rem,14px)] mb-[max(1rem,10px)]" />}

      {filtering && columns.every((c) => !c.cards.length) && (
        <div className="px-[max(1.5rem,14px)]">
          <NoResults noun="candidates" filtered onReset={reset} />
        </div>
      )}

      {boardWhy && (
        <p role="alert" className="mx-[max(1.5rem,14px)] mb-[max(1rem,10px)] rounded-md border border-warn/40 bg-warn-soft px-4 py-3 text-body text-ink">
          {boardWhy}
        </p>
      )}

      {mode === "board" ? (
        // Columns side by side; the row scrolls sideways, each column scrolls itself.
        <div ref={boardRow} data-board className="flex cursor-grab min-h-0 flex-1 gap-[max(1.75rem,18px)] overflow-x-auto [container-type:inline-size] px-[max(1.5rem,14px)] pb-2 [&::-webkit-scrollbar]:h-[10px] [&::-webkit-scrollbar-track]:mx-[max(1.5rem,14px)] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-surface-2 [&::-webkit-scrollbar-thumb]:bg-ink-3 [&::-webkit-scrollbar-thumb:hover]:bg-ink-2">
          {columns.map(({ s, all, cards }) => (
            <section
              key={s.name}
              data-col
              aria-label={s.name}
              className="flex min-h-0 w-[max(200px,calc((100cqw-4*max(1.75rem,18px))/4.5))] shrink-0 flex-col rounded-t-md border-[1.8px] border-b-0 border-surface-2 bg-white transition-colors data-[no]:border-danger/30 data-[no]:bg-danger-soft data-[over]:border-brand/40 data-[over]:bg-brand-tint"
            >
              <header className="flex items-center gap-2 px-[max(1rem,11px)] pb-[max(0.8rem,9px)] pt-[max(1rem,11px)]">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: s.dot }} />
                <h3 className="min-w-0 flex-1 truncate text-col font-semibold">{s.name}</h3>
                <span className="rounded-md bg-surface-3 px-2 py-0.5 text-chip font-medium text-ink-2">
                  {boardLoading ? (
                    <span className="shimmer inline-block h-[0.8em] w-[2ch] rounded-sm align-middle" />
                  ) : filtering || !liveBoard ? (
                    filtering ? cards.length : s.count + all.length - 6
                  ) : (
                    shownCount(liveCount.get(STAGE_KEYS[STAGES.indexOf(s)]), all.length)
                  )}
                </span>
              </header>
              <TickList>
                {/* Where a carried card would land; opened and closed by the drag. */}
                <div
                  data-slot={s.name}
                  aria-hidden="true"
                  className="hidden rounded-md border-[1.5px] border-dashed border-brand/40 bg-brand-soft"
                />
                {boardLoading
                  ? [0, 1, 2].map((k) => <CardSkeleton key={k} />)
                  : cards.map((p) => <CandidateCard key={p.id} p={p} stage={s.name} onPickUp={pickUp} onOpenCv={openCv} onMenu={openMenu} />)}
                {!boardLoading && !boardWhy && !all.length && (
                  <p className="px-1 pt-2 text-center text-card-sub text-ink-3">Nobody in {s.name} yet.</p>
                )}
                {!boardLoading && !filtering && (liveCount.get(STAGE_KEYS[STAGES.indexOf(s)])?.count ?? 0) > all.length && (
                  <p className="px-1 pb-2 pt-1 text-center text-card-sub text-ink-3">
                    Showing the newest {all.length} of {shownCount(liveCount.get(STAGE_KEYS[STAGES.indexOf(s)]), all.length)}.
                  </p>
                )}
              </TickList>
            </section>
          ))}
        </div>
      ) : (
        <ListView board={board} match={match} onOpenCv={openCv} onMenu={openMenu} />
      )}

      {cvShown && cvFor && (
        <CvPreview
          key={cvN}
          ref={cvBox}
          from={cvFrom}
          name={cvFor.name}
          title={cvFor.title}
          // Sample: the two demo CVs in public/cvs; the real board reads each candidate's own.
          src={cvFileOf(cvFor)}
          appId={live ? cvFor.id : undefined}
          openingId={jobId ?? undefined}
          // What the desk holds for the green box; a detail still missing is left out.
          start={{
            designation: cvFor.title,
            company: cvFor.company,
            notice: cvFor.missing.includes("Notice Period") || !Number.isFinite(cvFor.noticeDays) ? undefined : `${cvFor.noticeDays} Days`,
            // The sample's salary only on the sample board: a live card has no salary
            // figure from the board read, so the box leaves it for the TA (19 Nov audit).
            ...(live || cvFor.missing.includes("Salary") ? {} : { currentSalary: "LKR 420,000", expectedSalary: "LKR 550,000" }),
            notes: [],
          }}
          onClose={() => setCvOpen(false)}
        />
      )}

      {movedShown && moved && (
        <MovedNotice
          ref={movedBox}
          name={moved.card.name}
          from={STAGES.find((st) => st.name === moved.from)!}
          to={STAGES.find((st) => st.name === moved.to)!}
          note={moved.note}
          onUndo={undoMove}
          onDone={() => setMovedOpen(false)}
        />
      )}

      {menuShown && menu && (
        <CardMenu
          ref={menuBox}
          at={menu.at}
          name={menu.card.name}
          from={menu.stage}
          moves={movesFrom(menu.card, menu.stage, role)}
          addOn={!!menu.card.addOn}
          backup={!!menu.card.backup}
          onMove={menuMove}
          onToggle={toggleMark}
          onShortlist={menu.card.owned ? undefined : shortlistCard}
          onAddToJob={addToJob}
          onClose={closeMenu}
        />
      )}

      {askShown && ask && (
        <MoveForm
          ref={askBox}
          ask={{ needs: ask.needs, name: ask.card.name, from: ask.from, to: STAGES.find((st) => st.name === ask.to)!, jobs: live ? otherJobs : OTHER_JOBS }}
          onCancel={() => setAskOpen(false)}
          onSave={(note, form) => {
            setAskOpen(false);
            // "Add to another job" moves nobody on this board; it only says so.
            if (ask.needs === "job" && live && jobId)
              void candidateCall({ do: "addjob", appId: ask.card.id, openingId: jobId, destinationId: note }).then((r) =>
                r.ok ? tell(ask.card.name, ` ${r.message}`) : refuse(r.message),
              );
            else if (ask.needs === "job") tell(ask.card.name, ` added to TA Follow-Up on ${OTHER_JOBS.find((j) => j.id === note)?.label ?? note}. They stay on this job too.`);
            else moveCard(ask.card, ask.from, ask.to, { note, pop: true, form });
          }}
        />
      )}

      {adding && (
        <AddCandidate
          onClose={() => setAdding(false)}
          onAdd={(file) => {
            setAdding(false);
            tell(file, " uploaded. Their profile will appear in TA Follow-up once it is read.");
          }}
        />
      )}

      {toast && <Toast key={toast.n} bold={toast.bold} rest={toast.rest} warn={toast.warn} />}
    </div>
  );
}

/** A stage named with its dot, as in the column headers. */
function Stage({ s }: { s: { name: string; dot: string } }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-ink">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: s.dot }} />
      {s.name}
    </span>
  );
}

/** "Candidate moved" - shown once a drop has moved someone. Enter or Escape closes it;
 *  Undo puts the candidate back. */
function MovedNotice({
  ref: root,
  name,
  from,
  to,
  note,
  onUndo,
  onDone,
}: {
  ref: RefObject<HTMLDivElement | null>;
  name: string;
  from: { name: string; dot: string };
  to: { name: string; dot: string };
  /** What was recorded with the move (the reason, the booking...). With a note there
   *  is no Undo: taking such a move back is a second real move. */
  note?: string;
  onUndo: () => void;
  onDone: () => void;
}) {

  // The veil fades in and the box rises with a small spring.
  useGSAP(
    () => {
      // A short wait, so the card is seen starting to land before the box arrives.
      gsap.from("[data-veil]", { opacity: 0, duration: DUR.fast, delay: DUR.tap });
      gsap.from("[data-box]", { opacity: 0, y: 14, scale: 0.94, duration: DUR.base, ease: EASE.pop, delay: DUR.tap });
    },
    { scope: root },
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") onDone();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onDone]);

  // Rendered at the top of the page, not inside the board: the board is its own
  // layer (it animates), so from inside it the box could never rise above the
  // landing card, which lives on <body>.
  return createPortal(
    <div ref={root} className="fixed inset-0 z-[80] flex items-center justify-center">
      <div data-veil className="absolute inset-0 bg-black/15 backdrop-blur-[2px]" onClick={onDone} />
      <div
        data-box
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="move-title"
        className="relative w-[max(26rem,320px)] max-w-[calc(100vw-24px)] rounded-lg bg-white p-[max(1.6rem,20px)] shadow-[0_30px_80px_rgba(17,44,32,0.25)]"
      >
        <h2 id="move-title" className="flex items-center gap-2 text-[max(1.05rem,15px)] font-semibold text-ink">
          <span className="flex size-[max(1.4rem,19px)] items-center justify-center rounded-full bg-brand-soft text-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3/5" aria-hidden="true">
              <path d="m5 12 5 5 9-10" />
            </svg>
          </span>
          Candidate moved
        </h2>
        <p className="mt-[max(0.6rem,8px)] text-[max(0.9125rem,13.5px)] leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">{name}</span> moved from <Stage s={from} /> to{" "}
          <Stage s={to} />.
        </p>
        {note && (
          <p className="mt-[max(0.5rem,6px)] rounded-xl bg-surface-2 px-3 py-2 text-[max(0.8625rem,12.5px)] leading-relaxed text-ink">{note}</p>
        )}
        <div className="mt-[max(1.4rem,16px)] flex justify-end gap-[max(0.6rem,8px)]">
          {!note && (
            <button
              type="button"
              onClick={onUndo}
              className="h-[max(2.4rem,33px)] rounded-full border border-border px-[max(1.2rem,15px)] text-[max(0.9125rem,13.5px)] text-ink hover:bg-surface-2"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={onDone}
            className="h-[max(2.4rem,33px)] rounded-full bg-brand px-[max(1.4rem,17px)] text-[max(0.9125rem,13.5px)] font-medium text-white hover:bg-brand-strong"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The round back arrow. It does not leave the view at once: it raises the bottom
 *  bar, whose first tab is the opening's Overview, so the person picks where to go
 *  - the overview or any view they had open (owner, 12 Nov 2026: "the back button
 *  needs to show the bottom bar"). The bar listens for SHOW_TABS (FocusChrome). */
export function BackButton({ onClick, label }: { onClick?: () => void; label?: string } = {}) {
  return (
    <button
      type="button"
      aria-label={label ?? "Back to this opening"}
      onClick={onClick ?? (() => window.dispatchEvent(new Event(SHOW_TABS)))}
      className="flex size-[max(2.6rem,35px)] shrink-0 items-center justify-center rounded-full border-[1.5px] border-brand text-brand transition-colors hover:bg-brand hover:text-white"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-1/2"
        aria-hidden="true"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>
  );
}

// Drawn again only when its own candidate changes: the handlers are the board's
// stable ones and take the card, so a search or a drop elsewhere skips it.
const CandidateCard = memo(function CandidateCard({
  p,
  stage,
  onPickUp,
  onOpenCv,
  onMenu,
}: {
  p: Card;
  stage: string;
  onPickUp: (e: React.PointerEvent<HTMLElement>, card: Card, from: string) => void;
  onOpenCv: (card: Card) => void;
  onMenu: (card: Card, stage: string, el: HTMLElement) => void;
}) {
  // The three chips are what Director Review needs: grey when it is on record,
  // amber while it is still missing (the design's amber "Notice Period").
  const chip = (label: string) =>
    p.missing.includes(label) ? (
      <span title="Needed before Director Review" className="rounded-md bg-warn-soft px-1.5 py-0.5 text-warn">
        {label}
      </span>
    ) : (
      <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-ink">{label}</span>
    );
  return (
    <article
      data-card-id={p.id}
      onPointerDown={(e) => onPickUp(e, p, stage)}
      // A click opens the CV: on the way in, read this candidate's CV and draw its first
      // page ahead, so the opening motion never waits on it (owner, 17 Nov 2026).
      onPointerEnter={() => p.noCv || warmCv(cvFileOf(p))}
      // A click anywhere on the card (name, initials, details) opens the CV
      // (owner, 12 Nov 2026); a drag does not.
      onClick={(e) => {
        if (e.currentTarget.dataset.dragged) return;
        onOpenCv(p);
      }}
      className="cursor-grab select-none rounded-md border border-border bg-white p-[max(1rem,12px)]"
    >
      <div className="flex items-start gap-[max(0.6rem,7px)]">
        <span className="flex size-[max(2.4rem,32px)] shrink-0 items-center justify-center rounded-full bg-info-soft text-chip font-semibold text-info">
          {initials(p.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-card-name font-semibold leading-tight text-ink">{p.name}</p>
          <p className="truncate text-card-sub text-ink-2">{p.title}</p>
        </div>
        {p.addOn && <span className="shrink-0 rounded-md bg-info-soft px-1.5 py-0.5 text-chip font-medium text-info">Add-on</span>}
        {p.backup && <span className="shrink-0 rounded-md bg-violet-soft px-1.5 py-0.5 text-chip font-medium text-violet">Backup</span>}
        <LinkedInLink url={p.linkedin} name={p.name} />
      </div>

      <div className="mt-[max(0.8rem,9px)] space-y-[max(0.4rem,4px)] text-card-line text-ink-2">
        <p className="truncate">C : {p.company}</p>
        <p className="flex items-center">
          <span className="flex-1 truncate">L : {p.location}</span>
          <span aria-hidden="true" className="mx-2 h-[1em] w-px bg-ink-2" />
          <span className="flex-1 truncate pl-2">E : {p.years}</span>
        </p>
        <p className="truncate">P : {p.phone}</p>
        <p className="truncate">M : {p.email}</p>
      </div>

      <div className="mt-[max(0.7rem,8px)] flex items-center gap-[max(0.35rem,4px)] whitespace-nowrap text-chip">
        {/* Opens the CV preview. Its press does not start a drag of the card. */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenCv(p);
          }}
          aria-label={p.noCv ? `${p.name} has no CV yet` : `Open the CV of ${p.name}`}
          title={p.noCv ? "No CV on record yet" : undefined}
          className={"cursor-pointer rounded-md px-1.5 py-0.5 transition-colors " + (p.noCv ? "bg-warn-soft text-warn" : "bg-surface-3 text-ink hover:bg-brand hover:text-white")}
        >
          CV
        </button>
        {chip("Salary")}
        {chip("Notice Period")}
        <button
          type="button"
          aria-label={`Move or mark ${p.name}`}
          aria-haspopup="menu"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onMenu(p, stage, e.currentTarget);
          }}
          className="ml-auto rounded p-0.5 text-ink hover:bg-surface-2"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="size-[max(0.9rem,12px)]" aria-hidden="true">
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>
      </div>
    </article>
  );
});

/** The same candidates as a stage sidebar (left) and one row card per candidate (right). */
function ListView({
  board,
  match,
  onOpenCv,
  onMenu,
}: {
  board: Record<string, Card[]>;
  match: (p: Card) => boolean;
  onOpenCv: (card: Card) => void;
  onMenu: (card: Card, stage: string, el: HTMLElement) => void;
}) {
  const [stage, setStage] = useState(STAGES[0].name);
  const rows = board[stage].filter(match);
  // The owner's List design (17 Nov 2026): stages as soft rounded buttons on the left
  // behind a hairline, each candidate a rounded row with its details spread evenly.
  const pill = "shrink-0 rounded-full px-[max(0.5rem,6px)] py-0.5 text-[max(0.75rem,11px)] font-medium ";
  return (
    <div className="mx-[max(1.5rem,14px)] mb-[max(1.2rem,12px)] mt-[max(1.25rem,10px)] flex min-h-0 flex-1 max-md:flex-col">
      <nav
        aria-label="Stages"
        className="flex w-[max(14.75rem,190px)] shrink-0 flex-col gap-[max(0.45rem,6px)] border-r border-border pr-[max(1.5rem,14px)] [scrollbar-width:none] max-md:w-full max-md:flex-row max-md:overflow-x-auto max-md:border-r-0 max-md:pb-2 max-md:pr-0"
      >
        {STAGES.map((s) => (
          <button
            key={s.name}
            type="button"
            aria-pressed={stage === s.name}
            onClick={() => setStage(s.name)}
            className={
              "flex flex-1 min-h-[max(2rem,28px)] items-center whitespace-nowrap rounded-sm border px-[max(0.875rem,11px)] text-left text-[max(1rem,13.5px)] text-ink transition-colors max-md:h-[max(2.25rem,30px)] max-md:flex-initial max-md:shrink-0 " +
              (stage === s.name ? "border-transparent bg-surface-2 font-medium" : "border-border bg-surface hover:bg-surface-2")
            }
          >
            <span className="truncate">{s.name}</span>
          </button>
        ))}
      </nav>
      {/* A real table (owner, 20 Nov 2026: "the list view needs to look like a table,
          aligned"): one column plan shared by the header and every row, so each detail sits
          under its heading. A narrower window drops Phone, then Email, from both at once;
          a phone slides the table sideways. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto pl-[max(1.5rem,14px)] [scrollbar-width:thin] max-md:pl-0">
        <div className="min-w-[56rem]">
          <div role="row" className={LIST_COLS + " sticky top-0 z-10 border-b border-border bg-surface py-[max(0.6rem,7px)] text-[max(0.8125rem,11.5px)] font-medium uppercase tracking-wide text-ink-3"}>
            <span role="columnheader">Candidate</span>
            <span role="columnheader">Title</span>
            <span role="columnheader">Experience</span>
            <span role="columnheader">Company</span>
            <span role="columnheader">Location</span>
            <span role="columnheader" className="max-[1500px]:hidden">Phone</span>
            <span role="columnheader" className="max-[1400px]:hidden">Email</span>
            <span role="columnheader">Details</span>
            <span role="columnheader" className="sr-only">Actions</span>
          </div>
          {rows.length === 0 && <p className="py-6 text-center text-ink-2">No candidates in {stage}.</p>}
          {rows.map((p) => {
            const chip = (label: string) => (
              <span className={pill + (p.missing.includes(label) ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink")}>{label === "Notice Period" ? "Notice" : label}</span>
            );
            return (
              <article
                key={p.id}
                role="row"
                className={LIST_COLS + " h-[max(3.5rem,46px)] border-b border-border text-[max(0.875rem,12px)] text-ink-2 transition-colors hover:bg-surface-2/60"}
              >
                <span className="flex min-w-0 items-center gap-[max(0.6rem,7px)]">
                  <span className="flex size-[max(2.25rem,30px)] shrink-0 items-center justify-center rounded-full bg-info-soft text-[max(0.875rem,12px)] font-semibold text-info">
                    {initials(p.name)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenCv(p)}
                    onPointerEnter={() => warmPdf()}
                    aria-label={`Open the CV of ${p.name}`}
                    title={p.name}
                    // mr-auto: the LinkedIn mark sits at the column's right edge in every
                    // row, not straight after names of different lengths (owner, 20 Nov 2026).
                    className="mr-auto min-w-0 truncate text-left text-[max(1rem,13.5px)] font-semibold text-ink hover:text-brand"
                  >
                    {p.name}
                  </button>
                  <LinkedInLink url={p.linkedin} name={p.name} className="size-[max(1.05rem,14px)]" />
                </span>
                <Cell v={p.title} />
                <Cell v={p.years} />
                <Cell v={p.company} />
                <Cell v={p.location} />
                <Cell v={p.phone} className="max-[1500px]:hidden" />
                <Cell v={p.email} className="max-[1400px]:hidden" />
                <span className="flex items-center gap-[max(0.3rem,4px)]">
                  <button
                    type="button"
                    onClick={() => onOpenCv(p)}
                    aria-label={p.noCv ? `${p.name} has no CV yet` : `Open the CV of ${p.name}`}
                    className={pill + (p.noCv ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink hover:bg-brand hover:text-white")}
                  >
                    CV
                  </button>
                  {chip("Salary")}
                  {chip("Notice Period")}
                </span>
                <button
                  type="button"
                  aria-label={`Move or mark ${p.name}`}
                  aria-haspopup="menu"
                  onClick={(e) => onMenu(p, stage, e.currentTarget)}
                  className="justify-self-end rounded p-1 text-ink hover:bg-surface-2"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="size-[max(0.9rem,12px)]" aria-hidden="true">
                    <circle cx="12" cy="5" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="12" cy="19" r="1.8" />
                  </svg>
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** The List view's columns: Candidate, Title, Experience, Company, Location, Phone, Email,
 *  Details, menu. Phone steps out under 1500px wide and Email under 1400px, header and rows
 *  together, so nothing is cut and every column stays under its heading. */
const LIST_COLS =
  "grid items-center gap-x-[max(1rem,10px)] px-[max(0.75rem,8px)] " +
  "grid-cols-[minmax(14rem,1.9fr)_minmax(8rem,1.4fr)_minmax(5.5rem,0.6fr)_minmax(8rem,1.3fr)_minmax(7rem,1fr)_minmax(8.5rem,0.9fr)_minmax(10rem,1.3fr)_12.5rem_2rem] " +
  "max-[1500px]:grid-cols-[minmax(14rem,1.9fr)_minmax(8rem,1.4fr)_minmax(5.5rem,0.6fr)_minmax(8rem,1.3fr)_minmax(7rem,1fr)_minmax(10rem,1.3fr)_12.5rem_2rem] " +
  "max-[1400px]:grid-cols-[minmax(14rem,1.9fr)_minmax(8rem,1.4fr)_minmax(5.5rem,0.6fr)_minmax(8rem,1.3fr)_minmax(7rem,1fr)_12.5rem_2rem]";

/** One table cell: shortened with "…" (the whole value on hover); nothing on record = a quiet dash. */
function Cell({ v, className = "" }: { v: string; className?: string }) {
  const none = !v || v === "Not on record";
  return (
    <span title={none ? "Not on record" : v} className={"min-w-0 truncate " + (none ? "text-ink-3 " : "") + className}>
      {none ? "—" : v}
    </span>
  );
}

const ICON = "size-[max(1.05rem,14px)] shrink-0";
const stroke = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** The LinkedIn mark as a link to the candidate's own profile (new tab). shortcut: until the backend sends a profile address, it opens linkedin.com. */
function LinkedInLink({ url, name, className }: { url?: string; name: string; className?: string }) {
  return (
    <a
      href={url?.startsWith("https://") ? url : "https://www.linkedin.com"}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${name} on LinkedIn`}
      aria-label={`Open ${name} on LinkedIn`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="shrink-0 rounded-xs hover:opacity-80"
    >
      <LinkedInIcon className={className} />
    </a>
  );
}

export function LinkedInIcon({ className = "size-[max(1.25rem,16px)]" }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" className={className + " shrink-0"} aria-label="LinkedIn">
      <rect width="24" height="24" rx="3" fill="#0a66c2" />
      <path
        fill="#fff"
        d="M7.2 9.4H4.8V19h2.4V9.4ZM6 5a1.4 1.4 0 1 0 0 2.8A1.4 1.4 0 0 0 6 5Zm3.9 4.4V19h2.4v-5c0-1.4.6-2.3 1.8-2.3 1.1 0 1.6.8 1.6 2.3v5H18v-5.6c0-2.6-1.4-4.2-3.6-4.2-1.3 0-2.1.6-2.5 1.3V9.4H9.9Z"
      />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg {...stroke} className={ICON + " text-ink-2"}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg {...stroke} strokeWidth={2.6} className={ICON}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function SlidersIcon() {
  return (
    <svg {...stroke} className={ICON}>
      <path d="M6 4v16M12 4v16M18 4v16" />
      <circle cx="6" cy="9" r="1.8" fill="white" />
      <circle cx="12" cy="15" r="1.8" fill="white" />
      <circle cx="18" cy="8" r="1.8" fill="white" />
    </svg>
  );
}
function BoardIcon() {
  return (
    <svg {...stroke} className={ICON}>
      <rect x="4" y="4" width="4" height="16" rx="1" />
      <rect x="10" y="4" width="4" height="11" rx="1" />
      <rect x="16" y="4" width="4" height="7" rx="1" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg {...stroke} className={ICON}>
      <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

/**
 * The board scrolls sideways with the ordinary mouse wheel whenever the pointer is not
 * over a column's cards - in the gaps between columns, on a column's header, or past
 * the last card (owner, 16 Nov 2026: "the side scroll needs to be more accurate... I
 * put my cursor in the gaps and it needs to scroll"; then "if I hover over the
 * stages it still doesn't work"), so the wheel moves the board sideways anywhere on
 * it, cards included. Shift+wheel scrolls the column under the pointer up and down.
 * The move glides, and when the wheel stops the board settles with a column's left
 * edge exactly at the board's edge. A trackpad's own sideways swipe is left alone.
 */
function useBoardWheel(ref: RefObject<HTMLDivElement | null>, on: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    let target = el.scrollLeft;
    let gliding = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const max = () => el.scrollWidth - el.clientWidth;
    const glide = (to: number, duration: number) => {
      target = Math.max(0, Math.min(max(), to));
      gliding = true;
      gsap.to(el, { scrollLeft: target, duration, ease: EASE.out, overwrite: true, onComplete: () => void (gliding = false) });
    };
    // The nearest column edge to where the board was heading.
    const snap = () => {
      const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
      const edges = [...el.querySelectorAll<HTMLElement>("[data-col]")].map((c) => c.offsetLeft - pad);
      const best = edges.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a), 0);
      glide(best, DUR.base);
    };
    // The usual board rules (owner, 17 Nov 2026: "only vertical works, horizontal and
    // vertical are not working" - the wheel used to move the board sideways even over
    // a column, so a column could not be scrolled with a mouse):
    //   over a column's cards - the wheel scrolls that column up and down (the browser's own);
    //   Shift+wheel or a trackpad's sideways swipe - the board moves sideways (the browser's own);
    //   anywhere else on the board (headings, gaps, empty space) - the wheel moves it sideways.
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.shiftKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if ((e.target as HTMLElement).closest("[data-col-list]")) return;
      e.preventDefault();
      if (!gliding) target = el.scrollLeft;
      const step = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      glide(target + step * 1.4, 0.32);
      clearTimeout(settle);
      settle = setTimeout(snap, 160);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    // Grab and drag the board sideways (owner, 17 Nov 2026: "we need click the pipeline
    // and move"). A mouse press on anything that is not a card or a control pulls the
    // board with the pointer; on release it settles on a column edge. Cards keep their
    // own drag, touch keeps the finger's native scroll.
    let pan: { x: number; left: number; moved: boolean; id: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if ((e.target as HTMLElement).closest("[data-card-id],button,a,input,textarea,select,[role=menu]")) return;
      // A press on the scroll bar itself is the browser's to handle.
      if (e.clientY > el.getBoundingClientRect().top + el.clientTop + el.clientHeight) return;
      gsap.killTweensOf(el);
      gliding = false;
      pan = { x: e.clientX, left: el.scrollLeft, moved: false, id: e.pointerId };
    };
    const onMove = (e: PointerEvent) => {
      if (!pan || e.pointerId !== pan.id) return;
      const dx = e.clientX - pan.x;
      if (!pan.moved && Math.abs(dx) < 4) return;
      if (!pan.moved) {
        pan.moved = true;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // The pointer is already gone; the move still applies.
        }
        el.style.cursor = "grabbing";
        el.style.userSelect = "none";
      }
      el.scrollLeft = pan.left - dx;
    };
    const onUp = (e: PointerEvent) => {
      if (!pan || e.pointerId !== pan.id) return;
      const moved = pan.moved;
      pan = null;
      el.style.cursor = "";
      el.style.userSelect = "";
      if (!moved) return;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      target = el.scrollLeft;
      snap();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      clearTimeout(settle);
      gsap.killTweensOf(el);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [ref, on]);
}
