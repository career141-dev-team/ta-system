// Placeholders shaped like what is loading, with a soft shimmer (globals.css
// .shimmer), so a screen never sits blank while its code or data arrives
// (owner, 14 Nov 2026: loading should feel premium). Plain markup, no state.

const Bone = ({ className = "" }: { className?: string }) => <span aria-hidden="true" className={"shimmer block rounded-md " + className} />;

/** A work view inside an opening: its toolbar, then columns of cards. */
export function ViewSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex min-h-0 flex-1 flex-col gap-5 px-[max(1.5rem,14px)] pt-[max(4.5rem,48px)]">
      <div className="flex gap-3">
        <Bone className="h-10 w-10 rounded-full" />
        <Bone className="h-10 w-[max(18rem,140px)] rounded-full" />
        <Bone className="ml-auto h-10 w-[max(9rem,90px)] rounded-full" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-4 max-md:grid-cols-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3">
            <Bone className="h-6 w-1/2" />
            <Bone className="h-28" />
            <Bone className="h-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A dashboard of cards (TA Track) while its numbers are made. */
export function CardsSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="grid flex-1 grid-cols-[1.98fr_1fr] gap-[max(1.5rem,12px)] p-[max(1rem,10px)] pt-[max(4rem,44px)] max-lg:grid-cols-1">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow-card">
          <Bone className="h-5 w-1/3" />
          <Bone className="h-3 w-1/2" />
          <div className="flex gap-5 pt-3">
            {Array.from({ length: i ? 1 : 5 }, (_, k) => (
              <Bone key={k} className="size-[max(8rem,96px)] rounded-full" />
            ))}
          </div>
        </div>
      ))}
      <div className="col-span-full grid grid-cols-3 gap-[max(1.5rem,12px)] max-md:grid-cols-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg bg-white p-6 shadow-card">
            <Bone className="h-5 w-2/5" />
            <Bone className="h-3 w-3/5" />
            <Bone className="mt-3 h-4" />
            <Bone className="h-4 w-4/5" />
            <Bone className="h-4 w-3/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
