"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { gsap, useGSAP } from "@/lib/gsap";

// Same routes as the TA System, so a link means the same place in both.
const LINKS = [
  ["Clients", "/clients"],
  ["Openings", "/openings"],
  ["Strategy Planner", "/strategy"],
  ["Database", "/database"],
  ["Alerts", "/alerts"],
  ["Reports", "/reports"],
  ["TA Track", "/ta-track"],
  ["Targets", "/targets"],
  ["Voice Agent", "/voice"],
  ["Feedback", "/feedback"],
  ["Bin", "/bin"],
] as const;

/** The links, with the one for `pathname` marked. Also the Suspense fallback, with no path. */
export function NavLinks({ pathname = "" }: { pathname?: string }) {
  const nav = useRef<HTMLElement>(null);

  // One soft pill that glides to whichever link the pointer is on, and fades out
  // when it leaves the bar (instead of each link flashing its own background).
  // Transform and opacity only, so it never costs a layout.
  const { contextSafe } = useGSAP({ scope: nav });
  // The pill is found from the link itself, so no ref is read while rendering.
  const glowOf = (el: Element) => el.closest("nav")?.querySelector<HTMLElement>("[data-glow]") ?? null;
  const moveTo = contextSafe((el: HTMLElement) => {
    const glow = glowOf(el);
    if (!glow) return;
    const pad = 8;
    const hidden = Number(gsap.getProperty(glow, "opacity")) < 0.05;
    const to = {
      x: el.offsetLeft - pad,
      y: el.offsetTop + el.offsetHeight / 2 - 15,
      width: el.offsetWidth + pad * 2,
    };
    // First entry: appear in place, then glide between links after that.
    if (hidden) gsap.set(glow, to);
    gsap.to(glow, { ...to, opacity: 1, duration: hidden ? 0.15 : 0.32, ease: "power3.out", overwrite: true });
  });
  const hide = contextSafe((e: React.MouseEvent<HTMLElement>) => {
    gsap.to(glowOf(e.currentTarget), { opacity: 0, duration: 0.2, ease: "power2.out" });
  });

  return (
    // The gap between links is 23px at 1920 and closes up faster than the
    // window narrows (9px on a laptop), which is what leaves room for readable
    // text. The search box gives up its width next (TopNav). Only when that is not
    // enough do the links scroll sideways, with the bar hidden rather than
    // drawing a scrollbar in the header. The px-2 padding
    // gives the gliding pill room to overhang the first and last link.
    <nav
      ref={nav}
      onMouseLeave={hide}
      className="relative ml-[calc(3.3125rem-0.5rem)] mr-2 flex min-w-0 shrink items-center gap-[max(8px,calc(2.6rem_-_18.6px))] overflow-x-auto whitespace-nowrap px-2 text-nav [scrollbar-width:none]"
    >
      <span
        data-glow
        aria-hidden="true"
        style={{ opacity: 0 }}
        className="pointer-events-none absolute left-0 top-0 h-[30px] rounded-full bg-soft"
      />
      {LINKS.map(([label, href]) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            onMouseEnter={(e) => moveTo(e.currentTarget)}
            className={
              "relative transition-colors duration-300 " +
              (active
                ? "flex h-[max(2.125rem,30px)] items-center rounded-full bg-soft px-[max(1rem,12px)] text-ink"
                : "text-muted hover:text-ink")
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

// The path is only known at request time, so with Cache Components this part
// must sit inside <Suspense> (TopNav does that) or the whole route blocks.
export default function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}
