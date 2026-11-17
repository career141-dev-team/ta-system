"use client";

import { useEffect, useRef } from "react";
import { EASE, MOTION, gsap } from "@/lib/gsap";

// Under the opening's ATS / Headhunting lists, reached by scrolling (owner's two
// designs, 18 Nov 2026): a card of three rings - CVs Today, Position CVs, L Target - and
// a "Strategies" card of job cards, two rows of four. Sample text from the design until
// the backend sends it; built as drawn, nothing added.

type RingData = { label: string; value: number; sub: string; pct: number; stroke: string };
const RINGS: RingData[] = [
  { label: "CVs Today", value: 20, sub: "34h : 28 CVs", pct: 88, stroke: "stroke-brand-strong" },
  { label: "Position CVs", value: 20, sub: "34h : 28 CVs", pct: 88, stroke: "stroke-warn" },
  { label: "L Target", value: 20, sub: "34h : 28 CVs", pct: 88, stroke: "stroke-info" },
];

type Job = { client: string; title: string; status: "Active" | "Lost"; day: number; of: number };
const ROW: Job[] = [
  { client: "PGP Glass", title: "Senior Manager – SAP Business Transformation", status: "Active", day: 9, of: 14 },
  { client: "Haleys Fabric", title: "Finance Manager", status: "Lost", day: 4, of: 21 },
  { client: "MAS Bodyline", title: "Production Executive", status: "Active", day: 22, of: 30 },
  { client: "Dialog Axiata", title: "HR Business Partner", status: "Active", day: 2, of: 30 },
];
const JOBS = [...ROW, ...ROW];

/** One ring as drawn: a thick arc with no track, the number inside, the label and its
 *  line beside it. */
function Ring({ r }: { r: RingData }) {
  return (
    <div className="flex min-w-0 items-center gap-[max(2rem,14px)]">
      <span className="relative grid size-[max(13.8rem,96px)] shrink-0 place-items-center">
        <svg viewBox="0 0 120 120" className="absolute inset-0 size-full" aria-hidden="true">
          <circle
            data-arc
            data-to={r.pct}
            cx="60"
            cy="60"
            r="55"
            fill="none"
            strokeWidth="9.5"
            className={r.stroke}
            pathLength={100}
            strokeDasharray={`${r.pct} 100`}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <span className="relative text-h3 font-semibold tabular-nums text-ink-2">{r.value}</span>
      </span>
      <div className="min-w-0">
        <p className="truncate text-h3 font-semibold text-ink">{r.label}</p>
        <p className="mt-1 truncate text-small text-ink-3">{r.sub}</p>
      </div>
    </div>
  );
}

function JobCard({ j }: { j: Job }) {
  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-border bg-white px-[max(1.6rem,14px)] py-[max(1.4rem,12px)]">
      <p className="truncate text-small text-ink-3">{j.client}</p>
      <h3 className="mt-[max(1rem,8px)] line-clamp-2 text-body font-semibold text-ink">{j.title}</h3>
      <div className="mt-auto flex items-center justify-between gap-3 pt-[max(1.6rem,12px)] text-small">
        <span className="flex items-center gap-2 text-ink-2">
          <span className={"size-2 rounded-full " + (j.status === "Active" ? "bg-brand" : "bg-ink-3/60")} aria-hidden="true" />
          {j.status}
        </span>
        <span className="shrink-0 tabular-nums text-ink-3">
          Day {j.day} of {j.of}
        </span>
      </div>
    </article>
  );
}

export default function OpeningCards() {
  const ref = useRef<HTMLDivElement>(null);
  // The arcs draw in once, set first then tweened (no useGSAP - the 14 Nov rule).
  useEffect(() => {
    const arcs = ref.current?.querySelectorAll<SVGElement>("[data-arc]");
    if (!arcs?.length) return;
    const tweens = [...arcs].map((a, i) => {
      gsap.set(a, { attr: { "stroke-dasharray": "0 100" } });
      return gsap.to(a, { attr: { "stroke-dasharray": `${a.dataset.to} 100` }, duration: MOTION.drawIn * 2, ease: EASE.out, delay: i * 0.05 });
    });
    return () => tweens.forEach((t) => t.progress(1).kill());
  }, []);

  return (
    <div ref={ref} className="mt-[max(1rem,10px)] flex shrink-0 flex-col gap-[max(1rem,10px)]">
      <section aria-label="Today's numbers" className="grid grid-cols-1 gap-6 rounded-lg bg-white px-[max(4rem,20px)] py-[max(5.8rem,24px)] sm:grid-cols-3">
        {RINGS.map((r) => (
          <Ring key={r.label} r={r} />
        ))}
      </section>
      <section aria-labelledby="opening-strategies" className="rounded-lg bg-white px-[max(2.25rem,16px)] pb-[max(3.4rem,20px)] pt-[max(3.6rem,20px)]">
        <h2 id="opening-strategies" className="text-h3 font-semibold text-ink">
          Strategies
        </h2>
        <div className="mt-[max(2.3rem,14px)] grid grid-cols-1 gap-[max(1.45rem,10px)] sm:grid-cols-2 md:grid-cols-4">
          {JOBS.map((j, i) => (
            <JobCard key={i} j={j} />
          ))}
        </div>
      </section>
    </div>
  );
}
