"use client";

// LinkedIn Search on the search engine (26 Nov 2026). Shown only when the backend has
// its search key (SearchSwitch.tsx); until then the older search page stays. A press
// starts a run on the backend and this page watches it: questions first (free), then
// the people, each with what was checked, and "Add to Excel Table" for the opening.

import { useRef, useState } from "react";
import Image from "next/image";
import { door, useDoorMutation, useDoorQuery, useLive, type DoorOpenings } from "@/lib/backend";
import { useSwap } from "@/lib/gsap";
import { useSpeech } from "@/lib/useSpeech";
import { SearchSteps } from "../SearchSteps";
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
  searchId?: string;
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

const STAGES = ["Reading your request", "Asking the free questions", "Searching LinkedIn", "Checking and ranking"];
const STAGE_AT: Record<string, number> = { waiting: 2, agent_search: 2, reuse: 3, top_up: 3 };
const WIDEN = [["level", "Level"], ["years", "Years"], ["city", "City"], ["industry", "Industry"], ["titles", "Job titles"]] as const;
const TICKS = [["function", "Role"], ["level", "Level"], ["years", "Years"], ["industry", "Industry"], ["location", "Place"]] as const;
const CHIP = "rounded-full border border-border bg-surface px-4 py-2 text-small text-ink hover:border-border-strong hover:bg-surface-2 disabled:opacity-40";
const DARK = "rounded-full bg-ink px-5 py-2.5 text-small font-medium text-white hover:bg-ink/85 disabled:opacity-40";
const FIELD = "rounded-sm border border-border bg-surface px-3 py-2 text-small text-ink outline-none placeholder:text-ink-3 focus:border-brand";

const keyOf = (r: Row) => r.linkedinUrl || `${r.name}|${r.currentCompany}`;
const KEEP = "ta-ui:li-run";
const kept = () => {
  try {
    return sessionStorage.getItem(KEEP);
  } catch {
    return null;
  }
};

export default function RecruiterSearch() {
  const live = useLive();
  const status = useDoorQuery(door.liStatus, live ? {} : "skip") as Status | undefined;
  const openings = useDoorQuery(door.openings, live ? {} : "skip") as DoorOpenings | undefined;
  const start = useDoorMutation(door.liStart);
  const cancel = useDoorMutation(door.liCancel);
  const [job, setJob] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("job") ?? ""));
  const [runId, setRunId] = useState<string | null>(() => (typeof window === "undefined" ? null : kept()));
  const [text, setText] = useState("");
  const mic = useSpeech((t) => setText((x) => (x ? x + " " : "") + t));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  /** People from the lists before "Show more", kept above the new ones. */
  const [earlier, setEarlier] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [said, setSaid] = useState<Record<string, string>>({});
  const [finding, setFinding] = useState(false);
  const [person, setPerson] = useState({ url: "", name: "", company: "" });
  const [location, setLocation] = useState("");

  const got = useDoorQuery(door.liRun, live && runId ? { id: runId } : "skip") as { ok: true; run: Run } | { ok: false; message: string } | undefined;
  const run = runId && got?.ok ? got.run : null;
  const out = run?.out ? (JSON.parse(run.out) as Out) : null;
  const table = useLiveLinks(job || null, live && !!job);
  const locations = table.data?.locations ?? [];
  const inTable = new Set((table.data?.rows ?? []).map((r) => String((r as { linkedinUrl?: string }).linkedinUrl ?? "").toLowerCase().replace(/\/$/, "")));
  const busy = run?.state === "running" || (!!runId && got === undefined);

  const body = useRef<HTMLDivElement>(null);
  const stage = !runId ? "ask" : busy ? "running" : out?.status ?? "failed";
  useSwap(body, stage);

  const go = async (args: Record<string, unknown>, keep: Row[] = []) => {
    setError("");
    const res = (await start({ ...args, ...(job ? { openingId: job } : {}) }).catch(() => null)) as { ok: boolean; message?: string; runId?: string } | null;
    if (!res?.ok || !res.runId) return setError(res?.message ?? "Could not start the search. Check your connection and try again.");
    setEarlier(keep);
    setAnswers({});
    setRunId(res.runId);
    try {
      sessionStorage.setItem(KEEP, res.runId);
    } catch {}
  };
  const reset = () => {
    setRunId(null);
    setEarlier([]);
    setError("");
    try {
      sessionStorage.removeItem(KEEP);
    } catch {}
  };

  const search = () => {
    if (!text.trim() && !job) return setError("Say who you are looking for, or pick an opening.");
    void go({ kind: "search", text: text.trim() });
  };
  const add = async (r: Row) => {
    if (!r.linkedinUrl) return;
    const k = keyOf(r);
    setSaid((s) => ({ ...s, [k]: "Adding…" }));
    const res = await sendLink({ do: "add", openingId: job, url: r.linkedinUrl, name: r.name, ...(location ? { workLocationId: location } : {}) });
    setSaid((s) => ({ ...s, [k]: res.ok ? "In the Excel Table" : res.message }));
    if (res.ok) void table.reload();
  };

  const rows = out?.status === "found" ? (out.row ? [out.row] : []) : out?.rows ?? [];
  const seen = new Set(earlier.map(keyOf));
  const all = [...earlier, ...rows.filter((r) => !r.hidden && !seen.has(keyOf(r)))];
  const hidden = rows.filter((r) => r.hidden && r.hiddenReason);
  const questions = out?.check?.questions ?? [];
  const mustHaves = out?.form?.mustHaves ?? [];

  const person_ = (r: Row) => {
    const k = keyOf(r);
    const added = said[k] === "In the Excel Table" || inTable.has((r.linkedinUrl ?? "").toLowerCase().replace(/\/$/, ""));
    return (
      <li key={k} className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-md px-3 py-3 hover:bg-canvas">
        <div className="min-w-[16rem] flex-1">
          <p className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">
            {r.name}
            {r.linkedinUrl && (
              <a href={r.linkedinUrl} target="_blank" rel="noreferrer" aria-label={`${r.name} on LinkedIn`}>
                <LinkedInIcon className="size-4" />
              </a>
            )}
          </p>
          <p className="text-small text-ink">{[r.currentTitle || r.headline, r.currentCompany].filter(Boolean).join(" · ")}</p>
          <p className="text-caption text-ink-3">
            {[[r.city, r.country].filter(Boolean).join(", "), r.totalYears.known ? `${r.totalYears.text} years` : "years not shown", r.areaYears?.known ? `${r.areaYears.text} years in the area (check)` : "", r.qualificationsInHeadline.join(", ")].filter(Boolean).join(" · ")}
          </p>
          {r.warnings.map((w) => (
            <p key={w} className="text-caption text-warn">{w}</p>
          ))}
        </div>
        <ul aria-label="Checked" className="flex flex-wrap gap-1.5">
          {TICKS.filter(([t]) => r.mustHaves[t] !== "unknown").map(([t, label]) => (
            <li key={t} className={"rounded-full px-2.5 py-0.5 text-caption " + (r.mustHaves[t] === "yes" ? "bg-success-soft text-success" : "bg-warn-soft text-warn")}>
              {r.mustHaves[t] === "yes" ? "✓" : "✕"} {label}
            </li>
          ))}
        </ul>
        {job && r.linkedinUrl && (
          <div className="flex max-w-[22rem] flex-col items-end gap-1">
            <button type="button" disabled={added || said[k] === "Adding…"} onClick={() => void add(r)} className={added ? CHIP : DARK}>
              {added ? "In the Excel Table" : "Add to Excel Table"}
            </button>
            {said[k] && !added && <p role="status" className="text-right text-caption text-ink-2">{said[k]}</p>}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[max(1.5rem,14px)] pb-[max(1.5rem,14px)] pt-[max(2.4rem,28px)]">
      <div className="flex flex-wrap items-center gap-3">
        {runId && (
          <button type="button" onClick={reset} className={CHIP}>
            New search
          </button>
        )}
        <label className="ml-auto flex items-center gap-2 text-small text-ink-2">
          Opening
          <select value={job} onChange={(e) => { setJob(e.target.value); setSaid({}); setLocation(""); }} className={FIELD + " max-w-[22rem]"}>
            <option value="">None (cannot add to a table)</option>
            {openings?.ok && openings.openings.filter((o) => o.status === "active").map((o) => <option key={o.id} value={o.id}>{o.client} · {o.title}</option>)}
          </select>
        </label>
        {locations.length > 1 && (
          <label className="flex items-center gap-2 text-small text-ink-2">
            Add to
            <select value={location} onChange={(e) => setLocation(e.target.value)} className={FIELD}>
              <option value="">Pick a work location</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
        {status?.ok && status.limitUsd !== null && <span className="text-caption text-ink-3">Today ${status.spentUsd} of ${status.limitUsd}</span>}
      </div>
      {error && <p role="alert" className="mt-3 rounded-sm bg-danger-soft px-4 py-3 text-small text-danger">{error}</p>}

      <div ref={body} className="flex flex-1 flex-col">
        {stage === "ask" && (
          <div className="mx-auto flex w-full max-w-[52rem] flex-1 flex-col items-center justify-center gap-4 text-center">
            <Image src="/aura-mark.png" alt="AURA" width={56} height={56} className="size-14 rounded-full bg-black" />
            <h1 className="text-display font-light text-ink max-md:text-h1">Who do you need on LinkedIn?</h1>
            <p className="text-small text-ink-2">Say it in your words, paste the job description, or pick an opening. Questions come first and cost nothing.</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={20000} aria-label="Who you need" placeholder="Quantity Surveyor for building projects in Sri Lanka, 5-8 years…" className={FIELD + " w-full rounded-md p-4 text-body shadow-card"} />
            <div className="flex flex-wrap items-center justify-center gap-3">
              {mic.ok && <button type="button" onClick={mic.toggle} aria-pressed={mic.on} className={CHIP}>{mic.on ? "Stop listening" : "Speak"}</button>}
              <button type="button" onClick={search} className={DARK}>Search</button>
              <button type="button" onClick={() => setFinding((v) => !v)} aria-expanded={finding} className={CHIP}>Find one person</button>
            </div>
            {finding && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void go({ kind: "find", person: Object.fromEntries(Object.entries(person).filter(([, v]) => v.trim())) });
                }}
                className="flex w-full flex-wrap justify-center gap-2"
              >
                <input value={person.url} onChange={(e) => setPerson({ ...person, url: e.target.value })} placeholder="LinkedIn link" aria-label="LinkedIn link" className={FIELD + " min-w-[18rem]"} />
                <span className="self-center text-small text-ink-3">or</span>
                <input value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} placeholder="Name" aria-label="Name" className={FIELD} />
                <input value={person.company} onChange={(e) => setPerson({ ...person, company: e.target.value })} placeholder="Company" aria-label="Company" className={FIELD} />
                <button className={DARK}>Find</button>
              </form>
            )}
          </div>
        )}

        {stage === "running" && (
          <div className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col justify-center gap-6">
            <SearchSteps at={STAGE_AT[run?.stage ?? ""] ?? 1} steps={STAGES.map((label) => ({ label }))} />
            <p className="text-small text-ink-3">{run?.stage === "waiting" ? "Waiting in the team queue." : "A LinkedIn search takes one to two minutes. You can leave this page and come back."}</p>
            <button type="button" onClick={() => runId && void cancel({ id: runId })} className={DARK + " self-start"}>Cancel (no cost)</button>
          </div>
        )}

        {stage === "questions" && out && (
          <div className="mx-auto mt-6 flex w-full max-w-[46rem] flex-col gap-5">
            <h1 className="text-h2 text-ink">Before I search{out.form?.role ? ` for ${out.form.role}` : ""}</h1>
            {questions.map((q) => (
              <fieldset key={q.code} className="flex flex-col gap-2 rounded-md bg-canvas p-4">
                <legend className="sr-only">{q.question}</legend>
                <p className="text-body font-medium text-ink">{q.question}</p>
                <div className="flex flex-wrap gap-2">
                  {q.options?.map((o) => (
                    <button key={o} type="button" aria-pressed={answers[q.code] === o} onClick={() => setAnswers({ ...answers, [q.code]: o })} className={answers[q.code] === o ? DARK : CHIP}>{o}</button>
                  ))}
                  <input value={q.options?.includes(answers[q.code]) ? "" : answers[q.code] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.code]: e.target.value })} placeholder="Or type your answer" aria-label={q.question} className={FIELD + " min-w-[14rem]"} />
                </div>
              </fieldset>
            ))}
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={questions.some((q) => !answers[q.code]?.trim())} onClick={() => void go({ kind: "answer", from: runId, answers: questions.map((q) => ({ code: q.code, answer: answers[q.code].trim() })) })} className={DARK}>Search</button>
              <button type="button" onClick={reset} className={CHIP}>Change my request</button>
            </div>
          </div>
        )}

        {stage === "market_count" && (
          <div className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col justify-center gap-4">
            <h1 className="text-h2 text-ink">{out?.marketCount != null ? `About ${out.marketCount} people match` : "This is a wide search"}</h1>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => void go({ kind: "confirm", from: runId })} className={DARK}>Search</button>
              <button type="button" onClick={reset} className={CHIP}>Make it narrower</button>
            </div>
          </div>
        )}

        {(stage === "failed" || stage === "cancelled") && (
          <div className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col justify-center gap-4">
            <h1 className="text-h2 text-ink">{stage === "cancelled" ? "Search cancelled" : "The search did not finish"}</h1>
            <p className="text-small text-ink-2">{run?.message ?? (got && !got.ok ? got.message : stage === "cancelled" ? "Nothing was charged." : "Try again in a minute.")}</p>
            <button type="button" onClick={reset} className={DARK + " self-start"}>Start again</button>
            {earlier.length > 0 && <ul className="flex flex-col divide-y divide-border">{earlier.map(person_)}</ul>}
          </div>
        )}

        {(stage === "done" || stage === "found") && out && (
          <div className="mt-5 flex flex-col gap-3">
            <h1 className="text-h2 text-ink">
              {stage === "found" ? (out.row ? "Found" : "Nobody found with those details") : `${all.length} ${all.length === 1 ? "person" : "people"}${out.form?.role ? ` · ${out.form.role}` : ""}`}
              {out.usd !== undefined && <span className="ml-3 text-caption text-ink-3">about ${out.usd}</span>}
            </h1>
            {out.warnings?.map((w) => <p key={w} className="rounded-sm bg-warn-soft px-4 py-2 text-small text-warn">{w}</p>)}
            {stage === "done" && mustHaves.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-small text-ink-2">
                Must have
                {mustHaves.map((m) => (
                  <button key={m} type="button" onClick={() => void go({ kind: "refine", from: runId, mustHaves: mustHaves.filter((x) => x !== m) })} title="Search again without this" className="rounded-full bg-violet-soft px-3 py-1 text-caption text-violet">
                    {m} ✕
                  </button>
                ))}
              </div>
            )}
            <ul className="flex flex-col divide-y divide-border">{all.map(person_)}</ul>
            {hidden.length > 0 && (
              <details className="rounded-md bg-surface-2 px-4 py-3">
                <summary className="cursor-pointer text-small text-ink-2">{hidden.length} not shown, with why</summary>
                <ul className="mt-2 flex flex-col gap-1 text-caption text-ink-3">
                  {hidden.map((r) => <li key={keyOf(r)}><span className="text-ink-2">{r.name}</span> · {r.hiddenReason}</li>)}
                </ul>
              </details>
            )}
            {stage === "done" && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button type="button" onClick={() => void go({ kind: "more", from: runId }, all)} className={DARK}>Show more</button>
                <span className="ml-3 text-small text-ink-3">Widen</span>
                {WIDEN.map(([f, label]) => (
                  <button key={f} type="button" onClick={() => void go({ kind: "widen", from: runId, field: f })} className={CHIP}>{label}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
