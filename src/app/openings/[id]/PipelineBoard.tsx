"use client";

import dynamic from "next/dynamic";
import Automations from "./Automations";
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { DUR, EASE, gsap, useExit, useGSAP } from "@/lib/gsap";
import { USER } from "@/lib/user";
import { SHOW_TABS } from "./view";
import PillMenu, { type MenuOption } from "./PillMenu";
import TickList from "./TickList";
import { warmPdf } from "./CvPages";
import CardMenu from "./CardMenu";
import MoveForm from "./MoveForm";
import Toast from "./Toast";
import { STAGES, checkMove, movesFrom, type Needs } from "./pipelineRules";
import WorkdayBlocked from "./WorkdayBlocked";
import { useWorkdayGate } from "@/lib/workday";

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

// The four filters, filled with what the TA System really has (read from its code,
// 12 Nov 2026), not made-up choices:
// - Source = the application's sourcing channel (`SourcingChannel` + `CHANNEL_LABEL`,
//   the Guidelines tab's codes).
// - Recruiter = who owns the candidate (`ownerTaId`, set by whoever shortlisted
//   first); the old pipeline's own filter is "mine". Each recruiter by name joins
//   the list when the backend sends the opening's team.
// - Priority = the opening's tier, P1 to P5, with its target time (`PRIORITY_TARGET`).
// - All jobs = this opening only, or every opening you work on.
const JOBS: MenuOption[] = [
  { value: "all", label: "All my jobs", pillLabel: "All jobs" },
  { value: "this", label: "This job only" },
];
const RECRUITERS: MenuOption[] = [
  { value: "", label: "All recruiters", pillLabel: "Recruiter" },
  { value: "mine", label: "Mine", hint: "Candidates you own" },
  { value: "none", label: "Not owned yet", hint: "Nobody has shortlisted them" },
];
const PRIORITIES: MenuOption[] = [
  { value: "", label: "All priorities", pillLabel: "Priority" },
  { value: "P1", label: "P1", hint: "Fill in 2 weeks" },
  { value: "P2", label: "P2", hint: "Fill in 3 weeks" },
  { value: "P3", label: "P3", hint: "Fill in 1 month" },
  { value: "P4", label: "P4", hint: "Fill in 1.5 months" },
  { value: "P5", label: "P5", hint: "Fill in 2 months" },
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
// The TA System's own three list filters (CandidateList.tsx), which the design's
// toolbar did not carry (FLOW-CHECK 2.11).
const EXPERIENCE: MenuOption[] = [
  { value: "", label: "Any experience", pillLabel: "Experience" },
  { value: "5", label: "5+ years" },
  { value: "10", label: "10+ years" },
  { value: "15", label: "15+ years" },
];
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

/** Placeholder: this opening's priority tier, until it comes from the backend. */
const OPENING_TIER = "P2";

type Card = Person & {
  id: string;
  mine: boolean;
  owned: boolean;
  channel: string;
  /** Another TA shortlisted them first (the collision lock): their first name. */
  lockedBy?: string;
  /** Still needed before Director Review: "CV", "Salary", "Notice Period". */
  missing: string[];
  addOn?: boolean;
  backup?: boolean;
  /** Years of experience and notice period in days, for the two filters. */
  yearsN: number;
  noticeDays: number;
};

/** Placeholder: the person's other open jobs (the same sample ones as Today), and
 *  the set a shortlist joins, until the backend sends them. */
const OTHER_JOBS = ["Finance Manager - Hayleys", "Production Executive - MAS Holdings", "HR Business Partner - Dialog"];
const OPEN_SET = 3;

/** Placeholder: the other TAs on this opening, until the backend sends the team. */
const OTHER_TAS = ["Hasini", "Dinuka"];

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

/** Six sample cards per stage; the first stage starts with the design's first card.
 *  Owner and source vary so the filters have something to filter; every third card
 *  is another TA's (locked), and in the two follow-up stages every other card still
 *  lacks its notice period, so the Director Review rule has something to refuse. */
const cardsFor = (i: number): Card[] =>
  Array.from({ length: 6 }, (_, n) => ({
    ...(i === 0 && n === 0 ? PEOPLE[0] : PEOPLE[1]),
    id: `${i}-${n}`,
    mine: n % 3 === 0,
    // Nobody owns a candidate only before the first shortlist, so only in the
    // two follow-up stages; from Director Review on, everyone has an owner.
    owned: i >= 2 || n % 3 !== 2,
    lockedBy: n % 3 === 1 ? OTHER_TAS[(i + n) % OTHER_TAS.length] : undefined,
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
  "flex h-[max(2.4rem,33px)] items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-white px-[max(1rem,13px)] text-[max(0.85rem,12.5px)] text-ink";

export default function PipelineBoard() {
  const [mode, setMode] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  // The box shows each key at once; the board filters a beat behind, so typing
  // never waits on seven columns being drawn again.
  const searched = useDeferredValue(q);
  const [job, setJob] = useState("all");
  const [recruiter, setRecruiter] = useState("");
  const [priority, setPriority] = useState("");
  const [source, setSource] = useState("");
  const [exp, setExp] = useState("");
  const [noticeMax, setNoticeMax] = useState("");
  const [marks, setMarks] = useState("");

  // The board itself: the cards of each stage, by stage name. Dragging a card onto
  // another column moves it there (owner, 12 Nov 2026: "track and drop everyone
  // into every where they want"). Sample cards, held in the page for now; with the
  // backend a drop is one stage move through the TA System's own transition, which
  // can still refuse (a reject needs a reason, a Director decision is the Director's).
  const [board, setBoard] = useState<Record<string, Card[]>>(() =>
    Object.fromEntries(STAGES.map((s, i) => [s.name, cardsFor(i)])),
  );
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
  const [undone, setUndone] = useState<{ id: string; n: number } | null>(null);
  // The candidate whose CV is open in the preview, if any.
  const [cvFor, setCvFor] = useState<Card | null>(null);
  const [cvOpen, setCvOpen] = useState(false);
  const cvBox = useRef<HTMLDivElement>(null);
  const cvShown = useExit(cvOpen, cvBox, FADE_OUT);
  const openCv = useCallback((p: Card) => {
    setCvFor(p);
    setCvOpen(true);
  }, []);

  // A move the rules refuse says why, in a notice at the bottom (FLOW-CHECK 2.2).
  const [toast, setToast] = useState<{ bold?: string; rest: string; n: number; warn?: boolean } | null>(null);
  const refuse = useCallback((why: string) => setToast((t) => ({ rest: why, warn: true, n: (t?.n ?? 0) + 1 })), []);
  const tell = (bold: string, rest: string) => setToast((t) => ({ bold, rest, n: (t?.n ?? 0) + 1 }));

  // The workday gate: a TA moves nobody until today's workday is started (6.2).
  // In a ref as well, because the drag handler below is made once.
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
  const moveCard = useCallback((card: Card, from: string, to: string, opts?: { note?: string; pop?: boolean }) => {
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
  }, []);

  // From the menu: the same rules as a drop.
  const menuMove = (to: string) => {
    if (!menu) return;
    if (gate) return refuse(gate + GATE_HINT);
    const { card, stage } = menu;
    const v = checkMove(card, stage, to, USER.role);
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
    if (stage === "TA Follow-Up") {
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
    // Another TA's candidate stays where it is (the collision lock, FLOW-CHECK 2.6).
    if (card.lockedBy) return;
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
      const next = over && checkMove(card, from, over, USER.role).ok ? over : null;
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
      const v = to ? checkMove(card, from, to, USER.role) : null;
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
          const r = checkMove(card, from, no, USER.role);
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
  };

  useEffect(() => {
    if (!undone) return;
    const card = document.querySelector<HTMLElement>('[data-card-id="' + undone.id + '"]');
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
    const card = document.querySelector<HTMLElement>('[data-card-id="' + l.id + '"]');
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
  const filtering = !!(query || recruiter || priority || source || exp || noticeMax || marks);
  // ponytail: filters the sample cards in the browser; with the backend each
  // filter is part of the column's indexed, paged query instead.
  const match = useCallback(
    (p: Card) =>
      (!query || [p.name, p.title, p.company].some((s) => s.toLowerCase().includes(query))) &&
      (recruiter !== "mine" || p.mine) &&
      (recruiter !== "none" || !p.owned) &&
      (!priority || priority === OPENING_TIER) &&
      (!source || p.channel === source) &&
      (!exp || p.yearsN >= Number(exp)) &&
      (!noticeMax || p.noticeDays <= Number(noticeMax)) &&
      (!marks || (marks === "addOn" ? !!p.addOn : marks === "backup" ? !!p.backup : !p.addOn && !p.backup)),
    [query, recruiter, priority, source, exp, noticeMax, marks],
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
            className="flex h-[max(2.6rem,35px)] items-center gap-1.5 whitespace-nowrap rounded-full bg-brand px-[max(1.3rem,16px)] text-[max(0.85rem,12.5px)] font-medium text-white hover:bg-brand-strong"
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
            className="min-w-0 flex-1 bg-transparent text-[max(0.85rem,12.5px)] outline-none placeholder:text-ink-2"
          />
        </label>
        <PillMenu options={JOBS} initial={job} onChange={setJob} mark="tick" pillClass={TOOL_PILL} />
        <PillMenu options={RECRUITERS} initial={recruiter} onChange={setRecruiter} mark="tick" pillClass={TOOL_PILL} />
        <PillMenu options={PRIORITIES} initial={priority} onChange={setPriority} mark="tick" pillClass={TOOL_PILL} />
        <PillMenu options={SOURCES} initial={source} onChange={setSource} mark="tick" pillClass={TOOL_PILL} />
        <PillMenu options={EXPERIENCE} initial={exp} onChange={setExp} mark="tick" pillClass={TOOL_PILL} />
        <PillMenu options={NOTICE} initial={noticeMax} onChange={setNoticeMax} mark="tick" pillClass={TOOL_PILL} />
        <PillMenu options={MARKS} initial={marks} onChange={setMarks} mark="tick" pillClass={TOOL_PILL} />

        <div className="ml-auto flex items-center rounded-full bg-surface-2 p-[3px] text-[max(0.85rem,12.5px)]">
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

      {gate && <WorkdayBlocked what="move candidates" className="mx-[max(1.5rem,14px)] mb-[max(1rem,10px)]" />}

      {mode === "board" ? (
        // Columns side by side; the row scrolls sideways, each column scrolls itself.
        <div data-board className="flex min-h-0 flex-1 gap-[max(1.1rem,12px)] overflow-x-auto px-[max(1.5rem,14px)] [scrollbar-color:#e3e6ea_transparent]">
          {columns.map(({ s, all, cards }) => (
            <section
              key={s.name}
              data-col
              aria-label={s.name}
              className="flex min-h-0 w-[max(22rem,280px)] shrink-0 flex-col rounded-t-md border-[1.8px] border-b-0 border-surface-2 bg-white transition-colors data-[no]:border-danger/30 data-[no]:bg-danger-soft data-[over]:border-brand/40 data-[over]:bg-brand-tint"
            >
              <header className="flex items-center gap-2 px-[max(1rem,11px)] pb-[max(0.8rem,9px)] pt-[max(1rem,11px)]">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: s.dot }} />
                <h3 className="min-w-0 flex-1 truncate text-col font-semibold">{s.name}</h3>
                <span className="rounded-md bg-surface-3 px-2 py-0.5 text-chip font-medium text-ink-2">
                  {filtering ? cards.length : s.count + all.length - 6}
                </span>
              </header>
              <TickList>
                {/* Where a carried card would land; opened and closed by the drag. */}
                <div
                  data-slot={s.name}
                  aria-hidden="true"
                  className="hidden rounded-md border-[1.5px] border-dashed border-brand/40 bg-brand-soft"
                />
                {cards.map((p) => (
                  <CandidateCard key={p.id} p={p} stage={s.name} onPickUp={pickUp} onOpenCv={openCv} onMenu={openMenu} />
                ))}
              </TickList>
            </section>
          ))}
        </div>
      ) : (
        <ListView board={board} match={match} />
      )}

      {cvShown && cvFor && (
        <CvPreview
          ref={cvBox}
          name={cvFor.name}
          title={cvFor.title}
          // Sample: the two demo CVs in public/cvs; the real board reads each candidate's own.
          src={cvFor.name === "Rashini Kaweesha" ? "/cvs/p1.pdf" : "/cvs/p2.pdf"}
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
          moves={movesFrom(menu.card, menu.stage, USER.role)}
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
          ask={{ needs: ask.needs, name: ask.card.name, from: ask.from, to: STAGES.find((st) => st.name === ask.to)!, jobs: OTHER_JOBS }}
          onCancel={() => setAskOpen(false)}
          onSave={(note) => {
            setAskOpen(false);
            // "Add to another job" moves nobody on this board; it only says so.
            if (ask.needs === "job") tell(ask.card.name, ` added to TA Follow-Up on ${note}. They stay on this job too.`);
            else moveCard(ask.card, ask.from, ask.to, { note, pop: true });
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
        <p className="mt-[max(0.6rem,8px)] text-[max(0.85rem,12.5px)] leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">{name}</span> moved from <Stage s={from} /> to{" "}
          <Stage s={to} />.
        </p>
        {note && (
          <p className="mt-[max(0.5rem,6px)] rounded-xl bg-surface-2 px-3 py-2 text-[max(0.8rem,11.5px)] leading-relaxed text-ink">{note}</p>
        )}
        <div className="mt-[max(1.4rem,16px)] flex justify-end gap-[max(0.6rem,8px)]">
          {!note && (
            <button
              type="button"
              onClick={onUndo}
              className="h-[max(2.4rem,33px)] rounded-full border border-border px-[max(1.2rem,15px)] text-[max(0.85rem,12.5px)] text-ink hover:bg-surface-2"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={onDone}
            className="h-[max(2.4rem,33px)] rounded-full bg-brand px-[max(1.4rem,17px)] text-[max(0.85rem,12.5px)] font-medium text-white hover:bg-brand-strong"
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
      aria-label={label ?? "Back: choose where to go"}
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
      data-locked={p.lockedBy ? "" : undefined}
      onPointerDown={(e) => onPickUp(e, p, stage)}
      // A click opens the CV: start pdf.js on the way in, so it opens with no wait.
      onPointerEnter={() => warmPdf()}
      // A click anywhere on the card (name, initials, details) opens the CV
      // (owner, 12 Nov 2026); a drag does not.
      onClick={(e) => {
        if (e.currentTarget.dataset.dragged) return;
        onOpenCv(p);
      }}
      className="cursor-grab select-none rounded-md border border-border bg-white p-[max(1rem,12px)] data-[locked]:cursor-default data-[locked]:bg-canvas"
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
        <LinkedInIcon />
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
          aria-label={`Open the CV of ${p.name}`}
          className="cursor-pointer rounded-md bg-surface-3 px-1.5 py-0.5 text-ink transition-colors hover:bg-brand hover:text-white"
        >
          CV
        </button>
        {chip("Salary")}
        {chip("Notice Period")}
        {p.lockedBy ? (
          // Another TA's candidate: no menu, no move (the TA System's collision lock).
          <span className="ml-auto flex min-w-0 items-center gap-1 text-ink-2" title={`Shortlisted by ${p.lockedBy}. You cannot contact.`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[max(0.8rem,11px)] shrink-0" aria-hidden="true">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <span className="truncate">{p.lockedBy}&rsquo;s</span>
          </span>
        ) : (
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
        )}
      </div>
    </article>
  );
});

/** The same candidates as one table. */
function ListView({ board, match }: { board: Record<string, Card[]>; match: (p: Card) => boolean }) {
  const rows = STAGES.flatMap((s) => board[s.name].filter(match).map((p) => ({ p, stage: s })));
  return (
    <div className="min-h-0 flex-1 overflow-auto px-[max(1.5rem,14px)]">
      <table className="w-full text-left text-card-line">
        <thead className="sticky top-0 bg-white text-ink-2">
          <tr>
            {["Name", "Stage", "Company", "Location", "Experience", "Phone", "Email"].map((h) => (
              <th key={h} className="border-b border-border py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, stage }) => (
            <tr key={p.id} className="hover:bg-surface-2">
              <td className="border-b border-border py-2 pr-4 font-medium text-ink">{p.name}</td>
              <td className="border-b border-border py-2 pr-4">
                <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: stage.dot }} />
                {stage.name}
              </td>
              <td className="border-b border-border py-2 pr-4">{p.company}</td>
              <td className="border-b border-border py-2 pr-4">{p.location}</td>
              <td className="border-b border-border py-2 pr-4">{p.years}</td>
              <td className="border-b border-border py-2 pr-4">{p.phone}</td>
              <td className="border-b border-border py-2 pr-4">{p.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[max(1.25rem,16px)] shrink-0" aria-label="LinkedIn">
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
