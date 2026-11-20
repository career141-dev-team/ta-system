"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { gsap, motionOK } from "@/lib/gsap";

// The steps AURA shows while a search runs, instead of one "Looking…" line (owner,
// 20 Nov 2026: LinkedIn Search's steps "make the user experience far better, and make
// the developers also understand what's the process going on" - every search gets them).
// Each finished step pops and draws its tick and shows how long it took; the step in
// progress breathes. On a phone, or in a small box (`compact`), it is one line: the step
// now, "Step 3 of 5" and a thin bar. Plain useEffect, gsap.set-style starts (DESIGN.md).

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

  // The rows rise in one after another the first time.
  useEffect(() => {
    const ol = list.current;
    if (!ol || !motionOK()) return;
    const rows = ol.children;
    gsap.set(rows, { opacity: 0, y: 14 });
    const tw = gsap.to(rows, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.08, clearProps: "transform,opacity" });
    return () => void tw.kill();
  }, []);

  // A step finishing: its mark pops and the tick draws; the next one's words slide in
  // and its dot breathes.
  useEffect(() => {
    if (!motionOK()) return;
    const kill: (() => void)[] = [];
    for (const box of [list.current, line.current]) {
      if (!box || !box.offsetParent) continue;
      const rows = box === list.current ? (Array.from(box.children) as HTMLElement[]) : [null, box];
      const prev = box === list.current ? rows[at - 1] : null;
      const cur = box === list.current ? rows[at] : box;
      const find = (r: HTMLElement | null | undefined, s: string) => r?.querySelector<HTMLElement>(s) ?? null;
      const tl = gsap.timeline();
      const mark = find(prev, "[data-mark]");
      const tick = find(prev, "[data-tick]");
      if (mark) tl.fromTo(mark, { scale: 0.5 }, { scale: 1, duration: 0.5, ease: "back.out(2.4)", clearProps: "transform" }, 0);
      if (tick) tl.fromTo(tick, { strokeDasharray: 14, strokeDashoffset: 14 }, { strokeDashoffset: 0, duration: 0.38, ease: "power2.out" }, 0.08);
      const label = find(cur, "[data-label]");
      if (label) tl.fromTo(label, { x: -10, opacity: 0.3 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out", clearProps: "transform,opacity" }, 0);
      const dot = find(cur, "[data-dot]");
      const pulse = dot ? gsap.fromTo(dot, { scale: 1 }, { scale: 1.7, duration: 0.7, ease: "sine.inOut", yoyo: true, repeat: -1 }) : null;
      kill.push(() => {
        tl.kill();
        pulse?.kill();
      });
    }
    return () => kill.forEach((k) => k());
  }, [at]);

  const now = steps[at];
  return (
    <div role="status" aria-live="polite" className={className}>
      <ol ref={list} className={(compact ? "hidden" : "flex max-md:hidden") + " flex-col gap-[max(1.1rem,12px)]"}>
        {steps.map((s, i) => {
          const done = i < at;
          const cur = i === at;
          return (
            <li key={s.label} className="flex flex-col gap-2">
              <div className="flex min-w-0 items-center gap-4">
                <Mark done={done} now={cur} />
                <span data-label className={"text-body " + (done || cur ? "text-ink" : "text-ink-3")}>{s.label}</span>
                {done && took[i] != null && <span className="font-mono text-caption text-ink-3">{secs(took[i])}</span>}
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
          <span data-label className="min-w-0 flex-1 truncate text-body text-ink">{now?.label}</span>
          <span className="shrink-0 font-mono text-caption text-ink-3">
            Step {at + 1} of {steps.length}
          </span>
        </div>
        <span className="ml-[calc(1.4rem+12px)] flex gap-1" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.label} className={"h-1 flex-1 rounded-full transition-colors " + (i < at ? "bg-brand" : i === at ? "bg-violet" : "bg-surface-3")} />
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
      className={"flex size-[max(1.4rem,18px)] shrink-0 items-center justify-center rounded-full " + (done ? "bg-brand text-white" : now ? "border-2 border-violet bg-surface" : "border border-border-strong")}
    >
      {done ? (
        <svg viewBox="0 0 11 11" className="size-[11px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path data-tick d="M9.17 2.75 4.13 7.79 1.83 5.5" />
        </svg>
      ) : now ? (
        <span data-dot className="size-2 rounded-full bg-violet" />
      ) : null}
    </span>
  );
}
