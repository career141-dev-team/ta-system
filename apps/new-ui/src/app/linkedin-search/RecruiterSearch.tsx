"use client";

// LinkedIn Search on the search engine (26 Nov 2026). Shown only when the backend has
// its search key (SearchSwitch.tsx); until then the older search page stays. It looks
// and talks like the Database chat (owner, 26 Nov): chats on the left, the talk with
// AURA, a typing bar with the opening and today's spend above it. A message starts a run
// on the backend and its turn watches it: questions first (free), then the people, each
// with what was checked, and "Add to Excel Table" for the opening.

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { door, useDoorMutation, useDoorQuery, useLive, type DoorOpenings } from "@/lib/backend";
import { useSignedInPerson } from "@/lib/role";
import { useSwap } from "@/lib/gsap";
import { useSpeech } from "@/lib/useSpeech";
import AuraBarGlow, { Glow } from "../AuraBarGlow";
import ListenPulse from "../ListenPulse";
import { SearchSteps } from "../SearchSteps";
import PillMenu from "../openings/[id]/PillMenu";
import { LinkedInIcon } from "../openings/[id]/PipelineBoard";
import { sendLink, useLiveLinks } from "../openings/[id]/excelLive";

type Tick = "yes" | "no" | "unknown";
type Row = {
  linkedinUrl: string | null; name: string; headline: string; currentTitle: string; currentCompany: string;
  city: string | null; country: string | null; totalYears: { text: string; known: boolean };
  areaYears: { text: string; known: boolean } | null; mustHaves: Record<string, Tick>;
  qualificationsInHeadline: string[]; warnings: string[]; hidden: boolean; hiddenReason: string | null; source: string;
};
type Out = {
  status: "questions" | "market_count" | "done" | "cancelled" | "failed" | "found";
  form?: { role: string; mustHaves: string[] };
  check?: { questions: { code: string; question: string; options?: string[] }[]; warnings: string[] };
  marketCount?: number | null;
  rows?: Row[];
  row?: Row | null;
  warnings?: string[];
  usd?: number;
};
type Run = { id: string; kind: string; state: "running" | "done" | "failed" | "cancelled"; stage: string | null; message: string | null; out: string | null };
type Status = { ok: true; on: boolean; spentUsd: number | null; limitUsd: number | null } | { ok: false; message: string };
/** A chat is this browser's list of what was said and the run each message started. */
type Turn = { run: string; said: string };
type Chat = { id: string; title: string; at: number; job: string; turns: Turn[] };
type Go = (args: Record<string, unknown>, said: string) => void;
type Add = (r: Row) => void;

const STAGES = ["Reading your request", "Asking the free questions", "Searching LinkedIn", "Checking and ranking"];
const STAGE_AT: Record<string, number> = { waiting: 2, agent_search: 2, reuse: 3, top_up: 3 };
const WIDEN = [["level", "Level"], ["years", "Years"], ["city", "City"], ["industry", "Industry"], ["titles", "Job titles"]] as const;
const TICKS = [["function", "Role"], ["level", "Level"], ["years", "Years"], ["industry", "Industry"], ["location", "Place"]] as const;
const TRY = ["Quantity Surveyors for building projects in Sri Lanka, 5-8 years", "HR Managers in Colombo, 8+ years", "Finance Managers with CIMA in Sri Lanka, 6-10 years", "Garment Technologists in Sri Lanka, 3-6 years"];
const AVATAR = ["bg-info-soft text-info", "bg-violet-soft text-violet", "bg-warn-soft text-warn", "bg-success-soft text-success"];
const CHIP = "flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-small text-ink-2 transition-colors hover:border-brand hover:text-brand disabled:opacity-40";
const PRIMARY = "flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-small font-medium text-white hover:bg-brand-strong disabled:opacity-40";
const FIELD = "rounded-full border border-border bg-surface px-4 py-2 text-small text-ink outline-none placeholder:text-ink-3 focus:border-brand";
const PILL = "flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-small text-ink";
const ROUND = "flex size-[max(2.75rem,36px)] shrink-0 items-center justify-center rounded-full";
const COLUMN = "ml-[7.7rem] mr-auto max-w-[62.5rem] max-lg:mx-auto";

const ICON = {
  plus: "M5 12h14M12 5v14",
  up: "M5 12l7-7 7 7M12 19V5",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3",
  check: "m5 12 5 5 9-10",
  x: "M6 6l12 12M18 6 6 18",
  more: "m6 9 6 6 6-6",
  widen: "M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4",
  stop: "M7 7h10v10H7z",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  wallet: "M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Zm0 0 12-3v3M16 13.5h2",
};
function Icon({ name, className = "size-[max(1.05rem,14px)]" }: { name: keyof typeof ICON; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={"shrink-0 " + className}>
      <path d={ICON[name]} />
    </svg>
  );
}

const keyOf = (r: Row) => r.linkedinUrl || `${r.name}|${r.currentCompany}`;
const bare = (url: string) => url.toLowerCase().replace(/\/$/, "");
const initials = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

function read(key: string): Chat[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as Chat[];
  } catch {
    return [];
  }
}

export default function RecruiterSearch() {
  const me = useSignedInPerson();
  // A new person on this browser gets their own list of chats.
  return <Search key={me?.email ?? ""} store={`ta-ui:li-chats:${me?.email ?? ""}`} />;
}

function Search({ store }: { store: string }) {
  const live = useLive();
  const status = useDoorQuery(door.liStatus, live ? {} : "skip") as Status | undefined;
  const openings = useDoorQuery(door.openings, live ? {} : "skip") as DoorOpenings | undefined;
  const start = useDoorMutation(door.liStart);
  const [chats, setChats] = useState<Chat[]>(() => read(store));
  const [openId, setOpenId] = useState("");
  const [job, setJob] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("job") ?? ""));
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [finding, setFinding] = useState(false);
  const [person, setPerson] = useState({ url: "", name: "", company: "" });
  const [location, setLocation] = useState("");
  const [said, setSaid] = useState<Record<string, string>>({});
  const [showChats, setShowChats] = useState(false);
  const mic = useSpeech((t) => setText((x) => (x ? x + " " : "") + t));
  const table = useLiveLinks(job || null, live && !!job);
  const locations = table.data?.locations ?? [];
  const inTable = new Set((table.data?.rows ?? []).map((r) => bare(String((r as { linkedinUrl?: string }).linkedinUrl ?? ""))));
  const chat = chats.find((c) => c.id === openId);
  const active = openings?.ok ? openings.openings.filter((o) => o.status === "active") : [];

  useEffect(() => {
    try {
      localStorage.setItem(store, JSON.stringify(chats.slice(0, 20)));
    } catch {}
  }, [chats, store]);

  const scroller = useRef<HTMLDivElement>(null);
  const turns = chat?.turns.length ?? 0;
  // A new message brings its turn to the top, so a long list of people is read from its start.
  useEffect(() => {
    const all = scroller.current?.querySelectorAll<HTMLElement>("[data-turn]");
    all?.[all.length - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openId, turns]);
  useSwap(scroller, openId);

  /** Sends one message: `into` is the chat it follows on from, "" starts a new one. */
  const go = async (args: Record<string, unknown>, words: string, into = openId) => {
    setError("");
    setSending(true);
    const res = (await start({ ...args, ...(job ? { openingId: job } : {}) }).catch(() => null)) as { ok: boolean; message?: string; runId?: string } | null;
    setSending(false);
    if (!res?.ok || !res.runId) return setError(res?.message ?? "Could not start the search. Check your connection and try again.");
    const turn = { run: res.runId, said: words };
    const id = into || res.runId;
    setChats((all) => (into ? all.map((c) => (c.id === into ? { ...c, job, turns: [...c.turns, turn] } : c)) : [{ id, title: words.slice(0, 80), at: Date.now(), job, turns: [turn] }, ...all]));
    setOpenId(id);
    setText("");
    setFinding(false);
  };
  const search = (words: string) => {
    const t = words.trim();
    if (sending || (!t && !job)) return;
    const o = active.find((x) => x.id === job);
    // Each typed message is a new search; the chips under an answer are what follow it on.
    void go({ kind: "search", text: t }, t || `Search for ${o ? `${o.title} · ${o.client}` : "this opening"}`, "");
  };
  const add: Add = async (r) => {
    if (!r.linkedinUrl) return;
    const k = keyOf(r);
    setSaid((s) => ({ ...s, [k]: "Adding…" }));
    const res = await sendLink({ do: "add", openingId: job, url: r.linkedinUrl, name: r.name, ...(location ? { workLocationId: location } : {}) });
    setSaid((s) => ({ ...s, [k]: res.ok ? "In the Excel Table" : res.message }));
    if (res.ok) void table.reload();
  };
  const pickJob = (v: string) => {
    setJob(v);
    setSaid({});
    setLocation("");
  };
  const newSearch = () => {
    setOpenId("");
    setText("");
    setError("");
    setShowChats(false);
  };

  const spend = status?.ok && status.limitUsd !== null ? { spent: status.spentUsd ?? 0, limit: status.limitUsd } : null;

  return (
    <div className="relative flex min-h-0 flex-1 max-md:flex-col">
      <aside className="flex w-[23.4%] min-w-[max(15rem,200px)] shrink-0 flex-col gap-[max(0.6rem,6px)] border-r border-border px-[max(1.75rem,14px)] pb-6 pt-[max(2.25rem,20px)] max-md:w-auto max-md:border-b max-md:border-r-0 max-md:pb-3 max-md:pt-4">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={newSearch} className="flex h-[max(3.1rem,40px)] items-center gap-2 whitespace-nowrap rounded-full bg-brand px-[max(1rem,12px)] text-body font-medium text-white hover:bg-brand-strong">
            <Icon name="plus" />
            New search
          </button>
          <button type="button" onClick={() => setShowChats((v) => !v)} aria-expanded={showChats} className="text-small text-brand md:hidden">
            {showChats ? "Hide chats" : "Chats"}
          </button>
        </div>
        <nav aria-label="Chats" className={"mt-[max(1.6rem,12px)] flex flex-col gap-1 overflow-y-auto " + (showChats ? "max-md:max-h-48" : "max-md:hidden")}>
          {(["Today", "Earlier"] as const).map((when) => {
            // The date is read only when there are chats, never while the page is built.
            const list = chats.filter((c) => (new Date(c.at).toDateString() === new Date().toDateString()) === (when === "Today"));
            return list.length === 0 ? null : (
              <div key={when} className="mb-2 flex flex-col gap-1">
                <p className="mb-1 px-[max(0.9rem,10px)] text-caption font-medium uppercase text-ink-3">{when}</p>
                {list.map((c) => (
                  <div key={c.id} className={"group flex items-center rounded-md " + (openId === c.id ? "bg-surface-2" : "hover:bg-surface-2/60")}>
                    <button
                      type="button"
                      title={c.title}
                      aria-current={openId === c.id || undefined}
                      onClick={() => {
                        setOpenId(c.id);
                        pickJob(c.job);
                        setShowChats(false);
                      }}
                      className={"min-w-0 flex-1 truncate px-[max(0.9rem,10px)] py-[max(0.7rem,8px)] text-left text-body " + (openId === c.id ? "text-ink" : "text-ink-2")}
                    >
                      {c.title}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete "${c.title}"`}
                      title="Delete this chat"
                      onClick={() => {
                        setChats((all) => all.filter((x) => x.id !== c.id));
                        if (openId === c.id) setOpenId("");
                      }}
                      className="mr-1.5 rounded-full p-1.5 text-ink-3 opacity-0 hover:bg-surface hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                    >
                      <Icon name="x" className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      <section className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {!chat && <Glow src="/aurora-start.svg" inset="-31.82% -14.29%" className="top-1/2 h-[27.5rem] w-[61.25rem] max-w-full -translate-y-1/2" />}
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-[max(1.5rem,12px)] pb-6 pt-[max(2.25rem,20px)]">
          {!chat ? (
            <div className="flex flex-col items-center gap-3 pt-[8vh] text-center">
              <Image src="/aura-mark.png" alt="AURA" width={56} height={56} className="size-[max(3.5rem,44px)] rounded-full" />
              <h1 className="text-h2 text-ink">Who do you need on LinkedIn?</h1>
              <p className="max-w-[36rem] text-small text-ink-3">Say it in plain words, paste the job description, or pick an opening below. I ask what is missing first, and that costs nothing.</p>
              <div className="mt-2 flex max-w-[48rem] flex-wrap justify-center gap-2">
                {TRY.map((t) => (
                  <button key={t} type="button" onClick={() => setText(t)} className={CHIP}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={COLUMN + " flex flex-col gap-[max(2.1rem,18px)]"}>
              {chat.turns.map((t, i) => (
                <div key={t.run} data-turn className="flex flex-col gap-[max(1.2rem,12px)]">
                  <div className="flex justify-end">
                    <p className="max-h-48 max-w-[80%] overflow-y-auto whitespace-pre-line rounded-lg rounded-br-xs bg-surface-2 px-[max(1.25rem,14px)] py-[max(0.75rem,9px)] text-body text-ink">{t.said}</p>
                  </div>
                  <Answer id={t.run} latest={i === chat.turns.length - 1 && !sending} go={(args, words) => void go(args, words)} newSearch={newSearch} job={job} add={add} said={said} inTable={inTable} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="relative isolate px-[max(1.5rem,12px)] pb-[max(2.4rem,14px)]">
          <AuraBarGlow className="bottom-[max(1.2rem,8px)]" />
          <div className={COLUMN + " flex flex-col gap-3"}>
            {error && <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-small text-danger">{error}</p>}
            {finding && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const p = Object.fromEntries(Object.entries(person).filter(([, v]) => v.trim()));
                  void go({ kind: "find", person: p }, `Find ${person.url || [person.name, person.company].filter(Boolean).join(" at ")}`, "");
                }}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-surface p-3 shadow-float ring-1 ring-border/60"
              >
                <input autoFocus value={person.url} onChange={(e) => setPerson({ ...person, url: e.target.value })} placeholder="LinkedIn link" aria-label="LinkedIn link" className={FIELD + " min-w-[16rem] flex-1"} />
                <span className="text-small text-ink-3">or</span>
                <input value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} placeholder="Name" aria-label="Name" className={FIELD} />
                <input value={person.company} onChange={(e) => setPerson({ ...person, company: e.target.value })} placeholder="Company" aria-label="Company" className={FIELD} />
                <button disabled={sending || (!person.url.trim() && !(person.name.trim() && person.company.trim()))} className={PRIMARY}>
                  <Icon name="search" />
                  Find
                </button>
              </form>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <PillMenu
                key={`${job}|${active.length}`}
                prefix="Opening:"
                title="Add people to this opening"
                pillClass={PILL}
                mark="tick"
                initial={job}
                onChange={pickJob}
                options={[{ value: "", label: "None", hint: "People cannot be added to a table" }, ...active.map((o) => ({ value: o.id, label: o.title, hint: o.client }))]}
              />
              {locations.length > 1 && (
                <PillMenu
                  key={`${location}|${locations.length}`}
                  prefix="Add to:"
                  title="Work location"
                  pillClass={PILL}
                  mark="tick"
                  initial={location}
                  onChange={setLocation}
                  options={[{ value: "", label: "Pick a location" }, ...locations.map((l) => ({ value: l.id, label: l.name }))]}
                />
              )}
              {spend && (
                <p className={PILL + " ml-auto"} title="What LinkedIn searches have cost the team today">
                  <Icon name="wallet" className="size-4 text-brand" />
                  Today <b className="font-semibold">${spend.spent}</b> of ${spend.limit}
                  <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                    <span className={"block h-full rounded-full " + (spend.spent >= spend.limit ? "bg-danger" : "bg-brand")} style={{ width: `${Math.min(100, (spend.spent / (spend.limit || 1)) * 100)}%` }} />
                  </span>
                </p>
              )}
            </div>
            <div className="flex items-end gap-[max(0.9rem,8px)] rounded-xl bg-surface p-2.5 shadow-float ring-1 ring-border/60 transition-shadow focus-within:ring-2 focus-within:ring-brand/30">
              <button type="button" onClick={() => setFinding((v) => !v)} aria-expanded={finding} aria-label="Find one person" title="Find one person" className={ROUND + (finding ? " bg-brand text-white" : " bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink")}>
                <Icon name="person" />
              </button>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    search(text);
                  }
                }}
                rows={1}
                maxLength={20000}
                placeholder={job ? "Press send to search for this opening, or say who you need" : "A job title, a place and years — or paste a JD"}
                aria-label="Ask AURA to search LinkedIn"
                className="max-h-32 min-w-0 flex-1 resize-none self-center bg-transparent py-2 pl-[max(0.75rem,8px)] text-body text-ink outline-none placeholder:text-ink-3 [field-sizing:content]"
              />
              <button type="button" disabled={!mic.ok} onClick={mic.toggle} aria-pressed={mic.on} aria-label={mic.on ? "Stop listening" : "Speak"} title={mic.ok ? (mic.on ? "Stop listening" : "Speak") : "Speaking is not available in this browser"} className={ROUND + " relative disabled:opacity-40 " + (mic.on ? "bg-danger-soft text-danger" : "text-ink-3 hover:text-ink")}>
                {mic.on && <ListenPulse />}
                <Icon name="mic" className="size-[max(1.25rem,16px)]" />
              </button>
              <button type="button" onClick={() => search(text)} disabled={sending || (!text.trim() && !job)} aria-label="Search" title="Search" className={ROUND + " bg-brand text-white hover:bg-brand-strong disabled:opacity-40"}>
                <Icon name="up" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Orb({ breathing = false }: { breathing?: boolean }) {
  return (
    <span className="relative flex size-[max(2.5rem,32px)] shrink-0">
      {breathing && <span aria-hidden="true" className="absolute -inset-1 animate-pulse rounded-full bg-[conic-gradient(from_0deg,var(--color-aura-1),var(--color-aura-2),var(--color-aura-3),var(--color-aura-4),var(--color-aura-1))] opacity-60 motion-reduce:animate-none" />}
      <Image src="/aura-mark.png" alt="AURA" width={40} height={40} className="relative size-full rounded-full" />
    </span>
  );
}

/** AURA's turn: it watches its own run, so every message in a chat keeps its answer. */
function Answer({ id, latest, go, newSearch, job, add, said, inTable }: { id: string; latest: boolean; go: Go; newSearch: () => void; job: string; add: Add; said: Record<string, string>; inTable: Set<string> }) {
  const live = useLive();
  const got = useDoorQuery(door.liRun, live ? { id } : "skip") as { ok: true; run: Run } | { ok: false; message: string } | undefined;
  const cancel = useDoorMutation(door.liCancel);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const run = got?.ok ? got.run : null;
  const out = run?.out ? (JSON.parse(run.out) as Out) : null;
  const busy = got === undefined || run?.state === "running";
  const stage = busy ? "running" : out?.status ?? "failed";
  const body = useRef<HTMLDivElement>(null);
  useSwap(body, stage);

  const rows = stage === "found" ? (out?.row ? [out.row] : []) : out?.rows ?? [];
  const people = rows.filter((r) => !r.hidden);
  const hidden = rows.filter((r) => r.hidden && r.hiddenReason);
  const questions = out?.check?.questions ?? [];
  const mustHaves = out?.form?.mustHaves ?? [];
  const role = out?.form?.role;
  const line =
    stage === "running" ? (run?.stage === "waiting" ? "Waiting in the team queue" : "Searching LinkedIn")
    : stage === "questions" ? `Before I search${role ? ` for ${role}` : ""}`
    : stage === "market_count" ? (out?.marketCount != null ? `About ${out.marketCount} people match` : "This is a wide search")
    : stage === "done" ? `${people.length} ${people.length === 1 ? "person" : "people"}${role ? ` · ${role}` : ""}`
    : stage === "found" ? (out?.row ? "Found them" : "Nobody found with those details")
    : stage === "cancelled" ? "Search cancelled"
    : "The search did not finish";

  return (
    <div ref={body} className="flex flex-col gap-[max(0.7rem,8px)]">
      <div className="flex items-center gap-[max(0.9rem,10px)]">
        <Orb breathing={busy} />
        <p role="status" className="text-h3 font-medium text-ink">
          {line}
          {out?.usd !== undefined && <span className="ml-3 text-caption text-ink-3">about ${out.usd}</span>}
        </p>
      </div>
      <div className="flex flex-col gap-[max(0.7rem,8px)] pl-[max(3.4rem,46px)] max-md:pl-0">
        {stage === "running" && (
          <>
            <SearchSteps at={STAGE_AT[run?.stage ?? ""] ?? 1} steps={STAGES.map((label) => ({ label }))} />
            <p className="text-small text-ink-3">One to two minutes. You can leave this page and come back.</p>
            <button type="button" onClick={() => void cancel({ id })} className={CHIP + " self-start"}>
              <Icon name="stop" />
              Stop search (no cost)
            </button>
          </>
        )}

        {(stage === "failed" || stage === "cancelled") && (
          <p className="text-small text-ink-2">{run?.message ?? (got && !got.ok ? got.message : stage === "cancelled" ? "Nothing was charged." : "Try again in a minute.")}</p>
        )}

        {stage === "questions" &&
          questions.map((q) => (
            <fieldset key={q.code} disabled={!latest} className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
              <legend className="sr-only">{q.question}</legend>
              <p className="text-body font-medium text-ink">{q.question}</p>
              <div className="flex flex-wrap gap-2">
                {q.options?.map((o) => (
                  <button key={o} type="button" aria-pressed={answers[q.code] === o} onClick={() => setAnswers({ ...answers, [q.code]: o })} className={answers[q.code] === o ? PRIMARY : CHIP}>
                    {answers[q.code] === o && <Icon name="check" />}
                    {o}
                  </button>
                ))}
                <input value={q.options?.includes(answers[q.code]) ? "" : answers[q.code] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.code]: e.target.value })} placeholder="Or type your answer" aria-label={q.question} className={FIELD + " min-w-[14rem]"} />
              </div>
            </fieldset>
          ))}
        {stage === "questions" && latest && (
          <button
            type="button"
            disabled={questions.some((q) => !answers[q.code]?.trim())}
            onClick={() => go({ kind: "answer", from: id, answers: questions.map((q) => ({ code: q.code, answer: answers[q.code].trim() })) }, questions.map((q) => answers[q.code].trim()).join(" · "))}
            className={PRIMARY + " self-start"}
          >
            <Icon name="search" />
            Search
          </button>
        )}

        {stage === "market_count" && latest && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => go({ kind: "confirm", from: id }, "Search")} className={PRIMARY}>
              <Icon name="search" />
              Search
            </button>
            <button type="button" onClick={newSearch} className={CHIP}>
              <Icon name="edit" />
              Make it narrower
            </button>
          </div>
        )}

        {out?.warnings?.map((w) => (
          <p key={w} className="self-start rounded-sm bg-warn-soft px-4 py-2 text-small text-warn">{w}</p>
        ))}
        {stage === "done" && latest && mustHaves.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-small text-ink-2">
            Must have
            {mustHaves.map((m) => (
              <button key={m} type="button" onClick={() => go({ kind: "refine", from: id, mustHaves: mustHaves.filter((x) => x !== m) }, `Without ${m}`)} title="Search again without this" aria-label={`Search again without ${m}`} className="flex items-center gap-1 rounded-full bg-violet-soft py-1 pl-3 pr-2 text-small text-violet">
                {m}
                <Icon name="x" className="size-3" />
              </button>
            ))}
          </div>
        )}

        {people.length > 0 && (
          <ul aria-label="People found" className="flex flex-col gap-[max(0.6rem,6px)]">
            {people.map((r, i) => {
              const k = keyOf(r);
              const added = said[k] === "In the Excel Table" || inTable.has(bare(r.linkedinUrl ?? ""));
              return (
                <li key={k} className="flex flex-wrap items-center gap-x-[max(0.9rem,9px)] gap-y-2 rounded-md border border-border bg-surface px-[max(1rem,10px)] py-[max(0.75rem,8px)] hover:border-border-strong">
                  <span className={"flex size-[max(2.5rem,30px)] shrink-0 items-center justify-center rounded-full text-small font-medium " + AVATAR[i % 4]}>{initials(r.name)}</span>
                  <div className="min-w-[14rem] flex-1">
                    <p className="flex items-center gap-2 text-body font-medium text-ink">
                      {r.name}
                      {r.linkedinUrl && (
                        <a href={r.linkedinUrl} target="_blank" rel="noreferrer" aria-label={`${r.name} on LinkedIn`} title="Open on LinkedIn">
                          <LinkedInIcon className="size-4" />
                        </a>
                      )}
                    </p>
                    <p className="text-small text-ink-2">{[r.currentTitle || r.headline, r.currentCompany, [r.city, r.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
                    <p className="text-small text-ink-3">{[r.totalYears.known ? `${r.totalYears.text} years` : "years not shown", r.areaYears?.known ? `${r.areaYears.text} years in the area (check)` : "", r.qualificationsInHeadline.join(", ")].filter(Boolean).join(" · ")}</p>
                    {r.warnings.map((w) => (
                      <p key={w} className="text-caption text-warn">{w}</p>
                    ))}
                  </div>
                  <ul aria-label="Checked" className="flex flex-wrap gap-1.5">
                    {TICKS.filter(([t]) => r.mustHaves[t] !== "unknown").map(([t, label]) => (
                      <li key={t} className={"flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption " + (r.mustHaves[t] === "yes" ? "bg-success-soft text-success" : "bg-warn-soft text-warn")}>
                        <Icon name={r.mustHaves[t] === "yes" ? "check" : "x"} className="size-3" />
                        {label}
                      </li>
                    ))}
                  </ul>
                  {job && r.linkedinUrl && (
                    <div className="flex max-w-[22rem] flex-col items-end gap-1">
                      <button type="button" disabled={added || said[k] === "Adding…"} onClick={() => add(r)} className={added ? CHIP : PRIMARY}>
                        <Icon name={added ? "check" : "plus"} />
                        {added ? "In the Excel Table" : "Add to Excel Table"}
                      </button>
                      {said[k] && !added && <p role="status" className="text-right text-caption text-ink-2">{said[k]}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {people.length > 0 && !job && <p className="text-small text-ink-3">Pick an opening below to add people to its Excel Table.</p>}

        {hidden.length > 0 && (
          <details className="rounded-md bg-surface-2 px-4 py-3">
            <summary className="cursor-pointer text-small text-ink-2">{hidden.length} not shown, with why</summary>
            <ul className="mt-2 flex flex-col gap-1 text-caption text-ink-3">
              {hidden.map((r) => (
                <li key={keyOf(r)}>
                  <span className="text-ink-2">{r.name}</span> · {r.hiddenReason}
                </li>
              ))}
            </ul>
          </details>
        )}

        {stage === "done" && latest && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={() => go({ kind: "more", from: id }, "Show more")} className={PRIMARY}>
              <Icon name="more" />
              Show more
            </button>
            {WIDEN.map(([f, label]) => (
              <button key={f} type="button" onClick={() => go({ kind: "widen", from: id, field: f }, `Widen: ${label}`)} title={`Search again with a wider ${label.toLowerCase()}`} className={CHIP}>
                <Icon name="widen" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
