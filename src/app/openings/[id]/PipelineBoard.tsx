"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gsap, useGSAP } from "@/lib/gsap";
import { useOpeningView } from "./view";
import PillMenu, { type MenuOption } from "./PillMenu";
import TickList from "./TickList";
import CvPreview from "./CvPreview";

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

/** Placeholder: this opening's priority tier, until it comes from the backend. */
const OPENING_TIER = "P2";

type Card = Person & { id: string; mine: boolean; owned: boolean; channel: string };

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

// The stages in the order the work moves, with the design's dot colours.
const STAGES = [
  { name: "TA Follow-Up", dot: "#14b8c4", count: 96 },
  { name: "Ai Follow-Up", dot: "#e8b417", count: 96 },
  { name: "Director Shortlist", dot: "#2f80ed", count: 96 },
  { name: "Client Shortlist", dot: "#a43ee0", count: 96 },
  { name: "Interview", dot: "#16a34a", count: 96 },
  { name: "Offer", dot: "#f97316", count: 96 },
  { name: "Placed", dot: "#1d4d3a", count: 96 },
];

/** Six sample cards per stage; the first stage starts with the design's first card.
 *  Owner and source vary so the filters have something to filter. */
const cardsFor = (i: number): Card[] =>
  Array.from({ length: 6 }, (_, n) => ({
    ...(i === 0 && n === 0 ? PEOPLE[0] : PEOPLE[1]),
    id: `${i}-${n}`,
    mine: n % 3 === 0,
    owned: n % 3 !== 2,
    channel: CHANNELS[(i + n) % CHANNELS.length],
  }));

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const TOOL_PILL =
  "flex h-[max(2.4rem,33px)] items-center gap-1.5 rounded-full border border-[#e3e5e8] bg-white px-[max(1rem,13px)] text-[max(0.85rem,12.5px)] text-ink";

export default function PipelineBoard() {
  const [mode, setMode] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [job, setJob] = useState("all");
  const [recruiter, setRecruiter] = useState("");
  const [priority, setPriority] = useState("");
  const [source, setSource] = useState("");

  // The board itself: the cards of each stage, by stage name. Dragging a card onto
  // another column moves it there (owner, 12 Nov 2026: "track and drop everyone
  // into every where they want"). Sample cards, held in the page for now; with the
  // backend a drop is one stage move through the TA System's own transition, which
  // can still refuse (a reject needs a reason, a Director decision is the Director's).
  const [board, setBoard] = useState<Record<string, Card[]>>(() =>
    Object.fromEntries(STAGES.map((s, i) => [s.name, cardsFor(i)])),
  );
  // Which column the carried card is over, and the card being carried (its height
  // sizes the slot that opens in that column).
  const [over, setOver] = useState<string | null>(null);
  const [carry, setCarry] = useState<{ id: string; from: string; h: number } | null>(null);
  // A drop waiting to land: the floating copy flies into the card's new place.
  const landing = useRef<{ id: string; ghost: HTMLElement } | null>(null);
  // The move just made, told back to the person AFTER it happens (owner, 12 Nov 2026:
  // "no need confirm before... after moving I need this"), with Undo. `at` is where
  // the card stood in its old column, so Undo puts it back in the same place.
  const [moved, setMoved] = useState<{ card: Card; from: string; to: string; at: number } | null>(null);
  const [undone, setUndone] = useState<{ id: string; n: number } | null>(null);
  // The candidate whose CV is open in the preview, if any.
  const [cvFor, setCvFor] = useState<Card | null>(null);

  /**
   * Pick up, carry and drop, all moved by GSAP (owner, 12 Nov 2026: the browser's own
   * drag had "no smooth animation... need to feel premium"). Pressing a card and
   * moving a few pixels lifts a floating copy of it; the copy follows the pointer
   * with a soft lag and sways with its speed; the column under it opens a slot;
   * letting go flies the copy into the slot, or back home when it is not over another
   * column. Only transform, opacity and shadow move, so it stays smooth.
   */
  const pickUp = (e: React.PointerEvent<HTMLElement>, card: Card, from: string) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const sx = e.clientX;
    const sy = e.clientY;
    let ghost: HTMLElement | null = null;
    let target: string | null = null;
    let lastX = sx;
    let xTo: (v: number) => void = () => {};
    let yTo: (v: number) => void = () => {};
    let tilt: (v: number) => void = () => {};
    // Where the pointer is, for the edge scroll below.
    let px = sx;
    let py = sy;
    let frame = 0;
    const board = el.closest<HTMLElement>("[data-board]");

    // Which column is under the pointer (not the one it came from).
    const aim = () => {
      const col = document.elementFromPoint(px, py)?.closest("[data-col]");
      const name = col?.getAttribute("aria-label") ?? null;
      const next = name && name !== from ? name : null;
      if (next !== target) {
        target = next;
        setOver(next);
      }
    };

    // Carried near the left or right edge of the board, the board scrolls that way
    // on its own, faster the nearer the edge, so a column out of sight (Offer,
    // Placed) can be reached and dropped on (owner, 12 Nov 2026: "if I pick a card I
    // need to go with side scroll").
    const edgeScroll = () => {
      frame = 0;
      if (!ghost || !board) return;
      const r = board.getBoundingClientRect();
      const zone = Math.min(140, r.width * 0.14);
      let v = 0;
      if (px > r.right - zone) v = ((px - (r.right - zone)) / zone) * 24;
      else if (px < r.left + zone) v = -((r.left + zone - px) / zone) * 24;
      if (v !== 0) {
        const before = board.scrollLeft;
        board.scrollLeft += v;
        if (board.scrollLeft !== before) aim(); // the columns slid under the pointer
      }
      frame = requestAnimationFrame(edgeScroll);
    };

    const lift = () => {
      const r = el.getBoundingClientRect();
      const g = el.cloneNode(true) as HTMLElement;
      g.removeAttribute("data-card-id"); // only the real card answers to its id
      Object.assign(g.style, {
        position: "fixed",
        left: r.left + "px",
        top: r.top + "px",
        width: r.width + "px",
        margin: "0",
        zIndex: "70",
        pointerEvents: "none",
      });
      document.body.append(g);
      document.body.style.cursor = "grabbing";
      gsap.set(g, { transformOrigin: sx - r.left + "px " + (sy - r.top) + "px", opacity: 1, scale: 1 });
      gsap.to(g, {
        scale: 1.05,
        rotation: -2,
        boxShadow: "0 26px 60px rgba(17, 44, 32, 0.22)",
        duration: 0.24,
        ease: "power2.out",
      });
      el.dataset.hold = "1"; // the column wheel leaves the faded original alone
      gsap.to(el, { opacity: 0.22, scale: 0.96, duration: 0.24, ease: "power2.out" });
      xTo = gsap.quickTo(g, "x", { duration: 0.28, ease: "power3.out" });
      yTo = gsap.quickTo(g, "y", { duration: 0.28, ease: "power3.out" });
      tilt = gsap.quickTo(g, "rotation", { duration: 0.45, ease: "power3.out" });
      ghost = g;
      setCarry({ id: card.id, from, h: r.height });
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
      if (target) {
        const to = target;
        landing.current = { id: card.id, ghost: g };
        setBoard((bd) => {
          setMoved({ card, from, to, at: bd[from].findIndex((c) => c.id === card.id) });
          return {
            ...bd,
            [from]: bd[from].filter((c) => c.id !== card.id),
            [to]: [card, ...bd[to]],
          };
        });
      } else {
        // Not over another column: glide home and settle.
        gsap.to(g, {
          x: 0,
          y: 0,
          rotation: 0,
          scale: 1,
          boxShadow: "0 0 0 rgba(0,0,0,0)",
          duration: 0.38,
          ease: "power3.out",
          onComplete: () => g.remove(),
        });
        gsap.to(el, { opacity: 1, scale: 1, duration: 0.3, delay: 0.1, onComplete: () => delete el.dataset.hold });
      }
      setOver(null);
      setCarry(null);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // Undo: the card goes back to its old column, in the place it stood, with a pop.
  const undoMove = () => {
    if (!moved) return;
    const { card, from, to, at } = moved;
    setBoard((bd) => {
      const back = [...bd[from]];
      back.splice(Math.max(0, Math.min(at, back.length)), 0, card);
      return { ...bd, [to]: bd[to].filter((c) => c.id !== card.id), [from]: back };
    });
    setUndone((u) => ({ id: card.id, n: (u?.n ?? 0) + 1 }));
    setMoved(null);
  };

  useEffect(() => {
    if (!undone) return;
    const card = document.querySelector<HTMLElement>('[data-card-id="' + undone.id + '"]');
    if (!card) return;
    card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    gsap.fromTo(card, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.6)" });
  }, [undone]);

  // The slot in the column under the carried card opens smoothly to the card's height.
  useEffect(() => {
    if (!over || !carry) return;
    const slot = document.querySelector<HTMLElement>('[data-slot="' + over + '"]');
    if (!slot) return;
    slot.parentElement?.scrollTo({ top: 0, behavior: "smooth" });
    gsap.fromTo(slot, { height: 0, opacity: 0 }, { height: carry.h, opacity: 1, duration: 0.3, ease: "power3.out" });
  }, [over, carry]);

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
      boxShadow: "0 8px 28px rgba(27, 107, 71, 0.12)",
      duration: 0.42,
      ease: "power3.inOut",
      onComplete: () => {
        delete card.dataset.hold;
        gsap.set(card, { opacity: 1, scale: 1 });
        l.ghost.remove();
      },
    });
  });

  const query = q.trim().toLowerCase();
  const filtering = !!(query || recruiter || priority || source);
  // ponytail: filters the sample cards in the browser; with the backend each
  // filter is part of the column's indexed, paged query instead.
  const match = (p: Card) =>
    (!query || [p.name, p.title, p.company].some((s) => s.toLowerCase().includes(query))) &&
    (recruiter !== "mine" || p.mine) &&
    (recruiter !== "none" || !p.owned) &&
    (!priority || priority === OPENING_TIER) &&
    (!source || p.channel === source);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Row one: back, and the two actions. */}
      <div className="flex items-center px-[max(1.5rem,14px)] pt-[max(1.4rem,14px)]">
        <BackButton />
        <div className="ml-auto flex items-center gap-[max(0.6rem,8px)]">
          <button type="button" className={TOOL_PILL}>
            <SlidersIcon />
            Automations
          </button>
          <button
            type="button"
            className="flex h-[max(2.6rem,35px)] items-center gap-1.5 rounded-full bg-pill-line px-[max(1.3rem,16px)] text-[max(0.85rem,12.5px)] font-medium text-white hover:bg-[#163d2e]"
          >
            <PlusIcon />
            Add candidate
          </button>
        </div>
      </div>

      {/* Row two: search, filters, and Board / List. */}
      <div className="flex items-center gap-[max(0.5rem,6px)] px-[max(1.5rem,14px)] pb-[max(1.2rem,12px)] pt-[max(1.1rem,11px)]">
        <label className="flex h-[max(2.4rem,33px)] w-[max(15.5rem,200px)] items-center gap-2 rounded-full border border-[#e3e5e8] bg-white px-[max(1rem,13px)]">
          <SearchIcon />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search candidates..."
            aria-label="Search candidates"
            className="min-w-0 flex-1 bg-transparent text-[max(0.85rem,12.5px)] outline-none placeholder:text-muted"
          />
        </label>
        <PillMenu options={JOBS} initial={job} onChange={setJob} mark="tick" pillClass={TOOL_PILL} />
        <PillMenu options={RECRUITERS} initial={recruiter} onChange={setRecruiter} mark="tick" pillClass={TOOL_PILL} />
        <PillMenu options={PRIORITIES} initial={priority} onChange={setPriority} mark="tick" pillClass={TOOL_PILL} />
        <PillMenu options={SOURCES} initial={source} onChange={setSource} mark="tick" pillClass={TOOL_PILL} />

        <div className="ml-auto flex items-center rounded-full bg-soft p-[3px] text-[max(0.85rem,12.5px)]">
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
                (mode === value ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")
              }
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "board" ? (
        // Columns side by side; the row scrolls sideways, each column scrolls itself.
        <div data-board className="flex min-h-0 flex-1 gap-[max(1.1rem,12px)] overflow-x-auto px-[max(1.5rem,14px)] [scrollbar-color:#e3e6ea_transparent] [scrollbar-width:thin]">
          {STAGES.map((s) => {
            const all = board[s.name];
            const cards = all.filter(match);
            return (
              <section
                key={s.name}
                data-col
                aria-label={s.name}
                className={
                  "flex min-h-0 w-[max(22rem,280px)] shrink-0 flex-col rounded-t-[1.2rem] border-[1.8px] border-b-0 transition-colors duration-300 " +
                  (over === s.name ? "border-[#9fd0b5] bg-[#f3faf6]" : "border-[#f2f3f6] bg-white")
                }
              >
                <header className="flex items-center gap-2 px-[max(1rem,11px)] pb-[max(0.8rem,9px)] pt-[max(1rem,11px)]">
                  <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: s.dot }} />
                  <h3 className="min-w-0 flex-1 truncate text-col font-semibold">{s.name}</h3>
                  <span className="rounded-md bg-[#eef0f2] px-2 py-0.5 text-chip font-medium text-muted">
                    {filtering ? cards.length : s.count + all.length - 6}
                  </span>
                </header>
                <TickList>
                  {over === s.name && carry && (
                    <div
                      data-slot={s.name}
                      aria-hidden="true"
                      className="rounded-[0.9rem] border-[1.5px] border-dashed border-[#9fd0b5] bg-[#eaf6ef]"
                    />
                  )}
                  {cards.map((p) => (
                    <CandidateCard key={p.id} p={p} onPickUp={(e) => pickUp(e, p, s.name)} onOpenCv={() => setCvFor(p)} />
                  ))}
                </TickList>
              </section>
            );
          })}
        </div>
      ) : (
        <ListView board={board} match={match} />
      )}

      {cvFor && (
        <CvPreview
          name={cvFor.name}
          title={cvFor.title}
          // Sample: the two demo CVs in public/cvs; the real board reads each candidate's own.
          src={cvFor.name === "Rashini Kaweesha" ? "/cvs/p1.pdf" : "/cvs/p2.pdf"}
          onClose={() => setCvFor(null)}
        />
      )}

      {moved && (
        <MovedNotice
          name={moved.card.name}
          from={STAGES.find((st) => st.name === moved.from)!}
          to={STAGES.find((st) => st.name === moved.to)!}
          onUndo={undoMove}
          onDone={() => setMoved(null)}
        />
      )}
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
  name,
  from,
  to,
  onUndo,
  onDone,
}: {
  name: string;
  from: { name: string; dot: string };
  to: { name: string; dot: string };
  onUndo: () => void;
  onDone: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);

  // The veil fades in and the box rises with a small spring.
  useGSAP(
    () => {
      // A short wait, so the card is seen landing before the box arrives.
      gsap.from("[data-veil]", { opacity: 0, duration: 0.2, ease: "power1.out", delay: 0.35 });
      gsap.from("[data-box]", { opacity: 0, y: 14, scale: 0.94, duration: 0.34, ease: "back.out(1.7)", delay: 0.35 });
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
        className="relative w-[max(26rem,320px)] rounded-[1.4rem] bg-white p-[max(1.6rem,20px)] shadow-[0_30px_80px_rgba(17,44,32,0.25)]"
      >
        <h2 id="move-title" className="flex items-center gap-2 text-[max(1.05rem,15px)] font-semibold text-ink">
          <span className="flex size-[max(1.4rem,19px)] items-center justify-center rounded-full bg-[#e6f4ec] text-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3/5" aria-hidden="true">
              <path d="m5 12 5 5 9-10" />
            </svg>
          </span>
          Candidate moved
        </h2>
        <p className="mt-[max(0.6rem,8px)] text-[max(0.85rem,12.5px)] leading-relaxed text-muted">
          <span className="font-semibold text-ink">{name}</span> moved from <Stage s={from} /> to{" "}
          <Stage s={to} />.
        </p>
        <div className="mt-[max(1.4rem,16px)] flex justify-end gap-[max(0.6rem,8px)]">
          <button
            type="button"
            onClick={onUndo}
            className="h-[max(2.4rem,33px)] rounded-full border border-[#e3e5e8] px-[max(1.2rem,15px)] text-[max(0.85rem,12.5px)] text-ink hover:bg-soft"
          >
            Undo
          </button>
          <button
            type="button"
            autoFocus
            onClick={onDone}
            className="h-[max(2.4rem,33px)] rounded-full bg-pill-line px-[max(1.4rem,17px)] text-[max(0.85rem,12.5px)] font-medium text-white hover:bg-[#163d2e]"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The round back arrow: returns to the opening's own screen. */
export function BackButton() {
  const { go } = useOpeningView();
  return (
    <button
      type="button"
      aria-label="Back to the opening"
      onClick={() => go("overview")}
      className="flex size-[max(2.6rem,35px)] shrink-0 items-center justify-center rounded-full border-[1.5px] border-pill-line text-pill-line transition-colors hover:bg-pill-line hover:text-white"
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

function CandidateCard({
  p,
  onPickUp,
  onOpenCv,
}: {
  p: Card;
  onPickUp: (e: React.PointerEvent<HTMLElement>) => void;
  onOpenCv: () => void;
}) {
  return (
    <article
      data-card-id={p.id}
      onPointerDown={onPickUp}
      // A click anywhere on the card (name, initials, details) opens the CV
      // (owner, 12 Nov 2026); a drag does not.
      onClick={(e) => {
        if (e.currentTarget.dataset.dragged) return;
        onOpenCv();
      }}
      className="cursor-grab touch-none select-none rounded-[0.9rem] border border-[#eef0f3] bg-white p-[max(1rem,12px)] will-change-transform"
    >
      <div className="flex items-start gap-[max(0.6rem,7px)]">
        <span className="flex size-[max(2.4rem,32px)] shrink-0 items-center justify-center rounded-full bg-[#e8f1fb] text-chip font-semibold text-[#4a78b0]">
          {initials(p.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-card-name font-semibold leading-tight text-ink">{p.name}</p>
          <p className="truncate text-card-sub text-muted">{p.title}</p>
        </div>
        <LinkedInIcon />
      </div>

      <div className="mt-[max(0.8rem,9px)] space-y-[max(0.4rem,4px)] text-card-line text-[#3d4240]">
        <p className="truncate">C : {p.company}</p>
        <p className="flex items-center">
          <span className="flex-1 truncate">L : {p.location}</span>
          <span aria-hidden="true" className="mx-2 h-[1em] w-px bg-[#3d4240]" />
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
            onOpenCv();
          }}
          aria-label={`Open the CV of ${p.name}`}
          className="cursor-pointer rounded-md bg-[#f0f1f3] px-1.5 py-0.5 text-ink transition-colors hover:bg-pill-line hover:text-white"
        >
          CV
        </button>
        <span className="rounded-md bg-[#f0f1f3] px-1.5 py-0.5 text-ink">Salary</span>
        <span className="rounded-md bg-[#fdf1dc] px-1.5 py-0.5 text-[#d48806]">Notice Period</span>
        <button
          type="button"
          aria-label={`More for ${p.name}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="ml-auto rounded p-0.5 text-ink hover:bg-soft"
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
}

/** The same candidates as one table. */
function ListView({ board, match }: { board: Record<string, Card[]>; match: (p: Card) => boolean }) {
  const rows = STAGES.flatMap((s) => board[s.name].filter(match).map((p) => ({ p, stage: s })));
  return (
    <div className="min-h-0 flex-1 overflow-auto px-[max(1.5rem,14px)] [scrollbar-width:thin]">
      <table className="w-full text-left text-card-line">
        <thead className="sticky top-0 bg-white text-muted">
          <tr>
            {["Name", "Stage", "Company", "Location", "Experience", "Phone", "Email"].map((h) => (
              <th key={h} className="border-b border-line py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, stage }) => (
            <tr key={p.id} className="hover:bg-soft">
              <td className="border-b border-line py-2 pr-4 font-medium text-ink">{p.name}</td>
              <td className="border-b border-line py-2 pr-4">
                <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: stage.dot }} />
                {stage.name}
              </td>
              <td className="border-b border-line py-2 pr-4">{p.company}</td>
              <td className="border-b border-line py-2 pr-4">{p.location}</td>
              <td className="border-b border-line py-2 pr-4">{p.years}</td>
              <td className="border-b border-line py-2 pr-4">{p.phone}</td>
              <td className="border-b border-line py-2 pr-4">{p.email}</td>
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
    <svg {...stroke} className={ICON + " text-muted"}>
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
