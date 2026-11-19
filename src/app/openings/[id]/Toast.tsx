"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { DUR, EASE, gsap, useGSAP } from "@/lib/gsap";
import { petSay } from "@/lib/pet";

/** A short notice ("... shortlisted", "... uploaded") - rises, waits, sinks away.
 *  `warn` is for a refusal ("Needs a notice period before Director Review"): amber
 *  mark, and it stays a little longer because it has to be read. Give it a new
 *  `key` each time so the same words can be said twice. */
export default function Toast({ bold, rest, warn }: { bold?: string; rest: string; warn?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  // The pet says it too: it jumps for a done thing and droops for a refusal (19 Nov 2026).
  useEffect(() => void petSay(warn ? "failed" : "done", `${bold ?? ""}${rest}`), [bold, rest, warn]);
  useGSAP(
    (_, contextSafe) => {
      gsap.fromTo(el.current, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: DUR.base, ease: EASE.pop });
      // The wait is real time, not animation time, so it keeps its length when the
      // system asks for less motion (which speeds every tween up).
      const sink = contextSafe!(() => gsap.to(el.current, { y: 20, opacity: 0, duration: DUR.fast, ease: EASE.in }));
      const t = setTimeout(sink, warn ? 4200 : 2600);
      return () => clearTimeout(t);
    },
    { scope: el },
  );
  return createPortal(
    <div
      ref={el}
      role="status"
      className="fixed bottom-[max(4rem,48px)] left-1/2 z-[90] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-[max(1.3rem,14px)] py-[max(0.7rem,8px)] text-[max(0.85rem,12.5px)] text-white shadow-float"
    >
      <span className={"flex size-[1.3em] shrink-0 items-center justify-center rounded-full " + (warn ? "bg-warn" : "bg-success")}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3/5" aria-hidden="true">
          {warn ? <path d="M12 6v7M12 17.5v.5" /> : <path d="m5 12 5 5 9-10" />}
        </svg>
      </span>
      <span>
        {bold && <b className="font-semibold">{bold}</b>}
        {rest}
      </span>
    </div>,
    document.body,
  );
}
