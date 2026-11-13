import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import ActiveNavLinks, { NavLinks, SearchShortcut } from "./NavLinks";
import { Bell, Person } from "./TopMenus";


const CIRCLE =
  "flex size-[max(2.5rem,34px)] shrink-0 items-center justify-center rounded-full";

function SearchIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

// The owner's second top bar (TopNavV2, 12 Nov 2026): five links, "Search or ask
// AURA" and a soft shadow. Sizes are on Tailwind's rem scale (5rem = 80px at
// 1920) so the bar follows the window width; see the html rule in globals.css.
// Each max(..., Npx) is a floor: on a laptop window (about 1270 wide) the bar
// had scaled down until the logo and links were too small to read (owner, 11 Nov
// 2026). With five links the search box fits a laptop window too, so it is
// always the box.
//
// On a phone or tablet (under 1024) the bar is two rows: the logo, search, bell and the
// person on top, and the five links underneath, sliding sideways when they do
// not fit; on a phone the search box becomes a round button (13 Nov 2026: "responsive for
// mobile and all devices").
export default function TopNav() {
  return (
    <header
      id="topnav"
      className="mx-11 mt-[max(2.125rem,14px)] flex h-[max(5rem,64px)] shrink-0 items-center rounded-full bg-white pl-[max(1.875rem,18px)] pr-[max(1.5rem,14px)] max-lg:h-auto max-lg:flex-wrap max-lg:rounded-lg max-lg:py-2.5 max-md:mx-3 max-md:mt-3 max-md:px-4 shadow-card"
    >
      <Link href="/" className="relative -top-1 shrink-0">
        <Image
          src="/career141-lockup.png"
          alt="Career141, 20 years"
          width={151}
          height={48}
          priority
          className="h-auto w-[max(9.4375rem,132px)]"
        />
      </Link>

      <Suspense fallback={<NavLinks />}>
        <ActiveNavLinks />
      </Suspense>

      <form
        action="/search"
        role="search"
        className="ml-auto hidden h-[max(2.875rem,36px)] w-[max(21.25rem,180px)] sm:flex min-w-36 shrink items-center gap-[max(0.625rem,6px)] rounded-full bg-surface-2 pl-[max(1.125rem,12px)] pr-[max(0.625rem,6px)] has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand/30"
      >
        <SearchIcon className="size-[max(0.9375rem,13px)] shrink-0 text-ink-2" />
        <input
          name="q"
          type="search"
          placeholder="Search or ask AURA"
          aria-label="Search or ask AURA"
          className="min-w-0 flex-1 text-ellipsis bg-transparent text-nav text-ink outline-none placeholder:text-ink-2"
        />
        <kbd className="shrink-0 rounded-md bg-white px-[max(0.375rem,4px)] py-px font-sans text-[max(0.6875rem,10px)] text-ink-2">
          ⌘K
        </kbd>
        <SearchShortcut />
      </form>
      <Link
        href="/search"
        prefetch={false}
        aria-label="Search or ask AURA"
        className={CIRCLE + " ml-auto bg-surface-2 text-ink sm:hidden"}
      >
        <SearchIcon className="size-[45%]" />
      </Link>

      {/* The bell's list and the person's menu (TopMenus): what the TA System's
          bell and name button open (FLOW-CHECK 7.1, 7.3). */}
      <Bell />
      <Person />
    </header>
  );
}
