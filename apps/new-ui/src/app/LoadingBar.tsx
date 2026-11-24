"use client";

import { useEffect, useRef } from "react";
import { DUR, EASE, gsap, motionOK } from "@/lib/gsap";

// The loading bar inside a tab (owner, 14 Nov 2026: "the rounded bar should be
// animated... give the premium vibe"): a soft rounded track rises in, a glowing pill
// in AURA's colours glides along it while `on`, and when it goes off the track fills
// with the brand green and sinks away. Less motion asked for: the pill holds still.
// Used by the main pages' tab (Board.tsx) and a work view's tab in an opening.
export default function LoadingBar({ on, className = "" }: { on: boolean; className?: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const shown = useRef(false);
  useEffect(() => {
    const el = bar.current;
    if (!el || on === shown.current) return;
    shown.current = on;
    const comet = el.querySelector<HTMLElement>("[data-comet]");
    const fill = el.querySelector<HTMLElement>("[data-fill]");
    if (on) {
      gsap.set(fill, { scaleX: 0 });
      gsap.fromTo(el, { opacity: 0, y: -6, scaleX: 0.6 }, { opacity: 1, y: 0, scaleX: 1, duration: DUR.base, ease: EASE.pop, overwrite: true });
      const loop = motionOK() ? gsap.fromTo(comet, { xPercent: -120 }, { xPercent: 270, duration: 1.15, ease: "power2.inOut", repeat: -1 }) : gsap.set(comet, { xPercent: 75 });
      return () => void loop.kill();
    }
    gsap.to(fill, { scaleX: 1, duration: DUR.base, ease: EASE.out, overwrite: true });
    gsap.to(el, { opacity: 0, y: -6, duration: DUR.base, delay: DUR.base, ease: EASE.in, overwrite: true });
  }, [on]);
  return (
    <div
      ref={bar}
      aria-hidden="true"
      style={{ opacity: 0 }}
      className={"pointer-events-none absolute h-[max(0.3rem,4px)] overflow-hidden rounded-full bg-brand-tint " + className}
    >
      <span data-comet className="absolute inset-y-0 left-0 w-[38%] rounded-full bg-[linear-gradient(90deg,transparent,var(--color-aura-1),var(--color-aura-2),var(--color-aura-3),transparent)]" />
      <span data-fill className="absolute inset-0 origin-left scale-x-0 rounded-full bg-brand" />
    </div>
  );
}
