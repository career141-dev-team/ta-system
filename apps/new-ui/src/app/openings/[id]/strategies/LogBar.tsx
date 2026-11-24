"use client";

import { useEffect, useRef, useState } from "react";
import { shortDate, todayIso, type Proof, type StrategyItem } from "./catalog";
import { CalendarSvg, CheckSvg, CloseSvg, ImageSvg } from "./icons";

const MAX_PROOFS = 5;
const MAX_MB = 5;
const NOTE_MAX = 500;
const PROOF_TYPES = "image/png,image/jpeg,image/webp";

export default function LogBar({
  item,
  lead,
  onPatch,
  onSubmit,
}: {
  item: StrategyItem;
  lead: string;
  onPatch: (p: Partial<StrategyItem>) => void;
  onSubmit: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [popOpen, setPopOpen] = useState(false);
  const [refused, setRefused] = useState<string[]>([]);

  useEffect(() => {
    if (!popOpen) return;
    const onDown = (e: PointerEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setPopOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [popOpen]);

  const edit = (p: Partial<StrategyItem>) => onPatch({ ...p, sent: false });

  const toggleUsed = () => {
    const nextUsed = !item.used;
    edit({
      used: nextUsed,
      doneOn: nextUsed ? item.doneOn ?? todayIso() : item.doneOn,
    });
  };

  const addFiles = (files: Iterable<File>) => {
    let room = MAX_PROOFS - item.proofs.length;
    const rejected: string[] = [];
    const added: Proof[] = [];
    [...files].forEach((f, idx) => {
      if (!PROOF_TYPES.split(",").includes(f.type)) rejected.push(`${f.name} — PNG, JPEG or WebP only`);
      else if (f.size > MAX_MB * 1024 * 1024) rejected.push(`${f.name} — over ${MAX_MB} MB`);
      else if (room <= 0) rejected.push(`${f.name} — ${MAX_PROOFS} pictures at most`);
      else {
        room--;
        added.push({ id: `${Date.now()}-${idx}-${f.name}`, url: URL.createObjectURL(f), name: f.name });
      }
    });
    setRefused(rejected);
    if (added.length) edit({ proofs: [...item.proofs, ...added] });
  };

  const removeProof = (p: Proof) => {
    if (p.url) URL.revokeObjectURL(p.url);
    edit({ proofs: item.proofs.filter((x) => x.id !== p.id) });
  };

  const openDate = () => {
    const el = dateRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        // Fallback to focus/click below.
      }
    }
    el.focus();
    el.click();
  };

  const today = todayIso();
  const proofCount = item.proofs.length;

  return (
    <div
      className="relative shrink-0 pt-[max(0.75rem,8px)]"
      onPaste={(e) => {
        if (e.clipboardData.files.length) {
          addFiles(e.clipboardData.files);
          setPopOpen(true);
        }
      }}
    >
      {/* Floating proofs popover above the picture pill */}
      {popOpen && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Strategy proof pictures"
          className="absolute bottom-full right-0 z-30 mb-3 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-4 shadow-float"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-small font-medium text-ink">
              Pictures ({proofCount}/{MAX_PROOFS})
            </p>
            <button
              type="button"
              onClick={() => setPopOpen(false)}
              aria-label="Close pictures"
              className="flex size-6 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <CloseSvg className="size-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {item.proofs.map((p) => (
              <div key={p.id} className="group relative">
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL for user-picked proof image
                  <img src={p.url} alt={p.name ?? "Proof"} className="h-16 w-20 rounded-sm border border-border object-cover" />
                ) : (
                  <div className="relative h-16 w-20 overflow-hidden rounded-sm border border-border bg-canvas">
                    <div className={"h-3.5 w-full " + (p.tone === "info" ? "bg-info-soft" : "bg-surface-2")} />
                    <div className="mt-2 ml-2 h-1.5 w-11 rounded-xs bg-border-strong opacity-60" />
                    <div className="mt-1.5 ml-2 h-1.5 w-8 rounded-xs bg-border-strong opacity-60" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeProof(p)}
                  aria-label="Remove picture"
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-ink text-white opacity-95 hover:bg-danger"
                >
                  <CloseSvg className="size-2.5" />
                </button>
              </div>
            ))}

            {proofCount < MAX_PROOFS && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addFiles(e.dataTransfer.files);
                }}
                className="flex h-16 w-24 flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border-strong text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <ImageSvg className="size-4" />
                <span className="text-caption font-medium">Add / drop</span>
              </button>
            )}
          </div>

          <p className="mt-2.5 text-caption text-ink-3">PNG, JPEG or WebP · up to {MAX_MB} MB each · paste directly into the bar.</p>
          {refused.length > 0 && (
            <p role="alert" className="mt-1.5 text-caption text-warn">
              Skipped: {refused.join("; ")}
            </p>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={PROOF_TYPES}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* The floating pill matching Figma node "Log what you did" (h=64px, rounded-full, shadow-float) */}
      <div className="flex min-h-[max(4rem,50px)] flex-wrap items-center gap-x-3.5 gap-y-2 rounded-full bg-surface py-2 pl-[max(1.375rem,14px)] pr-[max(0.625rem,8px)] shadow-float max-md:rounded-lg max-md:p-3">
        {/* Toggle: I used it / Used */}
        <button
          type="button"
          role="switch"
          aria-checked={item.used}
          onClick={toggleUsed}
          className="flex shrink-0 items-center gap-2.5 text-small font-medium text-ink"
        >
          <span
            className={
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors " +
              (item.used ? "bg-brand" : "bg-border-strong")
            }
          >
            <span
              className={
                "inline-block size-4 rounded-full bg-surface shadow-xs transition-transform " +
                (item.used ? "translate-x-[18px]" : "translate-x-[2px]")
              }
            />
          </span>
          <span className="whitespace-nowrap">{item.used ? "Used" : "I used it"}</span>
        </button>

        <span className="h-6 w-px shrink-0 bg-border max-md:hidden" aria-hidden="true" />

        {/* Date done */}
        <div className="relative flex shrink-0 items-center">
          <button
            type="button"
            onClick={openDate}
            className={
              "flex items-center gap-2 whitespace-nowrap text-small transition-colors hover:text-ink " +
              (item.doneOn ? "text-ink" : "text-ink-3")
            }
          >
            <CalendarSvg className="size-3.75 shrink-0" />
            <span>{item.doneOn ? `Done ${shortDate(item.doneOn)}` : "Date done"}</span>
          </button>
          <input
            ref={dateRef}
            type="date"
            max={today}
            value={item.doneOn ?? ""}
            aria-label={`Date done for ${item.title}`}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return edit({ doneOn: undefined });
              edit({ doneOn: v > today ? today : v, used: true });
            }}
            className="pointer-events-none absolute inset-0 size-full opacity-0"
            tabIndex={-1}
          />
        </div>

        <span className="h-6 w-px shrink-0 bg-border max-md:hidden" aria-hidden="true" />

        {/* Note input */}
        <input
          type="text"
          value={item.note}
          maxLength={NOTE_MAX}
          onChange={(e) => edit({ note: e.target.value })}
          placeholder="What you did, and any improvement…"
          aria-label={`What you did for ${item.title}`}
          className="min-w-[11rem] flex-1 bg-transparent text-small text-ink outline-none placeholder:text-ink-3 max-md:min-w-full"
        />

        {/* Picture pill */}
        <button
          type="button"
          onClick={() => (proofCount > 0 ? setPopOpen((o) => !o) : fileRef.current?.click())}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
          className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-surface-2 pl-3 pr-3.5 text-[max(0.8125rem,12px)] text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <ImageSvg className="size-3.5 shrink-0" />
          <span>{proofCount === 0 ? "Add picture" : `${proofCount} ${proofCount === 1 ? "picture" : "pictures"}`}</span>
        </button>

        {/* Submit / Submitted button */}
        {item.sent ? (
          <button
            type="button"
            onClick={() => edit({})}
            title="Submitted — edit anything above to submit a new update"
            className="flex h-[max(2.75rem,38px)] shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-brand-soft pl-3.5 pr-4.5 text-[max(0.9375rem,13px)] font-medium text-brand transition-colors hover:bg-brand-soft/80"
          >
            <CheckSvg className="size-3.5" />
            <span>Submitted to {lead}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            className="flex h-[max(2.75rem,38px)] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-ink px-[max(1.375rem,16px)] text-[max(0.9375rem,13px)] font-medium text-white transition-colors hover:bg-black max-md:ml-auto"
          >
            Submit update
          </button>
        )}
      </div>
    </div>
  );
}
