"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DUR, EASE, gsap } from "@/lib/gsap";
import { useRole } from "@/lib/role";
import { PAGES, turn } from "./Board";
import { LINKS } from "./NavLinks";

// The overview (owner, 18 Nov 2026: "like Windows Alt + Tab and Figma's zoom out -
// all my pages together in a zoomed-out view, pick one and it opens in full"). The
// page you are on shrinks back into a grid of every page you have open, each one a
// small picture of how you left it, over the dotted canvas; pick one and it grows
// back into the full board and becomes the real page.
//
// Open it: Alt + ` (hold Alt, press ` again to step, let Alt go to open - Alt + Tab
// itself belongs to Windows and never reaches a web page), or the grid button in the
// top bar. Arrows move, Enter opens, Esc goes back to where you were.
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
const MAX_TILES = 9;

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

/** A picture of the page on screen, kept under its address. */
function take() {
  const main = visibleMain();
  if (!main) return;
  const path = location.pathname;
  const node = document.createElement("div");
  // The board's own look, without its first-load rise (a CSS animation would replay).
  node.className = main.className.replace(/\benter-board\b/g, "");
  for (const c of main.childNodes) node.appendChild(c.cloneNode(true));
  const from = main.querySelectorAll<HTMLElement>("*");
  const to = node.querySelectorAll<HTMLElement>("*");
  const scrolls: Snap["scrolls"] = [];
  from.forEach((el, i) => {
    const c = to[i];
    if (!c) return;
    if (el.scrollTop || el.scrollLeft) scrolls.push([i, el.scrollTop, el.scrollLeft]);
    // A copied canvas comes out blank (the CV pages): paint it, as CvPreview does.
    if (el instanceof HTMLCanvasElement && el.width) (c as HTMLCanvasElement).getContext("2d")?.drawImage(el, 0, 0);
    // Ids kept inside an SVG (its gradients point at them); everywhere else a copy
    // must not answer to the page's own lookups.
    if (!el.closest("svg")) c.removeAttribute("id");
    for (const a of ["data-card-id", "data-panel", "data-board-body", "data-view-stage"]) c.removeAttribute(a);
  });
  node.setAttribute("aria-hidden", "true");
  node.inert = true;
  snaps.delete(path);
  snaps.set(path, { path, href: location.pathname + location.search, label: labelOf(path, main), node, rect: rectOf(main), scrolls });
  while (snaps.size > KEEP) snaps.delete(snaps.keys().next().value!);
}

/** The grid: as many columns as give the biggest pictures, rows centred like Alt + Tab. */
function layout(n: number, W: number, H: number, aspect: number) {
  const pad = Math.max(20, W * 0.04);
  const top = Math.max(64, H * 0.11);
  const label = 30;
  const gap = Math.max(16, W * 0.022);
  const notch = 0.07; // the board's tab rises above it
  let best = { cols: 1, w: 0, h: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const byH = ((H - top - pad - gap * (rows - 1)) / rows - label) / (1 + notch);
    const w = Math.min((W - 2 * pad - gap * (cols - 1)) / cols, byH * aspect);
    if (w > best.w) best = { cols, w, h: w / aspect };
  }
  const { cols, w, h } = best;
  const rows = Math.ceil(n / cols);
  const cellH = h * (1 + notch) + label;
  const y0 = top + (H - top - pad - (rows * cellH + gap * (rows - 1))) / 2;
  return {
    cols,
    w,
    h,
    cells: Array.from({ length: n }, (_, i) => {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, n - row * cols);
      const x0 = (W - (inRow * w + gap * (inRow - 1))) / 2;
      return { left: x0 + (i % cols) * (w + gap), top: y0 + row * (cellH + gap) + h * notch };
    }),
  };
}

const OPEN = "overview:open";

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

type State = { tiles: Tile[]; held: boolean; home: Rect; W: number; H: number };

export default function Overview() {
  const path = usePathname();
  const router = useRouter();
  const role = useRole();
  const [open, setOpen] = useState<State | null>(null);
  const [sel, setSel] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLElement | null>(null);
  const leaving = useRef<{ to: string; moved: boolean; arrived: boolean } | null>(null);
  // Where the mouse last was: a tile moving under a still mouse is not a choice (the
  // shrinking page passed under it and took Alt + `'s pick back).
  const mouse = useRef("");
  const live = useRef({ open, sel, role });
  live.current = { open, sel, role };

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
    const here = location.pathname;
    const seen = [...snaps.values()].reverse();
    const tiles: Tile[] = seen.map((s) => ({ path: s.path, href: s.href, label: s.label, snap: s }));
    // Then the top bar's pages not opened yet, so every page is one pick away.
    for (const [label, href, who] of LINKS) {
      if (tiles.length >= MAX_TILES) break;
      if (who.includes(live.current.role) && !snaps.has(href)) tiles.push({ path: href, href, label });
    }
    tiles.splice(MAX_TILES);
    // The page you are on comes first (it was the last picture taken).
    if (tiles[0]?.path !== here) return;
    mouse.current = "";
    setSel(held && tiles.length > 1 ? 1 : 0);
    setOpen({ tiles, held, home: rectOf(main), W: innerWidth, H: innerHeight });
  };

  // The keys and the button.
  useEffect(() => {
    const onOpen = () => show(false);
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
      const cols = layout(n, o.W, o.H, o.home.width / o.home.height).cols;
      const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
      if (e.key in step) {
        e.preventDefault();
        setSel((s) => Math.min(n - 1, Math.max(0, s + step[e.key])));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick(live.current.sel);
      } else if (e.key === "Escape") {
        e.preventDefault();
        pick(0);
      } else if (e.key === "Tab") {
        e.preventDefault();
        setSel((s) => (s + (e.shiftKey ? -1 : 1) + n) % n);
      }
    };
    // Letting Alt go opens the one picked, as Alt + Tab does.
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt" && live.current.open?.held && !leaving.current) {
        e.preventDefault();
        pick(live.current.sel);
      }
    };
    addEventListener(OPEN, onOpen);
    addEventListener("keydown", down, true);
    addEventListener("keyup", up, true);
    return () => {
      removeEventListener(OPEN, onOpen);
      removeEventListener("keydown", down, true);
      removeEventListener("keyup", up, true);
    };
  });

  const grid = open && layout(open.tiles.length, open.W, open.H, open.home.width / open.home.height);
  /** Each tile's picture: the page at its own size, scaled to fit the cell. */
  const fit = (t: Tile) => {
    const r = t.snap?.rect ?? open!.home;
    const s = Math.min(grid!.w / r.width, grid!.h / r.height);
    return { r, s, ox: (grid!.w - r.width * s) / 2 };
  };
  /** Where a tile must stand to cover `r` exactly (it is drawn at its cell). */
  const cover = (i: number) => {
    const t = open!.tiles[i];
    const { r, s, ox } = fit(t);
    const k = 1 / s;
    const c = grid!.cells[i];
    return { x: r.left - c.left - ox * k, y: r.top - c.top, scale: k };
  };

  // Zooming out: the page you are on shrinks from the full board into its place in
  // the grid while the canvas fades in around it, then the others settle in.
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const el = root.current;
    for (const t of open.tiles) {
      const slot = el.querySelector<HTMLElement>(`[data-slot="${CSS.escape(t.path)}"]`);
      if (!slot || !t.snap) continue;
      const n = t.snap.node;
      Object.assign(n.style, { position: "absolute", left: "0", top: "0", margin: "0", width: `${t.snap.rect.width}px`, height: `${t.snap.rect.height}px`, pointerEvents: "none" });
      slot.appendChild(n);
      const all = n.querySelectorAll<HTMLElement>("*");
      for (const [i, top, left] of t.snap.scrolls) if (all[i]) Object.assign(all[i], { scrollTop: top, scrollLeft: left });
    }
    const tiles = [...el.querySelectorAll<HTMLElement>("[data-tile]")];
    const labels = el.querySelectorAll("[data-tile-label]");
    const back = el.querySelector("[data-backdrop]");
    const head = el.querySelector("[data-head]");
    gsap.set(tiles[0], { ...cover(0), transformOrigin: "0 0" });
    gsap.set(tiles.slice(1), { opacity: 0, y: 14, scale: 0.94, transformOrigin: "50% 50%" });
    gsap.set([labels, head, ring.current], { opacity: 0 });
    gsap.set(back, { opacity: 0 });
    // The real page hides under its own picture, so nothing of it shows twice.
    const main = visibleMain();
    if (main) {
      main.style.visibility = "hidden";
      hidden.current = main;
    }
    const tl = gsap.timeline({ defaults: { ease: EASE.out } });
    tl.to(back, { opacity: 1, duration: DUR.slow, ease: EASE.inOut }, 0)
      .to(tiles[0], { x: 0, y: 0, scale: 1, duration: 0.55, ease: EASE.inOut }, 0)
      .to(tiles.slice(1), { opacity: 1, y: 0, scale: 1, duration: DUR.slow, stagger: 0.035 }, 0.18)
      .to([labels, head], { opacity: 1, duration: DUR.base }, 0.35)
      .to(ring.current, { opacity: 1, duration: DUR.base }, 0.45);
    const done = setTimeout(() => tl.progress(1), 1500);
    // Focus follows the pick (the ring's effect); focusing the first tile here would
    // take Alt + `'s pick back to the page you are on.
    return () => clearTimeout(done);
    // Once per opening; `cover` reads the same state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The ring glides to the picked tile.
  useEffect(() => {
    if (!open || !grid || !ring.current) return;
    const c = grid.cells[sel];
    if (!c) return;
    const box = { x: c.left - 6, y: c.top - 6, width: grid.w + 12, height: grid.h + 12 };
    if (Number(gsap.getProperty(ring.current, "opacity")) < 0.05) gsap.set(ring.current, box);
    else gsap.to(ring.current, { ...box, duration: DUR.base, ease: EASE.out, overwrite: "auto" });
    root.current?.querySelectorAll<HTMLElement>("[data-tile]")[sel]?.focus({ preventScroll: true });
  }, [sel, open, grid]);

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

  // Zooming in: the picked page grows back into the full board, the rest fade, and
  // the real page takes its place the moment it is there.
  function pick(i: number) {
    const o = live.current.open;
    const el = root.current;
    if (!o || !el || leaving.current) return;
    const t = o.tiles[i];
    const moved = t.path !== location.pathname;
    leaving.current = { to: t.path, moved, arrived: !moved };
    setSel(i);
    const tiles = [...el.querySelectorAll<HTMLElement>("[data-tile]")];
    const others = tiles.filter((_, j) => j !== i);
    const tl = gsap.timeline({ defaults: { ease: EASE.out } });
    tl.to([...others, ...el.querySelectorAll("[data-tile-label]"), el.querySelector("[data-head]"), ring.current], { opacity: 0, duration: DUR.fast }, 0)
      .set(tiles[i], { transformOrigin: "0 0", zIndex: 2 }, 0)
      .to(tiles[i], { ...cover(i), duration: 0.5, ease: EASE.inOut }, 0)
      .to(el.querySelector("[data-backdrop]"), { opacity: 0, duration: DUR.slow, ease: EASE.inOut }, 0.05);
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
    setTimeout(land, 900);
    if (moved) {
      // The board's slide and the arrival motion stand aside: this is the move.
      turn.quietUntil = performance.now() + 2500;
      router.push(t.href);
      // A page that never comes (an error) still lets the overview go.
      setTimeout(() => {
        if (leaving.current?.to === t.path) finish();
      }, 5000);
    }
  }

  // The picked page is there: once the zoom has landed, the picture gives way to it.
  useEffect(() => {
    const l = leaving.current;
    if (!l || l.to !== path) return;
    // One frame on, so the new page is drawn under the picture first.
    const f = requestAnimationFrame(() => {
      l.arrived = true;
      if (hidden.current && !hidden.current.isConnected) hidden.current = null;
      if (l.moved && leaving.current === l) finish();
    });
    return () => cancelAnimationFrame(f);
     
  }, [path]);

  // Never leave the page hidden.
  useEffect(
    () => () => {
      if (hidden.current) hidden.current.style.visibility = "";
    },
    [],
  );

  if (!open || !grid) return null;
  return (
    <div
      ref={root}
      data-overview
      role="dialog"
      aria-modal="true"
      aria-label="All pages"
      className="fixed inset-0 z-[90] overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as Element).hasAttribute("data-backdrop")) pick(0);
      }}
    >
      <div data-backdrop className="board absolute inset-0" />
      <div data-head className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-1 pt-[max(1.75rem,16px)] text-center">
        <p className="text-h3 font-semibold text-ink">Your pages</p>
        <p className="text-caption text-ink-3 max-md:hidden">
          Alt + ` next · arrows move · Enter opens · Esc goes back
        </p>
      </div>
      <div
        ref={ring}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 rounded-[calc(var(--radius-lg)+6px)] border-[3px] border-brand shadow-aura"
      />
      {open.tiles.map((t, i) => {
        const c = grid.cells[i];
        const { r, s, ox } = fit(t);
        return (
          <button
            key={t.path}
            type="button"
            data-tile
            data-still
            aria-label={i === 0 ? `${t.label}, this page` : t.label}
            aria-current={i === sel ? "true" : undefined}
            onPointerMove={(e) => {
              const at = `${e.clientX},${e.clientY}`;
              const moved = mouse.current !== "" && mouse.current !== at;
              mouse.current = at;
              if (moved && !leaving.current) setSel(i);
            }}
            onFocus={() => setSel(i)}
            onClick={() => pick(i)}
            style={{ left: c.left, top: c.top, width: grid.w, height: grid.h }}
            className="absolute text-left outline-none"
          >
            <span
              data-slot={t.path}
              className="absolute top-0 block origin-top-left"
              style={{ left: ox, width: r.width, height: r.height, transform: `scale(${s})` }}
            >
              {!t.snap && (
                // A page not opened yet: its empty board, opened when picked.
                <span className="flex size-full flex-col items-center justify-center gap-2 rounded-lg bg-white shadow-card">
                  <span className="text-h2 font-semibold text-ink-2">{t.label}</span>
                  <span className="text-body text-ink-3">Not opened yet</span>
                </span>
              )}
            </span>
            <span
              data-tile-label
              className={
                "absolute inset-x-0 top-full mt-2 flex items-center justify-center gap-2 truncate text-small " +
                (i === sel ? "font-semibold text-ink" : "text-ink-2")
              }
            >
              <span className="truncate">{t.label}</span>
              {i === 0 && <span className="shrink-0 rounded-pill bg-brand-tint px-2 text-caption text-brand-strong">Now</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
