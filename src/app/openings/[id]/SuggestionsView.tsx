"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSwap } from "@/lib/gsap";
import { useWorkdayGate } from "@/lib/workday";
import { BackButton } from "./PipelineBoard";
import Toast from "./Toast";
import WorkdayBlocked from "./WorkdayBlocked";
import FindCvButton from "./FindCvButton";
import { useOpeningView } from "./view";

// Headhunting > Suggestions: real LinkedIn people to approach, in rounds (owner's
// design "Suggestions", 13 Nov 2026). The rules are the old TA System's page:
// - three rounds an opening (MAX_ROUNDS); a round with no decisions runs the same
//   search again, so Refine waits for at least one Select / Not this one;
// - Select adds the profile to Excel Tables; Not this one steers the next round;
// - a person another TA kept is theirs ("Leave this one alone");
// - Find CV looks in our own database before the person is added again;
// - what the TA tells AURA steers the next round; Refine runs it.
// Sample data until the backend.

const MAX_ROUNDS = 3;
/** How long the sample round takes; the real one is a few minutes. */
const RUN_MS = 2500;
/** How many new people the sample round finds; 0 shows the "found nobody" reason box. */
const NEXT_ROUND_FINDS: number = 2;
/** People ticked under Benchmark on Research - they steer the search. Sample. */
const BENCHMARKED = ["Ruwan Gunawardena"];
/** Cards shown before "Show more"; also when search and sort appear. */
const PAGE = 6;

type Fit = "strong" | "good" | "look";
const FIT: Record<Fit, { label: string; tone: string }> = {
  strong: { label: "Strong", tone: "bg-brand-soft text-brand" },
  good: { label: "Good", tone: "bg-surface-2 text-ink-2" },
  look: { label: "Worth a look", tone: "bg-surface-2 text-ink-3" },
};
/** Strongest first when sorting by strength of match. */
const RANK: Record<Fit, number> = { strong: 0, good: 1, look: 2 };
type Status = "new" | "kept" | "dropped";
type Person = {
  id: string;
  name: string;
  title: string;
  company: string;
  city: string;
  fit: Fit;
  why: string[];
  confirm?: string;
  status: Status;
  keptBy?: string;
  /** People in our own database who may be this person (Find CV). */
  matches?: { name: string; detail: string }[];
};

const p = (
  id: string,
  name: string,
  title: string,
  company: string,
  city: string,
  fit: Fit,
  why: string[],
  confirm?: string,
  status: Status = "new",
): Person => ({
  id,
  name,
  title,
  company,
  city,
  fit,
  why,
  confirm,
  status,
});

const START: Person[] = [
  {
    ...p(
      "s1",
      "Ruwan Gunawardena",
      "Head of SAP",
      "Lanka Tiles",
      "Horana",
      "strong",
      ["Ran S/4 move at a tile maker"],
      "Senior — may expect more",
    ),
    matches: [
      {
        name: "Ruwan Gunawardena",
        detail: "Head of SAP · Lanka Tiles · CV from 2024",
      },
    ],
  },
  p(
    "s2",
    "Shalini Perera",
    "ERP Programme Manager",
    "Rocell",
    "Colombo",
    "strong",
    ["Manufacturing ERP, 11 yrs"],
  ),
  p(
    "s3",
    "Dilan Fonseka",
    "SAP Delivery Manager",
    "Dipped Products",
    "Kelaniya",
    "good",
    ["Plant rollouts across 3 sites"],
    "No S/4 yet",
  ),
  p(
    "s4",
    "Hasini Wickrama",
    "Transformation Lead",
    "Royal Ceramics",
    "Colombo",
    "good",
    ["Led finance stream of S/4"],
  ),
  p(
    "s5",
    "Arjuna Silva",
    "Digital Transformation Lead",
    "Ansell Lanka",
    "Biyagama",
    "good",
    ["Ops + IT blend"],
    "Hybrid unclear",
  ),
  p(
    "s6",
    "Sameera Dias",
    "SAP Lead",
    "Hayleys Fibre",
    "Colombo",
    "look",
    ["FI/CO depth"],
    "Smaller programme",
  ),
  ...[
    ["Kavindu Jayasuriya", "SAP Programme Lead", "Lanka Walltiles"],
    ["Nadeesha Fernando", "ERP Lead", "Macksons"],
    ["Tharindu Perera", "S/4HANA Architect", "Swisstek"],
    ["Ishara Gamage", "Head of IT", "Lanka Tiles"],
    ["Malith Rajapaksa", "SAP Manager", "Rocell"],
    ["Dinithi Senanayake", "ERP Programme Manager", "Royal Ceramics"],
    ["Chamara Silva", "Digital Lead", "Dipped Products"],
    ["Ruvini Abeysekera", "SAP Lead", "Ansell Lanka"],
    ["Pradeep Kumara", "IT Programme Manager", "Macksons"],
  ].map(([n, t, c], i) =>
    p(
      `k${i}`,
      n,
      t,
      c,
      "Colombo",
      "good",
      ["Picked in an earlier round"],
      undefined,
      "kept",
    ),
  ),
  ...[
    ["Nuwan Bandara", "SAP Consultant", "Hayleys"],
    ["Asanka Perera", "IT Manager", "Lanka Walltiles"],
    ["Gayan Silva", "ERP Analyst", "Rocell"],
    ["Sachini Herath", "SAP Lead", "Swisstek"],
  ].map(([n, t, c], i) =>
    p(
      `d${i}`,
      n,
      t,
      c,
      "Colombo",
      "look",
      ["Turned down in an earlier round"],
      undefined,
      "dropped",
    ),
  ),
];
// One person on the list another TA already kept: theirs to work.
START[5] = { ...START[5], keptBy: "Hasini" };

type Msg = { from: "aura" | "me"; text: string };
const FIRST: Msg[] = [
  {
    from: "aura",
    text: "You picked 2 from tile makers. Shall I look harder at Lanka Walltiles, Macksons and Swisstek?",
  },
  { from: "me", text: "Yes, and skip anyone under 8 years" },
  { from: "aura", text: "Got it. Press Refine to run round 3 with that." },
];

const TABS: { key: Status; label: string }[] = [
  { key: "new", label: "To review" },
  { key: "kept", label: "Selected" },
  { key: "dropped", label: "Not selected" },
];

const PILL =
  "flex h-[max(2.5rem,32px)] items-center gap-1.5 rounded-full px-[max(1rem,12px)] text-small font-medium transition-colors";

export default function SuggestionsView() {
  const { go } = useOpeningView();
  const gate = useWorkdayGate();
  const [people, setPeople] = useState(START);
  const [tab, setTab] = useState<Status>("new");
  const [round, setRound] = useState(2);
  const [running, setRunning] = useState(false);
  // Decisions made since the last round: a round with none runs the same search again.
  const [judged, setJudged] = useState(2); // sample: two picked this round, as AURA says
  const [chat, setChat] = useState<Msg[]>(FIRST);
  const [notice, setNotice] = useState<{
    bold?: string;
    rest: string;
    warn?: boolean;
    n: number;
  } | null>(null);
  const say = (rest: string, bold?: string, warn?: boolean) =>
    setNotice((n) => ({ bold, rest, warn, n: (n?.n ?? 0) + 1 }));
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const grid = useRef<HTMLDivElement>(null);
  useSwap(grid, tab);

  const count = (s: Status) => people.filter((x) => x.status === s).length;
  const left = MAX_ROUNDS - round;

  // Search, order and a page at a time - only once a tab holds more than a page
  // of cards, so the design's six-card screen stays as drawn.
  const [q, setQ] = useState("");
  const [order, setOrder] = useState<"strength" | "recent">("strength");
  const [more, setMore] = useState(0);
  const inTab = people.filter((x) => x.status === tab);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const matching = inTab
    .filter((x) =>
      words.every((w) =>
        `${x.name} ${x.title} ${x.company} ${x.city}`.toLowerCase().includes(w),
      ),
    )
    .map((x) => ({ x, at: people.indexOf(x) }))
    .sort((a, b) =>
      order === "strength"
        ? RANK[a.x.fit] - RANK[b.x.fit] || b.at - a.at
        : b.at - a.at,
    )
    .map((m) => m.x);
  const shown = matching.slice(0, PAGE + more);
  const tools = inTab.length > PAGE;
  const pickTab = (t: Status) => {
    setTab(t);
    setQ("");
    setMore(0);
  };

  // A round that found nobody needs a reason on the workday (the old system's
  // "Why this search found no profiles" check).
  const [emptyRound, setEmptyRound] = useState<number | null>(null);
  const [why, setWhy] = useState("");

  const decide = (x: Person, to: Status) => {
    if (gate) return;
    setPeople((all) =>
      all.map((y) => (y.id === x.id ? { ...y, status: to } : y)),
    );
    setJudged((n) => n + 1);
    if (to === "kept") say(" selected - added to Excel Tables", x.name);
    else if (to === "dropped")
      say(" not selected - the next round steers away from them", x.name);
    else say(" is back in To review", x.name);
  };

  const refineWhy = gate
    ? "Start your workday first."
    : left <= 0
      ? "Work the list, or widen the brief and start again."
      : judged === 0
        ? "Select or mark a few as not this one first - a round with no decisions runs the same search again."
        : "";
  const refine = () => {
    if (refineWhy || running) return;
    setRunning(true);
    timer.current = setTimeout(() => {
      const next = round + 1;
      setRound(next);
      setJudged(0);
      setRunning(false);
      if (NEXT_ROUND_FINDS === 0) {
        setEmptyRound(next);
        setChat((c) => [
          ...c,
          {
            from: "aura",
            text: `Round ${next} found nobody new. Say why below - it is one of today's checks.`,
          },
        ]);
        say(`Round ${next} found nobody new`, undefined, true);
        return;
      }
      setPeople((all) => [
        ...all,
        p(
          `r${next}a`,
          "Kavisha Mendis",
          "SAP Programme Manager",
          "Lanka Walltiles",
          "Colombo",
          "strong",
          ["S/4 at a tile maker, 9 yrs"],
        ),
        p(
          `r${next}b`,
          "Roshan de Silva",
          "ERP Lead",
          "Macksons",
          "Colombo",
          "good",
          ["Plant-floor SAP, 10 yrs"],
          "Notice period unknown",
        ),
      ]);
      pickTab("new");
      setChat((c) => [
        ...c,
        {
          from: "aura",
          text: `Round ${next} found 2 new people. Profiles you already saw do not come back.`,
        },
      ]);
      say(`Round ${next} done - 2 new people to review`);
    }, RUN_MS);
  };

  const send = (text: string) => {
    setChat((c) => [
      ...c,
      { from: "me", text },
      {
        from: "aura",
        text:
          left > 0
            ? `Got it. Press Refine to run round ${round + 1} with that.`
            : `Noted. All ${MAX_ROUNDS} rounds are used on this job, so it will guide nothing more here.`,
      },
    ]);
  };

  return (
    <div className="flex min-h-0 flex-1 gap-[max(1.5rem,14px)] overflow-y-auto px-[max(2.3rem,14px)] pb-[max(2rem,16px)] pt-[max(2rem,48px)] max-lg:flex-col max-md:pt-14 lg:overflow-hidden">
      {/* The people */}
      <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
        <div className="flex flex-wrap items-center gap-x-[max(1.25rem,10px)] gap-y-3">
          <BackButton />
          <div
            role="tablist"
            aria-label="Suggestions"
            className="flex flex-wrap gap-1"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => pickTab(t.key)}
                className={
                  PILL +
                  " font-normal " +
                  (tab === t.key
                    ? "bg-ink text-white"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink")
                }
              >
                {t.label} · {count(t.key)}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-[max(1rem,10px)] max-md:ml-0">
            {/* People are added by hand in Excel Tables, as in the old system. */}
            <button
              type="button"
              onClick={() => go("hh-tables")}
              className="text-small font-medium text-info hover:underline"
            >
              + Add a candidate
            </button>
            <span
              className="flex items-center gap-2 text-small text-ink-2"
              aria-label={`Round ${round} of ${MAX_ROUNDS}`}
            >
              <span className="flex gap-1" aria-hidden="true">
                {Array.from({ length: MAX_ROUNDS }, (_, i) => (
                  <span
                    key={i}
                    className={
                      "size-2 rounded-full " +
                      (i < round ? "bg-brand" : "bg-border-strong")
                    }
                  />
                ))}
              </span>
              Round {round} of {MAX_ROUNDS}
            </span>
          </div>
        </div>
        {gate && <WorkdayBlocked what="select suggestions" className="mt-4" />}

        {/* Who the search is steered by: the people ticked under Benchmark on Research. */}
        {BENCHMARKED.length > 0 && (
          <p className="mt-3 text-caption text-ink-3">
            Searching against {BENCHMARKED.length} benchmarked{" "}
            {BENCHMARKED.length === 1 ? "profile" : "profiles"} -{" "}
            <button
              type="button"
              onClick={() => go("hh-research")}
              className="text-brand hover:underline"
            >
              {BENCHMARKED.join(", ")}
            </button>
          </p>
        )}

        {/* A round that found nobody: the reason the workday asks for. */}
        {emptyRound !== null && (
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-md border border-warn/30 bg-warn-soft px-[max(1.2rem,12px)] py-[max(0.9rem,10px)]">
            <label className="min-w-[14rem] flex-1 text-small text-ink">
              <b className="font-medium">Round {emptyRound} found nobody.</b>{" "}
              Why this search found no profiles
              <input
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || !why.trim()) return;
                  setEmptyRound(null);
                  say("Reason saved for today's checks");
                }}
                maxLength={1000}
                placeholder="For example: very senior role, few people public on LinkedIn"
                className="mt-1.5 w-full rounded-sm border border-border-strong bg-surface px-2.5 py-1.5 text-small outline-none focus:border-brand"
              />
            </label>
            <button
              type="button"
              disabled={!why.trim()}
              onClick={() => {
                setEmptyRound(null);
                say("Reason saved for today's checks");
              }}
              className="rounded-full bg-brand px-4 py-2 text-small font-medium text-white hover:bg-brand-strong disabled:opacity-40"
            >
              Save the reason
            </button>
          </div>
        )}

        {tools && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setMore(0);
              }}
              placeholder="Search name, role or company"
              aria-label="Search these people"
              className="h-[max(2.3rem,30px)] w-[min(18rem,100%)] rounded-full border border-border bg-surface px-3.5 text-small outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={() =>
                setOrder((o) => (o === "strength" ? "recent" : "strength"))
              }
              className="flex h-[max(2.3rem,30px)] items-center rounded-full border border-border px-3.5 text-small text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              Sort by:{" "}
              {order === "strength" ? "Strength of match" : "Most recent"}
            </button>
            <span className="text-caption text-ink-3">
              {matching.length} {matching.length === 1 ? "person" : "people"}
            </span>
          </div>
        )}

        <div
          ref={grid}
          className="mt-[max(1.4rem,14px)] lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1"
        >
          {shown.length === 0 ? (
            <p className="mx-auto max-w-[34rem] py-16 text-center text-small text-ink-3">
              {q.trim() && inTab.length > 0
                ? "Nobody here matches that search."
                : tab === "new"
                  ? left > 0
                    ? "Nothing left to review. Tell AURA who to look for, then Refine runs the next round."
                    : `Nothing left to review, and all ${MAX_ROUNDS} rounds are used. Work the Selected list in Excel Tables.`
                  : tab === "kept"
                    ? "Nobody selected yet."
                    : "Nobody turned down yet."}
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,max(23rem,270px)),1fr))] gap-[max(1rem,10px)]">
              {shown.map((x) => (
                <Card
                  key={x.id}
                  x={x}
                  blocked={!!gate}
                  onDecide={decide}
                  onLinked={() =>
                    say(" - their CV is linked from the database", x.name)
                  }
                />
              ))}
            </div>
          )}
          {matching.length > shown.length && (
            <button
              type="button"
              onClick={() => setMore((m) => m + PAGE)}
              className="mx-auto mt-4 flex rounded-full border border-border px-4 py-2 text-small text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              Show {Math.min(PAGE, matching.length - shown.length)} more
            </button>
          )}
        </div>
      </div>

      {/* Guide the next round */}
      <aside className="flex shrink-0 flex-col gap-[max(0.9rem,10px)] rounded-lg bg-canvas px-[max(1.4rem,14px)] py-[max(1.3rem,14px)] lg:w-[max(25rem,300px)] lg:self-stretch">
        <div className="flex items-center gap-2.5">
          <Image
            src="/aura-mark.png"
            alt=""
            width={40}
            height={40}
            className="size-[max(2.5rem,32px)] rounded-full"
          />
          <div>
            <p className="text-body font-medium">Guide the next round</p>
            <p className="text-caption font-medium text-ink-3">
              {left > 0
                ? `${left} round${left === 1 ? "" : "s"} left`
                : "No rounds left"}
            </p>
          </div>
        </div>
        <Thread chat={chat} />
        <button
          type="button"
          onClick={refine}
          disabled={!!refineWhy || running}
          title={refineWhy || undefined}
          className="flex h-[max(3rem,38px)] items-center justify-center rounded-full bg-ink text-small font-medium text-white hover:bg-black disabled:opacity-40"
        >
          {running
            ? `Running round ${round + 1} - a few minutes`
            : left > 0
              ? `Refine — run round ${round + 1}`
              : `All ${MAX_ROUNDS} rounds used`}
        </button>
        {refineWhy && !running && (
          <p className="-mt-1 text-center text-caption text-ink-3">
            {refineWhy}
          </p>
        )}
        <Ask onSend={send} />
      </aside>

      {notice && (
        <Toast
          key={notice.n}
          bold={notice.bold}
          rest={notice.rest}
          warn={notice.warn}
        />
      )}
    </div>
  );
}

/** One suggested person. */
function Card({
  x,
  blocked,
  onDecide,
  onLinked,
}: {
  x: Person;
  blocked: boolean;
  onDecide: (x: Person, to: Status) => void;
  onLinked: () => void;
}) {
  const fit = FIT[x.fit];
  return (
    <article className="flex min-h-[max(15.75rem,200px)] flex-col rounded-lg border border-border bg-surface px-[max(1.4rem,14px)] py-[max(1.25rem,14px)] shadow-card">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 truncate text-h3 font-medium">{x.name}</h3>
        <a
          href="https://www.linkedin.com/"
          target="_blank"
          rel="noreferrer"
          aria-label={`${x.name} on LinkedIn`}
          className="shrink-0 rounded-xs hover:opacity-80"
        >
          <Image
            src="/li.svg"
            alt=""
            width={18}
            height={18}
            className="size-[max(1.1rem,15px)]"
          />
        </a>
        <span
          className={`ml-auto shrink-0 rounded-full px-[max(0.6rem,7px)] py-0.5 text-caption font-medium ${fit.tone}`}
        >
          {fit.label}
        </span>
      </div>
      <p
        className="mt-1 truncate text-small text-ink-3"
        title={`${x.title} · ${x.company} · ${x.city}`}
      >
        {x.title} · {x.company} · {x.city}
      </p>
      <ul className="mt-[max(0.8rem,8px)] flex flex-col gap-1.5 text-small">
        {x.why.map((w) => (
          <li key={w} className="flex items-start gap-2">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-[0.2em] size-[max(0.9rem,12px)] shrink-0 text-brand"
              aria-hidden="true"
            >
              <path d="m5 12 5 5 9-10" />
            </svg>
            {w}
          </li>
        ))}
        {x.confirm && (
          <li
            className="flex items-start gap-2 text-ink-2"
            title="Confirm this before approaching"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="mt-[0.2em] size-[max(0.9rem,12px)] shrink-0 text-warn"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5v5.5M12 16.5v.5" />
            </svg>
            {x.confirm}
          </li>
        )}
      </ul>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-[max(1rem,10px)]">
        {x.keptBy ? (
          <span className="rounded-full bg-warn-soft px-3 py-1 text-small text-warn">
            Kept by {x.keptBy} - leave this one alone
          </span>
        ) : x.status === "new" ? (
          <>
            <button
              type="button"
              disabled={blocked}
              onClick={() => onDecide(x, "kept")}
              title="Adds this profile to Excel Tables"
              className={
                PILL +
                " bg-brand text-white hover:bg-brand-strong disabled:opacity-40"
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-[max(0.95rem,13px)]"
                aria-hidden="true"
              >
                <path d="m5 12 5 5 9-10" />
              </svg>
              Select
            </button>
            <button
              type="button"
              disabled={blocked}
              onClick={() => onDecide(x, "dropped")}
              className={
                PILL +
                " border border-border-strong font-normal text-ink hover:bg-surface-2 disabled:opacity-40"
              }
            >
              Not this one
            </button>
          </>
        ) : x.status === "kept" ? (
          <span className="rounded-full bg-brand-soft px-3 py-1 text-small text-brand">
            Selected · in Excel Tables
          </span>
        ) : (
          <>
            <span className="text-small text-ink-3">Not selected</span>
            {/* A turned-down person can come back, in case of a wrong click. */}
            <button
              type="button"
              disabled={blocked}
              onClick={() => onDecide(x, "new")}
              className="ml-auto text-small font-medium text-brand hover:underline disabled:opacity-40"
            >
              Back to review
            </button>
          </>
        )}
        {x.status === "new" && !x.keptBy && (
          <FindCvButton
            name={x.name}
            matches={x.matches}
            onLinked={onLinked}
            up
            className="ml-auto"
          />
        )}
      </div>
    </article>
  );
}

/** The talk with AURA; it keeps the newest line in view. */
function Thread({ chat }: { chat: Msg[] }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [chat.length]);
  return (
    <div
      ref={box}
      className="flex min-h-[max(8rem,100px)] flex-1 flex-col gap-[max(0.75rem,8px)] overflow-y-auto"
    >
      {chat.map((m, i) => (
        <p
          key={i}
          className={
            "max-w-[90%] rounded-[max(1.1rem,14px)] px-[max(0.9rem,10px)] py-[max(0.6rem,7px)] text-small " +
            (m.from === "me"
              ? "self-end bg-brand text-white"
              : "self-start bg-surface text-ink")
          }
        >
          {m.text}
        </p>
      ))}
    </div>
  );
}

/** "Tell AURA who to look for…": Enter sends. */
function Ask({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const go = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };
  return (
    <div className="flex items-center gap-2.5 rounded-full bg-surface py-1.5 pl-4 pr-1.5 focus-within:ring-2 focus-within:ring-brand/30">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && go()}
        maxLength={500}
        placeholder="Tell AURA who to look for…"
        aria-label="Tell AURA who to look for"
        className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-3"
      />
      <button
        type="button"
        onClick={go}
        disabled={!text.trim()}
        aria-label="Send"
        className="flex size-[max(2.1rem,30px)] shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-strong disabled:opacity-40"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-1/2"
          aria-hidden="true"
        >
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
      </button>
    </div>
  );
}
