"use client";

import { useEffect, useRef, useState } from "react";
import { DUR, gsap, useExit, useGSAP } from "@/lib/gsap";

/** How a lifted menu or panel sits before it rises and after it sinks. */
export const LIFT_OUT = { opacity: 0, y: -6, scale: 0.97 };

/** A small menu or panel that lifts under its button: opens on a click, closes on
 *  a press outside or Escape, sinks away the way it rose. Rows marked
 *  role="menuitem" arrive one after another. Shared by LinkedIn Job and Research. */
export function useLiftMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const shown = useExit(open, panel, LIFT_OUT);
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
      if (!open || !panel.current) return;
      gsap.fromTo(panel.current, LIFT_OUT, { opacity: 1, y: 0, scale: 1, duration: DUR.fast, transformOrigin: "top right" });
      gsap.from(panel.current.querySelectorAll("[role=menuitem]"), { opacity: 0, y: -4, duration: DUR.fast, stagger: 0.03 });
    },
    { dependencies: [open], scope: root },
  );
  return { open, setOpen, root, panel, shown };
}
