"use client";

import Image from "next/image";
import type { StrategyStatus } from "./catalog";

/** The 28×28 AURA circular badge from the Figma frames (uses the repo's /aura-mark.png). */
export function AuraMark({ className }: { className?: string }) {
  return (
    <span
      className={
        "relative inline-flex size-[max(1.75rem,24px)] shrink-0 items-center justify-center overflow-hidden rounded-full bg-aura-night " +
        (className ?? "")
      }
      aria-hidden="true"
    >
      <Image src="/aura-mark.png" alt="" width={28} height={28} className="size-full object-cover" />
    </span>
  );
}

export function CheckSvg({ className = "size-2.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M2.2 6.3 4.8 8.9 9.8 3.3" />
    </svg>
  );
}

export function SparkSvg({ className = "size-2.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6 1.2 7.15 4.85 10.8 6 7.15 7.15 6 10.8 4.85 7.15 1.2 6 4.85 4.85 6 1.2Z" />
    </svg>
  );
}

export function ChevronRightSvg({ className = "size-3.25" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  );
}

export function ArrowRightSvg({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3.5 8h9m-3.75-3.75L12.5 8l-3.75 3.75" />
    </svg>
  );
}

export function ArrowUpSvg({ className = "size-4.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M10 15.5V4.5m-4.5 4.5L10 4.5l4.5 4.5" />
    </svg>
  );
}

export function FileSvg({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9.5 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V5.5L9.5 2Z" />
      <path d="M9.5 2v3.5H13" />
    </svg>
  );
}

export function MicSvg({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="7.5" y="3" width="5" height="9" rx="2.5" />
      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
    </svg>
  );
}

export function CalendarSvg({ className = "size-3.75" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2" />
      <path d="M5.25 1.75v2.5M10.75 1.75v2.5M2.25 6.75h11.5" />
    </svg>
  );
}

export function ImageSvg({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="2.5" width="12" height="11" rx="2" />
      <circle cx="5.75" cy="6" r="1" fill="currentColor" stroke="none" />
      <path d="m14 10.5-3.2-3.2a1 1 0 0 0-1.4 0L4.5 12.2" />
    </svg>
  );
}

export function PlusSvg({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  );
}

export function CloseSvg({ className = "size-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/** Left-rail & daily-plan status circle matching the exact Figma circles. */
export function StatusGlyph({ status }: { status: StrategyStatus }) {
  if (status === "done") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-white" aria-hidden="true">
        <CheckSvg className="size-2.5" />
      </span>
    );
  }
  if (status === "in_progress" || status === "running") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-brand bg-surface" aria-hidden="true">
        <span className="size-[7px] rounded-full bg-brand" />
      </span>
    );
  }
  if (status === "new") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-soft text-violet" aria-hidden="true">
        <SparkSvg className="size-2.5" />
      </span>
    );
  }
  return <span className="size-5 shrink-0 rounded-full border-[1.5px] border-border-strong bg-surface" aria-hidden="true" />;
}
