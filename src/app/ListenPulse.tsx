"use client";

import { useRef } from "react";
import { gsap, useGSAP, motionOK } from "@/lib/gsap";

/** Rings that swell out from a mic button while it listens (put inside a `relative` button).
 *  Reduced motion: one steady soft ring instead. */
export default function ListenPulse() {
  const root = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      if (!motionOK()) return;
      gsap.fromTo(
        root.current!.children,
        { scale: 1, opacity: 0.5 },
        { scale: 2.2, opacity: 0, duration: 1.4, ease: "power1.out", repeat: -1, stagger: 0.7 },
      );
    },
    { scope: root },
  );
  return (
    <span ref={root} aria-hidden="true" className="pointer-events-none absolute inset-0">
      <span className="absolute inset-0 rounded-full bg-current opacity-20" />
      <span className="absolute inset-0 rounded-full bg-current opacity-20" />
    </span>
  );
}
