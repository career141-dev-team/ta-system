"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOpeningOnWebsite } from "@/app/actions";

/**
 * "On website" (10 Nov): on, career141.com lists the job; off, it is gone.
 * The same switch on the Openings list and on the job's bar. Somebody who may
 * not press it sees only a small "On website" label when the job is listed.
 */
export function WebsiteSwitch({
  openingId,
  listed,
  canPress,
  hidden,
}: {
  openingId: string;
  listed: boolean;
  canPress: boolean;
  /** Listed, but the job is not open, so the website is not showing it. */
  hidden?: string | null;
}) {
  const router = useRouter();
  const [on, setOn] = useState(listed);
  const [error, setError] = useState("");
  const [saving, startTransition] = useTransition();
  useEffect(() => setOn(listed), [listed]);

  if (!canPress) {
    return listed && !hidden ? (
      <span className="rounded-full border border-rule bg-tag px-2 py-[3px] text-[11px] font-medium text-ink-soft">On website</span>
    ) : null;
  }

  const title = error || (hidden && on ? hidden : on ? "Listed on career141.com. Turn off to take it down." : "Not on career141.com. Turn on to list it.");

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={saving}
        title={title}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const next = !on;
          setError("");
          setOn(next);
          startTransition(async () => {
            const fd = new FormData();
            fd.append("openingId", openingId);
            fd.append("listed", next ? "on" : "off");
            const r = await setOpeningOnWebsite(fd).catch(() => ({ ok: false as const, message: "The website switch could not be changed." }));
            if (!r.ok) {
              setOn(!next);
              setError(r.message);
            }
            router.refresh();
          });
        }}
        className="flex items-center gap-1.5 rounded-full border border-rule bg-tag px-2 py-[3px] text-[11px] font-medium text-ink-soft transition-colors hover:border-rule-strong hover:text-ink disabled:opacity-60"
      >
        <span aria-hidden="true" className={`relative h-[12px] w-[22px] shrink-0 rounded-full transition-colors ${on ? (hidden ? "bg-warn" : "bg-brand") : "bg-rule-strong"}`}>
          <span className={`absolute top-[2px] h-[8px] w-[8px] rounded-full bg-white shadow transition-[left] ${on ? "left-[12px]" : "left-[2px]"}`} />
        </span>
        <span className={on ? "text-ink" : ""}>Website</span>
      </button>
      {error && (
        <p role="alert" className="absolute left-0 top-full z-50 mt-1.5 w-[240px] rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-[11px] leading-relaxed text-danger shadow-lg">
          {error}
        </p>
      )}
    </span>
  );
}
