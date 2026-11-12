import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import ActiveNavLinks, { NavLinks } from "./NavLinks";

// Placeholder until sign-in is wired: the person shown in the design.
const USER = { name: "Chathura Sampath", role: "Talent Acquisition" };

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

// Sizes are on Tailwind's rem scale (5rem = 80px at 1920) so the bar follows
// the window width; see the html rule in globals.css. Each max(..., Npx) is a
// floor: on a laptop window (about 1270 wide) the bar had scaled down until
// the logo and links were too small to read (owner, 11 Nov 2026).
//
// Those floors cost width, and on a laptop the eleven links, the logo and the
// name cannot also share the bar with a search box. So under a 1520 window the
// search box is a round button that opens the search page; from 1520 up it is
// the box in the design.
export default function TopNav() {
  const initials = USER.name
    .split(" ")
    .map((w) => w[0])
    .join("");

  return (
    <header id="topnav" className="mx-11.25 mt-10.5 flex h-[max(5rem,64px)] shrink-0 items-center rounded-full bg-white pl-8 pr-9.75">
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
        className="ml-auto hidden h-11 w-78 min-w-40 shrink-[999] items-center gap-2 rounded-full bg-soft px-3.75 min-[1520px]:flex"
      >
        <SearchIcon className="size-[max(0.9375rem,13px)] shrink-0 text-muted" />
        <input
          name="q"
          type="search"
          placeholder="Search opening and candidates"
          aria-label="Search opening and candidates"
          className="min-w-0 flex-1 text-ellipsis bg-transparent text-nav text-ink outline-none placeholder:text-[#3d4240]"
        />
      </form>
      <Link
        href="/search"
        aria-label="Search opening and candidates"
        className={CIRCLE + " ml-auto bg-soft text-ink min-[1520px]:hidden"}
      >
        <SearchIcon className="size-[45%]" />
      </Link>

      <Link
        href="/alerts"
        aria-label="Notifications"
        className={CIRCLE + " relative ml-[max(1.1875rem,10px)] bg-soft text-ink"}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-1/2"
          aria-hidden="true"
        >
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        <span className="absolute right-[22%] top-[20%] size-[20%] rounded-full bg-[#e5342b]" />
      </Link>

      <div className="ml-[max(1.125rem,10px)] flex shrink-0 items-center gap-[max(0.9375rem,9px)]">
        <span aria-hidden="true" className={CIRCLE + " bg-ink text-nav font-medium text-white"}>
          {initials}
        </span>
        <span className="hidden leading-tight lg:block">
          <span className="block text-nav font-semibold">{USER.name}</span>
          <span className="block text-nav text-muted">{USER.role}</span>
        </span>
      </div>
    </header>
  );
}
