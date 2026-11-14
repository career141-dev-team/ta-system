"use client";

import { useEffect, useRef } from "react";
import { gsap, motionOK } from "@/lib/gsap";

// AURA, behind Start workday (owner, 14 Nov 2026): the design's glow, at the design's
// size - violet on the left, blue in the middle, green on the right - but alive, like a
// cloud. Each colour is one big soft light (never smaller than drawn) with softer puffs
// on its outer edges; the puffs swell, shrink and drift on their own slow clocks, so the
// edges and sides of the glow billow the way a cloud's do. It also leans a little toward
// the pointer, brightens when Start workday is pointed at, and sends one ring of light
// out when it is pressed. Later it listens and speaks (a mic, the backend's voice).
//
// How it stays light: radial gradients with no blur filter, moved only by transform and
// opacity. Plain effects and tweens, never useGSAP, every loop killed when the screen
// goes. Less motion asked for: the same glow, still.

type Puff = { x: number; y: number; size: number };
type Cloud = { color: string; mix: number; box: string; puffs: Puff[] };

// The design's three patches (same boxes as before), each with puffs on its outer edges
// (x, y = the puff's middle, in % of the patch).
const CLOUDS: Cloud[] = [
  { color: "var(--color-aura-1)", mix: 30, box: "inset-y-0 left-0 w-[60%]", puffs: [{ x: 8, y: 50, size: 55 }, { x: 30, y: 12, size: 50 }, { x: 34, y: 88, size: 50 }] },
  { color: "var(--color-aura-2)", mix: 22, box: "inset-y-[8%] left-[25%] w-[50%]", puffs: [{ x: 50, y: 6, size: 55 }, { x: 50, y: 94, size: 55 }] },
  { color: "var(--color-aura-3)", mix: 28, box: "inset-y-0 right-0 w-[60%]", puffs: [{ x: 92, y: 50, size: 55 }, { x: 70, y: 12, size: 50 }, { x: 66, y: 88, size: 50 }] },
];

const fill = (color: string, mix: number) => ({ background: `radial-gradient(closest-side, color-mix(in srgb, ${color} ${mix}%, transparent), transparent)` });

export default function AuraGlow({ hover, pulse }: { hover: boolean; pulse: number }) {
  const field = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  // Alive on its own: each colour drifts and swells a little (never below its drawn
  // size), and the puffs on its edges billow on their own clocks.
  useEffect(() => {
    const el = field.current;
    if (!el || !motionOK()) return;
    const r = gsap.utils.random;
    const bodies = [...el.querySelectorAll<HTMLElement>("[data-cloud]")];
    const puffs = [...el.querySelectorAll<HTMLElement>("[data-puff]")];
    const drift = (b: HTMLElement) =>
      gsap.to(b, { xPercent: r(-14, 14), yPercent: r(-12, 12), scaleX: r(1, 1.2), scaleY: r(1, 1.2), duration: r(4, 7), ease: "sine.inOut", onComplete: () => void drift(b) });
    const billow = (p: HTMLElement) =>
      gsap.to(p, { xPercent: r(-35, 35), yPercent: r(-35, 35), scaleX: r(0.8, 1.6), scaleY: r(0.8, 1.6), opacity: r(0.5, 1), duration: r(2.5, 5), ease: "sine.inOut", onComplete: () => void billow(p) });
    bodies.forEach((b) => drift(b));
    puffs.forEach((p) => billow(p));

    // It notices you: the whole cloud leans a little toward the pointer, lagging behind.
    const leanX = gsap.quickTo(el, "x", { duration: 1.8, ease: "power3.out" });
    const leanY = gsap.quickTo(el, "y", { duration: 1.8, ease: "power3.out" });
    const move = (e: PointerEvent) => {
      leanX((e.clientX / innerWidth - 0.5) * 50);
      leanY((e.clientY / innerHeight - 0.5) * 30);
    };
    addEventListener("pointermove", move, { passive: true });
    return () => {
      removeEventListener("pointermove", move);
      gsap.killTweensOf([...bodies, ...puffs, el]);
    };
  }, []);

  // Pointing at Start workday: the cloud brightens (it never shrinks).
  useEffect(() => {
    if (!field.current) return;
    gsap.to(field.current, { opacity: hover ? 1 : 0.85, duration: 0.6, ease: "power2.out" });
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
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div data-glow className="relative top-[14%] h-[78%] w-[62%]">
        <div ref={field} className="absolute inset-0 opacity-85">
          {CLOUDS.map((c, i) => (
            <div key={i} className={"absolute " + c.box}>
              <div data-cloud className="absolute inset-0 will-change-transform" style={fill(c.color, c.mix)} />
              {c.puffs.map((p, j) => (
                <div
                  key={j}
                  data-puff
                  className="absolute will-change-transform"
                  style={{ left: `${p.x - p.size / 2}%`, top: `${p.y - p.size / 2}%`, width: `${p.size}%`, height: `${p.size}%`, ...fill(c.color, c.mix) }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div ref={ring} className="aspect-square w-[30%] rounded-full border-2 opacity-0" style={{ borderColor: "color-mix(in srgb, var(--color-aura-2) 45%, transparent)" }} />
        </div>
      </div>
    </div>
  );
}
