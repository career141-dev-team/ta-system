"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOpeningView, type WorkView } from "./view";

const ROW = "flex h-18.25 w-full items-center px-2 text-left text-row md:h-full ";
const ON = "font-semibold text-brand";
// Green only under the pointer (or keyboard focus), on every row of both columns -
// no row starts green (owner, 12 Nov 2026: "no need to initially show the pipeline
// as a green colour... if I hover over any links... that need to be green").
const OFF =
  "font-light text-muted transition-[color,translate] duration-200 hover:translate-x-1 hover:text-brand focus-visible:text-brand";

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
      <button type="button" onClick={() => go(view)} className={ROW + OFF}>
        {children}
      </button>
    );
  }

  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={ROW + (active ? ON : OFF)}>
      {children}
    </Link>
  );
}
