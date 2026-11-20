"use client";

// The TA Lead, Director and Ops home (owner 19 Nov 2026): they do not start a workday.
// They land on the same AURA screen a TA does - the greeting over AURA's living light -
// but the button is Start chat. Pressing it opens the chat in place: a rail on the left
// (the lead: every TA with their checks ring; the Director: sets to review; Ops: sets
// with clients) and AURA in the middle, answering as cards. A rail row asks AURA about
// that person. The full team board is one press away ("Team board"); an admin keeps
// that board as their home (TodayScreen).
// Signed in, every role's answers read the real desk (ui/lead:desk, ui/homes:director,
// ui/homes:ops, 19 Nov); the sample desk only when signed out.
// ponytail: plain-word answers (homeAnswers.ts); the Haiku answer comes later (E5).
import { Fragment, cloneElement, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { DUR, EASE, gsap, motionOK } from "@/lib/gsap";
import { useMe, useSignedInPerson } from "@/lib/role";
import { door, useDoorQuery } from "@/lib/backend";
import { petSay } from "@/lib/pet";
import Today from "./Today";
import Home from "./Homes";
import { answer, brief, SAMPLE_DESK, startStats, SUGGEST, type Desk, type HomeRole, type TeamPlan } from "./homeAnswers";
import type { Answer, Tone } from "./desk";

const LINE: Record<HomeRole, string> = {
  Lead: "Ask AURA how the team is doing, who is behind, and what needs your decision.",
  Director: "Ask AURA which sets wait on you and where every candidate stands.",
  Ops: "Ask AURA what waits on clients, which interviews to arrange, and what to chase.",
};
const CAPTION: Record<HomeRole, string> = {
  Lead: "AURA reads every TA's day for you.",
  Director: "AURA reads the sets and the stages for you.",
  Ops: "AURA reads every client and interview for you.",
};

type Msg = { id: number; text?: string; reply?: Answer };
const EMPTY: Desk = { team: [], decide: [], roles: [], waiting: [], stages: [], clients: [], withClient: [], interviews: [], chase: [] };
// Kept for the visit: going to another page and back finds the chat as it was.
const kept: Partial<Record<HomeRole, { open: boolean; msgs: Msg[] }>> = {};

type Read = ({ ok: true } & Partial<Desk>) | { ok: false; message: string } | undefined;

export default function AuraHome({ role }: { role: HomeRole }) {
  // Signed in, the lead reads the real desk; until it arrives, nothing is invented.
  const signed = useSignedInPerson() !== null;
  // Each role reads its own desk (ui/lead:desk, ui/homes:director, ui/homes:ops);
  // only that role's part is used, so the sample never shows to a signed-in person.
  const lead = useDoorQuery(door.leadDesk, signed && role === "Lead" ? {} : "skip") as Read;
  const director = useDoorQuery(door.directorDesk, signed && role === "Director" ? {} : "skip") as Read;
  const ops = useDoorQuery(door.opsDesk, signed && role === "Ops" ? {} : "skip") as Read;
  // Each TA's day plan, read only (phase 5): the lead asks "Today's plans".
  const plans = useDoorQuery(door.planTeam, signed && role === "Lead" ? {} : "skip") as { ok: true; team: TeamPlan[] } | { ok: false } | undefined;
  const read = role === "Lead" ? lead : role === "Director" ? director : ops;
  const desk: Desk | null = !signed ? SAMPLE_DESK : read?.ok ? { ...EMPTY, ...read, ...(plans?.ok ? { plans: plans.team } : {}) } : null;
  const failed = read && !read.ok ? read.message : null;
  const [open, setOpen] = useState(() => kept[role]?.open ?? false);
  const [board, setBoard] = useState(false);
  useEffect(() => {
    kept[role] = { open, msgs: kept[role]?.msgs ?? [] };
  }, [open, role]);

  if (board)
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Home role={role} />
        <button type="button" onClick={() => setBoard(false)} className="absolute left-[max(3.5rem,14px)] top-3 flex items-center gap-2 rounded-full bg-surface px-3.5 py-1.5 text-small text-ink-2 shadow-card hover:text-ink">
          <Mark size="size-5" /> Back to AURA
        </button>
      </div>
    );
  if (!open)
    return (
      <Today
        onStart={() => setOpen(true)}
        button="Start chat"
        line={failed ?? LINE[role]}
        caption={desk ? CAPTION[role] : failed ? "Start chat to see what AURA can still read." : "Reading the team…"}
        stats={desk ? startStats(role, desk) : []}
      />
    );
  return <Chat role={role} desk={desk} failed={failed} onBoard={() => setBoard(true)} />;
}

const TONE: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-2 text-ink-2",
};
const PILL = "shrink-0 whitespace-nowrap rounded-full px-[max(0.625rem,7px)] py-0.5 text-[max(0.8125rem,11.5px)] font-medium";
const ASK =
  "flex h-[max(2.5rem,32px)] items-center rounded-full border border-border bg-white px-[max(1rem,12px)] text-[max(0.875rem,12.5px)] text-ink transition-colors hover:border-border-strong";

function Chat({ role, desk, failed, onBoard }: { role: HomeRole; desk: Desk | null; failed: string | null; onBoard: () => void }) {
  const { first } = useMe();
  const [msgs, setMsgs] = useState<Msg[]>(() => kept[role]?.msgs ?? []);
  const [draft, setDraft] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const seq = useRef(msgs.length);

  useEffect(() => {
    kept[role] = { open: true, msgs };
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, role]);

  // Arriving from Start chat: the rail slides in, AURA's first words rise. Once.
  useEffect(() => {
    if (!root.current || !motionOK()) return;
    const rail = root.current.querySelector("[data-rail]");
    const says = root.current.querySelectorAll("[data-first]");
    gsap.set(rail, { opacity: 0, x: -16 });
    gsap.set(says, { opacity: 0, y: 12 });
    const a = gsap.to(rail, { opacity: 1, x: 0, duration: DUR.slow, ease: EASE.out, clearProps: "opacity,transform" });
    const b = gsap.to(says, { opacity: 1, y: 0, duration: DUR.slow, ease: EASE.out, stagger: 0.08, delay: 0.1, clearProps: "opacity,transform" });
    return () => [a, b].forEach((t) => t.progress(1).kill());
  }, []);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const id = ++seq.current;
    setMsgs((m) => [...m, { id, text: t }]);
    setDraft("");
    petSay("working", "Reading the desk…");
    // A short beat so the answer reads as AURA's turn; the backend read replaces it.
    setTimeout(() => {
      const a = desk ? answer(role, t, desk) : { say: failed ?? "Still reading the team. Ask again in a moment." };
      setMsgs((m) => m.map((x) => (x.id === id ? { ...x, reply: a } : x)));
      petSay("done", a.say);
    }, 450);
  };

  return (
    <div ref={root} className="flex min-h-0 flex-1 max-md:flex-col">
      <Rail role={role} desk={desk ?? EMPTY} loading={!desk && !failed} onAsk={send} onBoard={onBoard} />

      <section className="flex min-h-0 flex-1 flex-col">
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-[max(53.75rem,300px)] flex-col justify-end gap-[max(2rem,18px)] px-[max(1.5rem,14px)] pb-[max(1.5rem,14px)] pt-8">
            <div data-first>
              {desk ? <Card a={{ ...brief(role, desk), say: `Hi ${first}. ${brief(role, desk).say}` }} /> : failed ? <Card a={{ say: failed }} /> : <Thinking />}
            </div>
            {msgs.map((m) => (
              <Fragment key={m.id}>
                <p className="max-w-[80%] self-end rounded-lg rounded-br-xs bg-surface-2 px-[max(1.25rem,14px)] py-[max(0.875rem,9px)] text-[max(1rem,13.5px)] text-ink">{m.text}</p>
                {m.reply ? <Card a={m.reply} /> : <Thinking />}
              </Fragment>
            ))}
          </div>
        </div>

        <div data-first className="mx-auto w-full max-w-[max(53.75rem,300px)] px-[max(1.5rem,14px)] pb-[max(2.25rem,14px)]">
          <div className="mb-[max(1.5rem,14px)] flex flex-wrap gap-[max(0.75rem,6px)]">
            {SUGGEST[role].map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className={ASK}>
                {s}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-center gap-[max(0.75rem,8px)] rounded-full border border-border bg-white py-[max(0.375rem,4px)] pl-[max(1.25rem,14px)] pr-[max(0.375rem,4px)] shadow-float has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand/30"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={role === "Lead" ? "Ask about the team — “How is Dilini doing?”" : "Ask AURA"}
              aria-label="Talk to AURA"
              className="min-w-0 flex-1 bg-transparent text-[max(1rem,13.5px)] text-ink outline-none placeholder:text-ink-3"
            />
            <button type="submit" aria-label="Send" disabled={!draft.trim()} className="flex size-[max(2.75rem,34px)] shrink-0 items-center justify-center rounded-full bg-brand text-white transition-opacity disabled:opacity-40">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-[45%]">
                <path d="M12 19V5m0 0-6 6m6-6 6 6" />
              </svg>
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

/** The left rail: who the person is responsible for, each row asks AURA about them. */
/** How many rows the rail shows before "Show more" (owner, 20 Nov 2026: 16 TAs in a row was too long). */
const RAIL_FIRST = 5;

function Rail({ role, desk, loading, onAsk, onBoard }: { role: HomeRole; desk: Desk; loading: boolean; onAsk: (q: string) => void; onBoard: () => void }) {
  const { team, waiting, withClient } = desk;
  const [all, setAll] = useState(false);
  const started = team.filter((t) => t.day.started).length;
  const head = loading
    ? { title: role === "Lead" ? "The team" : role === "Director" ? "For your review" : "With clients", sub: "Reading the desk…" }
    : role === "Lead"
      ? { title: "The team", sub: `Today · ${started} of ${team.length} started` }
      : role === "Director"
        ? { title: "For your review", sub: `${waiting.length} ${waiting.length === 1 ? "set" : "sets"} waiting` }
        : { title: "With clients", sub: `${withClient.length} with clients` };
  const rows: { key: string; lead: ReactNode; main: string; sub: string; subClass?: string; ask: string }[] =
    role === "Lead"
      ? team.map((t) => ({
          key: t.name,
          lead: <Ring done={t.day.done} of={t.day.of} eod={!!t.day.eod} />,
          main: t.name,
          sub: t.day.eod ? `EOD sent ${t.day.eod}` : t.day.started ? `Started ${t.day.started} · ${t.day.done} of ${t.day.of}` : "Not started",
          subClass: t.day.eod ? "text-brand" : t.day.started ? "text-ink-3" : "text-danger",
          ask: `How is ${t.name.split(" ")[0]} doing?`,
        }))
      : role === "Director"
        ? waiting.map((w) => ({ key: w.who, lead: <Initials s={w.who} />, main: w.who, sub: `${w.title} · set ${w.set}`, ask: `Tell me about ${w.who}` }))
        : withClient.map((w) => ({ key: w.who, lead: <Initials s={w.who} />, main: w.who, sub: `${w.client} · ${w.days ? `${w.days}d quiet` : "sent today"}`, subClass: w.days >= 3 ? "text-danger" : "text-ink-3", ask: `Tell me about ${w.who}` }));

  return (
    <aside
      data-rail
      className="flex w-[max(25rem,280px)] shrink-0 flex-col gap-[max(1.5rem,14px)] overflow-y-auto border-r border-border pb-[max(2.25rem,16px)] pl-[max(2.25rem,18px)] pr-[max(1.75rem,14px)] pt-[max(2.5rem,18px)] [scrollbar-width:thin] max-md:max-h-[38dvh] max-md:w-full max-md:gap-3 max-md:border-b max-md:border-r-0 max-md:p-4"
    >
      <div>
        <h1 className="text-[max(1.75rem,20px)] leading-tight text-ink">{head.title}</h1>
        <p className="mt-1 text-[max(0.875rem,12px)] text-ink-3">{head.sub}</p>
      </div>
      <ul className="flex flex-col gap-[max(0.75rem,7px)] max-md:flex-row max-md:overflow-x-auto max-md:[scrollbar-width:none]">
        {loading
          ? Array.from({ length: RAIL_FIRST }, (_, i) => <RailSkeleton key={i} />)
          : (all ? rows : rows.slice(0, RAIL_FIRST)).map((r, i) => (
          <li key={r.key} className="shrink-0">
            <button type="button" onClick={() => onAsk(r.ask)} title={r.ask} className="flex w-full items-center gap-[max(1.25rem,14px)] rounded-md px-[max(0.75rem,8px)] py-[max(1.1rem,10px)] text-left transition-colors hover:bg-surface-2/70">
              {isValidElement<{ delay?: number }>(r.lead) && r.lead.type === Ring ? cloneElement(r.lead, { delay: (i % RAIL_FIRST) * 0.06 }) : r.lead}
              <span className="min-w-0">
                <span className="block truncate text-[max(1rem,13.5px)] font-medium text-ink">{r.main}</span>
                <span className={"block truncate text-[max(0.875rem,12px)] " + (r.subClass ?? "text-ink-3")}>{r.sub}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!loading && rows.length > RAIL_FIRST && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="-mt-2 flex items-center gap-1.5 self-start rounded-full px-[max(0.75rem,8px)] py-1.5 text-[max(0.875rem,12px)] font-medium text-brand-strong transition-colors hover:bg-surface-2"
        >
          {all ? "Show less" : `Show ${rows.length - RAIL_FIRST} more`}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={"size-3.5 transition-transform " + (all ? "rotate-180" : "")} aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}
      <button type="button" onClick={onBoard} className="mt-auto flex items-center justify-between rounded-md bg-surface-2 px-4 py-3 text-left transition-colors hover:bg-surface-3 max-md:mt-0">
        <span>
          <span className="block text-[max(0.875rem,12px)] font-medium text-ink">Team board</span>
          <span className="block text-[max(0.8125rem,11.5px)] text-ink-3">Everything on one page</span>
        </span>
        <svg data-nudge viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-ink-3" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </aside>
  );
}

/** A TA's checks as a ring: green when the EOD is sent, amber under half, red not started.
 *  The arc draws in and the number counts up when the row appears (owner, 20 Nov 2026);
 *  the figure shrinks with its length so "3/209" sits inside the ring. */
function Ring({ done, of, eod, delay = 0 }: { done: number; of: number; eod: boolean; delay?: number }) {
  const share = of ? done / of : 0;
  const tone = eod ? "stroke-brand" : !of ? "stroke-danger" : share < 0.5 ? "stroke-warn" : "stroke-info";
  const arc = useRef<SVGCircleElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  const label = of ? `${done}/${of}` : "–";
  const target = Math.max(of ? 4 : 0, share * 100);
  useEffect(() => {
    const el = arc.current;
    const n = num.current;
    if (!el || !n) return;
    el.style.strokeDasharray = `${target} 100`;
    if (!motionOK() || !of) return;
    const c = { v: 0, d: 0 };
    el.style.strokeDasharray = "0 100";
    n.textContent = `0/${of}`;
    const t = gsap.to(c, {
      v: target,
      d: done,
      duration: 0.9,
      delay,
      ease: EASE.out,
      onUpdate: () => {
        el.style.strokeDasharray = `${c.v} 100`;
        n.textContent = `${Math.round(c.d)}/${of}`;
      },
    });
    return () => {
      t.progress(1).kill();
      n.textContent = label;
      el.style.strokeDasharray = `${target} 100`;
    };
  }, [target, done, of, delay, label]);
  // Smaller type for longer figures, so they stay inside the ring.
  const size =
    label.length <= 3
      ? "text-[max(1.25rem,16px)]"
      : label.length === 4
        ? "text-[max(1.125rem,14.5px)]"
        : label.length === 5
          ? "text-[max(1rem,13px)]"
          : "text-[max(0.875rem,11.5px)]";
  return (
    <span className="relative flex size-[max(4.75rem,60px)] shrink-0 items-center justify-center">
      <svg viewBox="0 0 36 36" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3.5" className="stroke-surface-2" />
        <circle ref={arc} cx="18" cy="18" r="15" fill="none" strokeWidth="3.5" strokeLinecap="round" pathLength={100} strokeDasharray={`${target} 100`} className={tone} />
      </svg>
      <span ref={num} className={"font-semibold tabular-nums leading-none tracking-tight text-ink " + size}>
        {label}
      </span>
    </span>
  );
}

/** A rail row while the desk is read: a ring with a turning arc and two shimmering lines. */
function RailSkeleton() {
  const spin = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!spin.current || !motionOK()) return;
    const t = gsap.to(spin.current, { rotate: 360, duration: 1.1, ease: "none", repeat: -1, transformOrigin: "50% 50%" });
    return () => void t.kill();
  }, []);
  return (
    <li role="status" aria-label="Loading" className="flex shrink-0 items-center gap-[max(1.1rem,12px)] px-[max(0.75rem,8px)] py-[max(0.85rem,8px)]">
      <span className="relative flex size-[max(4.75rem,60px)] shrink-0 items-center justify-center">
        <svg ref={spin} viewBox="0 0 36 36" className="absolute inset-0 size-full" aria-hidden="true">
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3.5" className="stroke-surface-2" />
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3.5" strokeLinecap="round" pathLength={100} strokeDasharray="22 100" className="stroke-brand" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col gap-2">
        <span className="shimmer block h-3.5 w-24 rounded-md" />
        <span className="shimmer block h-3 w-32 rounded-md" />
      </span>
    </li>
  );
}

const Initials = ({ s }: { s: string }) => (
  <span className="flex size-[max(2.5rem,30px)] shrink-0 items-center justify-center rounded-full bg-brand-soft text-[max(0.75rem,11px)] font-medium text-brand" aria-hidden="true">
    {s
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")}
  </span>
);

const Mark = ({ size = "size-[max(2.5rem,30px)]" }: { size?: string }) => (
  <span className={"flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-black " + size}>
    <Image src="/aura-mark.png" alt="" width={56} height={56} className="size-full" />
  </span>
);

/** AURA thinking: its mark breathes (never spins). */
function Thinking() {
  const glow = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!glow.current || !motionOK()) return;
    const t = gsap.to(glow.current, { scale: 1.35, opacity: 0.15, duration: 0.9, ease: "sine.inOut", repeat: -1, yoyo: true });
    return () => void t.kill();
  }, []);
  return (
    <div role="status" className="flex items-center gap-[max(0.875rem,10px)]">
      <span className="relative flex size-[max(2.5rem,30px)] shrink-0">
        <span ref={glow} aria-hidden="true" className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,var(--color-aura-1),var(--color-aura-2),var(--color-aura-3),var(--color-aura-4),var(--color-aura-1))] opacity-40" />
        <span className="relative">
          <Mark />
        </span>
      </span>
      <p className="text-[max(1rem,13.5px)] text-ink-3">Reading the desk…</p>
    </div>
  );
}

/** AURA's answer: the sentence, then numbers, chips, what is behind, and rows. */
function Card({ a }: { a: Answer }) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = card.current;
    if (!el || !motionOK()) return;
    const parts = el.querySelectorAll("[data-part]");
    gsap.set(parts, { opacity: 0, x: -8 });
    const t = gsap.to(parts, { opacity: 1, x: 0, duration: DUR.base, ease: EASE.out, stagger: 0.05, clearProps: "opacity,transform" });
    return () => void t.progress(1).kill();
  }, []);
  const body = a.stats || a.chips?.length || a.warn?.length || a.rows?.length;
  return (
    <div className="flex flex-col gap-[max(0.875rem,9px)]">
      <div className="flex items-center gap-[max(0.875rem,10px)]">
        <Mark />
        <p className="text-[max(1.125rem,14px)] font-medium text-ink">{a.say}</p>
      </div>
      {body ? (
        <div ref={card} className="rounded-lg border border-border bg-white px-[max(1.5rem,14px)] py-[max(1rem,10px)] md:ml-[max(3.375rem,0px)]">
          {a.stats && (
            <div data-part className="flex flex-wrap gap-x-[max(2.5rem,18px)] gap-y-2 pb-[max(0.75rem,8px)]">
              {a.stats.map(([v, l]) => (
                <p key={l} className="flex items-baseline gap-1.5">
                  <span className="text-[max(1.5rem,18px)] font-semibold tabular-nums text-ink">{v}</span>
                  <span className="text-[max(0.875rem,12px)] text-ink-3">{l}</span>
                </p>
              ))}
            </div>
          )}
          {a.chips?.length || a.warn?.length ? (
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
                const row = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[max(1rem,13.5px)] font-medium text-ink">{l.main}</span>
                      {l.meta && <span className="block truncate text-[max(0.8125rem,11.5px)] text-ink-3">{l.meta}</span>}
                    </span>
                    {l.tag && <span className={PILL + " " + TONE[l.tag.tone]}>{l.tag.text}</span>}
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
    </div>
  );
}
