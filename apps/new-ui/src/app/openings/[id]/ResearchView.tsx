"use client";

import { RunSteps } from "../../SearchSteps";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { useWorkdayGate } from "@/lib/workday";
import { useMe } from "@/lib/role";
import { door, jobFromAddress, useDoorMutation, useLive, type DoorDone } from "@/lib/backend";
import { answersOf, editedOf, editOf, FIELD_OF, ranOn as ranOnOf, sendHh, useHh, type HhData } from "./hhLive";
import { BackButton } from "./PipelineBoard";
import Toast from "./Toast";
import WorkdayBlocked from "./WorkdayBlocked";
import { useLiftMenu } from "./liftMenu";

// Headhunting > Research: the client's market in eight answers, and Benchmark
// (owner's design "HH Research - the client's market in 8 answers + Benchmark",
// 13 Nov 2026). The rules are the old TA System's Research page:
// - every answer is filled by the research run with its source, left empty when it
//   could not be found, and can be corrected by hand (a hand edit survives a re-run);
// - "Wrong company? Correct it" saves notes on the CLIENT (every job for them uses
//   them) and runs Research again;
// - "I reviewed the research" is the workday check; an answer that is still empty
//   needs a reason why it could not be sourced;
// - Benchmark rows are ticked to steer the next Suggestions round; each name opens
//   where it was found.
// Signed in, the report, sources and Benchmark are the old page's and every button
// runs its old action (hhLive.ts, D8b); signed out, the sample below.

const SAMPLE_CLIENT = "PGP Glass";
const RESEARCHED_ON = "12 Nov";
/** Has Research run on this opening yet? Sample switch until the backend. */
const HAS_REPORT: boolean = true;
/** How long the sample run takes; the real one is about a minute. */
const RUN_MS = 2500;
/** Sample: the role reads junior, so Research does not benchmark it (old system). */
const SAMPLE_JUNIOR: boolean = false;
/** Sample: this TA works the job at 100% today (only they review the research). */
const SAMPLE_ON_100 = true;
/** Sample: who reviewed it, for a lead's eyes. */
const REVIEWED_BY: string | null = "Chathura Sampath";

type Key =
  | "titles"
  | "rivals"
  | "website"
  | "country"
  | "location"
  | "social"
  | "services"
  | "overview";
const LABEL: Record<Key, string> = {
  titles: "Similar designations",
  rivals: "Competitors to hunt from",
  website: "Website",
  country: "Country",
  location: "Location",
  social: "Social",
  services: "Services provider",
  overview: "Overview",
};
/** Answers shown as chips: written as a list, one item per comma. */
const CHIPS: Key[] = ["titles", "rivals"];

const EMPTY: Record<Key, string> = { titles: "", rivals: "", website: "", country: "", location: "", social: "", services: "", overview: "" };
const START: Record<Key, string> = {
  titles:
    "Head of SAP, ERP Programme Manager, S/4HANA Lead, Digital Transformation Mgr",
  rivals: "Lanka Tiles, Rocell, Royal Ceramics, Dipped Products, Ansell Lanka",
  website: "pgpglass.com",
  country: "Sri Lanka",
  location: "Horana BOI zone, Colombo office",
  social: "LinkedIn · 12k followers",
  services:
    "Glass containers for food, beverage and pharma; 6 plants; exports to 18 countries.",
  overview:
    "A fast-growing manufacturer replacing its 15-year-old ERP. Expect candidates from FMCG and building materials with plant-floor SAP experience.",
};

const SAMPLE_SOURCES = [
  {
    title: "Hemas - Morison - https://hemas.com",
    url: "https://hemas.com",
    quote:
      "Hemas | Home S&P SL20: 1020.52 SHARE VOLUME: 37,500 TURNOVER(LKR): 22,237,500 --> About Consumer Brands Healthcare Mobility Global Hub Investors Menu",
  },
  {
    title: "Hemas",
    url: "https://hemas.com",
    quote:
      "Morison is Hemas Holdings' pharmaceutical brand and manufacturing arm in Sri Lanka.",
  },
];

type Confidence = "high" | "medium" | "low";
const PEOPLE: {
  id: string;
  name: string;
  title: string;
  company: string;
  confidence: Confidence;
  source: string;
}[] = [
  {
    id: "b1",
    name: "Ruwan Gunawardena",
    title: "Head of SAP",
    company: "Lanka Tiles",
    confidence: "high",
    source: "https://www.linkedin.com/",
  },
  {
    id: "b2",
    name: "Shalini Perera",
    title: "ERP Programme Manager",
    company: "Rocell",
    confidence: "high",
    source: "https://www.linkedin.com/",
  },
  {
    id: "b3",
    name: "Arjuna Silva",
    title: "Digital Transformation Lead",
    company: "Dipped Products",
    confidence: "medium",
    source: "https://www.linkedin.com/",
  },
  {
    id: "b4",
    name: "Fazil Rahman",
    title: "SAP Lead",
    company: "Ansell Lanka",
    confidence: "medium",
    source: "https://www.linkedin.com/",
  },
];
const TONE: Record<Confidence, string> = {
  high: "bg-brand-soft text-brand",
  medium: "bg-warn-soft text-warn",
  low: "bg-surface-3 text-ink-2",
};

const LABEL_CLS = "text-caption font-medium uppercase text-ink-3";
const CARD =
  "rounded-md bg-surface-2 px-[max(1.4rem,12px)] py-[max(1.3rem,12px)]";
const GHOST =
  "flex items-center gap-1.5 rounded-full px-[max(0.6rem,6px)] py-1 text-small text-ink-2 hover:bg-surface-2 hover:text-ink";
const PRIMARY =
  "flex h-[max(3rem,36px)] items-center gap-2 rounded-md bg-brand px-[max(1rem,12px)] text-small font-medium text-white hover:bg-brand-strong disabled:opacity-40";

export default function ResearchView() {
  const gate = useWorkdayGate();
  const me = useMe();
  const live = useLive();
  const [job] = useState(jobFromAddress);
  const signedIn = live && !!job;
  const { data, error, reload } = useHh(job, signedIn);
  const saveCheck = useDoorMutation(door.saveCheck);
  const R = data?.research;
  const CLIENT = R ? R.client?.name ?? "the client" : SAMPLE_CLIENT;
  const SOURCES = R ? R.report?.sources ?? [] : SAMPLE_SOURCES;
  const JUNIOR = R ? !R.benchmarksByDefault : SAMPLE_JUNIOR;
  const ON_100 = R ? R.reviewHere : SAMPLE_ON_100;
  // A TA runs Research once and Find them once an opening; after that only a lead.
  const [researchRuns, setResearchRuns] = useState(HAS_REPORT ? 1 : 0);
  const [findRuns, setFindRuns] = useState(HAS_REPORT ? 1 : 0);
  // Live, the TA System's own run limits answer the press; the sample shows them here.
  const researchLocked = !signedIn && !me.lead && researchRuns > 0;
  const findLocked = !signedIn && !me.lead && findRuns > 0;
  const [fields, setFields] = useState(() => (signedIn ? EMPTY : START));
  const [edited, setEdited] = useState<Key[]>([]);
  const [picked, setPicked] = useState<string[]>(() => (signedIn ? [] : ["b1"]));
  const [reviewed, setReviewed] = useState(false);
  // Research: not run yet, running, or done. A run fills every answer again except
  // the ones a person corrected by hand.
  const [run, setRun] = useState<"none" | "running" | "done">(
    HAS_REPORT && !signedIn ? "done" : "none",
  );
  const [people, setPeople] = useState(HAS_REPORT && !signedIn ? PEOPLE : []);
  const [finding, setFinding] = useState(false);
  const [ranOn, setRanOn] = useState(RESEARCHED_ON);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (f: () => void) => timers.current.push(setTimeout(f, RUN_MS));
  const [notice, setNotice] = useState<{ rest: string; n: number } | null>(
    null,
  );
  const say = (rest: string) =>
    setNotice((n) => ({ rest, n: (n?.n ?? 0) + 1 }));

  // Each new read replaces the screen (React's pattern for state that follows a value).
  const [seen, setSeen] = useState<HhData | null>(null);
  if (data && data !== seen) {
    setSeen(data);
    const rep = data.research.report;
    setFields(rep ? answersOf(rep.fields, CHIPS) : EMPTY);
    setEdited(rep ? editedOf(rep.edited) : []);
    setRun((x) => (x === "running" ? x : rep ? "done" : "none"));
    if (rep) setRanOn(ranOnOf(rep.generatedAt));
    setPeople(
      data.research.benchmarks.map((b) => ({
        id: b.id, name: b.name ?? "Name not established", title: b.title, company: b.company,
        confidence: b.confidence, source: b.url ?? b.sourceUrl ?? "",
      })),
    );
    setPicked(data.research.benchmarks.filter((b) => b.picked).map((b) => b.id));
  }
  const [seenError, setSeenError] = useState<string | null>(null);
  if (error !== seenError) {
    setSeenError(error);
    if (error) say(error);
  }
  /** One old Research action; its sentence is said, then the page is read again. */
  const send = async (body: Record<string, unknown>) => {
    const res = await sendHh({ openingId: job, ...body });
    say(res.message);
    await reload();
    return res.ok;
  };

  const save = (k: Key, v: string) => {
    if (v === fields[k]) return;
    if (signedIn) void send({ do: "editField", ...editOf(k, v) });
    setFields((f) => ({ ...f, [k]: v }));
    setEdited((e) => (e.includes(k) ? e : [...e, k]));
    say(
      v
        ? `${LABEL[k]} saved - kept when Research runs again`
        : `${LABEL[k]} cleared - it will need a reason when you review`,
    );
  };
  const empty = (Object.keys(LABEL) as Key[]).filter((k) => !fields[k].trim());
  const busy = run === "running";
  // A run that found almost nothing looked finished (20 Nov audit: all eight "Not
  // found", junk sources, "Researched 18 Nov from 9 sources"). Say so, keep the data.
  const failedRun = signedIn && run === "done" && empty.length >= 6;
  // The old action saves on the client and runs Research and Suggestions after.
  const correctClient = (notes: string) => {
    if (signedIn) return void send({ do: "correctClient", researchNotes: notes });
    say(`Saved on ${CLIENT} - Research runs again with it`);
    runResearch();
  };

  const runResearch = () => {
    if (busy) return;
    if (signedIn) {
      // About a minute on the TA System; the button waits for its answer.
      setRun("running");
      void send({ do: "research" }).then(() => setRun((x) => (x === "running" ? "done" : x)));
      return;
    }
    setResearchRuns((n) => n + 1);
    const first = run === "none";
    setRun("running");
    later(() => {
      setFields((f) => {
        const next = { ...START };
        for (const k of edited) next[k] = f[k];
        return next;
      });
      setRun("done");
      setRanOn("today");
      // Research finds who holds the job when it runs, for Benchmark.
      if (first) setPeople(PEOPLE);
      say(
        `Research done - ${SOURCES.length} sources read${edited.length ? ", your corrections kept" : ""}`,
      );
    });
  };
  // Benchmark on its own: looks again for who does this job. Picks on people
  // found again are kept.
  const findPeople = () => {
    if (finding || findLocked) return;
    if (signedIn) {
      setFinding(true);
      void send({ do: "benchmark" }).then(() => setFinding(false));
      return;
    }
    setFindRuns((n) => n + 1);
    setFinding(true);
    later(() => {
      setPeople(PEOPLE);
      setPicked((p) => p.filter((id) => PEOPLE.some((b) => b.id === id)));
      setFinding(false);
      say(`${PEOPLE.length} people found - each with where we found them`);
    });
  };
  const toggle = (id: string) => {
    if (signedIn) void send({ do: "pickBenchmark", entryId: id });
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const field = (k: Key, className = "") => (
    <Field
      key={k}
      k={k}
      value={fields[k]}
      edited={edited.includes(k)}
      onSave={(v) => save(k, v)}
      className={className}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[max(1.5rem,14px)] pb-[max(2rem,16px)] pt-[max(1.4rem,14px)] max-md:pt-11 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border-strong [&::-webkit-scrollbar-track]:my-8 [&::-webkit-scrollbar-track]:bg-transparent">
      {/* Header: back, when and from what it was researched, the two actions */}
      {/* Top-aligned so Back stays in the Pipeline's corner when the actions wrap. */}
      <div className="flex flex-wrap items-start gap-x-[max(1.3rem,10px)] gap-y-3">
        <div className="flex items-center gap-x-[max(1.3rem,10px)]">
        <BackButton />
        <Image
          src="/aura-mark.png"
          alt=""
          width={28}
          height={28}
          className="size-[max(1.75rem,22px)] rounded-full"
        />
        <p className="text-small text-ink-2" role="status">
          {signedIn && !data
            ? error ?? "Reading the research…"
            : busy
            ? `Researching ${CLIENT} - about a minute. You can keep working.`
            : run === "none"
              ? `${CLIENT} has not been researched yet`
              : `Researched ${ranOn} from ${SOURCES.length} sources`}
        </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-[max(1rem,8px)] gap-y-2 max-md:ml-0 md:max-w-[calc(50%-8.5rem)]">
          {run !== "none" && (
            <button
              type="button"
              disabled={busy || researchLocked}
              onClick={runResearch}
              title={
                researchLocked ? "Your TA Lead can run it again" : undefined
              }
              className={GHOST + " disabled:opacity-60"}
            >
              <RunIcon />
              {busy ? "Running…" : "Run again"}
            </button>
          )}
          {run === "done" && researchLocked && (
            <span className="text-small text-ink-3">
              Your TA Lead can run it again
            </span>
          )}
          <CorrectCompany
            client={CLIENT}
            start={R?.client?.notes ?? ""}
            first={run === "none"}
            busy={busy}
            onSaved={correctClient}
          />
          {run !== "none" && me.lead && (
            <span className="text-small text-ink-3">
              {reviewed || REVIEWED_BY
                ? `Reviewed by ${REVIEWED_BY ?? "the TA"}`
                : "Not reviewed yet by the TA on 100%"}
            </span>
          )}
          {run !== "none" && !me.lead && ON_100 && (
            <Review
              empty={empty}
              reviewed={reviewed}
              blocked={!!gate || busy}
              onDone={(why) => {
                if (signedIn && job) {
                  // The workday check: the TA System re-checks every empty answer has a reason.
                  const reasons = Object.fromEntries(
                    Object.entries(why).filter(([, v]) => v?.trim()).map(([k, v]) => [FIELD_OF[k as Key], v!.trim()]),
                  );
                  void (saveCheck({ jobId: job, kind: "research", reasons }) as Promise<DoorDone>)
                    .then((res) => {
                      if (res.ok) setReviewed(true);
                      say(res.ok ? "Research marked as reviewed for today" : res.message);
                    })
                    .catch(() => say("Could not save. Check your connection and try again."));
                  return;
                }
                setReviewed(true);
                say("Research marked as reviewed for today");
              }}
            />
          )}
        </div>
      </div>
      {gate && run === "done" && (
        <WorkdayBlocked what="mark the research reviewed" className="mt-4" />
      )}

      {busy && <RunSteps steps={RESEARCH_STEPS} every={12000} />}
      {failedRun && !busy && (
        <div
          role="alert"
          className="mt-[max(1.2rem,12px)] flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-warn/40 bg-warn-soft px-[max(1.2rem,12px)] py-[max(1rem,10px)]"
        >
          <p className="min-w-0 flex-1 text-small text-ink">
            <b className="font-semibold">This research found almost nothing about {CLIENT}.</b>{" "}
            Run it again, or correct the company name.
          </p>
          <button type="button" onClick={runResearch} className={PRIMARY + " rounded-full"}>
            <RunIcon />
            Run again
          </button>
          <CorrectCompany client={CLIENT} start={R?.client?.notes ?? ""} first={false} busy={busy} onSaved={correctClient} />
        </div>
      )}
      {signedIn && !data ? null : run !== "done" && people.length === 0 ? (
        // Not researched yet: what Research does, and the one button.
        <div className="m-auto flex max-w-[34rem] flex-col items-center gap-[max(0.9rem,10px)] py-10 text-center">
          <p className="text-h3">
            {busy ? `Researching ${CLIENT}…` : `Research ${CLIENT}`}
          </p>
          <p className="text-small text-ink-3">
            Searches the client and its competitors, reads their websites and
            fills the eight answers - each with its source - and finds who does
            this job today for Benchmark. Anything it cannot find is left empty,
            never guessed.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={runResearch}
            className={PRIMARY + " rounded-full"}
          >
            <RunIcon />
            {busy ? "Researching - about a minute" : "Run research"}
          </button>
        </div>
      ) : (
        <div
          aria-busy={busy}
          className={
            "mt-[max(1.4rem,14px)] grid grid-cols-[minmax(0,1fr)] gap-[max(1rem,10px)] transition-opacity lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start " +
            (busy ? "opacity-60" : "")
          }
        >
          {/* The eight answers */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-[max(1rem,10px)] md:grid-cols-4">
            {field("titles", "md:col-span-2")}
            {field("rivals", "md:col-span-2")}
            {field("website")}
            {field("country")}
            {field("location")}
            {field("social")}
            {field("services", "md:col-span-2")}
            {field("overview", "md:col-span-2")}
            <section className={CARD + " md:col-span-4"}>
              <h3 className="text-caption text-ink-3">
                Sources {SOURCES.length}
              </h3>
              <ol className="mt-[max(0.8rem,8px)] flex flex-col gap-[max(0.9rem,8px)]">
                {SOURCES.map((s, i) => (
                  <li key={s.url + i} className="break-words">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-small font-medium text-info hover:underline"
                    >
                      {s.title}
                    </a>
                    {s.quote && (
                      <p className="mt-0.5 text-caption italic text-ink-3">
                        &ldquo;{s.quote}&rdquo;
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {/* Benchmark */}
          {/* Stays in view while the answers and sources scroll. */}
          <section className="rounded-lg border border-border bg-surface px-[max(1.5rem,14px)] py-[max(1.5rem,14px)] lg:sticky lg:top-0">
            <div className="flex items-center gap-2">
              <h3 className="text-h3 font-medium">Benchmark</h3>
              <button
                type="button"
                disabled={finding || findLocked}
                onClick={findPeople}
                title={findLocked ? "Your TA Lead can run it again" : undefined}
                className={GHOST + " ml-auto disabled:opacity-60"}
              >
                <RunIcon />
                {finding
                  ? "Finding…"
                  : people.length
                    ? "Find them again"
                    : JUNIOR
                      ? "Find them anyway"
                      : "Find them"}
              </button>
            </div>
            {findLocked && !finding && (
              <p className="mt-1 text-small text-ink-3">
                Your TA Lead can run it again
              </p>
            )}
            {JUNIOR && (
              <p className="mt-1.5 rounded-md bg-warn-soft px-3 py-2 text-small text-ink-2">
                This role reads as junior - Research does not benchmark this
                level.
              </p>
            )}
            <p className="mt-1.5 text-small text-ink-3">
              People doing this job today at similar companies — pick who the
              client should compare against.
            </p>
            {people.length === 0 && (
              <p className="mt-[max(1rem,10px)] rounded-md bg-surface-2 px-4 py-6 text-center text-small text-ink-3">
                {finding
                  ? "Looking for who does this job today…"
                  : "Nobody found yet. Four people we can stand behind beat fifteen we cannot."}
              </p>
            )}
            <ul
              aria-busy={finding}
              className={
                "mt-[max(1rem,10px)] flex flex-col gap-[max(0.75rem,8px)] transition-opacity " +
                (finding ? "opacity-60" : "")
              }
            >
              {people.map((b) => {
                const on = picked.includes(b.id);
                return (
                  <li
                    key={b.id}
                    onClick={() => toggle(b.id)}
                    className={
                      "flex cursor-pointer items-center gap-3 rounded-md border px-[max(0.9rem,10px)] py-[max(0.7rem,8px)] transition-colors " +
                      (on
                        ? "border-brand bg-surface"
                        : "border-transparent bg-surface-2 hover:border-border-strong")
                    }
                  >
                    <div className="min-w-0 flex-1">
                      {/* The name opens where we found them; it does not tick the row. */}
                      <a
                        href={b.source}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-small font-medium text-ink hover:text-brand hover:underline"
                      >
                        {b.name}
                      </a>
                      <p className="truncate text-caption text-ink-3">
                        {b.title} · {b.company}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-[max(0.7rem,8px)] py-0.5 text-small capitalize ${TONE[b.confidence]}`}
                    >
                      {b.confidence}
                    </span>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={
                        on
                          ? `Remove ${b.name} from the benchmark`
                          : `Benchmark against ${b.name}`
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(b.id);
                      }}
                      className={
                        "flex size-[max(1.5rem,20px)] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors " +
                        (on
                          ? "border-brand bg-brand text-white"
                          : "border-border-strong text-transparent hover:border-brand")
                      }
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-3/5"
                        aria-hidden="true"
                      >
                        <path d="m5 12 5 5 9-10" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-[max(1rem,10px)] text-caption text-ink-3">
              {picked.length > 0
                ? `${picked.length} picked - they guide the next Suggestions round. Each person links to where we found them.`
                : "Each person links to where we found them."}
            </p>
          </section>
        </div>
      )}

      {notice && <Toast key={notice.n} rest={notice.rest} />}
    </div>
  );
}

/** One answer. Click it to correct it by hand: Enter (Ctrl+Enter in long text)
 *  keeps, Escape undoes. A hand edit is marked and survives the next run. */
function Field({
  k,
  value,
  edited,
  onSave,
  className,
}: {
  k: Key;
  value: string;
  edited: boolean;
  onSave: (v: string) => void;
  className: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const box = useRef<HTMLTextAreaElement>(null);
  const chips = CHIPS.includes(k);
  const long = k === "services" || k === "overview";

  useEffect(() => {
    if (!editing) return;
    const t = box.current;
    t?.focus();
    t?.setSelectionRange(t.value.length, t.value.length);
  }, [editing]);

  const open = () => {
    setDraft(value);
    setEditing(true);
  };
  const keep = () => {
    setEditing(false);
    const v = chips
      ? draft
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .join(", ")
      : draft.trim();
    onSave(v);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    } else if (e.key === "Enter" && (!long || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      keep();
    }
  };

  const link =
    k === "website" && value
      ? `https://${value.replace(/^https?:\/\//, "")}`
      : "";

  return (
    <section className={"group relative " + CARD + " " + className}>
      <div className="flex items-center gap-2">
        <h3 className={LABEL_CLS}>{LABEL[k]}</h3>
        {edited && (
          <span
            title="Corrected by hand - kept when Research runs again"
            className="whitespace-nowrap text-caption text-brand"
          >
            · edited
          </span>
        )}
        {!editing && (
          <button
            type="button"
            onClick={open}
            aria-label={`Correct ${LABEL[k].toLowerCase()}`}
            className="ml-auto rounded-full p-1 text-ink-3 opacity-0 transition-opacity hover:bg-surface-3 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
          >
            <PencilIcon />
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <textarea
            ref={box}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={key}
            rows={long ? 4 : chips ? 3 : 1}
            maxLength={2000}
            className="w-full resize-none rounded-sm border border-border-strong bg-surface px-2.5 py-1.5 text-body outline-none focus:border-brand"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <span className="mr-auto text-caption text-ink-3">
              {chips ? "One per comma. " : ""}
              {long ? "Ctrl+Enter keeps" : "Enter keeps"}, Esc undoes
            </span>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={GHOST}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={keep}
              className="rounded-full bg-brand px-3 py-1 text-small font-medium text-white hover:bg-brand-strong"
            >
              Save
            </button>
          </div>
        </div>
      ) : !value ? (
        <button
          type="button"
          onClick={open}
          className="mt-2 text-small text-ink-3 hover:text-brand"
        >
          Not found - add it
        </button>
      ) : chips ? (
        <ul className="mt-[max(0.7rem,6px)] flex flex-wrap gap-[max(0.5rem,6px)]">
          {value.split(", ").map((c) => (
            <li
              key={c}
              className="rounded-full bg-surface px-[max(0.75rem,9px)] py-[max(0.35rem,4px)] text-body text-ink"
            >
              {c}
            </li>
          ))}
        </ul>
      ) : link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="mt-[max(0.7rem,6px)] block text-body text-ink hover:text-brand hover:underline"
        >
          {value}
        </a>
      ) : (
        <p className="mt-[max(0.7rem,6px)] text-body text-ink">{value}</p>
      )}
    </section>
  );
}

/** "Wrong company? Correct it": what the TA knows about the client, saved on the
 *  client (every job for them uses it), then Research and a new Suggestions round
 *  run again. A website or LinkedIn link written here is used as it is. */
function CorrectCompany({
  client: CLIENT,
  start,
  onSaved,
  first,
  busy,
}: {
  client: string;
  start: string;
  onSaved: (notes: string) => void;
  first: boolean;
  busy: boolean;
}) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  // What is already saved on the client, to change rather than retype.
  const [notes, setNotes] = useState(start);
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={GHOST}
      >
        <PencilIcon />
        {first ? `Tell Research who ${CLIENT} is` : "Wrong company? Correct it"}
      </button>
      {shown && (
        <div
          ref={panel}
          role="dialog"
          aria-label={`Tell Research who ${CLIENT} is`}
          className="absolute right-0 top-full z-30 mt-2 w-[min(28rem,calc(100vw-32px))] rounded-md border border-border bg-surface p-[max(1rem,12px)] shadow-float max-md:left-0 max-md:right-auto"
        >
          <p className="text-small font-medium text-ink">
            Tell Research who {CLIENT} is
          </p>
          <textarea
            autoFocus
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Paste what you know: the website, the LinkedIn company page, the full company name, what they do, group companies…"
            className="mt-2 w-full resize-none rounded-sm border border-border-strong bg-surface px-2.5 py-1.5 text-small outline-none focus:border-brand"
          />
          <p className="mt-1.5 text-caption text-ink-3">
            Saved on {CLIENT}, so every job for them uses it. Saving runs
            Research and a new Suggestions round again; suggestions nobody has
            acted on are set aside.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={GHOST}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!notes.trim() || busy}
              onClick={() => {
                setOpen(false);
                onSaved(notes.trim());
              }}
              className="rounded-full bg-brand px-3.5 py-1.5 text-small font-medium text-white hover:bg-brand-strong disabled:opacity-40"
            >
              {first ? "Save and run research" : "Save and run again"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "I reviewed the research" - the workday check. An answer still empty needs a
 *  reason why it could not be sourced; then the check is ticked. */
function Review({
  empty,
  reviewed,
  blocked,
  onDone,
}: {
  empty: Key[];
  reviewed: boolean;
  blocked: boolean;
  onDone: (why: Partial<Record<Key, string>>) => void;
}) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const [why, setWhy] = useState<Partial<Record<Key, string>>>({});
  const missing = empty.filter((k) => !why[k]?.trim());

  if (reviewed) {
    return (
      <span className="flex h-[max(3rem,36px)] items-center gap-2 rounded-md bg-brand-soft px-[max(1rem,12px)] text-small font-medium text-brand">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[max(1rem,13px)]"
          aria-hidden="true"
        >
          <path d="m5 12 5 5 9-10" />
        </svg>
        Research reviewed
      </span>
    );
  }
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        disabled={blocked}
        aria-expanded={empty.length ? open : undefined}
        onClick={() => (empty.length ? setOpen((o) => !o) : onDone({}))}
        className={PRIMARY}
      >
        I reviewed the research
      </button>
      {shown && empty.length > 0 && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Answers Research could not find"
          className="absolute right-0 top-full z-30 mt-2 w-[min(26rem,calc(100vw-32px))] rounded-md border border-border bg-surface p-[max(1rem,12px)] shadow-float max-md:left-0 max-md:right-auto"
        >
          <p className="text-small font-medium text-ink">
            {empty.length === 1
              ? "One answer is"
              : `${empty.length} answers are`}{" "}
            still empty
          </p>
          <p className="mt-0.5 text-caption text-ink-3">
            Fill it in on the card, or say here why it cannot be sourced.
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {empty.map((k, i) => (
              <label key={k} className="block text-caption text-ink-2">
                {LABEL[k]}
                <input
                  autoFocus={i === 0}
                  value={why[k] ?? ""}
                  onChange={(e) =>
                    setWhy((w) => ({ ...w, [k]: e.target.value }))
                  }
                  maxLength={1000}
                  className="mt-1 w-full rounded-sm border border-border-strong bg-surface px-2.5 py-1.5 text-small outline-none focus:border-brand"
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={missing.length > 0}
              onClick={() => {
                setOpen(false);
                onDone(why);
              }}
              className="rounded-full bg-brand px-3.5 py-1.5 text-small font-medium text-white hover:bg-brand-strong disabled:opacity-40"
            >
              {missing.length
                ? `${missing.length} reason${missing.length === 1 ? "" : "s"} to go`
                : "Mark reviewed"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const PencilIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-[max(0.95rem,13px)]"
    aria-hidden="true"
  >
    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </svg>
);

const RunIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-[max(0.95rem,13px)]"
    aria-hidden="true"
  >
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v4h-4" />
  </svg>
);

/** What a Research run does, as one line of steps (20 Nov 2026); about a minute, the last waits. */
const RESEARCH_STEPS = ["Searching the client and its rivals", "Reading their websites", "Filling the eight answers", "Finding who does this job today"];
