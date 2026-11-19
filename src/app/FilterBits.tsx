"use client";

// The small pieces every filter bar shares, so a search box, the "N of M" line and an
// empty result look and read the same on every screen (DESIGN.md tokens only).

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className = "w-[max(15.5rem,200px)] max-md:w-full",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label?: string;
  className?: string;
}) {
  return (
    <label
      className={
        "flex h-[max(2.4rem,33px)] items-center gap-2 rounded-full border border-border bg-surface px-[max(1rem,13px)] has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand/30 " +
        className
      }
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4 shrink-0 text-ink-3" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && value && (e.stopPropagation(), onChange(""))}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-3"
      />
    </label>
  );
}

/** "12 of 40 candidates · Reset filters" - the Reset shows only while a filter is on. */
export function ResultLine({
  shown,
  total,
  noun,
  active,
  onReset,
  className = "",
}: {
  shown: number;
  total: number;
  noun: string;
  active: number;
  onReset: () => void;
  className?: string;
}) {
  if (!active) return null;
  return (
    <p role="status" className={"flex flex-wrap items-center gap-x-2 text-caption text-ink-3 " + className}>
      <span>
        {shown} of {total} {noun}
      </span>
      <button type="button" onClick={onReset} className="rounded-full px-2 py-0.5 font-medium text-brand-strong hover:bg-surface-2">
        Reset filters{active > 1 ? ` (${active})` : ""}
      </button>
    </p>
  );
}

/** What a list says when the filters leave nothing - and the way out. */
export function NoResults({ noun, onReset, filtered }: { noun: string; onReset: () => void; filtered: boolean }) {
  return (
    <p role="status" className="py-6 text-small text-ink-3">
      {filtered ? (
        <>
          No {noun} match these filters.{" "}
          <button type="button" onClick={onReset} className="font-medium text-brand-strong hover:underline">
            Reset filters
          </button>
        </>
      ) : (
        <>No {noun} yet.</>
      )}
    </p>
  );
}
