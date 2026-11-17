"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOpeningView, type WorkView } from "./view";
import { warmPdf } from "./CvPages";

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
  const { go } = useOpeningView();

  if (view) {
    return (
      <button
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
    // prefetch off: these pages are not built yet, so there is nothing to fetch ahead.
    <Link href={href} prefetch={false} aria-current={active ? "page" : undefined} className={ROW + (active ? ON : OFF)}>
      {children}
    </Link>
  );
}
