"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { DUR, gsap } from "@/lib/gsap";

// One open document per file, kept while the page is open, so going back to a
// candidate shows their CV at once instead of fetching it again.
const docs = new Map<string, Promise<PDFDocumentProxy>>();

// pdf.js is loaded only when a CV is about to be shown, never with the board, and
// always with the worker shipped for its own version (as the TA System does). The
// worker is started once, up front, and every document shares it.
let lib: Promise<typeof import("pdfjs-dist")> | undefined;
const pdfjs = () =>
  (lib ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerPort = new Worker(`/pdfjs/${m.version}/pdf.worker.min.mjs`, { type: "module" });
    return m;
  }));

function openPdf(src: string) {
  let p = docs.get(src);
  if (!p) {
    p = pdfjs().then((m) => m.getDocument({ url: src }).promise);
    docs.set(src, p);
    p.catch(() => docs.delete(src));
  }
  return p;
}

/** Gets a CV ready before it is asked for, so it opens with no wait: with no file,
 *  pdf.js and its worker (a hover on a card, the Scoops tab); with a file, that
 *  file too (the next scoop in the list). Safe to call again and again. */
export function warmPdf(src?: string) {
  (src ? openPdf(src) : pdfjs()).catch(() => {});
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

  // Follow the space it is given, so a page always fits after a resize. The first
  // size is taken at once, so the first page is not kept waiting.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      const take = () => setSize({ w: el.clientWidth, h: el.clientHeight });
      if (first) {
        first = false;
        take();
      } else t = setTimeout(take, 80);
    });
    ro.observe(el);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, []);

  // Every page is given its size first, read from the page itself, so nothing jumps
  // as pages arrive. The first page is drawn first, then the rest. Each is drawn off screen and copied in whole, so a resize never shows a
  // blank page. Sharp on high-density screens.
  const shown = useRef(false);
  useEffect(() => {
    if (!doc || !size.w || !size.h || !box.current) return;
    const root = box.current;
    const tasks: RenderTask[] = [];
    let off = false;
    const ratio = window.devicePixelRatio || 1;
    const canvasOf = (n: number) => root.querySelector<HTMLCanvasElement>(`canvas[data-page="${n}"]`);
    // A fitted page fills the panel edge to edge, with no frame around it (owner,
    // 12 Nov 2026); Scoops then asked for the full width, no side gaps.
    const scaleOf = (page: PDFPageProxy) => {
      const base = page.getViewport({ scale: 1 });
      return fit === "page" ? Math.min(size.w / base.width, size.h / base.height) : size.w / base.width;
    };

    const draw = async (n: number) => {
      const page = await doc.getPage(n);
      const canvas = canvasOf(n);
      if (off || !canvas) return;
      const vp = page.getViewport({ scale: scaleOf(page) * ratio });
      const back = document.createElement("canvas");
      back.width = Math.floor(vp.width);
      back.height = Math.floor(vp.height);
      const task = page.render({ canvas: back, viewport: vp });
      tasks.push(task);
      try {
        await task.promise;
      } catch {
        return; // cancelled by a newer size
      }
      if (off) return;
      canvas.width = back.width;
      canvas.height = back.height;
      canvas.getContext("2d")?.drawImage(back, 0, 0);
      if (n === 1 && !shown.current) {
        shown.current = true;
        gsap.fromTo(root.querySelectorAll("canvas"), { opacity: 0 }, { opacity: 1, duration: DUR.fast });
      }
    };

    // ponytail: the later pages are drawn straight after the first, not when they
    // scroll near. A CV is one to three pages, and a "when seen" watcher left page 2
    // blank in a busy tab (12 Nov 2026). Draw on sight if CVs grow to tens of pages.
    (async () => {
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const canvas = canvasOf(n);
        if (off) return;
        if (!canvas) continue;
        const vp = page.getViewport({ scale: scaleOf(page) });
        canvas.style.width = `${Math.floor(vp.width)}px`;
        canvas.style.height = `${Math.floor(vp.height)}px`;
      }
      for (let n = 1; n <= doc.numPages && !off; n++) await draw(n);
    })();
    return () => {
      off = true;
      tasks.forEach((t) => t.cancel());
    };
  }, [doc, size, fit]);

  return (
    <div ref={box} className="h-full w-full overflow-y-auto [scrollbar-width:thin]">
      {failed ? (
        <p className="flex h-full items-center justify-center text-[max(0.85rem,12px)] text-ink-2">This CV could not be opened.</p>
      ) : !doc ? (
        // Until the file is read: a blank page of the right shape, so nothing jumps.
        <div className="flex h-full items-start justify-center p-3">
          <div className="aspect-[1/1.414] h-full max-w-full animate-pulse rounded-md bg-surface-3" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          {Array.from({ length: doc.numPages }, (_, i) => (
            <canvas
              key={i}
              data-page={i + 1}
              aria-label={`CV page ${i + 1} of ${doc.numPages}`}
              // Unseen until the first page is drawn; then all fade in together.
              style={{ opacity: 0 }}
              className="rounded-sm bg-white shadow-float"
            />
          ))}
        </div>
      )}
    </div>
  );
}
