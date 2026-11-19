"use client";

import { useRef, useState } from "react";
import { useFilters } from "@/lib/filters";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSwap } from "@/lib/gsap";
import Count from "../Count";
import Toast from "../openings/[id]/Toast";
import { useLiftMenu } from "../openings/[id]/liftMenu";
import { JOBS, TAS, groupsOf, namesOf, useCatalogue, counts, jobStatus, liveRows, saveRow, setRows, ta, useRows, type Job, type Row, type State, type TaId } from "./data";
import { AssignPanel, CheckIcon, Initials } from "./ui";

// S1 Board and S2 Matrix (owner's designs, 14 Nov 2026): the TA Lead's Strategy
// Planner. Three counts on top (jobs not planned, strategies waiting for a TA to
// accept, submissions to read); the board shows every open job as a card with a bar
// of its strategies; the matrix shows every job against every strategy, and a cell
// opens who and when. Old system's rules: only open jobs are planned; putting a TA on
// a strategy chooses it and rings their bell; a strategy can be struck for a job.

const BAR: Record<State, string> = { done: "bg-brand", working: "bg-info", waiting: "bg-warn", open: "bg-surface-3", na: "" };
const DOT = { none: "bg-danger", waiting: "bg-warn", progress: "bg-info", done: "bg-brand" } as const;
const SORTS = [
  ["recent", "Newest first"],
  ["priority", "Priority"],
  ["client", "Client A–Z"],
] as const;
type Sort = (typeof SORTS)[number][0];

const plan = (j: Job) => `/strategy/plan?job=${j.id}`;

export default function Planner() {
  const rows = useRows();
  const c = counts(rows);
  const router = useRouter();
  // View, count filter, TA, priority and sort are kept for the visit (src/lib/filters.ts).
  const { f: kept, set: setKept } = useFilters("planner", { view: "board" as "board" | "matrix" | "week", only: "" as "" | "unplanned" | "waiting", who: "all" as TaId | "all", p: 0, sort: "recent" as Sort }, ["view", "sort"]);
  const { view, who, p, sort } = kept;
  const only = kept.only || null;
  const setView = (v: "board" | "matrix" | "week") => setKept({ view: v });
  const setOnly = (v: "unplanned" | "waiting" | null) => setKept({ only: v ?? "" });
  const setWho = (v: TaId | "all") => setKept({ who: v });
  const setP = (v: number) => setKept({ p: v });
  const setSort = (v: Sort) => setKept({ sort: v });
  const [toast, setToast] = useState<{ key: number; bold: string; rest: string } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  useSwap(stage, view + (only ?? ""));

  const jobs = JOBS.filter((j) => (who === "all" || j.tas.includes(who)) && (!p || j.p === p))
    .filter((j) => (only === "unplanned" ? !liveRows(rows, j.id).length : only === "waiting" ? rows.some((x) => x.job === j.id && x.state === "waiting") : true))
    .sort((a, b) => (sort === "priority" ? a.p - b.p : sort === "client" ? a.client.localeCompare(b.client) : 0));
  const firstUnplanned = JOBS.find((j) => !liveRows(rows, j.id).length);
  const filtered = who !== "all" || p > 0 || sort !== "recent";

  const PILL = "flex h-[max(3.875rem,44px)] items-center gap-[max(0.875rem,8px)] rounded-full px-[max(1.5rem,14px)] text-[max(1.0625rem,13px)] transition-shadow";
  const ring = (on: boolean) => (on ? " ring-2 ring-brand ring-offset-2" : "");

  return (
    <div className="relative flex min-h-0 flex-1 flex-col px-[max(3.5rem,14px)] pt-[max(2.25rem,16px)] max-md:pt-12">
      <div className="flex flex-wrap items-center gap-[max(1rem,8px)]">
        <button type="button" aria-pressed={only === "unplanned"} onClick={() => setOnly(only === "unplanned" ? null : "unplanned")} className={PILL + " bg-ink text-white" + ring(only === "unplanned")}>
          <Count n={c.unplanned} className="text-[max(1.875rem,20px)] font-light" />
          not planned yet
        </button>
        <button type="button" aria-pressed={only === "waiting"} onClick={() => setOnly(only === "waiting" ? null : "waiting")} className={PILL + " bg-surface-2 text-ink-2 hover:bg-surface-3" + ring(only === "waiting")}>
          <Count n={c.waiting} className="text-[max(1.875rem,20px)] font-light text-warn" />
          waiting for a TA to accept
        </button>
        <Link href="/strategy/submissions" className={PILL + " bg-surface-2 text-ink-2 hover:bg-surface-3"}>
          <Count n={c.unread} className="text-[max(1.875rem,20px)] font-light text-brand" />
          {c.unread === 1 ? "new submission to read" : "new submissions to read"}
        </Link>

        <div className="ml-auto flex items-center gap-[max(1rem,8px)] max-lg:ml-0">
          <div className="flex rounded-full bg-surface-2 p-1">
            {(["board", "matrix", "week"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={"relative whitespace-nowrap rounded-full px-[max(1.25rem,12px)] py-[max(0.625rem,7px)] text-small transition-colors " + (view === v ? "bg-surface font-medium text-ink shadow-card" : "text-ink-3 hover:text-ink")}
              >
                {v === "board" ? "Board" : v === "matrix" ? "Matrix" : "Team week"}
              </button>
            ))}
          </div>
          <Link href="/strategy/manage" className="flex h-[max(3.125rem,38px)] items-center whitespace-nowrap rounded-full bg-surface-2 px-[max(1.25rem,12px)] text-small text-ink transition-colors hover:bg-surface-3">
            Strategy list
          </Link>
          <FilterSort who={who} setWho={setWho} p={p} setP={setP} sort={sort} setSort={setSort} on={filtered} />
        </div>
      </div>

      <div ref={stage} className="mt-[max(2.25rem,16px)] flex min-h-0 flex-1 flex-col">
        {view === "week" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 pb-16 text-center">
            <p className="text-h3 font-medium text-ink">Team week is not designed yet</p>
            <p className="text-small text-ink-3">Each job&apos;s own plan shows its team&apos;s week. Open one from the board.</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-16 text-center">
            <p className="text-h3 font-medium text-ink">{only === "unplanned" ? "Every open job has a plan" : only === "waiting" ? "Nothing is waiting to be accepted" : "No job matches"}</p>
            <button type="button" onClick={() => (setOnly(null), setWho("all"), setP(0))} className="text-small font-medium text-brand hover:underline">
              Show every job
            </button>
          </div>
        ) : view === "board" ? (
          <div className="-mx-2 grid min-h-0 flex-1 auto-rows-max grid-cols-4 gap-[max(1.5rem,12px)] overflow-y-auto px-2 pb-6 pt-1 [scrollbar-width:thin] max-xl:grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {jobs.map((j) => (
              <JobCard key={j.id} j={j} rows={rows} onOpen={() => router.push(plan(j))} />
            ))}
          </div>
        ) : (
          <Matrix jobs={jobs} rows={rows} say={(bold, rest) => setToast({ key: Date.now(), bold, rest })} />
        )}
      </div>

      {view !== "week" && (
        <ul className="flex min-h-[max(4.5rem,40px)] flex-wrap items-center gap-x-5 gap-y-1 lg:pr-[26rem] text-caption text-ink-3 max-md:hidden">
          {view === "board"
            ? (
                [
                  ["bg-warn", "Waiting to accept"],
                  ["bg-info", "Working on it"],
                  ["bg-brand", "Submitted"],
                  ["bg-surface-3", "Not started"],
                ] as const
              ).map(([cls, t]) => (
                <li key={t} className="flex items-center gap-2">
                  <span className={"h-1.5 w-5 rounded-full " + cls} />
                  {t}
                </li>
              ))
            : (
                [
                  ["size-1.5 rounded-full bg-border-strong", "Not chosen"],
                  ["size-3.5 rounded-full border-2 border-dashed border-brand", "Chosen, nobody on it"],
                  ["size-3.5 rounded-full border-2 border-warn", "Waiting to accept"],
                  ["size-3.5 rounded-full bg-info-soft", "Working on it"],
                  ["size-3.5 rounded-full bg-brand", "Done & submitted"],
                  ["h-0.5 w-3 bg-ink-3", "Not for this job"],
                ] as const
              ).map(([cls, t]) => (
                <li key={t} className="flex items-center gap-2">
                  <span className={cls} />
                  {t}
                </li>
              ))}
        </ul>
      )}

      {/* AURA offers to plan every job nobody has planned (it opens the first one). */}
      {firstUnplanned && view !== "week" && (
        <Link
          href={plan(firstUnplanned) + "&aura=1"}
          className="absolute bottom-[max(1.5rem,12px)] right-[max(2.25rem,12px)] flex items-center gap-[max(0.875rem,10px)] rounded-full bg-surface py-2 pl-2 pr-[max(1.5rem,14px)] shadow-aura transition-shadow hover:shadow-float"
        >
          <span className="flex size-[max(3.5rem,38px)] shrink-0 items-center justify-center overflow-hidden rounded-full bg-black">
            <Image src="/aura-mark.png" alt="" width={56} height={56} className="size-full" />
          </span>
          <span>
            <span className="block text-body font-medium text-ink">Plan the {c.unplanned} with AURA</span>
            <span className="block text-caption text-ink-3 max-sm:hidden">Suggests strategies and who has room</span>
          </span>
        </Link>
      )}
      {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} />}
    </div>
  );
}

/** One open job on the board: the client, the TAs on it, the title, one bar segment per
 *  strategy (submitted, working, waiting, not started) and where it stands. */
function JobCard({ j, rows, onOpen }: { j: Job; rows: Row[]; onOpen: () => void }) {
  const live = liveRows(rows, j.id);
  const st = jobStatus(rows, j.id);
  return (
    <button
      type="button"
      data-card
      onClick={onOpen}
      className="flex min-h-[max(14.75rem,170px)] flex-col rounded-lg bg-canvas p-[max(1.5rem,14px)] text-left transition-[background-color,box-shadow] hover:bg-surface hover:shadow-float"
    >
      <span className="flex w-full items-center gap-3">
        <span className="flex size-[max(2.5rem,30px)] shrink-0 items-center justify-center rounded-sm bg-surface text-small font-medium text-ink shadow-card">{j.client[0]}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small font-medium text-ink">{j.client}</span>
          <span className="block text-caption text-ink-3">Assigned {j.assigned}</span>
        </span>
        <span className="flex -space-x-1.5">
          {j.tas.map((t) => (
            <Initials key={t} id={t} size="sm" />
          ))}
        </span>
      </span>
      <span className="mt-[max(1.25rem,10px)] line-clamp-2 text-[max(1.375rem,16px)] leading-snug text-ink">{j.title}</span>
      <span className="mt-auto pt-[max(1.5rem,12px)]">
        {live.length ? (
          <span className="flex gap-1">
            {live.map((x) => (
              <span key={x.name} title={`${x.name} · ${x.state === "open" ? "nobody on it yet" : x.state}`} className={"h-[max(0.4375rem,5px)] flex-1 rounded-full " + BAR[x.state]} />
            ))}
          </span>
        ) : (
          <span className="block border-t-2 border-dashed border-border-strong" />
        )}
        <span className="mt-[max(1.25rem,10px)] flex items-center gap-2 text-small">
          <span className={"size-2 rounded-full " + DOT[st.kind]} />
          <span className="text-ink-2">{st.text}</span>
          {st.kind === "none" ? (
            <span className="ml-auto flex items-center gap-1.5 font-medium text-ink">
              Plan
              <svg data-nudge viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          ) : (
            <span className="ml-auto text-ink-3">
              {st.count} {st.count === 1 ? "strategy" : "strategies"}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/** Every job against every strategy. A cell shows the strategy's state on that job;
 *  pressing one opens who and when beside it. */
function Matrix({ jobs, rows, say }: { jobs: Job[]; rows: Row[]; say: (bold: string, rest: string) => void }) {
  const [open, setOpen] = useState<{ job: Job; name: string; at: DOMRect } | null>(null);
  const cell = (j: Job, n: string) => rows.find((x) => x.job === j.id && x.name === n);
  const groups = groupsOf(useCatalogue(), rows);
  const STRATEGIES = namesOf(groups);
  const COL = "w-[max(4.25rem,44px)] shrink-0";
  const JOBCOL = "sticky left-0 z-10 w-[max(25rem,200px)] shrink-0 bg-inherit pr-4";

  return (
    <div className="min-h-0 flex-1 overflow-auto pb-24 [scrollbar-width:thin]">
      <div className="w-max min-w-full">
        {/* The strategy groups, then the strategies' names written up at an angle. */}
        <div className="flex bg-surface">
          <div className={JOBCOL} />
          {groups.map((g) => (
            <div key={g.name} style={{ width: `calc(${g.items.length} * max(4.25rem, 44px))` }} className="shrink-0 px-1">
              <p className={"rounded-sm px-2.5 py-1 text-caption font-medium " + g.band}>{g.name}</p>
            </div>
          ))}
        </div>
        <div className="flex h-[max(9.5rem,110px)] bg-surface">
          <div className={JOBCOL} />
          {STRATEGIES.map((n) => (
            <div key={n} className={COL + " relative"}>
              <span className="absolute bottom-3 left-1/2 origin-bottom-left -rotate-[55deg] whitespace-nowrap text-small text-ink-2">{n}</span>
            </div>
          ))}
        </div>
        {jobs.map((j, i) => {
          const planned = liveRows(rows, j.id).length > 0;
          return (
            <div key={j.id} className={"flex items-center rounded-md " + (i % 2 ? "bg-surface" : "bg-canvas")}>
              <Link href={`/strategy/plan?job=${j.id}`} className={JOBCOL + " rounded-l-md py-[max(0.75rem,7px)] pl-[max(1.125rem,10px)] hover:underline"}>
                <span className="block truncate text-small font-medium text-ink">{j.title}</span>
                <span className={"block truncate text-caption " + (planned ? "text-ink-3" : "text-danger")}>
                  {j.client} · P{j.p}
                  {planned ? "" : " · not planned"}
                </span>
              </Link>
              {STRATEGIES.map((n) => {
                const x = cell(j, n);
                return (
                  <div key={n} className={COL + " flex justify-center"}>
                    <button
                      type="button"
                      aria-label={`${n} on ${j.title}: ${x ? (x.state === "na" ? "not for this job" : x.ta ? `${ta(x.ta).name}, ${x.state}` : "chosen, nobody on it") : "not chosen"}`}
                      onClick={(e) => setOpen({ job: j, name: n, at: e.currentTarget.getBoundingClientRect() })}
                      className="group flex size-[max(2.75rem,30px)] items-center justify-center rounded-full"
                    >
                      <Cell x={x} active={open?.job.id === j.id && open.name === n} />
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {open && (
        <AssignPanel
          key={open.job.id + open.name}
          anchor={open.at}
          name={open.name}
          jobTitle={open.job.title}
          row={cell(open.job, open.name)}
          onClose={() => setOpen(null)}
          onAssign={(a) => {
            const was = cell(open.job, open.name);
            saveRow({ job: open.job.id, name: open.name, state: "waiting", ta: a.ta, when: a.when, days: a.days, assigned: "today" });
            setOpen(null);
            say(open.name, was?.ta && was.ta !== a.ta ? ` moved to ${ta(a.ta).first}, who gets a bell` : ` given to ${ta(a.ta).first}, who gets a bell`);
          }}
          onStrike={(na) => {
            if (na) saveRow({ job: open.job.id, name: open.name, state: "na" });
            else setRows((rs) => rs.filter((x) => !(x.job === open.job.id && x.name === open.name)));
            setOpen(null);
            say(open.name, na ? " struck for this job" : " can be used again");
          }}
          onRemove={() => {
            setRows((rs) => rs.filter((x) => !(x.job === open.job.id && x.name === open.name)));
            setOpen(null);
            say(open.name, " taken off this job");
          }}
        />
      )}
    </div>
  );
}

function Cell({ x, active }: { x?: Row; active: boolean }) {
  if (active || !x)
    return (
      <>
        <span className={"size-1.5 rounded-full bg-border-strong " + (active ? "hidden" : "group-hover:hidden group-focus-visible:hidden")} />
        <span className={"size-[max(2.75rem,30px)] items-center justify-center rounded-full border-[1.5px] border-ink bg-surface text-h3 text-ink " + (active ? "flex" : "hidden group-hover:flex group-focus-visible:flex")}>+</span>
      </>
    );
  if (x.state === "na") return <span className="h-0.5 w-3.5 bg-ink-3" />;
  if (x.state === "open") return <span className="size-[max(2.25rem,26px)] rounded-full border-2 border-dashed border-brand group-hover:bg-brand-tint" />;
  if (x.state === "done")
    return (
      <span className="flex size-[max(2.25rem,26px)] items-center justify-center rounded-full bg-brand text-white transition-transform group-hover:scale-110">
        <CheckIcon className="size-1/2" />
      </span>
    );
  return (
    <span className="transition-transform group-hover:scale-110">
      <Initials id={x.ta!} ring={x.state === "waiting"} />
    </span>
  );
}

/** Narrow the board or matrix: by TA, by priority, and the order. */
function FilterSort(props: { who: TaId | "all"; setWho: (v: TaId | "all") => void; p: number; setP: (v: number) => void; sort: Sort; setSort: (v: Sort) => void; on: boolean }) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const chip = (on: boolean) => "rounded-full px-3 py-1.5 text-small transition-colors " + (on ? "bg-ink text-white" : "bg-surface-2 text-ink-2 hover:bg-surface-3");
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-[max(3.125rem,38px)] items-center gap-2 whitespace-nowrap rounded-full bg-surface-2 px-[max(1.25rem,12px)] text-small text-ink transition-colors hover:bg-surface-3"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
          <path d="M4 7h16M7 12h10M10 17h4" />
        </svg>
        Filter &amp; sort
        {props.on && <span className="size-1.5 rounded-full bg-brand" />}
      </button>
      {shown && (
        <div ref={panel} className="absolute right-0 top-full z-30 mt-2 w-[max(20rem,250px)] rounded-lg bg-surface p-4 shadow-float">
          <p className="mb-2 text-caption font-medium uppercase text-ink-3">TA</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" role="menuitem" className={chip(props.who === "all")} onClick={() => props.setWho("all")}>
              Everyone
            </button>
            {TAS.map((t) => (
              <button key={t.id} type="button" role="menuitem" className={chip(props.who === t.id)} onClick={() => props.setWho(t.id)}>
                {t.first}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-4 text-caption font-medium uppercase text-ink-3">Priority</p>
          <div className="flex flex-wrap gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="menuitem" className={chip(props.p === n)} onClick={() => props.setP(n)}>
                {n ? `P${n}` : "Any"}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-4 text-caption font-medium uppercase text-ink-3">Sort</p>
          <div className="flex flex-wrap gap-1.5">
            {SORTS.map(([v, t]) => (
              <button key={v} type="button" role="menuitem" className={chip(props.sort === v)} onClick={() => props.setSort(v)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
