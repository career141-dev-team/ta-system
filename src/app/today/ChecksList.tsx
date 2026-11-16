"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DUR, EASE, gsap } from "@/lib/gsap";
import { EXCUSABLE, leftBeforeEod, type Check, type CheckKey } from "./checks";

// Today's Checks for the position chosen in the rail (the old drawer): what is done,
// what is left before its End of day email, each with the view to do it in. An open
// check the old system lets you excuse has "Couldn't do it": a reason the TA Lead
// reads, which can be edited or withdrawn. Placeholder: the lead is told when the
// backend is wired (taskException in the TA System).

export default function ChecksList({
  checks,
  lead,
  onExcuse,
}: {
  checks: Check[];
  lead: string;
  onExcuse: (key: CheckKey, reason: string | undefined) => void;
}) {
  const [writing, setWriting] = useState<CheckKey | null>(null);
  const [words, setWords] = useState("");
  const left = leftBeforeEod(checks).length;
  const sent = checks.some((c) => c.key === "daily_email" && c.done);
  const list = useRef<HTMLUListElement>(null);
  // The list arrives under the position like the rest of the screen: a short rise.
  useEffect(() => {
    if (list.current) gsap.fromTo(list.current, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: DUR.base, ease: EASE.out, clearProps: "opacity,transform" });
  }, [checks.length]);

  const save = (key: CheckKey) => {
    if (!words.trim()) return;
    onExcuse(key, words.trim());
    setWriting(null);
    setWords("");
  };

  return (
    <div className="max-md:rounded-md max-md:bg-surface-2 max-md:p-3">
      <p className="flex flex-wrap items-baseline justify-between gap-x-2 px-[max(0.75rem,8px)] text-[max(0.75rem,11px)] font-medium tracking-[0.06em] text-ink-3">
        TODAY&rsquo;S CHECKS
        <span className={"tracking-normal " + (left && !sent ? "text-warn" : "text-brand")}>{sent ? "EOD sent" : left ? `${left} before EOD` : "Ready for EOD"}</span>
      </p>
      <ul ref={list} className="mt-2 flex flex-col">
        {checks.map((c) => (
          <li key={c.key} className="rounded-sm px-[max(0.75rem,8px)] py-[max(0.4rem,4px)]">
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className={
                  "mt-[0.2em] flex size-[max(1rem,14px)] shrink-0 items-center justify-center rounded-full " +
                  (c.done ? "bg-brand text-white" : c.excuse ? "bg-warn-soft text-warn" : "border-[1.5px] border-border-strong")
                }
              >
                {c.done && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="size-[65%]">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                )}
                {c.excuse && !c.done && <span className="text-[9px] font-bold leading-none">!</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className={"block text-[max(0.875rem,12px)] " + (c.done ? "text-ink-3" : "text-ink")}>
                  <span className="sr-only">{c.done ? "Done: " : c.excuse ? "Excused: " : "To do: "}</span>
                  {c.label}
                </span>
                {!c.done && !c.excuse && <span className="block text-[max(0.75rem,11px)] text-ink-3">{c.todo}</span>}
                {c.excuse && !c.done && (
                  <span className="block text-[max(0.75rem,11px)] text-ink-2">
                    Couldn&rsquo;t do it: {c.excuse}
                    <span className="mt-0.5 flex flex-wrap gap-x-3 whitespace-nowrap">
                      <button type="button" onClick={() => (setWriting(c.key), setWords(c.excuse ?? ""))} className="text-ink-3 hover:text-ink">
                        Edit
                      </button>
                      <button type="button" onClick={() => onExcuse(c.key, undefined)} className="text-ink-3 hover:text-ink">
                        Withdraw
                      </button>
                    </span>
                  </span>
                )}
                {!c.done && !c.excuse && writing !== c.key && (
                  <span className="mt-0.5 flex flex-wrap gap-x-3 whitespace-nowrap text-[max(0.75rem,11px)]">
                    <Link href="/openings/demo" className="font-medium text-brand hover:underline" title={`Open ${c.view}`}>
                      Open {c.view}
                    </Link>
                    {EXCUSABLE.includes(c.key) && (
                      <button type="button" onClick={() => (setWriting(c.key), setWords(""))} className="text-ink-3 hover:text-ink">
                        Couldn&rsquo;t do it
                      </button>
                    )}
                  </span>
                )}
                {writing === c.key && (
                  <span className="mt-1.5 flex flex-col gap-1.5">
                    <textarea
                      autoFocus
                      value={words}
                      onChange={(e) => setWords(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          save(c.key);
                        }
                        if (e.key === "Escape") setWriting(null);
                      }}
                      rows={2}
                      maxLength={1000}
                      placeholder={`Why? ${lead} reads this`}
                      aria-label={`Why ${c.label} could not be done`}
                      className="resize-none rounded-sm border border-border bg-white px-2 py-1.5 text-[max(0.8125rem,11.5px)] text-ink outline-none [field-sizing:content] focus:border-brand"
                    />
                    <span className="flex gap-2">
                      <button type="button" disabled={!words.trim()} onClick={() => save(c.key)} className="rounded-full bg-ink px-3 py-1 text-[max(0.75rem,11px)] font-medium text-white hover:bg-black disabled:opacity-40">
                        Tell {lead}
                      </button>
                      <button type="button" onClick={() => setWriting(null)} className="px-2 py-1 text-[max(0.75rem,11px)] text-ink-3 hover:text-ink">
                        Cancel
                      </button>
                    </span>
                  </span>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
