"use client";

import { useRef } from "react";
import type { ProfileCapture } from "@/data/types";

/**
 * "See details": everything the profile reader (or the Chrome extension) took
 * off a LinkedIn profile, in a window - the table row has no room for it.
 */
export function ProfileDetails({ capture, name }: { capture: ProfileCapture; name: string }) {
  const box = useRef<HTMLDialogElement>(null);
  const c = capture;
  const section = (title: string, body: React.ReactNode) => (
    <section className="mt-4">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">{title}</h3>
      <div className="mt-1 text-[13px] leading-relaxed">{body}</div>
    </section>
  );
  return (
    <>
      <button
        type="button"
        onClick={() => box.current?.showModal()}
        className="rounded-full border border-brand-line px-4 py-1.5 text-[12.5px] font-medium text-brand transition-colors hover:bg-brand-soft"
      >
        See details
      </button>
      <dialog
        ref={box}
        onClick={(e) => e.target === box.current && box.current?.close()}
        className="m-auto max-h-[85vh] w-[min(640px,92vw)] overflow-y-auto rounded-2xl border border-rule bg-surface p-6 text-ink shadow-xl backdrop:bg-black/40"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold">{c.fullName || name}</h2>
            {c.headline && <p className="text-[13px] text-ink-soft">{c.headline}</p>}
            <p className="mt-1 text-[12.5px]">
              {[c.currentTitle, c.currentCompany].filter(Boolean).join(" at ")}
              {c.location && <span className="text-ink-soft"> · {c.location}</span>}
            </p>
          </div>
          <button type="button" onClick={() => box.current?.close()} aria-label="Close" className="text-[18px] leading-none text-ink-faint hover:text-ink">
            ×
          </button>
        </div>
        {c.openToWork && <p className="mt-2 inline-block rounded-full bg-brand-soft px-2.5 py-0.5 text-[11.5px] text-brand">Open to work</p>}
        {c.about && section("About", <p className="whitespace-pre-line">{c.about}</p>)}
        {c.experience.length > 0 &&
          section(
            "Experience",
            <ul className="space-y-1.5">
              {c.experience.map((x, i) => (
                <li key={i}>
                  <span className="font-medium">{x.title}</span>
                  {x.company && <span> · {x.company}</span>}
                  {x.dates && <span className="block text-[12px] text-ink-soft">{x.dates}</span>}
                </li>
              ))}
            </ul>,
          )}
        {c.education.length > 0 &&
          section(
            "Education",
            <ul className="space-y-1">
              {c.education.map((x, i) => (
                <li key={i}>
                  {x.school}
                  {x.detail && <span className="text-ink-soft"> · {x.detail}</span>}
                </li>
              ))}
            </ul>,
          )}
        {c.skills.length > 0 &&
          section(
            "Skills",
            <div className="flex flex-wrap gap-1.5">
              {c.skills.map((s) => (
                <span key={s} className="rounded-full border border-rule bg-tag px-2.5 py-0.5 text-[12px]">
                  {s}
                </span>
              ))}
            </div>,
          )}
        {(c.email || c.phone) && section("Contact", <p>{[c.email, c.phone].filter(Boolean).join(" · ")}</p>)}
        <p className="mt-5 text-[11px] text-ink-faint">Read {new Date(c.capturedAt).toLocaleDateString()} from {c.sourceUrl}</p>
      </dialog>
    </>
  );
}
