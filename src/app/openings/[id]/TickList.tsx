"use client";

import type { ReactNode } from "react";

/**
 * A Pipeline column's cards. It scrolls like any list: smooth and free, every card
 * at full size (owner, 16 Nov 2026: the one-card-per-notch "tick tick" scroll with
 * shrinking, fading cards "is not good"; it replaced the 12 Nov clock-picker).
 * A little room at the top keeps the first card's shadow from being clipped.
 */
export default function TickList({ children }: { children: ReactNode }) {
  return (
    <div data-col-list className="relative min-h-0 flex-1 space-y-[max(1.25rem,14px)] overflow-y-auto overscroll-contain px-[max(1.25rem,14px)] pb-[max(1rem,10px)] pt-1.5 [scrollbar-width:none]">
      {children}
    </div>
  );
}
