"use client";

import Count from "@/app/Count";
import { Fragment, useRef, useSyncExternalStore } from "react";
import Image from "next/image";
import { DUR, EASE, gsap, motionOK, useGSAP } from "@/lib/gsap";
import { USER } from "@/lib/user";

// Placeholder until the backend is wired: the waiting line and the three numbers
// from the design. With the backend they are one small read for this person.
const WAITING = "Four positions and three things are waiting for you.";
const STATS = [
  ["7", "CVs to Director yesterday"],
  ["1", "placement this week"],
  ["4 days", "of full sets in a row"],
] as const;

// The greeting and the date are the viewer's own, read in the browser: the
// static site is built once, so a date fixed at build time would go stale. The
// server draws the design's own words; the browser swaps in today's.
const noop = () => () => {};
function readNow() {
  const now = new Date();
  const h = now.getHours();
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  // "Tuesday, 12 November", as the design writes it.
  const day = (o: Intl.DateTimeFormatOptions) => now.toLocaleDateString("en-GB", o);
  const date = `${day({ weekday: "long" })}, ${day({ day: "numeric", month: "long" })}`;
  return `${part}|${date}`;
}

/** T1 · Today: the greeting, what is waiting, and Start workday over a soft glow.
 *  Start workday opens T2 (TodayScreen). */
export default function Today({ onStart }: { onStart: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [part, date] = useSyncExternalStore(noop, readNow, () => "morning|").split("|");
  const first = USER.name.split(" ")[0];
  const words = `Good ${part}, ${first}`.split(" ");

  // One camera move in: the glow blooms, the date, then the greeting word by word,
  // the line, the button and the numbers last. Transform and opacity only. Then
  // the glow keeps breathing slowly, so the screen feels awake but never busy.
  useGSAP(
    () => {
      const tl = gsap.timeline({ defaults: { ease: EASE.out } });
      tl.from("[data-glow]", { opacity: 0, scale: 0.8, duration: 1.1, ease: "expo.out" })
        .from("[data-date]", { opacity: 0, y: 10, duration: DUR.slow }, 0.1)
        .from("[data-word]", { opacity: 0, yPercent: 60, duration: 0.6, stagger: 0.07, ease: "expo.out" }, 0.18)
        .from("[data-line]", { opacity: 0, y: 12, duration: DUR.slow }, 0.45)
        .from("[data-start]", { opacity: 0, y: 16, scale: 0.94, duration: 0.55, ease: EASE.pop }, 0.55)
        .from("[data-caption]", { opacity: 0, duration: DUR.slow }, 0.75)
        .from("[data-stat]", { opacity: 0, y: 10, duration: DUR.slow, stagger: 0.08 }, 0.8);
      if (motionOK()) {
        gsap.to("[data-glow-a]", { xPercent: 6, yPercent: -4, duration: 6, ease: "sine.inOut", yoyo: true, repeat: -1 });
        gsap.to("[data-glow-b]", { xPercent: -5, yPercent: 5, duration: 7, ease: "sine.inOut", yoyo: true, repeat: -1 });
      }
    },
    { scope: root },
  );

  return (
    // The greeting sits centred in the space above the numbers; the numbers are in
    // the flow under it, not pinned to the bottom edge, so on a short phone screen
    // they never run into the caption and the card scrolls instead (13 Nov 2026).
    <div ref={root} className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto overflow-x-hidden px-6 [scrollbar-width:none]">
      {/* The glow: a violet, a blue and a green light behind the button, drawn with
          gradients alone (no blur filter), so it costs the browser almost nothing. */}
      <div data-glow aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[64%] h-[78%] w-[62%] -translate-x-1/2 -translate-y-1/2">
        <div data-glow-a className="absolute inset-y-0 left-0 w-[60%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-aura-1)_30%,transparent),transparent)]" />
        <div className="absolute inset-y-[8%] left-[25%] w-[50%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-aura-2)_22%,transparent),transparent)]" />
        <div data-glow-b className="absolute inset-y-0 right-0 w-[60%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-aura-3)_28%,transparent),transparent)]" />
      </div>

      <div className="relative my-auto flex flex-col items-center py-6 text-center">
        <p data-date className="min-h-[1.5em] text-[max(0.875rem,12px)] text-ink-3">
          {date}
        </p>
        <h1 className="mt-[max(1.25rem,8px)] text-display font-light text-ink">
          {/* Each word rises from behind its own edge. The space sits between the
              words, outside them: inside an inline-block it was dropped. */}
          {words.map((w, i) => (
            <Fragment key={i}>
              {i > 0 && " "}
              <span className="inline-block overflow-hidden pb-[0.08em] align-bottom">
                <span data-word className="inline-block">
                  {w}
                </span>
              </span>
            </Fragment>
          ))}
        </h1>
        <p data-line className="mt-[max(1.25rem,8px)] text-[max(1.125rem,14px)] text-ink-2">
          {WAITING}
        </p>

        <button
          type="button"
          data-start
          onClick={onStart}
          className="group mt-[max(4rem,22px)] flex h-[max(4.75rem,52px)] items-center gap-[max(1rem,10px)] rounded-full bg-ink pl-[max(0.625rem,7px)] pr-[max(2.125rem,20px)] text-[max(1.3125rem,16px)] font-medium text-white shadow-[0_18px_40px_-12px_rgba(15,23,31,0.45)] transition-[scale,box-shadow] hover:shadow-[0_22px_48px_-12px_rgba(15,23,31,0.55)]"
        >
          <span className="flex size-[max(3.5rem,38px)] shrink-0 items-center justify-center overflow-hidden rounded-full bg-black">
            <Image src="/aura-mark.png" alt="" width={56} height={56} priority className="size-full" />
          </span>
          Start workday
        </button>
        <p data-caption className="mt-[max(1.75rem,12px)] text-[max(0.875rem,12px)] text-ink-3">
          AURA will brief you and plan the day with you.
        </p>
      </div>

      <ul className="relative mb-[max(3.5rem,18px)] flex shrink-0 flex-wrap items-baseline justify-center gap-x-[max(2.5rem,18px)] gap-y-1">
        {STATS.map(([n, label]) => (
          <li key={label} data-stat className="flex items-baseline gap-[max(0.5rem,6px)]">
            <span className="text-[max(1rem,14px)] font-medium text-ink">
              <Count n={parseInt(n)} />
              {n.replace(/^\d+/, "")}
            </span>
            <span className="text-[max(0.875rem,12px)] text-ink-3">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
