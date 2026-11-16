"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/role";
import { useWorkdayGate } from "@/lib/workday";
import { useSwap } from "@/lib/gsap";
import CvPages from "../openings/[id]/CvPages";
import MoveForm, { type Ask } from "../openings/[id]/MoveForm";
import Toast from "../openings/[id]/Toast";
import { BackButton } from "../openings/[id]/PipelineBoard";
import { STAGES, checkMove, movesFrom } from "../openings/[id]/pipelineRules";
import {
  CALL_OUTCOME,
  CALL_WHICH,
  CALLS,
  CANDIDATE,
  COLLEAGUES,
  HISTORY,
  INTERVIEWS,
  MAX_FOLLOW_UPS,
  MESSAGES,
  NOTES,
  OPENINGS,
  REFEREES,
  stillNeeded,
  type Call,
  type Msg,
  type Note,
} from "./data";

// The candidate page (the TA System's candidate/[appId], read 16 Nov 2026): who they
// are, what to do with them on this opening, and seven tabs - CV, Prepared CV,
// History, Call log, Chat (the follow-up), Reference, Company reference. The panels
// on the left follow the stage, as in the old page: details for Director Review
// while in follow-up, review notes at Director Review, interviews and the closing
// from the client's shortlist on. Moves go through the board's own rules
// (checkMove) and forms (MoveForm); another TA's candidate is read only, and a TA
// acts only after Start workday. Placeholder data: nothing is saved or sent.

const TABS = ["CV", "Prepared CV", "History", "Call log", "Chat", "Reference", "Company reference"] as const;
type Tab = (typeof TABS)[number];
const PER_STAGE = 6; // the board's sample: six cards a stage

const noSub = () => () => {};

const CARD = "rounded-lg bg-surface p-[max(1.5rem,14px)] shadow-card";
const H2 = "text-[max(1rem,13.5px)] font-medium text-ink";
const BTN = "inline-flex h-[max(2.5rem,32px)] items-center justify-center rounded-full px-[max(1.1rem,12px)] text-[max(0.875rem,12px)] font-medium transition-colors disabled:opacity-40";
const DARK = BTN + " bg-ink text-white hover:bg-black";
const LINE = BTN + " border border-border-strong text-ink hover:bg-surface-2";
const FIELD = "w-full rounded-sm border border-border bg-white px-3 py-2 text-[max(0.875rem,12px)] text-ink outline-none focus:border-brand";
const SMALL = "text-[max(0.8125rem,11.5px)] text-ink-3";

export default function CandidateView() {
  // Which candidate is in the address; the page starts fresh for each one.
  const params = useSyncExternalStore(noSub, () => location.search || "?", () => "");
  if (!params) return <main className="flex-1" />;
  return <Candidate key={params} q={new URLSearchParams(params)} />;
}

function Candidate({ q }: { q: URLSearchParams }) {
  const router = useRouter();
  const me = useMe();
  const gate = useWorkdayGate();
  const lockedBy = q.get("locked") || undefined;
  const [stage, setStage] = useState(q.get("stage") ?? "TA Follow-Up");
  const [n, setN] = useState(Number(q.get("n") ?? 0) || 0);
  const [name, setName] = useState(q.get("name") || CANDIDATE.name);
  const title = q.get("title") || CANDIDATE.title;
  const company = q.get("company") || CANDIDATE.company;
  const cv = q.get("cv") || CANDIDATE.cv;
  const [owned, setOwned] = useState(q.get("owned") !== "0");
  const [marks, setMarks] = useState({ addOn: false, backup: false });

  // Read only: another TA's candidate (the collision lock). Not started: a TA acts
  // only after Start workday (the same gate as the board).
  const locked = lockedBy ? `Shortlisted by ${lockedBy} — you cannot contact` : "";
  const blocked = locked || gate;

  const [details, setDetails] = useState(CANDIDATE.details);
  const missing = stillNeeded(details, !!cv).map((m) => (m === "CV" ? "CV" : m === "expected salary" ? "Salary" : "Notice Period"));

  const [tab, setTab] = useState<Tab>("CV");
  const pane = useRef<HTMLDivElement>(null);
  useSwap(pane, tab);
  const [toast, setToast] = useState<{ key: number; bold: string; rest: string; warn?: boolean } | null>(null);
  const seq = useRef(0);
  const say = (bold: string, rest: string, warn = false) => setToast({ key: ++seq.current, bold, rest, warn });

  // A move: refused in words, asked for what it needs, or done at once.
  const askBox = useRef<HTMLDivElement>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const card = { lockedBy, missing, owned };
  const move = (to: string) => {
    if (blocked) return say("", blocked, true);
    const v = checkMove(card, stage, to, me.role);
    if (!v.ok) return say("", v.why, true);
    if (v.needs) return setAsk({ needs: v.needs, name, from: stage, to: STAGES.find((s) => s.name === to)! });
    setStage(to);
    say(name, ` moved to ${to}.`);
  };
  const [menu, setMenu] = useState(false);

  const step = (d: number) => {
    const next = (n + d + PER_STAGE) % PER_STAGE;
    const u = new URL(location.href);
    u.searchParams.set("n", String(next));
    history.replaceState(history.state, "", u);
    setN(next);
  };
  const back = () => (history.length > 1 ? router.back() : router.push("/openings/demo"));
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (ask || (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape") back();
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  });

  const inFollowUp = stage === "TA Follow-Up" || stage === "Ai Follow-Up";
  const clientSide = ["Client Shortlist", "Interview", "Offer", "Placed"].includes(stage);
  const owner = lockedBy ?? (owned ? me.first : "");

  return (
    <main className="flex min-h-0 flex-1 flex-col px-11 pb-[max(2rem,14px)] max-md:overflow-y-auto max-md:px-3">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 py-[clamp(12px,2.6dvh,30px)] max-md:pt-12">
        <BackButton onClick={back} label="Back to the list" />
        <p className="min-w-0 flex-1 truncate text-[max(0.8125rem,11.5px)] font-medium uppercase tracking-[0.04em] text-ink-3">
          From PGP Glass - Senior Manager - Manufacturing Business Transformation - {owner || "Unclaimed"}
        </p>
        <div className="flex items-center gap-1 text-[max(0.875rem,12px)] text-ink-2">
          <button type="button" onClick={() => step(-1)} aria-label="Previous candidate in this stage" className="flex size-8 items-center justify-center rounded-full hover:bg-surface-2">
            ‹
          </button>
          <span className="tabular-nums">
            {n + 1} of {PER_STAGE}
          </span>
          <button type="button" onClick={() => step(1)} aria-label="Next candidate in this stage" className="flex size-8 items-center justify-center rounded-full hover:bg-surface-2">
            ›
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,26rem)_1fr] gap-[max(1.25rem,10px)] max-lg:grid-cols-1 max-md:flex-none">
        {/* Who they are and what to do with them; panels follow the stage. */}
        <div className="flex min-h-0 flex-col gap-[max(1.25rem,10px)] overflow-y-auto pb-2 [scrollbar-width:thin] max-lg:overflow-visible">
          <section className={CARD}>
            <div className="flex items-start gap-3">
              <span className="flex size-[max(3.25rem,40px)] shrink-0 items-center justify-center rounded-full bg-sticky-yellow text-[max(1rem,13px)] font-semibold text-ink">
                {name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <NameLine name={name} setName={setName} canEdit={!locked} />
                <p className="mt-0.5 text-[max(0.875rem,12px)] text-ink-2">{title}</p>
                <p className={SMALL}>
                  {company} · {CANDIDATE.school} · {CANDIDATE.location}
                </p>
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  <Chip>{CANDIDATE.channel}</Chip>
                  {marks.addOn && <Chip>Add-on</Chip>}
                  {marks.backup && <Chip>Backup</Chip>}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3">
              <Contact kind="email" initial={CANDIDATE.email} canEdit={!locked} />
              <Contact kind="phone" initial={CANDIDATE.phone} canEdit={!locked} />
              <a href={CANDIDATE.linkedin} target="_blank" rel="noreferrer" className="text-[max(0.875rem,12px)] font-medium text-brand hover:underline">
                Public profile ↗
              </a>
            </div>

            <div className="mt-4 border-t border-border pt-3">
              {blocked ? (
                <p className="rounded-sm bg-warn-soft px-3 py-2 text-[max(0.8125rem,11.5px)] text-warn">{locked || `${gate} Start it on Today to act on this candidate.`}</p>
              ) : !owned ? (
                <button type="button" onClick={() => (setOwned(true), setStage("TA Follow-Up"), say(name, " saved to your pipeline - TA Follow-Up."))} className={DARK}>
                  Save to pipeline
                </button>
              ) : (
                <div className="relative flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} className={DARK}>
                    Change stage ▾
                  </button>
                  <button type="button" aria-pressed={marks.addOn} onClick={() => setMarks((m) => ({ ...m, addOn: !m.addOn }))} className={LINE}>
                    Add-on{marks.addOn ? " ✓" : ""}
                  </button>
                  <button type="button" aria-pressed={marks.backup} onClick={() => setMarks((m) => ({ ...m, backup: !m.backup }))} className={LINE}>
                    Backup{marks.backup ? " ✓" : ""}
                  </button>
                  {menu && (
                    <ul className="absolute left-0 top-full z-20 mt-2 w-[max(18rem,240px)] rounded-md bg-surface p-1.5 shadow-float">
                      {movesFrom(card, stage, me.role).map(({ name: to, verdict }) => (
                        <li key={to}>
                          <button
                            type="button"
                            disabled={!verdict.ok}
                            onClick={() => (setMenu(false), move(to))}
                            className="flex w-full flex-col rounded-sm px-3 py-2 text-left hover:bg-surface-2 disabled:hover:bg-transparent"
                          >
                            <span className={"text-[max(0.875rem,12px)] " + (verdict.ok ? "text-ink" : "text-ink-3")}>
                              {to === "Dropped out" && stage === "Offer" ? "Declined" : to}
                              {verdict.ok && (verdict.needs === "reason" ? "…" : "")}
                            </span>
                            {!verdict.ok && <span className="text-[max(0.75rem,11px)] text-ink-3">{verdict.why}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <p className={"mt-2 " + SMALL}>
                In {stage} · set {CANDIDATE.set}
              </p>
            </div>
          </section>

          {inFollowUp && <ReviewDetails details={details} setDetails={setDetails} hasCv={!!cv} readOnly={!!blocked} onSaved={() => say("", "Details saved.")} />}
          {(stage === "Director Review" || NOTES.length > 0) && <ReviewNotes canAdd={stage === "Director Review" && !locked} me={me.first} role={me.title} />}
          {(clientSide || INTERVIEWS.length > 0) && (
            <Panel title="Interviews">
              <p className={SMALL}>No interviews booked yet.</p>
              {(stage === "Client Shortlist" || stage === "Interview") && !blocked && (
                <button type="button" onClick={() => move("Interview")} className={LINE + " mt-3"}>
                  + Book an interview
                </button>
              )}
            </Panel>
          )}
          {clientSide && (
            <Panel title="Closing">
              {stage === "Placed" ? (
                <p className={SMALL}>Placed. The agreed package and join date are on the placement.</p>
              ) : stage === "Offer" ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!!blocked} onClick={() => move("Placed")} className={DARK}>
                    Place
                  </button>
                  <button type="button" disabled={!!blocked} onClick={() => move("Dropped out")} className={LINE}>
                    Declined…
                  </button>
                </div>
              ) : (
                <>
                  <p className={SMALL}>{details.expected ? `They asked for ${details.expected}.` : "No expected salary on file for them."}</p>
                  <button type="button" disabled={!!blocked} onClick={() => move("Offer")} className={DARK + " mt-3"}>
                    Make an offer
                  </button>
                </>
              )}
            </Panel>
          )}
          <Panel title={`In ${OPENINGS.length} openings`}>
            <ul className="flex flex-col gap-2">
              {OPENINGS.map((o) => (
                <li key={o.title} className="text-[max(0.875rem,12px)]">
                  <Link href="/openings/demo" className="text-ink hover:text-brand">
                    {o.title}
                  </Link>
                  <span className={"block " + SMALL}>
                    {o.client} · {o.current ? stage : o.stage}
                    {o.current && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-brand">Current</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* The seven tabs. */}
        <section className={CARD + " flex min-h-0 flex-col max-lg:min-h-[70dvh]"}>
          <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto border-b border-border pb-2 [scrollbar-width:none]">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={"shrink-0 rounded-full px-[max(0.9rem,10px)] py-1.5 text-[max(0.875rem,12px)] transition-colors " + (tab === t ? "bg-ink text-white" : "text-ink-2 hover:bg-surface-2")}
              >
                {t}
                {count(t)}
              </button>
            ))}
          </div>
          <div ref={pane} className="min-h-0 flex-1 overflow-y-auto pt-4 [scrollbar-width:thin]">
            {tab === "CV" && <CvTab cv={cv} goRef={() => setTab("Reference")} />}
            {tab === "Prepared CV" && <PreparedTab cv={cv} />}
            {tab === "History" && <HistoryTab />}
            {tab === "Call log" && <CallsTab readOnly={!!blocked} me={me.first} stage={stage} onSaved={() => say("", "Call saved.")} />}
            {tab === "Chat" && <ChatTab readOnly={!!blocked} details={details} name={name.split(" ")[0]} say={say} />}
            {tab === "Reference" && <ReferenceTab />}
            {tab === "Company reference" && <CompanyTab company={company} />}
          </div>
        </section>
      </div>

      {ask && (
        <MoveForm
          ref={askBox}
          ask={ask}
          onCancel={() => setAsk(null)}
          onSave={(note) => {
            setStage(ask.to.name);
            setAsk(null);
            say(name, ` moved to ${ask.to.name}${note ? ` - ${note}` : ""}.`);
          }}
        />
      )}
      {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} warn={toast.warn} />}
    </main>
  );
}

const count = (t: Tab) => {
  const c = t === "History" ? HISTORY.length : t === "Call log" ? CALLS.length : t === "Chat" ? MESSAGES.length : t === "Reference" ? REFEREES.length : 0;
  return c ? ` (${c})` : "";
};

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[max(0.75rem,11px)] font-medium text-ink-2">{children}</span>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={CARD}>
      <h2 className={H2 + " mb-3"}>{title}</h2>
      {children}
    </section>
  );
}

/** The name; "Add their name" only when the CV gave none (the old rule). */
function NameLine({ name, setName, canEdit }: { name: string; setName: (v: string) => void; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState("");
  const empty = !name.trim() || name === "Unnamed candidate";
  if (editing)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!v.trim()) return;
          setName(v.trim());
          setEditing(false);
        }}
        className="flex gap-2"
      >
        <input autoFocus required maxLength={120} value={v} onChange={(e) => setV(e.target.value)} placeholder="Full name, as on the CV" className={FIELD} />
        <button className={DARK}>Save</button>
      </form>
    );
  return (
    <h1 className="text-[max(1.375rem,17px)] leading-tight text-ink">
      {empty ? "Unnamed candidate" : name}
      {empty && canEdit && (
        <button type="button" onClick={() => (setV(""), setEditing(true))} className="ml-2 text-[max(0.875rem,12px)] font-medium text-brand hover:underline">
          Add their name
        </button>
      )}
    </h1>
  );
}

/** An email or phone row: edit in place, or clear it after asking. */
function Contact({ kind, initial, canEdit }: { kind: "email" | "phone"; initial: string; canEdit: boolean }) {
  const [value, setValue] = useState(initial);
  const [mode, setMode] = useState<"" | "edit" | "clear">("");
  const [draft, setDraft] = useState("");
  const none = kind === "email" ? "No email on file" : "No number on file";
  if (mode === "edit")
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setValue(draft.trim());
          setMode("");
        }}
        className="flex gap-2"
      >
        <input autoFocus type={kind === "email" ? "email" : "tel"} value={draft} onChange={(e) => setDraft(e.target.value)} className={FIELD} aria-label={kind === "email" ? "Email" : "Phone"} />
        <button className={DARK}>Save</button>
        <button type="button" onClick={() => setMode("")} className={SMALL}>
          Cancel
        </button>
      </form>
    );
  return (
    <p className="flex flex-wrap items-center gap-x-3 text-[max(0.875rem,12px)]">
      <span className={value ? "text-ink" : "text-ink-3"}>{value || none}</span>
      {canEdit && mode === "" && (
        <>
          <button type="button" onClick={() => (setDraft(value), setMode("edit"))} className={SMALL + " hover:text-ink"} aria-label={`${value ? "Edit" : "Add"} ${kind}`}>
            {value ? "Edit" : "+ Add"}
          </button>
          {value && (
            <button type="button" onClick={() => setMode("clear")} className={SMALL + " hover:text-danger"}>
              Remove
            </button>
          )}
        </>
      )}
      {mode === "clear" && (
        <span className="text-ink-2">
          Clear this {kind}?{" "}
          <button type="button" onClick={() => (setValue(""), setMode(""))} className="font-medium text-danger">
            Clear
          </button>{" "}
          <button type="button" onClick={() => setMode("")} className={SMALL}>
            Cancel
          </button>
        </span>
      )}
    </p>
  );
}

/** "Details for Director review": what the follow-up collects, typed by hand too. */
function ReviewDetails({
  details,
  setDetails,
  hasCv,
  readOnly,
  onSaved,
}: {
  details: typeof CANDIDATE.details;
  setDetails: (d: typeof CANDIDATE.details) => void;
  hasCv: boolean;
  readOnly: boolean;
  onSaved: () => void;
}) {
  const [d, setD] = useState(details);
  const left = stillNeeded(d, hasCv);
  const field = (key: keyof typeof d, label: string, ph = "") => (
    <label className="flex flex-col gap-1">
      <span className="text-[max(0.75rem,11px)] font-medium text-ink-2">{label}</span>
      <input value={d[key]} disabled={readOnly} placeholder={ph} onChange={(e) => setD({ ...d, [key]: e.target.value })} className={FIELD} />
    </label>
  );
  return (
    <Panel title="Details for Director review">
      <p className={"mb-3 text-[max(0.8125rem,11.5px)] " + (left.length ? "text-warn" : "text-brand")}>
        {left.length ? `Still needed: ${left.join(", ")}` : "All details in — ready for Director review"}
      </p>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        {field("current", "Current salary", "e.g. LKR 400,000")}
        {field("expected", "Expected salary", "e.g. LKR 550,000")}
        {field("notice", "Notice period", "e.g. 1 month")}
        {field("designation", "Current designation")}
        <div className="col-span-2 max-sm:col-span-1">{field("company", "Current company")}</div>
      </div>
      {!readOnly && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => (setDetails(d), onSaved())} className={DARK}>
            Save details
          </button>
          <label className={LINE + " cursor-pointer"}>
            {hasCv ? "Replace CV" : "Upload CV"}
            <input type="file" accept=".pdf,.doc,.docx" className="sr-only" onChange={(e) => e.target.files?.[0] && e.target.files[0].size > 10e6 && alert("Over 10 MB. Choose a smaller file.")} />
          </label>
          <span className={SMALL}>PDF or Word, up to 10 MB</span>
        </div>
      )}
    </Panel>
  );
}

/** Director review notes: newest first; added at Director Review only. */
function ReviewNotes({ canAdd, me, role }: { canAdd: boolean; me: string; role: string }) {
  const [notes, setNotes] = useState<Note[]>(NOTES);
  const [v, setV] = useState("");
  return (
    <Panel title="Director review notes">
      {notes.length ? (
        <ul className="flex flex-col gap-3">
          {notes.map((x, i) => (
            <li key={i} className="text-[max(0.875rem,12px)]">
              <span className={SMALL}>
                {x.role} · {x.by} · {x.at}
              </span>
              <p className="text-ink">{x.text}</p>
              {x.by === me && (
                <button type="button" onClick={() => setNotes(notes.filter((_, j) => j !== i))} className={SMALL + " hover:text-danger"}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={SMALL}>No notes yet.</p>
      )}
      {canAdd && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!v.trim()) return;
            setNotes([{ by: me, role, at: "Just now", text: v.trim() }, ...notes]);
            setV("");
          }}
          className="mt-3 flex flex-col gap-2"
        >
          <textarea value={v} onChange={(e) => setV(e.target.value)} maxLength={2000} rows={2} placeholder="A note for the Director" className={FIELD + " resize-none [field-sizing:content]"} />
          <button disabled={!v.trim()} className={DARK + " self-start"}>
            Add note
          </button>
        </form>
      )}
    </Panel>
  );
}

function CvTab({ cv, goRef }: { cv: string; goRef: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <a href={cv} target="_blank" rel="noreferrer" className={LINE}>
          Open in a new tab
        </a>
        <a href={cv} download className={LINE}>
          Download
        </a>
      </div>
      <div className="rounded-md border border-border">
        <CvPages src={cv} fit="width" />
      </div>
      <p className={SMALL}>
        {REFEREES.length} named on the CV ·{" "}
        <button type="button" onClick={goRef} className="font-medium text-brand hover:underline">
          Details and verify on the Reference tab →
        </button>
      </p>
    </div>
  );
}

function PreparedTab({ cv }: { cv: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className={SMALL}>The CV as the Director and the client receive it. Moving the green box comes with the backend.</p>
      <div className="flex gap-2">
        <a href={cv} target="_blank" rel="noreferrer" className={LINE}>
          Open
        </a>
        <a href={cv} download className={LINE}>
          Download prepared CV
        </a>
      </div>
      <div className="relative rounded-md border border-border">
        <CvPages src={cv} fit="width" />
        <span aria-hidden="true" className="absolute left-[6%] top-[3%] h-[7%] w-[40%] rounded-xs border-2 border-brand bg-brand/10" />
      </div>
    </div>
  );
}

function Search({ value, set, placeholder }: { value: string; set: (v: string) => void; placeholder: string }) {
  return <input value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={FIELD + " mb-3 max-w-sm"} />;
}

function HistoryTab() {
  const [f, setF] = useState("");
  const rows = HISTORY.filter((h) => h.text.toLowerCase().includes(f.toLowerCase()));
  return (
    <>
      <Search value={f} set={setF} placeholder="Search the history" />
      {!HISTORY.length ? (
        <p className={SMALL}>Nothing recorded yet — the log starts at the first stage change.</p>
      ) : !rows.length ? (
        <p className={SMALL}>Nothing in the log matches that search.</p>
      ) : (
        <ol className="flex flex-col gap-3 border-l-2 border-border pl-4">
          {rows.map((h) => (
            <li key={h.at + h.text}>
              <span className={SMALL}>{h.at}</span>
              <p className="text-[max(0.9375rem,12.5px)] text-ink">{h.text}</p>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function CallsTab({ readOnly, me, stage, onSaved }: { readOnly: boolean; me: string; stage: string; onSaved: () => void }) {
  const [calls, setCalls] = useState<Call[]>(CALLS);
  const [which, setWhich] = useState(stage === "Interview" ? CALL_WHICH[0] : stage === "Offer" ? CALL_WHICH[2] : CALL_WHICH[3]);
  const [outcome, setOutcome] = useState(CALL_OUTCOME[0]);
  const [said, setSaid] = useState("");
  const [aura, setAura] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      {!readOnly && (
        <div className="rounded-md bg-surface-2 p-4">
          <h3 className={H2}>Screening call with Aura</h3>
          <p className={SMALL}>Aura asks their current salary, expected salary and notice period, then this job&rsquo;s own questions.</p>
          <button type="button" onClick={() => setAura(true)} className={DARK + " mt-3"}>
            Start call
          </button>
          {aura && <p className="mt-2 text-[max(0.8125rem,11.5px)] text-warn">Aura&rsquo;s calls are not connected to this preview yet. Log the call by hand below.</p>}
        </div>
      )}
      {!readOnly && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!said.trim()) return;
            setCalls([{ at: "Just now", which, outcome, said: said.trim(), by: me }, ...calls]);
            setSaid("");
            onSaved();
          }}
          className="flex flex-col gap-3"
        >
          <h3 className={H2}>Log a call</h3>
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <label className="flex flex-col gap-1">
              <span className="text-[max(0.75rem,11px)] font-medium text-ink-2">Which call</span>
              <select value={which} onChange={(e) => setWhich(e.target.value)} className={FIELD}>
                {CALL_WHICH.map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[max(0.75rem,11px)] font-medium text-ink-2">Outcome</span>
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={FIELD}>
                {CALL_OUTCOME.map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            </label>
          </div>
          <textarea required value={said} onChange={(e) => setSaid(e.target.value)} rows={2} placeholder="What they said" aria-label="What they said" className={FIELD + " resize-none [field-sizing:content]"} />
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={!said.trim()} className={DARK}>
              Save call
            </button>
            <span className={SMALL}>A pre-interview call marked &ldquo;reached&rdquo; clears the lead&rsquo;s reminder.</span>
          </div>
        </form>
      )}
      {calls.length ? (
        <ul className="flex flex-col gap-3">
          {calls.map((c, i) => (
            <li key={i} className="rounded-md border border-border p-3">
              <span className={SMALL}>
                {c.at} · {c.which} · {c.outcome} · {c.by}
              </span>
              <p className="text-[max(0.9375rem,12.5px)] text-ink">{c.said}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className={SMALL}>No calls logged yet.</p>
      )}
    </div>
  );
}

/** The follow-up on this candidate: what is collected, how many reminders went,
 *  Take over / Hand back, Send the next, Stop; the messages under it. */
function ChatTab({ readOnly, details, name, say }: { readOnly: boolean; details: typeof CANDIDATE.details; name: string; say: (b: string, r: string, w?: boolean) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>(MESSAGES);
  const [sent, setSent] = useState(1);
  const [mine, setMine] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [v, setV] = useState("");
  const got = [
    ["Current salary", !!details.current],
    ["Expected salary", !!details.expected],
    ["Notice period", !!details.notice],
  ] as const;
  const all = got.every(([, ok]) => ok);
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-sm bg-warn-soft px-3 py-2 text-[max(0.8125rem,11.5px)] text-warn">Test mode. Nothing reaches the candidate from this preview.</p>
      <div className="rounded-md bg-surface-2 p-4">
        <h3 className={H2}>
          Follow-up · {sent} of {MAX_FOLLOW_UPS} sent
        </h3>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[max(0.875rem,12px)]">
          {got.map(([label, ok]) => (
            <li key={label} className={ok ? "text-brand" : "text-ink-3"}>
              {ok ? "✓" : "○"} {label}
            </li>
          ))}
        </ul>
        <p className={"mt-2 " + SMALL}>
          {stopped ? "Follow-up stopped." : mine ? `You have taken over - the assistant stays quiet with ${name}.` : "The assistant is following up automatically."}
        </p>
        {!readOnly && (
          <div className="mt-3 flex flex-wrap gap-2">
            {!stopped && (
              <button type="button" onClick={() => setMine(!mine)} className={LINE}>
                {mine ? "Hand back to the assistant" : "Take over the conversation"}
              </button>
            )}
            {all ? (
              <span className="self-center text-[max(0.8125rem,11.5px)] text-brand">Everything collected - send them to Director Review from Change stage.</span>
            ) : sent >= MAX_FOLLOW_UPS ? (
              <span className="self-center text-[max(0.8125rem,11.5px)] text-ink-2">All {MAX_FOLLOW_UPS} follow-ups sent. Call them, or mark them as dropped out.</span>
            ) : (
              !stopped && (
                <button type="button" onClick={() => (setSent(sent + 1), say("", `Follow-up ${sent + 1} of ${MAX_FOLLOW_UPS} queued (test mode).`))} className={DARK}>
                  Send follow-up {sent + 1} of {MAX_FOLLOW_UPS}
                </button>
              )
            )}
            {!stopped && (
              <button type="button" onClick={() => (setStopped(true), setMine(false))} className={BTN + " text-ink-3 hover:text-danger"}>
                Stop follow-up
              </button>
            )}
          </div>
        )}
      </div>
      {msgs.length ? (
        <ul className="flex flex-col gap-2">
          {msgs.map((m, i) => (
            <li key={i} className={"max-w-[80%] rounded-lg px-3 py-2 text-[max(0.9375rem,12.5px)] " + (m.from === "them" ? "self-start bg-surface-2 text-ink" : "self-end bg-brand-soft text-ink")}>
              <span className={"block " + SMALL}>
                {m.from === "them" ? name : m.from === "assistant" ? "Assistant" : "You"} · {m.at}
              </span>
              {m.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className={SMALL}>No messages yet.</p>
      )}
      {mine && !readOnly && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!v.trim()) return;
            setMsgs([...msgs, { at: "now", from: "us", text: v.trim() }]);
            setV("");
          }}
          className="flex gap-2"
        >
          <input value={v} onChange={(e) => setV(e.target.value)} placeholder={`Write to ${name} on WhatsApp`} aria-label="Message" className={FIELD} />
          <button disabled={!v.trim()} className={DARK}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}

function ReferenceTab() {
  if (!REFEREES.length) return <p className={SMALL}>No referees currently on record for this candidate.</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
      {REFEREES.map((r) => (
        <li key={r.name} className="rounded-md border border-border p-4">
          <p className="text-[max(0.9375rem,12.5px)] font-medium text-ink">{r.name}</p>
          <p className={SMALL}>
            {r.title ?? "Role not on the CV"} at {r.company} (from the CV) · {r.relation}
          </p>
          <p className="mt-2 text-[max(0.875rem,12px)] text-ink">{r.phone ?? <span className="text-ink-3">No number on file</span>}</p>
          {r.email && <p className="text-[max(0.875rem,12px)] text-ink">{r.email}</p>}
          <a
            href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${r.name} ${r.company}`)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-[max(0.875rem,12px)] font-medium text-brand hover:underline"
          >
            Verify on LinkedIn ↗
          </a>
        </li>
      ))}
    </ul>
  );
}

function CompanyTab({ company }: { company: string }) {
  const [phones, setPhones] = useState(false);
  const [more, setMore] = useState(false);
  const all = phones ? COLLEAGUES.filter((c) => c.phone) : COLLEAGUES;
  const rows = more ? all : all.slice(0, 6);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className={H2}>Present company · {company}</h3>
        <span className={SMALL}>
          {COLLEAGUES.length} people in database · {COLLEAGUES.filter((c) => c.phone).length} with phone
        </span>
        <button type="button" onClick={() => setPhones(!phones)} className={LINE + " ml-auto"}>
          {phones ? "Show all" : "Phones only"}
        </button>
      </div>
      {!rows.length ? (
        <p className={SMALL}>{phones ? "No colleagues with verified phone numbers found." : `No other contacts from ${company} found in the database.`}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((c) => (
            <li key={c.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[max(0.875rem,12px)]">
              <span className="font-medium text-ink">{c.name}</span>
              <Chip>{c.badge}</Chip>
              <span className="text-ink-3">{c.title ?? "Position not listed"}</span>
              <span className="ml-auto">
                {c.phone ? (
                  <a href={`tel:${c.phone}`} className="text-brand hover:underline">
                    {c.phone}
                  </a>
                ) : c.email ? (
                  <a href={`mailto:${c.email}`} className="text-brand hover:underline">
                    {c.email}
                  </a>
                ) : (
                  <span className="text-ink-3">No direct contact</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {all.length > 6 && (
        <button type="button" onClick={() => setMore(!more)} className={LINE + " mt-3"}>
          {more ? "Show less" : `View more (+${all.length - 6})`}
        </button>
      )}
    </div>
  );
}
