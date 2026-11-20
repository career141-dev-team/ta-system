"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DUR, gsap } from "@/lib/gsap";
import { LIFT_OUT } from "../openings/[id]/liftMenu";
import { TAS, TODAY, busy, ta, whenLabel, type Row, type TaId } from "./data";

/** A TA's two letters, read from the name: the id a live TA carries is a long code, never
 *  something to draw (owner, 20 Nov 2026: it printed over the card). */
export const lettersOf = (name: string) => {
  const w = name.replace(/[.]/g, " ").split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase() || "?";
};

/** A TA's initials in their colour. `ring` = given, not accepted yet (amber ring). */
export function Initials({ id, ring, size = "md" }: { id: TaId; ring?: boolean; size?: "sm" | "md" }) {
  const s = size === "sm" ? "size-[max(1.75rem,22px)] text-[max(0.6875rem,9.5px)]" : "size-[max(2.25rem,28px)] text-caption";
  const t = TAS.find((x) => x.id === id);
  return (
    <span
      title={t?.name ?? ""}
      className={"flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold " + s + " " + (ring ? "border-2 border-warn bg-surface text-warn" : t?.chip ?? "bg-surface-2 text-ink-2")}
    >
      {t ? lettersOf(t.name) : "?"}
    </span>
  );
}

/** The on/off switch: green and round, as drawn. */
export function Toggle({ on, onChange, label, disabled, title }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; title?: string }) {
  const knob = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (knob.current) gsap.to(knob.current, { x: on ? "100%" : 0, duration: DUR.fast, ease: "back.out(2)" });
  }, [on]);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={"relative flex h-[max(1.75rem,22px)] w-[max(2.875rem,38px)] shrink-0 items-center rounded-full p-[3px] transition-colors disabled:opacity-60 " + (on ? "bg-brand" : "bg-surface-3")}
    >
      <span ref={knob} className="block aspect-square h-full rounded-full bg-surface shadow-card" />
    </button>
  );
}

export const CalendarIcon = ({ className = "size-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);
export const CheckIcon = ({ className = "size-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="m5 12 5 5 9-10" />
  </svg>
);

export type Assign = { ta: TaId; when: string; days?: [number, number] };

/** Who and when for one strategy on one job (the matrix cell's panel, also opened from
 *  a strategy row's TA or day chip). Lifts beside what opened it; a press outside or
 *  Escape closes it. Not for this job / Use again strike or bring back the strategy. */
export function AssignPanel({
  anchor,
  name,
  jobTitle,
  row,
  extra = {},
  onAssign,
  onStrike,
  onRemove,
  onClose,
}: {
  anchor: DOMRect;
  name: string;
  jobTitle: string;
  row?: Row;
  /** Strategies already added to each TA in this plan, on top of their week. */
  extra?: Partial<Record<TaId, number>>;
  onAssign: (a: Assign) => void;
  onStrike: (na: boolean) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [who, setWho] = useState<TaId | undefined>(row?.ta);
  const next: [number, number] = [TODAY + 1, TODAY + 2];
  const [when, setWhen] = useState<Assign>({ ta: "DR", when: row?.when ?? "Today", days: row?.days ?? [TODAY, TODAY] });
  const [pos, setPos] = useState({ left: -9999, top: 0 });
  const date = useRef<HTMLInputElement>(null);

  // Beside the cell, on whichever side has room, and kept inside the window.
  useLayoutEffect(() => {
    const p = el.current!.getBoundingClientRect();
    const right = anchor.right + 14 + p.width < innerWidth - 8;
    const left = innerWidth < 640 ? (innerWidth - p.width) / 2 : right ? anchor.right + 14 : Math.max(8, anchor.left - 14 - p.width);
    setPos({ left, top: Math.min(Math.max(8, anchor.top - 24), innerHeight - p.height - 8) });
    gsap.fromTo(el.current, LIFT_OUT, { opacity: 1, y: 0, scale: 1, duration: DUR.fast });
  }, [anchor]);
  useEffect(() => {
    const away = (e: PointerEvent) => !el.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const t = setTimeout(() => document.addEventListener("pointerdown", away));
    document.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const struck = row?.state === "na";
  const locked = row?.state === "working" || row?.state === "done";
  const chip = (on: boolean) =>
    "rounded-full px-[max(1rem,11px)] py-[max(0.5rem,6px)] text-small transition-colors " + (on ? "bg-ink text-white" : "border border-border-strong text-ink-2 hover:bg-surface-2");

  return createPortal(
    <div
      ref={el}
      role="dialog"
      aria-label={`${name} on ${jobTitle}`}
      style={{ left: pos.left, top: pos.top, opacity: 0 }}
      className="fixed z-[80] w-[max(23.75rem,290px)] max-w-[calc(100vw-16px)] rounded-lg bg-surface p-[max(1.375rem,16px)] shadow-float"
    >
      <h3 className="text-h3 font-medium text-ink">{name}</h3>
      <p className="truncate text-small text-ink-3">{jobTitle}</p>
      {struck ? (
        <p className="mt-4 text-small text-ink-2">Struck for this job. TAs see it crossed out.</p>
      ) : locked ? (
        <p className="mt-4 text-small text-ink-2">
          {ta(row!.ta!).name} {row!.state === "done" ? "has done and submitted it." : "accepted it and is working on it."}
        </p>
      ) : (
        <>
          <p className="mt-4 mb-2 text-caption font-medium uppercase text-ink-3">Who</p>
          <div className="flex flex-col gap-1">
            {TAS.map((t) => {
              const n = t.week + (extra[t.id] ?? 0);
              const full = busy({ ...t, week: n });
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setWho(t.id)}
                  className={"flex items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors " + (who === t.id ? "bg-brand-soft" : "hover:bg-surface-2")}
                >
                  <Initials id={t.id} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-small font-medium text-ink">{t.name}</span>
                    <span className={"block text-caption " + (full ? "text-danger" : "text-ink-3")}>
                      {n} this week{full ? " · busy" : n <= 3 ? " · has room" : ""}
                    </span>
                  </span>
                  {who === t.id && (
                    <span className="flex size-6 items-center justify-center rounded-full bg-brand text-white">
                      <CheckIcon className="size-3.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-4 mb-2 text-caption font-medium uppercase text-ink-3">When</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(when.when === "Today")} onClick={() => setWhen({ ...when, when: "Today", days: [TODAY, TODAY] })}>
              Today
            </button>
            <button type="button" className={chip(when.when === whenLabel(...next))} onClick={() => setWhen({ ...when, when: whenLabel(...next), days: next })}>
              {whenLabel(...next)}
            </button>
            <label className={chip(!["Today", whenLabel(...next)].includes(when.when)) + " relative cursor-pointer"}>
              {["Today", whenLabel(...next)].includes(when.when) ? "Pick a date" : when.when}
              {/* The browser's own date picker, laid over the chip. */}
              <input
                ref={date}
                type="date"
                aria-label="Pick a date"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(e) => {
                  if (!e.target.value) return;
                  const d = new Date(e.target.value + "T00:00");
                  const label = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
                  const i = [11, 12, 13, 14, 15].indexOf(d.getDate());
                  setWhen({ ...when, when: label, days: d.getMonth() === 10 && i >= 0 ? [i, i] : undefined });
                }}
              />
            </label>
          </div>
        </>
      )}
      <div className="mt-5 flex items-center gap-3">
        <button type="button" onClick={() => onStrike(!struck)} className="text-small text-ink-3 hover:text-ink">
          {struck ? "Use again" : "Not for this job"}
        </button>
        {onRemove && row && !struck && !locked && (
          <button type="button" onClick={onRemove} className="text-small text-ink-3 hover:text-danger">
            Take off
          </button>
        )}
        {!struck && !locked && (
          <button
            type="button"
            disabled={!who}
            title={who ? undefined : "Pick who does it first"}
            onClick={() => who && onAssign({ ...when, ta: who })}
            className="ml-auto rounded-full bg-ink px-[max(1.25rem,14px)] py-[max(0.625rem,7px)] text-small font-medium text-white transition-colors hover:bg-black disabled:opacity-40"
          >
            Assign
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
