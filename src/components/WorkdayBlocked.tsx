import Link from "next/link";

/** Stands where an upload box would be, when the workday rule would refuse the upload (2 Nov). */
export function WorkdayBlocked({ message, what }: { message: string; what: string }) {
  return (
    <div role="alert" className="mb-6 rounded-xl border border-warn/40 bg-warn-soft p-4 text-[12.5px] leading-relaxed text-warn">
      <p className="font-medium">You cannot {what} yet.</p>
      <p className="mt-1">{message}</p>
      <Link href="/openings?checks=open" className="mt-2 inline-block font-medium underline">
        Open Today&apos;s Checks
      </Link>
    </div>
  );
}
