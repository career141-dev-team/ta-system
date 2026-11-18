"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";
import { createPortal } from "react-dom";
import { DUR, gsap, useGSAP } from "@/lib/gsap";
import { STAGES, type Verdict } from "./pipelineRules";

const label = (to: string, from: string, v: Verdict) =>
  !v.ok || !v.needs
    ? "Move to " + to
    : v.needs === "interview"
      ? "Book interview…"
      : v.needs === "offer"
        ? "Make offer…"
        : v.needs === "placement"
          ? "Record placement…"
          : to === "Rejected"
            ? "Reject…"
            : from === "Offer"
              ? "Declined the offer…"
              : "Dropped out…";

/**
 * The card's ⋮ menu (FLOW-CHECK 2.8, 2.15): where this candidate may go next -
 * each stage the TA System allows from here, a refused one greyed with the reason
 * - and the Add-on and Backup marks. It is also how a card moves on a phone or
 * tablet, where a finger scrolls and cannot carry a card. Opens beside the button,
 * above it when there is no room below.
 */
export default function CardMenu({
  ref: root,
  at,
  name,
  from,
  moves,
  addOn,
  backup,
  onMove,
  onToggle,
  onShortlist,
  onAddToJob,
  onClose,
}: {
  ref: RefObject<HTMLDivElement | null>;
  /** The ⋮ button's box, in the window. */
  at: DOMRect;
  name: string;
  from: string;
  moves: { name: string; verdict: Verdict }[];
  addOn: boolean;
  backup: boolean;
  onMove: (to: string) => void;
  onToggle: (mark: "addOn" | "backup") => void;
  /** Set for a candidate nobody owns yet: Shortlist is then the only action, as on
   *  the TA System's row (it claims them and puts them in TA Follow-Up). */
  onShortlist?: () => void;
  onAddToJob: () => void;
  onClose: () => void;
}) {
  // Placed before the first paint, so it never flashes in the wrong corner.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(at.right - w, window.innerWidth - w - 8));
    const below = at.bottom + 6;
    el.style.left = left + "px";
    el.style.top = (below + h > window.innerHeight - 8 ? Math.max(8, at.top - h - 6) : below) + "px";
  }, [at, root]);

  useGSAP(
    () => {
      gsap.from(root.current, { opacity: 0, y: -6, scale: 0.97, duration: DUR.fast, transformOrigin: "top right" });
    },
    { scope: root },
  );

  // Away click, Escape, or the board scrolling under it: the menu goes.
  useEffect(() => {
    const away = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", away);
    document.addEventListener("wheel", away, { passive: true });
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("wheel", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose, root]);

  const ITEM = "flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left";
  return createPortal(
    <div
      ref={root}
      role="menu"
      aria-label={`Actions for ${name}`}
      className="fixed z-[75] w-[max(16rem,220px)] rounded-md border border-border bg-surface p-1.5 shadow-float"
    >
      {onShortlist && (
        <button type="button" role="menuitem" onClick={onShortlist} className={ITEM + " hover:bg-surface-2"}>
          <span aria-hidden="true" className="size-[max(0.5rem,7px)] shrink-0 rounded-full bg-info" />
          <span className="min-w-0 flex-1">
            <span className="block text-nav font-semibold text-ink">Shortlist</span>
            <span className="block text-pill text-ink-2">Yours from now on, in TA Follow-Up.</span>
          </span>
        </button>
      )}
      {!onShortlist && moves.map(({ name: to, verdict }) => {
        const dot = STAGES.find((s) => s.name === to)?.dot;
        return (
          <button
            key={to}
            type="button"
            role="menuitem"
            aria-disabled={!verdict.ok}
            onClick={() => onMove(to)}
            className={ITEM + (verdict.ok ? " hover:bg-surface-2" : " cursor-not-allowed")}
          >
            <span aria-hidden="true" className={"size-[max(0.5rem,7px)] shrink-0 rounded-full " + (verdict.ok ? "" : "opacity-40")} style={{ background: dot }} />
            <span className="min-w-0 flex-1">
              <span className={"block text-nav font-semibold " + (verdict.ok ? "text-ink" : "text-ink-2/70")}>{label(to, from, verdict)}</span>
              {!verdict.ok && <span className="block text-pill text-ink-2">{verdict.why}</span>}
            </span>
          </button>
        );
      })}
      {!onShortlist && <div className="mx-2 my-1.5 h-px bg-border" />}
      {!onShortlist && (
        [
          ["addOn", "Add-on", addOn],
          ["backup", "Backup", backup],
        ] as const
      ).map(([key, text, on]) => (
        <button key={key} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => onToggle(key)} className={ITEM + " hover:bg-surface-2"}>
          <span className="min-w-0 flex-1 text-nav font-semibold text-ink">{text}</span>
          {on && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="size-[max(0.9rem,12px)] shrink-0 text-brand" aria-hidden="true">
              <path d="m5 12 5 5 9-10" />
            </svg>
          )}
        </button>
      ))}
      <div className="mx-2 my-1.5 h-px bg-border" />
      <button type="button" role="menuitem" onClick={onAddToJob} className={ITEM + " hover:bg-surface-2"}>
        <span className="min-w-0 flex-1 text-nav font-semibold text-ink">Add to another job…</span>
      </button>
    </div>,
    document.body,
  );
}
