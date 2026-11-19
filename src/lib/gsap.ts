"use client";

// The one door to GSAP. Every animated component imports `gsap` and `useGSAP`
// from here, never from "gsap" directly, so plugins are registered once and
// before anything runs.
//
// How to animate in this app:
//   - Only in client components ("use client"), inside useGSAP(() => { ... },
//     { scope: ref }). The hook reverts everything on unmount, and the scope
//     keeps selectors like ".row" inside that component.
//   - A handler that animates later (a click, a hover) is wrapped in
//     contextSafe() from the hook, so it is cleaned up too.
//   - Sequences ("video flow") are a gsap.timeline(), not chained delays.
//   - Durations and eases come from DUR and EASE below, never literals, so the
//     whole app moves in one rhythm (12 Nov 2026: seven different overlay
//     entrances and three highlight speeds made it feel unfinished).
//   - A state change never waits on a tween: change the state on the click, and
//     let the motion play over the new state. When something must wait (an exit),
//     the wait is a plain setTimeout, because a busy or background tab can hold
//     back animation frames and an onComplete then arrives seconds late.
//
// A plugin is added when a screen first needs it, in the file that needs it, so
// it is not in the first download: Flip is registered in CvPreview. They all ship
// in the gsap package already: ScrollTrigger, Flip, SplitText, CustomEase,
// Observer, MotionPathPlugin, Draggable, InertiaPlugin, DrawSVGPlugin, ...
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/** Seconds. tap = a press or a highlight appearing; fast = exits and small
 *  things; base = most entrances and glides; slow = a big surface arriving. */
export const DUR = { tap: 0.12, fast: 0.18, base: 0.28, slow: 0.45 } as const;
export const EASE = { out: "power3.out", in: "power2.in", inOut: "power3.inOut", pop: "back.out(1.6)", bounce: "back.out(2.4)" } as const;

/** The guidelines' named motions (DESIGN.md, "Shape, depth & motion"):
 *  draw-in - lines and charts draw left to right, 400 ms ease-out;
 *  pin & settle - cards drop in with a 6px rise and a 2 degree settle, 40 ms apart;
 *  board slide - moving into a job zooms its card into the full board, 320 ms;
 *  AURA breathe - the AURA orb's gradient pulses slowly while thinking, never spins;
 *  respect calm - less motion asked for: fades only (see below). */
export const MOTION = { drawIn: 0.4, boardSlide: 0.32, settleStagger: 0.04 } as const;

/** Pin & settle, ready for gsap.from(cards, PIN_IN). */
export const PIN_IN = { y: 6, rotation: 2, opacity: 0, duration: DUR.base, stagger: MOTION.settleStagger, ease: EASE.out } as const;

/** A CV / profile panel opening beside a list (owner, 19 Nov 2026: "a nice animation when the
 *  CV window appears"): it springs in from the right, a touch tilted and blurred, settling
 *  with an overshoot, then its header, note, CV and buttons rise in one after another.
 *  fromTo, not from: development runs effects twice. */
export function popPanel(el: HTMLElement) {
  gsap.fromTo(
    el,
    { opacity: 0, x: 120, scale: 0.84, rotate: 1.5, filter: "blur(6px)", transformOrigin: "100% 40%" },
    { opacity: 1, x: 0, scale: 1, rotate: 0, filter: "blur(0px)", duration: DUR.base * 1.8, ease: EASE.bounce, clearProps: "transform,opacity,filter,transformOrigin" },
  );
  gsap.fromTo(el.children, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: DUR.base, ease: EASE.out, stagger: 0.07, delay: 0.18, clearProps: "transform,opacity" });
}

/** THE switch: whenever what is shown in a place changes - a view, a tab, Midday
 *  to End of day, a list to a reading view, one CV to the next - the new content
 *  fades up 6px, once, in DUR.base. Never staggered, never rotated, never a
 *  "loading" sequence: one quiet move everywhere, so the whole app feels like one
 *  thing (owner, 13 Nov 2026: "consistently stick with one proper transition"). */
export function swapIn(target: gsap.TweenTarget) {
  gsap.fromTo(target, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: DUR.base, ease: EASE.out, overwrite: true, clearProps: "opacity,transform" });
}

/** swapIn on `ref` each time `key` changes - not on the first draw, because the
 *  view that holds it already switched in. */
export function useSwap(ref: RefObject<HTMLElement | null>, key: unknown) {
  const first = useRef(true);
  useGSAP(
    () => {
      if (first.current) {
        first.current = false;
        return;
      }
      if (ref.current) swapIn(ref.current);
    },
    { dependencies: [key], revertOnUpdate: false },
  );
}

/** Milliseconds a pointer must rest before a hover opens something (so a pointer
 *  passing by opens nothing), and the one grace before it closes again: menus,
 *  the top bar and the View tabs. */
export const HOVER_IN = 60;
export const HOVER_OUT = 160;

gsap.defaults({ ease: EASE.out, duration: DUR.base, overwrite: "auto" });

// Less motion when the system asks for it: every tween runs 25 times faster, so an
// entrance is a ~0.01 s fade and nothing travels across the screen.
// ponytail: one global time scale, not a per-tween fade; anything that must keep
// its real length (a notice's wait) uses setTimeout, which this does not touch.
if (typeof window !== "undefined") {
  gsap.matchMedia().add("(prefers-reduced-motion: reduce)", () => {
    gsap.globalTimeline.timeScale(25);
    return () => gsap.globalTimeline.timeScale(1);
  });
}

/** False when the system asks for less motion (for endless loops, which a faster
 *  clock would only make worse). */
export const motionOK = () =>
  typeof window === "undefined" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * One soft highlight that glides under whatever it is pointed at (the top bar's
 * links, a menu's rows, the View tabs' black pill). The first time, while it is
 * hidden, it appears in place; after that it glides. Width and height are
 * animated rather than scale, because scaling a rounded pill stretches its ends
 * into ovals; the highlight is absolutely placed, so its size moves nothing else.
 */
export function useGlide() {
  const { contextSafe } = useGSAP();
  const to = contextSafe((glow: HTMLElement | null | undefined, box: gsap.TweenVars) => {
    if (!glow) return;
    const hidden = Number(gsap.getProperty(glow, "opacity")) < 0.05;
    if (hidden) gsap.set(glow, box);
    gsap.to(glow, { ...box, opacity: 1, duration: hidden ? DUR.tap : DUR.base, ease: EASE.out, overwrite: true });
  });
  const out = contextSafe((glow: HTMLElement | null | undefined) => {
    if (glow) gsap.to(glow, { opacity: 0, duration: DUR.fast, ease: EASE.out, overwrite: true });
  });
  return { to, out };
}

/**
 * Lets a closing thing leave instead of vanishing: while `open` is true the caller
 * renders it; when it turns false this plays `vars` (the exit, e.g. a fade and a
 * small drop) on `ref` and keeps it rendered until a 250 ms timer - never the
 * tween's onComplete, so a held-back frame can never leave it stuck on screen.
 * Opened again before it is gone, it comes straight back.
 * `vars` must be a constant (defined outside the component).
 */
export function useExit(open: boolean, ref: RefObject<HTMLElement | null>, vars: gsap.TweenVars) {
  const [was, setWas] = useState(open);
  const [leaving, setLeaving] = useState(false);
  if (open !== was) {
    setWas(open);
    setLeaving(!open);
  }
  const exited = useRef(false);

  useEffect(() => {
    if (!leaving) return;
    if (ref.current) {
      exited.current = true;
      gsap.to(ref.current, { ...vars, duration: DUR.fast, ease: EASE.in, overwrite: true });
    }
    const t = setTimeout(() => {
      exited.current = false; // gone; the next opening is a fresh element
      setLeaving(false);
    }, 250);
    return () => clearTimeout(t);
  }, [leaving, ref, vars]);

  // Re-opened mid-exit: undo the exit's properties (an entrance that runs on
  // `open` takes over from this with its own).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el || !exited.current) return;
    exited.current = false;
    const back: gsap.TweenVars = {};
    for (const k of Object.keys(vars)) back[k] = k === "opacity" || k === "autoAlpha" || k.startsWith("scale") ? 1 : 0;
    gsap.to(el, { ...back, duration: DUR.fast, overwrite: true });
  }, [open, ref, vars]);

  return open || leaving;
}

/** The highlight behind a row of tabs glides to the chosen one instead of jumping
 *  (owner, 14 Nov 2026: motion that shows what changed). The row is `list`; inside
 *  it one `[data-tab-glide]` element is the highlight, and the chosen tab carries
 *  aria-selected="true". It lands with a small overshoot, and follows the row when
 *  the window changes size. */
export function useTabGlide(list: RefObject<HTMLElement | null>, key: unknown) {
  const placed = useRef(false);
  const place = (animate: boolean) => {
    const l = list.current;
    const glide = l?.querySelector<HTMLElement>("[data-tab-glide]");
    const on = l?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!glide || !on) return;
    const box = { x: on.offsetLeft, y: on.offsetTop, width: on.offsetWidth, height: on.offsetHeight, opacity: 1 };
    if (!animate || !placed.current) gsap.set(glide, box);
    else gsap.to(glide, { ...box, duration: DUR.slow, ease: "back.out(1.4)", overwrite: true });
    placed.current = true;
  };
  useGSAP(() => place(true), { dependencies: [key], revertOnUpdate: false });
  useEffect(() => {
    const again = () => place(false);
    addEventListener("resize", again);
    return () => removeEventListener("resize", again);
  });
}

/** Flip (the CV preview's frame growing to full view and back, 12 Nov 2026),
 *  fetched and registered the first time a preview opens, so it is not in the
 *  board's first download. */
export type FlipPlugin = typeof import("gsap/Flip").Flip;
let flip: Promise<FlipPlugin> | undefined;
export const loadFlip = () =>
  (flip ??= import("gsap/Flip").then(({ Flip }) => {
    gsap.registerPlugin(Flip);
    return Flip;
  }));

export { gsap, useGSAP };
