"use client";

import { useEffect, useRef } from "react";
import { gsap, motionOK } from "@/lib/gsap";

// AURA, behind Start workday (owner, 14 Nov 2026): the design's glow exactly as drawn -
// violet on the left, blue in the middle, green on the right, same shape and size - only
// alive: each colour drifts slowly on its own and swells a little (never smaller than
// drawn), so the edges keep moving like a cloud. It leans a little toward the pointer,
// swells a little when Start workday is pointed at, and sends one ring of light out when it is
// pressed. Later it listens and speaks (a mic, the backend's voice).
//
// Radial gradients only (no blur filter), moved by transform and opacity. Plain effects
// and tweens, never useGSAP, every loop killed when the screen goes. Less motion asked
// for: the same glow, still.

// The design's three patches.
const CLOUDS = [
  { color: "var(--color-aura-1)", mix: 30, box: "inset-y-0 left-0 w-[60%]" },
  { color: "var(--color-aura-2)", mix: 22, box: "inset-y-[8%] left-[25%] w-[50%]" },
  { color: "var(--color-aura-3)", mix: 28, box: "inset-y-0 right-0 w-[60%]" },
];

export default function AuraGlow({ hover, pulse }: { hover: boolean; pulse: number }) {
  const field = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = field.current;
    if (!el || !motionOK()) return;
    const r = gsap.utils.random;
    const bodies = [...el.querySelectorAll<HTMLElement>("[data-cloud]")];
    const drift = (b: HTMLElement) =>
      gsap.to(b, { xPercent: r(-10, 10), yPercent: r(-8, 8), scaleX: r(1, 1.1), scaleY: r(1, 1.1), duration: r(4, 7), ease: "sine.inOut", onComplete: () => void drift(b) });
    bodies.forEach((b) => drift(b));

    // It notices you: the whole glow leans a little toward the pointer, lagging behind.
    const leanX = gsap.quickTo(el, "x", { duration: 1.8, ease: "power3.out" });
    const leanY = gsap.quickTo(el, "y", { duration: 1.8, ease: "power3.out" });
    const move = (e: PointerEvent) => {
      leanX((e.clientX / innerWidth - 0.5) * 50);
      leanY((e.clientY / innerHeight - 0.5) * 30);
    };
    addEventListener("pointermove", move, { passive: true });
    return () => {
      removeEventListener("pointermove", move);
      gsap.killTweensOf([...bodies, el]);
    };
  }, []);

  // Pointing at Start workday: the glow swells a little toward it.
  useEffect(() => {
    if (!field.current) return;
    gsap.to(field.current, { scale: hover ? 1.05 : 1, duration: 0.6, ease: "power2.out" });
  }, [hover]);

  // Pressed: one soft ring of light goes out from the button.
  useEffect(() => {
    if (!pulse || !ring.current || !motionOK()) return;
    const t = gsap.fromTo(ring.current, { scale: 0.35, opacity: 0.9 }, { scale: 1.6, opacity: 0, duration: 0.7, ease: "power2.out" });
    return () => {
      t.kill();
    };
  }, [pulse]);

  return (
    // Centred by layout, never by a CSS translate: GSAP owns the transform of what it moves.
    // overflow-hidden: the clouds drift past this box, and that overflow made the whole Today
    // card scroll a few pixels (owner, 20 Nov 2026: "this tab is scrolling inside").
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      <div data-glow className="relative top-[14%] h-[78%] w-[62%]">
        <div ref={field} className="absolute inset-0">
          {CLOUDS.map((c, i) => (
            <div
              key={i}
              data-cloud
              className={"absolute will-change-transform " + c.box}
              style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${c.color} ${c.mix}%, transparent), transparent)` }}
            />
          ))}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div ref={ring} className="aspect-square w-[30%] rounded-full border-2 opacity-0" style={{ borderColor: "color-mix(in srgb, var(--color-aura-2) 45%, transparent)" }} />
        </div>
      </div>
    </div>
  );
}
