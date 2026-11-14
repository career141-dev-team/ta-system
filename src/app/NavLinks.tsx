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
  // 14 Nov 2026 (owner): every link is its own cell, flush to the bar's top and
  // bottom edges (the open one filled, with a brand line on the bottom edge); the
  // bar itself stays the floating rounded one. The gliding fill takes the link's box.
  const moveTo = (el: HTMLElement) => {
    glide.to(glowOf(el), { x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
  };

  return (
    // Five links fit a laptop window. On a phone or tablet they take their own row under
    // the logo (TopNav) and slide sideways when they do not fit.
    <nav
      onMouseLeave={(e) => glide.out(glowOf(e.currentTarget))}
      className="relative ml-[max(2.5rem,16px)] mr-2 flex min-w-0 shrink items-stretch self-stretch overflow-x-auto whitespace-nowrap border-l border-border text-nav [scrollbar-width:none] max-lg:order-last max-lg:mx-0 max-lg:mt-2 max-lg:h-[44px] max-lg:w-full max-lg:self-auto max-lg:border-l-0"
    >
      <span
        data-glow
        aria-hidden="true"
        style={{ opacity: 0 }}
        className="pointer-events-none absolute left-0 top-0 bg-surface-2"
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
              // Same height, never squeezed, text big enough to read at a glance (owner, 14 Nov).
              "relative flex shrink-0 items-center border-r border-border px-[max(1.5rem,14px)] text-[max(1rem,14.5px)] transition-colors " +
              // The open page: filled, with a brand line on the bar's bottom edge.
              (active
                ? "bg-surface-2 text-ink shadow-[inset_0_-2px_0_var(--color-brand)]"
                : "text-ink-2 hover:text-ink")
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

// The links with the open page marked, read from the address like Board.tsx.
export default function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}
