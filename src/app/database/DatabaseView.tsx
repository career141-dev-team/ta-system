"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { DUR, EASE, PIN_IN, gsap, motionOK, swapIn, useGSAP } from "@/lib/gsap";
import { useWorkdayGate } from "@/lib/workday";
import Notch from "../openings/[id]/Notch";
import {
  fitOf,
  reasonOf,
  reply,
  titleOf,
  type Chip,
  type Person,
  type Reply,
} from "./aura";

// D1 · Database - search by chatting with AURA (owner's design, 14 Nov 2026).
// Left: the chats (Today / Earlier) and New search - the history IS the chats, so
// nothing is "saved" (owner: "they will start a new chat... or continue with the
// old chat"). Right: one talk that does everything (owner: "everything comes to the
// chat... minimising the many buttons of the old system"): any kind of search,
// filtering and taking a filter off, Referral Search, people like someone, adding
// to a job and downloading CVs - each reply ending in one-tap suggestions. The rules
// live in ./aura.ts.
// Motion (DESIGN.md): each new turn by the one switch, people cards pin & settle,
// AURA's mark breathes while it looks (never spins), the send button pops.

const CvPreview = dynamic(() => import("../openings/[id]/CvPreview"));

type Turn =
  | { id: string; from: "me"; text: string }
  | ({ id: string; from: "aura" } & Reply);
type Thread = {
  id: string;
  title: string;
  when: "today" | "earlier";
  turns: Turn[];
};

let seq = 0;
const nid = () => `t${++seq}`;

/** The chips and the people of the last answer that had them: what a new message refines. */
function contextOf(turns: Turn[]) {
  let chips: Chip[] = [];
  let last: Person[] = [];
  for (const t of turns)
    if (t.from === "aura") {
      if (t.chips) chips = t.chips;
      if (t.people?.length) last = t.people;
    }
  return { chips, last };
}

/** A chat played through: the TA's lines and AURA's answers. */
function play(lines: string[]): Turn[] {
  const turns: Turn[] = [];
  for (const line of lines) {
    const { chips, last } = contextOf(turns);
    turns.push(
      { id: nid(), from: "me", text: line },
      {
        id: nid(),
        from: "aura",
        ...reply(line, { chips, last, cvsOnly: false, locked: "" }),
      },
    );
  }
  return turns;
}

const START: Thread[] = [
  {
    id: "sap",
    title: "SAP leads, manufacturing, Colombo",
    when: "today",
    turns: play([
      "SAP leads who’ve done a manufacturing rollout — Colombo, 8+ years",
      "Only people who actually led the rollout, notice one month or less",
    ]),
  },
  {
    id: "cima",
    title: "Finance managers with CIMA",
    when: "today",
    turns: play(["Finance managers with CIMA"]),
  },
  {
    id: "look",
    title: "Lookalikes: Nadeeka Dilshan",
    when: "earlier",
    turns: play(["Find people like Nadeeka Dilshan"]),
  },
  {
    id: "plant",
    title: "Plant engineers near Horana",
    when: "earlier",
    turns: play(["Plant engineers near Horana"]),
  },
  {
    id: "ref",
    title: "Referral: “do we have Ruwan Silva?”",
    when: "earlier",
    turns: play(["Do we have Ruwan Silva?"]),
  },
];

const AVATAR = [
  "bg-info-soft text-info",
  "bg-violet-soft text-violet",
  "bg-warn-soft text-warn",
  "bg-brand-soft text-brand",
];
const initials = (n: string) =>
  n
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
const LOOK_MS = 900;

export default function DatabaseView() {
  const gate = useWorkdayGate();
  const [threads, setThreads] = useState(START);
  const [openId, setOpenId] = useState("sap");
  const [mode, setMode] = useState<"people" | "cvs">("people");
  const [thinking, setThinking] = useState(false);
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [picked, setPicked] = useState<Person | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const thread = threads.find((t) => t.id === openId) ?? null;
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // A chat opened from the list arrives by the one switch.
  useGSAP(
    () => {
      if (scroller.current) swapIn(scroller.current);
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    },
    { dependencies: [openId] },
  );

  // AURA's mark breathes while it looks (never spins).
  const orb = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!thinking || !orb.current || !motionOK()) return;
      gsap.to(orb.current.querySelector("[data-glow]"), {
        scale: 1.35,
        opacity: 0.15,
        duration: 0.9,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
    },
    { dependencies: [thinking], scope: orb },
  );

  const send = (raw: string) => {
    const t = raw.trim();
    if (!t || thinking) return;
    setText("");
    let id = openId;
    let turns = thread?.turns ?? [];
    // No chat open: this message starts one, named by its first words.
    if (!thread) {
      id = nid();
      turns = [];
      setThreads((all) => [
        { id, title: titleOf(t), when: "today", turns: [] },
        ...all,
      ]);
      setOpenId(id);
    }
    const { chips, last } = contextOf(turns);
    const answer = reply(t, {
      chips,
      last,
      cvsOnly: mode === "cvs",
      locked: gate,
    });
    setThreads((all) =>
      all.map((x) =>
        x.id === id
          ? { ...x, turns: [...x.turns, { id: nid(), from: "me", text: t }] }
          : x,
      ),
    );
    setThinking(true);
    // ponytail: a stand-in wait; with the backend this is the database search.
    timer.current = setTimeout(() => {
      setThreads((all) =>
        all.map((x) =>
          x.id === id
            ? {
                ...x,
                turns: [...x.turns, { id: nid(), from: "aura", ...answer }],
              }
            : x,
        ),
      );
      setThinking(false);
      // Download: hand each file to the browser.
      for (const f of answer.files ?? []) {
        const a = document.createElement("a");
        a.href = f.url;
        a.download = f.name;
        a.click();
      }
    }, LOOK_MS);
  };

  // Each new turn: the one switch for the words, pin & settle for the people, and
  // the talk scrolls to it.
  const lastLen = useRef(0);
  useGSAP(
    () => {
      const turns = scroller.current?.querySelectorAll("[data-turn]");
      if (!turns || turns.length <= lastLen.current) {
        lastLen.current = turns?.length ?? 0;
        return;
      }
      const fresh = turns[turns.length - 1] as HTMLElement;
      if (lastLen.current > 0) {
        swapIn(fresh);
        const cards = fresh.querySelectorAll("[data-card]");
        if (cards.length && motionOK()) gsap.from(cards, PIN_IN);
      }
      lastLen.current = turns.length;
      scroller.current?.scrollTo({
        top: scroller.current.scrollHeight,
        behavior: "smooth",
      });
    },
    { dependencies: [thread?.turns.length, thinking], revertOnUpdate: false },
  );

  const newSearch = () => {
    setOpenId("");
    setText("");
    setShowHistory(false);
    requestAnimationFrame(() => box.current?.focus());
  };
  const lastAura = thread
    ? [...thread.turns].reverse().find((t) => t.from === "aura")?.id
    : undefined;

  return (
    <div className="relative flex min-h-0 flex-1 max-md:flex-col">
      <Notch label="Database" />

      {/* The chats */}
      <aside className="flex w-[23.4%] min-w-[max(15rem,200px)] shrink-0 flex-col gap-[max(0.6rem,6px)] border-r border-border px-[max(1.75rem,14px)] pb-6 pt-[max(4.7rem,52px)] max-md:w-auto max-md:border-b max-md:border-r-0 max-md:pb-3 max-md:pt-14">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={newSearch}
            className="flex h-[max(3.1rem,40px)] items-center gap-2 rounded-full bg-brand px-[max(1rem,12px)] text-body font-medium text-white hover:bg-brand-strong"
          >
            <PlusIcon />
            New search
          </button>
          <div
            role="radiogroup"
            aria-label="What to search"
            className="flex items-center gap-[max(0.7rem,6px)] rounded-full border border-border bg-surface px-[max(0.75rem,8px)] py-1.5"
          >
            {(
              [
                ["people", "Search people", <PeopleIcon key="p" />],
                ["cvs", "Search inside CVs", <DocsIcon key="d" />],
              ] as const
            ).map(([k, label, icon]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={mode === k}
                aria-label={label}
                title={label}
                onClick={() => setMode(k)}
                className={
                  "flex h-[max(1.9rem,26px)] w-[max(2.8rem,38px)] items-center justify-center rounded-full transition-colors " +
                  (mode === k
                    ? "bg-ink/70 text-white"
                    : "text-ink-3 hover:text-ink")
                }
              >
                {icon}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className="ml-auto text-small text-brand md:hidden"
          >
            {showHistory ? "Hide chats" : "Chats"}
          </button>
        </div>
        <nav
          aria-label="Chats"
          className={
            "mt-[max(1.6rem,12px)] flex flex-col gap-1 overflow-y-auto " +
            (showHistory ? "" : "max-md:hidden")
          }
        >
          {(["today", "earlier"] as const).map((when) => (
            <div key={when} className="mb-2 flex flex-col gap-1">
              <p className="mb-1 text-caption font-medium uppercase text-ink-3">
                {when}
              </p>
              {threads
                .filter((t) => t.when === when)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setOpenId(t.id);
                      setShowHistory(false);
                    }}
                    aria-current={openId === t.id ? "true" : undefined}
                    className={
                      "truncate rounded-md px-[max(0.9rem,10px)] py-[max(0.6rem,7px)] text-left text-small transition-colors " +
                      (openId === t.id
                        ? "bg-surface-2 text-ink"
                        : "text-ink-2 hover:bg-surface-2/60 hover:text-ink")
                    }
                  >
                    {t.title}
                  </button>
                ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* The talk */}
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[max(7.5rem,60px)] bg-gradient-to-b from-surface to-transparent"
        />
        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-y-auto px-[max(1.5rem,12px)] pb-6 pt-[max(4.6rem,40px)]"
        >
          <div className="mx-auto flex max-w-[62.5rem] flex-col gap-[max(2.1rem,18px)]">
            {!thread ? (
              <Welcome mode={mode} onTry={send} />
            ) : (
              thread.turns.map((t) =>
                t.from === "me" ? (
                  <div key={t.id} data-turn className="flex justify-end">
                    <p className="max-w-[80%] whitespace-pre-line rounded-[max(1.4rem,16px)] rounded-br-[6px] bg-surface-2 px-[max(1.25rem,14px)] py-[max(0.75rem,9px)] text-body text-ink">
                      {t.text}
                    </p>
                  </div>
                ) : (
                  <Answer
                    key={t.id}
                    t={t}
                    latest={t.id === lastAura}
                    open={expanded.includes(t.id)}
                    picked={picked?.id}
                    onAll={() =>
                      setExpanded((e) =>
                        e.includes(t.id)
                          ? e.filter((x) => x !== t.id)
                          : [...e, t.id],
                      )
                    }
                    onPick={setPicked}
                    onSend={send}
                    busy={thinking}
                  />
                ),
              )
            )}
            {thinking && (
              <div
                ref={orb}
                className="flex items-center gap-[max(0.9rem,10px)]"
                role="status"
              >
                <Orb breathing />
                <p className="text-body text-ink-3">
                  {mode === "people"
                    ? "Looking through the people we hold…"
                    : "Reading inside the CVs…"}
                </p>
              </div>
            )}
          </div>
        </div>

        <Composer
          value={text}
          onChange={setText}
          onSend={() => send(text)}
          busy={thinking}
          box={box}
          mode={mode}
          onFile={(name) => send(`Find people for this JD: ${name}`)}
        />
      </section>

      {picked && (
        <CvPreview
          name={picked.name}
          title={`${picked.title} · ${picked.company}`}
          src={picked.cv}
          onClose={() => setPicked(null)}
        />
      )}
    </div>
  );
}

/** A new chat: what AURA can do, as things to tap - no manual to read. */
function Welcome({
  mode,
  onTry,
}: {
  mode: "people" | "cvs";
  onTry: (t: string) => void;
}) {
  const tries =
    mode === "people"
      ? [
          "SAP leads in Colombo, 8+ years",
          "Do we have Ruwan Silva and Priya Nair?",
          "Find people like Kasun Perera",
          "(SAP OR ERP) AND Colombo NOT Accenture",
        ]
      : ["CIMA finance managers", '"S/4HANA" AND manufacturing'];
  return (
    <div className="flex flex-col items-center gap-3 pt-[10vh] text-center">
      <Image
        src="/aura-mark.png"
        alt=""
        width={48}
        height={48}
        className="size-[max(3rem,40px)] rounded-full"
      />
      <p className="text-h3 text-ink">Who are you looking for?</p>
      <p className="max-w-[36rem] text-small text-ink-3">
        Ask in plain words, paste a Boolean or a JD, or a list of names to
        check. Then keep talking to narrow it down.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {tries.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTry(t)}
            className="rounded-full border border-border px-3.5 py-1.5 text-small text-ink-2 hover:border-border-strong hover:bg-surface-2 hover:text-ink"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One answer: the line, the filters (x takes one off), the Boolean as run, the
 *  people or the names checked, and the one-tap next steps (on the latest only). */
function Answer({
  t,
  latest,
  open,
  picked,
  onAll,
  onPick,
  onSend,
  busy,
}: {
  t: Extract<Turn, { from: "aura" }>;
  latest: boolean;
  open: boolean;
  picked?: string;
  onAll: () => void;
  onPick: (p: Person) => void;
  onSend: (text: string) => void;
  busy: boolean;
}) {
  return (
    <div data-turn className="flex flex-col gap-[max(0.55rem,6px)]">
      <div className="flex items-center gap-[max(0.9rem,10px)]">
        <Orb />
        <p
          className={
            "text-h3 font-medium " + (t.warn ? "text-ink-2" : "text-ink")
          }
        >
          {t.text}
        </p>
      </div>
      <div className="flex flex-col gap-[max(0.55rem,6px)] pl-[max(3.4rem,46px)] max-md:pl-0">
        {t.boolean && (
          <code className="self-start rounded-sm bg-surface-2 px-2.5 py-1 font-mono text-mono text-ink-2">
            {t.boolean}
          </code>
        )}
        {t.chips && t.chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {t.chips.map((c) => (
              <span
                key={c.label}
                className={
                  "group flex items-center gap-1 rounded-full py-1 pl-3 text-small " +
                  (latest ? "pr-1.5 " : "pr-3 ") +
                  (c.added
                    ? "bg-violet-soft text-violet"
                    : "bg-surface-2 text-ink-2")
                }
              >
                {c.added ? "+ " : ""}
                {c.label}
                {latest && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSend(`Remove ${c.label}`)}
                    aria-label={`Remove ${c.label}`}
                    title={`Remove ${c.label}`}
                    className="flex size-[1.15rem] items-center justify-center rounded-full opacity-50 hover:bg-surface hover:opacity-100"
                  >
                    <XIcon />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {t.refs && (
          <ul className="flex max-w-[40rem] flex-col divide-y divide-border rounded-md border border-border">
            {t.refs.map((r) => (
              <li
                key={r.asked}
                className="flex items-center gap-3 px-3.5 py-2.5 text-small"
              >
                <span
                  className={
                    "flex size-5 shrink-0 items-center justify-center rounded-full " +
                    (r.found
                      ? "bg-brand text-white"
                      : "bg-surface-3 text-ink-3")
                  }
                >
                  {r.found ? <TickIcon /> : <XIcon />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{r.asked}</span>
                  <span className="text-ink-3">
                    {" "}
                    ·{" "}
                    {r.found
                      ? `${r.found.title} · ${r.found.company} · ${r.found.city}`
                      : "not in our database"}
                  </span>
                </span>
                {r.found && (
                  <button
                    type="button"
                    onClick={() => onPick(r.found!)}
                    className="shrink-0 font-medium text-brand hover:underline"
                  >
                    Open CV
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {t.people && t.people.length > 0 && (
          <Results
            people={t.people}
            open={open}
            picked={picked}
            onAll={onAll}
            onPick={onPick}
          />
        )}
        {latest && t.actions && t.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {t.actions.map((a) => (
              <button
                key={a.label}
                type="button"
                disabled={busy}
                onClick={() => onSend(a.prompt)}
                className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-small text-ink-2 transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The closest four, then "see all" opens every match under them. Each card says
 *  why the person came up and how strong the fit is; a click opens the CV. */
function Results({
  people,
  open,
  picked,
  onAll,
  onPick,
}: {
  people: Person[];
  open: boolean;
  picked?: string;
  onAll: () => void;
  onPick: (p: Person) => void;
}) {
  const shown = open ? people : people.slice(0, 4);
  return (
    <div
      className={
        open
          ? "grid grid-cols-[repeat(auto-fill,minmax(max(12.3rem,160px),1fr))] gap-3"
          : "flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]"
      }
    >
      {shown.map((p, i) => (
        <button
          key={p.id}
          type="button"
          data-card
          onClick={() => onPick(p)}
          title={p.cv ? "Open the CV" : "No CV file on record"}
          className={
            "flex shrink-0 flex-col gap-[max(0.5rem,5px)] rounded-[max(1.4rem,16px)] border-[1.5px] p-[max(1rem,12px)] text-left transition-colors " +
            (open ? "w-auto " : "w-[max(12.3rem,160px)] ") +
            (picked === p.id
              ? "border-ink bg-surface"
              : "border-transparent bg-canvas hover:border-border-strong")
          }
        >
          <span className="flex items-center justify-between">
            <span
              className={
                "flex size-[max(2.5rem,32px)] items-center justify-center rounded-full text-small font-medium " +
                AVATAR[i % 4]
              }
            >
              {initials(p.name)}
            </span>
            <span
              title={fitOf(p.score)}
              className={
                "rounded-[10px] px-2 py-0.5 text-small " +
                (p.score >= 80
                  ? "bg-brand-soft text-brand"
                  : "bg-surface text-ink-2")
              }
            >
              {p.score}
            </span>
          </span>
          <span className="truncate text-body font-medium text-ink">
            {p.name}
          </span>
          <span className="line-clamp-2 text-small text-ink-3">
            {p.title} · {p.company}
          </span>
          <span className="line-clamp-2 border-t border-border pt-[max(0.45rem,5px)] text-caption text-ink-2">
            <b className="font-medium">{fitOf(p.score)}</b> · {reasonOf(p)}
          </span>
        </button>
      ))}
      {people.length > 4 && (
        <button
          type="button"
          onClick={onAll}
          aria-expanded={open}
          className={
            "flex shrink-0 flex-col items-center justify-center gap-1 rounded-[max(1.4rem,16px)] border border-border px-6 py-4 text-ink hover:bg-surface-2 " +
            (open ? "" : "w-[max(6.9rem,90px)]")
          }
        >
          {open ? (
            <span className="text-small text-ink-2">Show fewer</span>
          ) : (
            <>
              <span className="text-h3 font-medium">{people.length}</span>
              <span className="text-caption font-medium text-ink-3">
                see all
              </span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

/** AURA's mark; breathing while it looks. */
function Orb({ breathing = false }: { breathing?: boolean }) {
  return (
    <span className="relative flex size-[max(2.5rem,32px)] shrink-0">
      {breathing && (
        <span
          data-glow
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,var(--color-aura-1),var(--color-aura-2),var(--color-aura-3),var(--color-aura-4),var(--color-aura-1))] opacity-40"
        />
      )}
      <Image
        src="/aura-mark.png"
        alt="AURA"
        width={40}
        height={40}
        className="relative size-full rounded-full"
      />
    </span>
  );
}

/** "Refine — …": attach a JD, speak, or type; Enter sends, Shift+Enter is a new line. */
function Composer({
  value,
  onChange,
  onSend,
  busy,
  box,
  mode,
  onFile,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  box: React.RefObject<HTMLTextAreaElement | null>;
  mode: "people" | "cvs";
  onFile: (name: string) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [listening, setListening] = useState(false);
  type Rec = {
    lang: string;
    interimResults: boolean;
    onresult: (e: {
      results: ArrayLike<ArrayLike<{ transcript: string }>>;
    }) => void;
    onend: () => void;
    start: () => void;
    stop: () => void;
  };
  const rec = useRef<Rec | null>(null);
  const [speech, setSpeech] = useState(false);
  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => Rec;
      webkitSpeechRecognition?: new () => Rec;
    };
    const R = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!R) return;
    const r = new R();
    r.lang = "en-GB";
    r.interimResults = false;
    r.onresult = (e) =>
      onChange(
        (box.current?.value ? box.current.value + " " : "") +
          e.results[0][0].transcript,
      );
    r.onend = () => setListening(false);
    rec.current = r;
    queueMicrotask(() => setSpeech(true));
  }, [onChange, box]);
  const send = useRef<HTMLButtonElement>(null);
  const press = () => {
    if (!value.trim() || busy) return;
    if (send.current && motionOK())
      gsap.fromTo(
        send.current,
        { scale: 0.88 },
        { scale: 1, duration: DUR.base, ease: EASE.pop },
      );
    onSend();
  };
  return (
    <div className="px-[max(1.5rem,12px)] pb-[max(2.4rem,14px)]">
      <div className="mx-auto flex max-w-[62.5rem] items-end gap-[max(0.9rem,8px)] rounded-[max(2.1rem,24px)] bg-surface p-2.5 shadow-[0_18px_100px_-8px_rgb(15_23_31/0.1)] ring-1 ring-border/60">
        <button
          type="button"
          onClick={() => file.current?.click()}
          aria-label="Attach a JD"
          title="Attach a JD"
          className="flex size-[max(2.75rem,36px)] shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink"
        >
          <PlusIcon />
        </button>
        <input
          ref={file}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f.name);
            e.target.value = "";
          }}
        />
        <textarea
          ref={box}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              press();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder={
            mode === "people"
              ? "Refine — “only open to move”, “add Kandy”, or paste a JD"
              : "Words to find inside the CVs"
          }
          aria-label="Ask AURA"
          className="max-h-32 min-w-0 flex-1 resize-none self-center bg-transparent py-2 text-body text-ink outline-none placeholder:text-ink-3 [field-sizing:content]"
        />
        <button
          type="button"
          disabled={!speech}
          onClick={() => {
            if (!rec.current) return;
            if (listening) rec.current.stop();
            else {
              rec.current.start();
              setListening(true);
            }
          }}
          aria-pressed={listening}
          aria-label={
            speech
              ? listening
                ? "Stop listening"
                : "Speak"
              : "Speaking is not available in this browser"
          }
          title={
            speech
              ? listening
                ? "Stop listening"
                : "Speak"
              : "Speaking is not available in this browser"
          }
          className={
            "flex size-[max(2.75rem,36px)] shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 " +
            (listening
              ? "bg-danger-soft text-danger"
              : "text-ink-3 hover:text-ink")
          }
        >
          <MicIcon />
        </button>
        <button
          ref={send}
          type="button"
          onClick={press}
          disabled={!value.trim() || busy}
          aria-label="Send"
          className="flex size-[max(2.75rem,36px)] shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-strong disabled:opacity-40"
        >
          <ArrowUp />
        </button>
      </div>
    </div>
  );
}

const ico = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;
const PlusIcon = () => (
  <svg {...ico} className="size-[max(1.1rem,15px)]">
    <path d="M5 12h14M12 5v14" />
  </svg>
);
const ArrowUp = () => (
  <svg {...ico} className="size-[max(1.1rem,15px)]">
    <path d="M5 12l7-7 7 7M12 19V5" />
  </svg>
);
const MicIcon = () => (
  <svg {...ico} className="size-[max(1.25rem,16px)]">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
  </svg>
);
// The owner's icons (bi people-fill, famicons documents), drawn in the text colour.
const PeopleIcon = (): ReactNode => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    className="size-[max(1rem,14px)]"
    aria-hidden="true"
  >
    <path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7Zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5.784 6A2.24 2.24 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.3 6.3 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1h4.216ZM4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
  </svg>
);
const DocsIcon = (): ReactNode => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    className="size-[max(1rem,14px)]"
    aria-hidden="true"
  >
    <path d="M9.32 7.75a.13.13 0 0 0 .09-.21L6.96 5.05a.13.13 0 0 0-.21.08v2.24c0 .21.17.38.38.38h2.19Z" />
    <path d="M6.16 8.34a1.37 1.37 0 0 1-.41-.97V4.5H3.5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2H8a2 2 0 0 0 2-2V8.75H7.13a1.37 1.37 0 0 1-.97-.41Zm5.47-4.59h2.2a.13.13 0 0 0 .09-.21l-2.45-2.49a.13.13 0 0 0-.22.08v2.25c0 .2.17.37.38.37Z" />
    <path d="M11.63 4.75a1.38 1.38 0 0 1-1.38-1.38V.5H6.88A1.88 1.88 0 0 0 5 2.38V3.5h1.32c.33 0 .65.14.9.38l3.41 3.47c.24.24.37.57.37.9V12.5h1.66c1.02 0 1.84-.84 1.84-1.88V4.75h-2.87Z" />
  </svg>
);
const XIcon = () => (
  <svg {...ico} strokeWidth={2.4} className="size-3">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
const TickIcon = () => (
  <svg {...ico} strokeWidth={3} className="size-3">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
