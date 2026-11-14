"use client";

import { useRef } from "react";
import { DUR, EASE, gsap, useGSAP } from "@/lib/gsap";

/** A number that counts to its value when it first shows and whenever it changes
 *  (owner, 14 Nov 2026: a modern dashboard's numbers move). The final value is in
 *  the markup from the start, so nothing reads wrong if the motion never runs. */
export default function Count({ n, className }: { n: number; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const was = useRef(0);
  useGSAP(
    () => {
      if (!el.current) return;
      const box = { v: was.current };
      was.current = n;
      gsap.to(box, {
        v: n,
        duration: DUR.slow * 2,
        ease: EASE.out,
        onUpdate: () => {
          if (el.current) el.current.textContent = String(Math.round(box.v));
        },
      });
    },
    { dependencies: [n] },
  );
  return (
    <span ref={el} className={"tabular-nums " + (className ?? "")}>
      {n}
    </span>
  );
}
