"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DUR, EASE, gsap } from "@/lib/gsap";
import { PAGES, turn } from "./Board";

// The overview (owner, 18 Nov 2026: "like Windows Alt + Tab and Figma's zoom out -
// all my pages together in a zoomed-out view, pick one and it opens in full"). The
// page you are on flies back into a grid of every page you opened lately, each one a
// picture of how you left it, over the dotted canvas; pick one and it flies up into
// the full board and becomes the real page.
//
// Open it: Alt + ` (hold Alt, press ` again to step, let Alt go to open - Alt + Tab
// itself belongs to Windows and never reaches a web page), or the grid button in the
// top bar. Arrows move, Enter or a click opens, Esc goes back to where you were.
//
// The pictures are copies of each page's board, taken as you leave it (a link click,
// Back) and when the overview opens - a page you left is gone from the document, so
// a copy is the only way to show it. They are pictures only (inert): the real page
// opens when you pick it, with everything it had.

type Rect = { left: number; top: number; width: number; height: number };
type Snap = { path: string; href: string; label: string; node: HTMLElement; rect: Rect; scrolls: [number, number, number][] };
type Tile = { path: string; href: string; label: string; snap?: Snap };

/** Copies of the pages you visited, newest last. */
const snaps = new Map<string, Snap>();
const KEEP = 12;
const MAX_TILES = 6;

const visibleMain = () =>
  [...document.querySelectorAll("main")].find((m) => m.getClientRects().length > 0 && !m.closest("[data-overview]"));

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

function labelOf(path: string, main: HTMLElement) {
  const page = PAGES.find(([p]) => p === path)?.[1];
  if (page) return page;
  // An opening: its title, and the view open inside it.
  const title = main.querySelector("h1")?.textContent?.trim() || "Opening";
  const view = main.querySelector<HTMLElement>("[data-panel]:not(.hidden) h2")?.textContent?.trim();
  return view ? `${title} · ${view}` : title;
}

/** An inert copy of `el`'s contents in a fresh div with `className`: canvases painted
 *  (a copied canvas comes out blank), ids and the page's own lookups stripped, and
 *  where its scrolled parts stood. Shared with the opening's board of tabs. */
export function copyOf(el: HTMLElement, className: string) {
  const node = document.createElement("div");
  node.className = className;
  for (const c of el.childNodes) node.appendChild(c.cloneNode(true));
  const from = el.querySelectorAll<HTMLElement>("*");
  const to = node.querySelectorAll<HTMLElement>("*");
  const scrolls: Snap["scrolls"] = [];
  from.forEach((x, i) => {
    const c = to[i];
    if (!c) return;
    if (x.scrollTop || x.scrollLeft) scrolls.push([i, x.scrollTop, x.scrollLeft]);
    if (x instanceof HTMLCanvasElement && x.width) (c as HTMLCanvasElement).getContext("2d")?.drawImage(x, 0, 0);
    // Ids kept inside an SVG (its gradients point at them); everywhere else a copy
    // must not answer to the page's own lookups.
    if (!x.closest("svg")) c.removeAttribute("id");
    for (const n of ["data-card-id", "data-panel", "data-board-body", "data-view-stage"]) c.removeAttribute(n);
  });
  node.setAttribute("aria-hidden", "true");
  node.inert = true;
  return { node, scrolls };
}

/** A picture of the page on screen, kept under its address. */
function take() {
  const main = visibleMain();
  if (!main) return;
  const path = location.pathname;
  // The board's own look, without its first-load rise (a CSS animation would replay).
  const { node, scrolls } = copyOf(main, main.className.replace(/\benter-board\b/g, ""));
  snaps.delete(path);
  snaps.set(path, { path, href: location.pathname + location.search, label: labelOf(path, main), node, rect: rectOf(main), scrolls });
  while (snaps.size > KEEP) snaps.delete(snaps.keys().next().value!);
}

/** The grid (owner, 18 Nov 2026: "the tabs look very small" - then "keep all recent
 *  tabs visible"): every recent page at once, each as big as the window allows - the
 *  column count that gives the biggest pictures, rows centred like Alt + Tab. */
function layout(n: number, W: number, H: number, aspect: number, board = false) {
  const pad = Math.max(12, W * 0.02);
  const top = Math.max(64, H * 0.095);
  // A board of tabs puts each name inside its tab, so its rows need no room for names
  // and the tabs can be bigger while keeping their screen's shape (owner, 18 Nov 2026:
  // "you increased the width without the height, it looks so ugly").
  const label = board ? 0 : Math.max(26, H * 0.04);
  const gap = Math.max(12, W * 0.014);
  // A page's own tab rises above its board; a board of tabs is clipped, so no room.
  const notch = board ? 0.02 : 0.06;
  let best = { cols: 1, w: 0, h: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const byH = ((H - top - pad - gap * (rows - 1)) / rows - label) / (1 + notch);
    const w = Math.min((W - 2 * pad - gap * (cols - 1)) / cols, byH * aspect);
    if (w > best.w) best = { cols, w, h: w / aspect };
  }
  // A board of tabs sits a little smaller than the most that fits, with more air
  // between them (owner, 18 Nov 2026: "reduce the width slightly").
  const fit = board ? 0.9 : 1;
  const w = best.w * fit;
  const h = best.h * fit;
  const { cols } = best;
  const rows = Math.ceil(n / cols);
  const cellH = h * (1 + notch) + label;
  const y0 = top + (H - top - pad - (rows * cellH + gap * (rows - 1))) / 2;
  return {
    cols,
    rows,
    w,
    h,
    cells: Array.from({ length: n }, (_, i) => {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, n - row * cols);
      const x0 = (W - (inRow * w + gap * (inRow - 1))) / 2;
      return { left: x0 + (i % cols) * (w + gap), top: y0 + row * (cellH + gap) + label + h * notch, row, col: i % cols };
    }),
  };
}

/** The zoom, out and in: slower and softer than a switch (owner, 18 Nov 2026: "more smoother"). */
const ZOOM = 0.85;
const ZOOM_EASE = "power3.inOut";

/** A fixed copy that flies a page between the full board and its tile: `node` sits at
 *  its own size at `at`, and a transform carries it from a screen rectangle. */
function flyer(root: HTMLElement, node: HTMLElement, at: Rect) {
  const f = document.createElement("div");
  f.setAttribute("aria-hidden", "true");
  Object.assign(f.style, { position: "fixed", left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px`, height: `${at.height}px`, transformOrigin: "0 0", zIndex: "5", pointerEvents: "none" });
  Object.assign(node.style, { position: "absolute", left: "0", top: "0", transform: "none" });
  f.appendChild(node);
  root.appendChild(f);
  return f;
}
const toward = (from: Rect, at: Rect) => ({ x: from.left - at.left, y: from.top - at.top, scale: from.width / at.width });

const OPEN = "overview:open";
const BOARD = "overview:board";

/** One tab on a board of tabs: its picture (`copyOf`) at the size it is shown. */
export type BoardTile = { key: string; label: string; node: HTMLElement; rect: Rect; scrolls?: Snap["scrolls"] };
type BoardOpen = { title: string; tiles: BoardTile[]; cur: number; onPick: (key: string) => void };
/** The same zoomed-out board for the tabs of one place - an opening's ATS or
 *  Headhunting tabs (owner, 18 Nov 2026: "inside the ATS show all the tabs of ATS,
 *  inside Headhunting all its tabs"). `cur` is the tab you are in; picking one calls
 *  `onPick` with its key, which switches to it under the zoom. */
export function openBoard(d: BoardOpen) {
  dispatchEvent(new CustomEvent(BOARD, { detail: d }));
}

/** The top bar's button: every page at once. */
export function OverviewButton() {
  return (
    <button
      type="button"
      onClick={() => dispatchEvent(new Event(OPEN))}
      aria-label="All pages (Alt + `)"
      title="All pages (Alt + `)"
      className="ml-[max(0.75rem,8px)] flex size-[max(2.5rem,34px)] shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-[42%]" aria-hidden="true">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </svg>
    </button>
  );
}

type State = { tiles: Tile[]; held: boolean; home: Rect; W: number; H: number; cur: number; title: string; board: boolean; onPick?: (key: string) => void };

export default function Overview() {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState<State | null>(null);
  const [sel, setSelState] = useState(0);
  // The pick as it is this moment: Enter straight after an arrow must open the new one,
  // before React has drawn it.
  const selNow = useRef(0);
  const setSel = (v: number | ((s: number) => number)) => {
    selNow.current = typeof v === "function" ? v(selNow.current) : v;
    setSelState(selNow.current);
  };
  const root = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLElement | null>(null);
  const leaving = useRef<{ to: string; moved: boolean; arrived: boolean } | null>(null);
  // Where the mouse last was: a tile moving under a still mouse is not a choice (the
  // shrinking page passed under it and took Alt + `'s pick back).
  const mouse = useRef("");
  const live = useRef({ open, sel });
  live.current = { open, sel };

  // Pictures as you leave a page: a link to another page, or Back / Forward (the
  // old page is still in the document at that moment).
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href]");
      if (!a || a.target === "_blank" || a.closest("[data-overview]")) return;
      const url = new URL(a.href, location.href);
      if (url.origin === location.origin && url.pathname !== location.pathname) take();
    };
    document.addEventListener("click", click, true);
    addEventListener("popstate", take, true);
    return () => {
      document.removeEventListener("click", click, true);
      removeEventListener("popstate", take, true);
    };
  }, []);

  const show = (held: boolean) => {
    const main = visibleMain();
    if (!main || live.current.open || leaving.current) return;
    take();
    // The pages you opened, newest first - the one you are on leads (its picture was
    // just taken). Only real pages: empty "not opened" boards crowded them small.
    const tiles: Tile[] = [...snaps.values()]
      .reverse()
      .slice(0, MAX_TILES)
      .map((s) => ({ path: s.path, href: s.href, label: s.label, snap: s }));
    if (tiles[0]?.path !== location.pathname) return;
    mouse.current = "";
    setSel(held && tiles.length > 1 ? 1 : 0);
    setOpen({ tiles, held, home: rectOf(main), W: innerWidth, H: innerHeight, cur: 0, title: "Your recent pages", board: false });
  };

  const showBoard = (d: BoardOpen) => {
    if (live.current.open || leaving.current || !d.tiles[d.cur]) return;
    const tiles: Tile[] = d.tiles.map((t) => ({
      path: t.key,
      href: "",
      label: t.label,
      snap: { path: t.key, href: "", label: t.label, node: t.node, rect: t.rect, scrolls: t.scrolls ?? [] },
    }));
    mouse.current = "";
    setSel(d.cur);
    setOpen({ tiles, held: false, home: d.tiles[d.cur].rect, W: innerWidth, H: innerHeight, cur: d.cur, title: d.title, board: true, onPick: d.onPick });
  };

  // The keys and the button.
  useEffect(() => {
    const onOpen = () => show(false);
    const onBoard = (e: Event) => showBoard((e as CustomEvent<BoardOpen>).detail);
    const down = (e: KeyboardEvent) => {
      const o = live.current.open;
      if (e.altKey && e.code === "Backquote") {
        e.preventDefault();
        e.stopPropagation();
        if (!o) show(true);
        else if (!leaving.current) setSel((s) => (s + (e.shiftKey ? -1 : 1) + o.tiles.length) % o.tiles.length);
        return;
      }
      if (!o) return;
      // While it is open, the page underneath hears no keys.
      e.stopPropagation();
      if (leaving.current) return e.preventDefault();
      const n = o.tiles.length;
      const cols = layout(n, o.W, o.H, o.home.width / o.home.height, o.board).cols;
      const by: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
      if (e.key in by) {
        e.preventDefault();
        setSel((s) => Math.min(n - 1, Math.max(0, s + by[e.key])));
      } else if (e.key === "Tab") {
        e.preventDefault();
        setSel((s) => (s + (e.shiftKey ? -1 : 1) + n) % n);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick(selNow.current);
      } else if (e.key === "Escape") {
        e.preventDefault();
        pick(o.cur);
      }
    };
    // Letting Alt go opens the one picked, as Alt + Tab does.
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt" && live.current.open?.held && !leaving.current) {
        e.preventDefault();
        pick(selNow.current);
      }
    };
    addEventListener(OPEN, onOpen);
    addEventListener(BOARD, onBoard);
    addEventListener("keydown", down, true);
    addEventListener("keyup", up, true);
    return () => {
      removeEventListener(OPEN, onOpen);
      removeEventListener(BOARD, onBoard);
      removeEventListener("keydown", down, true);
      removeEventListener("keyup", up, true);
    };
  });

  const grid = open && layout(open.tiles.length, open.W, open.H, open.home.width / open.home.height, open.board);
  /** Each tile's picture: the page at its own size, scaled to fit the cell. */
  const fit = (t: Tile) => {
    const r = t.snap!.rect;
    const s = Math.min(grid!.w / r.width, grid!.h / r.height);
    // How much of the screen's height the tile shows (all of it: tabs keep their shape).
    const shown = Math.min(1, grid!.h / (r.height * s));
    return { r, s, ox: (grid!.w - r.width * s) / 2, oy: (grid!.h - r.height * s) / 2, shown };
  };
  /** The copy's clip while it is a tile: the part of the screen the tile shows. */
  const clipFor = (shown: number, scale: number) => `inset(0% 0% ${((1 - shown) * 100).toFixed(2)}% 0% round ${(16 / scale).toFixed(1)}px)`;
  const ringBox = (i: number) => {
    const c = grid!.cells[i];
    return { x: c.left - 7, y: c.top - 7, width: grid!.w + 14, height: grid!.h + 14 };
  };

  // Zooming out, one camera move: the page you are on flies down from the full board
  // into its place in the grid while the dotted canvas zooms out behind it, then the
  // other pages slide in from their side, their names rise out of a blur, and the
  // ring settles round the pick.
  useLayoutEffect(() => {
    if (!open || !root.current || !grid) return;
    const el = root.current;
    for (const t of open.tiles) {
      const slot = el.querySelector<HTMLElement>(`[data-slot="${CSS.escape(t.path)}"]`);
      if (!slot || !t.snap) continue;
      const n = t.snap.node;
      Object.assign(n.style, { position: "absolute", left: "0", top: "0", margin: "0", width: `${t.snap.rect.width}px`, height: `${t.snap.rect.height}px`, pointerEvents: "none", transform: "none" });
      slot.appendChild(n);
      const all = n.querySelectorAll<HTMLElement>("*");
      for (const [i, top, left] of t.snap.scrolls) if (all[i]) Object.assign(all[i], { scrollTop: top, scrollLeft: left });
    }
    const s0 = live.current.sel;
    const tiles = [...el.querySelectorAll<HTMLElement>("[data-tile]")];
    const labels = [...el.querySelectorAll<HTMLElement>("[data-tile-label]")];
    const back = el.querySelector("[data-backdrop]");
    const head = el.querySelector("[data-head]");
    // Where the page you are on lands: its picture's place in its tile.
    const slot0 = tiles[open.cur].querySelector<HTMLElement>("[data-slot]")!;
    const land = rectOf(slot0);
    const snap0 = open.tiles[open.cur].snap!;
    const fly = flyer(el, snap0.node, snap0.rect);
    const { shown: shown0 } = fit(open.tiles[open.cur]);
    const k0 = land.width / snap0.rect.width;
    gsap.set(labels, { opacity: 0, y: 6, filter: "blur(3px)" });
    gsap.set(head, { opacity: 0, y: -6 });
    gsap.set(ring.current, { ...ringBox(s0), opacity: 0, scale: 1.03, transformOrigin: "50% 50%" });
    // The canvas and the moving copy get their own layers, so nothing repaints while
    // they move (a full-window dotted background scaling was the stutter).
    gsap.set([back, fly, ...tiles], { willChange: "transform, opacity" });
    gsap.set(back, { opacity: 0, scale: 1.12, transformOrigin: "50% 45%" });
    gsap.set(fly, { clipPath: clipFor(1, 1) });
    // The others grow in where they stand - no sliding in from the sides - spreading
    // out from the one you were in.
    const c0 = grid.cells[open.cur];
    const far = (i: number) => Math.hypot(grid.cells[i].col - c0.col, grid.cells[i].row - c0.row);
    tiles.forEach((t, i) => i !== open.cur && gsap.set(t, { opacity: 0, scale: 0.92, transformOrigin: "50% 50%" }));
    // The real page hides under its own copy, so nothing of it shows twice.
    const main = visibleMain();
    if (main) {
      main.style.visibility = "hidden";
      hidden.current = main;
    }
    const home = () => {
      if (fly.isConnected) {
        slot0.appendChild(snap0.node);
        fly.remove();
      }
    };
    const tl = gsap.timeline({ defaults: { ease: EASE.out } });
    tl.to(back, { opacity: 1, scale: 1, duration: ZOOM, ease: ZOOM_EASE }, 0)
      .to(fly, { ...toward(land, snap0.rect), clipPath: clipFor(shown0, k0), duration: ZOOM, ease: ZOOM_EASE, onComplete: home }, 0);
    tiles.forEach((t, i) => {
      if (i !== open.cur) tl.to(t, { opacity: 1, scale: 1, duration: 0.6, ease: "power2.out" }, ZOOM * 0.4 + far(i) * 0.06);
    });
    tl.to(labels, { opacity: 1, y: 0, filter: "blur(0px)", duration: DUR.slow, stagger: 0.03 }, ZOOM * 0.65)
      .to(head, { opacity: 1, y: 0, duration: DUR.slow }, ZOOM * 0.55)
      .to(ring.current, { opacity: 1, scale: 1, duration: DUR.slow }, ZOOM * 0.85)
      .set([back, ...tiles], { clearProps: "willChange" });
    // A held-back frame never leaves the page stuck in its copy.
    const done = setTimeout(() => {
      tl.progress(1);
      home();
    }, 2200);
    return () => {
      clearTimeout(done);
      tl.kill();
      home();
    };
    // Once per opening; grid and ringBox are worked out from `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The ring glides to the pick, which lifts a little.
  useEffect(() => {
    if (!open || !grid || !ring.current || !root.current) return;
    if (Number(gsap.getProperty(ring.current, "opacity")) > 0.05) gsap.to(ring.current, { ...ringBox(sel), duration: DUR.base, ease: EASE.out, overwrite: "auto" });
    else gsap.set(ring.current, ringBox(sel));
    root.current.querySelectorAll<HTMLElement>("[data-tile]")[sel]?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, open]);

  const finish = () => {
    const el = root.current;
    if (hidden.current) hidden.current.style.visibility = "";
    hidden.current = null;
    const end = () => {
      leaving.current = null;
      setOpen(null);
    };
    if (!el) return end();
    gsap.to(el, { opacity: 0, duration: DUR.fast, ease: EASE.in, onComplete: end });
    setTimeout(end, 600);
  };

  // Zooming in: the picked page flies up from its tile into the full board as the
  // canvas zooms in behind it and the others slide away; the real page takes its
  // place the moment it is there.
  function pick(i: number) {
    const o = live.current.open;
    const el = root.current;
    if (!o || !el || leaving.current || !grid) return;
    const t = o.tiles[i];
    // A board of tabs switches in place, at once; a page waits for its address.
    const moved = o.onPick ? i !== o.cur : t.path !== location.pathname;
    leaving.current = { to: t.path, moved, arrived: !moved || !!o.onPick };
    setSel(i);
    const tiles = [...el.querySelectorAll<HTMLElement>("[data-tile]")];
    const slot = tiles[i].querySelector<HTMLElement>("[data-slot]")!;
    const from = rectOf(slot);
    const at = t.snap!.rect;
    const fly = flyer(el, t.snap!.node, at);
    const { shown } = fit(t);
    const k = from.width / at.width;
    gsap.set(fly, { ...toward(from, at), clipPath: clipFor(shown, k), willChange: "transform, opacity" });
    const back = el.querySelector("[data-backdrop]");
    gsap.set(back, { willChange: "transform, opacity" });
    const others = tiles.filter((_, j) => j !== i);
    const tl = gsap.timeline({ defaults: { ease: EASE.out } });
    // The others fade back where they stand while the picked one grows to the full
    // board and the canvas zooms in behind it.
    tl.to(others, { opacity: 0, scale: 0.94, duration: 0.4, ease: "power2.in" }, 0)
      .to([...el.querySelectorAll("[data-tile-label]"), el.querySelector("[data-head]"), ring.current], { opacity: 0, duration: DUR.base }, 0)
      .to(fly, { x: 0, y: 0, scale: 1, clipPath: clipFor(1, 1), duration: ZOOM, ease: ZOOM_EASE }, 0)
      .to(back, { opacity: 0, scale: 1.12, duration: ZOOM, ease: ZOOM_EASE }, 0.05);
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      const l = leaving.current;
      if (!l) return;
      l.moved = true;
      if (l.arrived) finish();
    };
    tl.eventCallback("onComplete", land);
    setTimeout(land, 1200);
    if (moved && o.onPick) {
      // The view's own switch stands aside: this zoom is the move.
      turn.quietUntil = performance.now() + 2500;
      o.onPick(t.path);
    } else if (moved) {
      // The board's slide and the arrival motion stand aside: this is the move.
      turn.quietUntil = performance.now() + 2500;
      router.push(t.href);
      // A page that never comes (an error) still lets the overview go.
      setTimeout(() => {
        if (leaving.current?.to === t.path) finish();
      }, 5000);
    }
  }

  // The picked page is there: once the zoom has landed, the copy gives way to it.
  useEffect(() => {
    const l = leaving.current;
    if (!l || l.to !== path) return;
    // One frame on, so the new page is drawn under the copy first.
    const f = requestAnimationFrame(() => {
      l.arrived = true;
      if (hidden.current && !hidden.current.isConnected) hidden.current = null;
      if (l.moved && leaving.current === l) finish();
    });
    return () => cancelAnimationFrame(f);
  }, [path]);

  // Never leave the page hidden: whenever the overview is gone, the page shows.
  useEffect(() => {
    const restore = () => {
      if (hidden.current) hidden.current.style.visibility = "";
      hidden.current = null;
    };
    if (!open) restore();
    return () => {
      if (!live.current.open) restore();
    };
  }, [open]);

  if (!open || !grid) return null;
  return (
    <div
      ref={root}
      data-overview
      role="dialog"
      aria-modal="true"
      aria-label={open.title}
      className="fixed inset-0 z-[90] overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as Element).hasAttribute("data-backdrop")) pick(open.cur);
      }}
    >
      <div data-backdrop className="board absolute inset-0" />
      <div data-head className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-1 pt-[max(1.25rem,12px)] text-center">
        <p className="text-h3 font-semibold text-ink">{open.title}</p>
        <p className="text-caption text-ink-3 max-md:hidden">Click a page to open it · arrows move · Esc goes back</p>
      </div>
      <div
        ref={ring}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-[2] rounded-[calc(var(--radius-lg)+7px)] border-[3px] border-brand shadow-aura"
      />
      {open.tiles.map((t, i) => {
        const c = grid.cells[i];
        const { r, s, ox, oy } = fit(t);
        const clip = open.board;
        return (
          <button
            key={t.path}
            type="button"
            data-tile
            data-still
            aria-label={i === open.cur ? `${t.label}, where you are` : t.label}
            aria-current={i === sel ? "true" : undefined}
            onPointerMove={(e) => {
              const at = `${e.clientX},${e.clientY}`;
              const moved = mouse.current !== "" && mouse.current !== at;
              mouse.current = at;
              if (moved && !leaving.current) setSel(i);
            }}
            onFocus={() => !leaving.current && setSel(i)}
            onClick={() => pick(i)}
            style={{ left: c.left, top: c.top, width: grid.w, height: grid.h }}
            className="absolute text-left outline-none"
          >
            {/* The page's name above it, readable at a glance. */}
            <span
              data-tile-label
              // Above the board's tab, which rises 6% of the picture over it - or, on a board
              // of tabs, a label inside the tab's top-left corner.
              style={open.board ? undefined : { marginBottom: grid.h * 0.06 + 6 }}
              className={
                (open.board
                  ? "pointer-events-none absolute left-[max(0.75rem,8px)] top-[max(0.75rem,8px)] z-[1] flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-pill bg-white px-[max(0.85rem,9px)] py-[max(0.3rem,3px)] text-[max(1rem,12.5px)] shadow-float "
                  : "pointer-events-none absolute inset-x-0 bottom-full flex items-center justify-center gap-2 text-[max(1.15rem,13px)] ") +
                (i === sel ? "font-semibold text-ink" : "font-medium text-ink-2")
              }
            >
              <span className="truncate">{t.label}</span>
              {i === open.cur && <span className="shrink-0 rounded-pill bg-brand-tint px-2.5 py-0.5 text-caption font-medium text-brand-strong">Now</span>}
            </span>
            <span className={clip ? "absolute inset-0 block overflow-hidden rounded-lg shadow-card" : "contents"}>
              <span
                data-slot={t.path}
                className="absolute block origin-top-left"
                style={{ left: ox, top: oy, width: r.width, height: r.height, transform: `scale(${s})` }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
