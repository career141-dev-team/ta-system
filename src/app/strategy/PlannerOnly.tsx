"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { useRole } from "@/lib/role";

const noop = () => () => {};

/** Who may plan: in the TA System only a TA Lead, the Director and an admin give out
 *  strategies and edit the strategy list; a TA works theirs inside each opening. The
 *  link is in everyone's top bar (owner, 16 Nov 2026), so the page itself says this
 *  rather than letting anyone assign (FLOW-CHECK 11.1). */
export default function PlannerOnly({ children }: { children: ReactNode }) {
  const role = useRole();
  // Nothing until the browser knows the role, so a lead never sees the notice flash.
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <div className="flex-1" />;
  if (role === "Lead" || role === "Admin" || role === "Director") return <>{children}</>;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[max(1rem,10px)] px-6 text-center">
      <h1 className="text-h2 font-semibold text-ink">Strategies are planned by your TA Lead</h1>
      <p className="max-w-[34rem] text-body text-ink-2">
        A TA Lead or the Director chooses the strategies for each job and who does them. The ones given to you are in each
        opening, under Strategies.
      </p>
      <Link href="/openings" className="flex h-[max(2.75rem,34px)] items-center rounded-full bg-ink px-[max(1.375rem,14px)] text-small font-medium text-white hover:bg-black">
        Open my openings
      </Link>
    </div>
  );
}
