"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DUR, EASE, gsap } from "@/lib/gsap";
import Notch from "./openings/[id]/Notch";
import LoadingBar from "./LoadingBar";
import { useAnyBusy } from "@/lib/busy";
import { counts, useRows } from "./strategy/data";

// One board for the whole app (owner, 14 Nov 2026: "keep the Figma board behind,
// one common tab, and only the tab changes - one whole page"). The dotted canvas,
// the white board and its middle tab stay put from page to page; moving between
// pages only changes the tab's name and slides the content in from the side you
// moved towards, so the place feels like one thing and you can tell where you went.
// An opening (/openings/<id>) keeps its own layout; sign-in has none.

/** Board pages in the top bar's order (the slide direction follows it). */
export const PAGES: [string, string][] = [
  ["/today", "Today"],
  ["/openings", "Openings"],
  ["/strategy", "Strategy Planner"],
  ["/strategy/submissions", "New submissions"],
  ["/strategy/manage", "Strategy list"],
  ["/database", "Database"],
  ["/linkedin-search", "LinkedIn Search"],
  ["/excel-tables", "Excel Tables"],
  ["/ta-track", "TA Track"],
  ["/feedback", "Feedback & support"],
  ["/bin", "Bin"],
  ["/alerts", "Alerts"],
  ["/people", "People and roles"],
];
const at = (path: string) => PAGES.findIndex(([p]) => p === path);

/** The last page shown, kept outside React so a second effect run (development
 *  runs effects twice) does not read it as a move. */
let last: string | null = null;

/** The overview (./Overview.tsx) zooms its own way into the page you pick: for that
 *  move, the board's slide and the arrival motion stand aside. */
export const turn = { quietUntil: 0 };

export default function Board({ children }: { children: ReactNode }) {
  const path = usePathname();
  const i = at(path);
  // The submissions page's tab carries how many are still to read.
  const unread = counts(useRows()).unread;
  const label = useRef<HTMLSpanElement>(null);
  const tab = useRef<HTMLDivElement>(null);
  const off = i < 0;
  const stage = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLElement | null>(null);

  // The tab hangs from the board's top edge. Scrolling down (the page or any scroll
  // container inside it) lifts it away so it never covers content; scrolling up, the
  // top, or the pointer near the top-centre brings it back.
  useEffect(() => {
    const el = tab.current;
    if (!el) return;
    let hidden = false;
    gsap.set(el, { clearProps: "transform,opacity,filter" }); // a new page always starts with the tab showing
    // The tab leaves and returns as one calm move (owner, 18 Nov 2026: "not smooth,
    // the premium is missing"): it slides up exactly its own height on a long ease while
    // the fade trails a beat behind, and comes back on a soft ease-out. It never
    // flickers: it hides only after a real scroll down, and returns only after a
    // real scroll up (or at the top), never on a nudge.
    const height = () => (el.firstElementChild as HTMLElement | null)?.offsetHeight ?? 58;
    const show = (on: boolean) => {
      if (on === !hidden) return;
      hidden = !on;
      el.style.willChange = "transform, opacity";
      el.style.pointerEvents = on ? "" : "none";
      const done = () => {
        el.style.willChange = "";
        // Gone means gone: a tab hidden above the board must not sit over the top bar.
        el.style.visibility = on ? "" : "hidden";
        if (on) gsap.set(el, { clearProps: "transform,opacity,filter" });
      };
      gsap.killTweensOf(el);
      el.style.visibility = "";
      if (on) {
        // Settles back in: a short drift down while the blur clears.
        gsap.to(el, { y: 0, opacity: 1, filter: "blur(0px)", duration: 0.6, ease: "power2.out", onComplete: done });
      } else {
        // Dissolves: a short drift up while it softens out of focus. No bounce, no squeeze.
        gsap.to(el, { y: -14, opacity: 0, filter: "blur(6px)", duration: 0.6, ease: "power2.inOut", onComplete: done });
      }
    };
    // Only a scroll area that reaches under the tab, with content scrolled, counts as
    // content "jumbling" with it; a list that starts below the tab never hides it.
    const under = (s: Element) => {
      const b = el.parentElement!.getBoundingClientRect();
      const r = s.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      return r.top < b.top + 160 && r.bottom > b.top && r.left < cx + 130 && r.right > cx - 130;
    };
    // Nothing on these pages scrolls under the tab, so it stays put (owner, 20 Nov 2026).
    const pinned = /^\/(openings\/?$|strategy|ta-track)/.test(path);
    const HIDE_AFTER = 56; // px scrolled down in one go before the tab leaves
    const SHOW_AFTER = 36; // px scrolled up in one go before it returns
    const last = new WeakMap<object, { top: number; run: number }>();
    const scroll = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Element) || !el.parentElement?.contains(t)) return;
      const top = t.scrollTop;
      const was = last.get(t) ?? { top: 0, run: 0 }; // a list starts at its top
      const d = top - was.top;
      // A run is travel in one direction; turning round starts a new one.
      const run = d === 0 ? was.run : Math.sign(d) === Math.sign(was.run) ? was.run + d : d;
      last.set(t, { top, run });
      if (top < 8) show(true);
      else if (run <= -SHOW_AFTER) show(true);
      else if (run >= HIDE_AFTER && !pinned && under(t)) show(false);
    };
    const move = (e: PointerEvent) => {
      if (e.clientY < 64 && Math.abs(e.clientX - innerWidth / 2) < 220) show(true);
    };
    document.addEventListener("scroll", scroll, { capture: true, passive: true });
    document.addEventListener("pointermove", move, { passive: true });
    return () => {
      gsap.killTweensOf(el);
      gsap.set(el, { clearProps: "transform,opacity,filter" }); // never leave the tab half-faded
      el.style.visibility = "";
      el.style.pointerEvents = "";
      document.removeEventListener("scroll", scroll, true);
      document.removeEventListener("pointermove", move);
    };
  }, [off, path]);

  // The tab's loading bar (./LoadingBar.tsx) runs while the next page loads and then
  // while any screen on it still waits on the backend (owner, 19 Nov 2026: "until the
  // page properly loads").
  // The page a link was pressed for: the bar runs until the address reaches it.
  const [target, setTarget] = useState<string | null>(null);
  const turning = target !== null && target !== path;
  const waiting = useAnyBusy();

  // Leaving: the moment a link to another board page is clicked, a picture of this
  // page (a copy of its content) is laid over it and a thin line runs under the
  // tab. The page stays readable while the next one loads - never a blank board -
  // and when the next one is ready the copy slides out as it slides in (owner, 14
  // Nov 2026: "the tab transition is not working... it takes time to load").
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href]");
      if (!a || a.target === "_blank") return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || at(url.pathname) < 0 || at(location.pathname) < 0 || url.pathname === location.pathname) return;
      const b = body.current;
      const s = stage.current;
      if (!b || !s) return;
      ghost.current?.remove();
      const g = b.cloneNode(true) as HTMLElement;
      g.removeAttribute("data-board-body");
      g.setAttribute("aria-hidden", "true");
      g.inert = true;
      Object.assign(g.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "5", background: "var(--color-surface)" });
      s.appendChild(g);
      ghost.current = g;
      setTarget(url.pathname);
      // A link that never arrives (an error, a refused page) lets the page go.
      setTimeout(() => {
        if (ghost.current === g) {
          g.remove();
          ghost.current = null;
          setTarget(null);
        }
      }, 8000);
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);

  // A plain effect and plain tweens, not useGSAP: a page still loading suspends
  // React, which reverts a useGSAP context with every tween in it - on the live site
  // the copy never slid and the new page never moved (14 Nov 2026).
  useEffect(
    () => {
      const from = last === null ? -1 : at(last);
      const moved = last !== null && last !== path;
      last = path;
      const g = ghost.current;
      ghost.current = null;
      // Arrived (or went elsewhere, by Back): the page turn is over.
      setTimeout(() => setTarget(null), 0);
      if (performance.now() < turn.quietUntil) {
        g?.remove();
        return;
      }
      // Not on the first load: the page is server HTML that React has not taken
      // over yet, and styling it then breaks hydration.
      if (!moved || i < 0 || from < 0) {
        g?.remove();
        return;
      }
      const dir = i > from ? 1 : -1;
      const tl = gsap.timeline({ defaults: { ease: EASE.out } });
      if (stage.current) tl.set(stage.current, { overflow: "hidden" }, 0);
      if (g) tl.to(g, { x: -72 * dir, opacity: 0, duration: DUR.slow, ease: EASE.inOut, onComplete: () => g.remove() }, 0);
      // Starting points placed at once, before the browser draws - never on the first
      // tick, or the new page shows, jumps aside and slides back.
      if (label.current) {
        gsap.set(label.current, { x: 28 * dir, opacity: 0 });
        tl.to(label.current, { x: 0, opacity: 1, duration: DUR.base, clearProps: "transform,opacity,filter" }, 0.05);
      }
      if (body.current) {
        gsap.set(body.current, { x: 72 * dir, opacity: 0 });
        tl.to(body.current, { x: 0, opacity: 1, duration: DUR.slow, clearProps: "transform,opacity,filter" }, 0.06);
      }
      if (stage.current) tl.set(stage.current, { clearProps: "overflow" });
      // Gone on a plain timer too: a copy left behind would cover the live page.
      if (g) setTimeout(() => g.remove(), 1600);
      // A held-back frame must never leave the page half-faded.
      const done = setTimeout(() => tl.progress(1), 1500);
      return () => clearTimeout(done);
    },
    [path, i],
  );

  if (i < 0) return children;
  return (
    <main className="enter-board relative mx-11 mb-[max(2.125rem,14px)] mt-[max(1rem,12px)] flex min-h-0 flex-1 flex-col rounded-lg bg-white shadow-card max-md:mx-3 max-md:mt-3">
      <div ref={tab} className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0 [&>h2]:pointer-events-auto">
        <Notch big label={path === "/strategy/submissions" && unread ? `${PAGES[i][1]} · ${unread}` : PAGES[i][1]} labelRef={label}>
          {/* The loading bar lives inside the tab, shown while the next page loads. */}
          <LoadingBar on={turning || waiting} className="inset-x-[22%] bottom-[max(0.55rem,6px)]" />
        </Notch>
      </div>
      <div ref={stage} className="relative flex min-h-0 flex-1 flex-col rounded-lg">
        {/* Room for the middle tab above every page (owner 18 Nov: text slid under the
            tab on every screen at a laptop size). The tab is 3.6rem tall; the pages'
            own top padding was drawn for a wide window and fell short on a smaller one. */}
        <div ref={body} data-board-body className="flex min-h-0 flex-1 flex-col pt-[max(2.4rem,14px)] max-md:pt-3">
          {children}
        </div>
      </div>
    </main>
  );
}
