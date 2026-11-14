"use client";

import Count from "@/app/Count";
import type { ReactNode } from "react";
import { SEES_WHOLE_JOB } from "@/lib/user";
import { BackButton } from "./PipelineBoard";
import { useOpeningView, type View } from "./view";

// Headhunting > Overview: how headhunting is going on this opening (owner's design,
// "HH Overview - how headhunting is going", 13 Nov 2026). The old TA System's
// numbers: LinkedIn profiles saved in the Excel Tables (L1-L3), how many were
// approached, how many sent a CV, and the day's eye-marks (three a day).
// Sample numbers until the backend; every line below is worked out from them.
const SAVED: number = 48;
const APPROACHED = 31;
const CVS = 9;
const EYE_DONE = 2;
const EYE_TARGET = 3;
const NOT_APPROACHED_IN = "L2 and L3";
const BENCHMARKS_FOUND = 4;
// Every eye-mark on the job so far, and how many of them reached a CV: the old
// page's "eye-mark yield", its honest measure of sourcing quality.
const EYE_ALL: number = 3;
const EYE_ALL_CV = 2;
// The Pick a benchmark card goes once one is chosen on Research (the old page
// showed it always).
const BENCHMARK_CHOSEN: boolean = false;

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default function HhOverview() {
  const { go } = useOpeningView();
  const notApproached = SAVED - APPROACHED;
  const noCvYet = APPROACHED - CVS;
  const eyeLeft = Math.max(EYE_TARGET - EYE_DONE, 0);

  // Nothing saved yet: say what to do instead of a page of zeros.
  if (SAVED === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-[max(2.3rem,14px)] pt-[max(4rem,48px)]">
        <BackButton />
        <div className="m-auto flex flex-col items-center gap-[max(1rem,12px)] text-center">
          <p className="text-h3">No profiles saved yet</p>
          <p className="max-w-[46ch] text-small text-ink-3">
            Save LinkedIn profiles in Excel Tables to start. Eye-mark the two or
            three that match the brief best.
          </p>
          <button
            type="button"
            onClick={() => go("hh-tables")}
            className="flex h-[max(2.3rem,30px)] items-center rounded-full bg-brand px-[max(1.2rem,14px)] text-small font-medium text-white hover:bg-brand-strong"
          >
            Open Excel Tables
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-[max(1.3rem,12px)] overflow-y-auto px-[max(2.3rem,14px)] pb-[max(2rem,16px)] pt-[max(4rem,48px)] max-md:flex-col">
      <div className="shrink-0">
        <BackButton />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-[max(2.4rem,20px)]">
        {/* A lead or admin sees every TA's profiles on the job; a TA their own. */}
        {SEES_WHOLE_JOB && (
          <span className="-mb-[max(1.4rem,12px)] self-start rounded-full bg-surface-2 px-[max(0.8rem,8px)] py-[max(0.2rem,2px)] text-caption text-ink-2">
            Whole job · every TA&apos;s profiles
          </span>
        )}
        {/* The four numbers */}
        <div className="grid grid-cols-4 gap-[max(1.25rem,10px)] max-lg:grid-cols-2">
          <Stat
            n={<Count n={SAVED} />}
            tone="text-ink"
            label="LinkedIn profiles saved"
            sub="across L1–L3"
          />
          <Stat
            n={<Count n={APPROACHED} />}
            tone="text-info"
            label="approached"
            sub={`${pct(APPROACHED, SAVED)}% of saved`}
          />
          <Stat
            n={<Count n={CVS} />}
            tone="text-brand"
            label="sent a CV"
            sub={`${pct(CVS, APPROACHED)}% of approached`}
          />
          <Stat
            n={`${EYE_DONE} / ${EYE_TARGET}`}
            tone="text-warn"
            label="eye-marked today"
            sub={
              eyeLeft
                ? `${eyeLeft === 1 ? "one" : eyeLeft} more to go`
                : "done for today"
            }
          />
        </div>

        {/* From profile to CV: one bar, each part as wide as its share */}
        <section className="flex flex-col gap-[max(0.9rem,8px)]">
          <h3 className="text-h3">From profile to CV</h3>
          <div className="flex h-[max(3rem,36px)] gap-[max(0.4rem,4px)] text-small max-md:h-auto max-md:flex-col">
            <Part
              n={notApproached}
              className="bg-surface-3 text-ink-2"
              label={`${notApproached} not approached`}
            />
            <Part
              n={noCvYet}
              className="bg-info-soft text-ink-2"
              label={`${noCvYet} approached, no CV yet`}
            />
            <Part
              n={CVS}
              className="bg-brand-strong text-white"
              label={`${CVS} CVs`}
            />
          </div>
          {EYE_ALL > 0 && (
            <p className="text-small text-ink-3">
              {EYE_ALL_CV} of {EYE_ALL} eye-marked profiles reached a CV (
              {pct(EYE_ALL_CV, EYE_ALL)}%) · all profiles {pct(CVS, SAVED)}%
            </p>
          )}
        </section>

        {/* Next: what to do, each opening its view */}
        <section className="flex flex-col gap-[max(0.9rem,8px)]">
          <h3 className="text-h3">Next</h3>
          <div className="grid grid-cols-3 gap-[max(1.25rem,10px)] max-lg:grid-cols-1">
            {notApproached > 0 && (
              <Next
                icon={<LinkIcon />}
                title={`Approach ${notApproached} saved profile${notApproached === 1 ? "" : "s"}`}
                sub={`They’re in ${NOT_APPROACHED_IN}`}
                to="hh-tables"
                link="Open Excel Tables"
                go={go}
              />
            )}
            {eyeLeft > 0 && (
              <Next
                icon={<EyeIcon />}
                title={`Eye-mark ${eyeLeft === 1 ? "one more profile" : `${eyeLeft} more profiles`}`}
                sub={SEES_WHOLE_JOB ? `${EYE_DONE} of ${EYE_TARGET} today` : `You have ${EYE_DONE} of ${EYE_TARGET} today`}
                to="hh-tables"
                link="Open Excel Tables"
                go={go}
              />
            )}
            {!BENCHMARK_CHOSEN && (
              <Next
                icon={<TargetIcon />}
                title="Pick a benchmark"
                sub={`${BENCHMARKS_FOUND} people found doing this job today`}
                to="hh-research"
                link="Open Research"
                go={go}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  n,
  tone,
  label,
  sub,
}: {
  n: ReactNode;
  tone: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col rounded-lg bg-surface-2 px-[max(1.9rem,16px)] py-[max(1.8rem,14px)]">
      <span className={`text-display font-light leading-none ${tone}`}>
        {n}
      </span>
      <span className="mt-[max(1rem,8px)] text-h3">{label}</span>
      <span className="mt-[max(0.3rem,2px)] text-small text-ink-3">{sub}</span>
    </div>
  );
}

function Part({
  n,
  className,
  label,
}: {
  n: number;
  className: string;
  label: string;
}) {
  if (n <= 0) return null;
  return (
    <div
      style={{ flexGrow: n }}
      className={`flex min-w-fit basis-0 items-center truncate rounded-sm px-[max(1rem,10px)] max-md:min-h-9 max-md:min-w-0 ${className}`}
    >
      {label}
    </div>
  );
}

function Next({
  icon,
  title,
  sub,
  to,
  link,
  go,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  to: View;
  link: string;
  go: (v: View) => void;
}) {
  return (
    // The whole card is the button: a big target, the link line only says where it goes.
    <button
      type="button"
      onClick={() => go(to)}
      className="group flex flex-col rounded-md border border-border bg-surface px-[max(1.7rem,14px)] py-[max(1.5rem,14px)] text-left transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-card"
    >
      <span className="text-brand">{icon}</span>
      <span className="mt-[max(0.9rem,8px)] text-h3">{title}</span>
      <span className="mt-[max(0.3rem,2px)] text-small text-ink-3">{sub}</span>
      <span className="mt-[max(0.7rem,6px)] flex items-center gap-1.5 text-small font-medium text-brand group-hover:text-brand-strong">
        {link}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[max(0.85rem,11px)] transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </button>
  );
}

const ICON = "size-[max(1.4rem,18px)]";
const LinkIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={ICON}
    aria-hidden="true"
  >
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </svg>
);
const EyeIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={ICON}
    aria-hidden="true"
  >
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const TargetIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className={ICON}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9.5" />
    <circle cx="12" cy="12" r="5.5" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
  </svg>
);
