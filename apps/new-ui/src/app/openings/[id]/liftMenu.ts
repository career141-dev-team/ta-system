"use client";

import { useEffect, useRef, useState } from "react";
import { DUR, EASE, gsap, useExit, useGSAP } from "@/lib/gsap";

/** How a lifted menu or panel sits before it rises and after it sinks. */
export const LIFT_OUT = { opacity: 0, y: -6, scale: 0.97 };

/** A small menu or panel that lifts under its button: opens on a click, closes on
 *  a press outside or Escape, sinks away the way it rose. Rows marked
 *  role="menuitem" arrive one after another. Shared by LinkedIn Job and Research. */
export function useLiftMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Which way it opens (28 Nov 2026): a menu above its button (Database filters, the
  // person panel's job menu) dropped DOWN onto the button from above. It now rises from
  // the button's edge and sinks back into it, whichever side it opens on.
  const dir = useRef({ up: false, left: false });
  const [outOf] = useState(() => () => ({ ...LIFT_OUT, y: dir.current.up ? 6 : -6, transformOrigin: `${dir.current.up ? "bottom" : "top"} ${dir.current.left ? "left" : "right"}` }));
  const shown = useExit(open, panel, outOf);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  useGSAP(
    () => {
      if (!open || !panel.current || !root.current) return;
      const p = panel.current.getBoundingClientRect();
      const r = root.current.getBoundingClientRect();
      const up = p.bottom <= r.top + 1;
      const left = Math.abs(p.left - r.left) < Math.abs(p.right - r.right);
      dir.current = { up, left };
      gsap.fromTo(panel.current, outOf(), { opacity: 1, y: 0, scale: 1, duration: DUR.fast, ease: EASE.out });
      gsap.from(panel.current.querySelectorAll("[role=menuitem]"), { opacity: 0, y: up ? 4 : -4, duration: DUR.fast, stagger: 0.03 });
    },
    { dependencies: [open], scope: root },
  );
  return { open, setOpen, root, panel, shown };
}
