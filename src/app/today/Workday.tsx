"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { DUR, EASE, gsap, useGSAP } from "@/lib/gsap";
import { USER } from "@/lib/user";
import PillMenu, { type MenuOption } from "../openings/[id]/PillMenu";
import { aboutTheDay, planDay, type Plan } from "./plan";

// T2 · Today, after Start workday (owner's design, 13 Nov 2026): the day's rail on
// the left, AURA in the middle. Placeholder data until the backend is wired: with
// it, the positions are this person's assigned openings, the "things" are one small
// read, and picking positions starts the workday on the server.
// T3 (14 Nov 2026): say how the day looks and AURA lays it out - the plan card with
// times, the position each step belongs to, "Start with <position>" and "Change
// something" (./plan.ts). Anything else AURA still says plainly it cannot answer yet.

type WorkType = "100%" | "Follow-up" | "Add-on";
type Position = { id: string; title: string; client: string; type: WorkType; progress: number };

const POSITIONS: Position[] = [
  { id: "sap", title: "SAP Transformation", client: "PGP Glass", type: "100%", progress: 0.72 },
  { id: "fin", title: "Finance Manager", client: "Hayleys", type: "Follow-up", progress: 0.28 },
  { id: "prod", title: "Production Executive", client: "MAS Holdings", type: "Follow-up", progress: 0 },
  { id: "hr", title: "HR Business Partner", client: "Dialog", type: "100%", progress: 0 },
];

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

const SUGGESTIONS = ["What’s late?", "Who replied?", "Draft my EOD"] as const;
const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

// The clock in the rail, one tick a minute; the server draws nothing for it.
const minute = (cb: () => void) => {
  const t = setInterval(cb, 30_000);
  return () => clearInterval(t);
};

export default function Workday({ startedAt }: { startedAt: number }) {
  const root = useRef<HTMLDivElement>(null);
  const first = USER.name.split(" ")[0];
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
  const [picked, setPicked] = useState<Record<string, WorkType>>({ sap: "100%", fin: "Follow-up" });
  const [active, setActive] = useState("sap");
  const [refusal, setRefusal] = useState("");
  const [things, setThings] = useState(THINGS);
  // What the person said, and AURA's answer: a plan, "not yet" for anything that
  // is not about the day, or nothing while it is still thinking.
  const [chat, setChat] = useState<{ id: number; text: string; reply?: Plan | "na" }[]>([]);
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

  const today = POSITIONS.filter((p) => picked[p.id]);
  const others = POSITIONS.filter((p) => !picked[p.id]);

  const toggle = (p: Position) => {
    setRefusal("");
    if (picked[p.id]) {
      const next = { ...picked };
      delete next[p.id];
      setPicked(next);
      if (active === p.id) setActive(Object.keys(next)[0] ?? "");
      return;
    }
    if (Object.keys(picked).length >= MAX_DAY) return setRefusal(`At most ${MAX_DAY} positions a day.`);
    const type = p.type === "100%" && Object.values(picked).filter((t) => t === "100%").length >= MAX_FULL ? "Follow-up" : p.type;
    setPicked({ ...picked, [p.id]: type });
    if (!active) setActive(p.id);
  };
  const setType = (id: string, type: WorkType) => {
    if (type === "100%" && picked[id] !== "100%" && Object.values(picked).filter((t) => t === "100%").length >= MAX_FULL) {
      setRefusal(`At most ${MAX_FULL} positions at 100% a day.`);
      return;
    }
    setRefusal("");
    setPicked({ ...picked, [id]: type });
  };

  const flip = (id: string) => setThings((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  // About the day (or the first thing said, or a change to the plan): AURA plans it
  // after a short think. Anything else: it says plainly it is not connected yet.
  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const id = ++seq.current;
    const planning = aboutTheDay(t) || !chat.some((m) => m.reply && m.reply !== "na") || hint !== "";
    if (planning) said.current = `${said.current} ${t}`;
    setChat((c) => [...c, { id, text: t }]);
    setDraft("");
    setHint("");
    // ponytail: a stand-in wait; with the backend this is the model's answer.
    timers.current.push(
      setTimeout(() => {
        const reply: Plan | "na" = planning ? planDay(today.map((p) => ({ ...p, type: picked[p.id] })), said.current) : "na";
        setChat((c) => c.map((m) => (m.id === id ? { ...m, reply } : m)));
      }, 800),
    );
  };
  const change = () => {
    setHint("Tell me what to change — e.g. “move the interview to 3:00” or “Finance first”");
    box.current?.focus();
  };
  const latestPlan = [...chat].reverse().find((m) => m.reply && m.reply !== "na")?.id;
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

  const startedLabel = new Date(startedAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
  const mins = now ? Math.max(0, now - Math.floor(startedAt / 60_000)) : 0;
  const worked = `${Math.floor(mins / 60)}h ${mins % 60}m`;

  return (
    <div ref={root} className="flex min-h-0 flex-1 max-md:flex-col">
      {/* The day's rail. On a phone it sits on top, the positions in a row. */}
      <aside
        data-rail
        className="flex w-[max(21.25rem,230px)] shrink-0 flex-col gap-[max(1.75rem,16px)] overflow-y-auto border-r border-border pb-[max(2.25rem,16px)] pl-[max(2.25rem,18px)] pr-[max(1.75rem,14px)] pt-[max(2.5rem,18px)] [scrollbar-width:none] max-md:w-full max-md:gap-3 max-md:border-b max-md:border-r-0 max-md:p-4"
      >
        <div>
          <h1 className="text-[max(1.75rem,20px)] leading-tight text-ink">Today</h1>
          <p className="mt-1 text-[max(0.875rem,12px)] text-ink-3">
            Started {startedLabel} &middot; {worked}
          </p>
        </div>

        <div className="flex flex-col gap-[max(0.5rem,4px)] max-md:flex-row max-md:overflow-x-auto max-md:[scrollbar-width:none]">
          {today.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActive(p.id)}
              aria-pressed={active === p.id}
              className={
                "flex shrink-0 items-center gap-[max(0.875rem,10px)] rounded-md px-[max(0.75rem,8px)] py-[max(0.75rem,8px)] text-left transition-colors " +
                (active === p.id ? "bg-surface-2" : "hover:bg-surface-2/60")
              }
            >
              <Ring value={p.progress} color={RING[picked[p.id]]} />
              <span className="min-w-0">
                <span className="block truncate text-[max(1rem,13.5px)] font-medium text-ink">{p.title}</span>
                <span className="block truncate text-[max(0.875rem,12px)] text-ink-3">
                  {p.client} &middot; {picked[p.id]}
                </span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => root.current?.querySelector<HTMLElement>("[data-picks] button")?.focus()}
            className="flex shrink-0 items-center gap-2 px-[max(0.75rem,8px)] py-2 text-left text-[max(0.875rem,12px)] text-ink-2 transition-colors hover:text-ink"
          >
            <span aria-hidden="true" className="text-[1.2em] leading-none">+</span>
            Add a position
          </button>
        </div>

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

        <div className="mt-auto rounded-md bg-warn-soft px-4 py-3.5 max-md:mt-0">
          <p className="text-[max(0.875rem,12px)] font-medium text-warn">EOD due at 6:00</p>
          <p className="mt-0.5 text-[max(0.8125rem,11.5px)] text-ink-2">AURA will draft it at 5</p>
        </div>
      </aside>

      {/* AURA. The talk grows upward from the box, like a chat. */}
      <section className="flex min-h-0 flex-1 flex-col">
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-[max(53.75rem,300px)] flex-col justify-end gap-[max(2rem,18px)] px-[max(1.5rem,14px)] pb-4 pt-8">
            <Say>
              {part}, {first}. {WORDS[things.length] ?? things.length} things need you before we plan.
            </Say>
            <div data-say className="flex flex-col gap-[max(0.5rem,5px)] rounded-lg bg-surface-2 p-[max(0.5rem,5px)]">
              {things.map((t) => (
                <ThingRow key={t.id} thing={t} onFlip={() => flip(t.id)} />
              ))}
            </div>

            <Say>Which positions are you on today?</Say>
            <div data-picks className="-mt-[max(0.75rem,6px)] flex flex-wrap gap-[max(0.75rem,8px)] pl-[max(3.375rem,0px)] max-md:pl-0">
              {POSITIONS.map((p) =>
                picked[p.id] ? (
                  <span
                    key={p.id}
                    data-chip
                    className="flex h-[max(2.625rem,36px)] items-center gap-[max(0.625rem,6px)] rounded-full bg-brand-soft pl-[max(0.5rem,5px)] pr-[max(0.375rem,4px)]"
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
                    className="flex h-[max(2.625rem,36px)] items-center rounded-full border border-border bg-white px-[max(1.125rem,12px)] text-[max(0.9375rem,13px)] text-ink transition-colors hover:border-brand/40"
                  >
                    {p.title}
                  </button>
                ),
              )}
            </div>
            {refusal && <p className="-mt-[max(1rem,8px)] pl-[max(3.375rem,0px)] text-[max(0.8125rem,11.5px)] text-warn max-md:pl-0">{refusal}</p>}

            {chat.map((m) => (
              <Fragment key={m.id}>
                <p className="max-w-[80%] self-end rounded-lg rounded-br-xs bg-surface-2 px-[max(1.25rem,14px)] py-[max(0.875rem,9px)] text-[max(1rem,13.5px)] text-ink">{m.text}</p>
                {!m.reply ? (
                  <Thinking />
                ) : m.reply === "na" ? (
                  <Say>I&rsquo;m not connected yet &mdash; this screen is a preview, so I can&rsquo;t answer that today.</Say>
                ) : (
                  <DayPlan plan={m.reply} latest={m.id === latestPlan} onChange={change} />
                )}
              </Fragment>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[max(53.75rem,300px)] px-[max(1.5rem,14px)] pb-[max(2.25rem,14px)]">
          <div className="mb-[max(0.875rem,8px)] flex flex-wrap gap-[max(0.75rem,6px)]">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" data-ask onClick={() => send(s)} className={ASK}>
                {s}
              </button>
            ))}
            {today.find((p) => p.id === "fin") && (
              <Link data-ask href="/openings/demo" className={ASK}>
                Open Finance Manager
              </Link>
            )}
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
