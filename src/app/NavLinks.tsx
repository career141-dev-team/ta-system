"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGlide } from "@/lib/gsap";

// The five links of the owner's second top bar (TopNavV2, 12 Nov 2026), on the
// same routes as the TA System so a link means the same place in both. Alerts
// moved to the bell; the rest are not in this bar's design.
const LINKS = [
  ["Today", "/today"],
  ["Openings", "/openings"],
  ["Strategy Planner", "/strategy"],
  ["Database", "/database"],
  ["TA Track", "/ta-track"],
] as const;

/** The links, with the one for `pathname` marked. Also the Suspense fallback, with no path. */
export function NavLinks({ pathname = "" }: { pathname?: string }) {
  // One soft pill that glides to whichever link the pointer is on, and fades out
  // when it leaves the bar (instead of each link flashing its own background).
  // The pill is found from the link itself, so no ref is read while rendering.
  const glide = useGlide();
  const glowOf = (el: Element) => el.closest("nav")?.querySelector<HTMLElement>("[data-glow]");
  // Every link is its own pill (the open one filled), so the gliding pill takes
  // the link's own box.
  const moveTo = (el: HTMLElement) => {
    glide.to(glowOf(el), { x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
  };

  return (
    // Five links fit a laptop window. On a phone or tablet they take their own row under
    // the logo (TopNav) and slide sideways when they do not fit.
    <nav
      onMouseLeave={(e) => glide.out(glowOf(e.currentTarget))}
      className="relative ml-[max(2.5rem,16px)] mr-2 flex min-w-0 shrink items-center max-lg:order-last max-lg:mx-0 max-lg:mt-2 max-lg:w-full gap-[max(0.375rem,2px)] overflow-x-auto whitespace-nowrap text-nav [scrollbar-width:none]"
    >
      <span
        data-glow
        aria-hidden="true"
        style={{ opacity: 0 }}
        className="pointer-events-none absolute left-0 top-0 rounded-full bg-surface-2"
      />
      {LINKS.map(([label, href]) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            // Most of these pages are not built yet: fetching them ahead only costs requests.
            prefetch={href === "/today" ? undefined : false}
            aria-current={active ? "page" : undefined}
            onMouseEnter={(e) => moveTo(e.currentTarget)}
            className={
              "relative flex h-[max(2.5rem,34px)] items-center rounded-full px-[max(1.125rem,12px)] transition-colors " +
              (active ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink")
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** ⌘K or Ctrl+K puts the cursor in the top bar's search box, as its hint says. */
export function SearchShortcut() {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('#topnav input[name="q"]')?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return null;
}

// The path is only known at request time, so with Cache Components this part
// must sit inside <Suspense> (TopNav does that) or the whole route blocks.
export default function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}
