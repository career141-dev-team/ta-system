"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOpeningView, type WorkView } from "./view";

const ROW = "flex h-18.25 w-full items-center px-2 text-left text-row md:h-full ";
const ON = "font-semibold text-brand";
const OFF = "font-light text-muted hover:text-ink";

/** A row of the opening card. An ATS row (`view`) opens its work view in place,
 *  without leaving the page; a Headhunting row is still a link. `isHome` marks the
 *  row the opening screen stands for (Pipeline), green as in the design. */
export default function RowLink({
  href,
  base,
  view,
  isHome,
  children,
}: {
  href: string;
  base: string;
  view?: WorkView;
  isHome?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { go } = useOpeningView();

  if (view) {
    return (
      <button type="button" onClick={() => go(view)} className={ROW + (isHome ? ON : OFF)}>
        {children}
      </button>
    );
  }

  const active = pathname === href || pathname.startsWith(href + "/") || (isHome && pathname === base);
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={ROW + (active ? ON : OFF)}>
      {children}
    </Link>
  );
}
