"use client";

import { useEffect, useRef } from "react";
import { DUR, EASE, gsap } from "@/lib/gsap";

/** A number that counts to its value when it first shows and whenever it changes
 *  (owner, 14 Nov 2026: a modern dashboard's numbers move). The final value is in
 *  the markup from the start, and a count that is cut short (React tearing effects
 *  down while something loads) still ends on the true number - never a wrong one
 *  left on screen. A plain effect, not useGSAP, for the same reason. */
export default function Count({ n, className }: { n: number; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const was = useRef(0);
  useEffect(() => {
    const box = { v: was.current };
    was.current = n;
    const show = (v: number) => {
      if (el.current) el.current.textContent = String(Math.round(v));
    };
    const tw = gsap.to(box, { v: n, duration: DUR.slow * 2, ease: EASE.out, onUpdate: () => show(box.v) });
    return () => {
      tw.kill();
      show(n);
    };
  }, [n]);
  return (
    <span ref={el} className={"tabular-nums " + (className ?? "")}>
      {n}
    </span>
  );
}
