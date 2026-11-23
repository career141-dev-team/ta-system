"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Image from "next/image";
import { DUR, EASE, MOTION, gsap, useSwap } from "@/lib/gsap";
import { personOf, useRole, useSignedInPerson } from "@/lib/role";
import { door, queryOnce, useLive } from "@/lib/backend";
import Count from "../Count";
import { CardsSkeleton } from "../Skeleton";
import { useLiftMenu } from "../openings/[id]/liftMenu";
import {
  EVENTS,
  GOAL,
  GROUPS,
  HOURS,
  RETENTION_DAYS,
  colomboDay,
  csv,
  datesOf,
  groupOf,
  hm,
  team,
  totals,
  weekday,
  workdays,
  type Range,
  type Ta,
} from "./data";

// TA Track (owner's designs TT1 "the team" and TT2 "one TA", 14 Nov 2026): what the
// Work From Home Tracker records, read beside the TA System's own numbers. Today /
// This week / This month / Custom (the tracker keeps 30 days), All TAs / One TA, and
// the tracker's CSV. A TA sees only themself. Sample data (./data.ts) built in the
// browser, so the server and the browser never disagree about "today".
//
// Motion (DESIGN.md "draw-in"): rings, the donut, bars and the trend line draw from
// zero when shown and when the range or person changes; numbers count up. Start
// states are set at once, never on a first tick.

type Scope = "all" | "one";
const RANGES: [Range, string][] = [
  ["today", "Today"],
  ["week", "This week"],
  ["month", "This month"],
  ["custom", "Custom"],
];

export default function TaTrackView() {
  // False on the server and while React takes the page over, true after: the sample
  // is built only in the browser.
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  // Old system: an Admin or TA Lead sees every TA; anyone else sees only themself
  // (owner 14 Nov 2026: TA Track was missing from a TA's top bar). Follows "View as".
  const role = useRole();
  useSignedInPerson(); // the signed-in name, when it arrives
  if (!ready) return <CardsSkeleton />;
  return <Track key={role} viewAll={role === "Lead" || role === "Admin" || role === "Director"} me={personOf(role).name.split(" ")[0]} />;
}

/** Signed in (R3, 21 Nov 2026): ui/track:report for the dates on screen plus this week,
 *  read once and again every 2 minutes while the tab is shown - never a live
 *  subscription, which would re-read every row on each tracker upload. Same shape as
 *  the sample; what the backend does not count yet (shortlists, placements) reads 0. */
function useTrackLive(live: boolean, from: string, to: string) {
  const [got, setGot] = useState<{ key: string; tas?: Ta[]; message?: string }>();
  const key = `${from}|${to}`;
  useEffect(() => {
    if (!live) return;
    let gone = false;
    const read = async () => {
      const r = (await queryOnce(door.track, { from, to }).catch(() => undefined)) as { ok: true; people: Ta[] } | { ok: false; message: string } | undefined;
      if (gone) return;
      if (!r) return setGot((g) => ({ key, tas: g?.tas, message: "Could not reach the TA System. Reload the page in a minute." }));
      if (!r.ok) return setGot({ key, message: r.message });
      setGot({ key, tas: r.people.map((p) => ({ ...p, days: p.days.map((d) => ({ ...d, shortlists: 0, placements: 0 })) })) });
    };
    void read();
    const timer = setInterval(() => document.visibilityState === "visible" && void read(), 120_000);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [live, from, to, key]);
  return got;
}

function Track({ viewAll, me }: { viewAll: boolean; me: string }) {
  const live = useLive();
  // The clock read once, for "last upload N min ago" and the 30-day limit.
  const [now] = useState(() => Date.now());
  const [range, setRange] = useState<Range>("week");
  const [custom, setCustom] = useState<[string, string]>(() => [colomboDay(Date.now() - 6 * 86400000), colomboDay()]);
  const [scope, setScope] = useState<Scope>(viewAll ? "all" : "one");
  const dates = useMemo(() => datesOf(range, custom), [range, custom]);
  const week = datesOf("week", ["", ""]);
  const got = useTrackLive(live, dates[0] < week[0] ? dates[0] : week[0], dates.at(-1)! > week.at(-1)! ? dates.at(-1)! : week.at(-1)!);
  const tas = live ? (got?.tas ?? []) : team();
  const [personId, setPersonId] = useState(() => (tas.find((t) => t.name === me) ?? tas[0])?.id ?? "");
  const person = tas.find((t) => t.id === personId) ?? tas.find((t) => t.name.split(" ")[0] === me) ?? tas[0];
  const body = useRef<HTMLDivElement>(null);
  useSwap(body, `${scope}-${personId}-${range}-${custom.join()}`);

  const open = (id: string) => {
    setPersonId(id);
    setScope("one");
  };
  const download = () => {
    if (!person) return;
    const url = URL.createObjectURL(new Blob([csv(scope === "all" ? tas : [person], dates)], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `ta-track-${scope === "one" ? person.name.toLowerCase() + "-" : ""}${dates[0]}-to-${dates.at(-1)}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-[max(1rem,10px)] pb-[max(1rem,10px)] pt-[max(2.25rem,22px)] max-md:pt-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pl-[max(0.25rem,4px)] pr-[calc(max(0.25rem,4px)+15px)]">
        {scope === "all" || !person ? (
          <h1 className="text-h1 font-light text-ink">TA Track</h1>
        ) : (
          <PersonPicker tas={tas} person={person} onPick={setPersonId} locked={!viewAll} />
        )}
        <div className="flex-1" />
        <Pills
          label="Range"
          value={range}
          options={RANGES}
          onPick={(r) => setRange(r)}
          extra={range === "custom" && <CustomDates value={custom} onChange={setCustom} now={now} />}
        />
        {viewAll && (
          <Pills
            label="Who"
            value={scope}
            options={[
              ["all", "All TAs"],
              ["one", "One TA"],
            ]}
            onPick={setScope}
          />
        )}
        <button
          type="button"
          onClick={download}
          aria-label="Download the activity as CSV"
          title="Download the activity as CSV (the tracker's columns)"
          className="flex size-[max(2.75rem,36px)] items-center justify-center rounded-full bg-surface text-ink-2 shadow-card hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
            <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
          </svg>
        </button>
      </div>

      <div ref={body} className="mt-[max(1rem,10px)] min-h-0 flex-1 overflow-y-auto px-[max(0.25rem,4px)] pb-2">
        {live && !got?.tas ? (
          got?.message ? <p role="alert" className="rounded-lg bg-surface p-6 text-body text-ink-2 shadow-card">{got.message}</p> : <CardsSkeleton />
        ) : !person ? (
          <p className="rounded-lg bg-surface p-6 text-body text-ink-2 shadow-card">No TAs on the desk yet.</p>
        ) : scope === "all" ? (
          <TeamView tas={tas} dates={dates} range={range} onOpen={open} live={live} />
        ) : (
          <OneView ta={person} dates={dates} range={range} now={now} live={live} />
        )}
        {live && got?.tas && got.message && <p className="mt-3 text-small text-warn">{got.message}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the team */

function TeamView({ tas, dates, range, onOpen, live }: { tas: Ta[]; dates: string[]; range: Range; onOpen: (id: string) => void; live: boolean }) {
  const days = Math.max(1, workdays(dates));
  const goalH = GOAL.activeHoursPerDay * days;
  const goalCv = GOAL.cvsPerDay * days;
  const rows = tas.map((ta) => ({ ta, t: totals(ta, dates) })).sort((a, b) => b.t.cvs - a.t.cvs);
  const top = rows[0];
  const word = range === "today" ? "today" : range === "week" ? "this week" : range === "month" ? "this month" : "in this range";
  const root = useDraw(`${dates[0]}-${dates.at(-1)}`);

  // Where the time goes: active time by group, all TAs.
  const groups = GROUPS.map((g) => ({ ...g, ms: 0 }));
  for (const { t } of rows) for (const s of t.sites) groups.find((g) => g.name === groupOf(s.domain).name)!.ms += s.activeMs;
  const allMs = groups.reduce((n, g) => n + g.ms, 0) || 1;
  const avgH = Math.round(allMs / rows.length / 3600000);

  return (
    <div ref={root} className="grid grid-cols-[1.98fr_1fr] gap-[max(1.5rem,12px)] max-lg:grid-cols-1">
      <Card title={`The team ${word}`} sub={`Outer ring: active hours (goal ${goalH}h) · inner ring: CVs to Director (goal ${goalCv})`}>
        <Rings rows={rows} goalH={goalH} goalCv={goalCv} topId={top?.ta.id} topWord={word} onOpen={onOpen} />
      </Card>

      <Card title="Where the time goes" sub="Active time, all TAs">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <Donut groups={groups.map((g) => ({ name: g.name, color: g.color, share: g.ms / allMs }))} center={`${avgH}h`} caption="avg / TA" />
          <ul className="flex min-w-[12rem] flex-1 flex-col gap-2.5">
            {groups.map((g) => (
              <li key={g.name} className="flex items-center gap-3 text-small text-ink-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden="true" />
                <span className="flex-1">{g.name}</span>
                <span className="tabular-nums text-ink">{Math.round((g.ms / allMs) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <div className="col-span-full grid grid-cols-[1.3fr_1.05fr_1fr] gap-[max(1.5rem,12px)] max-lg:grid-cols-2 max-md:grid-cols-1">
        <Card title="CVs to Director" sub={`${word[0].toUpperCase()}${word.slice(1)}, by TA`}>
          <ul className="flex flex-col gap-3">
            {rows.map(({ ta, t }, i) => {
              const max = rows[0].t.cvs || 1;
              const low = t.cvs < goalCv / 2;
              return (
                <li key={ta.id}>
                  <button type="button" onClick={() => onOpen(ta.id)} className="group flex w-full items-center gap-3 text-left" title={`Open ${ta.name}`}>
                    <span className="w-[6.5rem] shrink-0 truncate text-small text-ink-2 group-hover:text-ink">{ta.name}</span>
                    <span className="relative h-5 flex-1">
                      <span
                        data-draw="bar"
                        className={"absolute inset-y-0 left-0 rounded-full " + (i === 0 ? "bg-brand" : low ? "bg-warn" : "bg-brand-soft")}
                        style={{ width: `${(t.cvs / max) * 100}%` }}
                      />
                    </span>
                    <Count n={t.cvs} className="w-8 text-small text-ink" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
        {/* Signed in: shortlists and placements are not counted per TA yet (R3) - no sample numbers. */}
        {!live && <Card
          title="Placements & shortlists"
          sub="Last 8 weeks"
          aside={
            <span className="flex flex-wrap gap-3 text-caption text-ink-3">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-brand" />
                Director shortlists
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-success" />
                Placements
              </span>
            </span>
          }
        >
          <Trend tas={tas} />
        </Card>}
        <StandsOut tas={tas} rows={rows} word={word} onOpen={onOpen} />
      </div>
    </div>
  );
}

/** One ring per TA: active hours outside, CVs to Director inside. A click opens them. */
function Rings({
  rows,
  goalH,
  goalCv,
  topId,
  topWord,
  onOpen,
}: {
  rows: { ta: Ta; t: ReturnType<typeof totals> }[];
  goalH: number;
  goalCv: number;
  topId?: string;
  topWord: string;
  onOpen: (id: string) => void;
}) {
  const strip = useRef<HTMLUListElement>(null);
  const [more, setMore] = useState(false);
  const [back, setBack] = useState(false);
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const check = () => {
      setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
      setBack(el.scrollLeft > 4);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    addEventListener("resize", check);
    return () => {
      el.removeEventListener("scroll", check);
      removeEventListener("resize", check);
    };
  }, []);
  return (
    <div className="relative">
      <ul ref={strip} className="flex gap-[max(1.5rem,14px)] overflow-x-auto pb-2 [scrollbar-width:none]">
        {rows.map(({ ta, t }) => (
          <li key={ta.id} className="shrink-0">
            <button type="button" onClick={() => onOpen(ta.id)} title={`Open ${ta.name}`} className="flex w-[max(8.5rem,112px)] flex-col items-center gap-1 rounded-md py-1">
              <Ring outer={(t.activeMs / 3600000) / goalH} inner={t.cvs / goalCv} label={ta.name.slice(0, 2).toUpperCase()} />
              <span className="mt-2 text-body font-medium text-ink">{ta.name}</span>
              <span className="text-caption text-ink-3">
                {Math.round(t.activeMs / 3600000)}h · {t.cvs} CVs
              </span>
              {ta.id === topId && <span className="mt-1 rounded-full bg-warn-soft px-2 py-0.5 text-caption font-medium text-warn">★ Top {topWord.replace("this ", "")}</span>}
            </button>
          </li>
        ))}
      </ul>
      {back && (
        <button
          type="button"
          onClick={() => strip.current?.scrollBy({ left: -strip.current.clientWidth * 0.8, behavior: "smooth" })}
          aria-label="Earlier TAs"
          className="absolute left-0 top-[max(3.6rem,46px)] flex size-9 items-center justify-center rounded-full bg-surface text-ink shadow-float"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
      )}
      {more && (
        <button
          type="button"
          onClick={() => strip.current?.scrollBy({ left: strip.current.clientWidth * 0.8, behavior: "smooth" })}
          aria-label="More TAs"
          className="absolute right-0 top-[max(3.6rem,46px)] flex size-9 items-center justify-center rounded-full bg-surface text-ink shadow-float"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true" data-nudge>
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      )}
    </div>
  );
}

function Ring({ outer, inner, label }: { outer: number; inner: number; label: string }) {
  const arc = (r: number, share: number, cls: string, track: string) => (
    <>
      <circle cx="60" cy="60" r={r} fill="none" strokeWidth="7" className={track} />
      <circle
        data-draw="arc"
        data-to={Math.min(1, share) * 100}
        cx="60"
        cy="60"
        r={r}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${Math.min(1, share) * 100} 100`}
        className={cls}
        transform="rotate(-90 60 60)"
      />
    </>
  );
  return (
    <span className="relative flex size-[max(8.25rem,104px)] items-center justify-center" title={`${Math.round(outer * 100)}% of the hours goal · ${Math.round(inner * 100)}% of the CV goal`}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 size-full" aria-hidden="true">
        {arc(54, outer, "stroke-brand", "stroke-surface-2")}
        {arc(43, inner, "stroke-brand-leaf", "stroke-surface-2")}
      </svg>
      <span className="text-body font-medium text-ink-2">{label}</span>
    </span>
  );
}

/** The donut of where time goes; each part draws round in turn. */
function Donut({ groups, center, caption }: { groups: { name: string; color: string; share: number }[]; center: string; caption: string }) {
  const starts = groups.map((_, i) => groups.slice(0, i).reduce((n, g) => n + g.share, 0));
  return (
    <span className="relative flex size-[max(14.5rem,170px)] shrink-0 items-center justify-center">
      <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        {groups.map((g, i) => {
          const from = starts[i];
          const len = Math.max(0, g.share * 100 - 0.8);
          return (
            <circle
              key={g.name}
              data-draw="arc"
              data-to={len}
              cx="60"
              cy="60"
              r="50"
              fill="none"
              strokeWidth="16"
              pathLength={100}
              strokeDasharray={`${len} 100`}
              strokeDashoffset={-from * 100}
              style={{ stroke: g.color }}
            >
              <title>{`${g.name} ${Math.round(g.share * 100)}%`}</title>
            </circle>
          );
        })}
      </svg>
      <span className="flex flex-col items-center">
        <span className="text-h1 font-light text-ink">{center}</span>
        <span className="text-caption text-ink-3">{caption}</span>
      </span>
    </span>
  );
}

/** Director shortlists (filled line) and placements (dotted), the last 8 weeks. */
function Trend({ tas }: { tas: Ta[] }) {
  // ponytail: the sample keeps 30 days, so the earlier weeks are drawn from a fixed
  // run; with the backend this is one weekly count query.
  const short = [9, 12, 10, 15, 17, 15, 20, 23];
  const recent = tas.reduce((n, ta) => n + totals(ta, datesOf("week", ["", ""])).shortlists, 0);
  short[7] = Math.max(short[7], recent);
  const placed = [1, 0, 1, 1, 2, 1, 2, 3];
  const max = Math.max(...short) * 1.15;
  const pt = (v: number, i: number) => `${(i / 7) * 100},${48 - (v / max) * 46}`;
  const line = short.map(pt).join(" ");
  return (
    <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="h-[max(14rem,150px)] w-full overflow-visible" role="img" aria-label="Director shortlists and placements over the last 8 weeks">
      <polygon data-draw="fade" points={`0,50 ${line} 100,50`} className="fill-brand-tint" />
      <polyline data-draw="line" points={line} fill="none" strokeWidth="0.8" vectorEffect="non-scaling-stroke" className="stroke-brand" pathLength={100} strokeDasharray="100 100" />
      <polyline points={placed.map((v, i) => pt(v * 4, i)).join(" ")} fill="none" strokeWidth="1.6" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" className="stroke-success" data-draw="fade" />
      <circle cx="100" cy={48 - (short[7] / max) * 46} r="1.4" className="fill-brand" data-draw="fade" />
    </svg>
  );
}

/** AURA's notes, read off the numbers with plain rules - never invented. */
function StandsOut({ tas, rows, word, onOpen }: { tas: Ta[]; rows: { ta: Ta; t: ReturnType<typeof totals> }[]; word: string; onOpen: (id: string) => void }) {
  const notes: { text: string; tone: string; id?: string }[] = [];
  const top = rows[0];
  if (top) notes.push({ text: `${top.ta.name} sent the most CVs to the Director ${word} — ${top.t.cvs}.`, tone: "bg-brand-tint text-ink", id: top.ta.id });
  // Idle time: the last two working days against the days before them.
  let worst: { ta: Ta; ratio: number } | null = null;
  for (const ta of tas) {
    const d = ta.days.slice(-8);
    const idle = (xs: typeof d) => xs.reduce((n, x) => n + x.sites.reduce((m, s) => m + s.idleMs, 0), 0) / Math.max(1, xs.length);
    const ratio = idle(d.slice(-2)) / Math.max(1, idle(d.slice(0, -2)));
    if (ratio >= 1.6 && (!worst || ratio > worst.ratio)) worst = { ta, ratio };
  }
  if (worst) notes.push({ text: `${worst.ta.name}’s idle time is up ${worst.ratio >= 1.95 ? "to double" : `${Math.round((worst.ratio - 1) * 100)}%`} over the last two days. Worth a check-in.`, tone: "bg-warn-soft text-ink", id: worst.ta.id });
  // LinkedIn time this week against last week.
  const li = (dates: string[]) => tas.reduce((n, ta) => n + totals(ta, dates).sites.filter((s) => s.domain.includes("linkedin")).reduce((m, s) => m + s.activeMs, 0), 0) / Math.max(1, workdays(dates));
  const thisWeek = datesOf("week", ["", ""]);
  const lastWeek = datesOf("custom", [shift(thisWeek[0], -7), shift(thisWeek[0], -1)]);
  // Only when both weeks have LinkedIn time: no tracker data read "down 100%" (21 Nov).
  const [now, before] = [li(thisWeek), li(lastWeek)];
  const change = Math.round((now / Math.max(1, before) - 1) * 100);
  if (now > 0 && before > 0 && Math.abs(change) >= 5) notes.push({ text: `LinkedIn time is ${change > 0 ? "up" : "down"} ${Math.abs(change)}% a day on last week.`, tone: "bg-info-soft text-ink" });
  return (
    <Card
      title="What stands out"
      icon={<Image src="/aura-mark.png" alt="" width={40} height={40} className="size-[max(2.5rem,32px)] rounded-full" />}
    >
      <ul className="flex flex-col gap-3">
        {notes.map((n) => (
          <li key={n.text}>
            {n.id ? (
              <button type="button" onClick={() => onOpen(n.id!)} className={"w-full rounded-md px-4 py-3.5 text-left text-small hover:brightness-[0.98] " + n.tone}>
                {n.text}
              </button>
            ) : (
              <p className={"rounded-md px-4 py-3.5 text-small " + n.tone}>{n.text}</p>
            )}
          </li>
        ))}
        {!notes.length && <p className="text-small text-ink-3">Nothing unusual {word}.</p>}
      </ul>
    </Card>
  );
}
const shift = (date: string, n: number) => colomboDay(Date.parse(`${date}T12:00:00+05:30`) + n * 86400000);

/* ------------------------------------------------------------------ one TA */

function OneView({ ta, dates, range, now, live }: { ta: Ta; dates: string[]; range: Range; now: number; live: boolean }) {
  const t = totals(ta, dates);
  const days = Math.max(1, workdays(dates));
  const today = colomboDay();
  const todayT = totals(ta, [today]);
  const word = range === "today" ? "today" : range === "week" ? "this week" : range === "month" ? "this month" : "in this range";
  const root = useDraw(`${ta.id}-${dates[0]}-${dates.at(-1)}`);
  const goalH = GOAL.activeHoursPerDay * days;
  // ponytail: today's set and Excel profiles come from the TA System; sample values.
  const inSet = Math.min(GOAL.setSize, todayT.cvs);
  const excel = (ta.name.length % 4) + 1;
  let streak = 0;
  for (const d of [...ta.days].reverse()) {
    if (d.date === today) continue;
    if (d.cvsToDirector >= GOAL.cvsPerDay) streak++;
    else break;
  }
  const week = datesOf("week", ["", ""]);

  return (
    <div ref={root} className="grid grid-cols-[1fr_2.05fr] gap-[max(1.5rem,12px)] max-lg:grid-cols-1">
      <Card>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <span className="relative size-[max(15rem,180px)] shrink-0">
            <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
              {(
                [
                  [56, t.activeMs / 3600000 / goalH, "stroke-brand"],
                  [46, inSet / GOAL.setSize, "stroke-brand-leaf"],
                  [36, excel / GOAL.excelProfilesPerDay, "stroke-info"],
                ] as const
              ).filter(([r]) => !live || r !== 36).map(([r, share, cls]) => (
                <g key={r}>
                  <circle cx="60" cy="60" r={r} fill="none" strokeWidth="7" className="stroke-surface-2" />
                  <circle data-draw="arc" data-to={Math.min(1, share) * 100} cx="60" cy="60" r={r} fill="none" strokeWidth="7" strokeLinecap="round" pathLength={100} strokeDasharray={`${Math.min(1, share) * 100} 100`} className={cls} />
                </g>
              ))}
            </svg>
          </span>
          <ul className="flex flex-col gap-5">
            <Stat dot="bg-brand" big={hm(t.activeMs)} small={`active of ${goalH}h`} />
            <Stat dot="bg-brand-leaf" big={`${inSet} / ${GOAL.setSize}`} small="CVs in today’s set" />
            {!live && <Stat dot="bg-info" big={`${excel} / ${GOAL.excelProfilesPerDay}`} small="Excel profiles today" />}
          </ul>
        </div>
        {streak >= 2 && <p className="mt-5 self-start rounded-full bg-warn-soft px-3 py-1.5 text-small font-medium text-warn">🔥 {streak} days of full sets in a row</p>}
      </Card>

      {/* The hour timeline is sample data (the tracker keeps day totals) - signed in, the days chart. */}
      {range === "today" && !live ? <DayTimeline /> : <DaysChart ta={ta} dates={dates} word={word} />}

      <div className="col-span-full grid grid-cols-[1.3fr_1.05fr_1fr] gap-[max(1.5rem,12px)] max-lg:grid-cols-2 max-md:grid-cols-1">
        <Card title={`Websites ${word}`} sub="Time on site · the bar is the active share · click one for detail">
          <Sites t={t} />
        </Card>
        <Card title="CVs to Director" sub="This week">
          <WeekBars ta={ta} week={week} />
        </Card>
        <Tracking ta={ta} now={now} />
      </div>
    </div>
  );
}

function Stat({ dot, big, small }: { dot: string; big: string; small: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={"mt-3 size-3 shrink-0 rounded-full " + dot} aria-hidden="true" />
      <span className="flex flex-col">
        <span className="text-h2 font-normal text-ink">{big}</span>
        <span className="text-caption text-ink-3">{small}</span>
      </span>
    </li>
  );
}

/** The day by hour. Sample hours: the tracker keeps day totals today (see data.ts). */
function DayTimeline() {
  const start = 9;
  const end = 18;
  const span = end - start;
  const pos = (h: number) => `${((Math.max(start, h) - start) / span) * 100}%`;
  const tone = { brand: "bg-brand-tint", violet: "bg-violet-soft", plain: "bg-surface-2", info: "bg-info-soft", warn: "bg-warn-soft" };
  const at = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", ...o }).format(new Date());
  const date = `${at({ weekday: "long" })}, ${at({ day: "numeric", month: "short" })}`;
  return (
    <Card title={date} sub="Started 8:52 · from the browser tracker and workday">
      <div className="relative mt-4 h-[max(4rem,48px)]">
        {HOURS.map((b) => (
          <span
            key={b.from}
            data-draw="bar"
            title={`${b.kind === "active" ? "Active" : b.kind === "idle" ? "Idle" : "Away"} ${fmt(b.from)}–${fmt(b.to)}`}
            className={"absolute inset-y-0 rounded-sm " + (b.kind === "active" ? "bg-brand" : b.kind === "idle" ? "bg-warn-soft" : "bg-surface-2")}
            style={{ left: pos(b.from), width: `calc(${((b.to - Math.max(start, b.from)) / span) * 100}% - 4px)` }}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-between text-caption text-ink-3">
        {Array.from({ length: span + 1 }, (_, i) => (
          <span key={i}>{((start + i - 1) % 12) + 1}</span>
        ))}
      </div>
      <ul className="mt-6 flex flex-wrap gap-2.5">
        {EVENTS.map((e) => (
          <li key={e.at} className={"flex items-center gap-2 rounded-full px-3.5 py-1.5 text-small text-ink " + tone[e.tone]}>
            <span className="font-mono text-caption text-ink-2">{e.at}</span>
            {e.what}
          </li>
        ))}
      </ul>
      <p className="mt-6 flex flex-wrap gap-5 text-small text-ink-2">
        {(
          [
            ["bg-brand", "Active"],
            ["bg-warn-soft", "Idle"],
            ["bg-surface-2", "Away"],
          ] as const
        ).map(([c, l]) => (
          <span key={l} className="flex items-center gap-2">
            <span className={"size-3 rounded-xs " + c} />
            {l}
          </span>
        ))}
      </p>
    </Card>
  );
}
const fmt = (h: number) => `${((Math.floor(h) - 1) % 12) + 1}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

/** For a week or more: active and idle per day, stacked. */
function DaysChart({ ta, dates, word }: { ta: Ta; dates: string[]; word: string }) {
  const work = dates.filter((d) => weekday(d) % 6 !== 0);
  const per = work.map((d) => ({ d, t: totals(ta, [d]) }));
  const max = Math.max(1, ...per.map((p) => p.t.activeMs + p.t.idleMs));
  return (
    <Card title={`Active and idle, ${word}`} sub="Each working day · from the browser tracker">
      <div className="mt-2 flex h-[max(12rem,140px)] items-end gap-[max(0.6rem,4px)]">
        {per.map(({ d, t }) => (
          <div key={d} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d}: active ${hm(t.activeMs)}, idle ${hm(t.idleMs)}`}>
            <div data-draw="col" className="flex w-full max-w-10 flex-col justify-end overflow-hidden rounded-t-sm" style={{ height: `${((t.activeMs + t.idleMs) / max) * 100}%` }}>
              <span className="bg-warn-soft" style={{ height: `${(t.idleMs / Math.max(1, t.activeMs + t.idleMs)) * 100}%` }} />
              <span className="flex-1 bg-brand" />
            </div>
            <span className="text-caption text-ink-3">{new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Asia/Colombo" }).format(new Date(`${d}T12:00:00+05:30`)).slice(0, per.length > 10 ? 1 : 3)}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 flex gap-5 text-small text-ink-2">
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-xs bg-brand" />
          Active
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-xs bg-warn-soft" />
          Idle
        </span>
      </p>
    </Card>
  );
}

/** Websites: time, the active share as a bar, and the tracker's detail on a click. */
function Sites({ t }: { t: ReturnType<typeof totals> }) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...t.sites.map((s) => s.activeMs + s.idleMs));
  if (!t.sites.length) return <p className="text-small text-ink-3">No activity received. The TA must start tracking in the extension.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {t.sites.slice(0, 7).map((s) => {
        const all = s.activeMs + s.idleMs;
        const on = open === s.domain;
        return (
          <li key={s.domain}>
            <button type="button" onClick={() => setOpen(on ? null : s.domain)} aria-expanded={on} className="flex w-full items-center gap-3 rounded-sm px-1 py-2 text-left hover:bg-surface-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: groupOf(s.domain).color }} aria-hidden="true" />
              <span className="w-[42%] shrink-0 truncate text-small text-ink">{s.domain}</span>
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span data-draw="bar" className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(all / max) * 100}%`, background: groupOf(s.domain).color }} />
              </span>
              <span className="w-16 shrink-0 text-right text-small tabular-nums text-ink-2">{hm(all)}</span>
            </button>
            {on && (
              <dl className="mx-1 mb-2 mt-1 grid grid-cols-5 gap-2 rounded-sm bg-canvas p-3 text-caption max-sm:grid-cols-3">
                {(
                  [
                    ["Active", hm(s.activeMs)],
                    ["Idle", hm(s.idleMs)],
                    ["Clicks", s.clicks.toLocaleString()],
                    ["Scrolls", s.scrolls.toLocaleString()],
                    ["Mouse moving", hm(s.movementSeconds * 1000)],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="text-small text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        );
      })}
      <li className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-caption text-ink-3">
        <span>
          Active <b className="font-medium text-ink">{hm(t.activeMs)}</b>
        </span>
        <span>
          Idle <b className="font-medium text-ink">{hm(t.idleMs)}</b>
        </span>
        <span>
          Clicks <b className="font-medium text-ink">{t.clicks.toLocaleString()}</b>
        </span>
        <span>
          Scrolls <b className="font-medium text-ink">{t.scrolls.toLocaleString()}</b>
        </span>
      </li>
    </ul>
  );
}

/** Monday to Friday this week, against 5 a day; days still to come are empty slots. */
function WeekBars({ ta, week }: { ta: Ta; week: string[] }) {
  const mon = week[0];
  const days = Array.from({ length: 5 }, (_, i) => shift(mon, i));
  const today = colomboDay();
  const vals = days.map((d) => ta.days.find((x) => x.date === d)?.cvsToDirector ?? 0);
  const max = Math.max(GOAL.cvsPerDay + 1, ...vals);
  return (
    <div className="relative mt-4 h-[max(13rem,150px)]">
      <span className="absolute inset-x-0 border-t border-warn" style={{ bottom: `calc(${(GOAL.cvsPerDay / max) * 100}% + 1.5rem)` }}>
        <span className="absolute -top-5 right-0 text-caption text-warn">{GOAL.cvsPerDay} a day</span>
      </span>
      <div className="absolute inset-0 flex items-end gap-[max(1rem,8px)]">
        {days.map((d, i) => {
          const future = d > today;
          return (
            <div key={d} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              {!future && vals[i] > 0 && <span className="text-small text-ink">{vals[i]}</span>}
              <span
                data-draw="col"
                className={"w-full max-w-14 rounded-sm " + (future || !vals[i] ? "h-1.5 bg-surface-2" : "bg-brand")}
                style={future || !vals[i] ? undefined : { height: `calc(${(vals[i] / max) * 100}% - 3rem)` }}
              />
              <span className="text-caption text-ink-3">{["Mon", "Tue", "Wed", "Thu", "Fri"][i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Is the tracker running for this TA, and what it never collects. */
function Tracking({ ta, now }: { ta: Ta; now: number }) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const b = ta.browsers[0];
  const mins = b ? Math.max(0, Math.round((now - b.lastSyncAt) / 60000)) : null;
  const live = b?.enabled && mins !== null && mins <= 2;
  return (
    <Card
      title={live ? `Tracking on · ${b!.name}` : b ? `Quiet · ${b.name}` : "Not tracking"}
      sub={b ? `Last upload ${mins === 0 ? "just now" : `${mins} min ago`}` : "No browser connected"}
      icon={
        <span className={"flex size-[max(2.5rem,32px)] items-center justify-center rounded-full " + (live ? "bg-brand-soft text-brand" : "bg-warn-soft text-warn")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <path d="M8 20h8M12 16v4" />
          </svg>
        </span>
      }
    >
      {!live && b && <p className="mb-3 text-small text-warn">No upload for {mins} minutes - the browser may be closed or the extension stopped.</p>}
      <p className="flex gap-3 rounded-md bg-canvas px-4 py-3.5 text-small text-ink-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 size-4 shrink-0" aria-hidden="true">
          <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" />
        </svg>
        Only website names and active time. Never full links, page titles, typed text or screenshots. Kept {RETENTION_DAYS} days.
      </p>
      <div ref={root} className="relative mt-auto pt-5">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="rounded-full border border-border-strong px-5 py-2.5 text-small font-medium text-ink hover:bg-surface-2">
          Connect another browser
        </button>
        {shown && (
          <div ref={panel} className="absolute bottom-full left-0 z-30 mb-2 w-[max(20rem,260px)] rounded-md bg-surface p-4 text-small text-ink-2 shadow-float ring-1 ring-border/60">
            <p className="mb-2 font-medium text-ink">On the other browser</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Add the Career141 Work From Home Tracker extension.</li>
              <li>Sign in to the tracker in a tab and keep it open.</li>
              <li>In the extension enter the same email, accept the notice, Start tracking.</li>
            </ol>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ parts */

function Card({ title, sub, icon, aside, children }: { title?: string; sub?: string; icon?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-lg bg-white px-[max(1.75rem,16px)] py-[max(1.5rem,16px)] shadow-card">
      {(title || icon) && (
        <header className="mb-[max(1.25rem,12px)] flex items-start gap-3">
          {icon}
          <span className="min-w-0 flex-1">
            {title && <h2 className="text-h3 font-medium text-ink">{title}</h2>}
            {sub && <p className="text-small text-ink-3">{sub}</p>}
          </span>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

function Pills<T extends string>({ label, value, options, onPick, extra }: { label: string; value: T; options: [T, string][]; onPick: (v: T) => void; extra?: ReactNode }) {
  return (
    <div className="relative flex items-center">
      <div role="radiogroup" aria-label={label} className="flex rounded-full bg-surface p-1 shadow-card">
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onPick(v)}
            className={"rounded-full px-[max(1.1rem,10px)] py-2 text-small transition-colors " + (value === v ? "bg-ink text-white" : "text-ink-2 hover:text-ink")}
          >
            {l}
          </button>
        ))}
      </div>
      {extra}
    </div>
  );
}

/** Two dates within the tracker's 30 days. */
function CustomDates({ value, onChange, now }: { value: [string, string]; onChange: (v: [string, string]) => void; now: number }) {
  const min = colomboDay(now - (RETENTION_DAYS - 1) * 86400000);
  const max = colomboDay(now);
  const field = "rounded-full bg-surface px-3 py-2 text-small text-ink shadow-card outline-none focus-visible:ring-2 focus-visible:ring-brand/30";
  return (
    <span className="ml-2 flex items-center gap-1.5 text-small text-ink-3">
      <input type="date" aria-label="From" min={min} max={value[1]} value={value[0]} onChange={(e) => e.target.value && onChange([e.target.value, value[1]])} className={field} />
      to
      <input type="date" aria-label="To" min={value[0]} max={max} value={value[1]} onChange={(e) => e.target.value && onChange([value[0], e.target.value])} className={field} />
    </span>
  );
}

function PersonPicker({ tas, person, onPick, locked }: { tas: Ta[]; person: Ta; onPick: (id: string) => void; locked: boolean }) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const face = (
    <span className="flex size-[max(2.5rem,34px)] items-center justify-center rounded-full bg-brand-soft text-small font-medium text-brand">{person.name.slice(0, 2).toUpperCase()}</span>
  );
  if (locked)
    return (
      <span className="flex items-center gap-3 text-h3 text-ink">
        {face}
        {person.name}
      </span>
    );
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" className="flex items-center gap-3 rounded-full bg-surface py-1.5 pl-1.5 pr-4 text-h3 text-ink shadow-card">
        {face}
        {person.name}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4 text-ink-3" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {shown && (
        <div ref={panel} role="menu" className="absolute left-0 top-full z-30 mt-2 flex max-h-[60dvh] w-[max(16rem,220px)] flex-col overflow-y-auto rounded-md bg-surface p-1.5 shadow-float ring-1 ring-border/60">
          {tas.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onPick(t.id);
                setOpen(false);
              }}
              className={"rounded-sm px-3 py-2 text-left text-small hover:bg-surface-2 " + (t.id === person.id ? "font-medium text-ink" : "text-ink-2")}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Draw-in for everything marked data-draw inside, whenever `key` changes: arcs round
 *  from zero, bars across, columns up, the trend line along, fills fading in. Start
 *  states are set at once (never on a first tick); plain tweens, not useGSAP. */
function useDraw(key: string) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const arcs = el.querySelectorAll<SVGElement>('[data-draw="arc"]');
    const bars = el.querySelectorAll<HTMLElement>('[data-draw="bar"]');
    const cols = el.querySelectorAll<HTMLElement>('[data-draw="col"]');
    const lines = el.querySelectorAll<SVGElement>('[data-draw="line"]');
    const fades = el.querySelectorAll<SVGElement>('[data-draw="fade"]');
    const tweens: gsap.core.Tween[] = [];
    arcs.forEach((a, i) => {
      const to = Number(a.dataset.to ?? 0);
      gsap.set(a, { attr: { "stroke-dasharray": "0 100" } });
      tweens.push(gsap.to(a, { attr: { "stroke-dasharray": `${to} 100` }, duration: MOTION.drawIn * 2, ease: EASE.out, delay: Math.min(i, 12) * 0.03 }));
    });
    // Only what this view has (GSAP warns about an empty list).
    if (bars.length) {
      gsap.set(bars, { scaleX: 0, transformOrigin: "left center" });
      tweens.push(gsap.to(bars, { scaleX: 1, duration: MOTION.drawIn * 1.5, ease: EASE.out, stagger: 0.03, clearProps: "transform" }));
    }
    if (cols.length) {
      gsap.set(cols, { scaleY: 0, transformOrigin: "bottom center" });
      tweens.push(gsap.to(cols, { scaleY: 1, duration: MOTION.drawIn * 1.5, ease: EASE.out, stagger: 0.04, clearProps: "transform" }));
    }
    if (lines.length) {
      gsap.set(lines, { attr: { "stroke-dashoffset": 100 } });
      tweens.push(gsap.to(lines, { attr: { "stroke-dashoffset": 0 }, duration: MOTION.drawIn * 3, ease: EASE.inOut }));
    }
    if (fades.length) {
      gsap.set(fades, { opacity: 0 });
      tweens.push(gsap.to(fades, { opacity: 1, duration: DUR.slow, delay: MOTION.drawIn, ease: EASE.out }));
    }
    // Never left half-drawn when frames are held back.
    const done = setTimeout(() => tweens.forEach((t) => t.progress(1)), 2500);
    return () => {
      clearTimeout(done);
      tweens.forEach((t) => t.progress(1).kill());
    };
  }, [key]);
  return root;
}
