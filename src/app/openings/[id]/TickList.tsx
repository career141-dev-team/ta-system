"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "@/lib/gsap";

/**
 * A column of cards that scrolls like a clock's time picker (owner, 12 Nov 2026):
 * one wheel notch moves exactly one card, and the cards shrink and fade the further
 * they are from the chosen one. The chosen card is the one at the TOP of the column,
 * not the middle: centring the first card left an empty space above every column
 * (owner, same day: "every pipeline top the empty space").
 *
 * Cheap on purpose, because a board has many columns and data grows: the setup runs
 * once (not on every render of the board), each card's place is measured once and
 * kept until the cards change or the column is resized, so scrolling reads no
 * layout at all; a card is only written to when its look changes, and only
 * transform and opacity change, so nothing is laid out again while it moves.
 * The drop slot (`data-slot`) is not a card; while it opens or closes, the
 * places are measured again so the cards below it are sized right.
 */
export default function TickList({ children }: { children: ReactNode }) {
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    // A little room above (for the chosen card's shadow) and enough below the last
    // card that it, too, can come up to the top.
    const TOP = 6;
    let cards: HTMLElement[] = [];
    let tops: number[] = [];
    let height = 0;
    // What each card was last given (0 at the top line .. 1 a column away), so an
    // unchanged card is not written to again.
    let painted = new WeakMap<HTMLElement, number>();
    let active: HTMLElement | null = null;

    const measure = () => {
      cards = (Array.from(el.children) as HTMLElement[]).filter((c) => !c.hasAttribute("data-slot"));
      tops = cards.map((c) => c.offsetTop);
      height = el.clientHeight;
      const last = cards.at(-1);
      el.style.paddingTop = `${TOP}px`;
      el.style.scrollPaddingTop = `${TOP}px`;
      el.style.paddingBottom = `${last ? Math.max(0, height - last.offsetHeight - TOP) : 0}px`;
    };

    // Size, fade and mark each card by its distance from the top line.
    let frame = 0;
    const paint = () => {
      frame = 0;
      const line = el.scrollTop + TOP;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        const d = Math.abs(tops[i] - line);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
        const t = Math.round(Math.min(d / height, 1) * 100) / 100;
        if (painted.get(c) === t) continue;
        painted.set(c, t);
        // A card still landing from a drop keeps its own opacity until it is down.
        // overwrite false: a card's own pop (Undo) is left to finish.
        if (c.dataset.hold) gsap.set(c, { scale: 1 - t * 0.12, overwrite: false });
        else gsap.set(c, { scale: 1 - t * 0.12, opacity: 1 - t * 0.6, overwrite: false });
      }
      const next = cards[best] ?? null;
      if (next !== active) {
        if (active) active.dataset.active = "false";
        if (next) next.dataset.active = "true";
        active = next;
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    // Cards came, went or changed size: measure again and repaint every card.
    const refresh = () => {
      measure();
      painted = new WeakMap();
      onScroll();
    };

    // One notch, one card. A trackpad sends many small deltas, so they add up to a
    // step; while a step is gliding the next one waits, until the scroll ends
    // (with a timer for when it never started: already at the end).
    let sum = 0;
    let busy = false;
    let lock: ReturnType<typeof setTimeout> | undefined;
    const unlock = () => {
      busy = false;
      clearTimeout(lock);
    };
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // sideways belongs to the board
      e.preventDefault();
      if (busy) return;
      sum += e.deltaY;
      if (Math.abs(sum) < 30) return;
      const dir = Math.sign(sum);
      sum = 0;
      const line = el.scrollTop + TOP;
      let i = 0;
      tops.forEach((top, n) => {
        if (Math.abs(top - line) < Math.abs(tops[i] - line)) i = n;
      });
      const next = tops[Math.max(0, Math.min(tops.length - 1, i + dir))];
      if (next === undefined) return;
      busy = true;
      el.scrollTo({ top: next - TOP, behavior: "smooth" });
      lock = setTimeout(unlock, 260);
    };

    measure();
    paint();
    const resize = new ResizeObserver(refresh);
    resize.observe(el);
    // The board re-renders this column's children (a search, a drop, an undo)
    // without running this setup again; this notices.
    const changed = new MutationObserver(refresh);
    changed.observe(el, { childList: true });
    // The drop slot opening or closing moves the cards under it.
    const slot = el.querySelector("[data-slot]");
    if (slot) changed.observe(slot, { attributes: true, attributeFilter: ["style"] });
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", unlock);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(lock);
      resize.disconnect();
      changed.disconnect();
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", unlock);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div
      ref={list}
      className="relative min-h-0 flex-1 snap-y snap-mandatory space-y-[max(0.75rem,9px)] overflow-y-auto px-[max(0.75rem,8px)] [scrollbar-width:none] [&>*]:snap-start [&>*]:transition-[border-color,box-shadow] [&>[data-active=true]]:border-[#bcdccb] [&>[data-active=true]]:shadow-[0_8px_28px_rgba(27,107,71,0.12)]"
    >
      {children}
    </div>
  );
}
