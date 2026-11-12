"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { gsap } from "@/lib/gsap";

// One open document per file, kept while the page is open, so going back to a
// candidate shows their CV at once instead of fetching it again.
const docs = new Map<string, Promise<PDFDocumentProxy>>();

/** pdf.js is loaded only when a CV is first shown, never with the board, and
 *  always with the worker shipped for its own version (as the TA System does). */
function openPdf(src: string) {
  let p = docs.get(src);
  if (!p) {
    p = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/${pdfjs.version}/pdf.worker.min.mjs`;
      return pdfjs.getDocument({ url: src }).promise;
    });
    docs.set(src, p);
    p.catch(() => docs.delete(src));
  }
  return p;
}

/**
 * A candidate's real CV file, page by page (owner, 12 Nov 2026: show the
 * candidate's own CV, not a designed stand-in; "the first page need to be showing
 * at one glance; if the CV has more pages, they will scroll").
 *
 * fit "page": every page is scaled so a WHOLE page fits the space, so the first
 * page is seen in one glance and later pages are a scroll away.
 * fit "width": pages fill the width, for the big viewer.
 *
 * Give it `key={src}` so a new file starts clean.
 */
export default function CvPages({ src, fit }: { src: string; fit: "page" | "width" }) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let off = false;
    openPdf(src).then(
      (d) => !off && setDoc(d),
      () => !off && setFailed(true),
    );
    return () => {
      off = true;
    };
  }, [src]);

  // Follow the space it is given, so a page always fits after a resize.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => setSize({ w: el.clientWidth, h: el.clientHeight }), 80);
    });
    ro.observe(el);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, []);

  // Draw every page at the fitted size, sharp on high-density screens.
  const shown = useRef(false);
  useEffect(() => {
    if (!doc || !size.w || !size.h || !box.current) return;
    const root = box.current;
    const tasks: RenderTask[] = [];
    let off = false;
    (async () => {
      // A fitted page fills the panel edge to edge, with no frame around it (owner, 12 Nov 2026); Scoops then asked for the full width, no side gaps.
      const pad = 0;
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        if (off) return;
        const base = page.getViewport({ scale: 1 });
        const scale =
          fit === "page"
            ? Math.min((size.w - pad * 2) / base.width, (size.h - pad * 2) / base.height)
            : (size.w - pad * 2) / base.width;
        const ratio = window.devicePixelRatio || 1;
        const vp = page.getViewport({ scale: scale * ratio });
        const canvas = root.querySelector<HTMLCanvasElement>(`canvas[data-page="${n}"]`);
        if (!canvas) continue;
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = `${Math.floor(vp.width / ratio)}px`;
        canvas.style.height = `${Math.floor(vp.height / ratio)}px`;
        const task = page.render({ canvas, viewport: vp });
        tasks.push(task);
        try {
          await task.promise;
        } catch {
          return; // cancelled by a newer size
        }
        if (n === 1 && !shown.current) {
          shown.current = true;
          gsap.fromTo(root.querySelectorAll("canvas"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.08, ease: "power2.out" });
        }
      }
    })();
    return () => {
      off = true;
      tasks.forEach((t) => t.cancel());
    };
  }, [doc, size, fit]);

  return (
    <div ref={box} className="h-full w-full overflow-y-auto [scrollbar-width:thin]">
      {failed ? (
        <p className="flex h-full items-center justify-center text-[max(0.85rem,12px)] text-muted">This CV could not be opened.</p>
      ) : !doc ? (
        // Until the file is read: a blank page of the right shape, so nothing jumps.
        <div className="flex h-full items-start justify-center p-3">
          <div className="aspect-[1/1.414] h-full max-w-full animate-pulse rounded-md bg-[#eef0f3]" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          {Array.from({ length: doc.numPages }, (_, i) => (
            <canvas
              key={i}
              data-page={i + 1}
              aria-label={`CV page ${i + 1} of ${doc.numPages}`}
              className="rounded-sm bg-white shadow-[0_6px_24px_rgba(0,0,0,0.10)]"
            />
          ))}
        </div>
      )}
    </div>
  );
}
