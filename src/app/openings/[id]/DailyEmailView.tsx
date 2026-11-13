"use client";

import { useEffect, useRef, useState } from "react";
import { DUR, EASE, gsap, useGSAP, useSwap } from "@/lib/gsap";
import { USER } from "@/lib/user";
import { useWorkdayGate } from "@/lib/workday";
import { BackButton } from "./PipelineBoard";
import Notch from "./Notch";
import Toast from "./Toast";
import WorkdayBlocked from "./WorkdayBlocked";
import { useOpeningView, type WorkView } from "./view";
import { CandidateTable, CHIP, Cross, EffortTiles, FileIcon, RefereeCalls, SECTION, type Cand, type Effort, type EffortKey, type Ref, type Targets } from "./EmailParts";

// The Midday and End of day emails from a TA to the Director desk, as the TA System
// sends them (eod-email skill; owner's decisions 13 Nov 2026). On one screen:
//   - Midday: several a day (Midday 1, 2 ...). Each starts as a draft kept as it is
//     typed; a sent one is read-only. None can be added once the End of day has gone.
//   - End of day: one a day. Every check done, every CV made, the midday sent first
//     (when the rule is on). A sent one can be corrected with "Edit and resend".
//   - Sent in the last 31 days: read any of them back; send a missed day's End of day.
// Placeholder data: nothing is sent. With the backend, the server re-checks all of it.

type Kind = "midday" | "eod";
type Status = "draft" | "sending" | "sent" | "failed" | "uncertain";

type Mail = {
  id: string;
  kind: Kind;
  /** Midday 1, 2 ... in the day. */
  n: number;
  status: Status;
  day: string;
  by: string;
  sentAt?: number;
  savedAt?: number;
  /** A correction of this sent End of day ("REVISED"). */
  revisedOf?: string;
  reviewed?: boolean;
  rebuild?: boolean;
  /** A missed day's End of day: no checks, no midday rule. */
  missed?: boolean;
  subject: string | null;
  to: string[];
  cc: string[];
  intro: string | null;
  outro: string;
  /** The candidates as sent; a draft reads today's live list instead. */
  rows?: Cand[];
  cols: string[];
  effort: Effort;
  targets: Targets;
  refs: Ref[];
  includeRefs: boolean;
  noCvs: boolean;
};

// Placeholders: the opening, the user's Director Review candidates not sent yet
// (made-up people), the day's referee calls and the work type from the workday.
const OPENING = { client: "PGP Glass", title: "Senior Manager — SAP Business Transformation", set: 1 };
const WORK_TYPE = "100%" as const;
// The TA System's switch (dailyEmailPolicy "midday"): when on, the End of day waits
// for a midday email.
const MIDDAY_REQUIRED = true;
const LEAD = /lead|admin|director|ops/i.test(USER.role);

const cand = (id: string, name: string, age: string, notice: string, company: string, designation: string, current: string, expected: string, years: number, cv: Cand["cv"] = "ready"): Cand => ({
  id, name, age, notice, company, designation, current, expected, cv, extra: {}, edited: [],
  notes: `>Total Experience - ${years}yr\n>Currently at ${company}`,
});
const CANDS: Cand[] = [
  cand("c1", "Kasun Perera", "34", "1 month", "Virtusa", "SAP S/4HANA Lead", "780k", "850k", 11),
  cand("c2", "Ishara Silva", "31", "2 months", "Virtusa", "Solution Architect", "720k", "800k", 8),
  cand("c3", "Nimali Abeysekara", "29", "1 month", "IFS", "SAP MM Lead", "650k", "", 7, "missing"),
];
const REFS: Ref[] = [
  { id: "r1", company: "Hayleys PLC", referral: "Former line manager", phone: "+94 77 000 0000", feedback: "Can share two SAP leads; call after 4 pm.", good: true },
  { id: "r2", company: "Dialog Axiata", referral: "HR partner", phone: "+94 77 000 0000", feedback: "Will pass on the role to their SAP team.", good: true },
  { id: "r3", company: "MAS Holdings", referral: "Project manager", phone: "+94 77 000 0000", feedback: "Did not answer twice.", good: false },
];
const EFFORT: Effort = { lEffort: 24, sets: 1, da: 1, scoop: 1, l: 1, post: 0, addOns: 0, backUp: 0 };

// The TA System's recipients: To the Director desk; Cc the desk and the reply inbox.
const TO = ["joborders@career141.com"];
const CC = ["shamra@career141.com", "asma@career141.com", "opsteam@career141.com", "cv@career141.com", "shortlists@career141.com"];

// Today's Checks an original End of day needs (emailPreflight), each with the view
// that settles it. Sample: done, as in the design.
const CHECKS: { key: string; label: string; view: WorkView; done: boolean; note?: string }[] = [
  { key: "jd", label: "Job description reviewed", view: "jd", done: true },
  { key: "post", label: "LinkedIn job post", view: "linkedin-job", done: true },
  { key: "sugg", label: "Suggestions reviewed", view: "hh-suggestions", done: true },
  { key: "tables", label: "Own Excel Tables profiles", view: "hh-tables", done: true, note: "10 of 10" },
];
// Eye-marked profiles on a 100% day: their next steps do not stop the email.
const EYE = [{ name: "Ruwan Bandara", status: "Move to Director Review" }];

const INTRO_CVS = "Dear Sir,\n\nPlease find the attached Shortlisted CV for the above-mentioned position";
const INTRO_ACTIVITY = "Dear Sir,\n\nPlease find today's activity for the above-mentioned position.";
const OUTRO = `Thank You\nBest Regards,\n\n${USER.name.split(" ")[0]}\nExecutive - Talent Acquisition`;

const fmtDay = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const daysAgo = (n: number) => fmtDay(new Date(Date.now() - n * 864e5));
const TODAY = fmtDay(new Date());
const clock = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();

let seq = 0;
function newMail(kind: Kind, n: number, extra: Partial<Mail> = {}): Mail {
  return {
    id: `m${++seq}`, kind, n, status: "draft", day: TODAY, by: USER.name, subject: null, to: [...TO], cc: [...CC],
    intro: null, outro: OUTRO, cols: [], effort: { ...EFFORT }, targets: {}, refs: REFS.map((r) => ({ ...r })),
    includeRefs: true, noCvs: false, ...extra,
  };
}

// Sample history for the 31-day list: one of each state the TA System has.
const HISTORY: Mail[] = [
  newMail("eod", 1, { status: "sent", day: daysAgo(1), sentAt: Date.now() - 864e5, rows: [CANDS[0]].map((c) => ({ ...c })) }),
  newMail("midday", 1, { status: "sent", day: daysAgo(1), sentAt: Date.now() - 864e5 - 5 * 36e5, rows: [] }),
  newMail("midday", 1, { status: "failed", day: daysAgo(2), rows: [] }),
  newMail("eod", 1, { status: "sent", day: daysAgo(2), sentAt: Date.now() - 2 * 864e5, rows: [] }),
  // Another TA's: a lead sees it; it holds nobody else's sends (28 Oct rule).
  newMail("eod", 1, { status: "uncertain", day: daysAgo(3), by: "Hasini Fernando", sentAt: Date.now() - 3 * 864e5, rows: [] }),
];

/** The TA System's subject: "SET 1 - CLIENT - TITLE - 3 CVs", or "- DAILY ACTIVITY". */
const autoSubject = (n: number) => {
  const job = `${OPENING.client} - ${OPENING.title}`.toUpperCase();
  return n ? `SET ${OPENING.set} - ${job} - ${n} CV${n === 1 ? "" : "s"}` : `${job} - DAILY ACTIVITY`;
};

/** The TA System's rule for the research link: a chatgpt.com share link only. */
function researchProblem(link: string) {
  const v = link.trim();
  if (!v) return "Paste the share link first.";
  let u: URL;
  try {
    u = new URL(v.startsWith("http") ? v : "https://" + v);
  } catch {
    return "That is not a link.";
  }
  if (!["chatgpt.com", "www.chatgpt.com", "chat.openai.com"].includes(u.hostname)) return "Use a chatgpt.com share link.";
  if (!/^\/share\/(e\/)?[\w-]{8,}/.test(u.pathname)) return "Use the Share link, not the chat's own address.";
  return null;
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DailyEmailView() {
  const { go } = useOpeningView();
  const gate = useWorkdayGate();
  const [mails, setMails] = useState<Mail[]>(() => [newMail("eod", 1), ...HISTORY]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<Kind>("midday");
  const [cands, setCands] = useState(CANDS);
  const [link, setLink] = useState("");
  const [linkOk, setLinkOk] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showSent, setShowSent] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [notice, setNotice] = useState<{ bold?: string; rest: string; n: number; warn?: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const say = (rest: string, bold?: string, warn?: boolean) => setNotice((n) => ({ bold, rest, warn, n: (n?.n ?? 0) + 1 }));

  const today = mails.filter((m) => m.day === TODAY && !m.missed && !m.revisedOf);
  const middays = today.filter((m) => m.kind === "midday").sort((a, b) => a.n - b.n);
  const eod = today.find((m) => m.kind === "eod")!;
  const eodSent = eod.status === "sent";
  const middaySent = middays.some((m) => m.status === "sent");
  // Candidates sent in any email today leave the next one (as in the TA System).
  const sentIds = new Set(today.filter((m) => m.status === "sent").flatMap((m) => (m.rows ?? []).map((r) => r.id)));
  const live = cands.filter((c) => !sentIds.has(c.id));

  // What is open: a chosen email, else today's for the tab (the last midday).
  const mail = mails.find((m) => m.id === openId) ?? (tab === "eod" ? eod : middays.at(-1));
  const isEod = mail?.kind === "eod";
  const readOnly = !!mail && mail.status !== "draft";
  const rows = mail ? (mail.rows ?? live) : [];
  const fromHistory = !!mail && (mail.day !== TODAY || !!mail.missed || !!mail.revisedOf);

  const patch = (id: string, p: Partial<Mail> | ((m: Mail) => Partial<Mail>)) =>
    setMails((all) => all.map((m) => (m.id === id ? { ...m, ...(typeof p === "function" ? p(m) : p), savedAt: Date.now() } : m)));
  const edit = (p: Partial<Mail> | ((m: Mail) => Partial<Mail>)) => mail && !readOnly && patch(mail.id, p);

  // Midday <-> End of day, Midday 1 <-> 2, a sent email opened: the app's one switch.
  const body = useRef<HTMLDivElement>(null);
  useSwap(body, mail?.id ?? tab);

  const choose = (k: Kind) => {
    setTab(k);
    setOpenId(null);
    setShowSent(false);
  };
  const addMidday = () => {
    if (eodSent) return;
    const m = newMail("midday", (middays.at(-1)?.n ?? 0) + 1);
    setMails((all) => [m, ...all]);
    setOpenId(m.id);
    setTab("midday");
  };
  const open = (m: Mail) => {
    setOpenId(m.id);
    setTab(m.kind);
    setShowSent(false);
  };

  // What still stops Send, in the TA System's order (begin's guards), as plain words.
  const left: string[] = [];
  if (mail && !readOnly) {
    if (gate) left.push("start the workday");
    if (mail.revisedOf) {
      if (!mail.reviewed) left.push("tick that you reviewed it");
    } else if (!mail.missed) {
      if (!linkOk) left.push("the research link");
      if (isEod) {
        CHECKS.filter((c) => !c.done).forEach((c) => left.push(c.label));
        if (MIDDAY_REQUIRED && !middaySent) left.push("a midday email first");
      }
    }
    // An End of day goes with every CV or not at all; a midday goes without one that is not ready.
    if (isEod) rows.filter((r) => r.cv !== "ready").forEach((r) => left.push(`${r.name}'s CV`));
    // Your own email still sending or not confirmed holds every later send here.
    if (mails.some((m) => m.by === USER.name && m.id !== mail.id && (m.status === "sending" || m.status === "uncertain"))) left.push("a TA Lead to settle an earlier email");
    if (!mail.to.length) left.push("a To address");
  }

  const send = () => {
    if (!mail || left.length) return;
    const snapshot = rows.map((r) => ({ ...r }));
    patch(mail.id, { status: "sending", rows: snapshot });
    // ponytail: a stand-in delay; with the backend this is the durable send
    // (reserve, send through the mailbox, then accepted / failed / could not confirm).
    timers.current.push(
      setTimeout(() => {
        patch(mail.id, { status: "sent", sentAt: Date.now() });
        const what = mail.revisedOf ? "Revised End of day email" : isEod ? "End of day email" : `Midday ${mail.n}`;
        // The End of day closes the workday by itself in the TA System.
        say(` sent to ${mail.to[0]}${isEod && !mail.missed && !mail.revisedOf ? " - your workday is closed" : ""}. Sample only, nothing left the system.`, what);
      }, 1200),
    );
  };

  const reviseOf = (m: Mail) => {
    const r = newMail("eod", 1, {
      revisedOf: m.id,
      day: m.day,
      rows: (m.rows ?? []).map((c) => ({ ...c })),
      subject: "REVISED - " + (m.subject ?? autoSubject(m.rows?.length ?? 0)),
      to: [...m.to],
      cc: [...m.cc],
      intro: m.intro,
      effort: { ...m.effort },
      targets: { ...m.targets },
      cols: [...m.cols],
    });
    setMails((all) => [r, ...all]);
    open(r);
  };
  const missedDay = (day: string) => {
    const m = newMail("eod", 1, { day, missed: true, rows: [{ ...CANDS[1], id: "c9" }] });
    setMails((all) => [m, ...all]);
    open(m);
  };

  const saveLink = () => {
    const p = researchProblem(link);
    setLinkError(p);
    if (!p) setLinkOk(true);
  };

  const editCand = (id: string, key: string, value: string, extra: boolean) => {
    // A draft edits the candidate itself (saved to the record after the email goes);
    // a revised email edits only its own copy.
    const apply = (c: Cand) =>
      c.id !== id ? c : extra ? { ...c, extra: { ...c.extra, [key]: value } } : { ...c, [key]: value, edited: c.edited.includes(key) ? c.edited : [...c.edited, key] };
    if (mail?.rows) edit({ rows: mail.rows.map(apply) });
    else setCands((all) => all.map(apply));
    if (mail) patch(mail.id, {});
  };
  const makeCv = (id: string) => {
    const set = (cv: Cand["cv"]) => (c: Cand) => (c.id === id ? { ...c, cv } : c);
    if (mail?.rows) edit({ rows: mail.rows.map(set("making")) });
    else setCands((all) => all.map(set("making")));
    timers.current.push(
      setTimeout(() => {
        setCands((all) => all.map(set("ready")));
        setMails((all) => all.map((m) => (m.rows ? { ...m, rows: m.rows.map(set("ready")) } : m)));
      }, 1200),
    );
  };

  const files = mail ? attachments(mail, rows, isEod) : [];
  const noCvMidday = !!mail && !isEod && !mail.noCvs ? rows.filter((r) => r.cv !== "ready") : [];

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col px-[max(2.2rem,14px)] pb-[max(1.4rem,12px)] pt-[max(1.6rem,14px)] max-md:pt-11">
      <Notch label={isEod ? "End of day email" : "Midday email"} />

      {/* Back · Midday | End of day · today's middays and + · draft saved · 31 days */}
      <div className="flex flex-wrap items-center gap-x-[max(1rem,10px)] gap-y-2">
        <BackButton />
        <div className="flex rounded-full bg-surface-2 p-[max(0.25rem,3px)] text-small">
          {(
            [
              ["midday", "Midday"],
              ["eod", "End of day"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={tab === k && !fromHistory}
              onClick={() => choose(k)}
              className={
                "rounded-full px-[max(0.9rem,11px)] py-[max(0.4rem,5px)] " +
                (tab === k && !fromHistory ? "bg-surface font-medium text-ink shadow-card" : "text-ink-2 hover:text-ink")
              }
            >
              {label}
              {k === "eod" && eodSent && <span className="ml-1 text-success">✓</span>}
            </button>
          ))}
        </div>
        {tab === "midday" && !fromHistory && (
          <div className="flex flex-wrap items-center gap-1.5">
            {middays.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mail?.id === m.id}
                onClick={() => open(m)}
                className={
                  "flex items-center gap-1 rounded-full border px-[max(0.75rem,9px)] py-[max(0.25rem,3px)] text-caption font-medium " +
                  (mail?.id === m.id ? "border-brand bg-brand-soft text-brand" : "border-border text-ink-2 hover:bg-surface-2")
                }
              >
                Midday {m.n}
                {m.status === "sent" ? <span className="text-success">✓</span> : <span className="text-ink-3">· draft</span>}
              </button>
            ))}
            {middays.length > 0 && (
              <button
                type="button"
                onClick={addMidday}
                disabled={eodSent}
                title={eodSent ? "The End of day email has gone - no more midday emails today" : "Add midday email"}
                aria-label="Add midday email"
                className="flex size-[max(1.75rem,24px)] items-center justify-center rounded-full border border-border text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-40"
              >
                +
              </button>
            )}
          </div>
        )}
        {mail?.status === "draft" && mail.savedAt && (
          <span className="rounded-full bg-surface-2 px-[max(0.75rem,9px)] py-[max(0.25rem,3px)] text-caption text-ink-3">Draft saved {clock(mail.savedAt)}</span>
        )}
        <button type="button" aria-expanded={showSent} onClick={() => setShowSent((s) => !s)} className="ml-auto flex items-center gap-1.5 text-small text-ink hover:text-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[1.1em]" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Sent in the last 31 days
        </button>
      </div>

      <div ref={body} className="mt-[max(1.3rem,10px)] grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,max(31rem,280px))] gap-[max(1.8rem,14px)] max-lg:flex max-lg:flex-col max-lg:overflow-y-auto">
        {/* The email as the desk will read it. */}
        <div className="min-h-0 overflow-y-auto rounded-lg border border-border px-[max(2rem,14px)] py-[max(1.5rem,12px)] [scrollbar-width:thin] max-lg:shrink-0 max-lg:overflow-visible">
          {!mail ? (
            <FirstMidday onAdd={addMidday} closed={eodSent} />
          ) : (
            <>
              {fromHistory && <HistoryBar mail={mail} onBack={() => choose(mail.kind)} />}
              <Recipients label="To" list={mail.to} readOnly={readOnly} onChange={(l) => edit({ to: l })} other={mail.cc} onBad={(m) => say(m, undefined, true)} />
              <Recipients label="Cc" list={mail.cc} readOnly={readOnly} onChange={(l) => edit({ cc: l })} other={mail.to} onBad={(m) => say(m, undefined, true)} />
              <input
                value={mail.subject ?? autoSubject(rows.length)}
                readOnly={readOnly}
                onChange={(e) => edit({ subject: e.target.value })}
                aria-label="Subject"
                className="mt-[max(0.8rem,7px)] block w-full rounded-xs border-b border-border bg-transparent px-1 pb-[max(0.9rem,8px)] pt-1 text-body font-medium text-ink outline-none hover:bg-surface-2 focus:bg-surface-2 read-only:hover:bg-transparent"
              />

              <Para value={mail.intro ?? (rows.length ? INTRO_CVS : INTRO_ACTIVITY)} readOnly={readOnly} onChange={(v) => edit({ intro: v })} label="Greeting" />

              {rows.length > 0 ? (
                <>
                  <h3 className={SECTION}>Candidates for Director Review · {rows.length}</h3>
                  <CandidateTable
                    rows={rows}
                    cols={mail.cols}
                    readOnly={readOnly}
                    noCvs={!isEod && mail.noCvs}
                    onEdit={editCand}
                    onAddCol={(name) => edit((m) => ({ cols: [...m.cols, name] }))}
                    onDropCol={(name) => edit((m) => ({ cols: m.cols.filter((c) => c !== name) }))}
                    onMakeCv={makeCv}
                    onRefused={(why) => say(why, undefined, true)}
                  />
                </>
              ) : (
                <p className="mt-[max(1.2rem,10px)] rounded-sm bg-surface-2 px-[max(1rem,10px)] py-[max(0.8rem,8px)] text-small text-ink-2">
                  {sentIds.size && !fromHistory ? "Today's Director Review candidates went in a midday email." : "No candidates for Director Review."} This email reports the day&rsquo;s activity.
                </p>
              )}

              <h3 className={SECTION}>Today&rsquo;s effort</h3>
              <EffortTiles
                effort={mail.effort}
                targets={mail.targets}
                workType={WORK_TYPE}
                date={mail.day}
                assignee={mail.by}
                readOnly={readOnly}
                onChange={(k: EffortKey, n) => edit((m) => ({ effort: { ...m.effort, [k]: n } }))}
                onTarget={(k: EffortKey, n) => edit((m) => ({ targets: { ...m.targets, [k]: n } }))}
              />

              {/* Referee calls go with the End of day only. */}
              {isEod && !mail.missed && (
                <RefereeCalls
                  refs={mail.refs}
                  include={mail.includeRefs}
                  readOnly={readOnly}
                  onInclude={(v) => edit({ includeRefs: v })}
                  onMove={(id) => edit((m) => ({ refs: m.refs.map((r) => (r.id === id ? { ...r, good: !r.good } : r)) }))}
                />
              )}

              {linkOk && (
                <p className="mt-[max(1.2rem,10px)] text-small text-ink">
                  <b className="font-medium">Research:</b>{" "}
                  <a href={link} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2">
                    View ChatGPT Research
                  </a>
                </p>
              )}
              <Para value={mail.outro} readOnly={readOnly} onChange={(v) => edit({ outro: v })} label="Sign-off" />
            </>
          )}
        </div>

        {/* Before you send: what the TA System checks, the attachments, then Send. */}
        <div className="flex min-h-0 flex-col gap-[max(1rem,10px)] overflow-y-auto [scrollbar-width:none] max-lg:shrink-0 max-lg:overflow-visible">
          {showSent ? (
            <SentList mails={mails} onOpen={open} onMissed={missedDay} onClose={() => setShowSent(false)} />
          ) : mail ? (
            <>
              {gate && !readOnly && <WorkdayBlocked what="send this email" />}
              <StatusCard mail={mail} isEod={isEod} onRevise={() => reviseOf(mail)} onRetry={() => patch(mail.id, { status: "draft" })} />

              {!readOnly && mail.revisedOf && (
                <div className="space-y-2 rounded-lg bg-surface-2 p-[max(1.4rem,12px)] text-small text-ink">
                  <h3 className="text-h3 font-medium">Before you resend</h3>
                  <p className="text-ink-2">Same candidates in the same order; it goes with &ldquo;REVISED&rdquo; in the subject.</p>
                  <Tick checked={!!mail.reviewed} onChange={(v) => edit({ reviewed: v })} label="I reviewed this email" />
                  <Tick checked={!!mail.rebuild} onChange={(v) => edit({ rebuild: v })} label="Make the CV attachments again from the records" />
                </div>
              )}

              {!readOnly && mail.missed && (
                <p className="rounded-lg bg-surface-2 p-[max(1.4rem,12px)] text-small text-ink-2">
                  The End of day for <b className="font-medium text-ink">{mail.day}</b>. A missed day needs no checks and no midday email; up to 7 days back.
                </p>
              )}

              {!readOnly && !mail.revisedOf && !mail.missed && (
                <div className="rounded-lg bg-surface-2 p-[max(1.4rem,12px)]">
                  <h3 className="text-h3 font-medium text-ink">Before you send</h3>
                  <ul className="mt-[max(0.7rem,6px)] space-y-[max(0.55rem,5px)] text-small">
                    {isEod &&
                      CHECKS.map((c) => (
                        <Check key={c.key} done={c.done} label={c.label} note={c.note} onFix={() => go(c.view)} />
                      ))}
                    {isEod && <Check done={rows.length > 0} label="Eligible Director Review candidates" note={rows.length ? `${rows.length} waiting` : "none - activity only"} onFix={() => go("pipeline")} soft />}
                    {isEod && MIDDAY_REQUIRED && <Check done={middaySent} label="Midday email sent" onFix={() => choose("midday")} />}
                    <Check done={linkOk} label="ChatGPT research link" />
                  </ul>
                  {!linkOk ? (
                    <>
                      <div className="mt-[max(0.8rem,8px)] flex items-center gap-2 rounded-full border-[1.5px] border-warn/60 bg-surface py-[max(0.3rem,4px)] pl-[max(1rem,10px)] pr-[max(0.3rem,4px)] focus-within:ring-2 focus-within:ring-warn/30">
                        <input
                          value={link}
                          onChange={(e) => {
                            setLink(e.target.value);
                            setLinkError(null);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && saveLink()}
                          placeholder="Paste your chatgpt.com/share link"
                          aria-label="ChatGPT research link"
                          className="min-w-0 flex-1 bg-transparent text-small text-ink outline-none placeholder:text-ink-3"
                        />
                        <button type="button" onClick={saveLink} className="rounded-full bg-ink px-[max(1rem,12px)] py-[max(0.45rem,5px)] text-small font-medium text-white hover:bg-marker">
                          Add
                        </button>
                      </div>
                      {linkError && <p className="mt-1.5 pl-2 text-caption text-danger">{linkError}</p>}
                    </>
                  ) : (
                    <p className="mt-[max(0.7rem,6px)] flex items-center gap-2 text-caption text-ink-3">
                      <span className="truncate">{link.trim()}</span>
                      <button type="button" onClick={() => setLinkOk(false)} className="shrink-0 text-brand hover:underline">
                        Change
                      </button>
                    </p>
                  )}
                  {/* Eye-marked profiles: next steps to take, never a reason to hold the email. */}
                  {isEod && WORK_TYPE === "100%" && EYE.length > 0 && (
                    <p className="mt-[max(0.8rem,8px)] border-t border-border pt-[max(0.7rem,6px)] text-caption text-ink-2">
                      Eye-marked: {EYE.map((e) => `${e.name} - ${e.status.toLowerCase()}`).join(", ")}.{" "}
                      <button type="button" onClick={() => go("hh-tables")} className="font-medium text-brand hover:underline">
                        Open Excel Tables
                      </button>
                    </p>
                  )}
                </div>
              )}

              {/* The attachments: the line, and the files under it on a click. */}
              <div className="rounded-lg border border-border">
                <button type="button" aria-expanded={showFiles} onClick={() => setShowFiles((s) => !s)} className="flex w-full items-center gap-[max(0.7rem,7px)] px-[max(1.4rem,12px)] py-[max(1rem,10px)] text-left text-small text-ink">
                  <ClipIcon />
                  <span className="min-w-0 flex-1">{attachLine(files, rows, isEod, mail.noCvs)}</span>
                  {files.length > 0 && <Chevron open={showFiles} />}
                </button>
                {showFiles && files.length > 0 && (
                  <ul className="space-y-1 border-t border-border px-[max(1.4rem,12px)] py-[max(0.8rem,8px)] text-small text-ink-2">
                    {files.map((f) => (
                      <li key={f} className="flex items-center gap-2 truncate">
                        <FileIcon /> {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {noCvMidday.length > 0 && !readOnly && (
                <p className="-mt-1 px-1 text-caption text-ink-2">
                  {noCvMidday.map((r) => r.name).join(", ")}: CV not made yet - this midday email goes without it.
                </p>
              )}
              {!isEod && !readOnly && rows.length > 0 && <Tick checked={mail.noCvs} onChange={(v) => edit({ noCvs: v })} label="Send without CV attachments" />}

              {!readOnly ? (
                <button
                  type="button"
                  onClick={send}
                  disabled={left.length > 0}
                  title={left.length ? "Still to do: " + left.join(", ") : undefined}
                  className="flex h-[max(3.6rem,44px)] items-center justify-center gap-2 rounded-full bg-brand text-body font-medium text-white hover:bg-brand-strong disabled:bg-surface-3 disabled:text-ink-3"
                >
                  <SendIcon />
                  {left.length ? `Send — ${left.length} check${left.length === 1 ? "" : "s"} left` : mail.revisedOf ? "Send the revised email" : "Send"}
                </button>
              ) : null}
              {!readOnly && left.length > 0 && <p className="-mt-1 px-1 text-caption text-ink-3">Still to do: {left.join(", ")}.</p>}
            </>
          ) : null}
        </div>
      </div>

      {notice && <Toast key={notice.n} bold={notice.bold} rest={notice.rest} warn={notice.warn} />}
    </div>
  );
}

/* ---------- pieces of the screen ---------- */

/** No midday email yet today: the one way to start one. */
function FirstMidday({ onAdd, closed }: { onAdd: () => void; closed: boolean }) {
  return (
    <div className="flex h-full min-h-[max(14rem,180px)] flex-col items-center justify-center gap-2 text-center">
      <p className="text-h3 font-medium text-ink">{closed ? "Midday emails are closed for today" : "No midday email yet today"}</p>
      <p className="max-w-[28rem] text-small text-ink-2">
        {closed
          ? "The End of day email has gone."
          : "A midday email sends the Director the candidates ready so far. You can send more than one in a day; each is kept as a draft while you write it."}
      </p>
      {!closed && (
        <button type="button" onClick={onAdd} className="mt-2 flex h-[max(2.6rem,34px)] items-center rounded-full bg-brand px-[max(1.4rem,14px)] text-small font-medium text-white hover:bg-brand-strong">
          Add midday email
        </button>
      )}
    </div>
  );
}

/** Reading an email from another day, a correction or a missed day: says which, and the way back. */
function HistoryBar({ mail, onBack }: { mail: Mail; onBack: () => void }) {
  const what = mail.revisedOf ? "Correction" : mail.missed ? "Missed day" : mail.kind === "eod" ? "End of day" : `Midday ${mail.n}`;
  return (
    <div className="mb-[max(0.8rem,7px)] flex flex-wrap items-center gap-2 rounded-sm bg-surface-2 px-[max(1rem,10px)] py-[max(0.5rem,5px)] text-small">
      <b className="font-medium text-ink">{what}</b>
      <span className="text-ink-2">· {mail.day}</span>
      {mail.by !== USER.name && <span className="text-ink-2">· {mail.by}</span>}
      <button type="button" onClick={onBack} className="ml-auto text-brand hover:underline">
        Back to today&rsquo;s email
      </button>
    </div>
  );
}

/** Where a sent (or stuck) email stands, in the TA System's words. */
function StatusCard({ mail, isEod, onRevise, onRetry }: { mail: Mail; isEod: boolean; onRevise: () => void; onRetry: () => void }) {
  if (mail.status === "draft") return null;
  if (mail.status === "sending")
    return (
      <div className="flex items-center gap-2 rounded-lg bg-surface-2 p-[max(1.4rem,12px)] text-small text-ink">
        <span className="size-4 animate-spin rounded-full border-2 border-brand border-t-transparent" /> Sending&hellip;
      </div>
    );
  if (mail.status === "failed")
    return (
      <div className="rounded-lg bg-danger-soft p-[max(1.4rem,12px)] text-small">
        <p className="font-medium text-danger">Could not be sent</p>
        <p className="mt-1 text-ink-2">Nothing went to the desk. Try again when you are ready.</p>
        <button type="button" onClick={onRetry} className="mt-2 font-medium text-brand hover:underline">
          Try again
        </button>
      </div>
    );
  if (mail.status === "uncertain")
    return (
      <div className="rounded-lg bg-warn-soft p-[max(1.4rem,12px)] text-small">
        <p className="font-medium text-warn">Could not confirm it was sent</p>
        <p className="mt-1 text-ink-2">
          {LEAD
            ? "Check the sending mailbox, then record what you found."
            : "A TA Lead checks the sending mailbox and records it. Nothing more can be sent on this opening until then."}
        </p>
      </div>
    );
  const own = mail.by === USER.name;
  return (
    <div className="rounded-lg bg-success-soft p-[max(1.4rem,12px)] text-small">
      <p className="font-medium text-success">
        Sent {mail.sentAt ? clock(mail.sentAt) : ""} · {mail.day}
      </p>
      <p className="mt-1 text-ink-2">To {mail.to[0]}{mail.cc.length ? `, ${mail.cc.length} on Cc` : ""}. Read only, kept 31 days.</p>
      {isEod && own && !mail.revisedOf && (
        <button type="button" onClick={onRevise} className="mt-2 font-medium text-brand hover:underline">
          Edit and resend
        </button>
      )}
    </div>
  );
}

/** Sent in the last 31 days: own emails for a TA, everyone's for a lead. */
function SentList({ mails, onOpen, onMissed, onClose }: { mails: Mail[]; onOpen: (m: Mail) => void; onMissed: (day: string) => void; onClose: () => void }) {
  const list = mails.filter((m) => m.status !== "draft" && (LEAD || m.by === USER.name));
  const eodDays = new Set(mails.filter((m) => m.kind === "eod" && m.status !== "draft" && m.by === USER.name).map((m) => m.day));
  const missed = [1, 2, 3, 4, 5, 6, 7].map(daysAgo).filter((d) => !eodDays.has(d));
  const [day, setDay] = useState(missed[0] ?? "");
  const chip: Record<Status, string> = {
    draft: "",
    sending: "bg-surface-2 text-ink-2",
    sent: "bg-success-soft text-success",
    failed: "bg-danger-soft text-danger",
    uncertain: "bg-warn-soft text-warn",
  };
  const word: Record<Status, string> = { draft: "", sending: "Sending", sent: "Sent", failed: "Not sent", uncertain: "Not confirmed" };
  return (
    <div className="rounded-lg bg-surface-2 p-[max(1.4rem,12px)]">
      <div className="flex items-center">
        <h3 className="text-h3 font-medium text-ink">Sent in the last 31 days</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="ml-auto text-ink-3 hover:text-ink">
          <Cross />
        </button>
      </div>
      <ul className="mt-[max(0.8rem,8px)] space-y-2">
        {list.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => onOpen(m)} className="flex w-full items-center gap-2 rounded-sm bg-surface px-[max(1rem,10px)] py-[max(0.7rem,7px)] text-left text-small hover:shadow-card">
              <span className="min-w-0 flex-1">
                <span className="block text-ink">
                  {m.revisedOf ? "Correction" : m.kind === "eod" ? "End of day" : `Midday ${m.n}`} · {m.day}
                </span>
                <span className="block text-caption text-ink-3">
                  {(m.rows?.length ?? 0) ? `${m.rows!.length} CV${m.rows!.length === 1 ? "" : "s"}` : "Activity only"}
                  {LEAD && ` · ${m.by}`}
                </span>
              </span>
              <span className={CHIP + " " + chip[m.status]}>{word[m.status]}</span>
            </button>
          </li>
        ))}
      </ul>
      {missed.length > 0 && (
        <div className="mt-[max(1rem,10px)] border-t border-border pt-[max(0.9rem,8px)] text-small">
          <p className="text-ink-2">Missed an End of day? Send it for an earlier day.</p>
          <div className="mt-2 flex items-center gap-2">
            <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Which day" className="rounded-full border border-border bg-surface px-3 py-1.5 text-small text-ink outline-none focus:ring-2 focus:ring-brand/30">
              {missed.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <button type="button" onClick={() => onMissed(day)} className="rounded-full bg-ink px-[max(1rem,12px)] py-1.5 text-small font-medium text-white hover:bg-marker">
              Write it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function attachments(mail: Mail, rows: Cand[], isEod: boolean) {
  const cvs = mail.noCvs && !isEod ? [] : rows.filter((r) => r.cv === "ready").map((r) => `${r.name} - Career141.pdf`);
  // The Excel workbook goes with the End of day only.
  return isEod && rows.length ? [...cvs, `${OPENING.client} - ${OPENING.title}.xlsx`] : cvs;
}

function attachLine(files: string[], rows: Cand[], isEod: boolean, noCvs: boolean) {
  if (!isEod && noCvs) return "No attachments";
  const cvs = files.filter((f) => f.endsWith(".pdf")).length;
  const parts = [cvs ? `${cvs} prepared CV${cvs === 1 ? "" : "s"}` : "", files.some((f) => f.endsWith(".xlsx")) ? "Excel workbook" : ""].filter(Boolean);
  const toMake = rows.filter((r) => r.cv !== "ready").length;
  const head = parts.length ? parts.join(" + ") + " attached" : "Nothing attached";
  return toMake ? `${head} · ${toMake} CV${toMake === 1 ? "" : "s"} to make` : head;
}

/** A To or Cc line: chips with a cross, and "+ add" that turns into a box. Nobody
 *  is on both lines (the TA System's rule). */
function Recipients({ label, list, other, readOnly, onChange, onBad }: { label: string; list: string[]; other: string[]; readOnly: boolean; onChange: (l: string[]) => void; onBad: (m: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const add = () => {
    const v = text.trim().toLowerCase();
    setAdding(false);
    setText("");
    if (!v) return;
    if (!EMAIL.test(v)) return onBad(`"${v}" is not an email address.`);
    if (other.includes(v)) return onBad(`${v} is already on the other line.`);
    if (!list.includes(v)) onChange([...list, v]);
  };
  return (
    <div className="flex flex-wrap items-center gap-[max(0.5rem,5px)] py-[max(0.4rem,4px)] text-small">
      <span className="w-[max(3rem,30px)] text-ink-3">{label}</span>
      {list.map((who) => (
        <span key={who} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-[max(0.3rem,4px)] pl-[max(0.8rem,9px)] pr-[max(0.5rem,6px)] text-ink">
          {who}
          {!readOnly && (
            <button type="button" aria-label={`Take ${who} off`} onClick={() => onChange(list.filter((x) => x !== who))} className="text-ink-3 hover:text-ink">
              <Cross />
            </button>
          )}
        </span>
      ))}
      {!readOnly &&
        (adding ? (
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") {
                setAdding(false);
                setText("");
              }
            }}
            placeholder="name@career141.com"
            aria-label={`Add to ${label}`}
            className="min-w-[12rem] rounded-full border border-border px-[max(0.8rem,9px)] py-[max(0.25rem,3px)] outline-none focus:ring-2 focus:ring-brand/30"
          />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="text-ink-3 hover:text-ink">
            + add
          </button>
        ))}
    </div>
  );
}

/** The greeting or the sign-off: reads as the email's own text, edits in place. */
function Para({ value, onChange, label, readOnly }: { value: string; onChange: (v: string) => void; label: string; readOnly: boolean }) {
  const el = useRef<HTMLTextAreaElement>(null);
  // Grows with the text, so it reads as part of the email rather than a box.
  useEffect(() => {
    const t = el.current;
    if (t) {
      t.style.height = "auto";
      t.style.height = t.scrollHeight + "px";
    }
  }, [value]);
  return (
    <textarea
      ref={el}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      rows={2}
      className="mt-[max(1rem,8px)] block w-full resize-none overflow-hidden rounded-sm bg-transparent px-1 py-0.5 text-body text-ink outline-none hover:bg-surface-2 focus:bg-surface-2 read-only:hover:bg-transparent"
    />
  );
}

/** One check: a green tick when done; when not, the amber ring and the way to settle it. */
function Check({ done, label, note, onFix, soft }: { done: boolean; label: string; note?: string; onFix?: () => void; soft?: boolean }) {
  const el = useRef<HTMLLIElement>(null);
  // A check pops only at the moment it turns green - never when the panel is drawn
  // or switched in (the one switch does that).
  const was = useRef(done);
  useGSAP(
    () => {
      if (done && !was.current) gsap.from(el.current!.querySelector("span"), { scale: 0.6, duration: DUR.base, ease: EASE.pop });
      was.current = done;
    },
    { dependencies: [done], scope: el, revertOnUpdate: false },
  );
  return (
    <li ref={el} className={"flex items-center gap-[max(0.6rem,7px)] " + (done || soft ? "text-ink" : "text-warn")}>
      <span className={"flex size-[max(1.4rem,17px)] shrink-0 items-center justify-center rounded-full " + (done ? "bg-brand text-white" : "border-[1.5px] border-warn")}>
        {done && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3/5" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1">
        {label}
        {note && <span className="text-ink-3"> · {note}</span>}
      </span>
      {!done && onFix && (
        <button type="button" onClick={onFix} className="shrink-0 text-caption font-medium text-brand hover:underline">
          Open
        </button>
      )}
    </li>
  );
}

function Tick({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 px-1 text-small text-ink-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-brand" />
      {label}
    </label>
  );
}

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const ClipIcon = () => (
  <svg {...svg} className="size-[1.2em] shrink-0 text-ink-3">
    <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" />
  </svg>
);
const SendIcon = () => (
  <svg {...svg} className="size-[1.1em]">
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
  </svg>
);
const Chevron = ({ open }: { open: boolean }) => (
  <svg {...svg} className={"size-[1em] shrink-0 text-ink-3 transition-transform " + (open ? "rotate-180" : "")}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
