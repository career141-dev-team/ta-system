"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { DUR, EASE, gsap, motionOK } from "@/lib/gsap";
import Count from "../Count";

// Homes for the TA Lead, the Director and Ops (owner 14 Nov 2026: "based on the UI,
// make the home view for the lead, director, ops"). Each keeps what its old dashboard
// showed (src/components/dash/*), in AURA's look: the lead sees the team today with
// each TA's checks for the day (the old Today's Checks "Team checks"), what needs a
// decision and every open role; the Director sees sets waiting for review, where every
// candidate is and each client; Ops sees what sits with clients, interviews to
// coordinate and what to chase. No design: built from the screens already drawn.
// ponytail: sample numbers; with the backend, one small read per section.

const PERSON: Record<"Lead" | "Director" | "Ops", { first: string; line: string }> = {
  Lead: { first: "Rashmi", line: "11 open across the team · 3 need a decision" },
  Director: { first: "Nadeesha", line: "Across the agency" },
  Ops: { first: "Kavindi", line: "Chasing and coordination" },
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export default function Home({ role }: { role: "Lead" | "Director" | "Ops" }) {
  const root = useRef<HTMLDivElement>(null);
  const [hello] = useState(greeting);
  // Sections rise in one after another (start states set at once, never on a tick).
  useEffect(() => {
    const parts = root.current?.querySelectorAll("[data-part]");
    if (!parts?.length || !motionOK()) return;
    gsap.set(parts, { opacity: 0, y: 12 });
    const t = gsap.to(parts, { opacity: 1, y: 0, duration: DUR.slow, ease: EASE.out, stagger: 0.06, clearProps: "opacity,transform" });
    const done = setTimeout(() => t.progress(1), 1500);
    return () => {
      clearTimeout(done);
      t.progress(1).kill();
    };
  }, [role]);
  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col gap-[max(1.75rem,14px)] overflow-y-auto px-[max(3.5rem,14px)] py-[max(2.25rem,16px)] [scrollbar-width:thin] max-md:pt-12">
      <header data-part>
        <h1 className="text-h1 font-light text-ink">
          {hello}, {PERSON[role].first}
        </h1>
        <p className="mt-1 text-small text-ink-3">{PERSON[role].line}</p>
      </header>
      {role === "Lead" ? <LeadHome /> : role === "Director" ? <DirectorHome /> : <OpsHome />}
    </div>
  );
}

/** A count in a soft tile; `warn` turns the number amber when it needs someone. */
function Stat({ n, label, warn, prefix = "" }: { n: number; label: string; warn?: boolean; prefix?: string }) {
  return (
    <div className="rounded-lg bg-canvas px-[max(1.5rem,14px)] py-[max(1.25rem,12px)]">
      <p className={"text-[max(2.25rem,24px)] font-light leading-none " + (warn && n > 0 ? "text-warn" : "text-ink")}>
        {prefix}
        <Count n={n} />
      </p>
      <p className="mt-2 text-small text-ink-3">{label}</p>
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section data-part className="min-w-0">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-h3 font-medium text-ink">{title}</h2>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

const ROW = "flex items-center gap-3 rounded-md bg-canvas px-4 py-3 transition-colors hover:bg-surface-2";
const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-md bg-canvas px-4 py-6 text-center text-small text-ink-3">{children}</p>;
const Initials = ({ s }: { s: string }) => (
  <span className="flex size-[max(2.25rem,28px)] shrink-0 items-center justify-center rounded-full bg-surface-2 text-caption font-semibold text-ink-2">{s}</span>
);

// ----- TA Lead -----

type TaToday = { name: string; ini: string; roles: string[]; li: [number, number]; noLink: number; pipeline: number; cvs: number; sets: number; alerts: number; day: { started?: string; done: number; of: number; eod?: string } };
const TEAM: TaToday[] = [
  { name: "Chathura Sampath", ini: "CS", roles: ["SAP Transformation", "Finance Manager", "Brand Manager"], li: [2, 3], noLink: 1, pipeline: 14, cvs: 12, sets: 3, alerts: 2, day: { started: "9:05", done: 4, of: 6 } },
  { name: "Dilini Ranasinghe", ini: "DR", roles: ["HR Business Partner", "Senior Accountant"], li: [2, 2], noLink: 0, pipeline: 9, cvs: 16, sets: 4, alerts: 1, day: { started: "8:52", done: 6, of: 6, eod: "5:41" } },
  { name: "Sewwandi Perera", ini: "SP", roles: ["Quality Assurance Lead", "Sales Executive"], li: [1, 2], noLink: 0, pipeline: 6, cvs: 7, sets: 1, alerts: 4, day: { started: "9:30", done: 2, of: 6 } },
  { name: "Dinuka Kumara", ini: "DK", roles: ["Plant Engineer", "SAP Transformation", "Production Planner"], li: [3, 3], noLink: 0, pipeline: 11, cvs: 9, sets: 2, alerts: 3, day: { started: "9:12", done: 5, of: 7 } },
  { name: "Ravindu Mendis", ini: "RM", roles: ["Store Manager"], li: [0, 1], noLink: 1, pipeline: 3, cvs: 4, sets: 0, alerts: 1, day: { done: 0, of: 0 } },
];
const DECIDE = [
  { title: "Head of Logistics", client: "Maersk", why: "Nobody assigned", red: true },
  { title: "Quality Assurance Lead", client: "Brandix", why: "JD not approved by Sewwandi" },
  { title: "Store Manager", client: "Cargills", why: "Day 52 against a P4 target of 45 — close it or reassign" },
];
const ROLES = [
  { title: "Senior Manager — SAP", client: "PGP Glass", tas: "Chathura, Dinuka", on: true, fu: 6, days: 9 },
  { title: "Finance Manager", client: "Hayleys Fabric", tas: "Chathura", on: true, fu: 4, days: 7 },
  { title: "HR Business Partner", client: "Dialog Axiata", tas: "Dilini", on: true, fu: 3, days: 9 },
  { title: "Senior Accountant", client: "John Keells", tas: "Dilini, Sewwandi", on: true, fu: 2, days: 8 },
  { title: "Quality Assurance Lead", client: "Brandix", tas: "Sewwandi", on: false, fu: 1, days: 5 },
  { title: "Plant Engineer", client: "Lanka Tiles", tas: "Dinuka", on: true, fu: 2, days: 11 },
  { title: "Head of Logistics", client: "Maersk", tas: "Unassigned", on: false, fu: 0, days: 4 },
  { title: "Store Manager", client: "Cargills", tas: "Ravindu", on: false, fu: 1, days: 52 },
];

function LeadHome() {
  const [offLi, setOffLi] = useState(false);
  const notOn = ROLES.filter((r) => !r.on).length;
  const roles = offLi ? ROLES.filter((r) => !r.on) : ROLES;
  return (
    <>
      <Section title="The team today" aside={<span className="text-caption text-ink-3">Each TA&apos;s checks for today, as in Today&apos;s Checks</span>}>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[58rem] text-small">
            <thead className="text-left text-caption text-ink-3">
              <tr>
                {["TA", "LinkedIn", "In pipeline", "CVs today", "Sets", "Alerts", "Today's checks"].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TEAM.map((t) => (
                <tr key={t.ini} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link href="/ta-track" className="flex items-center gap-3 hover:underline" title={t.roles.join(", ")}>
                      <Initials s={t.ini} />
                      <span>
                        <span className="block font-medium text-ink">{t.name}</span>
                        <span className="block text-caption text-ink-3">
                          {t.roles.length} {t.roles.length === 1 ? "role" : "roles"} · {t.roles.slice(0, 2).join(", ")}
                          {t.roles.length > 2 ? ` +${t.roles.length - 2}` : ""}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 text-ink-2">
                      <span className={"size-2 rounded-full " + (t.li[0] === t.li[1] ? "bg-brand" : "bg-warn")} />
                      {t.li[0]} of {t.li[1]} on
                    </span>
                    {(t.noLink > 0 || t.li[1] - t.li[0] - t.noLink > 0) && (
                      <span className="block text-caption text-warn">{[t.noLink && `${t.noLink} no link`, t.li[1] - t.li[0] - t.noLink > 0 && `${t.li[1] - t.li[0] - t.noLink} not posted`].filter(Boolean).join(" · ")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink">{t.pipeline}</td>
                  <td className={"px-4 py-3 " + (t.cvs < 10 ? "font-medium text-danger" : "text-ink")}>{t.cvs}</td>
                  <td className="px-4 py-3 text-ink">{t.sets}</td>
                  <td className={"px-4 py-3 " + (t.alerts > 3 ? "font-medium text-danger" : "text-ink")}>{t.alerts}</td>
                  <td className="px-4 py-3">
                    {!t.day.started ? (
                      <span className="rounded-full bg-danger-soft px-2.5 py-1 text-caption text-danger">Not started</span>
                    ) : (
                      <span className="flex flex-col gap-1">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
                            <span style={{ width: `${(t.day.done / t.day.of) * 100}%` }} className={"block h-full rounded-full " + (t.day.done === t.day.of ? "bg-brand" : "bg-info")} />
                          </span>
                          <span className="text-caption text-ink-2">
                            {t.day.done} of {t.day.of}
                          </span>
                        </span>
                        <span className={"text-caption " + (t.day.eod ? "text-brand" : "text-ink-3")}>{t.day.eod ? `EOD sent ${t.day.eod}` : `Started ${t.day.started} · EOD not sent`}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <div className="grid grid-cols-2 gap-[max(1.75rem,14px)] max-lg:grid-cols-1">
        <Section title="Needs a decision">
          {DECIDE.length ? (
            <ul className="flex flex-col gap-2">
              {DECIDE.map((d) => (
                <li key={d.title}>
                  <Link href="/openings/demo" className={ROW}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{d.title}</span>
                      <span className={"block text-caption " + (d.red ? "text-danger" : "text-ink-3")}>
                        {d.client} · {d.why}
                      </span>
                    </span>
                    <Arrow />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing waiting on you.</Empty>
          )}
        </Section>
        <Section
          title="Every open role"
          aside={
            (notOn > 0 || offLi) && (
              <button type="button" aria-pressed={offLi} onClick={() => setOffLi(!offLi)} className={"rounded-full px-3 py-1 text-caption " + (offLi ? "bg-ink text-white" : "bg-warn-soft text-warn")}>
                {offLi ? "Not on LinkedIn · show all" : `${notOn} not on LinkedIn`}
              </button>
            )
          }
        >
          <ul className="flex flex-col gap-2">
            {roles.map((r) => (
              <li key={r.title}>
                <Link href="/openings/demo" className={ROW}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{r.title}</span>
                    <span className="block truncate text-caption text-ink-3">
                      {r.client} · {r.tas} · day {r.days}
                    </span>
                  </span>
                  <span className={"rounded-full px-2 py-0.5 text-caption " + (r.on ? "bg-info-soft text-info" : "bg-surface-2 text-ink-3")}>{r.on ? "LinkedIn" : "No post"}</span>
                  <span className="w-8 text-right text-small text-ink" title="In follow-up">
                    {r.fu}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}

// ----- Director -----

const WAITING = [
  { who: "Kasun Perera", client: "PGP Glass", title: "Senior Manager — SAP", set: 3, ta: "Chathura" },
  { who: "Nimali Fernando", client: "Hayleys Fabric", title: "Finance Manager", set: 2, ta: "Chathura" },
  { who: "Ishara Silva", client: "Dialog Axiata", title: "HR Business Partner", set: 4, ta: "Dilini" },
];
const STAGES: [string, number][] = [
  ["New", 64],
  ["AI Follow-up", 31],
  ["TA Follow-up", 22],
  ["Director Review", 3],
  ["Director Shortlist", 9],
  ["Client Shortlist", 7],
  ["Interview", 5],
  ["Offer", 2],
  ["Placed", 4],
];
const CLIENTS = [
  { name: "PGP Glass", open: 1, sets: 3, value: 1850 },
  { name: "Hayleys Fabric", open: 1, sets: 2, value: 960 },
  { name: "Dialog Axiata", open: 1, sets: 4, value: 1400 },
  { name: "John Keells", open: 1, sets: 2, value: 720 },
  { name: "Lanka Tiles", open: 1, sets: 1, value: 0 },
  { name: "Cargills", open: 1, sets: 0, value: 0 },
];

function DirectorHome() {
  const widest = Math.max(...STAGES.map(([, n]) => n));
  return (
    <>
      <div data-part className="grid grid-cols-4 gap-[max(1rem,8px)] max-lg:grid-cols-2">
        <Stat n={11} label="Open roles" />
        <Stat n={WAITING.length} label="Waiting on you" warn />
        <Stat n={6930} prefix="LKR " label="In progress (thousands)" />
        <Stat n={4200} prefix="LKR " label="Placed (thousands)" />
      </div>
      <div className="grid grid-cols-2 gap-[max(1.75rem,14px)] max-lg:grid-cols-1">
        <Section title="Sets waiting on your review">
          {WAITING.length ? (
            <ul className="flex flex-col gap-2">
              {WAITING.map((w) => (
                <li key={w.who}>
                  <Link href="/openings/demo" className={ROW}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{w.who}</span>
                      <span className="block truncate text-caption text-ink-3">
                        {w.client} · {w.title} · set {w.set}
                      </span>
                    </span>
                    <span className="text-caption text-ink-3">{w.ta}</span>
                    <Arrow />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing waiting on you.</Empty>
          )}
        </Section>
        <Section title="Where everyone is">
          <ul className="flex flex-col gap-2.5 rounded-lg bg-canvas p-4">
            {STAGES.map(([s, n]) => (
              <li key={s} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-3 text-small max-sm:grid-cols-[7rem_1fr_2rem]">
                <span className="truncate text-ink-2">{s}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <Bar pct={(n / widest) * 100} />
                </span>
                <span className="text-right text-ink">{n}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <Section title="By client">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[30rem] text-small">
            <thead className="text-left text-caption text-ink-3">
              <tr>
                {["Client", "Open", "Sets", "In progress"].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CLIENTS.map((c) => (
                <tr key={c.name} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium text-ink">{c.name}</td>
                  <td className="px-4 py-2.5 text-ink-2">{c.open} open</td>
                  <td className="px-4 py-2.5 text-ink-2">{c.sets} sets</td>
                  <td className="px-4 py-2.5 text-ink-2">{c.value ? `LKR ${c.value}k` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

/** A stage bar that grows in once. */
function Bar({ pct }: { pct: number }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!el.current || !motionOK()) return;
    gsap.set(el.current, { scaleX: 0 });
    const t = gsap.to(el.current, { scaleX: 1, duration: DUR.slow, ease: EASE.out, delay: 0.2, clearProps: "transform" });
    return () => void t.progress(1).kill();
  }, []);
  return <span ref={el} style={{ width: `${pct}%` }} className="block h-full origin-left rounded-full bg-brand" />;
}

// ----- Ops -----

const WITH_CLIENT = [
  { who: "Ruwan Jayasinghe", client: "Dialog Axiata", title: "HR Business Partner", days: 4 },
  { who: "Tharushi Bandara", client: "John Keells", title: "Senior Accountant", days: 1 },
  { who: "Sahan Wickramasinghe", client: "PGP Glass", title: "Senior Manager — SAP", days: 0 },
];
const INTERVIEWS = [
  { who: "Nadeesha Perera", title: "Finance Manager", when: "Mon 17 Nov, 10:30", confirmed: true },
  { who: "Pasindu Silva", title: "Plant Engineer", when: "Mon 17 Nov, 14:00", confirmed: false },
  { who: "Hiruni Fernando", title: "HR Business Partner", when: "Tue 18 Nov, 11:00", confirmed: true },
];
const CHASE = [
  { what: "Dialog Axiata has not answered on Ruwan's set for 4 days", action: "Chase the client" },
  { what: "Pasindu Silva's interview is Monday — not contacted yet", action: "Call Pasindu" },
];

function OpsHome() {
  return (
    <>
      <div data-part className="grid grid-cols-3 gap-[max(1rem,8px)] max-sm:grid-cols-1">
        <Stat n={WITH_CLIENT.length} label="Sitting with clients" />
        <Stat n={CHASE.length} label="To chase" warn />
        <Stat n={INTERVIEWS.length} label="Interviews scheduled" />
      </div>
      <div className="grid grid-cols-2 gap-[max(1.75rem,14px)] max-lg:grid-cols-1">
        <Section title="Waiting on client feedback">
          <ul className="flex flex-col gap-2">
            {WITH_CLIENT.map((w) => (
              <li key={w.who}>
                <Link href="/openings/demo" className={ROW}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{w.who}</span>
                    <span className="block truncate text-caption text-ink-3">
                      {w.client} · {w.title}
                    </span>
                  </span>
                  <span className={"text-caption " + (w.days >= 1 ? "font-medium text-warn" : "text-ink-3")}>{w.days ? `${w.days}d with the client` : "today"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Interviews to coordinate">
          <ul className="flex flex-col gap-2">
            {INTERVIEWS.map((i) => (
              <li key={i.who} className={ROW + " hover:bg-canvas"}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{i.who}</span>
                  <span className="block truncate text-caption text-ink-3">
                    {i.title} · {i.when}
                  </span>
                </span>
                <span className={"rounded-full px-2.5 py-0.5 text-caption " + (i.confirmed ? "bg-brand-soft text-brand" : "bg-danger-soft text-danger")}>{i.confirmed ? "Confirmed" : "Not contacted"}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      {CHASE.length > 0 && (
        <Section title="Assigned to you">
          <ul className="flex flex-col gap-2">
            {CHASE.map((c) => (
              <li key={c.what} className={ROW + " hover:bg-canvas"}>
                <span className="min-w-0 flex-1 text-ink">{c.what}</span>
                <Link href="/openings/demo" className="shrink-0 rounded-full bg-ink px-4 py-1.5 text-small font-medium text-white hover:bg-black">
                  {c.action}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

const Arrow = () => (
  <svg data-nudge viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-ink-3" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
