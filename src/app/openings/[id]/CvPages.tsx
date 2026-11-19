"use client";

import { cvHeaders } from "@/lib/backend";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
    // An old-server CV (D6) goes with the person's session; one plain GET, no ranges.
    p = Promise.all([pdfjs(), cvHeaders(src)]).then(([m, httpHeaders]) =>
      m.getDocument({ url: src, httpHeaders, disableRange: true, disableStream: true }).promise,
    );
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

/** Page 1 of a CV drawn ahead, off screen, before anyone asks for it (a hover on its
 *  card), at about the width the big viewer gives it. The viewer shows it the moment
 *  it opens, so its opening motion never waits on drawing (owner, 17 Nov 2026: "it
 *  takes time and gets stuck"). One per file, kept while the page is open. */
const firsts = new Map<string, Promise<HTMLCanvasElement>>();
export function warmCv(src: string) {
  if (firsts.has(src)) return;
  const p = openPdf(src).then(async (d) => {
    const page = await d.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: ((window.innerWidth * 0.76) / base.width) * (window.devicePixelRatio || 1) });
    const c = document.createElement("canvas");
    c.width = Math.floor(vp.width);
    c.height = Math.floor(vp.height);
    await page.render({ canvas: c, viewport: vp }).promise;
    return c;
  });
  firsts.set(src, p);
  p.catch(() => firsts.delete(src));
}

/** The CV's words, read once per file (for "Ask AURA about this CV"). */
const texts = new Map<string, Promise<string>>();
export function cvText(src: string) {
  let t = texts.get(src);
  if (!t) {
    t = openPdf(src).then(async (d) => {
      const out: string[] = [];
      for (let n = 1; n <= d.numPages; n++) {
        const c = await (await d.getPage(n)).getTextContent();
        out.push(c.items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : " ") : "")).join(""));
      }
      return out.join("\n");
    });
    texts.set(src, t);
    t.catch(() => texts.delete(src));
  }
  return t;
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
export default function CvPages({
  src,
  fit,
  overlay,
  calm = 0,
}: {
  src: string;
  fit: "page" | "width";
  /** Laid over page 1 (the green box). */
  overlay?: ReactNode;
  /** Milliseconds to keep the page free first (an opening motion is running): page 1
   *  is shown from the copy drawn ahead if there is one, everything else is drawn after. */
  calm?: number;
}) {
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
  const calmed = useRef(false);
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
      // Page 1 drawn ahead (warmCv): shown at once, scaled to fit. The rest - and a
      // sharp page 1 - wait until the opening motion is over, so it never stutters.
      // Only the first drawing waits; a later resize (full view) redraws at once.
      const wait = calm && !calmed.current ? calm : 0;
      calmed.current = true;
      const ready = firsts.get(src);
      if (wait && ready) {
        const pre = await ready.catch(() => null);
        const c1 = canvasOf(1);
        if (pre && c1 && !off) {
          c1.width = pre.width;
          c1.height = pre.height;
          c1.getContext("2d")?.drawImage(pre, 0, 0);
          if (!shown.current) {
            shown.current = true;
            gsap.set(root.querySelectorAll("canvas"), { opacity: 1 });
          }
        }
      }
      if (wait) await new Promise((r) => setTimeout(r, wait));
      for (let n = 1; n <= doc.numPages && !off; n++) await draw(n);
    })();
    return () => {
      off = true;
      tasks.forEach((t) => t.cancel());
    };
  }, [doc, size, fit, src, calm]);

  return (
    <div ref={box} className="h-full w-full overflow-y-auto">
      {failed ? (
        <p className="flex h-full items-center justify-center text-[max(0.85rem,12px)] text-ink-2">This CV could not be opened.</p>
      ) : !doc ? (
        // Until the file is read: a blank page of the right shape, so nothing jumps.
        <div className="flex h-full items-start justify-center p-3">
          <div className="aspect-[1/1.414] h-full max-w-full animate-pulse rounded-md bg-surface-3" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          {Array.from({ length: doc.numPages }, (_, i) => {
            const page = (
              <canvas
                key={i}
                data-page={i + 1}
                aria-label={`CV page ${i + 1} of ${doc.numPages}`}
                // Unseen until the first page is drawn; then all fade in together.
                style={{ opacity: 0 }}
                className="rounded-sm bg-white shadow-float"
              />
            );
            // Page 1 always sits in its own frame, so the green box coming or going
            // never rebuilds the drawn page underneath it.
            return i === 0 ? (
              <div key={i} className="relative">
                {page}
                {overlay}
              </div>
            ) : (
              page
            );
          })}
        </div>
      )}
    </div>
  );
}
