"use client";

import Link from "next/link";

import { ViewSkeleton } from "@/app/Skeleton";
import DatabaseCvsView from "./DatabaseCvsView";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { DUR, EASE, HOVER_IN, HOVER_OUT, gsap, loadFlip, useExit, useGSAP, useGlide } from "@/lib/gsap";
import { HH_VIEWS, SHOW_TABS, VIEW_TABS, ViewContext, setOf, useOpeningView, viewLabel, type View, type ViewSet } from "./view";
import { ATS_ROWS, HH_ROWS } from "./rows";
import { copyOf, openBoard } from "../../Overview";
import { turn } from "../../Board";
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
const SnippetsView = dynamic(() => import("./SnippetsView"));
const HhOverview = dynamic(() => import("./HhOverview"));
const ResearchView = dynamic(() => import("./ResearchView"));
const SuggestionsView = dynamic(() => import("./SuggestionsView"));
const ExcelTablesView = dynamic(() => import("./ExcelTablesView"));
const RefereeCallsView = dynamic(() => import("./RefereeCallsView"));
const StrategiesView = dynamic(() => import("./StrategiesView"));

/** The opening screen and its work views, switched in place (no page change).
 *  The overview (title row + card) arrives from the server as `overview`; a work
 *  view replaces it full-window, with the top bar and title row out of the way. */
/** Every view in the bottom bar's order: the side a view slides in from. */
const ORDER: View[] = ["overview", ...VIEW_TABS.map(([k]) => k), ...HH_VIEWS.map(([k]) => k)];
/** The address with `v` as its ?view= (none for the tab list). */
function addressFor(v: View) {
  const u = new URL(window.location.href);
  if (v === "overview") u.searchParams.delete("view");
  else u.searchParams.set("view", v);
  return u.pathname + u.search + u.hash;
}
/** The work view an address names, if it names a real one. */
function viewIn(search: string): View | null {
  const v = new URLSearchParams(search).get("view") as View | null;
  return v && v !== "overview" && ORDER.includes(v) ? v : null;
}
/** The last view used in each set, so the switch returns to it. */
const lastIn: Partial<Record<ViewSet, View>> = {};
/** Where the ATS | Headhunting switch lands: Headhunting's Overview, or the last ATS
 *  tab used (Pipeline the first time). */
const landingOf = (set: ViewSet): View => (set === "hh" ? "hh-overview" : lastIn.ats ?? "pipeline");
/** The bar's Job button: to the opening page (Back buttons open the board of tabs). */
const LIST = "opening:list";
/** The parts of a view that flow in after it arrives. */
const PARTS = "[data-col], section, article, li, tr, form, aside, [role=row], [role=tablist]";
const STILL = "[data-card-id], [data-card-id] *, [data-still], [data-still] *";

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

  const show = useCallback((next: View) => {
    current.current = next;
    if (next !== "overview") lastIn[setOf(next)] = next;
    setView(next);
    setOpened((o) => (o.includes(next) ? o : [...o, next]));
  }, []);
  // The view is in the address (?view=pipeline), so the browser's own Back - its
  // button, the mouse's back key, Alt+Left - also returns to the tab list instead of
  // leaving the opening (owner, 18 Nov 2026: "When they click Back inside ATS, they
  // should return to the Pipeline overview... never reset"). Before, a view never
  // touched the address, so the browser's Back skipped the tab list and left the
  // opening entirely. Opening a view from the list adds one step; moving between views
  // replaces it, so Back is always one step to the list. A refresh keeps the view.
  const pushed = useRef(false);
  const go = useCallback(
    (next: View) => {
      if (next === current.current) return;
      if (!CAN_SOURCE && setOf(next) === "hh") return;
      if (next === "overview") return void window.dispatchEvent(new Event(LIST));
      if (current.current === "overview") {
        window.history.pushState(window.history.state, "", addressFor(next));
        pushed.current = true;
      } else window.history.replaceState(window.history.state, "", addressFor(next));
      show(next);
    },
    [show],
  );
  // Back always goes to the opening's own page, with both lists, ATS and Headhunting
  // (owner, 18 Nov 2026: "When a user enters the ATS section and clicks the Back
  // button, it should return to the main view, displaying both Head Hunting and ATS";
  // the same for Headhunting). It replaces the 17 Nov trail, which took Pipeline ->
  // Scoops -> Back to Pipeline. The set you came from is kept, so the views bar opens
  // on it again, and its row shows where you were.
  const [from, setFrom] = useState<View | undefined>(undefined);
  useEffect(() => {
    const toList = () => {
      const left = current.current;
      if (left === "overview") return;
      keepSet(setOf(left));
      setFrom(left);
      show("overview");
    };
    // The list itself (the bar's Job button): the browser's Back when the view added a
    // step (the address and history stay true), else straight to the list.
    const list = () => {
      if (current.current === "overview") return;
      if (pushed.current) {
        pushed.current = false;
        window.history.back();
      } else {
        window.history.replaceState(window.history.state, "", addressFor("overview"));
        toList();
      }
    };
    // The browser's Back / Forward: show what the address says.
    const pop = () => {
      const v = viewIn(location.search);
      if (!v) {
        pushed.current = false;
        toList();
      } else if (v !== current.current && (CAN_SOURCE || setOf(v) !== "hh")) show(v);
    };
    // Opened with ?view= (a refresh, a shared link): that view, with the list one Back away.
    const first = viewIn(location.search);
    if (first && (CAN_SOURCE || setOf(first) !== "hh")) {
      const here = location.pathname + location.search + location.hash;
      window.history.replaceState(window.history.state, "", addressFor("overview"));
      window.history.pushState(window.history.state, "", here);
      pushed.current = true;
      // After the page has taken over, like any other switch.
      queueMicrotask(() => show(first));
    }
    // The Back buttons inside a view: zoom out to a board of every tab of this view's
    // set - all the ATS tabs from an ATS view, all the Headhunting tabs from a
    // Headhunting one - each a picture of its own screen (owner, 18 Nov 2026: "show the
    // Figma board with all the tabs like our previous implementation... inside the ATS
    // show all the tabs of ATS, inside Headhunting all its tabs"). Pick one and it opens;
    // Esc goes back into the view you were in. Every view of the set is mounted first,
    // hidden, so each has a real picture; they stay mounted, so opening one is instant.
    const back = () => {
      const left = current.current;
      const stage = stageRef.current;
      if (left === "overview" || !stage) return;
      const rows = setOf(left) === "hh" ? HH_ROWS : ATS_ROWS;
      // Headhunting's board starts with its Overview (owner, 18 Nov 2026: "when they
      // come back it misses the overview"); its list on the opening page does not have it.
      const set: View[] = [...(setOf(left) === "hh" ? (["hh-overview"] as View[]) : []), ...rows.map(([, v]) => v)];
      const keys = set.includes(left) ? set : [left, ...set];
      setOpened((o) => [...o, ...keys.filter((k) => !o.includes(k))]);
      // The pictures wait until every tab has drawn - a view opening for the first time
      // shows its loading skeleton while its code arrives - for at most 1.2 s.
      const began = performance.now();
      const drawn = () => keys.every((k) => !stage.querySelector(`[data-panel="${k}"] .shimmer`) && stage.querySelector(`[data-panel="${k}"]`));
      const snap = () => {
        if (current.current !== left) return;
        const here = stage.querySelector<HTMLElement>(`[data-panel="${left}"]`);
        if (!here) return;
        const rect = here.getBoundingClientRect();
        const box = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        const tiles = keys.flatMap((k) => {
          const p = stage.querySelector<HTMLElement>(`[data-panel="${k}"]`);
          if (!p) return [];
          const label = rows.find(([, v]) => v === k)?.[0] ?? viewLabel(k);
          return [{ key: k, label, rect: box, ...copyOf(p, here.className) }];
        });
        openBoard({
          title: setOf(left) === "hh" ? "Headhunting" : "ATS",
          tiles,
          cur: Math.max(0, tiles.findIndex((t) => t.key === left)),
          onPick: (k) => go(k as View),
        });
      };
      const wait = () => (drawn() || performance.now() - began > 1200 ? snap() : void setTimeout(wait, 80));
      requestAnimationFrame(() => requestAnimationFrame(wait));
    };
    window.addEventListener(LIST, list);
    window.addEventListener(SHOW_TABS, back);
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener(LIST, list);
      window.removeEventListener(SHOW_TABS, back);
      window.removeEventListener("popstate", pop);
    };
  }, [show, go]);
  // While someone works in a view, the other tabs of its set are drawn quietly in
  // the background (hidden, like any view left), so Back's board of tabs can zoom out
  // at once instead of waiting for them (owner, 18 Nov 2026: "more smoother").
  useEffect(() => {
    if (view === "overview") return;
    const rows = setOf(view) === "hh" ? HH_ROWS : ATS_ROWS;
    // And where the ATS | Headhunting switch would land, so switching is instant too.
    const keys: View[] = [...rows.map(([, v]) => v), "hh-overview" as View, landingOf(setOf(view) === "hh" ? "ats" : "hh")].filter((v) => CAN_SOURCE || setOf(v) !== "hh");
    const idle = window.requestIdleCallback?.bind(window) ?? ((f: () => void) => window.setTimeout(f, 600));
    const cancel = window.cancelIdleCallback?.bind(window) ?? window.clearTimeout;
    const id = idle(() => setOpened((o) => (keys.every((v) => o.includes(v)) ? o : [...o, ...keys.filter((v) => !o.includes(v))])));
    return () => cancel(id);
  }, [view]);
  // One value per view, so the rows and back buttons that only need `go` do not
  // re-render on every render of this screen.
  const ctx = useMemo(() => ({ view, go, from }), [view, go, from]);

  // Once the screen is idle, fetch the pieces that are not in the first download.
  useEffect(() => {
    const idle = window.requestIdleCallback?.bind(window) ?? ((f: () => void) => setTimeout(f, 1200));
    idle(() => {
      void import("./ScoopsView");
      void import("./JobDescriptionView");
      void import("./LinkedInJobView");
      void import("./StrategiesView");
      void import("./SnippetsView");
      void import("./CvPreview");
      void loadFlip();
    });
  }, []);

  // Switching views is a page turn (owner, 14 Nov 2026: "inside the pipeline it just
  // appears, no smooth discovery"). The same moves for every view, so it still feels
  // like one app:
  //   - view to view: the old view slides out as the new one slides in, the way the
  //     bottom bar runs (further along = from the right, back = from the left);
  //   - the opening page is the bar's first stop and slides the same way;
  //   - then the view's parts flow in one after another (the Pipeline's columns,
  //     Scoops' rows, cards) - never the cards inside a column, which move with
  //     their own wheel.
  // The old view is a copy laid over the new one (the real one is already hidden,
  // kept alive), with its CV pages painted across. Nothing waits on the motion: the
  // new view is live at once, and 1.5 s of real time later everything is settled.
  // A plain effect and plain tweens, not useGSAP: a view's code that is still
  // downloading suspends React for a moment, React then tears down the screen's
  // layout effects, and a useGSAP context would revert every tween with them - the
  // view simply appeared and the old view's copy stayed on top of it (14 Nov 2026).
  const prev = useRef<View>("overview");
  const stageRef = useRef<HTMLElement>(null);
  useEffect(
    () => {
      // This screen's own stage, by ref: Next keeps earlier visits of this page in
      // the document, hidden, and a page-wide lookup found one of those (14 Nov 2026).
      const stage = stageRef.current;
      const from = prev.current;
      prev.current = view;
      if (!stage || from === view) return;
      // The board of tabs zoomed into this view itself: no slide on top of it.
      if (performance.now() < turn.quietUntil) return;
      const panel = view === "overview" ? null : stage.querySelector<HTMLElement>(`[data-panel="${view}"]`);
      const tl = gsap.timeline({ defaults: { ease: EASE.out } });

      // The opening page is the first stop of the bar (the Job button), so to and from
      // it is the same slide as between views - not a zoom and a drop of its own
      // (owner, 14 Nov 2026: Headhunting felt smooth and the ATS did not, because
      // Job -> Pipeline -> back used two other moves).
      // Nothing slides outside the board's edges while it moves.
      tl.set(stage, { overflow: "hidden" }, 0);
      if (view === "overview") {
        const parts = stage.querySelectorAll(":scope > .contents > *");
        gsap.set(parts, { opacity: 0, x: -90 });
        tl.to(parts, { opacity: 1, x: 0, duration: DUR.slow, stagger: 0.04, clearProps: "opacity,transform" }, 0);
      } else if (panel && from === "overview") {
        gsap.set(panel, { opacity: 0, x: 90 });
        tl.to(panel, { opacity: 1, x: 0, duration: DUR.slow, clearProps: "opacity,transform" }, 0);
      } else if (panel) {
        const dir = ORDER.indexOf(view) >= ORDER.indexOf(from) ? 1 : -1;
        const old = stage.querySelector<HTMLElement>(`[data-panel="${from}"]`);
        if (old) {
          const ghost = old.cloneNode(true) as HTMLElement;
          ghost.className = "rounded-lg bg-white";
          ghost.setAttribute("aria-hidden", "true");
          // Not a view any more: nothing looking for one may find the copy.
          ghost.removeAttribute("data-panel");
          ghost.inert = true;
          Object.assign(ghost.style, {
            position: "absolute",
            left: `${panel.offsetLeft}px`,
            top: `${panel.offsetTop}px`,
            width: `${panel.offsetWidth}px`,
            height: `${panel.offsetHeight}px`,
            overflow: "hidden",
            pointerEvents: "none",
            zIndex: "5",
          });
          // A copied canvas is blank; paint each CV page across.
          const pages = old.querySelectorAll("canvas");
          ghost.querySelectorAll("canvas").forEach((c, i) => {
            if (pages[i]?.width) c.getContext("2d")?.drawImage(pages[i], 0, 0);
          });
          stage.appendChild(ghost);
          tl.to(ghost, { x: -90 * dir, opacity: 0, scale: 0.985, duration: DUR.slow, ease: EASE.inOut, onComplete: () => ghost.remove() }, 0);
          // And on a plain timer, whatever happens to the tween: a copy left behind
          // would cover the live view.
          setTimeout(() => ghost.remove(), 1600);
        }
        gsap.set(panel, { x: 90 * dir, opacity: 0 });
        tl.to(panel, { x: 0, opacity: 1, duration: DUR.slow, clearProps: "opacity,transform" }, 0.04);
      }

      // Every starting point is placed at once, before the browser draws, never on
      // the first tick: a fromTo inside a timeline left the new view in its final
      // place until then, so it showed, jumped aside and slid back (14 Nov 2026).
      // The view's own parts, one after another.
      if (panel) {
        const parts: Element[] = [];
        for (const el of panel.querySelectorAll<HTMLElement>(PARTS)) {
          if (parts.length >= 16 || el.matches(STILL) || parts.some((p) => p.contains(el))) continue;
          const r = el.getBoundingClientRect();
          if (r.height && r.top < innerHeight) parts.push(el);
        }
        if (parts.length) {
          gsap.set(parts, { opacity: 0, y: 16 });
          tl.to(parts, { opacity: 1, y: 0, duration: DUR.slow, stagger: 0.04, clearProps: "opacity,transform" }, 0.12);
        }
      }
      // Every branch: the board scrolls and overflows normally again at the end.
      tl.set(stage, { clearProps: "overflow" });
      const done = setTimeout(() => tl.progress(1), 1500);
      return () => clearTimeout(done);
    },
    [view],
  );

  return (
    <ViewContext.Provider value={ctx}>
      <main
        ref={stageRef}
        data-view-stage
        className={
          "relative flex min-h-0 flex-1 flex-col " +
          // A phone gets narrow side margins, and the opening's stacked card scrolls
          // inside the page (13 Nov 2026: "responsive for mobile and all devices").
          (focus
            ? // The board sits close under the top bar's space (owner, 16 Nov 2026: "the middle card slightly upper").
              // No bottom margin: the views bar has its own row under the board (TabsBar).
              "mx-[max(5.5rem,40px)] -mt-3 max-md:mx-3 max-md:mt-3"
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
              {v !== "midday" && <Notch small label={viewLabel(v)} />}
              <Suspense fallback={<ViewSkeleton />}>
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
              ) : v === "snippets" ? (
                <SnippetsView />
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
              ) : v === "referral" ? (
                <ReferralView />
              ) : (
                <ComingView label={viewLabel(v)} />
              )}
              </Suspense>
            </div>
          ),
        )}
      </main>
      {focus && <FocusChrome />}
      <TabsBar />
    </ViewContext.Provider>
  );
}

/** Referral Search lives in the Database chat, Referees mode (owner 14 Nov 2026: one
 *  chat, the mode in the search bar). This tab starts it with searches for this job. */
function ReferralView() {
  // ponytail: the demo opening's title and rivals; with the backend, the job's own.
  const asks = ["SAP Leads at competitors", "HR Managers at Dialog", "Finance Directors at Hemas", "General Managers in retail"];
  return (
    <div className="flex flex-1 flex-col px-[max(1.5rem,14px)] pt-[max(1.4rem,14px)] max-md:pt-11">
      <BackButton />
      <div className="m-auto flex max-w-[40rem] flex-col items-center gap-[max(1rem,10px)] text-center">
        <p className="text-h3 font-medium text-ink">Referral Search</p>
        <p className="text-small text-ink-3">Find the referees named on our CVs by title, company or both, with their numbers. It opens in the Database chat, in Referees mode.</p>
        <div className="flex flex-wrap justify-center gap-2">
          {asks.map((a) => (
            <Link key={a} href={`/database?mode=referees&q=${encodeURIComponent(a)}`} className="rounded-full border border-border px-3.5 py-1.5 text-small text-ink-2 hover:border-border-strong hover:bg-surface-2 hover:text-ink">
              {a}
            </Link>
          ))}
        </div>
        <Link href="/database?mode=referees" className="rounded-full bg-ink px-5 py-2.5 text-small font-medium text-white hover:bg-black">
          Open Referral Search
        </Link>
      </div>
    </div>
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

/** The bottom bar. It lives with the opening, not with one view, so it stays up
 *  when the cursor carries the person to Overview - they can keep moving along the
 *  tabs (owner, 12 Nov 2026). Inside a view it is always there, in its own row
 *  under the board, never a layer over the cards (owner, 16 Nov 2026: "it needs to
 *  have its own space"; this replaced the bottom hover edge and the arrow). On
 *  Overview it floats while the cursor is on it and sinks when it leaves. */
function TabsBar() {
  const { view, go } = useOpeningView();
  const focus = view !== "overview";
  const [tabsOpen, setTabsOpen] = useState(false);
  const tabsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The cursor is on the bar: nothing closes it under the cursor (a peek's timer,
  // a view that opened from a tab and peeks).
  const inside = useRef(false);
  // On Overview the bar goes a moment after the pointer leaves it.
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
  useEffect(() => () => clearTimeout(tabsTimer.current), []);

  // Escape puts the bar away. (Back is a normal back, handled in OpeningView.)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setTabsOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
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

  const navWrap = useRef<HTMLDivElement>(null);
  const notchTab = useRef<HTMLButtonElement>(null);
  const prevTabsOpen = useRef<boolean | null>(null);

  // GSAP animation: when inside a view, popping the bar up and hiding it down smoothly transitions
  // between the bottom notch tab and the floating views bar. Switching views keeps the bar open.
  useGSAP(
    () => {
      // Leaving a view drops the bar's nodes; the next view starts from gsap.set again.
      if (!focus) {
        prevTabsOpen.current = null;
        return;
      }
      const nav = navWrap.current;
      const notch = notchTab.current;
      if (!nav || !notch) return;

      if (prevTabsOpen.current === null) {
        prevTabsOpen.current = tabsOpen;
        if (tabsOpen) {
          gsap.set(nav, { opacity: 1, y: 0, pointerEvents: "auto" });
          gsap.set(notch, { opacity: 0, y: 12, pointerEvents: "none" });
        } else {
          gsap.set(nav, { opacity: 0, y: 20, pointerEvents: "none" });
          gsap.set(notch, { opacity: 1, y: 0, pointerEvents: "auto" });
        }
        return;
      }

      if (prevTabsOpen.current === tabsOpen) return;
      prevTabsOpen.current = tabsOpen;

      if (tabsOpen) {
        gsap.to(notch, { opacity: 0, y: 12, duration: DUR.fast, ease: EASE.in, overwrite: true, onComplete: () => { notch.style.pointerEvents = "none"; } });
        gsap.to(nav, { opacity: 1, y: 0, duration: DUR.base, ease: EASE.out, overwrite: true, onStart: () => { nav.style.pointerEvents = "auto"; } });
      } else {
        gsap.to(nav, { opacity: 0, y: 20, duration: DUR.fast, ease: EASE.in, overwrite: true, onComplete: () => { nav.style.pointerEvents = "none"; } });
        gsap.to(notch, { opacity: 1, y: 0, duration: DUR.base, ease: EASE.out, overwrite: true, onStart: () => { notch.style.pointerEvents = "auto"; } });
      }
    },
    { dependencies: [tabsOpen, focus] },
  );

  // On Overview: floating tabs bar on hover
  const tabsShown = useExit(tabsOpen && !focus, tabsNav, TABS_OUT);

  if (focus) {
    return (
      <div data-views-bar className="relative flex shrink-0 justify-center overflow-hidden py-[max(0.6rem,6px)] pb-[max(1.75rem,16px)]">
        {/* The bottom notch tab: click to pop the views bar up */}
        <button
          ref={notchTab}
          type="button"
          onClick={() => setTabsOpen(true)}
          aria-expanded={tabsOpen}
          aria-label="Show the views"
          className="absolute bottom-0 left-1/2 z-20 flex h-[max(2.125rem,26px)] w-[max(12rem,150px)] -translate-x-1/2 cursor-pointer items-center justify-center pt-1 text-brand-strong transition-colors hover:text-brand"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="relative z-10 size-[max(1rem,13px)]" aria-hidden="true">
            <path d="m6 15 6-6 6 6" />
          </svg>
          <svg viewBox="0 0 208 42" preserveAspectRatio="none" className="absolute inset-0 size-full fill-surface" aria-hidden="true" data-still>
            <path d="M0 42c10 0 12-6 15-14l7-16c3-8 8-12 16-12h132c8 0 13 4 16 12l7 16c3 8 5 14 15 14Z" />
          </svg>
        </button>

        {/* The floating views bar */}
        <div
          ref={navWrap}
          // No inline style: React would write the end state before GSAP tweens it, so the
          // bar would jump instead of rising. The first run sets the start with gsap.set.
          className="relative z-10"
        >
          <ViewTabs
            ref={tabsNav}
            docked={true}
            onClose={() => setTabsOpen(false)}
            onEnter={enterBar}
            onLeave={leaveBar}
            onHold={() => (held.current = true)}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      {tabsShown && (
        <div data-views-bar className="fixed bottom-0 left-1/2 z-40 -translate-x-1/2 py-[max(0.6rem,6px)]">
          <ViewTabs ref={tabsNav} docked={false} onEnter={enterBar} onLeave={leaveBar} onHold={() => (held.current = true)} />
        </div>
      )}
    </>
  );
}

/** Focus mode: the top bar keeps its place - its space stays, nothing moves up into
 *  it - but stays out of sight until the pointer comes to that space; then it shows
 *  there, as on the opening page, never over the board and with no blur (owner,
 *  16 Nov 2026: "the space needs to be there... no need to come over"). */
function FocusChrome() {
  const strip = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const bar = document.getElementById("topnav");
    const zone = strip.current;
    if (!bar || !zone) return;
    // A phone or tablet has no pointer to bring a hidden bar back, so there the
    // top bar simply stays in place (13 Nov 2026).
    if (!window.matchMedia("(hover: hover) and (min-width: 768px)").matches) return;
    // Set here, in the layout effect, so the bar is already out of sight before the
    // first frame of the view is painted. It stays in the flow, so its space stays.
    // The hover zone covers exactly that space; the bar sits above it once shown.
    gsap.set(bar, { position: "relative", zIndex: 50, opacity: 0, y: -28, pointerEvents: "none" });
    // The top bar is exactly as wide as the white board under it, edge to edge
    // (owner, 16 Nov 2026: "top bar = board width"); it never squeezes below what its
    // own links need.
    const board = () => [...document.querySelectorAll<HTMLElement>("[data-view-stage]")].find((n) => n.getClientRects().length > 0);
    const fit = () => {
      const w = board()?.getBoundingClientRect().width;
      if (w) gsap.set(bar, { width: w, minWidth: "min-content", marginLeft: "auto", marginRight: "auto" });
      zone.style.height = `${Math.ceil(bar.getBoundingClientRect().bottom) + 6}px`;
    };
    fit();
    addEventListener("resize", fit);
    const follow = new ResizeObserver(fit);
    const v = board();
    if (v) follow.observe(v);

    let timer: ReturnType<typeof setTimeout> | undefined;
    let intent: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      clearTimeout(timer);
      // It settles a little above its usual place (owner, 16 Nov 2026: "slightly more up").
      gsap.to(bar, { opacity: 1, y: -18, pointerEvents: "auto", duration: DUR.base, overwrite: true });
    };
    const hide = () => {
      gsap.to(bar, { opacity: 0, y: -28, pointerEvents: "none", duration: DUR.fast, ease: EASE.in, overwrite: true });
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
      removeEventListener("resize", fit);
      follow.disconnect();
      zone.removeEventListener("mouseenter", showSoon);
      zone.removeEventListener("mouseleave", hideSoon);
      bar.removeEventListener("mouseenter", show);
      bar.removeEventListener("mouseleave", hideSoon);
      bar.removeEventListener("focusin", show);
      bar.removeEventListener("focusout", leftBar);
      gsap.killTweensOf(bar);
      gsap.set(bar, { clearProps: "position,zIndex,opacity,transform,pointerEvents,width,minWidth,marginLeft,marginRight" });
    };
  });

  return (
    // The hover zone along the top edge that brings the top bar down.
    <div ref={strip} aria-hidden="true" className="fixed inset-x-0 top-0 z-40 h-5" />
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
  docked,
  onClose,
  onEnter,
  onLeave,
  onHold,
}: {
  ref: RefObject<HTMLElement | null>;
  /** Inside a view: its own row under the board. Else it floats in the same place. */
  docked: boolean;
  onClose?: () => void;
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
    // Inside a view the switch takes you there at once: Headhunting opens its
    // Overview, ATS the last ATS tab (owner, 18 Nov 2026: "when the user clicks the
    // toggle ATS to Headhunting it needs to show the Headhunting overview quickly - now
    // it stays in the ATS even when they change the toggle"). On the opening page both
    // lists are already in view, so there it only changes the bar's tabs.
    if (view !== "overview") go(landingOf(next));
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
    void el; // click and use: no hover highlight (owner, 17 Nov 2026)
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

  // The bar rises in once when it opens (on Overview, where it is mounted/unmounted).
  useGSAP(
    () => {
      if (docked) return;
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
      const needsInit = !pill.style.width || Number(gsap.getProperty(pill, "opacity")) < 0.05;
      if (needsInit) {
        gsap.set(pill, { x: on.offsetLeft, y: on.offsetTop, width: on.offsetWidth, height: on.offsetHeight, opacity: 1 });
      } else if (pillAt && pillAt !== view) {
        flow(pill, on);
      }
      pillAt = view;
    },
    { dependencies: [view, set], scope: root },
  );

  return (
    <nav
      ref={root}
      aria-label="Views of this opening"
      onPointerLeave={() => glide.out(hoverGlow())}
      onMouseEnter={docked ? undefined : onEnter}
      onMouseLeave={docked ? undefined : onLeave}
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
        {docked && onClose && (
          <>
            <span aria-hidden="true" className="mx-[max(0.2rem,2px)] h-[max(1.4rem,18px)] w-px shrink-0 bg-border" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Hide the views"
              className="relative z-[1] flex size-[max(2rem,24px)] shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-[max(0.95rem,13px)]" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </>
        )}
      </nav>
  );
}
