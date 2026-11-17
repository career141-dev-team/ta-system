"use client";

import { useEffect, useRef, useState } from "react";
import { DUR, EASE, gsap, motionOK, useGSAP, useSwap } from "@/lib/gsap";
import { PERSON, useMe } from "@/lib/role";
import { endWorkday, useWorkdayGate } from "@/lib/workday";
import { BackButton } from "./PipelineBoard";
import Notch from "./Notch";
import Toast from "./Toast";
import WorkdayBlocked from "./WorkdayBlocked";
import { useOpeningView, type WorkView } from "./view";
import {
  CandidateTable,
  CHIP,
  Cross,
  EffortTiles,
  FileIcon,
  RefereeCalls,
  SECTION,
  type Cand,
  type Effort,
  type EffortKey,
  type ExtraCol,
  type Ref,
  type Targets,
} from "./EmailParts";

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
  /** What the lead found when they checked the mailbox for an unconfirmed send. */
  settledWhy?: string;
  savedAt?: number;
  /** A correction of this sent End of day ("REVISED"). */
  revisedOf?: string;
  reviewed?: boolean;
  rebuild?: boolean;
  /** A missed day's End of day: the research link, but no checks and no midday rule. */
  missed?: boolean;
  subject: string | null;
  to: string[];
  cc: string[];
  intro: string | null;
  outro: string;
  /** The candidates as sent; a draft reads today's live list instead. */
  rows?: Cand[];
  cols: ExtraCol[];
  effort: Effort;
  targets: Targets;
  refs: Ref[];
  includeRefs: boolean;
  noCvs: boolean;
};

// Placeholders: the opening, the user's Director Review candidates not sent yet
// (made-up people), the day's referee calls and the work type from the workday.
const OPENING = {
  client: "PGP Glass",
  title: "Senior Manager — SAP Business Transformation",
  set: 1,
};
const WORK_TYPE = "100%" as const;
// The TA System's switch (dailyEmailPolicy "midday"): when on, the End of day waits
// for a midday email.
const MIDDAY_REQUIRED = true;
// Placeholder: the TA whose sample emails these are. Who is LOOKING comes from
// `useMe()` in each part below: a lead sees everyone's, a TA their own.
const TA_NAME = PERSON.TA.name;

const cand = (
  id: string,
  name: string,
  age: string,
  notice: string,
  company: string,
  designation: string,
  current: string,
  expected: string,
  years: number,
  cv: Cand["cv"] = "ready",
): Cand => ({
  id,
  name,
  age,
  notice,
  company,
  designation,
  current,
  expected,
  cv,
  extra: {},
  edited: [],
  notes: `>Total Experience - ${years}yr\n>Currently at ${company}`,
});
const CANDS: Cand[] = [
  cand(
    "c1",
    "Kasun Perera",
    "34",
    "1 month",
    "Virtusa",
    "SAP S/4HANA Lead",
    "780k",
    "850k",
    11,
  ),
  cand(
    "c2",
    "Ishara Silva",
    "31",
    "2 months",
    "Virtusa",
    "Solution Architect",
    "720k",
    "800k",
    8,
  ),
  cand(
    "c3",
    "Nimali Abeysekara",
    "29",
    "1 month",
    "IFS",
    "SAP MM Lead",
    "650k",
    "",
    7,
    "missing",
  ),
];
const REFS: Ref[] = [
  {
    id: "r1",
    company: "Hayleys PLC",
    referral: "Former line manager",
    phone: "+94 77 000 0000",
    feedback: "Can share two SAP leads; call after 4 pm.",
    good: true,
  },
  {
    id: "r2",
    company: "Dialog Axiata",
    referral: "HR partner",
    phone: "+94 77 000 0000",
    feedback: "Will pass on the role to their SAP team.",
    good: true,
  },
  {
    id: "r3",
    company: "MAS Holdings",
    referral: "Project manager",
    phone: "+94 77 000 0000",
    feedback: "Did not answer twice.",
    good: false,
  },
];
const EFFORT: Effort = {
  lEffort: 24,
  sets: 1,
  da: 1,
  scoop: 1,
  l: 1,
  post: 0,
  addOns: 0,
  backUp: 0,
};

// The TA System's recipients: To the Director desk; Cc the desk and the reply inbox.
const TO = ["joborders@career141.com"];
const CC = [
  "shamra@career141.com",
  "asma@career141.com",
  "opsteam@career141.com",
  "cv@career141.com",
  "shortlists@career141.com",
];

// Today's Checks an original End of day needs (emailPreflight), each with the view
// that settles it. Sample: done, as in the design.
const CHECKS: {
  key: string;
  label: string;
  view: WorkView;
  done: boolean;
  note?: string;
}[] = [
  { key: "jd", label: "Job description reviewed", view: "jd", done: true },
  { key: "post", label: "LinkedIn job post", view: "linkedin-job", done: true },
  {
    key: "sugg",
    label: "Suggestions reviewed",
    view: "hh-suggestions",
    done: true,
  },
  {
    key: "tables",
    label: "Own Excel Tables profiles",
    view: "hh-tables",
    done: true,
    note: "10 of 10",
  },
];
// Eye-marked profiles on a 100% day: their next steps do not stop the email.
const EYE = [{ name: "Ruwan Bandara", status: "Move to Director Review" }];

const INTRO_CVS =
  "Dear Sir,\n\nPlease find the attached Shortlisted CV for the above-mentioned position";
const INTRO_ACTIVITY =
  "Dear Sir,\n\nPlease find today's activity for the above-mentioned position.";
const OUTRO = `Thank You\nBest Regards,\n\n${TA_NAME.split(" ")[0]}\nExecutive - Talent Acquisition`;

const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const daysAgo = (n: number) => fmtDay(new Date(Date.now() - n * 864e5));
const TODAY = fmtDay(new Date());
const clock = (t: number) =>
  new Date(t)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase();

let seq = 0;
function newMail(kind: Kind, n: number, extra: Partial<Mail> = {}): Mail {
  return {
    id: `m${++seq}`,
    kind,
    n,
    status: "draft",
    day: TODAY,
    by: TA_NAME,
    subject: null,
    to: [...TO],
    cc: [...CC],
    intro: null,
    outro: OUTRO,
    cols: [],
    effort: { ...EFFORT },
    targets: {},
    refs: REFS.map((r) => ({ ...r })),
    includeRefs: true,
    noCvs: false,
    ...extra,
  };
}

// Sample history for the 31-day list: one of each state the TA System has.
const HISTORY: Mail[] = [
  newMail("eod", 1, {
    status: "sent",
    day: daysAgo(1),
    sentAt: Date.now() - 864e5,
    rows: [CANDS[0]].map((c) => ({ ...c })),
  }),
  newMail("midday", 1, {
    status: "sent",
    day: daysAgo(1),
    sentAt: Date.now() - 864e5 - 5 * 36e5,
    rows: [],
  }),
  newMail("midday", 1, { status: "failed", day: daysAgo(2), rows: [] }),
  newMail("eod", 1, {
    status: "sent",
    day: daysAgo(2),
    sentAt: Date.now() - 2 * 864e5,
    rows: [],
  }),
  // Another TA's: a lead sees it; it holds nobody else's sends (28 Oct rule).
  newMail("eod", 1, {
    status: "uncertain",
    day: daysAgo(3),
    by: "Hasini Fernando",
    sentAt: Date.now() - 3 * 864e5,
    rows: [],
  }),
];

/** The TA System's subject: "SET 1 - CLIENT - TITLE - 3 CVs", or "- DAILY ACTIVITY". */
const autoSubject = (n: number) => {
  const job = `${OPENING.client} - ${OPENING.title}`.toUpperCase();
  return n
    ? `SET ${OPENING.set} - ${job} - ${n} CV${n === 1 ? "" : "s"}`
    : `${job} - DAILY ACTIVITY`;
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
  if (
    !["chatgpt.com", "www.chatgpt.com", "chat.openai.com"].includes(u.hostname)
  )
    return "Use a chatgpt.com share link.";
  if (!/^\/share\/(e\/)?[\w-]{8,}/.test(u.pathname))
    return "Use the Share link, not the chat's own address.";
  return null;
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DailyEmailView() {
  const { go } = useOpeningView();
  const gate = useWorkdayGate();
  const me = useMe();
  const [mails, setMails] = useState<Mail[]>(() => [
    newMail("eod", 1),
    ...HISTORY,
  ]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<Kind>("midday");
  const [cands, setCands] = useState(CANDS);
  const [link, setLink] = useState("");
  const [linkOk, setLinkOk] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showSent, setShowSent] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [notice, setNotice] = useState<{
    bold?: string;
    rest: string;
    n: number;
    warn?: boolean;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const say = (rest: string, bold?: string, warn?: boolean) =>
    setNotice((n) => ({ bold, rest, warn, n: (n?.n ?? 0) + 1 }));

  const today = mails.filter(
    (m) => m.day === TODAY && !m.missed && !m.revisedOf,
  );
  const middays = today
    .filter((m) => m.kind === "midday")
    .sort((a, b) => a.n - b.n);
  const eod = today.find((m) => m.kind === "eod")!;
  const eodSent = eod.status === "sent";
  const middaySent = middays.some((m) => m.status === "sent");
  // Candidates sent in any email today leave the next one (as in the TA System).
  const sentIds = new Set(
    today
      .filter((m) => m.status === "sent")
      .flatMap((m) => (m.rows ?? []).map((r) => r.id)),
  );
  const live = cands.filter((c) => !sentIds.has(c.id));

  // What is open: a chosen email, else today's for the tab (the last midday).
  const mail =
    mails.find((m) => m.id === openId) ??
    (tab === "eod" ? eod : middays.at(-1));
  const isEod = mail?.kind === "eod";
  const readOnly = !!mail && mail.status !== "draft";
  const rows = mail ? (mail.rows ?? live) : [];
  const fromHistory =
    !!mail && (mail.day !== TODAY || !!mail.missed || !!mail.revisedOf);

  const patch = (id: string, p: Partial<Mail> | ((m: Mail) => Partial<Mail>)) =>
    setMails((all) =>
      all.map((m) =>
        m.id === id
          ? {
              ...m,
              ...(typeof p === "function" ? p(m) : p),
              savedAt: Date.now(),
            }
          : m,
      ),
    );
  const edit = (p: Partial<Mail> | ((m: Mail) => Partial<Mail>)) =>
    mail && !readOnly && patch(mail.id, p);

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
    } else {
      // A missed day's End of day still needs the research link; a lead's never does.
      if (!linkOk && !(me.lead && isEod)) left.push("the research link");
      // Only a TA is held to the checks and to "midday before End of day".
      if (isEod && !mail.missed && !me.lead) {
        CHECKS.filter((c) => !c.done).forEach((c) => left.push(c.label));
        if (MIDDAY_REQUIRED && !middaySent) left.push("a midday email first");
      }
    }
    // An End of day goes with every CV or not at all; a midday goes without one that is not ready.
    if (isEod)
      rows
        .filter((r) => r.cv !== "ready" && !r.manual)
        .forEach((r) => left.push(`${r.name}'s CV`));
    rows.forEach((r, i) => {
      if (
        r.manual &&
        (!r.name.trim() || !r.company.trim() || !r.designation.trim())
      )
        left.push(`row ${i + 1}'s name, company and designation`);
    });
    // Your own email still sending or not confirmed holds every later send here.
    if (
      mails.some(
        (m) =>
          m.by === me.name &&
          m.id !== mail.id &&
          (m.status === "sending" || m.status === "uncertain"),
      )
    )
      left.push("a TA Lead to settle an earlier email");
    if (!mail.to.length) left.push("a To address");
  }

  const steps =
    mail && !readOnly && !mail.revisedOf
      ? [
          ...(isEod && !mail.missed && !me.lead ? CHECKS.map((c) => c.done) : []),
          ...(isEod && !mail.missed && !me.lead && MIDDAY_REQUIRED ? [middaySent] : []),
          ...(me.lead && isEod ? [] : [linkOk]),
        ]
      : [];
  const stepsDone = steps.filter(Boolean).length;
  const bar = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      if (bar.current && steps.length)
        gsap.to(bar.current, {
          width: `${(stepsDone / steps.length) * 100}%`,
          duration: DUR.slow,
          ease: EASE.out,
        });
    },
    { dependencies: [stepsDone, steps.length] },
  );
  // Send ready: the button lifts once and a ring ripples off it, so the TA sees it is
  // time to send - only at the moment the last check is done.
  const sendBtn = useRef<HTMLDivElement>(null);
  const wasReady = useRef(left.length === 0);
  useGSAP(
    () => {
      const ready = left.length === 0;
      if (ready && !wasReady.current && sendBtn.current) {
        const ring = sendBtn.current.querySelector("[data-ring]");
        gsap
          .timeline()
          .fromTo(
            sendBtn.current.querySelector("button"),
            { scale: 1 },
            {
              scale: 1.03,
              duration: DUR.fast,
              ease: EASE.out,
              yoyo: true,
              repeat: 1,
            },
          )
          .fromTo(
            ring,
            { opacity: 0.55, scale: 1 },
            { opacity: 0, scale: 1.12, duration: 0.8, ease: "power2.out" },
            0,
          );
      }
      wasReady.current = ready;
    },
    { dependencies: [left.length], revertOnUpdate: false },
  );

  // Send takes off (owner, 14 Nov 2026: "rocket flying, blowing and close"): the
  // rocket rumbles, launches up and away with puffs of smoke behind it, the button
  // closes into a circle with a tick, and only then does the email go. The rocket
  // flies on a copy fixed to the page, so the panel's edge does not cut it off.
  // With less motion asked for, it simply sends.
  const launching = useRef(false);
  const launch = () => {
    if (!mail || left.length || launching.current) return;
    const holder = sendBtn.current;
    const btn = holder?.querySelector<HTMLElement>("button");
    const rocket = holder?.querySelector<HTMLElement>("[data-rocket]");
    if (!holder || !btn || !rocket || !motionOK()) return send();
    launching.current = true;
    const r = rocket.getBoundingClientRect();
    const fly = rocket.cloneNode(true) as HTMLElement;
    Object.assign(fly.style, {
      position: "fixed",
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      zIndex: "100",
      pointerEvents: "none",
      color: getComputedStyle(rocket).color,
    });
    document.body.appendChild(fly);
    rocket.style.visibility = "hidden";
    const puffs = Array.from({ length: 7 }, () => {
      const d = document.createElement("span");
      d.className =
        "pointer-events-none fixed z-[99] rounded-full bg-border-strong";
      Object.assign(d.style, {
        left: `${r.left + r.width / 2 - 6}px`,
        top: `${r.top + r.height / 2 - 6}px`,
        width: "12px",
        height: "12px",
        opacity: "0",
      });
      document.body.appendChild(d);
      return d;
    });
    const tidy = () => {
      fly.remove();
      puffs.forEach((d) => d.remove());
      launching.current = false;
    };
    gsap
      .timeline({
        onComplete: () => {
          tidy();
          send();
        },
        onInterrupt: tidy,
      })
      // Engines on: a short rumble while the words leave.
      .to(fly, {
        x: "random(-1.5, 1.5)",
        y: "random(-1.5, 1.5)",
        duration: 0.05,
        repeat: 5,
        yoyo: true,
        ease: "none",
      })
      .to(
        holder.querySelector("[data-label]"),
        { opacity: 0, y: 4, duration: DUR.fast, ease: EASE.in },
        0,
      )
      // Lift-off, up and away to the right, fading as it goes.
      .addLabel("lift")
      .to(
        fly,
        {
          x: 280,
          y: -240,
          rotation: 6,
          scale: 1.4,
          duration: 0.7,
          ease: "power2.in",
        },
        "lift",
      )
      .to(fly, { opacity: 0, duration: 0.2 }, "lift+=0.5")
      // Smoke blown out behind it, drifting down and away.
      .fromTo(
        puffs,
        { opacity: 0.75, scale: 0.4 },
        {
          opacity: 0,
          scale: 2.6,
          x: () => gsap.utils.random(-60, -8),
          y: () => gsap.utils.random(8, 44),
          duration: 0.8,
          stagger: 0.05,
          ease: "power2.out",
        },
        "lift",
      )
      // The button closes into a circle, and a tick appears in it.
      .to(
        btn,
        { width: btn.offsetHeight, duration: 0.35, ease: EASE.out },
        "lift+=0.2",
      )
      .fromTo(
        holder.querySelector("[data-sent]"),
        { opacity: 0, scale: 0.4 },
        { opacity: 1, scale: 1, duration: DUR.base, ease: EASE.pop },
        "lift+=0.5",
      )
      .to({}, { duration: 0.3 }, "lift+=0.8");
  };

  const send = () => {
    if (!mail || left.length) return;
    const snapshot = rows.map((r) => ({ ...r }));
    patch(mail.id, { status: "sending", rows: snapshot });
    // ponytail: a stand-in delay; with the backend this is the durable send
    // (reserve, send through the mailbox, then accepted / failed / could not confirm).
    timers.current.push(
      setTimeout(() => {
        patch(mail.id, { status: "sent", sentAt: Date.now() });
        // The TA System ends the workday at the first original 100% End of day that
        // is accepted (not a midday, not a REVISED or a missed day's). Again does nothing.
        if (isEod && WORK_TYPE === "100%" && !mail.revisedOf && !mail.missed && mail.day === TODAY) endWorkday();
        const what = mail.revisedOf
          ? "Revised End of day email"
          : isEod
            ? "End of day email"
            : `Midday ${mail.n}`;
        // The End of day closes the workday by itself in the TA System.
        say(
          ` sent to ${mail.to[0]}${isEod && !mail.missed && !mail.revisedOf ? " - your workday is closed" : ""}. Sample only, nothing left the system.`,
          what,
        );
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
    const m = newMail("eod", 1, {
      day,
      missed: true,
      rows: [{ ...CANDS[1], id: "c9" }],
    });
    setMails((all) => [m, ...all]);
    open(m);
  };

  const saveLink = () => {
    if (linkSaving) return;
    const p = researchProblem(link);
    setLinkError(p);
    if (p) return;
    // ponytail: a stand-in wait; with the backend this is the save of the link.
    setLinkSaving(true);
    timers.current.push(
      setTimeout(() => {
        setLinkSaving(false);
        setLinkOk(true);
      }, 900),
    );
  };

  const editCand = (id: string, key: string, value: string, extra: boolean) => {
    // A draft edits the candidate itself (saved to the record after the email goes);
    // a revised email edits only its own copy.
    const apply = (c: Cand) =>
      c.id !== id
        ? c
        : extra
          ? { ...c, extra: { ...c.extra, [key]: value } }
          : {
              ...c,
              [key]: value,
              edited: c.edited.includes(key) ? c.edited : [...c.edited, key],
            };
    if (mail?.rows) edit({ rows: mail.rows.map(apply) });
    else setCands((all) => all.map(apply));
    if (mail) patch(mail.id, {});
  };
  // A row typed in by hand (owner, 14 Nov 2026): name, company and designation are
  // needed before the email goes; it has no prepared CV.
  const rowN = useRef(0);
  const addRow = () => {
    const row: Cand = {
      id: `m${++rowN.current}`,
      name: "",
      age: "",
      notice: "",
      notes: "",
      company: "",
      designation: "",
      current: "",
      expected: "",
      cv: "ready",
      extra: {},
      edited: [],
      manual: true,
    };
    if (mail?.rows) edit({ rows: [...mail.rows, row] });
    else setCands((all) => [...all, row]);
    if (mail) patch(mail.id, {});
  };
  const dropRow = (id: string) => {
    if (mail?.rows) edit({ rows: mail.rows.filter((r) => r.id !== id) });
    else setCands((all) => all.filter((r) => r.id !== id));
    if (mail) patch(mail.id, {});
  };
  const makeCv = (id: string) => {
    const set = (cv: Cand["cv"]) => (c: Cand) =>
      c.id === id ? { ...c, cv } : c;
    if (mail?.rows) edit({ rows: mail.rows.map(set("making")) });
    else setCands((all) => all.map(set("making")));
    timers.current.push(
      setTimeout(() => {
        setCands((all) => all.map(set("ready")));
        setMails((all) =>
          all.map((m) =>
            m.rows ? { ...m, rows: m.rows.map(set("ready")) } : m,
          ),
        );
      }, 1200),
    );
  };

  const files = mail ? attachments(mail, rows, isEod) : [];
  const noCvMidday =
    !!mail && !isEod && !mail.noCvs ? rows.filter((r) => r.cv !== "ready") : [];

  return (
    <div
      ref={root}
      className="flex min-h-0 flex-1 flex-col px-[max(1.5rem,14px)] pb-[max(1.4rem,12px)] pt-[max(1.4rem,14px)] max-md:pt-11"
    >
      <Notch small label={isEod ? "End of day email" : "Midday email"} />

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
                (tab === k && !fromHistory
                  ? "bg-surface font-medium text-ink shadow-card"
                  : "text-ink-2 hover:text-ink")
              }
            >
              {label}
              {k === "eod" && eodSent && (
                <span className="ml-1 text-success">✓</span>
              )}
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
                  (mail?.id === m.id
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-border text-ink-2 hover:bg-surface-2")
                }
              >
                Midday {m.n}
                {m.status === "sent" ? (
                  <span className="text-success">✓</span>
                ) : (
                  <span className="text-ink-3">· draft</span>
                )}
              </button>
            ))}
            {middays.length > 0 && (
              <button
                type="button"
                onClick={addMidday}
                disabled={eodSent}
                title={
                  eodSent
                    ? "The End of day email has gone - no more midday emails today"
                    : "Add midday email"
                }
                aria-label="Add midday email"
                className="flex size-[max(1.75rem,24px)] items-center justify-center rounded-full border border-border text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-40"
              >
                +
              </button>
            )}
          </div>
        )}
        {mail?.status === "draft" && mail.savedAt && (
          <span className="rounded-full bg-surface-2 px-[max(0.75rem,9px)] py-[max(0.25rem,3px)] text-caption text-ink-3">
            Draft saved {clock(mail.savedAt)}
          </span>
        )}
        <button
          type="button"
          aria-expanded={showSent}
          onClick={() => setShowSent((s) => !s)}
          className="ml-auto flex items-center gap-1.5 text-small text-ink hover:text-brand"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-[1.1em]"
            aria-hidden="true"
          >
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Sent in the last 31 days
        </button>
      </div>

      <div
        ref={body}
        className="mt-[max(1.3rem,10px)] grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,max(31rem,280px))] gap-[max(1.8rem,14px)] max-lg:flex max-lg:flex-col max-lg:overflow-y-auto"
      >
        {/* The email as the desk will read it. */}
        <div className="min-h-0 overflow-y-auto rounded-lg border border-border px-[max(2rem,14px)] py-[max(1.5rem,12px)] max-lg:shrink-0 max-lg:overflow-visible">
          {!mail ? (
            <FirstMidday onAdd={addMidday} closed={eodSent} />
          ) : (
            <>
              {fromHistory && (
                <HistoryBar mail={mail} onBack={() => choose(mail.kind)} />
              )}
              <Recipients
                label="To"
                list={mail.to}
                readOnly={readOnly}
                onChange={(l) => edit({ to: l })}
                other={mail.cc}
                onBad={(m) => say(m, undefined, true)}
              />
              <Recipients
                label="Cc"
                list={mail.cc}
                readOnly={readOnly}
                onChange={(l) => edit({ cc: l })}
                other={mail.to}
                onBad={(m) => say(m, undefined, true)}
              />
              <input
                value={mail.subject ?? autoSubject(rows.length)}
                readOnly={readOnly}
                onChange={(e) => edit({ subject: e.target.value })}
                aria-label="Subject"
                className="mt-[max(0.8rem,7px)] block w-full rounded-xs border-b border-border bg-transparent px-1 pb-[max(0.9rem,8px)] pt-1 text-body font-medium text-ink outline-none hover:bg-surface-2 focus:bg-surface-2 read-only:hover:bg-transparent"
              />

              <Para
                value={mail.intro ?? (rows.length ? INTRO_CVS : INTRO_ACTIVITY)}
                readOnly={readOnly}
                onChange={(v) => edit({ intro: v })}
                label="Greeting"
              />

              {rows.length > 0 ? (
                <>
                  <h3 className={SECTION}>
                    Candidates for Director Review · {rows.length}
                  </h3>
                  <CandidateTable
                    rows={rows}
                    cols={mail.cols}
                    readOnly={readOnly}
                    noCvs={!isEod && mail.noCvs}
                    onEdit={editCand}
                    onAddCol={(name, after) =>
                      edit((m) => ({ cols: [...m.cols, { name, after }] }))
                    }
                    onDropCol={(name) =>
                      edit((m) => {
                        // Columns that sat after it move up to where it sat.
                        const gone = m.cols.find((c) => c.name === name);
                        return {
                          cols: m.cols
                            .filter((c) => c.name !== name)
                            .map((c) =>
                              c.after === name
                                ? { ...c, after: gone?.after ?? "" }
                                : c,
                            ),
                        };
                      })
                    }
                    onAddRow={addRow}
                    onDropRow={dropRow}
                    onMakeCv={makeCv}
                    onRefused={(why) => say(why, undefined, true)}
                  />
                </>
              ) : (
                <p className="mt-[max(1.2rem,10px)] rounded-sm bg-surface-2 px-[max(1rem,10px)] py-[max(0.8rem,8px)] text-small text-ink-2">
                  {sentIds.size && !fromHistory
                    ? "Today's Director Review candidates went in a midday email."
                    : "No candidates for Director Review."}{" "}
                  This email reports the day&rsquo;s activity.
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={addRow}
                      className="ml-2 font-medium text-brand hover:underline"
                    >
                      + Add a row
                    </button>
                  )}
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
                onChange={(k: EffortKey, n) =>
                  edit((m) => ({ effort: { ...m.effort, [k]: n } }))
                }
                onTarget={(k: EffortKey, n) =>
                  edit((m) => ({ targets: { ...m.targets, [k]: n } }))
                }
              />

              {/* Referee calls go with the End of day only. */}
              {isEod && !mail.missed && (
                <RefereeCalls
                  refs={mail.refs}
                  include={mail.includeRefs}
                  readOnly={readOnly}
                  onInclude={(v) => edit({ includeRefs: v })}
                  onMove={(id) =>
                    edit((m) => ({
                      refs: m.refs.map((r) =>
                        r.id === id ? { ...r, good: !r.good } : r,
                      ),
                    }))
                  }
                />
              )}

              {linkOk && (
                <p className="mt-[max(1.2rem,10px)] text-small text-ink">
                  <b className="font-medium">Research:</b>{" "}
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand underline underline-offset-2"
                  >
                    View ChatGPT Research
                  </a>
                </p>
              )}
              <Para
                value={mail.outro}
                readOnly={readOnly}
                onChange={(v) => edit({ outro: v })}
                label="Sign-off"
              />
            </>
          )}
        </div>

        {/* Before you send: what the TA System checks, the attachments, then Send. */}
        <div className="flex min-h-0 flex-col gap-[max(1rem,10px)] overflow-y-auto [scrollbar-width:none] max-lg:shrink-0 max-lg:overflow-visible">
          {showSent ? (
            <SentList
              mails={mails}
              onOpen={open}
              onMissed={missedDay}
              onClose={() => setShowSent(false)}
            />
          ) : mail ? (
            <>
              {gate && !readOnly && <WorkdayBlocked what="send this email" />}
              <StatusCard
                mail={mail}
                isEod={isEod}
                onRevise={() => reviseOf(mail)}
                onRetry={() => patch(mail.id, { status: "draft" })}
                onSettle={(sent, why) =>
                  patch(mail.id, { status: sent ? "sent" : "failed", sentAt: sent ? (mail.sentAt ?? Date.now()) : undefined, settledWhy: why })
                }
              />

              {!readOnly && mail.revisedOf && (
                <div className="space-y-2 rounded-lg bg-surface-2 p-[max(1.4rem,12px)] text-small text-ink">
                  <h3 className="text-h3 font-medium">Before you resend</h3>
                  <p className="text-ink-2">
                    Same candidates in the same order; it goes with
                    &ldquo;REVISED&rdquo; in the subject.
                  </p>
                  <Tick
                    checked={!!mail.reviewed}
                    onChange={(v) => edit({ reviewed: v })}
                    label="I reviewed this email"
                  />
                  <Tick
                    checked={!!mail.rebuild}
                    onChange={(v) => edit({ rebuild: v })}
                    label="Make the CV attachments again from the records"
                  />
                </div>
              )}

              {!readOnly && mail.missed && (
                <p className="rounded-lg bg-surface-2 p-[max(1.4rem,12px)] text-small text-ink-2">
                  The End of day for{" "}
                  <b className="font-medium text-ink">{mail.day}</b>. A missed
                  day needs the research link, but no checks and no midday email; up to 7 days back.
                </p>
              )}

              {!readOnly && !mail.revisedOf && (
                <div className="rounded-lg bg-surface-2 p-[max(1.4rem,12px)]">
                  {/* One line: the heading never wraps into the bar under it. */}
                  <div className="flex items-center justify-between gap-3">
                    <h3
                      className="min-w-0 truncate whitespace-nowrap text-h3 font-medium text-ink"
                      title="Before you send"
                    >
                      Before you send
                    </h3>
                    {steps.length > 0 && (
                      <span className="shrink-0 whitespace-nowrap text-caption text-ink-3">
                        {stepsDone === steps.length
                          ? "All done"
                          : `${stepsDone} of ${steps.length} done`}
                      </span>
                    )}
                  </div>
                  {steps.length > 0 && (
                    <span className="mt-[max(0.8rem,8px)] block h-1 overflow-hidden rounded-full bg-border">
                      <span
                        ref={bar}
                        className="block h-full rounded-full bg-brand"
                        style={{
                          width: `${(stepsDone / steps.length) * 100}%`,
                        }}
                      />
                    </span>
                  )}
                  <ul className="mt-[max(0.7rem,6px)] space-y-[max(0.55rem,5px)] text-small">
                    {isEod && !mail.missed &&
                      CHECKS.map((c) => (
                        <Check
                          key={c.key}
                          done={c.done}
                          label={c.label}
                          note={c.note}
                          onFix={() => go(c.view)}
                        />
                      ))}
                    {isEod && !mail.missed && (
                      <Check
                        done={rows.length > 0}
                        label="Eligible Director Review candidates"
                        note={
                          rows.length
                            ? `${rows.length} waiting`
                            : "none - activity only"
                        }
                        onFix={() => go("pipeline")}
                        soft
                      />
                    )}
                    {isEod && !mail.missed && !me.lead && MIDDAY_REQUIRED && (
                      <Check
                        done={middaySent}
                        label="Midday email sent"
                        onFix={() => choose("midday")}
                      />
                    )}
                    <Check
                      done={linkOk}
                      busy={linkSaving}
                      label="ChatGPT research link"
                      note={linkSaving ? "checking the link" : undefined}
                    />
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
                        <button
                          type="button"
                          onClick={saveLink}
                          disabled={linkSaving}
                          className="rounded-full bg-ink px-[max(1rem,12px)] py-[max(0.45rem,5px)] text-small font-medium text-white hover:bg-marker disabled:opacity-60"
                        >
                          {linkSaving ? "Adding…" : "Add"}
                        </button>
                      </div>
                      {linkError && (
                        <p className="mt-1.5 pl-2 text-caption text-danger">
                          {linkError}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-[max(0.7rem,6px)] flex items-center gap-2 text-caption text-ink-3">
                      <span className="truncate">{link.trim()}</span>
                      <button
                        type="button"
                        onClick={() => setLinkOk(false)}
                        className="shrink-0 text-brand hover:underline"
                      >
                        Change
                      </button>
                    </p>
                  )}
                  {/* Eye-marked profiles: next steps to take, never a reason to hold the email. */}
                  {isEod && WORK_TYPE === "100%" && EYE.length > 0 && (
                    <p className="mt-[max(0.8rem,8px)] border-t border-border pt-[max(0.7rem,6px)] text-caption text-ink-2">
                      Eye-marked:{" "}
                      {EYE.map(
                        (e) => `${e.name} - ${e.status.toLowerCase()}`,
                      ).join(", ")}
                      .{" "}
                      <button
                        type="button"
                        onClick={() => go("hh-tables")}
                        className="font-medium text-brand hover:underline"
                      >
                        Open Excel Tables
                      </button>
                    </p>
                  )}
                </div>
              )}

              {/* The attachments: the line, and the files under it on a click. */}
              <div className="rounded-lg border border-border">
                <button
                  type="button"
                  aria-expanded={showFiles}
                  onClick={() => setShowFiles((s) => !s)}
                  className="flex w-full items-center gap-[max(0.7rem,7px)] px-[max(1.4rem,12px)] py-[max(1rem,10px)] text-left text-small text-ink"
                >
                  <ClipIcon />
                  <span className="min-w-0 flex-1">
                    {attachLine(files, rows, isEod, mail.noCvs)}
                  </span>
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
                  {noCvMidday.map((r) => r.name).join(", ")}: CV not made yet -
                  this midday email goes without it.
                </p>
              )}
              {!isEod && !readOnly && rows.length > 0 && (
                <Tick
                  checked={mail.noCvs}
                  onChange={(v) => edit({ noCvs: v })}
                  label="Send without CV attachments"
                />
              )}

              {!readOnly ? (
                <div ref={sendBtn} className="relative flex justify-center">
                  <span
                    data-ring
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-full border-2 border-brand opacity-0"
                  />
                  <button
                    type="button"
                    onClick={launch}
                    disabled={left.length > 0}
                    title={
                      left.length
                        ? "Still to do: " + left.join(", ")
                        : undefined
                    }
                    className="relative flex h-[max(3.6rem,44px)] w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-brand text-body font-medium text-white hover:bg-brand-strong disabled:bg-surface-3 disabled:text-ink-3"
                  >
                    <span data-rocket className="flex size-[1.25em] shrink-0">
                      <RocketIcon />
                    </span>
                    <span data-label className="whitespace-nowrap">
                      {left.length
                        ? `Send — ${left.length} check${left.length === 1 ? "" : "s"} left`
                        : mail.revisedOf
                          ? "Send the revised email"
                          : "Send"}
                    </span>
                    <span
                      data-sent
                      aria-hidden="true"
                      className="absolute inset-0 flex items-center justify-center opacity-0"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-[1.3em]"
                      >
                        <path d="m5 12.5 4.5 4.5L19 7.5" />
                      </svg>
                    </span>
                  </button>
                </div>
              ) : null}
              {!readOnly && left.length > 0 && (
                <p className="-mt-1 px-1 text-caption text-ink-3">
                  Still to do: {left.join(", ")}.
                </p>
              )}
            </>
          ) : null}
        </div>
      </div>

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

/* ---------- pieces of the screen ---------- */

/** No midday email yet today: the one way to start one. */
function FirstMidday({
  onAdd,
  closed,
}: {
  onAdd: () => void;
  closed: boolean;
}) {
  return (
    <div className="flex h-full min-h-[max(14rem,180px)] flex-col items-center justify-center gap-2 text-center">
      <p className="text-h3 font-medium text-ink">
        {closed
          ? "Midday emails are closed for today"
          : "No midday email yet today"}
      </p>
      <p className="max-w-[28rem] text-small text-ink-2">
        {closed
          ? "The End of day email has gone."
          : "A midday email sends the Director the candidates ready so far. You can send more than one in a day; each is kept as a draft while you write it."}
      </p>
      {!closed && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-2 flex h-[max(2.6rem,34px)] items-center rounded-full bg-brand px-[max(1.4rem,14px)] text-small font-medium text-white hover:bg-brand-strong"
        >
          Add midday email
        </button>
      )}
    </div>
  );
}

/** Reading an email from another day, a correction or a missed day: says which, and the way back. */
function HistoryBar({ mail, onBack }: { mail: Mail; onBack: () => void }) {
  const me = useMe();
  const what = mail.revisedOf
    ? "Correction"
    : mail.missed
      ? "Missed day"
      : mail.kind === "eod"
        ? "End of day"
        : `Midday ${mail.n}`;
  return (
    <div className="mb-[max(0.8rem,7px)] flex flex-wrap items-center gap-2 rounded-sm bg-surface-2 px-[max(1rem,10px)] py-[max(0.5rem,5px)] text-small">
      <b className="font-medium text-ink">{what}</b>
      <span className="text-ink-2">· {mail.day}</span>
      {mail.by !== me.name && <span className="text-ink-2">· {mail.by}</span>}
      <button
        type="button"
        onClick={onBack}
        className="ml-auto text-brand hover:underline"
      >
        Back to today&rsquo;s email
      </button>
    </div>
  );
}

/** Where a sent (or stuck) email stands, in the TA System's words. */
function StatusCard({
  mail,
  isEod,
  onRevise,
  onRetry,
  onSettle,
}: {
  mail: Mail;
  isEod: boolean;
  onRevise: () => void;
  onRetry: () => void;
  /** A lead records what the sending mailbox showed: sent, or not sent. */
  onSettle: (sent: boolean, why: string) => void;
}) {
  const me = useMe();
  const LEAD = me.lead;
  const [why, setWhy] = useState("");
  if (mail.status === "draft") return null;
  if (mail.status === "sending")
    return (
      <div className="flex items-center gap-2 rounded-lg bg-surface-2 p-[max(1.4rem,12px)] text-small text-ink">
        <span className="size-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />{" "}
        Sending&hellip;
      </div>
    );
  if (mail.status === "failed")
    return (
      <div className="rounded-lg bg-danger-soft p-[max(1.4rem,12px)] text-small">
        <p className="font-medium text-danger">Could not be sent</p>
        <p className="mt-1 text-ink-2">
          Nothing went to the desk. Try again when you are ready.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 font-medium text-brand hover:underline"
        >
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
        {/* The TA System's "Reconcile this email": a reason, then one of two answers. */}
        {LEAD && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              maxLength={300}
              placeholder="What you found in the mailbox"
              aria-label="What you found in the mailbox"
              className="h-[max(2.4rem,33px)] min-w-[12rem] flex-1 rounded-md border border-border bg-surface px-3 text-small text-ink outline-none focus-visible:border-brand"
            />
            <button
              type="button"
              disabled={!why.trim()}
              onClick={() => onSettle(true, why.trim())}
              className="h-[max(2.4rem,33px)] rounded-full bg-brand px-4 text-small font-medium text-white hover:bg-brand-strong disabled:opacity-40"
            >
              Verified sent
            </button>
            <button
              type="button"
              disabled={!why.trim()}
              onClick={() => onSettle(false, why.trim())}
              className="h-[max(2.4rem,33px)] rounded-full border border-border-strong px-4 text-small font-medium text-ink hover:bg-surface-2 disabled:opacity-40"
            >
              Verified not sent
            </button>
          </div>
        )}
      </div>
    );
  const own = mail.by === me.name;
  return (
    <div className="rounded-lg bg-success-soft p-[max(1.4rem,12px)] text-small">
      <p className="font-medium text-success">
        Sent {mail.sentAt ? clock(mail.sentAt) : ""} · {mail.day}
      </p>
      <p className="mt-1 text-ink-2">
        To {mail.to[0]}
        {mail.cc.length ? `, ${mail.cc.length} on Cc` : ""}. Read only, kept 31
        days.
      </p>
      {isEod && own && !mail.revisedOf && (
        <button
          type="button"
          onClick={onRevise}
          className="mt-2 font-medium text-brand hover:underline"
        >
          Edit and resend
        </button>
      )}
    </div>
  );
}

/** Sent in the last 31 days: own emails for a TA, everyone's for a lead. */
function SentList({
  mails,
  onOpen,
  onMissed,
  onClose,
}: {
  mails: Mail[];
  onOpen: (m: Mail) => void;
  onMissed: (day: string) => void;
  onClose: () => void;
}) {
  const me = useMe();
  const LEAD = me.lead;
  const list = mails.filter(
    (m) => m.status !== "draft" && (LEAD || m.by === me.name),
  );
  const eodDays = new Set(
    mails
      .filter(
        (m) => m.kind === "eod" && m.status !== "draft" && m.by === me.name,
      )
      .map((m) => m.day),
  );
  // Only days that had candidates not yet sent (sample: 2 and 5 days back).
  const UNSENT: Record<number, number> = { 2: 3, 5: 1 };
  const missed = Object.keys(UNSENT)
    .map(Number)
    .map((n) => ({ d: daysAgo(n), cvs: UNSENT[n] }))
    .filter((x) => !eodDays.has(x.d));
  const label = (x: { d: string; cvs: number }) => `Missed · ${x.d} · ${x.cvs} CV${x.cvs === 1 ? "" : "s"}`;
  const [day, setDay] = useState(missed[0]?.d ?? "");
  const chip: Record<Status, string> = {
    draft: "",
    sending: "bg-surface-2 text-ink-2",
    sent: "bg-success-soft text-success",
    failed: "bg-danger-soft text-danger",
    uncertain: "bg-warn-soft text-warn",
  };
  const word: Record<Status, string> = {
    draft: "",
    sending: "Sending",
    sent: "Sent",
    failed: "Not sent",
    uncertain: "Not confirmed",
  };
  return (
    <div className="rounded-lg bg-surface-2 p-[max(1.4rem,12px)]">
      <div className="flex items-center">
        <h3 className="text-h3 font-medium text-ink">
          Sent in the last 31 days
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto text-ink-3 hover:text-ink"
        >
          <Cross />
        </button>
      </div>
      <ul className="mt-[max(0.8rem,8px)] space-y-2">
        {list.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onOpen(m)}
              className="flex w-full items-center gap-2 rounded-sm bg-surface px-[max(1rem,10px)] py-[max(0.7rem,7px)] text-left text-small hover:shadow-card"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-ink">
                  {m.revisedOf
                    ? "Correction"
                    : m.kind === "eod"
                      ? "End of day"
                      : `Midday ${m.n}`}{" "}
                  · {m.day}
                </span>
                <span className="block text-caption text-ink-3">
                  {(m.rows?.length ?? 0)
                    ? `${m.rows!.length} CV${m.rows!.length === 1 ? "" : "s"}`
                    : "Activity only"}
                  {LEAD && ` · ${m.by}`}
                </span>
              </span>
              <span className={CHIP + " " + chip[m.status]}>
                {word[m.status]}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {missed.length > 0 && (
        <div className="mt-[max(1rem,10px)] border-t border-border pt-[max(0.9rem,8px)] text-small">
          <p className="text-ink-2">
            Missed an End of day? Send it for an earlier day.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <select
              value={day}
              onChange={(e) => setDay(e.target.value)}
              aria-label="Which day"
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-small text-ink outline-none focus:ring-2 focus:ring-brand/30"
            >
              {missed.map((x) => (
                <option key={x.d} value={x.d}>{label(x)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onMissed(day)}
              className="rounded-full bg-ink px-[max(1rem,12px)] py-1.5 text-small font-medium text-white hover:bg-marker"
            >
              Write it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function attachments(mail: Mail, rows: Cand[], isEod: boolean) {
  const cvs =
    mail.noCvs && !isEod
      ? []
      : rows
          .filter((r) => r.cv === "ready" && !r.manual)
          .map((r) => `${r.name} - Career141.pdf`);
  // The Excel workbook goes with the End of day only.
  return isEod && rows.length
    ? [...cvs, `${OPENING.client} - ${OPENING.title}.xlsx`]
    : cvs;
}

function attachLine(
  files: string[],
  rows: Cand[],
  isEod: boolean,
  noCvs: boolean,
) {
  if (!isEod && noCvs) return "No attachments";
  const cvs = files.filter((f) => f.endsWith(".pdf")).length;
  const parts = [
    cvs ? `${cvs} prepared CV${cvs === 1 ? "" : "s"}` : "",
    files.some((f) => f.endsWith(".xlsx")) ? "Excel workbook" : "",
  ].filter(Boolean);
  const toMake = rows.filter((r) => r.cv !== "ready").length;
  const head = parts.length
    ? parts.join(" + ") + " attached"
    : "Nothing attached";
  return toMake
    ? `${head} · ${toMake} CV${toMake === 1 ? "" : "s"} to make`
    : head;
}

/** A To or Cc line: chips with a cross, and "+ add" that turns into a box. Nobody
 *  is on both lines (the TA System's rule). */
function Recipients({
  label,
  list,
  other,
  readOnly,
  onChange,
  onBad,
}: {
  label: string;
  list: string[];
  other: string[];
  readOnly: boolean;
  onChange: (l: string[]) => void;
  onBad: (m: string) => void;
}) {
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
        <span
          key={who}
          className="flex items-center gap-1.5 rounded-full bg-surface-2 py-[max(0.3rem,4px)] pl-[max(0.8rem,9px)] pr-[max(0.5rem,6px)] text-ink"
        >
          {who}
          {!readOnly && (
            <button
              type="button"
              aria-label={`Take ${who} off`}
              onClick={() => onChange(list.filter((x) => x !== who))}
              className="text-ink-3 hover:text-ink"
            >
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
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-ink-3 hover:text-ink"
          >
            + add
          </button>
        ))}
    </div>
  );
}

/** The greeting or the sign-off: reads as the email's own text, edits in place. */
function Para({
  value,
  onChange,
  label,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  readOnly: boolean;
}) {
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

/** One check. Not done: the amber ring and the way to settle it. Being saved: a
 *  turning arc. Done: at that moment the circle fills, the tick draws itself and a
 *  ring ripples out (owner, 14 Nov 2026: "a small tick animation... a moving
 *  animation with GSAP", not a plain "saved"). Drawn done when the panel opens. */
function Check({
  done,
  busy,
  label,
  note,
  onFix,
  soft,
}: {
  done: boolean;
  busy?: boolean;
  label: string;
  note?: string;
  onFix?: () => void;
  soft?: boolean;
}) {
  const el = useRef<HTMLLIElement>(null);
  const was = useRef(done);
  const spin = useRef<gsap.core.Tween | null>(null);
  useGSAP(
    () => {
      const q = (k: string) => el.current!.querySelector(`[data-${k}]`);
      spin.current?.kill();
      spin.current = busy
        ? gsap.to(q("spin"), {
            rotation: 360,
            transformOrigin: "50% 50%",
            duration: 0.8,
            ease: "none",
            repeat: -1,
          })
        : null;
      if (done && !was.current)
        gsap
          .timeline()
          .fromTo(
            q("fill"),
            { scale: 0 },
            { scale: 1, duration: DUR.base, ease: EASE.pop },
          )
          .fromTo(
            q("tick"),
            { strokeDashoffset: 1 },
            { strokeDashoffset: 0, duration: 0.35, ease: "power2.out" },
            "-=0.12",
          )
          .fromTo(
            q("ring"),
            { scale: 1, opacity: 0.6 },
            { scale: 2.1, opacity: 0, duration: 0.7, ease: "power2.out" },
            0.05,
          )
          .fromTo(
            q("label"),
            { x: -4 },
            { x: 0, duration: DUR.base, ease: EASE.out },
            0.1,
          );
      was.current = done;
    },
    { dependencies: [done, busy], scope: el, revertOnUpdate: false },
  );
  return (
    <li
      ref={el}
      className={
        "flex items-center gap-[max(0.6rem,7px)] " +
        (done || soft || busy ? "text-ink" : "text-warn")
      }
    >
      <span
        className={
          "relative flex size-[max(1.4rem,17px)] shrink-0 items-center justify-center rounded-full " +
          (done || busy ? "" : "border-[1.5px] border-warn")
        }
      >
        <span
          data-ring
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-2 border-brand opacity-0"
        />
        <span
          data-fill
          aria-hidden="true"
          className={
            "absolute inset-0 rounded-full bg-brand " + (done ? "" : "scale-0")
          }
        />
        {busy && (
          <svg
            data-spin
            viewBox="0 0 24 24"
            fill="none"
            className="absolute inset-0 size-full text-brand"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeOpacity="0.2"
              strokeWidth="2.5"
            />
            <path
              d="M12 2a10 10 0 0 1 10 10"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        )}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="relative size-3/5 text-white"
          aria-hidden="true"
        >
          <path
            data-tick
            d="m5 12.5 4.5 4.5L19 7.5"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={done ? 0 : 1}
          />
        </svg>
      </span>
      <span data-label className="min-w-0 flex-1">
        {label}
        {note && <span className="text-ink-3"> · {note}</span>}
        <span className="sr-only">
          {done ? " - done" : busy ? " - checking" : " - to do"}
        </span>
      </span>
      {!done && !busy && onFix && (
        <button
          type="button"
          onClick={onFix}
          className="shrink-0 text-caption font-medium text-brand hover:underline"
        >
          Open
        </button>
      )}
    </li>
  );
}

function Tick({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 px-1 text-small text-ink-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-brand"
      />
      {label}
    </label>
  );
}

const svg = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;
const ClipIcon = () => (
  <svg {...svg} className="size-[1.2em] shrink-0 text-ink-3">
    <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" />
  </svg>
);
const RocketIcon = () => (
  <svg {...svg} className="size-full">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
);
const Chevron = ({ open }: { open: boolean }) => (
  <svg
    {...svg}
    className={
      "size-[1em] shrink-0 text-ink-3 transition-transform " +
      (open ? "rotate-180" : "")
    }
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);
