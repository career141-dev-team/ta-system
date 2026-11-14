"use client";

import DatabaseCvsView from "./DatabaseCvsView";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { DUR, EASE, HOVER_IN, HOVER_OUT, gsap, loadFlip, swapIn, useExit, useGSAP, useGlide } from "@/lib/gsap";
import { HH_VIEWS, SHOW_TABS, VIEW_TABS, ViewContext, setOf, useOpeningView, viewLabel, type View, type ViewSet } from "./view";
import Notch from "./Notch";
import PipelineBoard from "./PipelineBoard";
import { BackButton } from "./PipelineBoard";
import { warmPdf } from "./CvPages";
import { CAN_SOURCE } from "@/lib/user";

/** How far (px) the pointer may stray from a held bar before it sinks. */
const AWAY = 64;

/** How long the bottom bar stays up on its own after a view opens or an arrow key. */
const PEEK_MS = 1600;

// Pipeline is in the first download; Scoops (and the CV preview, and Flip) come in
// their own pieces, fetched while the screen sits idle, so they are ready by the
// time they are opened.
const ScoopsView = dynamic(() => import("./ScoopsView"));
const JobDescriptionView = dynamic(() => import("./JobDescriptionView"));
const DailyEmailView = dynamic(() => import("./DailyEmailView"));
const LinkedInJobView = dynamic(() => import("./LinkedInJobView"));
const HhOverview = dynamic(() => import("./HhOverview"));
const ResearchView = dynamic(() => import("./ResearchView"));
const SuggestionsView = dynamic(() => import("./SuggestionsView"));
const ExcelTablesView = dynamic(() => import("./ExcelTablesView"));
const RefereeCallsView = dynamic(() => import("./RefereeCallsView"));
const StrategiesView = dynamic(() => import("./StrategiesView"));

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

  // Every view opened on this visit stays alive, hidden, when another is on screen
  // (owner, 12 Nov 2026: "lightning quick"; this UI will read a lot of backend
  // data). So coming back to a view is instant: nothing is drawn or fetched again,
  // the scroll, the chosen candidate and the filters are where they were left. With
  // the backend, each view reads its own small query once, when first opened, and
  // keeps it for as long as this opening is open.
  const [opened, setOpened] = useState<View[]>(["overview"]);

  const go = useCallback((next: View) => {
    if (next === current.current) return;
    if (!CAN_SOURCE && setOf(next) === "hh") return;
    current.current = next;
    setView(next);
    setOpened((o) => (o.includes(next) ? o : [...o, next]));
  }, []);
  // One value per view, so the rows and back buttons that only need `go` do not
  // re-render on every render of this screen.
  const ctx = useMemo(() => ({ view, go }), [view, go]);

  // Once the screen is idle, fetch the pieces that are not in the first download.
  useEffect(() => {
    const idle = window.requestIdleCallback?.bind(window) ?? ((f: () => void) => setTimeout(f, 1200));
    idle(() => {
      void import("./ScoopsView");
      void import("./JobDescriptionView");
      void import("./LinkedInJobView");
      void import("./StrategiesView");
      void import("./CvPreview");
      void loadFlip();
    });
  }, []);

  // Every view arrives the same way - the app's one switch (swapIn in lib/gsap):
  // the new view fades up 6px, once. The Pipeline used to have its own camera-move
  // entrance; the owner asked for one transition everywhere (13 Nov 2026: "you made
  // different for the different things").
  useGSAP(
    () => {
      const stage = document.querySelector<HTMLElement>("[data-view-stage]");
      if (!stage) return;
      const panel = view === "overview" ? stage : stage.querySelector<HTMLElement>(`[data-panel="${view}"]`);
      if (panel) swapIn(panel);
    },
    { dependencies: [view] },
  );

  return (
    <ViewContext.Provider value={ctx}>
      <main
        data-view-stage
        className={
          "flex min-h-0 flex-1 flex-col " +
          // A phone gets narrow side margins, and the opening's stacked card scrolls
          // inside the page (13 Nov 2026: "responsive for mobile and all devices").
          (focus
            ? "mx-11.25 mb-14 mt-6 max-md:mx-3 max-md:mt-3"
            : "mx-26.25 mt-10.25 pb-8 max-md:mx-4 max-md:mt-5 max-md:overflow-y-auto")
        }
      >
        {/* Shown views take their place; the rest stay mounted but hidden. */}
        <div className={view === "overview" ? "contents" : "hidden"}>{overview}</div>
        {opened.map((v) =>
          v === "overview" ? null : (
            <div
              key={v}
              data-panel={v}
              className={v === view ? "relative flex min-h-0 flex-1 flex-col rounded-lg bg-white" : "hidden"}
            >
              {/* The email view names its own notch: Midday or End of day email. */}
              {v !== "midday" && <Notch label={viewLabel(v)} />}
              {v === "pipeline" ? (
                <PipelineBoard />
              ) : v === "scoops" ? (
                <ScoopsView />
              ) : v === "jd" ? (
                <JobDescriptionView />
              ) : v === "midday" ? (
                <DailyEmailView />
              ) : v === "database" ? (
                <DatabaseCvsView />
              ) : v === "strategies" ? (
                <StrategiesView />
              ) : v === "linkedin-job" ? (
                <LinkedInJobView />
              ) : v === "hh-overview" ? (
                <HhOverview />
              ) : v === "hh-research" ? (
                <ResearchView />
              ) : v === "hh-suggestions" ? (
                <SuggestionsView />
              ) : v === "hh-tables" ? (
                <ExcelTablesView />
              ) : v === "hh-referees" ? (
                <RefereeCallsView />
              ) : (
                <ComingView label={viewLabel(v)} />
              )}
            </div>
          ),
        )}
      </main>
      {focus && <FocusChrome />}
      <TabsBar />
    </ViewContext.Provider>
  );
}

/** A view that is not built yet: says so, and offers the way back. */
function ComingView({ label }: { label: string }) {
  const { go } = useOpeningView();
  return (
    <div className="flex flex-1 flex-col px-[max(1.5rem,14px)] pt-[max(1.4rem,14px)] max-md:pt-11">
      <BackButton />
      <div className="m-auto flex flex-col items-center gap-[max(1rem,12px)]">
        <p className="text-tool text-ink-2">{label} is not built yet.</p>
        <button
          type="button"
          onClick={() => go("pipeline")}
          className="flex h-[max(2.3rem,30px)] items-center rounded-full bg-brand px-[max(1.2rem,14px)] text-tool font-medium text-white hover:bg-brand-strong"
        >
          Open Pipeline
        </button>
      </div>
    </div>
  );
}

const TABS_OUT = { opacity: 0, y: 16, scale: 0.97 };

/** The bottom bar and everything that raises it. It lives with the opening, not
 *  with one view, so it stays up when the cursor carries the person to Overview -
 *  they can keep moving along the tabs (owner, 12 Nov 2026). The bottom hover edge
 *  and the arrow are only there inside a view; on Overview the bar stays while the
 *  cursor is on it and sinks when it leaves. */
function TabsBar() {
  const { view, go } = useOpeningView();
  const focus = view !== "overview";
  const [tabsOpen, setTabsOpen] = useState(false);
  const tabsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The cursor is on the bar: nothing closes it under the cursor (a peek's timer,
  // a view that opened from a tab and peeks).
  const inside = useRef(false);
  // The bar rises when the pointer rests on the bottom edge or the arrow, like the
  // top bar does at the top, and goes a moment after the pointer leaves - the grace
  // lets it travel from the arrow up to the bar. It opens only after HOVER_IN of
  // rest, so a pointer passing by does not raise it.
  const openTabs = () => {
    clearTimeout(tabsTimer.current);
    tabsTimer.current = setTimeout(() => setTabsOpen(true), HOVER_IN);
  };
  const closeTabsSoon = () => {
    clearTimeout(tabsTimer.current);
    tabsTimer.current = setTimeout(() => setTabsOpen(false), HOVER_OUT);
  };
  // A set switch resizes the bar around its centre, which can leave the pointer
  // just outside it; the bar then stays up until the pointer comes back and
  // leaves again, Escape, or a choice - as after Back.
  const held = useRef(false);
  const tabsNav = useRef<HTMLElement>(null);
  const enterBar = () => {
    held.current = false;
    inside.current = true;
    clearTimeout(tabsTimer.current);
    setTabsOpen(true);
  };
  const leaveBar = () => {
    inside.current = false;
    if (!held.current) {
      closeTabsSoon();
      return;
    }
    // Held after a set switch: it goes once the pointer is clearly away from the
    // bar (more than AWAY px) or presses somewhere else - never left up for good.
    const away = (e: PointerEvent) => {
      const nav = tabsNav.current;
      if (!held.current || !nav) return stop();
      const b = nav.getBoundingClientRect();
      const dx = Math.max(b.left - e.clientX, 0, e.clientX - b.right);
      const dy = Math.max(b.top - e.clientY, 0, e.clientY - b.bottom);
      if (e.type === "pointerdown" ? !nav.contains(e.target as Node) : Math.hypot(dx, dy) > AWAY) {
        stop();
        held.current = false;
        if (!inside.current) setTabsOpen(false);
      }
    };
    const stop = () => {
      window.removeEventListener("pointermove", away);
      window.removeEventListener("pointerdown", away);
    };
    window.addEventListener("pointermove", away);
    window.addEventListener("pointerdown", away);
  };
  // The bar rises on its own for a moment, then sinks unless the cursor is on it.
  // Run when a work view opens from the overview (so a person learns the bar is
  // there, not only the back button) and on each arrow key.
  const peek = useCallback((delay = 0) => {
    clearTimeout(tabsTimer.current);
    tabsTimer.current = setTimeout(() => {
      setTabsOpen(true);
      tabsTimer.current = setTimeout(() => {
        if (!inside.current) setTabsOpen(false);
      }, PEEK_MS);
    }, delay);
  }, []);
  useEffect(() => {
    if (focus && !inside.current) peek(500);
  }, [focus, peek]);
  useEffect(() => () => clearTimeout(tabsTimer.current), []);

  // Back raises the bar and keeps it up (no timer): the person chooses where to go,
  // the Overview tab or another view (owner, 12 Nov 2026). It goes when the pointer
  // leaves it, on Escape, or with the choice.
  useEffect(() => {
    const show = () => {
      clearTimeout(tabsTimer.current);
      setTabsOpen(true);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setTabsOpen(false);
    window.addEventListener(SHOW_TABS, show);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener(SHOW_TABS, show);
      window.removeEventListener("keydown", esc);
    };
  }, []);

  // Left and right arrow keys move along the tabs of the view's own set, like a
  // click on the next one: inside a view, or on the opening while the bar is up. Not while
  // typing, not with a modifier, and not while a CV or a notice is open over the
  // board (owner, 12 Nov 2026).
  useEffect(() => {
    if (!focus && !tabsOpen) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      // A screen that uses the arrows itself (the Referee Calls grid) has them.
      if (e.defaultPrevented) return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable=true]")) return;
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
      // The bar's own order: Job first, then the set's views.
      const tabs: View[] = ["overview", ...tabsOf(view === "overview" ? lastSet() : setOf(view))];
      const at = tabs.indexOf(view);
      const next = at < 0 ? (e.key === "ArrowRight" ? tabs[0] : undefined) : tabs[at + (e.key === "ArrowRight" ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      go(next);
      peek();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [focus, tabsOpen, view, go, peek]);

  // Closing, the bar sinks and fades the way it rose instead of vanishing.
  const tabsShown = useExit(tabsOpen, tabsNav, TABS_OUT);

  return (
    <>
      {tabsShown && <ViewTabs ref={tabsNav} onEnter={enterBar} onLeave={leaveBar} onHold={() => (held.current = true)} />}
      {focus && (
        <>
          {/* The hover zone along the bottom edge that brings the View tabs up. */}
          <div
            aria-hidden="true"
            onMouseEnter={openTabs}
            onMouseLeave={closeTabsSoon}
            className="fixed inset-x-0 bottom-0 z-30 h-5"
          />
          <div
            onMouseEnter={openTabs}
            onMouseLeave={closeTabsSoon}
            className="fixed bottom-[max(0.75rem,8px)] left-1/2 z-40 -translate-x-1/2"
          >
            <button
              type="button"
              aria-expanded={tabsOpen}
              aria-label={tabsOpen ? "Hide the views" : "Show the views"}
              onClick={() => {
                // The press decides: a touch also sends a late "pointer arrived".
                clearTimeout(tabsTimer.current);
                setTabsOpen((o) => !o);
              }}
              className="flex h-[max(1.9rem,24px)] w-[max(3.4rem,44px)] items-center justify-center rounded-full bg-white text-ink shadow-float transition-colors hover:bg-surface-2"
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
      )}
    </>
  );
}

/** Focus mode: hides the top bar; it slides down over a blurred board when the
 *  pointer reaches the top of the window. */
function FocusChrome() {
  const strip = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const bar = document.getElementById("topnav");
    const zone = strip.current;
    if (!bar || !zone) return;
    // A phone or tablet has no pointer to bring a hidden bar back, so there the
    // top bar simply stays in place (13 Nov 2026).
    if (!window.matchMedia("(hover: hover) and (min-width: 768px)").matches) return;
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
    </>
  );
}

// The tab the black pill last stood on, kept between openings of the bar, so a
// bar that rises because an arrow key moved the view shows the pill flowing from
// the old tab to the new one instead of simply sitting there.
let pillAt: string | undefined;

/** The black pill flows to `to` like a drop of water: its leading edge runs ahead
 *  and it thins as it stretches, then the trailing edge catches up and it wobbles
 *  into shape (owner, 12 Nov 2026: "like a water effect"). Transform and width only;
 *  the pill is an absolutely placed span, so nothing else is laid out again. */
function flow(pill: HTMLElement, to: HTMLElement) {
  const x0 = Number(gsap.getProperty(pill, "x"));
  const w0 = Number(gsap.getProperty(pill, "width"));
  const x1 = to.offsetLeft;
  const w1 = to.offsetWidth;
  if (Math.abs(x1 - x0) < 1 && Math.abs(w1 - w0) < 1) return;
  gsap.killTweensOf(pill);
  const reach = x1 > x0 ? { width: x1 + w1 - x0 } : { x: x1, width: x0 + w0 - x1 };
  gsap
    .timeline()
    .to(pill, { ...reach, scaleY: 0.82, duration: 0.2, ease: "power2.in" })
    .to(pill, { x: x1, width: w1, duration: 0.65, ease: "elastic.out(1, 0.55)" })
    .to(pill, { scaleY: 1, duration: 0.75, ease: "elastic.out(1, 0.35)" }, "<");
}

// Placeholder counts on the tabs, as drawn in the design (what waits in each view).
// With the backend each is one small number from that view's own read.
const COUNTS: Partial<Record<View, string>> = {
  scoops: "4",
  "linkedin-job": "14",
  database: "38",
  strategies: "1",
  "hh-suggestions": "6",
  "hh-tables": "L1–L3",
};

// The opening itself is not in either set: it holds both, so it has its own Job
// button at the bar's left (owner, 13 Nov 2026 - an "Overview" in ATS beside the
// Headhunting Overview read as the same thing twice).
const tabsOf = (set: ViewSet): View[] => (set === "hh" ? HH_VIEWS : VIEW_TABS).map(([k]) => k);

// The set last looked at, so the bar opened from the opening itself shows it again.
const SET_KEY = "ta-ui:view-set";
function lastSet(): ViewSet {
  try {
    return CAN_SOURCE && localStorage.getItem(SET_KEY) === "hh" ? "hh" : "ats";
  } catch {
    return "ats";
  }
}
function keepSet(set: ViewSet) {
  try {
    localStorage.setItem(SET_KEY, set);
  } catch {
    // Blocked storage: the bar still works; it just starts on ATS next time.
  }
}

/** The View tabs bar (owner's design, Figma 713-2421): the ATS | Headhunting switch,
 *  then every view of that set, the current one in black. The bar opens on the set
 *  of the view on screen; pointing at the other half of the switch shows the other
 *  set at once. The black pill flows like water to whichever tab is picked. */
function ViewTabs({
  ref: root,
  onEnter,
  onLeave,
  onHold,
}: {
  ref: RefObject<HTMLElement | null>;
  onEnter: () => void;
  onLeave: () => void;
  onHold: () => void;
}) {
  const { view, go } = useOpeningView();
  // Fresh each time the bar rises: the set of the view on screen (or, on the
  // opening, the one last looked at) until the switch is pointed at.
  const [set, setSet] = useState<ViewSet>(() => (view === "overview" ? lastSet() : setOf(view)));
  const pickSet = (next: ViewSet) => {
    if (next === set) return;
    // The bar fits each set and stays centred (owner, 13 Nov 2026: the shorter
    // Headhunting set sat off to one side in the ATS width). It glides from its old
    // width to the new one, and is held open in case it shrank from under the pointer.
    fromWidth.current = root.current?.offsetWidth ?? 0;
    onHold();
    setSet(next);
    keepSet(next);
  };

  // Pointing shows, clicking acts (owner, 13 Nov 2026, replacing hover-to-switch):
  // a soft highlight glides under the tab the pointer is on, and a click changes
  // the view at once. Opened views stay alive (OpeningView), so the click is
  // instant; and a pointer crossing the bar no longer flashes every page past or
  // starts loading pages nobody asked for.
  const glide = useGlide();
  const hoverGlow = () => root.current?.querySelector<HTMLElement>("[data-hover-glow]");
  const point = (el: HTMLElement, value: View) => {
    if (value === "scoops") warmPdf(); // Scoops opens on a CV: get pdf.js ready while pointing.
    glide.to(hoverGlow(), { x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
  };
  const aim = (value: View) => {
    if (value !== "overview") keepSet(setOf(value));
    go(value);
  };

  const fromWidth = useRef(0);
  useGSAP(
    () => {
      const nav = root.current;
      const from = fromWidth.current;
      fromWidth.current = 0;
      if (!nav || !from) return;
      const to = nav.offsetWidth;
      if (to !== from) gsap.fromTo(nav, { width: from }, { width: to, duration: DUR.base, ease: EASE.out, clearProps: "width" });
    },
    { dependencies: [set], scope: root },
  );

  // The bar rises in once when it opens.
  useGSAP(
    () => {
      gsap.from(root.current, { opacity: 0, y: 16, scale: 0.97, duration: DUR.base });
    },
    { scope: root },
  );

  // The black pill follows the current view. While it has no place yet it is put
  // on the tab it last stood on (or the current one), then flows on. "No place
  // yet" is read off the pill itself, not a ref: in development React runs this
  // twice and GSAP undoes the first placing in between, which left the pill at
  // the bar's left edge (12 Nov 2026). When the set on show does not hold the
  // current view, the pill fades and is placed afresh when it comes back.
  useGSAP(
    () => {
      const nav = root.current;
      const pill = nav?.querySelector<HTMLElement>("[data-glow]");
      const on = nav?.querySelector<HTMLElement>("[aria-current=page]");
      if (!nav || !pill) return;
      if (!on) {
        gsap.to(pill, { opacity: 0, duration: DUR.fast, overwrite: true });
        return;
      }
      if (!pill.style.width || Number(gsap.getProperty(pill, "opacity")) < 0.05) {
        const start = (pillAt && nav.querySelector<HTMLElement>(`[data-view="${pillAt}"]`)) || on;
        gsap.set(pill, { x: start.offsetLeft, y: start.offsetTop, width: start.offsetWidth, height: start.offsetHeight, opacity: 1 });
      }
      flow(pill, on);
      pillAt = view;
    },
    { dependencies: [view, set], scope: root },
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
        onPointerLeave={() => glide.out(hoverGlow())}
        className="relative flex max-w-[calc(100vw-24px)] items-center gap-[max(0.3rem,2px)] overflow-x-auto whitespace-nowrap rounded-full bg-surface p-[max(0.5rem,5px)] shadow-float [scrollbar-width:none]"
      >
        {/* The opening itself, in neither set: one click home from any view. */}
        <button
          type="button"
          data-view="overview"
          aria-current={view === "overview" ? "page" : undefined}
          aria-label="Job: back to this opening"
          onPointerEnter={(e) => point(e.currentTarget, "overview")}
          onClick={() => aim("overview")}
          className={
            "relative z-[1] flex shrink-0 items-center gap-[max(0.4rem,5px)] rounded-full px-[max(0.9rem,10px)] py-[max(0.45rem,5px)] text-small transition-colors " +
            (view === "overview" ? "text-white" : "text-ink hover:text-ink-2")
          }
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[max(1rem,13px)]" aria-hidden="true">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V20h14V9.5" />
          </svg>
          Job
        </button>
        <span aria-hidden="true" className="mx-[max(0.3rem,3px)] h-[max(1.4rem,18px)] w-px shrink-0 bg-border" />
        {/* The set switch: a click shows that set (owner, 13 Nov 2026: no hover here).
            No Headhunting for someone without a sourcing seat, so no switch either. */}
        {CAN_SOURCE && (<>
        <div role="tablist" aria-label="Which set of views" className="flex shrink-0 rounded-full bg-surface-2 p-[max(0.25rem,3px)]">
          {(
            [
              ["ats", "ATS"],
              ["hh", "Headhunting"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={set === k}
              onClick={() => pickSet(k)}
              className={
                "rounded-full px-[max(0.9rem,10px)] py-[max(0.4rem,5px)] text-small transition-colors " +
                (set === k ? "bg-surface font-medium text-brand shadow-card" : "text-ink-3 hover:text-ink")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <span aria-hidden="true" className="mx-[max(0.4rem,4px)] h-[max(1.4rem,18px)] w-px shrink-0 bg-border" />
        </>)}
        <span data-hover-glow aria-hidden="true" style={{ opacity: 0 }} className="absolute left-0 top-0 rounded-full bg-surface-2" />
        <span data-glow aria-hidden="true" style={{ opacity: 0 }} className="absolute left-0 top-0 rounded-full bg-ink" />
        {tabsOf(set).map((value) => {
          const on = value === view;
          const count = COUNTS[value];
          return (
            <button
              key={value}
              type="button"
              data-view={value}
              aria-current={on ? "page" : undefined}
              onPointerEnter={(e) => point(e.currentTarget, value)}
              onClick={() => aim(value)}
              className={
                "relative flex shrink-0 items-center gap-[max(0.4rem,5px)] rounded-full px-[max(1rem,11px)] py-[max(0.45rem,5px)] text-small transition-colors " +
                (on ? "text-white" : "text-ink hover:text-ink-2")
              }
            >
              {viewLabel(value)}
              {count && (
                <span
                  className={
                    "rounded-full px-[max(0.4rem,5px)] text-caption font-medium leading-[1.5] transition-colors " +
                    (on ? "bg-surface text-ink" : "bg-brand-soft text-brand")
                  }
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
