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
 * Cheap on purpose: one scroll listener per column, at most one update per frame,
 * and only transform and opacity change, so nothing is laid out again while it moves.
 */
export default function TickList({ children }: { children: ReactNode }) {
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const cards = () => Array.from(el.children) as HTMLElement[];

    // A little room above (for the chosen card's shadow) and enough below the last
    // card that it, too, can come up to the top.
    const TOP = 6;
    const pad = () => {
      const last = cards().at(-1);
      el.style.paddingTop = `${TOP}px`;
      el.style.scrollPaddingTop = `${TOP}px`;
      el.style.paddingBottom = `${last ? Math.max(0, el.clientHeight - last.offsetHeight - TOP) : 0}px`;
    };
    // Where a card stands, measured from the top line of the column.
    const gap = (c: HTMLElement) => Math.abs(c.offsetTop - (el.scrollTop + TOP));

    // Size, fade and mark each card by its distance from the top line.
    let frame = 0;
    const paint = () => {
      frame = 0;
      let best: HTMLElement | null = null;
      let bestD = Infinity;
      for (const c of cards()) {
        const d = gap(c);
        const t = Math.min(d / el.clientHeight, 1); // 0 at the top line, 1 a column away
        // A card still landing from a drop keeps its own opacity until it is down.
        if (c.dataset.hold) gsap.set(c, { scale: 1 - t * 0.12 });
        else gsap.set(c, { scale: 1 - t * 0.12, opacity: 1 - t * 0.6 });
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      for (const c of cards()) c.dataset.active = c === best ? "true" : "false";
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };

    // One notch, one card. A trackpad sends many small deltas, so they add up to a
    // step; while a step is gliding the next one waits.
    let sum = 0;
    let busy = false;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // sideways belongs to the board
      e.preventDefault();
      if (busy) return;
      sum += e.deltaY;
      if (Math.abs(sum) < 30) return;
      const dir = Math.sign(sum);
      sum = 0;
      const list = cards();
      let i = 0;
      list.forEach((c, n) => {
        if (gap(c) < gap(list[i])) i = n;
      });
      const next = list[Math.max(0, Math.min(list.length - 1, i + dir))];
      if (!next) return;
      busy = true;
      el.scrollTo({ top: next.offsetTop - TOP, behavior: "smooth" });
      setTimeout(() => (busy = false), 260);
    };

    pad();
    paint();
    const resize = new ResizeObserver(() => {
      pad();
      paint();
    });
    resize.observe(el);
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
    };
  }, [children]);

  return (
    <div
      ref={list}
      className="relative min-h-0 flex-1 snap-y snap-mandatory space-y-[max(0.75rem,9px)] overflow-y-auto px-[max(0.75rem,8px)] [scrollbar-width:none] [&>*]:snap-start [&>*]:transition-[border-color,box-shadow] [&>*]:duration-300 [&>[data-active=true]]:border-[#bcdccb] [&>[data-active=true]]:shadow-[0_8px_28px_rgba(27,107,71,0.12)]"
    >
      {children}
    </div>
  );
}
