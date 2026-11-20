// Today, the TA's desk (owner, 17 Nov 2026): when the day starts, AURA shows every open
// position the TA is on, with what the position already holds - Rashmi's strategies,
// the requirements, priority and target, the pipeline and its gaps - and the order to
// work them in, so the TA plans the day from it instead of typing it in again.
// Only what the old TA System already keeps on an opening (openings skill §2, §6, §9,
// §11; strategy-planner skill): priority P1-P5 and "day N of target", must-have skills,
// years, salary, work locations with how many people, hiring for (local/foreign) and
// gender, CVs today, in pipeline, waiting for Director Review, JD approved, a live
// LinkedIn post.
// ponytail: sample desk; with the backend this is one bounded read of the person's
// assigned open openings (jobs + jobAssignments + job details + strategy rows).

import type { Row, TaId } from "../strategy/data";
import type { WorkType } from "./plan";

export type Desk = {
  id: string;
  title: string;
  client: string;
  /** The work type it usually runs at; the TA changes it per day. */
  type: WorkType;
  /** The Strategy Planner's job id, where Rashmi's strategies for it live. */
  job?: string;
  p: 1 | 2 | 3 | 4 | 5;
  day: number;
  of: number;
  skills: string[];
  years: [number, number];
  salary: string;
  where: string;
  hiring: string;
  pipeline: number;
  cvsToday: number;
  director: number;
  jd: boolean;
  linkedin: boolean;
};

export const DESK: Desk[] = [
  {
    id: "sap", title: "SAP Transformation", client: "PGP Glass", type: "100%", job: "j1", p: 1, day: 9, of: 14,
    skills: ["SAP S/4HANA", "Business transformation", "Change management"], years: [10, 15], salary: "LKR 900k–1.3M",
    where: "Colombo · 1 person", hiring: "Local · any gender", pipeline: 31, cvsToday: 12, director: 3, jd: true, linkedin: true,
  },
  {
    id: "fin", title: "Finance Manager", client: "Hayleys", type: "Follow-up", job: "j4", p: 2, day: 7, of: 21,
    skills: ["CIMA / ACCA", "IFRS reporting", "Team of 5+"], years: [6, 10], salary: "LKR 450k–650k",
    where: "Horana · 1 person", hiring: "Local · any gender", pipeline: 40, cvsToday: 4, director: 4, jd: true, linkedin: true,
  },
  {
    id: "prod", title: "Production Executive", client: "MAS Holdings", type: "Follow-up", p: 4, day: 12, of: 45,
    skills: ["Production planning", "Lean", "Apparel"], years: [3, 6], salary: "LKR 180k–250k",
    where: "Biyagama · 2 people", hiring: "Local · any gender", pipeline: 7, cvsToday: 1, director: 0, jd: true, linkedin: false,
  },
  {
    id: "hr", title: "HR Business Partner", client: "Dialog", type: "100%", job: "j6", p: 3, day: 33, of: 30,
    skills: ["HR business partnering", "Employee relations", "Telecom"], years: [5, 8], salary: "LKR 400k–550k",
    where: "Colombo · 1 person", hiring: "Local · female", pipeline: 35, cvsToday: 0, director: 0, jd: false, linkedin: false,
  },
];

/** What is missing on a position, in the old Openings list's words. */
export function gaps(d: Desk): string[] {
  const out: string[] = [];
  if (!d.jd) out.push("JD not approved");
  if (!d.linkedin) out.push("No live LinkedIn post");
  if (d.cvsToday < 10) out.push(`${d.cvsToday} CVs today (under 10)`);
  return out;
}

/** Rashmi's strategies for this TA on this position (struck ones left out). */
export const strategiesOf = (rows: Row[], d: Desk, me?: TaId) =>
  me && d.job ? rows.filter((r) => r.job === d.job && r.ta === me && r.state !== "na") : [];

/** Due today: the planner's own label, or the day range covering today (Tue). */
export const dueToday = (r: Row) => r.when === "Today" || (!!r.days && r.days[0] <= 1 && r.days[1] >= 1);

export type Ranked = { d: Desk; type: WorkType; due: Row[]; over: number; reason: string; suggested: boolean };

/** The order AURA works them in (owner chose "Rules", 17 Nov 2026): the 100% positions,
 *  then P1 before P5, then past their target, then strategies due today; follow-up
 *  work after. Each gets a one-line reason. */
export function rank(desk: Desk[], typeOf: (d: Desk) => WorkType, rows: Row[], me?: TaId): Ranked[] {
  const out = desk.map((d) => {
    const type = typeOf(d);
    const due = strategiesOf(rows, d, me).filter((r) => r.state !== "done" && dueToday(r));
    const over = Math.max(0, d.day - d.of);
    const why = [
      type === "100%" ? "100% today" : type,
      `P${d.p}`,
      over ? `past its target by ${over} day${over === 1 ? "" : "s"}` : `day ${d.day} of ${d.of}`,
      ...(due.length ? [`${due.length} strateg${due.length === 1 ? "y" : "ies"} due today`] : []),
    ];
    return { d, type, due, over, reason: why.join(" · "), suggested: over > 0 || d.p <= 2 || due.length > 0 };
  });
  const key = (r: Ranked) => [r.type === "100%" ? 0 : 1, r.d.p, r.over ? 0 : 1, -r.due.length];
  return out.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  });
}

/** The one line under the chips: where to start, and what Rashmi wants done today. */
export function startLine(today: Ranked[]): string {
  if (!today.length) return "Tick a position and I’ll tell you where to start.";
  const due = today.flatMap((r) => r.due.map((x) => `${x.name} on ${r.d.title}`));
  return `Start with ${today[0].d.title} (${today[0].reason.split(" · ").slice(0, 2).join(", ")}).` + (due.length ? ` Due today from Rashmi: ${due.join(", ")}.` : "");
}

export type Tone = "brand" | "warn" | "danger" | "muted";
/** One row of an answer: a number (an order), the main words, a grey line under them,
 *  a chip on the right, a strategy that can be accepted, a page to open. */
export type Line = { n?: number; main: string; meta?: string; tag?: { text: string; tone: Tone }; accept?: Row; href?: string };
/** AURA's answer: one sentence, then any of a few numbers, chips and rows. */
/** `unknown`: the word rules did not know the question - signed in, AURA (Haiku) answers it (D11 item 5). */
export type Answer = { say: string; stats?: [string, string][]; chips?: string[]; warn?: string[]; rows?: Line[]; unknown?: true };

const STATE_TAG = (r: Row): Line["tag"] =>
  r.state === "waiting" ? { text: "To accept", tone: "warn" } : r.state === "working" ? { text: "Working", tone: "brand" } : r.state === "done" ? { text: "Done", tone: "muted" } : { text: "Not given yet", tone: "muted" };
const stratLine = (x: Row, on?: string): Line => ({ main: x.name, meta: [on, x.when ?? "no day"].filter(Boolean).join(" · "), tag: STATE_TAG(x), accept: x.state === "waiting" ? x : undefined });
const stats = (d: Desk): [string, string][] => [
  [String(d.pipeline), "in the pipeline"],
  [String(d.cvsToday), "CVs today"],
  [String(d.director), "for Director Review"],
];

/** AURA's short answers about the desk, read from the words (no model yet): a position
 *  by its name or client, then what is asked - strategies, requirements, pipeline - or
 *  all three in brief; "what first" for the order; "my strategies" across the desk;
 *  "EOD" for where today's emails wait. Null when the words are about none of it (then
 *  the plan or "not connected" answers).
 *  ponytail: word rules; with the backend, one model call over the same small read. */
export function answer(text: string, today: Ranked[], all: Ranked[], rows: Row[], me?: TaId): Answer | null {
  const t = text.toLowerCase();
  const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !["of", "the", "and"].includes(w));
  const said = words(t);
  const hit = all.find((r) => words(`${r.d.title} ${r.d.client}`).some((w) => said.includes(w)));
  const asks = {
    strategies: /strateg/.test(t),
    req: /requir|skill|salary|years|experience|location|where|need|looking for/.test(t),
    pipe: /pipeline|cvs?\b|director|gap|missing|jd|linkedin/.test(t),
    order: /\bfirst\b|priorit|order|start with|which (job|position)/.test(t),
    eod: /\beod\b|end of day|midday/.test(t),
  };
  if (!hit) {
    if (asks.order) {
      if (!today.length) return { say: "Tick a position first." };
      return {
        say: `Work them in this order:`,
        rows: today.map((r, i) => ({
          n: i + 1,
          main: r.d.title,
          meta: `${r.d.client} · ${r.type} · P${r.d.p} · day ${r.d.day} of ${r.d.of}`,
          tag: r.over ? { text: `${r.over} days past target`, tone: "danger" } : r.due.length ? { text: `${r.due.length} strateg${r.due.length === 1 ? "y" : "ies"} today`, tone: "brand" } : undefined,
          href: "/openings/demo",
        })),
      };
    }
    if (asks.strategies) {
      const mine = all.flatMap((r) => strategiesOf(rows, r.d, me).filter((x) => x.state !== "done").map((x) => stratLine(x, r.d.title)));
      if (!mine.length) return { say: "Rashmi hasn’t given you a strategy yet." };
      const waiting = mine.filter((l) => l.accept).length;
      return { say: `Rashmi gave you ${mine.length}${waiting ? ` — ${waiting} to accept` : ""}.`, rows: mine };
    }
    if (asks.eod) {
      if (!today.length) return { say: "Tick a position first." };
      return {
        say: "Your End of day emails are due at 6:00. Check each one, then send:",
        rows: today.map((r) => ({ main: r.d.title, meta: `${r.d.client} · Midday & EOD email`, href: "/openings/demo" })),
      };
    }
    return null;
  }
  const d = hit.d;
  const strat = strategiesOf(rows, d, me);
  const g = gaps(d);
  const sRows = strat.map((x) => stratLine(x));
  const req: Answer = d.skills.length
    ? {
        say: `${d.title} — what they need:`,
        chips: d.skills,
        rows: [
          { main: `${d.years[0]}–${d.years[1]} years`, meta: "Experience" },
          { main: d.salary, meta: "Salary" },
          { main: d.where, meta: "Where" },
          { main: d.hiring, meta: "Hiring" },
        ],
      }
    : { say: `${d.title} — the requirements are not read yet. They come from the JD once it is approved.` };
  if (asks.strategies) return strat.length ? { say: `${d.title} — Rashmi’s strategies:`, rows: sRows } : { say: `No strategy from Rashmi on ${d.title} yet.` };
  if (asks.req) return req;
  if (asks.pipe) return { say: `${d.title} — the pipeline:`, stats: stats(d), warn: g };
  return {
    say: `${d.title}, ${d.client} — ${hit.reason}.`,
    stats: stats(d),
    chips: d.skills,
    warn: g,
    rows: sRows.length ? sRows : [{ main: "No strategy from Rashmi yet", meta: "Strategies" }],
  };
}
