/** A label in a notch cut from the top edge of a white card (the board showing
 *  through). The parent must be `relative`. */
export default function Notch({ label }: { label: string }) {
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
