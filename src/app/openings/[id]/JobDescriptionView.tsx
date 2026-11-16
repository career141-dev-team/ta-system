"use client";

import { useJdApproved, setJdApproved } from "./jdState";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSwap } from "@/lib/gsap";
import { BackButton } from "./PipelineBoard";
import Toast from "./Toast";
import { useLiftMenu } from "./liftMenu";
import { useMe } from "@/lib/role";

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

type Section = { h: string; p?: string; lines?: string[]; list?: string[] };
const SECTIONS: Section[] = [
  {
    h: "About the role",
    p: "PGP Glass is moving its six plants to SAP S/4HANA. You will lead the programme end to end — from blueprint to hyper-care — and make sure the business, not just IT, comes out stronger.",
  },
  {
    h: "Responsibilities",
    lines: [
      "Own the S/4HANA roadmap, budget and partner relationships",
      "Lead a team of 12 across finance, supply chain and manufacturing streams",
      "Run cut-over and data migration for six plants",
      "Report progress to the executive committee every month",
    ],
  },
  {
    h: "Requirements",
    lines: [
      "10+ years in SAP, with at least one manufacturing rollout led end to end",
      "Strong FI/CO, MM and PP knowledge",
      "Experience managing system integrators",
    ],
  },
  {
    h: "Qualifications",
    list: ["A degree in engineering, IT or accounting.", "SAP certification is an advantage."],
  },
  {
    h: "Skills",
    list: [
      "Programme planning, budgeting and vendor management.",
      "Clear written and spoken English; Sinhala or Tamil an advantage.",
      "Leading cross-functional teams through change.",
    ],
  },
  { h: "Package", p: "Around LKR 1.2M a month, plus performance bonus and medical cover" },
];
const MATCH = ["10+ years", "SAP S/4HANA", "Led a rollout", "FI/CO · MM · PP", "Manufacturing", "Colombo · hybrid", "~LKR 1.2M"];
const VERSIONS = [
  { n: 3, when: "Today 10:12", what: "Hybrid, 3 days in office; shorter intro" },
  { n: 2, when: "Yesterday 16:40", what: "Team size and plant count added" },
  { n: 1, when: "12 Nov 09:05", what: "First draft from the brief" },
];

type Turn = { me: string; aura: string; failed?: boolean };

const CHIP = "rounded-full px-3 py-1 text-caption font-medium";

export default function JobDescriptionView() {
  // Shared with LinkedIn Job, Snippets and Database CVs (jdState).
  const approved = useJdApproved();
  const setApproved = setJdApproved;
  const me = useMe();
  // Who approved and when - kept in this view for the visit (sample; the backend keeps it).
  const [approvedBy, setApprovedBy] = useState("");
  const [version, setVersion] = useState(3);
  const [turns, setTurns] = useState<Turn[]>([
    {
      me: "Mention it’s hybrid, 3 days in office. Shorter intro.",
      aura: "Done — version 3 says “hybrid, 3 days a week at the Colombo office” and the intro is two lines shorter. Version 2 is in history if you want it back.",
    },
  ]);
  const [ask, setAsk] = useState("");
  const [reading, setReading] = useState(false);
  const [readAt, setReadAt] = useState("");
  const [toast, setToast] = useState<{ bold?: string; rest: string; n: number } | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const talk = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useSwap(bar, approved);
  useSwap(talk, turns.length);

  const approve = () => {
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
    const text = SECTIONS.map((x) => [x.h, x.p, ...(x.lines ?? []), ...(x.list ?? [])].filter(Boolean).join("\n")).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setToast({ bold: "Copied", rest: " - the JD text is on your clipboard", n: Date.now() });
    } catch {
      setToast({ rest: "Could not copy - your browser blocked it", n: Date.now() });
    }
  };
  const reread = () => {
    if (reading || !approved) return;
    setReading(true);
    timer.current = setTimeout(() => {
      setReading(false);
      setReadAt("Read just now");
    }, 1500);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-[max(2.3rem,14px)] pb-[max(2.19rem,12px)] pt-[max(2.8rem,40px)] short:pt-[30px] max-md:overflow-y-auto max-md:pt-11">
      <div className="flex min-h-0 flex-1 items-start max-md:flex-col max-md:gap-y-6 md:gap-x-[max(1.875rem,14px)]">
        <BackButton />

        {/* The document: scrolls inside itself when the text is longer. */}
        <article className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-surface px-[max(3rem,18px)] py-[max(2.5rem,18px)] shadow-card max-md:w-full md:mt-[max(1.03rem,0px)] md:flex-1 md:self-stretch md:overflow-y-auto">
          <div className="flex items-center gap-3">
            <span className={CHIP + (approved ? " bg-success-soft text-success" : " bg-warn-soft text-warn")}>
              {approved ? `Approved · version ${version}` : `Draft · version ${version}`}
            </span>
            <History
              version={version}
              onRestore={(n) => {
                setVersion(n);
                setToast({ bold: `Version ${n}`, rest: approved ? " is back. It stays approved." : " is back.", n: Date.now() });
              }}
            />
          </div>
          <h3 className="text-h2 font-semibold text-brand">Senior Manager — SAP Business Transformation</h3>
          <p className="text-small text-ink-3">PGP Glass · Colombo · Full-time · Reports to the Group CIO</p>
          {SECTIONS.map((s) => (
            <section key={s.h} className="contents">
              <h4 className="mt-2 text-body font-semibold text-brand">{s.h}</h4>
              {s.p && <p className="text-small text-ink-2">{s.p}</p>}
              {s.lines && (
                <div className="text-small text-ink-2">
                  {s.lines.map((l) => (
                    <p key={l}>• {l}</p>
                  ))}
                </div>
              )}
              {s.list && (
                <ul className="list-disc text-small text-ink-2">
                  {s.list.map((l) => (
                    <li key={l} className="ms-5">
                      {l}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
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
            {approved && (
              <button type="button" onClick={copy} className="whitespace-nowrap rounded-full border border-border bg-surface px-[max(1.1rem,12px)] py-[max(0.5rem,6px)] text-small font-medium text-ink hover:bg-surface-2">
                Copy
              </button>
            )}
            {!approved && CAN_WRITE && (
              <button
                type="button"
                onClick={approve}
                className="flex items-center gap-2 whitespace-nowrap rounded-full bg-brand py-[max(0.625rem,7px)] pl-[max(1.25rem,14px)] pr-[max(1.375rem,15px)] text-small font-medium text-white transition-colors hover:bg-brand-strong"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                  <path d="M13.33 4 6 11.33 2.67 8" />
                </svg>
                Approve JD
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
                onClick={reread}
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
              {MATCH.map((m) => (
                <li key={m} className={CHIP + " bg-surface-2 text-ink-2"}>
                  {m}
                </li>
              ))}
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
        aria-label="Version history"
        title="Version history"
        className="flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
      >
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[1.1rem]" aria-hidden="true">
          <path d="M2.25 9a6.75 6.75 0 1 0 1.7-4.5L2.25 6M2.25 2.25V6H6" />
        </svg>
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
