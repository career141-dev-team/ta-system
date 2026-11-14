import Link from "next/link";

const BUTTON =
  "flex h-[max(2.75rem,34px)] items-center rounded-full px-[max(1.375rem,14px)] text-[max(0.875rem,12.5px)] font-medium transition-colors";

/** A section whose screen is not built yet, inside the app's board: its
 *  name, and the way back to the screens that are built, so no link in the top
 *  bar ends on "page not found" (owner, 12 Nov 2026: "properly connect the UI"). */
export default function NotBuilt({ name }: { name: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[max(1rem,10px)] px-6 text-center">
      <h1 className="text-[max(2rem,24px)] font-light tracking-[-0.01em] text-ink">{name}</h1>
      <p className="text-[max(0.9375rem,13px)] text-ink-3">This screen is next to build.</p>
      <div className="mt-[max(0.75rem,6px)] flex flex-wrap justify-center gap-[max(0.75rem,8px)]">
        <Link href="/today" className={BUTTON + " bg-ink text-white hover:bg-black"}>
          Back to Today
        </Link>
        <Link href="/openings/demo" className={BUTTON + " bg-surface-2 text-ink hover:bg-surface-3"}>
          Open the opening
        </Link>
      </div>
    </div>
  );
}
