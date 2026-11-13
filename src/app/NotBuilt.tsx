import Link from "next/link";

const BUTTON =
  "flex h-[max(2.75rem,34px)] items-center rounded-full px-[max(1.375rem,14px)] text-[max(0.875rem,12.5px)] font-medium transition-colors";

/** A section whose screen is not built yet: the same white card as Today, its
 *  name, and the way back to the screens that are built, so no link in the top
 *  bar ends on "page not found" (owner, 12 Nov 2026: "properly connect the UI"). */
export default function NotBuilt({ name }: { name: string }) {
  return (
    <main className="mx-11 max-md:mx-3 my-[max(2.125rem,14px)] flex min-h-0 flex-1 flex-col items-center justify-center gap-[max(1rem,10px)] rounded-[max(2.5rem,24px)] bg-white px-6 text-center shadow-[0_6px_18px_-4px_rgba(15,23,31,0.05),0_1px_2px_rgba(15,23,31,0.04)]">
      <h1 className="text-[max(2rem,24px)] font-light tracking-[-0.01em] text-ink">{name}</h1>
      <p className="text-[max(0.9375rem,13px)] text-[#8a939c]">This screen is next to build.</p>
      <div className="mt-[max(0.75rem,6px)] flex flex-wrap justify-center gap-[max(0.75rem,8px)]">
        <Link href="/today" className={BUTTON + " bg-[#1a1c1e] text-white hover:bg-black"}>
          Back to Today
        </Link>
        <Link href="/openings/demo" className={BUTTON + " bg-soft text-ink hover:bg-[#e7eaea]"}>
          Open the opening
        </Link>
      </div>
    </main>
  );
}
