"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DUR, EASE, gsap, useGSAP } from "@/lib/gsap";

const MAX_MB = 10; // same limit the offer-letter upload in MoveForm uses
const OK = /\.(pdf|docx?)$/i;

/**
 * "Add candidate": the person picks or drops a CV. Sample data: nothing is stored
 * or read; the name of the file is handed back. With the backend, `onAdd` posts it.
 */
export default function AddCandidate({ onClose, onAdd }: { onClose: () => void; onAdd: (file: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const error = file && (!OK.test(file.name) ? "Use a PDF or Word file." : file.size > MAX_MB * 1048576 ? `The CV must be under ${MAX_MB} MB.` : "");

  useGSAP(
    () => {
      gsap.from("[data-veil]", { opacity: 0, duration: DUR.fast });
      gsap.from("[data-box]", { opacity: 0, y: 14, scale: 0.94, duration: DUR.base, ease: EASE.pop });
    },
    { scope: root },
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  return createPortal(
    <div ref={root} className="fixed inset-0 z-[80] flex items-center justify-center">
      <div data-veil className="absolute inset-0 bg-black/15 backdrop-blur-[2px]" onClick={onClose} />
      <form
        data-box
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (file && !error) onAdd(file.name);
        }}
        className="relative w-[max(28rem,330px)] max-w-[calc(100vw-24px)] rounded-lg bg-white p-[max(1.6rem,20px)] shadow-float"
      >
        <h2 id="add-title" className="text-[max(1.05rem,15px)] font-semibold text-ink">
          Add candidate
        </h2>
        <p className="mt-1 text-[max(0.8625rem,12.5px)] text-ink-2">Upload their CV (PDF or Word, under {MAX_MB} MB).</p>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            setFile(e.dataTransfer.files?.[0] ?? null);
          }}
          className={
            "mt-[max(1.2rem,14px)] flex cursor-pointer flex-col items-center gap-1 rounded-md border-[1.5px] border-dashed px-4 py-[max(1.6rem,18px)] text-center text-[max(0.9125rem,13.5px)] text-ink-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/30 " +
            (over ? "border-brand bg-brand-tint" : "border-border-strong hover:bg-surface-2")
          }
        >
          <span className="font-medium text-ink">{file ? file.name : "Drop a CV here, or choose a file"}</span>
          {file && <span>{(file.size / 1048576).toFixed(1)} MB</span>}
          <input type="file" accept=".pdf,.doc,.docx" autoFocus className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {error && <p role="alert" className="mt-2 text-[max(0.8625rem,12.5px)] text-danger">{error}</p>}

        <div className="mt-[max(1.4rem,16px)] flex justify-end gap-[max(0.6rem,8px)]">
          <button
            type="button"
            onClick={onClose}
            className="h-[max(2.4rem,33px)] rounded-full border border-border px-[max(1.2rem,15px)] text-[max(0.9125rem,13.5px)] text-ink hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!file || !!error}
            className="h-[max(2.4rem,33px)] rounded-full bg-brand px-[max(1.4rem,17px)] text-[max(0.9125rem,13.5px)] font-medium text-white hover:bg-brand-strong disabled:opacity-40"
          >
            Add candidate
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
