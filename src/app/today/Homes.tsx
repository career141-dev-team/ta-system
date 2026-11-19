"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { EASE, MOTION, gsap, motionOK } from "@/lib/gsap";
import Count from "../Count";
import { useSignedInPerson } from "@/lib/role";
import { ALERTS_MAX, CHASE, CLIENTS, CVS_GOAL, DECIDE, INTERVIEWS, ROLES, STAGES, TEAM, WAITING, WITH_CLIENT, type TaToday } from "./homeAnswers";

// Homes for the TA Lead, the Director and Ops (owner 14 Nov 2026: "based on the UI,
// make the home view for the lead, director, ops"). Each keeps what its old dashboard
// showed (src/components/dash/*): the lead sees the team today with each TA's checks
// for the day (the old Today's Checks "Team checks"), what needs a decision and every
// open role; the Director sees sets waiting for review, where every candidate is and
// each client; Ops sees what sits with clients, interviews to coordinate and what to
// chase.
// Redrawn 17 Nov 2026 (owner's Figma comments: "fully new design", the team table
// "feels like a completely different design style"): DESIGN.md rule 4, show the
// decision - the header names who is behind and what waits, every list is cards like
// the Openings and Pipeline cards, a status colour always on its soft tint.
// ponytail: sample numbers; with the backend, one small read per section.

const PERSON: Record<"Lead" | "Director" | "Ops", { first: string; line: string }> = {
  Lead: { first: "Rashmi", line: "11 open across the team · 3 need a decision" },
  Director: { first: "Nadeesha", line: "Across the agency" },
  Ops: { first: "Kavindi", line: "Chasing and coordination" },
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

type Tone = "warn" | "danger" | "success" | "info";
const TONE: Record<Tone, string> = {
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
};
type Flag = { tone: Tone; text: string };

// On a window tall enough for the board (1920 x 950) the home keeps to one view and
// only the longest lists scroll inside themselves; on a short laptop window
// (1267 x 587) or a phone the whole board scrolls instead, so nothing is squeezed.
const FILL = "[@media(min-width:1280px)_and_(min-height:761px)]:min-h-0 [@media(min-width:1280px)_and_(min-height:761px)]:flex-1";
const SCROLL = "[@media(min-width:1280px)_and_(min-height:761px)]:min-h-0 [@media(min-width:1280px)_and_(min-height:761px)]:overflow-y-auto";
const COLUMNS = "[@media(min-width:1280px)_and_(min-height:761px)]:grid-rows-[minmax(0,1fr)] " + FILL;

export default function Home({ role }: { role: "Lead" | "Director" | "Ops" }) {
  // The signed-in person's own first name (18 Nov); the sample one until then.
  const signedFirst = useSignedInPerson()?.name.split(" ")[0] ?? null;
  const [hello] = useState(greeting);
  const flags = role === "Lead" ? leadFlags() : role === "Director" ? directorFlags() : opsFlags();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[max(1.75rem,14px)] overflow-y-auto px-[max(3.5rem,14px)] py-[max(2.25rem,16px)] [scrollbar-width:thin] max-md:pt-12">
      <header className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-display font-light text-ink">
            {hello}, {signedFirst ?? PERSON[role].first}
          </h1>
          <p className="mt-1 text-small text-ink-3">{PERSON[role].line}</p>
        </div>
        {/* The decision, drawn first: who is behind and what waits. */}
        <ul aria-label="What needs you" className="flex flex-wrap gap-2 md:ml-auto md:justify-end">
          {flags.map((f) => (
            <li key={f.text} className={"rounded-full px-3 py-1 text-caption font-medium " + TONE[f.tone]}>
              {f.text}
            </li>
          ))}
        </ul>
      </header>
      {role === "Lead" ? <LeadHome /> : role === "Director" ? <DirectorHome /> : <OpsHome />}
    </div>
  );
}

function Section({ title, aside, fill, children }: { title: string; aside?: ReactNode; fill?: boolean; children: ReactNode }) {
  return (
    <section className={"flex min-w-0 flex-col " + (fill ? FILL : "")}>
      <div className="mb-3 flex min-h-[max(1.75rem,24px)] items-center gap-3">
        <h2 className="text-h3 font-medium text-ink">{title}</h2>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** A list of cards; with `scroll` it scrolls inside itself on a tall window. The
 *  padding keeps a hovered card's lift and shadow from being cut off. */
const List = ({ scroll, children }: { scroll?: boolean; children: ReactNode }) => (
  <ul className={"-m-1 flex flex-col gap-2 p-1 [scrollbar-width:thin] " + (scroll ? SCROLL : "")}>{children}</ul>
);

const CARD = "rounded-md border border-border bg-surface transition-colors";
const OPENS = CARD + " hover:border-border-strong hover:shadow-card";
const ROW = "flex items-center gap-3 px-[max(1rem,12px)] py-[max(0.75rem,9px)]";
const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-small text-ink-3">{children}</p>;
const Initials = ({ s }: { s: string }) => (
  <span className="flex size-[max(2.4rem,32px)] shrink-0 items-center justify-center rounded-full bg-info-soft text-caption font-semibold text-info" aria-hidden="true">
    {s}
  </span>
);
const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

/** The two lines of a card: a name and a quieter line under it, each cut with a title. */
function Lines({ main, sub, subClass = "text-ink-3" }: { main: string; sub: string; subClass?: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-small font-medium text-ink" title={main}>
        {main}
      </span>
      <span className={"block truncate text-caption " + subClass} title={sub}>
        {sub}
      </span>
    </span>
  );
}

/** A small labelled number, the way a card shows its counts. */
function Fig({ label, children, bad, why }: { label: string; children: ReactNode; bad?: boolean; why?: string }) {
  return (
    <span className="flex min-w-0 flex-col" title={bad ? why : undefined}>
      <span className="text-caption text-ink-3">{label}</span>
      <span className={"text-small font-medium tabular-nums " + (bad ? "text-danger" : "text-ink")}>{children}</span>
    </span>
  );
}

/** A count on a card of its own; `warn` puts it on the warn tint when it is not zero. */
function Stat({ n, label, warn, prefix = "", suffix = "" }: { n: number; label: string; warn?: boolean; prefix?: string; suffix?: string }) {
  const hot = warn && n > 0;
  return (
    <div className={"rounded-md px-[max(1.25rem,12px)] py-[max(1rem,10px)] " + (hot ? "bg-warn-soft" : "border border-border bg-surface")}>
      <p className={"text-caption " + (hot ? "text-warn" : "text-ink-3")}>{label}</p>
      <p className={"mt-1.5 text-h1 font-light leading-none " + (hot ? "text-warn" : "text-ink")}>
        {prefix}
        <Count n={n} />
        {suffix}
      </p>
    </div>
  );
}

/** A slim bar that draws in once, left to right (DESIGN.md draw-in). */
function Bar({ pct, tone = "bg-brand", label }: { pct: number; tone?: string; label?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!el.current || !motionOK()) return;
    gsap.set(el.current, { scaleX: 0 });
    const t = gsap.to(el.current, { scaleX: 1, duration: MOTION.drawIn, ease: EASE.out, delay: 0.15, clearProps: "transform" });
    return () => void t.progress(1).kill();
  }, []);
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role={label ? "img" : undefined} aria-label={label}>
      <span ref={el} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} className={"block h-full origin-left rounded-full " + tone} />
    </span>
  );
}

const Arrow = () => (
  <svg data-nudge viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-ink-3" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/** A soft circle with a dot: the state of a row, its colour on its tint. */
const Mark = ({ tone }: { tone: Tone }) => (
  <span className={"flex size-[max(2rem,26px)] shrink-0 items-center justify-center rounded-full " + TONE[tone]} aria-hidden="true">
    <span className="size-2 rounded-full bg-current" />
  </span>
);

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

// ----- TA Lead -----


const firstName = (t: TaToday) => t.name.split(" ")[0];
const who = (ts: TaToday[]) => (ts.length === 1 ? firstName(ts[0]) : plural(ts.length, "TA"));

function leadFlags(): Flag[] {
  const idle = TEAM.filter((t) => !t.day.started);
  const low = TEAM.filter((t) => t.cvs < CVS_GOAL);
  const busy = TEAM.filter((t) => t.alerts > ALERTS_MAX);
  const f: Flag[] = [];
  if (idle.length) f.push({ tone: "warn", text: `${who(idle)} ${idle.length === 1 ? "has" : "have"} not started` });
  if (low.length) f.push({ tone: "danger", text: `${who(low)} under ${CVS_GOAL} CVs today` });
  if (busy.length) f.push({ tone: "danger", text: `${who(busy)} with over ${ALERTS_MAX} alerts` });
  return f.length ? f : [{ tone: "success", text: "The team is on track" }];
}

function LeadHome() {
  const [offLi, setOffLi] = useState(false);
  const notOn = ROLES.filter((r) => !r.on).length;
  const roles = offLi ? ROLES.filter((r) => !r.on) : ROLES;
  return (
    <div className={"grid gap-[max(1.75rem,14px)] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] " + COLUMNS}>
      <Section title="The team today" fill aside={<span className="text-caption text-ink-3 max-sm:hidden">Each TA&apos;s checks for today, as in Today&apos;s Checks</span>}>
        <List scroll>
          {TEAM.map((t) => (
            <li key={t.ini}>
              <TaCard t={t} />
            </li>
          ))}
        </List>
      </Section>

      <div className={"flex min-w-0 flex-col gap-[max(1.75rem,14px)] " + FILL}>
        <Section title="Needs a decision">
          {DECIDE.length ? (
            <List>
              {DECIDE.map((d) => (
                <li key={d.title}>
                  <Link data-lift href="/openings/demo" className={OPENS + " " + ROW}>
                    <Mark tone={d.red ? "danger" : "warn"} />
                    <Lines main={d.title} sub={`${d.client} · ${d.why}`} subClass={d.red ? "text-danger" : "text-ink-2"} />
                    <Arrow />
                  </Link>
                </li>
              ))}
            </List>
          ) : (
            <Empty>Nothing waiting on you.</Empty>
          )}
        </Section>
        <Section
          title="Every open role"
          fill
          aside={
            (notOn > 0 || offLi) && (
              <button
                type="button"
                aria-pressed={offLi}
                onClick={() => setOffLi(!offLi)}
                className={"rounded-full px-3 py-1 text-caption font-medium transition-colors " + (offLi ? "bg-ink text-white hover:bg-ink-2" : "bg-warn-soft text-warn hover:bg-warn-soft/70")}
              >
                {offLi ? "Not on LinkedIn · show all" : `${notOn} not on LinkedIn`}
              </button>
            )
          }
        >
          <List scroll>
            {roles.map((r) => (
              <li key={r.title}>
                <Link data-lift href="/openings/demo" className={OPENS + " " + ROW}>
                  <Lines main={r.title} sub={`${r.client} · ${r.tas} · day ${r.days}`} />
                  <span className={"shrink-0 rounded-sm px-2 py-0.5 text-caption font-medium " + (r.on ? TONE.info : TONE.warn)}>{r.on ? "LinkedIn" : "No post"}</span>
                  <span className="flex min-w-[max(3.75rem,48px)] shrink-0 flex-col items-end" title="Candidates in follow-up">
                    <span className="text-small font-medium tabular-nums text-ink">{r.fu}</span>
                    <span className="whitespace-nowrap text-caption text-ink-3">follow-up</span>
                  </span>
                </Link>
              </li>
            ))}
          </List>
        </Section>
      </div>
    </div>
  );
}

/** One TA's day as a card: who, their numbers, and their checks as a slim bar. The
 *  card follows its own width (a container query): one line on a wide board, two on
 *  a laptop, stacked on a phone. */
function TaCard({ t }: { t: TaToday }) {
  const notOn = t.li[1] - t.li[0];
  const unposted = notOn - t.noLink;
  const liNote = [t.noLink && `${t.noLink} no link`, unposted > 0 && `${unposted} not posted`].filter(Boolean).join(" · ");
  const roleLine = `${plural(t.roles.length, "role")} · ${t.roles.slice(0, 2).join(", ")}${t.roles.length > 2 ? ` +${t.roles.length - 2}` : ""}`;
  return (
    <Link data-lift href="/ta-track" title={`${t.name} — ${t.roles.join(", ")}`} className={OPENS + " @container block px-[max(1rem,12px)] py-[max(0.75rem,10px)]"}>
      <div className="grid grid-cols-1 items-center gap-x-[max(1.5rem,14px)] gap-y-3 @min-[440px]:grid-cols-[minmax(0,1fr)_max(10rem,140px)] @min-[860px]:grid-cols-[minmax(0,1fr)_auto_max(10rem,140px)]">
        <span className="flex min-w-0 items-center gap-3">
          <Initials s={t.ini} />
          <Lines main={t.name} sub={roleLine} />
        </span>

        {/* Today's checks: a slim bar and where the day stands, in plain words. */}
        <span className="flex min-w-0 flex-col gap-1.5 @min-[860px]:col-start-3 @min-[860px]:row-start-1">
          {!t.day.started ? (
            <span className={"w-fit rounded-full px-2.5 py-0.5 text-caption font-medium " + TONE.warn}>Not started</span>
          ) : (
            <>
              <span className="flex items-center justify-between gap-2 text-caption">
                <span className="text-ink-3">Checks</span>
                <span className="font-medium tabular-nums text-ink-2">
                  {t.day.done} of {t.day.of}
                </span>
              </span>
              <Bar pct={t.day.of ? (t.day.done / t.day.of) * 100 : 0} tone={t.day.done === t.day.of ? "bg-success" : "bg-info"} label={`${t.day.done} of ${t.day.of} checks done`} />
              <span className={"truncate text-caption " + (t.day.eod ? "font-medium text-success" : "text-ink-3")}>
                {t.day.eod ? `EOD sent ${t.day.eod}` : `Started ${t.day.started} · EOD not sent`}
              </span>
            </>
          )}
        </span>

        <span className="flex flex-wrap gap-x-[max(1.5rem,14px)] gap-y-2 @min-[440px]:col-span-2 @min-[860px]:col-span-1 @min-[860px]:col-start-2 @min-[860px]:row-start-1">
          <Fig label="LinkedIn">
            <span className="flex items-center gap-1.5">
              <span className={"size-2 rounded-full " + (notOn ? "bg-warn" : "bg-success")} aria-hidden="true" />
              {t.li[0]} of {t.li[1]} on
              {liNote && <span className="font-normal text-warn">· {liNote}</span>}
            </span>
          </Fig>
          <Fig label="In pipeline">{t.pipeline}</Fig>
          <Fig label="CVs today" bad={t.cvs < CVS_GOAL} why={`Under ${CVS_GOAL} CVs today`}>
            {t.cvs}
          </Fig>
          <Fig label="Sets">{t.sets}</Fig>
          <Fig label="Alerts" bad={t.alerts > ALERTS_MAX} why={`More than ${ALERTS_MAX} alerts`}>
            {t.alerts}
          </Fig>
        </span>
      </div>
    </Link>
  );
}

// ----- Director -----


function directorFlags(): Flag[] {
  return WAITING.length
    ? [{ tone: "warn", text: `${plural(WAITING.length, "set")} ${WAITING.length === 1 ? "waits" : "wait"} on your review` }]
    : [{ tone: "success", text: "Nothing waits on your review" }];
}

function DirectorHome() {
  const widest = Math.max(...STAGES.map(([, n]) => n));
  const richest = Math.max(...CLIENTS.map((c) => c.value), 1);
  return (
    <>
      <div className="grid grid-cols-4 gap-[max(1rem,8px)] max-lg:grid-cols-2">
        <Stat n={11} label="Open roles" />
        <Stat n={WAITING.length} label="Waiting on you" warn />
        <Stat n={6930} prefix="LKR " suffix="k" label="In progress" />
        <Stat n={4200} prefix="LKR " suffix="k" label="Placed" />
      </div>
      <div className={"grid gap-[max(1.75rem,14px)] lg:grid-cols-2 xl:grid-cols-3 " + COLUMNS}>
        <Section title="Sets waiting on your review" fill>
          {WAITING.length ? (
            <List scroll>
              {WAITING.map((w) => (
                <li key={w.who}>
                  <Link data-lift href="/openings/demo" className={OPENS + " " + ROW}>
                    <Initials s={initials(w.who)} />
                    <Lines main={w.who} sub={`${w.client} · ${w.title} · set ${w.set}`} />
                    <span className="shrink-0 rounded-sm bg-surface-2 px-2 py-0.5 text-caption text-ink-2" title="TA on the set">
                      {w.ta}
                    </span>
                    <Arrow />
                  </Link>
                </li>
              ))}
            </List>
          ) : (
            <Empty>Nothing waiting on you.</Empty>
          )}
        </Section>
        <Section title="Where everyone is" fill>
          <ul className={"flex flex-col gap-[max(0.7rem,8px)] p-[max(1rem,12px)] [scrollbar-width:thin] " + CARD + " " + SCROLL}>
            {STAGES.map(([s, n]) => {
              const you = s === "Director Review";
              return (
                <li key={s} className="grid grid-cols-[max(8.5rem,118px)_1fr_max(2.5rem,30px)] items-center gap-3 text-small">
                  <span className={"truncate " + (you ? "font-medium text-warn" : "text-ink-2")} title={you ? "Waiting on your review" : s}>
                    {s}
                  </span>
                  <Bar pct={(n / widest) * 100} tone={you ? "bg-warn" : "bg-brand"} />
                  <span className={"text-right tabular-nums " + (you ? "font-medium text-warn" : "text-ink")}>{n}</span>
                </li>
              );
            })}
          </ul>
        </Section>
        <Section title="By client" fill>
          <List scroll>
            {CLIENTS.map((c) => (
              <li key={c.name} className={CARD + " flex flex-col gap-2 px-[max(1rem,12px)] py-[max(0.75rem,9px)]"}>
                <span className="flex items-center gap-3">
                  <Lines main={c.name} sub={`${c.open} open · ${plural(c.sets, "set")}`} />
                  <span className={"shrink-0 text-small tabular-nums " + (c.value ? "font-medium text-ink" : "text-ink-3")}>{c.value ? `LKR ${c.value}k` : "Nothing in progress"}</span>
                </span>
                {c.value > 0 && <Bar pct={(c.value / richest) * 100} label={`LKR ${c.value}k in progress`} />}
              </li>
            ))}
          </List>
        </Section>
      </div>
    </>
  );
}

// ----- Ops -----


function opsFlags(): Flag[] {
  const cold = INTERVIEWS.filter((i) => !i.confirmed).length;
  const f: Flag[] = [];
  if (CHASE.length) f.push({ tone: "warn", text: `${plural(CHASE.length, "thing")} to chase` });
  if (cold) f.push({ tone: "danger", text: `${plural(cold, "interview")} not contacted` });
  return f.length ? f : [{ tone: "success", text: "Nothing to chase" }];
}

function OpsHome() {
  return (
    <>
      <div className="grid grid-cols-3 gap-[max(1rem,8px)] max-sm:grid-cols-1">
        <Stat n={WITH_CLIENT.length} label="Sitting with clients" />
        <Stat n={CHASE.length} label="To chase" warn />
        <Stat n={INTERVIEWS.length} label="Interviews scheduled" />
      </div>
      <div className={"grid gap-[max(1.75rem,14px)] lg:grid-cols-2 xl:grid-cols-3 " + COLUMNS}>
        {/* What to do next comes first. */}
        <Section title="Assigned to you" fill>
          {CHASE.length ? (
            <List scroll>
              {CHASE.map((c) => (
                <li key={c.what} className={CARD + " flex items-start gap-3 px-[max(1rem,12px)] py-[max(0.875rem,10px)]"}>
                  <Mark tone="warn" />
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-2.5">
                    <span className="text-small text-ink">{c.what}</span>
                    <Link href="/openings/demo" className="rounded-full bg-ink px-4 py-1.5 text-small font-medium text-white transition-colors hover:bg-ink-2">
                      {c.action}
                    </Link>
                  </span>
                </li>
              ))}
            </List>
          ) : (
            <Empty>Nothing assigned to you.</Empty>
          )}
        </Section>
        <Section title="Waiting on client feedback" fill>
          {WITH_CLIENT.length ? (
            <List scroll>
              {WITH_CLIENT.map((w) => (
                <li key={w.who}>
                  <Link data-lift href="/openings/demo" className={OPENS + " " + ROW}>
                    <Initials s={initials(w.who)} />
                    <Lines main={w.who} sub={`${w.client} · ${w.title}`} />
                    <span className={"shrink-0 rounded-sm px-2 py-0.5 text-caption font-medium " + (w.days >= 1 ? TONE.warn : "bg-surface-2 text-ink-3")}>
                      {w.days ? `${plural(w.days, "day")} with the client` : "Sent today"}
                    </span>
                  </Link>
                </li>
              ))}
            </List>
          ) : (
            <Empty>No set is waiting on a client.</Empty>
          )}
        </Section>
        <Section title="Interviews to coordinate" fill>
          {INTERVIEWS.length ? (
            <List scroll>
              {INTERVIEWS.map((i) => (
                <li key={i.who} className={CARD + " " + ROW}>
                  <Initials s={initials(i.who)} />
                  <Lines main={i.who} sub={i.title} />
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-mono text-mono text-ink-2">{i.when}</span>
                    <span className={"rounded-sm px-2 py-0.5 text-caption font-medium " + (i.confirmed ? TONE.success : TONE.danger)}>{i.confirmed ? "Confirmed" : "Not contacted"}</span>
                  </span>
                </li>
              ))}
            </List>
          ) : (
            <Empty>No interviews to coordinate.</Empty>
          )}
        </Section>
      </div>
    </>
  );
}
