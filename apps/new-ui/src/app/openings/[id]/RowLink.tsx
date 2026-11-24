"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOpeningView, type WorkView } from "./view";
import { warmPdf } from "./CvPages";
import { DUR, EASE, gsap } from "@/lib/gsap";

const ROW = "flex h-18.25 w-full items-center px-2 text-left text-row md:h-full ";
const ON = "font-semibold text-brand";
// Green only under the pointer (or keyboard focus), on every row of both columns -
// no row starts green (owner, 12 Nov 2026: "no need to initially show the pipeline
// as a green colour... if I hover over any links... that need to be green"; 17 Nov:
// "more darker green" - the strong brand green; then "more darker" again - the thin
// text also firms up to medium weight, so it reads darker, not just greener).
const OFF =
  "font-light text-ink-2 transition-[color,translate,font-weight] hover:translate-x-1 hover:font-medium hover:text-brand-strong focus-visible:font-medium focus-visible:text-brand-strong";

/** A row of the opening card. An ATS row (`view`) opens its work view in place,
 *  without leaving the page; a Headhunting row is still a link, green while its
 *  own page is open. */
export default function RowLink({
  href,
  view,
  children,
}: {
  href: string;
  view?: WorkView;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { go, view: shown, from } = useOpeningView();
  const ref = useRef<HTMLButtonElement>(null);
  // Back brings you to this page from the view you were in: its row comes into sight
  // (a phone stacks Headhunting under ATS) and glows green for a moment, then settles
  // back - no row stays green (owner, 12 Nov 2026).
  const cameFrom = !!view && shown === "overview" && from === view;
  useEffect(() => {
    const el = ref.current;
    if (!cameFrom || !el) return;
    el.scrollIntoView({ block: "nearest" });
    const tw = gsap.fromTo(
      el,
      { color: "var(--color-brand-strong)", fontWeight: 500 },
      { color: "var(--color-ink-2)", fontWeight: 300, duration: DUR.slow, delay: 0.9, ease: EASE.out, clearProps: "color,fontWeight" },
    );
    return () => void tw.progress(1).kill();
  }, [cameFrom]);

  if (view) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={() => go(view)}
        // Scoops opens on a CV: get pdf.js ready while the pointer is on its way.
        onPointerEnter={view === "scoops" ? () => warmPdf() : undefined}
        className={ROW + OFF}
      >
        {children}
      </button>
    );
  }

  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    // prefetch off: every row opens its view in place; this link's own address has no page
    // in the static build, so fetching it ahead would only fail (25 Nov 2026).
    <Link href={href} prefetch={false} aria-current={active ? "page" : undefined} className={ROW + (active ? ON : OFF)}>
      {children}
    </Link>
  );
}
