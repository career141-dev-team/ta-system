"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { DUR, EASE, HOVER_IN, HOVER_OUT, gsap, loadFlip, useExit, useGSAP } from "@/lib/gsap";
import { SHOW_TABS, ViewContext, isWorkView, useOpeningView, viewLabel, type View, type WorkView } from "./view";
import Notch from "./Notch";
import PipelineBoard from "./PipelineBoard";
import { BackButton } from "./PipelineBoard";
import { warmPdf } from "./CvPages";

const RECENT_KEY = "ta-ui:recent-views";
const RECENT_MAX = 8;
/** How long the bottom bar stays up on its own after a view opens or an arrow key. */
const PEEK_MS = 1600;

function loadRecent(): WorkView[] {
  if (typeof window === "undefined") return [];
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter(isWorkView).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

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

  // The bottom bar's tabs are the views this person has opened (owner, 12 Nov
  // 2026: "if they open five or six tabs, those tabs only come in the bottom bar").
  // A new view joins at the end and an opened one keeps its place, so the tabs
  // never jump about under the pointer. Over RECENT_MAX, the view used longest
  // ago leaves. Kept in this browser only, as a convenience.
  const [recent, setRecent] = useState<WorkView[]>(loadRecent);
  const used = useRef(new Map<WorkView, number>());
  const tick = useRef(0);
  useEffect(() => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      // Private window or blocked storage: the bar still works for this visit.
    }
  }, [recent]);

  // Every view opened on this visit stays alive, hidden, when another is on screen
  // (owner, 12 Nov 2026: "lightning quick"; this UI will read a lot of backend
  // data). So coming back to a view is instant: nothing is drawn or fetched again,
  // the scroll, the chosen candidate and the filters are where they were left. With
  // the backend, each view reads its own small query once, when first opened, and
  // keeps it for as long as this opening is open.
  const [opened, setOpened] = useState<View[]>(["overview"]);

  const go = useCallback((next: View) => {
    if (next === current.current) return;
    current.current = next;
    setView(next);
    setOpened((o) => (o.includes(next) ? o : [...o, next]));
    if (next === "overview") return;
    used.current.set(next, ++tick.current);
    const last = used.current;
    setRecent((r) => {
      if (r.includes(next)) return r;
      const out = [...r, next];
      while (out.length > RECENT_MAX) {
        const oldest = out.filter((v) => v !== next).sort((a, b) => (last.get(a) ?? 0) - (last.get(b) ?? 0))[0];
        out.splice(out.indexOf(oldest), 1);
      }
      return out;
    });
  }, []);
  // One value per view, so the rows and back buttons that only need `go` do not
  // re-render on every render of this screen.
  const ctx = useMemo(() => ({ view, go, recent }), [view, go, recent]);

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
  // The full sequence plays the first time Pipeline opens; after that, and for every
  // other view, the view just fades up - quick, because switching on hover must
  // feel instant (owner, 12 Nov 2026).
  const played = useRef(false);
  useGSAP(
    () => {
      const stage = document.querySelector<HTMLElement>("[data-view-stage]");
      if (!stage) return;
      const panel = view === "overview" ? stage : stage.querySelector<HTMLElement>(`[data-panel="${view}"]`);
      if (!panel) return;
      if (view !== "pipeline" || played.current) {
        gsap.fromTo(panel, { opacity: 0, y: 8 }, { opacity: 1, y: 0, scale: 1, duration: DUR.fast, overwrite: true });
        return;
      }
      played.current = true;
      const tl = gsap.timeline();
      // expo, not the usual curve: this one is the "zoom" the owner picked.
      tl.fromTo(
        panel,
        { opacity: 0, scale: 0.97, y: 16 },
        { opacity: 1, scale: 1, y: 0, duration: DUR.slow, ease: "expo.out", transformOrigin: "50% 30%" },
      );
      const bars = panel.querySelectorAll("[data-intro]");
      if (bars.length) tl.from(bars, { opacity: 0, y: -14, duration: DUR.base, stagger: 0.06 }, 0.06);
      const cols = Array.from(panel.querySelectorAll<HTMLElement>("[data-col]"));
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
              className={v === view ? "relative flex min-h-0 flex-1 flex-col rounded-[1.5rem] bg-white" : "hidden"}
            >
              <Notch label={viewLabel(v)} />
              {v === "pipeline" ? <PipelineBoard /> : v === "scoops" ? <ScoopsView /> : <ComingView label={viewLabel(v)} />}
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

/** The bottom bar and everything that raises it. It lives with the opening, not
 *  with one view, so it stays up when the cursor carries the person to Overview -
 *  they can keep moving along the tabs (owner, 12 Nov 2026). The bottom hover edge
 *  and the arrow are only there inside a view; on Overview the bar stays while the
 *  cursor is on it and sinks when it leaves. */
function TabsBar() {
  const { view, recent, go } = useOpeningView();
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
  const enterBar = () => {
    inside.current = true;
    clearTimeout(tabsTimer.current);
    setTabsOpen(true);
  };
  const leaveBar = () => {
    inside.current = false;
    closeTabsSoon();
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
  // the Overview tab or another view. It goes when the pointer leaves it, on
  // Escape, or with the choice.
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

  // Left and right arrow keys move along the tabs (Overview first), like a click on
  // the next one: inside a view, or on Overview while the bar is up. Not while
  // typing, not with a modifier, and not while a CV or a notice is open over the
  // board (owner, 12 Nov 2026).
  useEffect(() => {
    if (!focus && !tabsOpen) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable=true]")) return;
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
      const tabs: View[] = ["overview", ...recent];
      const at = tabs.indexOf(view);
      const next = tabs[at + (e.key === "ArrowRight" ? 1 : -1)];
      if (at < 0 || !next) return;
      e.preventDefault();
      go(next);
      peek();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [focus, tabsOpen, view, recent, go, peek]);

  // Closing, the bar sinks and fades the way it rose instead of vanishing.
  const tabsNav = useRef<HTMLElement>(null);
  const tabsShown = useExit(tabsOpen, tabsNav, TABS_OUT);

  return (
    <>
      {tabsShown && <ViewTabs ref={tabsNav} onEnter={enterBar} onLeave={leaveBar} />}
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

/** The View tabs bar: white pill, the views this person has opened, the current one
 *  in black. The black pill flows like water to whichever tab is picked. */
function ViewTabs({
  ref: root,
  onEnter,
  onLeave,
}: {
  ref: RefObject<HTMLElement | null>;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { view, go, recent } = useOpeningView();

  // The cursor alone changes the view, at once: no click and no wait (owner, 12 Nov
  // 2026: "based on the cursor it changes between the tabs... lightning quick, no
  // delay"). Opened views stay alive (OpeningView), so sweeping across the bar only
  // shows views that are already drawn; each draws once, the first time. The bar
  // stays up on Overview while the cursor is on it, so landing there is harmless.
  const aim = (value: View) => {
    if (value === "scoops") warmPdf(); // Scoops opens on a CV: get pdf.js ready now.
    go(value);
  };

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
  // the bar's left edge (12 Nov 2026). It runs in the commit of the click itself.
  useGSAP(
    () => {
      const nav = root.current;
      const pill = nav?.querySelector<HTMLElement>("[data-glow]");
      const on = nav?.querySelector<HTMLElement>("[aria-current=page]");
      if (!nav || !pill || !on) return;
      if (!pill.style.width) {
        const start = (pillAt && nav.querySelector<HTMLElement>(`[data-view="${pillAt}"]`)) || on;
        gsap.set(pill, { x: start.offsetLeft, y: start.offsetTop, width: start.offsetWidth, height: start.offsetHeight, opacity: 1 });
      }
      flow(pill, on);
      pillAt = view;
    },
    { dependencies: [view, recent], scope: root },
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
        className="relative flex max-w-[calc(100vw-24px)] items-center gap-[max(0.3rem,2px)] overflow-x-auto whitespace-nowrap rounded-full bg-white p-[max(0.5rem,5px)] shadow-[0_10px_40px_rgba(0,0,0,0.14)] [scrollbar-width:none]"
      >
        <span data-glow aria-hidden="true" style={{ opacity: 0 }} className="absolute left-0 top-0 rounded-full bg-black" />
        {(["overview", ...recent] as View[]).map((value) => {
          const on = value === view;
          return (
            <button
              key={value}
              type="button"
              data-view={value}
              aria-current={on ? "page" : undefined}
              onPointerEnter={() => aim(value)}
              onClick={() => go(value)}
              className={
                "relative rounded-full px-[max(1rem,11px)] py-[max(0.45rem,5px)] text-[max(0.9rem,12px)] transition-colors " +
                (on ? "text-white" : "text-black/60 hover:text-black")
              }
            >
              {value === "overview" ? "Overview" : viewLabel(value)}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
