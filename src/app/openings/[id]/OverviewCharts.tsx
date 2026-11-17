"use client";

import { useEffect, useRef } from "react";
import Count from "@/app/Count";
import { EASE, MOTION, gsap } from "@/lib/gsap";

// The opening's numbers under its two lists, as two white cards (owner's design,
// 17 Nov 2026, replacing the slim strip): the three rings - CVs today, Position CVs,
// LinkedIn today - in one card, Days open and Strategies as thick bars in the other.
// The rings draw the way TA Track's rings do. Sample numbers until the backend sends
// them; they agree with the title row's targets.

export type OverviewNumbers = {
  cvsToday: number;
  cvsDayTarget: number;
  cvsOnJob: number;
  cvsTarget: number;
  linkedInToday: number;
  linkedInTarget: number;
  /** Days this opening has been open, against its priority's target (P1 14 ... P5 60). */
  daysOpen: number;
  priority: number;
  priorityDays: number;
  strategies: { done: number; working: number; notStarted: number };
};

/** Sample numbers, shared by the overviews so they agree: the targets on the title
 *  row (15 on LinkedIn, 20 CVs), P1 day 9 of 14, and the Strategies view (4 on this job). */
export const DEMO_NUMBERS: OverviewNumbers = {
  cvsToday: 4,
  cvsDayTarget: 5,
  cvsOnJob: 14,
  cvsTarget: 20,
  linkedInToday: 6,
  linkedInTarget: 15,
  daysOpen: 9,
  priority: 1,
  priorityDays: 14,
  strategies: { done: 1, working: 2, notStarted: 1 },
};

/** Under half of a target is behind (warn); the target met is reached. */
const stateOf = (n: number, target: number) => (n >= target ? "reached" : n < target / 2 ? "behind" : "on");
const pct = (n: number, target: number) => (target > 0 ? Math.min(100, Math.round((n / target) * 100)) : 0);

const CARD = "rounded-lg bg-white px-[max(1.75rem,16px)] py-[max(1.25rem,10px)]";

/** One number as a ring, drawn like TA Track's: a light track and a thick arc from the
 *  top, the number inside, the label and what is left beneath. */
function Ring({ n, target, label }: { n: number; target: number; label: string }) {
  const p = pct(n, target);
  const state = stateOf(n, target);
  const left = Math.max(0, target - n);
  const line = state === "reached" ? "Target reached" : `${n} of ${target} · ${left} to go`;
  const behind = state === "behind";
  return (
    <div className="flex min-w-0 flex-col items-center gap-[max(0.5rem,4px)] text-center">
      <span className="relative grid size-[max(6rem,66px)] place-items-center" title={`${p}% of the target`}>
        <svg viewBox="0 0 120 120" className="absolute inset-0 size-full" aria-hidden="true">
          <circle cx="60" cy="60" r="52" fill="none" strokeWidth="9" className="stroke-surface-2" />
          <circle
            data-draw="arc"
            data-to={p}
            cx="60"
            cy="60"
            r="52"
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            className={behind ? "stroke-warn" : "stroke-brand"}
            pathLength={100}
            strokeDasharray={`${p} 100`}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <span className={"relative text-h3 font-semibold tabular-nums " + (behind ? "text-warn" : "text-ink-2")}>
          <Count n={n} />
        </span>
      </span>
      <div className="min-w-0 max-w-full">
        <p className="truncate text-body font-semibold text-ink">{label}</p>
        <p className={"truncate text-small " + (behind ? "text-warn" : state === "reached" ? "text-brand" : "text-ink-3")} title={line}>
          {line}
        </p>
      </div>
    </div>
  );
}

/** One target as a thick bar: what it counts and the number against its target. */
function Bar({ label, value, of, children, title }: { label: string; value: number; of: string; children: React.ReactNode; title: string }) {
  return (
    <div className="min-w-0" title={title}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-body font-semibold text-ink">{label}</span>
        <span className="shrink-0 text-small tabular-nums text-ink-3">
          <b className="font-semibold text-ink">{value}</b> {of}
        </span>
      </div>
      <div className="mt-[max(0.75rem,6px)] h-[max(0.75rem,9px)] overflow-hidden rounded-full bg-surface-2">{children}</div>
    </div>
  );
}

export default function OverviewCharts({ data }: { data: OverviewNumbers }) {
  const ref = useRef<HTMLElement>(null);

  // TA Track's draw-in (useDraw in ta-track/TaTrackView.tsx): every arc grows from
  // zero round the ring, a little after the one before; the bars run across. Start
  // states are set at once, plain tweens (not useGSAP), and nothing is ever left
  // half drawn. Once, when the overview first shows - it stays mounted under a view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const arcs = el.querySelectorAll<SVGElement>('[data-draw="arc"]');
    const bars = el.querySelectorAll<HTMLElement>('[data-draw="bar"]');
    const tweens: gsap.core.Tween[] = [];
    arcs.forEach((a, i) => {
      const to = Number(a.dataset.to ?? 0);
      gsap.set(a, { attr: { "stroke-dasharray": "0 100" } });
      tweens.push(gsap.to(a, { attr: { "stroke-dasharray": `${to} 100` }, duration: MOTION.drawIn * 2, ease: EASE.out, delay: i * 0.03 }));
    });
    if (bars.length) {
      gsap.set(bars, { scaleX: 0, transformOrigin: "left center" });
      tweens.push(gsap.to(bars, { scaleX: 1, duration: MOTION.drawIn * 1.5, ease: EASE.out, stagger: 0.03, clearProps: "transform" }));
    }
    const done = setTimeout(() => tweens.forEach((t) => t.progress(1)), 2500);
    return () => {
      clearTimeout(done);
      tweens.forEach((t) => t.progress(1).kill());
    };
  }, []);

  const s = data.strategies;
  const total = s.done + s.working + s.notStarted;
  const late = data.daysOpen > data.priorityDays;
  const daysLeft = data.priorityDays - data.daysOpen;

  return (
    <section
      ref={ref}
      aria-label="This job's numbers"
      className="mt-[max(0.75rem,8px)] grid shrink-0 gap-[max(1rem,10px)] md:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)]"
    >
      <div className={CARD + " grid grid-cols-1 gap-[max(1rem,10px)] sm:grid-cols-3"}>
        <Ring n={data.cvsToday} target={data.cvsDayTarget} label="CVs today" />
        <Ring n={data.cvsOnJob} target={data.cvsTarget} label="Position CVs" />
        <Ring n={data.linkedInToday} target={data.linkedInTarget} label="LinkedIn today" />
      </div>

      {/* Targets & strategies: two thick bars. */}
      <div className={CARD + " flex flex-col justify-center gap-[max(1.5rem,12px)]"}>
        <Bar
          label="Days open"
          value={data.daysOpen}
          of={`/ ${data.priorityDays} days`}
          title={late ? `P${data.priority} target · ${-daysLeft} days over` : `P${data.priority} target · ${daysLeft} days left`}
        >
          <div data-draw="bar" className={"h-full rounded-full " + (late ? "bg-danger" : "bg-brand")} style={{ width: `${pct(data.daysOpen, data.priorityDays)}%` }} />
        </Bar>
        <Bar label="Strategies" value={s.done} of={`/ ${total} done`} title={`${s.done} done · ${s.working} in progress · ${s.notStarted} not started`}>
          {total > 0 && (
            <div data-draw="bar" className="flex h-full gap-px">
              <span className="h-full rounded-full bg-brand" style={{ width: `${(s.done / total) * 100}%` }} />
              <span className="h-full rounded-full bg-brand/40" style={{ width: `${(s.working / total) * 100}%` }} />
            </div>
          )}
        </Bar>
      </div>
    </section>
  );
}
