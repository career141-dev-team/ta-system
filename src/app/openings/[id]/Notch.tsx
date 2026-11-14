/** A label in a notch cut from the top edge of a white card (the board showing
 *  through). The parent must be `relative`.
 *  `board`: the taller notch of a section board (Database - the owner's notch
 *  shape, 218.5 x 51.5 at 1920, 14 Nov 2026: "the tab height is very small").
 *  `wide`: the Openings board's wider notch (360 x 56 at 1920). */
export default function Notch({
  label,
  board = false,
  wide = false,
  labelRef,
}: {
  label: string;
  board?: boolean;
  wide?: boolean;
  labelRef?: React.Ref<HTMLSpanElement>;
}) {
  // Openings: a white tab rising from the board's top edge, the board's own white.
  if (wide)
    return (
      <h2 className="absolute bottom-full left-1/2 z-10 flex h-[clamp(32px,5.2dvh,56px)] w-[max(22.5rem,220px)] -translate-x-1/2 items-center justify-center pt-1 text-body font-medium text-ink">
        <svg viewBox="0 0 360 56" preserveAspectRatio="none" className="absolute inset-0 -bottom-px size-full fill-white" aria-hidden="true">
          <path d="M0 56C22 56 30 49 36 37L49 12C54 3 61 0 72 0H288C299 0 306 3 311 12L324 37C330 49 338 56 360 56Z" />
        </svg>
        <span ref={labelRef} className="relative">
          {label}
        </span>
      </h2>
    );
  if (board)
    return (
      <h2 className="absolute left-1/2 top-0 z-10 flex h-[3.22rem] w-[13.66rem] min-w-[150px] -translate-x-1/2 items-start justify-center pt-[max(0.85rem,8px)] text-h3 font-semibold text-ink">
        <svg viewBox="0 0 218.5 51.5" preserveAspectRatio="none" className="absolute inset-0 size-full fill-background" aria-hidden="true">
          <path d="M0 0H218.5L196.649 40.9206C193.172 47.433 186.389 51.5 179.007 51.5H39.0965C31.6594 51.5 24.8365 47.3733 21.3832 40.7866L0 0Z" />
        </svg>
        <span className="relative">{label}</span>
      </h2>
    );
  return (
    <h2 className="absolute left-1/2 top-0 z-10 flex h-10.5 w-52 -translate-x-1/2 items-center justify-center pb-1 text-tab font-semibold">
      <svg
        viewBox="0 0 208 42"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full fill-background"
        aria-hidden="true"
      >
        <path d="M0 0c10 0 12 6 15 14l7 16c3 8 8 12 16 12h132c8 0 13-4 16-12l7-16c3-8 5-14 15-14Z" />
      </svg>
      <span className="relative">{label}</span>
    </h2>
  );
}
