import Link from "next/link";

/** Shown where TA work is gated on the workday (FLOW-CHECK 4.4, 6.2), as the TA
 *  System's own "You cannot upload scoops yet" box does: what is blocked, why, and
 *  the one way forward. `what` completes "You cannot ... yet". */
export default function WorkdayBlocked({ what, className = "" }: { what: string; className?: string }) {
  return (
    <div
      role="note"
      className={
        "flex flex-wrap items-center gap-x-[max(1rem,10px)] gap-y-2 rounded-md border border-warn/30 bg-warn-soft px-[max(1.4rem,12px)] py-[max(0.8rem,8px)] " +
        className
      }
    >
      <span aria-hidden="true" className="flex size-[max(1.5rem,20px)] shrink-0 items-center justify-center rounded-full bg-warn text-[max(0.8rem,11px)] font-semibold text-white">
        !
      </span>
      <p className="min-w-0 flex-1 text-[max(0.9rem,12px)] text-ink">
        <b className="font-semibold">You cannot {what} yet.</b> <span className="text-ink-2">Your workday has not started today.</span>
      </p>
      <Link
        href="/today"
        className="flex h-[max(2.2rem,30px)] items-center rounded-full bg-ink px-[max(1.1rem,13px)] text-[max(0.85rem,12px)] font-medium text-white hover:bg-black"
      >
        Start workday
      </Link>
    </div>
  );
}
