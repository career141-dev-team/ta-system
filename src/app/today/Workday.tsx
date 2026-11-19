"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { DUR, EASE, gsap, useGSAP } from "@/lib/gsap";
import { PERSON, useMe } from "@/lib/role";
import { useDayEnd, useLiveDesk } from "@/lib/workday";
import { door, useDoorAction, useDoorMutation, useDoorQuery, type AuraReply, type DayPayload, type DoorDeskPosition, type DoorDone } from "@/lib/backend";
import ChecksList from "./ChecksList";
import { checksFor, KNOWN, progress, type Check, type CheckKey } from "./checks";
import PillMenu, { type MenuOption } from "../openings/[id]/PillMenu";
import { aboutTheDay, planDay, type Plan } from "./plan";
import { answer, DESK, rank, startLine, type Answer, type Desk, type Tone } from "./desk";
import { saveRow, TAS, useRows, type Row } from "../strategy/data";
import { petSay } from "@/lib/pet";

// T2 · Today, after Start workday (owner's design, 13 Nov 2026): the day's rail on
// the left, AURA in the middle. Placeholder data until the backend is wired: with
// it, the positions are this person's assigned openings, the "things" are one small
// read, and picking positions starts the workday on the server.
// T3 (14 Nov 2026): say how the day looks and AURA lays it out - the plan card with
// times, the position each step belongs to, "Start with <position>" and "Change
// something" (./plan.ts). Anything else AURA still says plainly it cannot answer yet.
// 17 Nov 2026 (owner): every open position the TA is on shows in the chat as a card,
// in the order AURA would work them, with what the position already holds - Rashmi's
// strategies, the requirements, priority and target, the pipeline and its gaps
// (./desk.ts) - kept out of sight (owner: "too much, keep the old chat"): the chips
// stay, one line says where to start, and AURA answers when the TA asks about a
// position, its strategies or what first. The plan puts strategies due today first.

const NewOpening = dynamic(() => import("../openings/NewOpening"));

type WorkType = "100%" | "Follow-up" | "Add-on";
type Position = Desk;

const POSITIONS: Position[] = DESK;
/** A position made from "Add a position" today: nothing worked on it yet. */
const fresh = (id: string, title: string, client: string): Position => ({
  id, title, client, type: "Follow-up", p: 3, day: 0, of: 30, skills: [], years: [0, 0], salary: "", where: "", hiring: "",
  pipeline: 0, cvsToday: 0, director: 0, jd: false, linkedin: false,
});
// Placeholder evidence: what each position already has done today.
/** A desk position from the backend, in the shape the rail and AURA's order use. */
const fromDoor = (d: DoorDeskPosition, type: WorkType): Position => ({
  id: d.id, title: d.title, client: d.client, type, p: (Number(d.priority?.replace(/\D/g, "")) || 3) as Position["p"],
  day: d.day, of: d.target ?? 30, skills: d.skills, years: [d.years[0], d.years[1] ?? d.years[0]], salary: d.salary ?? "",
  where: d.where, hiring: d.hiring ?? "", pipeline: d.pipeline, cvsToday: d.cvsToday, director: d.director, jd: d.jdApproved, linkedin: d.linkedinLive,
});
const DONE: Record<string, CheckKey[]> = { sap: ["jd_review", "linkedin_post", "excel_profiles"], fin: ["chatgpt"], prod: [], hr: [] };

// The old TA System's rules for one day (FLOW-CHECK 6.5): at most 10 positions,
// at most 5 of them at 100%.
const MAX_DAY = 10;
const MAX_FULL = 5;

// No dot on the pill: the design's "100% ▾" is the word alone.
const WORK_TYPES: MenuOption[] = [
  { value: "100%", label: "100%", hint: "Full hunt" },
  { value: "Follow-up", label: "Follow-up", hint: "Chasing follow-up" },
  { value: "Add-on", label: "Add-on", hint: "Additional sourcing" },
];
const RING: Record<WorkType, string> = { "100%": "var(--color-brand)", "Follow-up": "var(--color-warn)", "Add-on": "var(--color-info)" };

type Thing = {
  id: string;
  done: boolean;
  icon: "check" | "doc" | "target";
  title: string;
  doneTitle?: string;
  sub: string;
  action?: string;
  href?: string;
};

const THINGS: Thing[] = [
  {
    id: "kasun",
    done: true,
    icon: "check",
    title: "Kasun Perera is ready for Director Review",
    doneTitle: "Kasun Perera moved to Director Review",
    sub: "He replied: LKR 850k, one month notice",
    action: "Move to Director Review",
  },
  {
    id: "jd",
    done: false,
    icon: "doc",
    title: "HR Business Partner — the JD is ready for you",
    sub: "AURA drafted it from yesterday’s client brief",
    action: "Review JD",
    // The JD view is not built yet; the opening is where it will live.
    href: "/openings/demo",
  },
  {
    id: "strat",
    done: false,
    icon: "target",
    title: "Rashmi gave you a strategy: LinkedIn groups",
    doneTitle: "Strategy accepted: LinkedIn groups",
    sub: "Finance Manager · due Thursday",
    action: "Accept",
  },
];

const SUGGESTIONS = ["Plan my day", "What first?", "My strategies today", "Draft my EOD"] as const;
const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

// The clock in the rail, one tick a minute; the server draws nothing for it.
const minute = (cb: () => void) => {
  const t = setInterval(cb, 30_000);
  return () => clearInterval(t);
};

export default function Workday({ startedAt }: { startedAt: number | null }) {
  const root = useRef<HTMLDivElement>(null);
  const { first } = useMe();
  // Rashmi's strategies, from the Strategy Planner's store: accepting one here is seen there.
  const rows = useRows();
  const me = TAS.find((t) => t.first === first)?.id;
  // Signed in (19 Nov, D4): the day, its positions and their checks are the
  // backend's (ui/day:today, via src/lib/workday.ts); every pick and excuse saves
  // through ui/day and the backend's own rules. The AURA chat stays as it was.
  const desk = useLiveDesk() as DayPayload | null;
  const liveDay = desk?.active ?? null;
  const startDay = useDoorMutation(door.startDay);
  const addPos = useDoorMutation(door.addPosition);
  const saveType = useDoorMutation(door.setWorkType);
  const excuse = useDoorMutation(door.excuseCheck);
  // AURA (E5 group 1, 19 Nov): the TA's real desk, and Claude Haiku answering from it.
  const deskRead = useDoorQuery(door.desk, desk ? {} : "skip") as { ok: true; positions: DoorDeskPosition[] } | { ok: false; message: string } | undefined;
  const real = new Map((deskRead?.ok ? deskRead.positions : []).map((d) => [d.id, d]));
  const ask = useDoorAction(door.askToday);
  const answered = (run: Promise<unknown>, ok?: () => void) =>
    void (run as Promise<DoorDone | undefined>).then((d) => (d && !d.ok ? setRefusal(d.message) : (setRefusal(""), ok?.())));
  const part = useSyncExternalStore(
    minute,
    () => {
      const h = new Date().getHours();
      return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
    },
    () => "Morning",
  );
  const now = useSyncExternalStore(minute, () => Math.floor(Date.now() / 60_000), () => 0);

  // The positions on today's workday and each one's work type; the rest are "also
  // yours". The design opens with two picked.
  const [pickedLocal, setPicked] = useState<Record<string, WorkType>>({ sap: "100%", fin: "Follow-up" });
  const [activeRaw, setActive] = useState(desk ? "" : "sap");
  const [refusal, setRefusal] = useState("");
  // Openings this TA created from "Add a position" (sample: kept for the visit).
  const [made, setMade] = useState<Position[]>([]);
  const positions = desk
    ? [
        ...(liveDay?.jobs ?? []).map((j) => (real.has(j.jobId) ? fromDoor(real.get(j.jobId)!, j.workType) : { ...fresh(j.jobId, j.title, ""), type: j.workType })),
        ...desk.options
          .filter((o) => !liveDay?.jobs.some((j) => j.jobId === o.id))
          .map((o) => (real.has(o.id) ? fromDoor(real.get(o.id)!, o.workType ?? "100%") : { ...fresh(o.id, o.title, ""), type: o.workType ?? ("100%" as WorkType) })),
      ]
    : [...POSITIONS, ...made];
  const picked: Record<string, WorkType> = desk ? Object.fromEntries((liveDay?.jobs ?? []).map((j) => [j.jobId, j.workType])) : pickedLocal;
  const active = desk ? (picked[activeRaw] ? activeRaw : liveDay?.jobs[0]?.jobId ?? "") : activeRaw;
  const [newOpening, setNewOpening] = useState(false);
  // "Couldn't complete this task" reasons, per position and check.
  const [excuses, setExcuses] = useState<Record<string, string>>({});
  // The day ends by itself at the first 100% End of day email; that position's EOD is in.
  const dayEnd = useDayEnd();
  const checksOf = (id: string): Check[] => {
    if (desk) {
      const job = liveDay?.jobs.find((j) => j.jobId === id);
      return (job?.checks ?? []).flatMap((c) => {
        const base = KNOWN.get(c.key.split(":")[0]);
        return base ? [{ ...base, label: c.label || base.label, todo: c.progress || base.todo, done: c.status === "complete", excuse: c.exception?.reason, full: c.key }] : [];
      });
    }
    // ponytail: the demo opening is the SAP one, so its EOD finishing the day is SAP's.
    const done = [...(DONE[id] ?? []), ...(dayEnd && id === "sap" ? (["daily_email", "midday_email", "chatgpt"] as CheckKey[]) : [])];
    return checksFor(picked[id] ?? "100%", done).map((c) => ({ ...c, excuse: excuses[`${id}:${c.key}`] }));
  };
  const eodSent = (id: string) =>
    desk ? !!liveDay?.jobs.find((j) => j.jobId === id)?.eodSentAt : checksOf(id).some((c) => c.key === "daily_email" && c.done);
  // Signed in, the sample "things" (Kasun, the HR JD, Rashmi's strategy) are not shown.
  const [things, setThings] = useState(desk ? [] : THINGS);
  // What the person said, and AURA's answer: a plan, "not yet" for anything that
  // is not about the day, or nothing while it is still thinking.
  const [chat, setChat] = useState<{ id: number; text: string; reply?: Plan | Answer | "na" }[]>([]);
  const [hint, setHint] = useState("");
  const said = useRef("");
  const box = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);
  const [draft, setDraft] = useState("");
  const seq = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  const today = positions.filter((p) => picked[p.id]);
  const others = positions.filter((p) => !picked[p.id]);
  const ranked = rank(positions, (d) => picked[d.id] ?? d.type, rows, me);

  const toggle = (p: Position) => {
    setRefusal("");
    if (picked[p.id] && desk) return setRefusal("A position stays on today's workday once it is added.");
    if (picked[p.id]) {
      if (eodSent(p.id)) return setRefusal("This position's EOD has been sent. It stays on today's workday.");
      // A day needs at least one position (old Workday: no day without one).
      if (Object.keys(picked).length === 1)
        return setRefusal(others.length ? "Keep at least one position on today's workday. Add another first." : "No other assigned positions. Ask your TA Lead.");
      const next = { ...picked };
      delete next[p.id];
      setPicked(next);
      if (active === p.id) setActive(Object.keys(next)[0] ?? "");
      return;
    }
    if (Object.keys(picked).length >= MAX_DAY) return setRefusal(`At most ${MAX_DAY} positions a day.`);
    if (p.type === "100%" && Object.values(picked).filter((t) => t === "100%").length >= MAX_FULL)
      return setRefusal(`At most ${MAX_FULL} positions at 100% a day. Make another one Follow-up first.`);
    if (desk) {
      // The first pick starts the day; the rest join it.
      const run = liveDay ? addPos({ workdayId: liveDay.id, jobId: p.id, workType: p.type }) : startDay({ jobId: p.id, workType: p.type });
      return answered(run, () => setActive(p.id));
    }
    setPicked({ ...picked, [p.id]: p.type });
    if (!active) setActive(p.id);
  };
  const setType = (id: string, type: WorkType) => {
    if (eodSent(id)) {
      setRefusal("This position's EOD has been sent. Its recorded work type cannot change today.");
      return;
    }
    if (type === "100%" && picked[id] !== "100%" && Object.values(picked).filter((t) => t === "100%").length >= MAX_FULL) {
      setRefusal(`At most ${MAX_FULL} positions at 100% a day.`);
      return;
    }
    setRefusal("");
    if (desk && liveDay) return answered(saveType({ workdayId: liveDay.id, jobId: id, workType: type }));
    setPicked({ ...picked, [id]: type });
  };

  const flip = (id: string) => setThings((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  // About the day (or the first thing said, or a change to the plan): AURA plans it
  // after a short think. Anything else: it says plainly it is not connected yet.
  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const id = ++seq.current;
    if (desk) {
      // Signed in: Claude Haiku answers from the real desk (ui/aura:askToday). It only
      // advises; every link it gives opens the position.
      const history = chat.flatMap((m) => [
        { role: "user" as const, text: m.text },
        ...(m.reply && m.reply !== "na" ? [{ role: "assistant" as const, text: "steps" in m.reply ? `${m.reply.headline} ${m.reply.steps.map((s) => `${s.at} ${s.what}`).join("; ")}` : m.reply.say }] : []),
      ]);
      setChat((c) => [...c, { id, text: t }]);
      setDraft("");
      setHint("");
      const today = Object.entries(picked).map(([jobId, workType]) => ({ jobId, workType }));
      const title = (where?: string) => (where ? real.get(where)?.title : undefined);
      const href = (where?: string) => (where ? `/openings/demo?job=${where}` : undefined);
      void (ask({ text: t, history, today }) as Promise<{ ok: true; reply: AuraReply } | { ok: false; message: string } | undefined>)
        .then((d): Plan | Answer => {
          if (!d) return { say: "AURA is not connected on this preview." };
          if (!d.ok) return { say: d.message };
          const a = d.reply;
          if (a.kind === "plan")
            return { headline: a.headline, steps: a.steps.map((x) => ({ at: x.at, minutes: 0, what: x.what, tone: x.tone, where: title(x.where), href: href(x.where) })) };
          return { say: a.say, chips: a.chips, warn: a.warn, rows: a.rows.map((x, i) => ({ n: i + 1, main: x.main, meta: x.meta, href: href(x.where) })) };
        })
        .catch((): Answer => ({ say: "AURA could not answer just now. Try again." }))
        .then((reply) => setChat((c) => c.map((m) => (m.id === id ? { ...m, reply } : m))));
      return;
    }
    const told = answer(t, ranked.filter((r) => picked[r.d.id]), ranked, rows, me);
    const planning = !told && (aboutTheDay(t) || !chat.some((m) => m.reply && m.reply !== "na" && "steps" in m.reply) || hint !== "");
    if (planning) said.current = `${said.current} ${t}`;
    setChat((c) => [...c, { id, text: t }]);
    setDraft("");
    setHint("");
    // ponytail: a stand-in wait; with the backend this is the model's answer.
    timers.current.push(
      setTimeout(() => {
        // Today's positions in AURA's order, each with its strategies due today.
        const day = ranked.filter((r) => picked[r.d.id]).map((r) => ({ ...r.d, type: picked[r.d.id], todo: r.due.map((x) => x.name) }));
        const reply: Plan | Answer | "na" = told ?? (planning ? planDay(day, said.current) : "na");
        setChat((c) => c.map((m) => (m.id === id ? { ...m, reply } : m)));
      }, 800),
    );
  };
  const change = () => {
    setHint("Tell me what to change — e.g. “move the interview to 3:00” or “Finance first”");
    box.current?.focus();
  };
  const latestPlan = [...chat].reverse().find((m) => m.reply && m.reply !== "na" && "steps" in m.reply)?.id;
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat]);

  // Arrive like the screen is waking up: the rail slides in from the left, AURA's
  // lines rise one after another, then the things, the picks and the box.
  useGSAP(
    () => {
      const tl = gsap.timeline({ defaults: { ease: EASE.out } });
      tl.from("[data-rail] > *", { x: -18, opacity: 0, duration: DUR.slow, stagger: 0.05 })
        .from("[data-say]", { y: 16, opacity: 0, duration: DUR.slow, stagger: 0.12 }, 0.1)
        .from("[data-thing]", { y: 12, opacity: 0, duration: DUR.base, stagger: 0.06 }, 0.2)
        .from("[data-chip]", { scale: 0.92, opacity: 0, duration: DUR.base, stagger: 0.04, ease: EASE.pop }, 0.35)
        .from("[data-ask]", { y: 14, opacity: 0, duration: DUR.base, stagger: 0.04 }, 0.45);
    },
    { scope: root },
  );

  const startedLabel = startedAt ? new Date(startedAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" }) : "";
  // The clock stops at the first 100% EOD.
  const mins = now && startedAt ? Math.max(0, (dayEnd ? Math.floor(dayEnd / 60_000) : now) - Math.floor(startedAt / 60_000)) : 0;
  const endLabel = dayEnd ? new Date(dayEnd).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" }) : "";
  const worked = `${Math.floor(mins / 60)}h ${mins % 60}m`;

  return (
    <div ref={root} className="flex min-h-0 flex-1 max-md:flex-col">
      {/* The day's rail. On a phone it sits on top, the positions in a row. */}
      <aside
        data-rail
        className="flex w-[max(21.25rem,230px)] shrink-0 flex-col gap-[max(1.75rem,16px)] overflow-y-auto border-r border-border pb-[max(2.25rem,16px)] pl-[max(2.25rem,18px)] pr-[max(1.75rem,14px)] pt-[max(2.5rem,18px)] [scrollbar-width:thin] max-md:max-h-[42dvh] max-md:w-full max-md:gap-3 max-md:border-b max-md:border-r-0 max-md:p-4"
      >
        <div>
          <h1 className="text-[max(1.75rem,20px)] leading-tight text-ink">Today</h1>
          <p className="mt-1 text-[max(0.875rem,12px)] text-ink-3">
            {startedAt ? <>Started {startedLabel} &middot; {worked}</> : "Pick your first position below to start the day"}
          </p>
        </div>

        <div className="flex flex-col gap-[max(0.5rem,4px)] max-md:flex-row max-md:overflow-x-auto max-md:[scrollbar-width:none]">
          {today.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => setActive(p.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), setActive(p.id))}
              aria-pressed={active === p.id}
              className={
                "flex shrink-0 items-center gap-[max(0.875rem,10px)] rounded-md px-[max(0.75rem,8px)] py-[max(0.75rem,8px)] text-left transition-colors " +
                (active === p.id ? "bg-surface-2" : "hover:bg-surface-2/60")
              }
            >
              <Ring value={progress(checksOf(p.id))} color={RING[picked[p.id]]} />
              <span className="min-w-0">
                {/* ponytail: every position opens the one built opening until the backend sends ids. */}
                <Link href={desk ? `/openings/demo?job=${p.id}` : "/openings/demo"} onClick={(e) => e.stopPropagation()} className="block truncate text-[max(1rem,13.5px)] font-medium text-ink hover:underline">
                  {p.title}
                </Link>
                <span className="block truncate text-[max(0.875rem,12px)] text-ink-3">
                  {p.client} &middot; {picked[p.id]}
                </span>
                {eodSent(p.id) && (
                  <span className="block truncate text-[max(0.8125rem,11px)] text-success">
                    EOD sent{dayEnd && p.id === "sap" ? ` ${endLabel}` : ""}
                  </span>
                )}
              </span>
            </div>
          ))}
          {/* Signed in, a new opening is made on Openings (not switched on here yet). */}
          {!desk && <button
            type="button"
            onClick={() => setNewOpening(true)}
            className="flex shrink-0 items-center gap-2 px-[max(0.75rem,8px)] py-2 text-left text-[max(0.875rem,12px)] text-ink-2 transition-colors hover:text-ink"
          >
            <span aria-hidden="true" className="text-[1.2em] leading-none">+</span>
            Add a position
          </button>}
          {/* The same sheet as Openings. A TA's new opening is theirs (old system:
              a TA creates self-assigned), so it joins today's workday as Follow-up
              unless the day is full; then it waits under "Also yours". */}
          {newOpening && (
            <NewOpening
              start=""
              onClose={() => setNewOpening(false)}
              onCreate={(o) => {
                setNewOpening(false);
                const p = fresh(o.id, o.title, o.client);
                setMade((m) => [...m, p]);
                if (Object.keys(picked).length >= MAX_DAY) return setRefusal(`At most ${MAX_DAY} positions a day. ${o.title} is under Also yours.`);
                setRefusal("");
                setPicked({ ...picked, [p.id]: p.type });
                setActive(p.id);
              }}
            />
          )}
        </div>

        {active && picked[active] && (
          <ChecksList
            key={active}
            checks={checksOf(active)}
            lead={PERSON.Lead.name.split(" ")[0]}
            onExcuse={(key, reason) =>
              desk && liveDay
                ? answered(excuse({ workdayId: liveDay.id, jobId: active, key: checksOf(active).find((c) => c.key === key)?.full ?? key, reason: reason ?? "", withdraw: !reason }))
                : setExcuses((e) => {
                const next = { ...e };
                if (reason) next[`${active}:${key}`] = reason;
                else delete next[`${active}:${key}`];
                return next;
              })
            }
          />
        )}

        {others.length > 0 && (
          <div className="max-md:hidden">
            <p className="text-[max(0.75rem,11px)] font-medium tracking-[0.06em] text-ink-3">ALSO YOURS</p>
            <ul className="mt-3 space-y-3">
              {others.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => toggle(p)}
                    title="Add to today"
                    className="text-left text-[max(0.875rem,12px)] text-ink transition-colors hover:text-brand"
                  >
                    {p.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {dayEnd ? (
          <div className="mt-auto rounded-md bg-brand-soft px-4 py-3.5 max-md:mt-0">
            <p className="text-[max(0.875rem,12px)] font-medium text-brand">Today&rsquo;s workday is finished &middot; {endLabel}</p>
            <p className="mt-0.5 text-[max(0.8125rem,11.5px)] text-ink-2">Follow-up and Add-on emails can still go</p>
          </div>
        ) : (
          <div className="mt-auto rounded-md bg-warn-soft px-4 py-3.5 max-md:mt-0">
            <p className="text-[max(0.875rem,12px)] font-medium text-warn">EOD due at 6:00</p>
            <p className="mt-0.5 text-[max(0.8125rem,11.5px)] text-ink-2">The day ends with your first 100% EOD</p>
          </div>
        )}
      </aside>

      {/* AURA. The talk grows upward from the box, like a chat. */}
      <section className="flex min-h-0 flex-1 flex-col">
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-[max(53.75rem,300px)] flex-col justify-end gap-[max(2rem,18px)] px-[max(1.5rem,14px)] pb-[max(1.5rem,14px)] pt-8">
            <Say>
              {part}, {first}. {WORDS[things.length] ?? things.length} things need you before we plan.
            </Say>
            <div data-say className="flex flex-col gap-[max(0.5rem,5px)] rounded-lg bg-surface-2 p-[max(0.5rem,5px)]">
              {things.map((t) => (
                <ThingRow key={t.id} thing={t} onFlip={() => flip(t.id)} />
              ))}
            </div>

            <Say>Which positions are you on today?</Say>
            <div data-picks className="relative z-10 -mt-[max(0.75rem,6px)] flex flex-wrap gap-[max(0.75rem,8px)] pl-[max(3.375rem,0px)] max-md:pl-0">
              {ranked.map(({ d: p, suggested }) =>
                picked[p.id] ? (
                  <span
                    key={p.id}
                    data-chip
                    className="relative flex h-[max(2.625rem,36px)] items-center gap-[max(0.625rem,6px)] rounded-full bg-brand-soft hover:z-10 focus-within:z-10 pl-[max(0.5rem,5px)] pr-[max(0.375rem,4px)]"
                  >
                    <button
                      type="button"
                      onClick={() => toggle(p)}
                      aria-pressed="true"
                      title="Take off today"
                      className="flex items-center gap-[max(0.625rem,6px)] text-[max(0.9375rem,13px)] font-medium text-brand"
                    >
                      <span className="flex size-[max(1.625rem,20px)] items-center justify-center rounded-full bg-brand text-white">
                        <CheckIcon />
                      </span>
                      {p.title}
                    </button>
                    <PillMenu
                      options={WORK_TYPES}
                      initial={picked[p.id]}
                      onChange={(v) => setType(p.id, v as WorkType)}
                      title="Work type"
                      pillClass="flex h-[max(1.625rem,22px)] items-center gap-1 rounded-full bg-white px-2.5 text-[max(0.75rem,11px)] text-ink"
                    />
                  </span>
                ) : (
                  <button
                    key={p.id}
                    type="button"
                    data-chip
                    onClick={() => toggle(p)}
                    aria-pressed="false"
                    title={suggested ? "AURA suggests this one today" : "Add to today"}
                    className="flex h-[max(2.625rem,36px)] items-center gap-2 rounded-full border border-border bg-white px-[max(1.125rem,12px)] text-[max(0.9375rem,13px)] text-ink transition-colors hover:border-brand/40"
                  >
                    {p.title}
                    {suggested && <span aria-label="suggested" className="size-1.5 rounded-full bg-violet" />}
                  </button>
                ),
              )}
            </div>
            <p data-say className="-mt-[max(1rem,8px)] pl-[max(3.375rem,0px)] text-[max(0.875rem,12px)] text-ink-3 max-md:pl-0">
              {startLine(ranked.filter((r) => picked[r.d.id]))}
            </p>
            {refusal && <p className="-mt-[max(1rem,8px)] pl-[max(3.375rem,0px)] text-[max(0.8125rem,11.5px)] text-warn max-md:pl-0">{refusal}</p>}

            {chat.map((m) => (
              <Fragment key={m.id}>
                <p className="max-w-[80%] self-end rounded-lg rounded-br-xs bg-surface-2 px-[max(1.25rem,14px)] py-[max(0.875rem,9px)] text-[max(1rem,13.5px)] text-ink">{m.text}</p>
                {!m.reply ? (
                  <Thinking />
                ) : m.reply === "na" ? (
                  <Say>I&rsquo;m not connected yet &mdash; this screen is a preview, so I can&rsquo;t answer that today.</Say>
                ) : "steps" in m.reply ? (
                  <DayPlan plan={m.reply} latest={m.id === latestPlan} onChange={change} />
                ) : (
                  <Told a={m.reply} live={rows} onAccept={(row) => saveRow({ ...row, state: "working", accepted: "Today" })} />
                )}
              </Fragment>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[max(53.75rem,300px)] px-[max(1.5rem,14px)] pb-[max(2.25rem,14px)]">
          {/* Suggestions: the same clear gap above (the chips) and below (the box), 17 Nov 2026. */}
          <div className="mb-[max(1.5rem,14px)] flex flex-wrap gap-[max(0.75rem,6px)]">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" data-ask onClick={() => send(s)} className={ASK}>
                {s}
              </button>
            ))}
          </div>
          <form
            data-ask
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-center gap-[max(0.75rem,8px)] rounded-full border border-border bg-white py-[max(0.375rem,4px)] pl-[max(0.375rem,4px)] pr-[max(0.375rem,4px)] shadow-float has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand/30"
          >
            <button type="button" aria-label="Add a file (not connected yet)" className="flex size-[max(2.5rem,32px)] shrink-0 items-center justify-center rounded-full text-ink shadow-card hover:bg-surface-2">
              <PlusIcon />
            </button>
            <input
              ref={box}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={hint || "Talk to AURA — plan, ask, or jump to a position"}
              aria-label="Talk to AURA"
              className="min-w-0 flex-1 bg-transparent text-[max(1rem,13.5px)] text-ink outline-none placeholder:text-ink-2"
            />
            <button type="button" aria-label="Speak to AURA (not connected yet)" className="hidden shrink-0 text-ink-2 hover:text-ink sm:block">
              <MicIcon />
            </button>
            <button type="submit" aria-label="Send" className="flex size-[max(2.75rem,34px)] shrink-0 items-center justify-center rounded-full bg-brand text-white transition-colors hover:bg-brand">
              <ArrowUpIcon />
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

const ASK =
  "flex h-[max(2.5rem,32px)] items-center rounded-full border border-border bg-white px-[max(1rem,12px)] text-[max(0.875rem,12.5px)] text-ink transition-colors hover:border-border-strong";

/** AURA thinking: its mark breathes (never spins) while it plans. */
function Thinking() {
  const glow = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    petSay("working", "Planning your day…");
    if (!glow.current) return;
    const t = gsap.to(glow.current, { scale: 1.35, opacity: 0.15, duration: 0.9, ease: "sine.inOut", repeat: -1, yoyo: true });
    return () => {
      t.kill();
    };
  }, []);
  return (
    <div role="status" className="flex items-center gap-[max(0.875rem,10px)]">
      <span className="relative flex size-[max(2.5rem,30px)] shrink-0">
        <span ref={glow} aria-hidden="true" className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,var(--color-aura-1),var(--color-aura-2),var(--color-aura-3),var(--color-aura-4),var(--color-aura-1))] opacity-40" />
        <span className="relative flex size-full items-center justify-center overflow-hidden rounded-full bg-black">
          <Image src="/aura-mark.png" alt="" width={56} height={56} className="size-full" />
        </span>
      </span>
      <p className="text-[max(1rem,13.5px)] text-ink-3">Planning your day…</p>
    </div>
  );
}

const DOT = { brand: "bg-brand", warn: "bg-warn", info: "bg-info", none: "border-[1.5px] border-border-strong bg-white" } as const;

/** AURA's plan: the headline, then the day step by step - the time, the position's
 *  colour, the work, and the position to open; Start / Change something on the
 *  latest plan only. Rows arrive one after another (start states set at once). */
function DayPlan({ plan, latest, onChange }: { plan: Plan; latest: boolean; onChange: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const rows = el.querySelectorAll("[data-step], [data-plan-act]");
    gsap.set(el, { opacity: 0, y: 14 });
    gsap.set(rows, { opacity: 0, x: -10 });
    const a = gsap.to(el, { opacity: 1, y: 0, duration: DUR.slow, ease: EASE.out, clearProps: "opacity,transform" });
    const b = gsap.to(rows, { opacity: 1, x: 0, duration: DUR.base, ease: EASE.out, stagger: 0.07, delay: 0.15, clearProps: "opacity,transform" });
    const done = setTimeout(() => [a, b].forEach((t) => t.progress(1)), 2000);
    return () => {
      clearTimeout(done);
      [a, b].forEach((t) => t.progress(1).kill());
    };
  }, []);
  return (
    <>
      <Say>{plan.headline}</Say>
      {plan.steps.length > 0 && (
        <div ref={card} className={"rounded-lg border border-border bg-white px-[max(1.5rem,14px)] py-[max(1.25rem,12px)] " + (latest ? "" : "opacity-60")}>
          <ol className="flex flex-col">
            {plan.steps.map((s) => (
              <li key={s.at + s.what} data-step className="flex items-center gap-[max(1.5rem,12px)] py-[max(0.7rem,8px)]">
                <span className="w-[max(3rem,40px)] shrink-0 font-mono text-[max(0.8125rem,11.5px)] text-ink-3">{s.at}</span>
                <span aria-hidden="true" className={"size-2.5 shrink-0 rounded-full " + DOT[s.tone]} />
                <span className="min-w-0 flex-1 text-[max(1rem,13.5px)] text-ink">{s.what}</span>
                {s.where && s.href && (
                  <Link href={s.href} className="flex shrink-0 items-center gap-1.5 text-[max(0.875rem,12px)] text-ink-3 hover:text-ink" title={`Open ${s.where}`}>
                    {s.where}
                    <svg {...svg} className="size-4" data-nudge>
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </Link>
                )}
              </li>
            ))}
          </ol>
          {latest && (
            <div className="mt-[max(0.9rem,10px)] flex flex-wrap gap-[max(0.75rem,8px)]">
              {plan.first && (
                <Link data-plan-act href="/openings/demo" className="flex h-[max(2.75rem,36px)] items-center gap-2 rounded-full bg-ink px-[max(1.25rem,14px)] text-[max(0.9375rem,13px)] font-medium text-white hover:bg-black">
                  Start with {plan.first}
                  <span aria-hidden="true">→</span>
                </Link>
              )}
              <button type="button" data-plan-act onClick={onChange} className="flex h-[max(2.75rem,36px)] items-center rounded-full border border-border-strong px-[max(1.25rem,14px)] text-[max(0.9375rem,13px)] font-medium text-ink hover:bg-surface-2">
                Change something
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

const TONE: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-2 text-ink-3",
};
const PILL = "shrink-0 rounded-full px-[max(0.625rem,7px)] py-0.5 text-[max(0.8125rem,11.5px)] font-medium";

/** AURA's answer about the desk, in the plan card's style: the sentence, then any
 *  numbers, skill chips, what is missing, and rows - a strategy still to accept gets
 *  its Accept button (read live, so it turns to Working once pressed). */
function Told({ a, live, onAccept }: { a: Answer; live: Row[]; onAccept: (r: Row) => void }) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const parts = el.querySelectorAll("[data-part]");
    gsap.set(el, { opacity: 0, y: 10 });
    gsap.set(parts, { opacity: 0, x: -8 });
    const x = gsap.to(el, { opacity: 1, y: 0, duration: DUR.base, ease: EASE.out, clearProps: "opacity,transform" });
    const y = gsap.to(parts, { opacity: 1, x: 0, duration: DUR.base, ease: EASE.out, stagger: 0.05, delay: 0.1, clearProps: "opacity,transform" });
    const done = setTimeout(() => [x, y].forEach((t) => t.progress(1)), 1500);
    return () => {
      clearTimeout(done);
      [x, y].forEach((t) => t.progress(1).kill());
    };
  }, []);
  const body = a.stats || a.chips?.length || a.warn?.length || a.rows?.length;
  return (
    <>
      <Say>{a.say}</Say>
      {body ? (
        <div ref={card} className="rounded-lg border border-border bg-white px-[max(1.5rem,14px)] py-[max(1rem,10px)]">
          {a.stats && (
            <div data-part className="flex flex-wrap gap-x-[max(2.5rem,18px)] gap-y-2 pb-[max(0.75rem,8px)]">
              {a.stats.map(([v, l]) => (
                <p key={l} className="flex items-baseline gap-1.5">
                  <span className="text-[max(1.5rem,18px)] font-semibold text-ink">{v}</span>
                  <span className="text-[max(0.875rem,12px)] text-ink-3">{l}</span>
                </p>
              ))}
            </div>
          )}
          {(a.chips?.length || a.warn?.length) ? (
            <div data-part className="flex flex-wrap gap-1.5 pb-[max(0.75rem,8px)]">
              {a.chips?.map((c) => (
                <span key={c} className={PILL + " bg-surface-2 font-normal text-ink-2"}>
                  {c}
                </span>
              ))}
              {a.warn?.map((w) => (
                <span key={w} className={PILL + " bg-warn-soft text-warn"}>
                  {w}
                </span>
              ))}
            </div>
          ) : null}
          {a.rows && a.rows.length > 0 && (
            <ol className="divide-y divide-border">
              {a.rows.map((l) => {
                const now = l.accept && live.find((r) => r.job === l.accept!.job && r.name === l.accept!.name);
                const row = (
                  <>
                    {l.n !== undefined && (
                      <span className="flex size-[max(1.75rem,22px)] shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[max(0.8125rem,11px)] text-ink-2">{l.n}</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[max(1rem,13.5px)] font-medium text-ink">{l.main}</span>
                      {l.meta && <span className="block truncate text-[max(0.8125rem,11.5px)] text-ink-3">{l.meta}</span>}
                    </span>
                    {now && now.state === "waiting" ? (
                      <button
                        type="button"
                        onClick={() => onAccept(now)}
                        className="shrink-0 rounded-full bg-ink px-[max(1rem,11px)] py-[max(0.375rem,4px)] text-[max(0.8125rem,11.5px)] font-medium text-white hover:bg-black"
                      >
                        Accept
                      </button>
                    ) : now ? (
                      <span className={PILL + " bg-brand-soft text-brand"}>Working</span>
                    ) : (
                      l.tag && <span className={PILL + " " + TONE[l.tag.tone]}>{l.tag.text}</span>
                    )}
                    {l.href && (
                      <svg {...svg} className="size-4 shrink-0 text-ink-3" data-nudge>
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    )}
                  </>
                );
                const cls = "flex items-center gap-[max(1rem,10px)] py-[max(0.7rem,8px)]";
                return (
                  <li key={l.main + (l.meta ?? "")} data-part>
                    {l.href ? (
                      <Link href={l.href} className={cls + " -mx-2 rounded-md px-2 transition-colors hover:bg-surface-2/60"}>
                        {row}
                      </Link>
                    ) : (
                      <div className={cls}>{row}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      ) : null}
    </>
  );
}

/** One line from AURA, with its mark. */
function Say({ children }: { children: ReactNode }) {
  return (
    <div data-say className="flex items-center gap-[max(0.875rem,10px)]">
      <span className="flex size-[max(2.5rem,30px)] shrink-0 items-center justify-center overflow-hidden rounded-full bg-black">
        <Image src="/aura-mark.png" alt="" width={56} height={56} className="size-full" />
      </span>
      <p className="text-[max(1.125rem,14px)] font-medium text-ink">{children}</p>
    </div>
  );
}

/** One thing that needs the person: done ones sit on the grey with an Undo, open
 *  ones are white with their one button. */
function ThingRow({ thing: t, onFlip }: { thing: Thing; onFlip: () => void }) {
  const row = useRef<HTMLDivElement>(null);
  // A change of state lands with a small settle, so the eye sees which row moved.
  const flip = () => {
    gsap.fromTo(row.current, { scale: 0.985 }, { scale: 1, duration: DUR.base, ease: EASE.pop });
    onFlip();
  };
  const button =
    "shrink-0 rounded-full bg-ink px-[max(1.125rem,12px)] py-[max(0.625rem,7px)] text-[max(0.875rem,12px)] font-medium text-white transition-colors hover:bg-black";
  return (
    <div
      ref={row}
      data-thing
      className={
        "flex items-center gap-[max(1rem,10px)] rounded-md px-[max(1rem,10px)] py-[max(0.875rem,9px)] " +
        (t.done ? "" : "bg-white")
      }
    >
      <span
        className={
          "flex size-[max(2.5rem,30px)] shrink-0 items-center justify-center rounded-full " +
          (t.done ? "bg-brand text-white" : "bg-surface-2 text-ink")
        }
      >
        {t.done ? <CheckIcon /> : t.icon === "doc" ? <DocIcon /> : t.icon === "target" ? <TargetIcon /> : <CheckIcon />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={"block text-[max(1rem,13px)] " + (t.done ? "text-ink-3" : "font-medium text-ink")}>
          {t.done ? (t.doneTitle ?? t.title) : t.title}
        </span>
        <span className="block text-[max(0.875rem,12px)] text-ink-3">{t.sub}</span>
      </span>
      {t.done ? (
        t.doneTitle && (
          <button type="button" onClick={flip} className="shrink-0 text-[max(0.875rem,12px)] text-ink-3 hover:text-ink">
            Undo
          </button>
        )
      ) : t.href ? (
        <Link href={t.href} className={button}>
          {t.action}
        </Link>
      ) : (
        <button type="button" onClick={flip} className={button}>
          {t.action}
        </button>
      )}
    </div>
  );
}

/** How far a position is along today, as a ring in its work type's colour. */
function Ring({ value, color }: { value: number; color: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className="size-[max(2.25rem,28px)] shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-border)" strokeWidth="3" />
      <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${c * Math.max(value, 0.04)} ${c}`} />
    </svg>
  );
}

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
function CheckIcon() {
  return (
    <svg {...svg} className="size-[55%]">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg {...svg} className="size-[45%]">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg {...svg} className="size-[48%]">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg {...svg} className="size-[45%]">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg {...svg} className="size-[max(1.25rem,17px)]">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
function ArrowUpIcon() {
  return (
    <svg {...svg} className="size-[45%]" strokeWidth={2.4}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}
