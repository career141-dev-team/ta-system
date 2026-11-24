"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { gsap, motionOK } from "@/lib/gsap";

// The steps AURA shows while a search runs, instead of one "Looking…" line (owner,
// 20 Nov 2026: LinkedIn Search's steps "make the user experience far better, and make
// the developers also understand what's the process going on" - every search gets them).
// A line joins the steps and fills as each one finishes; a finished step pops, draws its
// tick, ripples and shows how long it took; the step running has an orbiting ring, light
// sweeping across its words and a live clock. On a phone, or in a small box (`compact`),
// it is one line: the step now, "Step 3 of 5" and a bar whose current part shimmers.
// Plain useEffect, gsap.set-style starts (DESIGN.md).

export type Step = { label: string; detail?: ReactNode; extra?: ReactNode };

/** Steps that move on by themselves every `every` ms up to `waitAt`, which waits for the
 *  backend; `real` is the step the backend really reached (it only ever moves forward). */
export function useSteps(busy: boolean, waitAt: number, every = 750, real = 0) {
  const [timed, setTimed] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const t = Array.from({ length: waitAt }, (_, i) => setTimeout(() => setTimed(i + 1), every * (i + 1)));
    return () => {
      t.forEach(clearTimeout);
      setTimed(0);
    };
  }, [busy, waitAt, every]);
  return Math.max(timed, real);
}

const secs = (ms: number) => `${Math.max(0.1, ms / 1000).toFixed(1)} s`;

// The step running: ink words with a band of AURA violet sweeping across them.
const SHINE =
  "bg-[linear-gradient(90deg,var(--color-ink)_0%,var(--color-ink)_38%,var(--color-violet)_50%,var(--color-ink)_62%,var(--color-ink)_100%)] bg-[length:250%_100%] bg-clip-text text-transparent";
// From under this step's mark to the top of the next one (row height, mark size, list gap).
const LINE = {
  left: "calc(max(1.4rem, 18px) / 2 - 1px)",
  top: "calc(max(1.75rem, 22px) / 2 + max(1.4rem, 18px) / 2 + 3px)",
  bottom: "calc(-1 * (max(1.1rem, 12px) + max(1.75rem, 22px) / 2 - max(1.4rem, 18px) / 2 - 3px))",
} as const;

export function SearchSteps({ steps, at, compact = false, className = "" }: { steps: Step[]; at: number; compact?: boolean; className?: string }) {
  const list = useRef<HTMLOListElement>(null);
  const line = useRef<HTMLDivElement>(null);
  // When each step finished, so its time shows beside the tick.
  const began = useRef<number[]>([]);
  const [took, setTook] = useState<number[]>([]);
  useEffect(() => {
    const now = performance.now();
    const b = began.current;
    if (!b.length) b[0] = now;
    const add: number[] = [];
    for (let i = 1; i <= at; i++) {
      if (b[i] == null) {
        b[i] = now;
        add[i - 1] = now - b[i - 1];
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the time a step finished is only known here
    if (add.length) setTook((t) => steps.map((_, i) => add[i] ?? t[i]));
  }, [at, steps]);

  // The rows rise in one after another the first time, each mark popping in.
  useEffect(() => {
    const ol = list.current;
    if (!ol || !motionOK()) return;
    const rows = ol.children;
    gsap.set(rows, { opacity: 0, y: 14 });
    const tl = gsap.timeline();
    tl.to(rows, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.08, clearProps: "transform,opacity" }, 0);
    tl.fromTo(ol.querySelectorAll("[data-mark]"), { scale: 0 }, { scale: 1, duration: 0.45, ease: "back.out(2.6)", stagger: 0.08, clearProps: "transform" }, 0.05);
    return () => void tl.progress(1).kill();
  }, []);

  // A step finishing (owner, 20 Nov 2026: "more unique and engaging"): its mark pops, the
  // tick draws, a ring ripples out and the line down to the next step fills; the next
  // step's ring orbits, its dot breathes, light sweeps across its words and its clock runs.
  useEffect(() => {
    if (!motionOK()) return;
    const kill: (() => void)[] = [];
    for (const box of [list.current, line.current]) {
      if (!box || !box.offsetParent) continue;
      const many = box === list.current;
      const rows = many ? (Array.from(box.children) as HTMLElement[]) : [];
      const prev = many ? rows[at - 1] : null;
      const cur = many ? rows[at] : box;
      const find = (r: HTMLElement | null | undefined, sel: string) => r?.querySelector<HTMLElement>(sel) ?? null;
      const tl = gsap.timeline();
      const mark = find(prev, "[data-mark]");
      const tick = find(prev, "[data-tick]");
      const ripple = find(prev, "[data-ripple]");
      const fill = find(prev, "[data-fill]");
      if (mark) tl.fromTo(mark, { scale: 0.5 }, { scale: 1, duration: 0.5, ease: "back.out(2.4)", clearProps: "transform" }, 0);
      if (tick) tl.fromTo(tick, { strokeDasharray: 14, strokeDashoffset: 14 }, { strokeDashoffset: 0, duration: 0.38, ease: "power2.out" }, 0.08);
      if (ripple) tl.fromTo(ripple, { scale: 1, opacity: 0.7 }, { scale: 2.3, opacity: 0, duration: 0.7, ease: "power2.out" }, 0.05);
      if (fill) tl.fromTo(fill, { scaleY: 0 }, { scaleY: 1, duration: 0.5, ease: "power2.inOut" }, 0.15);
      const label = find(cur, "[data-label]");
      if (label) tl.fromTo(label, { x: -10, opacity: 0.3 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out", clearProps: "transform,opacity" }, 0.2);
      const dot = find(cur, "[data-dot]");
      const orbit = find(cur, "[data-orbit]");
      const seg = find(cur, "[data-seg]");
      const loops: gsap.core.Tween[] = [];
      if (dot) loops.push(gsap.fromTo(dot, { scale: 1 }, { scale: 1.6, duration: 0.7, ease: "sine.inOut", yoyo: true, repeat: -1 }));
      if (orbit) loops.push(gsap.to(orbit, { rotate: 360, duration: 1.1, ease: "none", repeat: -1, transformOrigin: "50% 50%" }));
      if (label) loops.push(gsap.fromTo(label, { backgroundPositionX: "100%" }, { backgroundPositionX: "0%", duration: 1.6, ease: "none", repeat: -1 }));
      if (seg) loops.push(gsap.fromTo(seg, { xPercent: -100 }, { xPercent: 100, duration: 1.2, ease: "power1.inOut", repeat: -1 }));
      kill.push(() => {
        tl.kill();
        loops.forEach((l) => l.kill());
      });
    }
    // The step running keeps its own clock, so a slow step shows itself.
    const clock = list.current?.querySelector<HTMLElement>(`[data-clock="${at}"]`);
    const t0 = began.current[at] ?? performance.now();
    const timer = clock ? setInterval(() => (clock.textContent = secs(performance.now() - t0)), 100) : null;
    return () => {
      kill.forEach((k) => k());
      if (timer) clearInterval(timer);
    };
  }, [at]);

  const now = steps[at];
  return (
    <div role="status" aria-live="polite" className={className}>
      <ol ref={list} className={(compact ? "hidden" : "flex max-md:hidden") + " flex-col gap-[max(1.1rem,12px)]"}>
        {steps.map((s, i) => {
          const done = i < at;
          const cur = i === at;
          return (
            <li key={s.label} className="relative flex flex-col gap-2">
              {i < steps.length - 1 && (
                // The line down to the next step; it fills as this step finishes.
                <span aria-hidden="true" className="absolute w-0.5 overflow-hidden rounded-full bg-surface-3" style={LINE}>
                  <span data-fill className={"block size-full origin-top rounded-full bg-brand " + (done ? "" : "scale-y-0")} />
                </span>
              )}
              <div className="flex h-[max(1.75rem,22px)] min-w-0 items-center gap-4">
                <Mark done={done} now={cur} />
                <span data-label className={"truncate text-body " + (cur ? SHINE : done ? "text-ink" : "text-ink-3")}>{s.label}</span>
                {done && took[i] != null && <span className="shrink-0 font-mono text-caption text-ink-3">{secs(took[i])}</span>}
                {cur && <span data-clock={i} className="shrink-0 font-mono text-caption text-violet" />}
                {(done || cur) && s.detail && <span className="ml-auto min-w-0 truncate text-small text-ink-3">{s.detail}</span>}
              </div>
              {(done || cur) && s.extra}
            </li>
          );
        })}
      </ol>
      {/* One line on a phone or in a small box. */}
      <div ref={line} className={(compact ? "flex" : "hidden max-md:flex") + " min-w-0 flex-col gap-1.5"}>
        <div className="flex min-w-0 items-center gap-3">
          <Mark done={false} now />
          <span data-label className={"min-w-0 flex-1 truncate text-body " + SHINE}>{now?.label}</span>
          <span className="shrink-0 font-mono text-caption text-ink-3">
            Step {at + 1} of {steps.length}
          </span>
        </div>
        <span className="ml-[calc(max(1.4rem,18px)+12px)] flex gap-1" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.label} className={"relative h-1 flex-1 overflow-hidden rounded-full transition-colors duration-500 " + (i < at ? "bg-brand" : i === at ? "bg-violet-soft" : "bg-surface-3")}>
              {i === at && <span data-seg className="absolute inset-0 rounded-full bg-[linear-gradient(90deg,transparent,var(--color-aura-1),var(--color-aura-2),transparent)]" />}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/** Timed steps on one line, for a long run (Research, Suggestions); the last one waits. */
export function RunSteps({ steps, every }: { steps: string[]; every: number }) {
  const at = useSteps(true, steps.length - 1, every);
  return <SearchSteps compact className="mt-[max(1rem,10px)]" at={at} steps={steps.map((label) => ({ label }))} />;
}

function Mark({ done, now }: { done: boolean; now: boolean }) {
  return (
    <span
      data-mark
      aria-hidden="true"
      className={"relative flex size-[max(1.4rem,18px)] shrink-0 items-center justify-center rounded-full " + (done ? "bg-brand text-white" : now ? "bg-violet-soft" : "border border-border-strong bg-surface")}
    >
      {done ? (
        <>
          <span data-ripple className="pointer-events-none absolute inset-0 rounded-full border-2 border-brand opacity-0" />
          <svg viewBox="0 0 11 11" className="size-[11px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path data-tick d="M9.17 2.75 4.13 7.79 1.83 5.5" />
          </svg>
        </>
      ) : now ? (
        <>
          {/* A ring of AURA colour orbiting the mark while this step runs. */}
          <svg data-orbit viewBox="0 0 24 24" className="pointer-events-none absolute -inset-[3px] size-[calc(100%+6px)]" fill="none">
            <circle cx="12" cy="12" r="10.5" stroke="var(--color-violet)" strokeWidth="2" strokeLinecap="round" pathLength={100} strokeDasharray="38 100" />
          </svg>
          <span data-dot className="size-2 rounded-full bg-violet" />
        </>
      ) : null}
    </span>
  );
}
