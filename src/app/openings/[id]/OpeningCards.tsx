"use client";

import { useEffect, useRef } from "react";
import { DUR, EASE, gsap } from "@/lib/gsap";
import { door, jobFromAddress, useDoorQuery, useLive, type Answer } from "@/lib/backend";
import { liveRows, ta, useRows, type State } from "../../strategy/data";

// Under the opening's ATS / Headhunting lists, reached by scrolling (owner's two
// designs, 18 Nov 2026). The rings say how far each target is - done / target, the
// done number big in the middle (owner, 18 Nov: "the / with how many completed, make
// the middle numbers bigger") - and they draw in and count up when they come into view
// (they sit below the fold, so an animation on load was never seen). The Strategies
// card is this opening's own strategies from the Strategy Planner (owner, 18 Nov: "the
// strategies section content needs to change"). Sample numbers until the backend.

/** The opening the page shows (the planner's job id for PGP Glass). */
const JOB = "j1";

type RingData = { label: string; done: number; target: number; stroke: string };
const RINGS: RingData[] = [
  { label: "CVs Today", done: 4, target: 5, stroke: "stroke-brand-strong" },
  { label: "Position CVs", done: 14, target: 20, stroke: "stroke-warn" },
  { label: "LinkedIn Target", done: 11, target: 15, stroke: "stroke-info" },
];
const pct = (r: RingData) => Math.min(100, Math.round((r.done / r.target) * 100));

/** One ring: a thick arc on a faint track, done / target in the middle, the label and
 *  how many are left beside it. */
function Ring({ r }: { r: RingData }) {
  const left = Math.max(0, r.target - r.done);
  return (
    <div className="flex min-w-0 items-center gap-[max(2rem,14px)]">
      <span className="relative grid size-[max(13.8rem,104px)] shrink-0 place-items-center">
        <svg viewBox="0 0 120 120" className="absolute inset-0 size-full" aria-hidden="true">
          <circle cx="60" cy="60" r="54" fill="none" strokeWidth="9.5" className="stroke-surface-2" />
          <circle
            data-arc
            data-to={pct(r)}
            cx="60"
            cy="60"
            r="54"
            fill="none"
            strokeWidth="9.5"
            strokeLinecap="round"
            className={r.stroke}
            pathLength={100}
            strokeDasharray={`${pct(r)} 100`}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <span className="relative flex items-baseline gap-[max(0.3rem,2px)] tabular-nums">
          <span data-count={r.done} className="text-[max(3.4rem,26px)] font-semibold leading-none text-ink">
            {r.done}
          </span>
          <span className="text-[max(1.35rem,13px)] font-medium text-ink-3">/ {r.target}</span>
        </span>
      </span>
      <div className="min-w-0">
        <p className="truncate text-h3 font-semibold text-ink">{r.label}</p>
        <p className="mt-1 truncate text-small text-ink-2">
          {r.done} of {r.target} done
        </p>
        <p className={"truncate text-small " + (left ? "text-ink-3" : "font-medium text-brand-strong")}>
          {left ? `${left} to go` : "Target reached"}
        </p>
      </div>
    </div>
  );
}

type Status = Exclude<State, "na"> | "assigned";
const STATUS: Record<Status, { text: string; dot: string }> = {
  done: { text: "Submitted", dot: "bg-brand" },
  working: { text: "In progress", dot: "bg-info" },
  waiting: { text: "Waiting to accept", dot: "bg-warn" },
  assigned: { text: "Assigned", dot: "bg-warn" },
  open: { text: "Not started", dot: "bg-ink-3/60" },
};

/** One strategy card, from the sample planner or from ui/opening:strategies. */
type Card = { key: string; name: string; when: string; state: Status; who: string };

type DoorStrategy = { id: string; name: string; assignedTo: string[]; doneAt: number | null; submittedAt: number | null };
type Summary = Answer<{ opening: { team: { id: string; name: string }[] } }>;
const dayOf = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function OpeningCards() {
  const ref = useRef<HTMLDivElement>(null);
  const live = useLive();
  const job = live ? jobFromAddress() : null;
  const sum = useDoorQuery(door.summary, job ? { openingId: job } : "skip") as Summary | undefined;
  const real = useDoorQuery(door.strategies, job ? { openingId: job } : "skip") as Answer<{ rows: DoorStrategy[] }> | undefined;
  const sample = liveRows(useRows(), JOB);
  const team = new Map((sum?.ok ? sum.opening.team : []).map((t) => [t.id, t.name.split(" ")[0]]));
  const rows: Card[] = live
    ? (real?.ok ? real.rows : []).map((r) => ({
        key: r.id,
        name: r.name,
        when: r.doneAt ? `Done ${dayOf(r.doneAt)}` : "No day set",
        state: r.submittedAt ? "done" : r.doneAt ? "working" : r.assignedTo.length ? "assigned" : "open",
        who: r.assignedTo.length ? r.assignedTo.map((id) => team.get(id) ?? "a teammate").join(", ") : "No one yet",
      }))
    : sample.map((x) => ({
        key: x.name,
        name: x.name,
        when: x.state === "done" && x.done ? `Done ${x.done}` : x.when ? `Due ${x.when}` : "No day set",
        state: x.state as Exclude<State, "na">,
        who: (x.ta && ta(x.ta)?.first) || "No one yet",
      }));
  const submitted = rows.filter((x) => x.state === "done").length;
  // The cards can arrive after the first draw (the live read): set up again when they change.
  const sig = rows.map((r) => r.key + r.state).join("|");

  // Draw in when the cards come into view, once: arcs from nothing, numbers counting
  // up, strategy cards rising one after another. Start states set first, then tweened
  // (no useGSAP - the 14 Nov rule).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const arcs = el.querySelectorAll<SVGElement>("[data-arc]");
    const nums = el.querySelectorAll<HTMLElement>("[data-count]");
    const cards = el.querySelectorAll<HTMLElement>("[data-strategy]");
    gsap.set(arcs, { attr: { "stroke-dasharray": "0 100" } });
    nums.forEach((n) => (n.textContent = "0"));
    gsap.set(cards, { opacity: 0, y: 14 });
    const tl = gsap.timeline({ paused: true, defaults: { ease: EASE.out } });
    arcs.forEach((a, i) => tl.to(a, { attr: { "stroke-dasharray": `${a.dataset.to} 100` }, duration: 1.1, ease: "power2.out" }, i * 0.08));
    nums.forEach((n, i) => {
      const box = { v: 0 };
      tl.to(box, { v: Number(n.dataset.count), duration: 1.1, ease: "power2.out", onUpdate: () => void (n.textContent = String(Math.round(box.v))) }, i * 0.08);
    });
    tl.to(cards, { opacity: 1, y: 0, duration: DUR.slow, stagger: 0.06 }, 0.25);
    const seen = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && tl.play(), { threshold: 0.3 });
    seen.observe(el);
    return () => {
      seen.disconnect();
      // Never left at zero or hidden.
      tl.progress(1).kill();
    };
  }, [sig, live]);

  return (
    <div ref={ref} className="mt-[max(1rem,10px)] flex shrink-0 flex-col gap-[max(1rem,10px)]">
      {/* Signed in the rings are hidden: their numbers are samples until a backend
          read for CVs today / position CVs / LinkedIn target exists. */}
      {!live && <section aria-label="Targets" className="grid grid-cols-1 gap-6 rounded-lg bg-white px-[max(4rem,20px)] py-[max(5rem,22px)] sm:grid-cols-3">
        {RINGS.map((r) => (
          <Ring key={r.label} r={r} />
        ))}
      </section>}
      <section aria-labelledby="opening-strategies" className="rounded-lg bg-white px-[max(2.25rem,16px)] pb-[max(3.4rem,20px)] pt-[max(3.6rem,20px)]">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="opening-strategies" className="text-h3 font-semibold text-ink">
            Strategies
          </h2>
          {rows.length > 0 && (
            <p className="text-small text-ink-2">
              <b className="font-semibold text-ink">{submitted}</b> of {rows.length} submitted
            </p>
          )}
        </div>
        {rows.length ? (
          <div className="mt-[max(2.3rem,14px)] grid grid-cols-1 gap-[max(1.45rem,10px)] sm:grid-cols-2 md:grid-cols-4">
            {rows.map((x) => {
              const s = STATUS[x.state];
              return (
                <article key={x.key} data-strategy className="flex min-w-0 flex-col rounded-lg border border-border bg-white px-[max(1.6rem,14px)] py-[max(1.4rem,12px)]">
                  <p className="truncate text-small text-ink-3">{x.when}</p>
                  <h3 className="mt-[max(1rem,8px)] line-clamp-2 text-body font-semibold text-ink">{x.name}</h3>
                  <div className="mt-auto flex items-center justify-between gap-3 pt-[max(1.6rem,12px)] text-small">
                    <span className="flex min-w-0 items-center gap-2 text-ink-2">
                      <span className={"size-2 shrink-0 rounded-full " + s.dot} aria-hidden="true" />
                      <span className="truncate">{s.text}</span>
                    </span>
                    <span className="shrink-0 truncate text-ink-3">{x.who}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : live && !real ? (
          <div className="shimmer mt-4 h-[max(6rem,60px)] rounded-lg" />
        ) : (
          <p className="mt-4 text-small text-ink-3">No strategies planned for this job yet. A TA Lead plans them in the Strategy Planner.</p>
        )}
      </section>
    </div>
  );
}
