"use client";

// The admin's Today (owner 27 Nov 2026: the old team board "not match with the design
// guideline... as admin we need recent activity of the TA, how many workdays are open,
// where the system needs attention, which part fails, and AI chat with the AURA logo").
// DESIGN.md rule 4, show the decision: four numbers, then what the TAs did today beside
// what is failing and what needs a decision, and AURA's bar at the foot. A question in
// the bar opens the AURA chat (AuraHome, the lead's chat over the same desk) with it;
// "Back to your desk" returns here. Reads: ui/adminHome:today + ui/lead:desk. Signed out,
// a small sample.
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Count from "../Count";
import { door, useDoorQuery } from "@/lib/backend";
import { useMe, useSignedInPerson } from "@/lib/role";
import AuraHome from "./AuraHome";
import Home from "./Homes";
import { SAMPLE_DESK, SUGGEST, type TaToday } from "./homeAnswers";

type Activity = { at: number; who: string; what: string; where?: string; kind: "day" | "email" | "move" };
type Attention = { key: string; tone: "danger" | "warn"; count: number; title: string; detail: string; who?: string[] };
type Decision = { title: string; client: string; why: string; red?: boolean };
type AdminRead = { ok: true; workdays: { started: number; open: number; eod: number }; activity: Activity[]; attention: Attention[] } | { ok: false; message: string } | undefined;
type LeadRead = { ok: true; team: TaToday[]; decide: Decision[] } | { ok: false; message: string } | undefined;

const ago = (min: number) => Date.now() - min * 60_000;
const SAMPLE: Extract<AdminRead, { ok: true }> = {
  ok: true,
  workdays: { started: 9, open: 7, eod: 2 },
  activity: [
    { at: ago(4), who: "Haifa", what: "moved Nimali Perera to Director Review", where: "Senior Accountant", kind: "move" },
    { at: ago(22), who: "Hassan", what: "sent the Midday email", where: "CEO - Athleisure", kind: "email" },
    { at: ago(48), who: "Dilini Ranasinghe", what: "finished the day with the EOD", kind: "day" },
    { at: ago(95), who: "Asma", what: "started the workday", where: "2 positions", kind: "day" },
  ],
  attention: [
    { key: "uncertain", tone: "danger", count: 1, title: "Emails that may not have gone out", detail: "A TA Lead settles each one on the email screen.", who: ["Shihab"] },
    { key: "cv_failed", tone: "danger", count: 3, title: "CVs that could not be read today", detail: "The upload shows the reason and a Try again." },
    { key: "ai", tone: "warn", count: 2, title: "AURA answers that failed today", detail: "In: brief, home." },
  ],
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};
const clock = (at: number) => new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Colombo" });
const DOT: Record<Activity["kind"], string> = { day: "bg-info", email: "bg-brand", move: "bg-violet" };
const FIRST = 5;

export default function AdminHome() {
  const signed = useSignedInPerson() !== null;
  const { first } = useMe();
  const [hello] = useState(greeting);
  const [asking, setAsking] = useState<string | null>(null);
  const [board, setBoard] = useState(false);
  const adminRead = useDoorQuery(door.adminHome, signed ? {} : "skip") as AdminRead;
  const leadRead = useDoorQuery(door.leadDesk, signed ? {} : "skip") as LeadRead;

  if (asking !== null) return <AuraHome role="Lead" first={asking || undefined} onBack={() => setAsking(null)} />;
  if (board)
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Home role="Lead" />
        <button type="button" onClick={() => setBoard(false)} className="absolute left-[max(3.5rem,14px)] top-3 rounded-full bg-surface px-3.5 py-1.5 text-small text-ink-2 shadow-card hover:text-ink">
          ← Back to your desk
        </button>
      </div>
    );

  const home = !signed ? SAMPLE : adminRead?.ok ? adminRead : null;
  const lead = !signed ? { team: SAMPLE_DESK.team, decide: SAMPLE_DESK.decide } : leadRead?.ok ? leadRead : null;
  const failed = [adminRead, leadRead].find((r) => r && !r.ok) as { message: string } | undefined;
  const notStarted = lead ? lead.team.filter((t) => !t.day.started) : [];
  const issues = home ? home.attention.reduce((n, a) => n + a.count, 0) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-[max(1.75rem,14px)] overflow-y-auto px-[max(3.5rem,14px)] pb-4 pt-[max(2.25rem,16px)] [scrollbar-width:thin] max-md:pt-12">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-h1 font-light text-ink">
              {hello}
              {first ? `, ${first}` : ""}
            </h1>
            <p className="mt-1 text-small text-ink-3">{failed ? failed.message : lead ? `${lead.team.length} TAs on the desk · what happened today and what needs you` : "Reading the desk…"}</p>
          </div>
          <button type="button" onClick={() => setBoard(true)} className="rounded-full border border-border bg-surface px-4 py-1.5 text-small text-ink-2 transition-colors hover:border-border-strong hover:text-ink">
            Team board
          </button>
        </header>

        <div className="grid grid-cols-4 gap-[max(1rem,8px)] max-lg:grid-cols-2">
          <Stat n={home?.workdays.open} label="Workdays open" sub={home ? `${home.workdays.started} started today` : ""} />
          <Stat n={home?.workdays.eod} label="EODs sent" sub={home ? `of ${home.workdays.started} workdays` : ""} tone="good" />
          <Stat n={lead ? notStarted.length : undefined} label="Not started" sub={lead ? `of ${lead.team.length} TAs` : ""} tone={notStarted.length ? "warn" : undefined} />
          <Stat n={home ? issues : undefined} label="Needs attention" sub={home ? (issues ? `${home.attention.length} ${home.attention.length === 1 ? "part" : "parts"} of the system` : "Nothing failing") : ""} tone={issues ? "danger" : "good"} />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-[max(1.5rem,12px)] lg:grid-cols-2 xl:min-h-[22rem] xl:flex-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]">
          <Panel title="Recent activity" sub="Today, newest first">
            {!home ? (
              <Lines />
            ) : home.activity.length ? (
              <ol className="flex flex-col">
                {home.activity.map((a, i) => (
                  <li key={`${a.at}-${i}`} className="flex items-start gap-[max(0.875rem,9px)] border-b border-border py-[max(0.7rem,8px)] last:border-0">
                    <span className="w-[max(3.25rem,40px)] shrink-0 pt-px font-mono text-mono text-ink-3">{clock(a.at)}</span>
                    <span className={"mt-[0.55rem] size-1.5 shrink-0 rounded-full " + DOT[a.kind]} aria-hidden="true" />
                    <span className="min-w-0 text-small text-ink-2">
                      <span className="font-medium text-ink">{a.who}</span> {a.what}
                      {a.where && <span className="block truncate text-ink-3">{a.where}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty text="Nothing yet today. Activity shows here as TAs start their day, move candidates and send emails." />
            )}
          </Panel>

          <Panel title="Needs attention" sub="Where the system is failing">
              {!home ? (
                <Lines n={2} />
              ) : home.attention.length ? (
                <ul className="flex flex-col gap-2">
                  {home.attention.map((a) => (
                    <li key={a.key} className="flex items-start gap-3 rounded-md bg-surface-2 px-[max(1rem,10px)] py-[max(0.75rem,8px)]">
                      <span className={"min-w-[2.25rem] rounded-sm px-2 py-0.5 text-center text-small font-medium tabular-nums " + (a.tone === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn")}>{a.count}</span>
                      <span className="min-w-0">
                        <span className="block text-small font-medium text-ink">{a.title}</span>
                        <span className="block text-small text-ink-3">
                          {a.detail}
                          {a.who?.length ? ` ${a.who.join(", ")}.` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 rounded-md bg-success-soft px-4 py-3 text-small text-success">All clear. No emails, CV reads or AURA answers failing right now.</p>
              )}
            </Panel>

            <Panel title="Needs a decision" sub={lead ? `${lead.decide.length} ${lead.decide.length === 1 ? "role" : "roles"}` : ""}>
              {!lead ? <Lines n={3} /> : lead.decide.length ? <Decisions rows={lead.decide} live={signed} /> : <Empty text="Nothing waits on a decision." />}
            </Panel>
        </div>
      </div>

      <AuraBar onAsk={setAsking} />
    </div>
  );
}

function Stat({ n, label, sub, tone }: { n: number | undefined; label: string; sub: string; tone?: "good" | "warn" | "danger" }) {
  const color = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "good" ? "text-brand" : "text-ink";
  return (
    <div className="rounded-md border border-border bg-surface px-[max(1.25rem,12px)] py-[max(1rem,10px)]">
      <p className="text-small text-ink-2">{label}</p>
      {n === undefined ? <span className="shimmer mt-2 block h-8 w-14 rounded-sm" /> : <Count n={n} className={"mt-1 block text-h2 font-medium tabular-nums " + color} />}
      <p className="truncate text-caption text-ink-3">{sub || " "}</p>
    </div>
  );
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-border bg-surface px-[max(1.5rem,12px)] py-[max(1.25rem,12px)] xl:min-h-0">
      <div className="mb-[max(0.75rem,8px)] flex items-baseline justify-between gap-3">
        <h2 className="text-h3 font-medium text-ink">{title}</h2>
        {sub && <span className="text-caption text-ink-3">{sub}</span>}
      </div>
      <div className="overflow-x-hidden [scrollbar-width:thin] xl:min-h-0 xl:flex-1 xl:overflow-y-auto">{children}</div>
    </section>
  );
}

function Decisions({ rows, live }: { rows: Decision[]; live: boolean }) {
  const [all, setAll] = useState(false);
  return (
    <>
      <ul className="flex flex-col">
        {(all ? rows : rows.slice(0, FIRST)).map((d) => (
          <li key={d.title + d.client}>
            <Link href={live ? "/openings" : "/openings/demo"} className="-mx-2 flex items-center gap-3 rounded-sm px-2 py-[max(0.6rem,7px)] transition-colors hover:bg-surface-2">
              <span className={"size-1.5 shrink-0 rounded-full " + (d.red ? "bg-danger" : "bg-warn")} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-medium text-ink">{d.title}</span>
                <span className={"block truncate text-caption " + (d.red ? "text-danger" : "text-ink-3")}>
                  {d.client} · {d.why}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length > FIRST && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 rounded-full px-2 py-1 text-small font-medium text-brand hover:bg-surface-2">
          {all ? "Show less" : `Show ${rows.length - FIRST} more`}
        </button>
      )}
    </>
  );
}

/** AURA's bar: its mark, a few questions, and the box. A question opens the chat with it. */
function AuraBar({ onAsk }: { onAsk: (q: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="mx-auto w-full max-w-[max(56rem,300px)] px-[max(1.5rem,14px)] pb-[max(1.75rem,14px)] pt-2">
      <div className="mb-[max(0.75rem,6px)] flex gap-[max(0.5rem,5px)] overflow-x-auto [scrollbar-width:none]">
        {SUGGEST.Lead.slice(0, 4).map((s) => (
          <button key={s} type="button" onClick={() => onAsk(s)} className="shrink-0 whitespace-nowrap rounded-full border border-border bg-surface px-[max(0.875rem,10px)] py-1 text-small text-ink-2 transition-colors hover:border-border-strong hover:text-ink">
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) onAsk(draft.trim());
        }}
        className="flex items-center gap-[max(0.75rem,8px)] rounded-full border border-border bg-surface py-[max(0.375rem,4px)] pl-[max(0.375rem,4px)] pr-[max(0.375rem,4px)] shadow-float has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand/30"
      >
        <span className="flex size-[max(2.5rem,30px)] shrink-0 overflow-hidden rounded-full bg-black shadow-aura">
          <Image src="/aura-mark.png" alt="AURA" width={56} height={56} className="size-full" />
        </span>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask AURA about the team, a TA or a role" aria-label="Ask AURA" className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3" />
        <button type="submit" aria-label="Ask" disabled={!draft.trim()} className="flex size-[max(2.5rem,30px)] shrink-0 items-center justify-center rounded-full bg-brand text-white transition-opacity disabled:opacity-40">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-[45%]">
            <path d="M12 19V5m0 0-6 6m6-6 6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}

const Lines = ({ n = 4 }: { n?: number }) => (
  <div className="flex flex-col gap-3" role="status" aria-label="Loading">
    {Array.from({ length: n }, (_, i) => (
      <span key={i} className="shimmer block h-4 rounded-sm" style={{ width: `${90 - i * 12}%` }} />
    ))}
  </div>
);
const Empty = ({ text }: { text: string }) => <p className="py-2 text-small text-ink-3">{text}</p>;
