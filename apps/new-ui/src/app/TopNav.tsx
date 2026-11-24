import Image from "next/image";
import Link from "next/link";
import ActiveNavLinks, { SearchShortcut } from "./NavLinks";
import { Bell, Person } from "./TopMenus";
import { OverviewButton } from "./Overview";
import AskBar from "./AskBar";


const CIRCLE =
  "flex size-[max(2.5rem,34px)] shrink-0 items-center justify-center rounded-full";


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
      className="enter-nav mx-11 mt-[max(2.125rem,14px)] flex h-[max(4.5rem,58px)] shrink-0 items-center rounded-full bg-white pl-[max(1.875rem,18px)] pr-[max(1.5rem,14px)] max-lg:h-auto max-lg:flex-wrap max-lg:rounded-lg max-lg:py-2.5 max-md:mx-3 max-md:mt-3 max-md:px-4 shadow-card"
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

      {/* No <Suspense> here: in the static build that boundary never resolved, so
          the links stayed plain HTML and every click reloaded the whole site (no
          page turn, slow pages - 14 Nov 2026). The board reads the path the same way. */}
      <ActiveNavLinks />

      <AskBar circle={CIRCLE} />
      <SearchShortcut />

      {/* The bell's list and the person's menu (TopMenus): what the TA System's
          bell and name button open (FLOW-CHECK 7.1, 7.3). */}
      {/* Every open page at once, zoomed out (Overview.tsx). */}
      <OverviewButton />
      <Bell />
      <Person />
    </header>
  );
}
