"use client";

import { useJdApproved, setJdApproved, getJd, setJd, jdText, type Section } from "./jdState";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSwap } from "@/lib/gsap";
import { BackButton } from "./PipelineBoard";
import Toast from "./Toast";
import { useLiftMenu } from "./liftMenu";
import { useMe } from "@/lib/role";
import { candidateCall, door, jobFromAddress, useDoorQuery, useLive, type Answer } from "@/lib/backend";
import { matchChips, parseJd, type Requirements } from "./jdLive";
import { ViewSkeleton } from "@/app/Skeleton";

// The Job Description view (shane123-tech's branch, Figma): the draft on the left; on
// the right the approval bar, a chat to change the draft, and what candidates are
// matched on. Reviewed and merged 14 Nov 2026 onto DESIGN.md (tokens, Poppins, the one
// switch) and the old JD tab (openings skill §9): only an assigned TA or a lead writes
// it; approving says what it starts; it stays editable after approval; a chat turn is
// 2000 characters at most and a failed turn leaves the JD as it was; earlier versions
// come back from History. Placeholder data - nothing reads or writes the backend yet.

/** Placeholder for `opening.manage` or being assigned to this opening. */
const CAN_WRITE: boolean = true;
const ASK_MAX = 2000;

const MATCH = ["10+ years", "SAP S/4HANA", "Led a rollout", "FI/CO · MM · PP", "Manufacturing", "Colombo · hybrid", "~LKR 1.2M"];
const VERSIONS = [
  { n: 3, when: "Today 10:12", what: "Hybrid, 3 days in office; shorter intro" },
  { n: 2, when: "Yesterday 16:40", what: "Team size and plant count added" },
  { n: 1, when: "12 Nov 09:05", what: "First draft from the brief" },
];

type Turn = { me: string; aura: string; failed?: boolean };

const CHIP = "rounded-full px-3 py-1 text-caption font-medium";
/** A field that looks like the text it edits, with a quiet outline. */
const EDIT = "w-full resize-none rounded-sm border border-border bg-surface px-2 py-1.5 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

// Signed in (20 Nov 2026): the same screen as the preview - the draft in the middle, the
// approval bar, the chat and "what we match candidates on" on the right (the live page used
// to show only the text) - with the opening's own JD. Approve and Re-read run the old
// actions on the old server (ta-system #30), so approving still starts the details reading,
// matching, Research and Suggestions. Editing, versions and the chat that rewrites the JD
// are not behind a backend yet, so they are not offered / say so instead of pretending.
export default function JobDescriptionView() {
  return useLive() ? <LiveJd /> : <JdScreen />;
}

type LiveJdData = { job: string; title: string; markdown: string | null; approved: boolean; chips: string[] };

function LiveJd() {
  const job = jobFromAddress();
  const got = useDoorQuery(door.summary, job ? { openingId: job } : "skip") as
    | Answer<{
        opening: {
          title: string | null;
          locations?: string[];
          requirements?: Requirements | null;
          jd: { markdown: string | null; status: string | null; approvedAt: number | null };
        };
      }>
    | undefined;
  if (!job) return <p className="px-6 pt-14 text-small text-ink-3">Open an opening from the Openings page to see its job description.</p>;
  if (!got) return <ViewSkeleton />;
  if (!got.ok) return <p className="px-6 pt-14 text-small text-danger">{got.message}</p>;
  const o = got.opening;
  return (
    <JdScreen
      key={job}
      live={{ job, title: o.title ?? "", markdown: o.jd.markdown, approved: o.jd.status === "approved", chips: matchChips(o.requirements, o.locations) }}
    />
  );
}

function JdScreen({ live }: { live?: LiveJdData }) {
  // Shared with LinkedIn Job, Snippets and Database CVs (jdState).
  const sampleApproved = useJdApproved();
  const approved = live ? live.approved : sampleApproved;
  const setApproved = setJdApproved;
  const parsed = live ? parseJd(live.markdown, live.title) : null;
  const canEdit = CAN_WRITE && !live;
  const me = useMe();
  // Who approved and when - kept in this view for the visit (sample; the backend keeps it).
  const [approvedBy, setApprovedBy] = useState("");
  const [version, setVersion] = useState(3);
  // The JD's text lives in state so it can be edited here; edits save themselves.
  // ponytail: kept for the visit only; the backend keeps the saved text.
  const [title, setTitle] = useState(parsed ? parsed.title : getJd().title);
  const [metaText, setMetaText] = useState(parsed ? parsed.metaText : getJd().metaText);
  const [sections, setSections] = useState(parsed ? parsed.sections : getJd().sections);
  const [editing, setEditing] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const first = useRef(true);
  // Other views (Database search) send the JD as it stands now.
  useEffect(() => setJd({ title, metaText, sections }), [title, metaText, sections]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => setSavedAt("just now"), 700);
    return () => clearTimeout(t);
  }, [title, metaText, sections]);
  const meta = metaText.split(",").map((m) => m.trim()).filter(Boolean);
  const setSection = (i: number, patch: Partial<Section>) => setSections((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const [turns, setTurns] = useState<Turn[]>(live ? [] : [
    {
      me: "Mention it’s hybrid, 3 days in office. Shorter intro.",
      aura: "Done — version 3 says “hybrid, 3 days a week at the Colombo office” and the intro is two lines shorter. Version 2 is in history if you want it back.",
    },
  ]);
  const [ask, setAsk] = useState("");
  const [reading, setReading] = useState(false);
  const [readAt, setReadAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ bold?: string; rest: string; n: number } | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const talk = useRef<HTMLDivElement>(null);
  const doc = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useSwap(bar, approved);
  useSwap(talk, turns.length);
  // A restored version switches in like any changed content.
  useSwap(doc, version);

  const approve = async () => {
    if (live) {
      if (busy || !live.markdown?.trim()) return;
      setBusy(true);
      const r = await candidateCall({ do: "approveJd", openingId: live.job, jdMarkdown: live.markdown });
      setBusy(false);
      setToast(r.ok ? { bold: "JD approved", rest: " - " + r.message, n: Date.now() } : { rest: r.message, n: Date.now() });
      return;
    }
    setApproved(true);
    setApprovedBy(`Approved by ${me.name} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`);
    setToast({
      bold: "JD approved",
      rest: " - job details re-read, waiting CVs scored, Research and Suggestions started, LinkedIn posts can go live",
      n: Date.now(),
    });
  };
  const send = () => {
    const t = ask.trim();
    if (!t) return;
    setAsk("");
    // ponytail: no model yet - the turn is kept and AURA says so; a real failed turn
    // also leaves the JD as it was.
    setTurns((all) => [...all, { me: t, aura: "I could not change it - this screen is not connected yet. The JD is as it was.", failed: true }]);
  };
  const copy = async () => {
    const text = jdText({ title, metaText, sections });
    try {
      await navigator.clipboard.writeText(text);
      setToast({ bold: "Copied", rest: " - the JD text is on your clipboard", n: Date.now() });
    } catch {
      setToast({ rest: "Could not copy - your browser blocked it", n: Date.now() });
    }
  };
  const reread = async () => {
    if (reading || !approved) return;
    if (live) {
      setReading(true);
      const r = await candidateCall({ do: "rereadJd", openingId: live.job });
      setReading(false);
      setReadAt(r.ok ? "Read just now" : "");
      setToast(r.ok ? { bold: "Job details re-read", rest: " - " + r.message, n: Date.now() } : { rest: r.message, n: Date.now() });
      return;
    }
    setReading(true);
    timer.current = setTimeout(() => {
      setReading(false);
      setReadAt("Read just now");
    }, 1500);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-[max(1.5rem,14px)] pb-[max(2.19rem,12px)] pt-[max(2.6rem,24px)] max-md:overflow-y-auto max-md:pt-11">
      <div className="flex min-h-0 flex-1 items-start max-md:flex-col max-md:gap-y-6 md:gap-x-[max(1.875rem,14px)]">
        <BackButton />

        {/* The document: scrolls inside itself when the text is longer. Set like a page
            (owner's Figma comment, 17 Nov 2026: "this section fully design change"): a
            header with the state, the title and a quiet meta line, then every section
            under the same quiet heading, at a readable line length. */}
        <article className="flex min-w-0 flex-col rounded-lg border border-border bg-surface px-[max(3rem,18px)] py-[max(2.25rem,18px)] shadow-card max-md:w-full md:mt-[max(1.03rem,0px)] md:flex-1 md:self-stretch md:overflow-y-auto">
          <header className="flex flex-col gap-[max(0.75rem,8px)] border-b border-border pb-[max(1.5rem,14px)]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className={CHIP + (approved ? " bg-success-soft text-success" : " bg-warn-soft text-warn")}>
                {live ? (approved ? "Approved" : "Not approved yet") : approved ? `Approved · version ${version}` : `Draft · version ${version}`}
              </span>
              <span className="truncate text-caption text-ink-3" title={approved ? approvedBy : undefined}>
                {live ? "" : approved ? approvedBy || "Approved" : `Saved ${savedAt || (VERSIONS.find((v) => v.n === version)?.when ?? "")}`}
              </span>
              {!live && <History
                version={version}
                onRestore={(n) => {
                  setVersion(n);
                  setToast({ bold: `Version ${n}`, rest: approved ? " is back. It stays approved." : " is back.", n: Date.now() });
                }}
              />}
              <button
                type="button"
                onClick={copy}
                aria-label="Copy the JD text"
                title="Copy the JD text"
                className="flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-[1.1rem]" aria-hidden="true">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V6a2 2 0 0 1 2-2h9" />
                </svg>
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    if (editing) {
                      // Leaving edit mode drops empty lines.
                      setSections((all) => all.map((x) => (x.list ? { ...x, list: x.list.filter((l) => l.trim()) } : x)));
                    }
                    setEditing((v) => !v);
                  }}
                  aria-pressed={editing}
                  title={editing ? "Done editing - changes are already saved" : "Edit the job description"}
                  className={"flex items-center gap-1.5 rounded-full px-3 py-1 text-small font-medium " + (editing ? "bg-brand text-white hover:bg-brand-strong" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-[1rem]" aria-hidden="true">
                    {editing ? <path d="m5 12.5 4.5 4.5L19 7.5" /> : <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />}
                  </svg>
                  {editing ? "Done" : "Edit"}
                </button>
              )}
            </div>
            {editing ? (
              <>
                <textarea value={title} onChange={(e) => setTitle(e.target.value)} rows={1} aria-label="Job title" className={EDIT + " field-sizing-content text-h1 font-light text-ink"} />
                <input value={metaText} onChange={(e) => setMetaText(e.target.value)} aria-label="Client, place, type, reports to - separated by commas" className={EDIT + " text-small text-ink-2"} />
              </>
            ) : (
              <>
                <h2 className="text-h1 font-light text-ink">{title}</h2>
                <ul aria-label="About this job" className="flex flex-wrap gap-2">
                  {meta.map((m) => (
                    <li key={m} className={CHIP + " bg-surface-2 text-ink-2"}>
                      {m}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </header>

          <div ref={doc} className="flex max-w-[70ch] flex-col gap-[max(1.5rem,14px)] pt-[max(1.5rem,14px)]">
            {!sections.length && <p className="text-body text-ink-3">No job description yet.</p>}
            {sections.map((s, i) => (
              <section key={i} className="flex flex-col gap-2">
                {editing ? (
                  <input value={s.h} onChange={(e) => setSection(i, { h: e.target.value })} aria-label="Section heading" className={EDIT + " text-caption font-medium uppercase text-ink-3"} />
                ) : (
                  <h3 className="text-caption font-medium uppercase text-ink-3">{s.h}</h3>
                )}
                {s.p !== undefined &&
                  (editing ? (
                    <textarea value={s.p} onChange={(e) => setSection(i, { p: e.target.value })} aria-label={s.h} className={EDIT + " field-sizing-content text-body text-ink-2"} />
                  ) : (
                    <p className="whitespace-pre-line text-body text-ink-2">{s.p}</p>
                  ))}
                {s.list &&
                  (editing ? (
                    <textarea
                      value={s.list.join("\n")}
                      onChange={(e) => setSection(i, { list: e.target.value.split("\n") })}
                      aria-label={`${s.h} - one point per line`}
                      className={EDIT + " field-sizing-content text-body text-ink-2"}
                    />
                  ) : (
                    <ul className="flex flex-col gap-1.5 text-body text-ink-2">
                      {s.list.map((l, k) => (
                        <li key={k} className="flex gap-3">
                          <span aria-hidden="true" className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-ink-3" />
                          {l}
                        </li>
                      ))}
                    </ul>
                  ))}
              </section>
            ))}
          </div>
        </article>

        <aside className="flex min-w-0 flex-col gap-[max(1.125rem,10px)] max-md:w-full md:mt-[max(0.7rem,0px)] md:flex-[0_1_40.5rem]">
          {/* Approval */}
          <div
            ref={bar}
            className={"flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-md py-3.5 pl-5 pr-3.5 " + (approved ? "bg-success-soft" : "bg-warn-soft")}
          >
            <div className="min-w-0 flex-1">
              <p className={"text-body font-medium " + (approved ? "text-success" : "text-warn")}>
                {approved ? "JD approved" : CAN_WRITE ? "Waiting for your approval" : "Waiting for approval"}
              </p>
              <p className="text-small text-ink-2">
                {approved
                  ? `${approvedBy || "Approved"}. Research, Suggestions and matching are running. You can still change it here.`
                  : "Approving starts Research, Suggestions and matching, and lets LinkedIn posts go live."}
              </p>
            </div>
            {!approved && CAN_WRITE && (
              <button
                type="button"
                onClick={() => void approve()}
                disabled={busy || (!!live && !live.markdown?.trim())}
                className="flex items-center gap-2 whitespace-nowrap rounded-full bg-brand disabled:opacity-50 py-[max(0.625rem,7px)] pl-[max(1.25rem,14px)] pr-[max(1.375rem,15px)] text-small font-medium text-white transition-colors hover:bg-brand-strong"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                  <path d="M13.33 4 6 11.33 2.67 8" />
                </svg>
                {busy ? "Approving…" : "Approve JD"}
              </button>
            )}
          </div>

          {/* Chat */}
          <div className="flex min-h-0 flex-col gap-3.5 rounded-lg bg-canvas px-5 pb-4 pt-[max(1.125rem,12px)]">
            <div className="flex items-center gap-2.5">
              <Image src="/aura-mark.png" alt="" width={28} height={28} className="size-[max(1.75rem,22px)] rounded-full" />
              <p className="text-body font-medium text-ink">Change it by chatting</p>
            </div>
            <div ref={talk} className="flex max-h-[max(16rem,180px)] flex-col gap-3 overflow-y-auto">
              {!turns.length && <p className="text-small text-ink-3">Tell AURA what to change - for example “Mention it’s hybrid, 3 days in the office.”</p>}
              {turns.map((t, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <p className="self-end rounded-md bg-surface px-4 py-2.5 text-small text-ink">{t.me}</p>
                  <p className={"max-w-[37.5rem] text-small " + (t.failed ? "text-warn" : "text-ink-2")}>{t.aura}</p>
                </div>
              ))}
            </div>
            {CAN_WRITE ? (
              <form
                className="flex items-center gap-2.5 rounded-full bg-surface py-1.5 pl-4 pr-1.5 focus-within:ring-2 focus-within:ring-brand/30"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <input
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  maxLength={ASK_MAX}
                  aria-label="Ask for a change"
                  placeholder="Ask for a change…"
                  className="min-w-0 flex-1 bg-transparent text-small text-ink outline-none placeholder:text-ink-3"
                />
                {ask.length > ASK_MAX - 200 && (
                  <span className="text-caption text-ink-3">
                    {ask.length}/{ASK_MAX}
                  </span>
                )}
                <button
                  type="submit"
                  disabled={!ask.trim()}
                  aria-label="Send"
                  className="flex size-[max(2.125rem,28px)] shrink-0 items-center justify-center rounded-full bg-brand text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-1/2" aria-hidden="true">
                    <path d="M5 12l7-7 7 7M12 19V5" />
                  </svg>
                </button>
              </form>
            ) : (
              <p className="text-small text-ink-3">Only an assigned TA can write this JD.</p>
            )}
          </div>

          {/* What candidates are matched on */}
          <div className="flex flex-col gap-3 rounded-lg border border-border px-5 pb-[max(1.125rem,12px)] pt-4">
            <div className="flex items-center">
              <p className="text-body font-medium text-ink">What we match candidates on</p>
              <button
                type="button"
                onClick={() => void reread()}
                disabled={reading || !CAN_WRITE || !approved}
                title={approved ? "Read the job details from the JD again" : "Approve the JD first"}
                className="ml-auto flex items-center gap-1.5 text-small text-ink-3 hover:text-ink disabled:hover:text-ink-3"
              >
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={"size-3.5 " + (reading ? "animate-spin" : "")} aria-hidden="true">
                  <path d="M1.75 7a5.25 5.25 0 0 1 9.18-3.65l1.32 1.32M12.25 1.75v2.92H9.33" />
                </svg>
                {!approved ? "Approve the JD first" : reading ? "Reading…" : readAt || "Re-read"}
              </button>
            </div>
            <ul className="flex flex-wrap gap-2">
              {(live ? live.chips : MATCH).map((m) => (
                <li key={m} className={CHIP + " bg-surface-2 text-ink-2"}>
                  {m}
                </li>
              ))}
              {live && !live.chips.length && <li className="text-small text-ink-3">Nothing read from the JD yet.</li>}
            </ul>
          </div>
        </aside>
      </div>
      {toast && <Toast key={toast.n} bold={toast.bold} rest={toast.rest} />}
    </div>
  );
}

/** Earlier versions, each one back with a click (the old JD history). */
function History({ version, onRestore }: { version: number; onRestore: (n: number) => void }) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  return (
    <div ref={root} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Earlier versions of this JD"
        className="flex items-center gap-1.5 rounded-full px-3 py-1 text-small text-ink-2 hover:bg-surface-2 hover:text-ink aria-expanded:bg-surface-2 aria-expanded:text-ink"
      >
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[max(0.95rem,13px)]" aria-hidden="true">
          <path d="M2.25 9a6.75 6.75 0 1 0 1.7-4.5L2.25 6M2.25 2.25V6H6" />
        </svg>
        History
      </button>
      {shown && (
        <div ref={panel} role="menu" className="absolute right-0 top-full z-30 mt-2 flex w-[max(20rem,260px)] flex-col rounded-md bg-surface p-1.5 shadow-float ring-1 ring-border/60">
          <p className="px-3 pb-1 pt-1.5 text-caption font-medium uppercase text-ink-3">Versions</p>
          {VERSIONS.map((v) => (
            <button
              key={v.n}
              type="button"
              role="menuitem"
              disabled={v.n === version}
              onClick={() => {
                onRestore(v.n);
                setOpen(false);
              }}
              className="flex flex-col items-start gap-0.5 rounded-sm px-3 py-2 text-left hover:bg-surface-2 disabled:hover:bg-transparent"
            >
              <span className="text-small font-medium text-ink">
                Version {v.n} · {v.when}
                {v.n === version ? " · showing" : ""}
              </span>
              <span className="text-caption text-ink-3">{v.n === version ? v.what : `${v.what} — restore`}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
