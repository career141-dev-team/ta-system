"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DUR, EASE, gsap, useGSAP } from "@/lib/gsap";
import Notch from "./openings/[id]/Notch";

// One board for the whole app (owner, 14 Nov 2026: "keep the Figma board behind,
// one common tab, and only the tab changes - one whole page"). The dotted canvas,
// the white board and its middle tab stay put from page to page; moving between
// pages only changes the tab's name and slides the content in from the side you
// moved towards, so the place feels like one thing and you can tell where you went.
// An opening (/openings/<id>) keeps its own layout; sign-in has none.

/** Board pages in the top bar's order (the slide direction follows it). */
const PAGES: [string, string][] = [
  ["/today", "Today"],
  ["/openings", "Openings"],
  ["/strategy", "Strategy Planner"],
  ["/database", "Database"],
  ["/ta-track", "TA Track"],
  ["/alerts", "Alerts"],
  ["/search", "Search"],
  ["/people", "People and roles"],
];
const at = (path: string) => PAGES.findIndex(([p]) => p === path);

/** The last page shown, kept outside React so a second effect run (development
 *  runs effects twice) does not read it as a move. */
let last: string | null = null;

export default function Board({ children }: { children: ReactNode }) {
  const path = usePathname();
  const i = at(path);
  const label = useRef<HTMLSpanElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLElement | null>(null);

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
      Object.assign(g.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "5", background: "white" });
      s.appendChild(g);
      ghost.current = g;
      if (bar.current) gsap.fromTo(bar.current, { scaleX: 0, opacity: 1 }, { scaleX: 0.85, duration: 2.4, ease: "power2.out", overwrite: true });
      // A link that never arrives (an error, a refused page) lets the page go.
      setTimeout(() => {
        if (ghost.current === g) {
          g.remove();
          ghost.current = null;
          if (bar.current) gsap.to(bar.current, { opacity: 0, duration: DUR.fast });
        }
      }, 8000);
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);

  useGSAP(
    () => {
      const from = last === null ? -1 : at(last);
      const moved = last !== null && last !== path;
      last = path;
      const g = ghost.current;
      ghost.current = null;
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
      if (label.current) tl.fromTo(label.current, { x: 28 * dir, opacity: 0 }, { x: 0, opacity: 1, duration: DUR.base, clearProps: "transform,opacity" }, 0.05);
      if (body.current) tl.fromTo(body.current, { x: 72 * dir, opacity: 0 }, { x: 0, opacity: 1, duration: DUR.slow, clearProps: "transform,opacity" }, 0.06);
      if (bar.current) tl.to(bar.current, { scaleX: 1, opacity: 0, duration: DUR.base, overwrite: true }, 0);
      if (stage.current) tl.set(stage.current, { clearProps: "overflow" });
      // Gone on a plain timer too: a copy left behind would cover the live page.
      if (g) setTimeout(() => g.remove(), 1600);
      // A held-back frame must never leave the page half-faded.
      const done = setTimeout(() => tl.progress(1), 1500);
      return () => clearTimeout(done);
    },
    { dependencies: [path] },
  );

  if (i < 0) return children;
  return (
    <main className="relative mx-11 mb-[max(2.125rem,14px)] mt-[clamp(40px,8.7dvh,94px)] flex min-h-0 flex-1 flex-col rounded-lg bg-white shadow-card max-md:mx-3 max-md:mt-12">
      <Notch label={PAGES[i][1]} wide labelRef={label} />
      {/* The line that runs while the next page loads. */}
      <div
        ref={bar}
        aria-hidden="true"
        style={{ opacity: 0 }}
        className="absolute left-1/2 top-0 z-20 h-0.5 w-[max(16rem,160px)] -translate-x-1/2 origin-left rounded-full bg-brand"
      />
      <div ref={stage} className="relative flex min-h-0 flex-1 flex-col rounded-lg">
        <div ref={body} data-board-body className="flex min-h-0 flex-1 flex-col">
          {children}
        </div>
      </div>
    </main>
  );
}
