"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { DUR, EASE, HOVER_IN, HOVER_OUT, gsap, loadFlip, useExit, useGSAP, useGlide } from "@/lib/gsap";
import { VIEW_TABS, ViewContext, useOpeningView, type View } from "./view";
import Notch from "./Notch";
import PipelineBoard from "./PipelineBoard";
import { BackButton } from "./PipelineBoard";
import { warmPdf } from "./CvPages";

// Pipeline is in the first download; Scoops (and the CV preview, and Flip) come in
// their own pieces, fetched while the screen sits idle, so they are ready by the
// time they are opened.
const ScoopsView = dynamic(() => import("./ScoopsView"));

/** The opening screen and its work views, switched in place (no page change).
 *  The overview (title row + card) arrives from the server as `overview`; a work
 *  view replaces it full-window, with the top bar and title row out of the way. */
export default function OpeningView({ overview }: { overview: ReactNode }) {
  const [view, setView] = useState<View>("overview");
  const focus = view !== "overview";

  // Switch at once, on the click: no leave animation to wait for. The arrival below
  // plays over the new view instead. A waited switch looked dead whenever the
  // browser held back frames (owner, 12 Nov 2026: "I can't see Pipeline"), and even
  // a fixed 140 ms made every click feel slow. The ref stops a double click from
  // switching twice.
  const current = useRef<View>("overview");
  const go = useCallback((next: View) => {
    if (next === current.current) return;
    current.current = next;
    setView(next);
  }, []);
  // One value per view, so the rows and back buttons that only need `go` do not
  // re-render on every render of this screen.
  const ctx = useMemo(() => ({ view, go }), [view, go]);

  // Once the screen is idle, fetch the pieces that are not in the first download.
  useEffect(() => {
    const idle = window.requestIdleCallback?.bind(window) ?? ((f: () => void) => setTimeout(f, 1200));
    idle(() => {
      void import("./ScoopsView");
      void import("./CvPreview");
      void loadFlip();
    });
  }, []);

  // Arrive, like one camera move: the stage zooms in, the toolbar rows drop into
  // place, the columns rise one after another, and the cards inside each column
  // pour in from below. The board is there and usable at once; the motion only
  // plays over it (owner, 12 Nov 2026: "the loading needs to be quick, but the
  // animation needs to show"). Transform and opacity only, about 0.8 s in all; the
  // stage starts at 0.97, not smaller, so its text stays sharp while it grows.
  // The full sequence is for Pipeline; any other view just fades up into place.
  useGSAP(
    () => {
      const stage = document.querySelector<HTMLElement>("[data-view-stage]");
      if (!stage) return;
      if (view !== "pipeline") {
        gsap.fromTo(stage, { opacity: 0, y: 10 }, { opacity: 1, y: 0, scale: 1, duration: DUR.base });
        return;
      }
      const tl = gsap.timeline();
      // expo, not the usual curve: this one is the "zoom" the owner picked.
      tl.fromTo(
        stage,
        { opacity: 0, scale: 0.97, y: 16 },
        { opacity: 1, scale: 1, y: 0, duration: DUR.slow, ease: "expo.out", transformOrigin: "50% 30%" },
      );
      const bars = stage.querySelectorAll("[data-intro]");
      if (bars.length) tl.from(bars, { opacity: 0, y: -14, duration: DUR.base, stagger: 0.06 }, 0.06);
      const cols = Array.from(stage.querySelectorAll<HTMLElement>("[data-col]"));
      if (cols.length) {
        tl.from(cols, { opacity: 0, y: 36, scale: 0.97, duration: DUR.slow, stagger: 0.04, transformOrigin: "50% 0%" }, 0.1);
        // Only the cards in view pour in; the rest are off screen anyway. Only `y`
        // moves, because the column's wheel sets each card's scale and fade itself.
        cols.forEach((col, i) => {
          const cards = Array.from(col.querySelectorAll<HTMLElement>("[data-card-id]")).slice(0, 5);
          if (cards.length) tl.from(cards, { y: 28, duration: DUR.base, stagger: 0.04 }, 0.16 + i * 0.04);
        });
      }
    },
    { dependencies: [view] },
  );

  const tab = VIEW_TABS.find(([v]) => v === view);

  return (
    <ViewContext.Provider value={ctx}>
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
            {view === "pipeline" ? (
              <PipelineBoard />
            ) : view === "scoops" ? (
              <ScoopsView />
            ) : (
              <ComingView label={tab?.[1] ?? ""} />
            )}
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

const TABS_OUT = { opacity: 0, y: 16, scale: 0.97 };

/** Focus mode: hides the top bar (it slides down when the pointer reaches the top
 *  of the window) and puts an arrow at the bottom that opens the View tabs bar. */
function FocusChrome() {
  const [tabsOpen, setTabsOpen] = useState(false);
  // The View tabs bar rises when the pointer rests on the bottom edge or the arrow,
  // like the top bar does at the top (owner, 12 Nov 2026), and goes a moment after
  // the pointer leaves - the grace lets it travel from the arrow up to the bar. It
  // opens only after HOVER_IN of rest, so a pointer passing by does not raise it.
  const tabsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const openTabs = () => {
    clearTimeout(tabsTimer.current);
    tabsTimer.current = setTimeout(() => setTabsOpen(true), HOVER_IN);
  };
  const closeTabsSoon = () => {
    clearTimeout(tabsTimer.current);
    tabsTimer.current = setTimeout(() => setTabsOpen(false), HOVER_OUT);
  };
  useEffect(() => () => clearTimeout(tabsTimer.current), []);
  const strip = useRef<HTMLDivElement>(null);
  // Closing, the bar sinks and fades the way it rose instead of vanishing.
  const tabsNav = useRef<HTMLElement>(null);
  const tabsShown = useExit(tabsOpen, tabsNav, TABS_OUT);

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
    let intent: ReturnType<typeof setTimeout> | undefined;
    // The bar slides down OVER the board, and the board behind it blurs, so it is
    // plain the bar is on top and the board has not moved (owner, 12 Nov 2026: "no
    // need drag kanban... blur the background and show the top bar as before").
    // Only the veil's opacity is animated; the blur itself never changes.
    const veil = document.querySelector<HTMLElement>("[data-topnav-veil]");
    const show = () => {
      clearTimeout(timer);
      gsap.to(bar, { yPercent: 0, duration: DUR.base, overwrite: true });
      if (veil) gsap.to(veil, { autoAlpha: 1, duration: DUR.fast, overwrite: true });
    };
    const hide = () => {
      gsap.to(bar, { yPercent: -170, duration: DUR.fast, ease: EASE.in, overwrite: true });
      if (veil) gsap.to(veil, { autoAlpha: 0, duration: DUR.fast, ease: EASE.in, overwrite: true });
    };
    const hideSoon = () => {
      clearTimeout(timer);
      clearTimeout(intent);
      timer = setTimeout(hide, HOVER_OUT);
    };
    // The top edge strip only brings the bar down after a short rest on it.
    const showSoon = () => {
      clearTimeout(timer);
      clearTimeout(intent);
      intent = setTimeout(show, HOVER_IN);
    };
    const leftBar = (e: FocusEvent) => {
      if (!bar.contains(e.relatedTarget as Node)) hideSoon();
    };

    zone.addEventListener("mouseenter", showSoon);
    zone.addEventListener("mouseleave", hideSoon);
    bar.addEventListener("mouseenter", show);
    bar.addEventListener("mouseleave", hideSoon);
    bar.addEventListener("focusin", show);
    bar.addEventListener("focusout", leftBar);
    return () => {
      clearTimeout(timer);
      clearTimeout(intent);
      zone.removeEventListener("mouseenter", showSoon);
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

      {tabsShown && <ViewTabs ref={tabsNav} onEnter={openTabs} onLeave={closeTabsSoon} />}

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
            className={"size-[max(1rem,14px)] transition-transform " + (tabsOpen ? "rotate-180" : "")}
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
function ViewTabs({
  ref: root,
  onEnter,
  onLeave,
}: {
  ref: RefObject<HTMLElement | null>;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { view, go } = useOpeningView();

  // The bar rises in once when it opens.
  useGSAP(
    () => {
      gsap.from(root.current, { opacity: 0, y: 16, scale: 0.97, duration: DUR.base });
    },
    { scope: root },
  );

  // The black pill follows the current view: placed on the first run (it starts
  // hidden, so it appears in place), glides after. It runs in the commit of the
  // click itself, because a view switch changes state at once (no wait).
  const glide = useGlide();
  useGSAP(
    () => {
      const on = root.current?.querySelector<HTMLElement>("[aria-current=page]");
      if (!on) return;
      glide.to(root.current?.querySelector<HTMLElement>("[data-glow]"), {
        x: on.offsetLeft,
        y: on.offsetTop,
        width: on.offsetWidth,
        height: on.offsetHeight,
      });
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
        <span data-glow aria-hidden="true" style={{ opacity: 0 }} className="absolute left-0 top-0 rounded-full bg-black" />
        {VIEW_TABS.map(([value, label]) => {
          const on = value === view;
          return (
            <button
              key={value}
              type="button"
              aria-current={on ? "page" : undefined}
              // Scoops opens on a CV: get pdf.js ready while the pointer is on its way.
              onPointerEnter={value === "scoops" ? () => warmPdf() : undefined}
              onClick={() => go(value)}
              className={
                "relative rounded-full px-[max(1rem,11px)] py-[max(0.45rem,5px)] text-[max(0.9rem,12px)] transition-colors " +
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
