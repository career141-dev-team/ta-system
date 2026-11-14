"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { DUR, EASE, gsap } from "@/lib/gsap";

// The app's motion, once for every screen (owner, 14 Nov 2026: "apply GSAP for
// everything... every button... like a modern dashboard"). One motion per kind of
// thing, so nothing moves differently from one screen to the next:
//   - arrive: a page you open flows in - its blocks rise 12px and fade in, 35 ms
//     apart, the first 24 on screen only; never on a plain redraw or a view switch;
//   - press: anything you can press gives under the pointer and springs back;
//   - hover lift: a card you can open rises 3px while pointed at;
//   - nudge: an arrow in a link (`data-nudge`) moves 3px towards where it goes.
// Numbers count up with <Count> (./Count.tsx). Elements GSAP already moves (a
// pipeline card being dragged, `data-card-id`) and anything under `data-still` are
// left alone. Less motion asked for: gsap.ts speeds every tween up 25 times.

const PRESS = "button, a[href], [role=button], [role=tab], [role=radio], [role=option], [role=menuitem], label:has(> input)";
const LIFT = "main a[href].rounded-lg, main [data-card], main [data-lift]";
const ARRIVE =
  "main section, main article, main aside, main li, main [data-card], main [data-lift], main .grid > *, main [role=tablist], main h1, main form";
const STILL = "[data-card-id], [data-still], [data-still] *";

/** The page's blocks that are on screen, outermost only, at most 24, rising in. */
function arrive(main: Element | undefined) {
  if (!main) return;
  const seen: Element[] = [];
  for (const el of main.querySelectorAll<HTMLElement>(ARRIVE)) {
    if (seen.length >= 24 || el.matches(STILL) || seen.some((s) => s.contains(el))) continue;
    const r = el.getBoundingClientRect();
    if (!r.height || r.top > innerHeight || r.bottom < 0) continue;
    seen.push(el);
  }
  const tl = gsap.timeline();
  tl.fromTo(main, { opacity: 0 }, { opacity: 1, duration: DUR.fast, clearProps: "opacity" });
  if (seen.length)
    tl.fromTo(seen, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: DUR.slow, ease: EASE.out, stagger: 0.035, clearProps: "opacity,transform" }, 0.04);
  return tl;
}

/** The page address the motion last saw. */
let shown: string | null = null;

export default function Motion() {
  const path = usePathname();

  // Arrive: on each new page you move to - not the first load. On the first load
  // the page arrives as server HTML that React takes over (hydrates) a moment later,
  // part by part; styling it before then made React report a hydration mismatch
  // (14 Nov 2026). A page you move to is drawn by React itself, so it is safe.
  useEffect(() => {
    // The address, not a first-time flag: in development React runs this twice on
    // the first load, and a flag would be spent by the first run.
    if (shown === null || shown === path) {
      shown = path;
      return;
    }
    shown = path;
    // Board pages slide as one (src/app/Board.tsx); this is for the rest (an opening).
    if (document.querySelector("main [data-board-body]")) return;
    let tl: gsap.core.Timeline | undefined;
    // One frame on, so the new page is in place. The visible <main> only: with
    // Cache Components, Next keeps the page you left in the document, hidden
    // (display: none), and the first <main> found was often that old one.
    // A busy or background tab can hold frames back, and a page must never be left
    // half-faded: 1.5 s of real time after it starts, it is fully there, whatever
    // the frames did. (Until it starts, nothing has been hidden.)
    let done: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      tl = arrive([...document.querySelectorAll("main")].find((m) => m.getClientRects().length > 0));
      done = setTimeout(() => tl?.progress(1), 1500);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(done);
      tl?.progress(1).kill();
    };
  }, [path]);

  // Press, hover lift and nudge: one listener each for the whole app.
  useEffect(() => {
    const target = (e: Event, sel: string) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>(sel);
      if (!el || el.matches(STILL) || el.closest("[data-still]")) return null;
      if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return null;
      return el;
    };
    let held: HTMLElement | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      held = target(e, PRESS);
      if (held) gsap.to(held, { scale: 0.96, duration: DUR.tap, ease: EASE.out, overwrite: "auto" });
    };
    const up = () => {
      if (!held) return;
      // A lifted card keeps its lift; anything else is left with no inline transform.
      gsap.to(held, { scale: 1, duration: DUR.slow, ease: "back.out(3)", overwrite: "auto", clearProps: held.matches(LIFT) ? "" : "transform" });
      held = null;
    };
    const over = (e: PointerEvent) => {
      const card = target(e, LIFT);
      if (card && !card.contains(e.relatedTarget as Node)) gsap.to(card, { y: -3, duration: DUR.base, ease: EASE.out, overwrite: "auto" });
      const go = target(e, "a[href], button");
      const arrow = go?.querySelector<SVGElement>("[data-nudge]");
      if (arrow && go && !go.contains(e.relatedTarget as Node)) gsap.to(arrow, { x: 3, duration: DUR.base, ease: EASE.out, overwrite: "auto" });
      // Icon pop: a button's icon swells a touch and settles, so it is plain what
      // the pointer is on.
      const btn = target(e, "button, [role=button]");
      const icon = btn?.querySelector<SVGElement>("svg:not([data-nudge])");
      if (icon && btn && !btn.contains(e.relatedTarget as Node))
        gsap.to(icon, { scale: 1.14, duration: DUR.base, ease: "back.out(3)", overwrite: "auto", transformOrigin: "50% 50%" });
    };
    const out = (e: PointerEvent) => {
      const card = target(e, LIFT);
      if (card && !card.contains(e.relatedTarget as Node)) gsap.to(card, { y: 0, duration: DUR.base, ease: EASE.out, overwrite: "auto", clearProps: "transform" });
      const go = target(e, "a[href], button");
      const arrow = go?.querySelector<SVGElement>("[data-nudge]");
      if (arrow && go && !go.contains(e.relatedTarget as Node)) gsap.to(arrow, { x: 0, duration: DUR.base, ease: EASE.out, overwrite: "auto" });
      const btn = target(e, "button, [role=button]");
      const icon = btn?.querySelector<SVGElement>("svg:not([data-nudge])");
      if (icon && btn && !btn.contains(e.relatedTarget as Node)) gsap.to(icon, { scale: 1, duration: DUR.base, ease: EASE.out, overwrite: "auto", clearProps: "transform" });
    };
    addEventListener("pointerdown", down, true);
    addEventListener("pointerup", up, true);
    addEventListener("pointercancel", up, true);
    addEventListener("dragstart", up, true);
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    return () => {
      removeEventListener("pointerdown", down, true);
      removeEventListener("pointerup", up, true);
      removeEventListener("pointercancel", up, true);
      removeEventListener("dragstart", up, true);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
    };
  }, []);

  return null;
}
