"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { VIEW_TABS, ViewContext, useOpeningView, type View } from "./view";
import Notch from "./Notch";
import PipelineBoard from "./PipelineBoard";
import { BackButton } from "./PipelineBoard";

/** The opening screen and its work views, switched in place (no page change).
 *  The overview (title row + card) arrives from the server as `overview`; a work
 *  view replaces it full-window, with the top bar and title row out of the way. */
export default function OpeningView({ overview }: { overview: ReactNode }) {
  const [view, setView] = useState<View>("overview");
  const focus = view !== "overview";
  const { contextSafe } = useGSAP();

  // Leave the current view (a quick ease out), then switch. The switch runs on its
  // own timer, never on the tween finishing: when the browser holds back animation
  // frames (a busy or background tab) onComplete came seconds late and the click
  // looked dead (owner, 12 Nov 2026: "I can't see Pipeline").
  const go = contextSafe((next: View) => {
    if (next === view) return;
    const stage = document.querySelector("[data-view-stage]");
    gsap.to(stage, { opacity: 0, scale: 0.985, y: 6, duration: 0.14, ease: "power2.in", overwrite: "auto" });
    setTimeout(() => setView(next), 140);
  });

  // Arrive: the stage zooms in, then the board's columns follow one by one.
  useGSAP(
    () => {
      const stage = document.querySelector<HTMLElement>("[data-view-stage]");
      if (!stage) return;
      gsap.fromTo(
        stage,
        { opacity: 0, scale: 0.975, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.36, ease: "power3.out", transformOrigin: "50% 20%", overwrite: "auto" },
      );
      const cols = stage.querySelectorAll("[data-col]");
      if (cols.length) {
        gsap.from(cols, { opacity: 0, y: 18, duration: 0.42, stagger: 0.05, ease: "power3.out", delay: 0.06 });
      }
    },
    { dependencies: [view] },
  );

  const tab = VIEW_TABS.find(([v]) => v === view);

  return (
    <ViewContext.Provider value={{ view, go }}>
      <main
        data-view-stage
        className={
          "flex min-h-0 flex-1 flex-col " +
          (focus ? "mx-11.25 mb-14 mt-6" : "mx-26.25 mt-10.25 pb-8")
        }
      >
        {view === "overview" ? (
          overview
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col rounded-[1.5rem] bg-white">
            <Notch label={tab?.[1] ?? ""} />
            {view === "pipeline" ? <PipelineBoard /> : <ComingView label={tab?.[1] ?? ""} />}
          </div>
        )}
      </main>
      {focus && <FocusChrome />}
    </ViewContext.Provider>
  );
}

/** A view that is not built yet: says so, and offers the way back. */
function ComingView({ label }: { label: string }) {
  const { go } = useOpeningView();
  return (
    <div className="flex flex-1 flex-col px-[max(1.5rem,14px)] pt-[max(1.4rem,14px)]">
      <BackButton />
      <div className="m-auto flex flex-col items-center gap-[max(1rem,12px)]">
        <p className="text-tool text-muted">{label} is not built yet.</p>
        <button
          type="button"
          onClick={() => go("pipeline")}
          className="flex h-[max(2.3rem,30px)] items-center rounded-full bg-pill-line px-[max(1.2rem,14px)] text-tool font-medium text-white hover:bg-[#163d2e]"
        >
          Open Pipeline
        </button>
      </div>
    </div>
  );
}

/** Focus mode: hides the top bar (it slides down when the pointer reaches the top
 *  of the window) and puts an arrow at the bottom that opens the View tabs bar. */
function FocusChrome() {
  const [tabsOpen, setTabsOpen] = useState(false);
  // The View tabs bar rises when the pointer reaches the bottom edge or the arrow,
  // like the top bar does at the top (owner, 12 Nov 2026), and goes a moment after
  // the pointer leaves - the grace lets it travel from the arrow up to the bar.
  const tabsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const openTabs = () => {
    clearTimeout(tabsTimer.current);
    setTabsOpen(true);
  };
  const closeTabsSoon = () => {
    clearTimeout(tabsTimer.current);
    tabsTimer.current = setTimeout(() => setTabsOpen(false), 260);
  };
  useEffect(() => () => clearTimeout(tabsTimer.current), []);
  const strip = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const bar = document.getElementById("topnav");
    const zone = strip.current;
    if (!bar || !zone) return;
    // Set here, in the layout effect, so the bar is already out of the flow and
    // above the window before the first frame of the view is painted. Inline, so
    // it does not depend on a stylesheet the dev server may still be caching.
    gsap.set(bar, {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      boxShadow: "0 12px 40px rgb(0 0 0 / 0.08)",
      yPercent: -170,
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    // The bar slides down OVER the board, and the board behind it blurs, so it is
    // plain the bar is on top and the board has not moved (owner, 12 Nov 2026: "no
    // need drag kanban... blur the background and show the top bar as before").
    // Only the veil's opacity is animated; the blur itself never changes.
    const veil = document.querySelector<HTMLElement>("[data-topnav-veil]");
    const show = () => {
      clearTimeout(timer);
      gsap.to(bar, { yPercent: 0, duration: 0.38, ease: "power3.out", overwrite: true });
      if (veil) gsap.to(veil, { autoAlpha: 1, duration: 0.3, ease: "power2.out", overwrite: true });
    };
    const hide = () => {
      gsap.to(bar, { yPercent: -170, duration: 0.3, ease: "power2.in", overwrite: true });
      if (veil) gsap.to(veil, { autoAlpha: 0, duration: 0.25, ease: "power2.in", overwrite: true });
    };
    const hideSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(hide, 260);
    };
    const leftBar = (e: FocusEvent) => {
      if (!bar.contains(e.relatedTarget as Node)) hideSoon();
    };

    zone.addEventListener("mouseenter", show);
    zone.addEventListener("mouseleave", hideSoon);
    bar.addEventListener("mouseenter", show);
    bar.addEventListener("mouseleave", hideSoon);
    bar.addEventListener("focusin", show);
    bar.addEventListener("focusout", leftBar);
    return () => {
      clearTimeout(timer);
      zone.removeEventListener("mouseenter", show);
      zone.removeEventListener("mouseleave", hideSoon);
      bar.removeEventListener("mouseenter", show);
      bar.removeEventListener("mouseleave", hideSoon);
      bar.removeEventListener("focusin", show);
      bar.removeEventListener("focusout", leftBar);
      gsap.killTweensOf(bar);
      gsap.set(bar, { clearProps: "position,top,left,right,zIndex,boxShadow,transform" });
      if (veil) gsap.killTweensOf(veil);
    };
  });

  return (
    <>
      {/* The soft blur over the board while the top bar is down (z under the bar's 50). */}
      <div
        data-topnav-veil
        aria-hidden="true"
        style={{ opacity: 0, visibility: "hidden" }}
        className="pointer-events-none fixed inset-0 z-[45] bg-white/30 backdrop-blur-[6px]"
      />
      {/* The hover zone along the top edge that brings the top bar down. */}
      <div ref={strip} aria-hidden="true" className="fixed inset-x-0 top-0 z-40 h-5" />

      {/* The hover zone along the bottom edge that brings the View tabs up. */}
      <div
        aria-hidden="true"
        onMouseEnter={openTabs}
        onMouseLeave={closeTabsSoon}
        className="fixed inset-x-0 bottom-0 z-30 h-5"
      />

      {tabsOpen && <ViewTabs onEnter={openTabs} onLeave={closeTabsSoon} />}

      <div
        onMouseEnter={openTabs}
        onMouseLeave={closeTabsSoon}
        className="fixed bottom-[max(0.75rem,8px)] left-1/2 z-40 -translate-x-1/2"
      >
        <button
          type="button"
          aria-expanded={tabsOpen}
          aria-label={tabsOpen ? "Hide the views" : "Show the views"}
          onClick={() => setTabsOpen((o) => !o)}
          className="flex h-[max(1.9rem,24px)] w-[max(3.4rem,44px)] items-center justify-center rounded-full bg-white text-ink shadow-[0_6px_24px_rgba(0,0,0,0.12)] transition-colors hover:bg-soft"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={"size-[max(1rem,14px)] transition-transform duration-300 " + (tabsOpen ? "rotate-180" : "")}
            aria-hidden="true"
          >
            <path d="m6 15 6-6 6 6" />
          </svg>
        </button>
      </div>
    </>
  );
}

/** The View tabs bar: white pill, the current view in black. The black pill glides
 *  to whichever tab is picked. */
function ViewTabs({ onEnter, onLeave }: { onEnter: () => void; onLeave: () => void }) {
  const { view, go } = useOpeningView();
  const root = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // The bar rises in once when it opens.
  useGSAP(
    () => {
      gsap.from(root.current, { opacity: 0, y: 16, scale: 0.97, duration: 0.3, ease: "power3.out" });
    },
    { scope: root },
  );

  // The black pill follows the current view: placed on the first run, glides after.
  useGSAP(
    () => {
      const pill = root.current?.querySelector<HTMLElement>("[data-glow]");
      const on = root.current?.querySelector<HTMLElement>("[aria-current=page]");
      if (!pill || !on) return;
      const to = { x: on.offsetLeft, y: on.offsetTop, width: on.offsetWidth, height: on.offsetHeight };
      if (first.current) {
        gsap.set(pill, to);
        first.current = false;
      } else {
        gsap.to(pill, { ...to, duration: 0.38, ease: "power3.out", overwrite: true });
      }
    },
    { dependencies: [view], scope: root },
  );

  return (
    // pb bridges the gap down to the arrow, so moving between them keeps it open.
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="fixed bottom-[max(2.6rem,32px)] left-1/2 z-40 -translate-x-1/2 pb-[max(0.8rem,8px)]"
    >
      <nav
        ref={root}
        aria-label="Views of this opening"
        className="relative flex items-center gap-[max(0.3rem,2px)] whitespace-nowrap rounded-full bg-white p-[max(0.5rem,5px)] shadow-[0_10px_40px_rgba(0,0,0,0.14)]"
      >
        <span data-glow aria-hidden="true" className="absolute left-0 top-0 rounded-full bg-black" />
        {VIEW_TABS.map(([value, label]) => {
          const on = value === view;
          return (
            <button
              key={value}
              type="button"
              aria-current={on ? "page" : undefined}
              onClick={() => go(value)}
              className={
                "relative rounded-full px-[max(1rem,11px)] py-[max(0.45rem,5px)] text-[max(0.9rem,12px)] transition-colors duration-300 " +
                (on ? "text-white" : "text-black/60 hover:text-black")
              }
            >
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
