// The sample desk, and AURA's answers on the TA Lead, Director and Ops homes (owner 19 Nov 2026: the lead
// "is the key person who manages the entire desk"; she does not start a workday, she
// asks AURA what is going on and how each TA is doing). Read from the words, no model
// yet - the same sample desk the dashboard shows (homeData.ts). With the backend this is
// one small read per question and the Haiku answer (E5, like the TA's Today chat).
import type { Answer, Line } from "./desk";

export type TaToday = { name: string; ini: string; roles: string[]; li: [number, number]; noLink: number; pipeline: number; cvs: number; sets: number; alerts: number; day: { started?: string; done: number; of: number; eod?: string } };
export const TEAM: TaToday[] = [
  { name: "Chathura Sampath", ini: "CS", roles: ["SAP Transformation", "Finance Manager", "Brand Manager"], li: [2, 3], noLink: 1, pipeline: 14, cvs: 12, sets: 3, alerts: 2, day: { started: "9:05", done: 4, of: 6 } },
  { name: "Dilini Ranasinghe", ini: "DR", roles: ["HR Business Partner", "Senior Accountant"], li: [2, 2], noLink: 0, pipeline: 9, cvs: 16, sets: 4, alerts: 1, day: { started: "8:52", done: 6, of: 6, eod: "5:41" } },
  { name: "Sewwandi Perera", ini: "SP", roles: ["Quality Assurance Lead", "Sales Executive"], li: [1, 2], noLink: 0, pipeline: 6, cvs: 7, sets: 1, alerts: 4, day: { started: "9:30", done: 2, of: 6 } },
  { name: "Dinuka Kumara", ini: "DK", roles: ["Plant Engineer", "SAP Transformation", "Production Planner"], li: [3, 3], noLink: 0, pipeline: 11, cvs: 9, sets: 2, alerts: 3, day: { started: "9:12", done: 5, of: 7 } },
  { name: "Ravindu Mendis", ini: "RM", roles: ["Store Manager"], li: [0, 1], noLink: 1, pipeline: 3, cvs: 4, sets: 0, alerts: 1, day: { done: 0, of: 0 } },
];
export const CVS_GOAL = 10; // fewer CVs today than this reads red (the old lead dashboard)
export const ALERTS_MAX = 3; // more alerts than this reads red
export const DECIDE = [
  { title: "Head of Logistics", client: "Maersk", why: "Nobody assigned", red: true },
  { title: "Quality Assurance Lead", client: "Brandix", why: "JD not approved by Sewwandi" },
  { title: "Store Manager", client: "Cargills", why: "Day 52 against a P4 target of 45 — close it or reassign" },
];
export const ROLES = [
  { title: "Senior Manager — SAP", client: "PGP Glass", tas: "Chathura, Dinuka", on: true, fu: 6, days: 9 },
  { title: "Finance Manager", client: "Hayleys Fabric", tas: "Chathura", on: true, fu: 4, days: 7 },
  { title: "HR Business Partner", client: "Dialog Axiata", tas: "Dilini", on: true, fu: 3, days: 9 },
  { title: "Senior Accountant", client: "John Keells", tas: "Dilini, Sewwandi", on: true, fu: 2, days: 8 },
  { title: "Quality Assurance Lead", client: "Brandix", tas: "Sewwandi", on: false, fu: 1, days: 5 },
  { title: "Plant Engineer", client: "Lanka Tiles", tas: "Dinuka", on: true, fu: 2, days: 11 },
  { title: "Head of Logistics", client: "Maersk", tas: "Unassigned", on: false, fu: 0, days: 4 },
  { title: "Store Manager", client: "Cargills", tas: "Ravindu", on: false, fu: 1, days: 52 },
];

export const WAITING = [
  { who: "Kasun Perera", client: "PGP Glass", title: "Senior Manager — SAP", set: 3, ta: "Chathura" },
  { who: "Nimali Fernando", client: "Hayleys Fabric", title: "Finance Manager", set: 2, ta: "Chathura" },
  { who: "Ishara Silva", client: "Dialog Axiata", title: "HR Business Partner", set: 4, ta: "Dilini" },
];
export const STAGES: [string, number][] = [
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
export const CLIENTS = [
  { name: "PGP Glass", open: 1, sets: 3, value: 1850 },
  { name: "Hayleys Fabric", open: 1, sets: 2, value: 960 },
  { name: "Dialog Axiata", open: 1, sets: 4, value: 1400 },
  { name: "John Keells", open: 1, sets: 2, value: 720 },
  { name: "Lanka Tiles", open: 1, sets: 1, value: 0 },
  { name: "Cargills", open: 1, sets: 0, value: 0 },
];

export const WITH_CLIENT = [
  { who: "Ruwan Jayasinghe", client: "Dialog Axiata", title: "HR Business Partner", days: 4 },
  { who: "Tharushi Bandara", client: "John Keells", title: "Senior Accountant", days: 1 },
  { who: "Sahan Wickramasinghe", client: "PGP Glass", title: "Senior Manager — SAP", days: 0 },
];
export const INTERVIEWS = [
  { who: "Nadeesha Perera", title: "Finance Manager", when: "Mon 17 Nov, 10:30", confirmed: true },
  { who: "Pasindu Silva", title: "Plant Engineer", when: "Mon 17 Nov, 14:00", confirmed: false },
  { who: "Hiruni Fernando", title: "HR Business Partner", when: "Tue 18 Nov, 11:00", confirmed: true },
];
export const CHASE = [
  { what: "Dialog Axiata has not answered on Ruwan's set for 4 days", action: "Chase the client" },
  { what: "Pasindu Silva's interview is Monday — not contacted yet", action: "Call Pasindu" },
];

export type HomeRole = "Lead" | "Director" | "Ops";

/** The lead's desk: the real one from ui/lead:desk when signed in, else the sample. */
export type LeadDesk = {
  team: TaToday[];
  decide: { title: string; client: string; why: string; red?: boolean }[];
  roles: { title: string; client: string; tas: string; on: boolean; fu: number; days: number }[];
};
export const SAMPLE_DESK: LeadDesk = { team: TEAM, decide: DECIDE, roles: ROLES };

const first = (t: TaToday) => t.name.split(" ")[0];
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

/** One TA as a row: where their day is. */
export const dayLine = (t: TaToday): Line => ({
  main: t.name,
  meta: t.day.eod ? `EOD sent ${t.day.eod}` : t.day.started ? `Started ${t.day.started} · ${t.day.done} of ${t.day.of} checks` : "Not started today",
  tag: t.day.eod ? { text: "Done", tone: "brand" } : !t.day.started ? { text: "Not started", tone: "danger" } : t.day.done < t.day.of / 2 ? { text: "Behind", tone: "warn" } : { text: "On track", tone: "muted" },
});

/** What the lead sees first: who is behind and what waits. */
function leadBrief(d: LeadDesk): Answer {
  const idle = d.team.filter((t) => !t.day.started);
  const low = d.team.filter((t) => t.cvs < CVS_GOAL);
  const busy = d.team.filter((t) => t.alerts > ALERTS_MAX);
  const warn = [
    ...idle.map((t) => `${first(t)} has not started`),
    low.length ? `${plural(low.length, "TA")} under ${CVS_GOAL} CVs today` : "",
    ...busy.map((t) => `${first(t)} has ${t.alerts} alerts`),
  ].filter(Boolean);
  return {
    say: `${plural(d.team.length - idle.length, "TA")} of ${d.team.length} started, ${plural(d.team.filter((t) => t.day.eod).length, "EOD")} sent, ${plural(d.decide.length, "decision")} waiting on you.`,
    warn,
    rows: d.decide.map((d) => ({ main: d.title, meta: `${d.client} · ${d.why}`, tag: { text: "Decide", tone: d.red ? "danger" : "warn" } })),
  };
}

function leadAnswer(q: string, d: LeadDesk): Answer {
  const ta = d.team.find((t) => q.includes(first(t).toLowerCase()) || q.includes(t.name.toLowerCase()));
  if (ta) {
    const warn = [
      !ta.day.started ? "Not started today" : "",
      ta.cvs < CVS_GOAL ? `Under ${CVS_GOAL} CVs today` : "",
      ta.alerts > ALERTS_MAX ? `${ta.alerts} alerts open` : "",
      ta.noLink ? `${plural(ta.noLink, "role")} without a LinkedIn link` : "",
    ].filter(Boolean);
    return {
      say: `${first(ta)}: ${dayLine(ta).meta}. ${plural(ta.roles.length, "role")}, LinkedIn on ${ta.li[0]} of ${ta.li[1]}.`,
      stats: [
        [String(ta.pipeline), "in the pipeline"],
        [String(ta.cvs), "CVs today"],
        [String(ta.sets), "sets"],
        [String(ta.alerts), "alerts"],
      ],
      chips: ta.roles,
      warn,
    };
  }
  if (has(q, "not started", "hasn't", "has not", "who started", "absent", "late")) {
    const idle = d.team.filter((t) => !t.day.started);
    return idle.length ? { say: `${plural(idle.length, "TA")} ${idle.length === 1 ? "has" : "have"} not started today.`, rows: idle.map(dayLine) } : { say: "Everyone has started today." };
  }
  if (has(q, "decision", "decide", "needs me", "need me", "waiting on me")) {
    return { say: `${plural(d.decide.length, "thing")} ${d.decide.length === 1 ? "needs" : "need"} your decision.`, rows: leadBrief(d).rows };
  }
  if (has(q, "linkedin", "not posted", "no link")) {
    const off = d.roles.filter((r) => !r.on);
    return { say: `${plural(off.length, "role")} ${off.length === 1 ? "is" : "are"} not on LinkedIn.`, rows: off.map((r) => ({ main: r.title, meta: `${r.client} · ${r.tas} · day ${r.days}`, tag: { text: "Not on LinkedIn", tone: "warn" } })) };
  }
  if (has(q, "cv", "under 10", "low")) {
    const low = d.team.filter((t) => t.cvs < CVS_GOAL).sort((a, b) => a.cvs - b.cvs);
    return { say: low.length ? `${plural(low.length, "TA")} under ${CVS_GOAL} CVs today.` : `Everyone has ${CVS_GOAL} CVs or more today.`, rows: low.map((t) => ({ main: t.name, meta: `${t.cvs} CVs today · ${t.pipeline} in the pipeline`, tag: { text: `${CVS_GOAL - t.cvs} short`, tone: "danger" } })) };
  }
  if (has(q, "alert")) {
    const by = [...d.team].sort((a, b) => b.alerts - a.alerts);
    return { say: `${d.team.reduce((n, t) => n + t.alerts, 0)} alerts open across the team.`, rows: by.map((t) => ({ main: t.name, meta: `${plural(t.alerts, "alert")}`, tag: t.alerts > ALERTS_MAX ? { text: "Too many", tone: "danger" } : undefined })) };
  }
  if (has(q, "eod", "end of day", "email")) {
    const sent = d.team.filter((t) => t.day.eod);
    return { say: `${plural(sent.length, "EOD")} sent so far, ${d.team.length - sent.length} to come.`, rows: d.team.map(dayLine) };
  }
  if (has(q, "role", "opening", "position", "job")) {
    return { say: `${plural(d.roles.length, "open role")} across the team.`, rows: d.roles.map((r) => ({ main: r.title, meta: `${r.client} · ${r.tas} · day ${r.days}`, tag: r.on ? { text: `${r.fu} in follow-up`, tone: "muted" } : { text: "Not on LinkedIn", tone: "warn" } })) };
  }
  if (has(q, "check", "team", "status", "everyone", "how is", "how are", "today", "going on", "progress")) {
    return { say: "Here is the team right now.", rows: d.team.map(dayLine) };
  }
  return { say: "I can tell you how each TA is doing, who has not started, the checks, CVs, alerts, EODs, open roles and what needs your decision. Try a name, like “How is Chathura doing?”" };
}

function directorAnswer(q: string): Answer {
  const w = WAITING.find((x) => q.includes(x.who.toLowerCase()) || q.includes(x.who.split(" ")[0].toLowerCase()));
  if (w) return { say: `${w.who} is set ${w.set} for ${w.title} at ${w.client}, sent by ${w.ta}.`, rows: [{ main: w.who, meta: `${w.title} · ${w.client} · set ${w.set}`, tag: { text: "Review", tone: "warn" } }] };
  if (has(q, "set", "review", "waiting", "shortlist", "me")) {
    return { say: `${plural(WAITING.length, "set")} ${WAITING.length === 1 ? "waits" : "wait"} on your review.`, rows: WAITING.map((w) => ({ main: w.who, meta: `${w.title} · ${w.client} · set ${w.set} · ${w.ta}`, tag: { text: "Review", tone: "warn" } })) };
  }
  if (has(q, "where", "stage", "pipeline", "everyone", "candidate")) {
    return { say: `${STAGES.reduce((n, [, v]) => n + v, 0)} candidates across the stages.`, rows: STAGES.map(([s, n]) => ({ main: s, meta: plural(n, "candidate") })) };
  }
  if (has(q, "client", "company")) {
    return { say: `${plural(CLIENTS.length, "client")} with open roles.`, rows: CLIENTS.map((c) => ({ main: c.name, meta: `${plural(c.open, "open role")} · ${plural(c.sets, "set")} sent` })) };
  }
  return { say: "Ask me which sets wait on your review, where every candidate is, or how each client stands." };
}

function opsAnswer(q: string): Answer {
  const w = WITH_CLIENT.find((x) => q.includes(x.who.toLowerCase()) || q.includes(x.who.split(" ")[0].toLowerCase()));
  if (w) return { say: `${w.who}'s set for ${w.title} is with ${w.client}${w.days ? `, ${plural(w.days, "day")} without an answer` : ", sent today"}.`, rows: [{ main: w.who, meta: `${w.title} · ${w.client}`, tag: w.days >= 3 ? { text: "Chase the client", tone: "danger" } : { text: "Waiting", tone: "muted" } }] };
  if (has(q, "interview")) {
    return { say: `${plural(INTERVIEWS.length, "interview")} to coordinate.`, rows: INTERVIEWS.map((i) => ({ main: i.who, meta: `${i.title} · ${i.when}`, tag: i.confirmed ? { text: "Confirmed", tone: "brand" } : { text: "Not confirmed", tone: "warn" } })) };
  }
  if (has(q, "chase", "first", "to do", "todo", "next")) {
    return { say: `${plural(CHASE.length, "thing")} to chase.`, rows: CHASE.map((c) => ({ main: c.action, meta: c.what, tag: { text: "Chase", tone: "warn" } })) };
  }
  if (has(q, "client", "feedback", "waiting", "position", "my")) {
    return { say: `${plural(WITH_CLIENT.length, "set")} with clients.`, rows: WITH_CLIENT.map((w) => ({ main: w.who, meta: `${w.title} · ${w.client}`, tag: w.days >= 3 ? { text: `${w.days} days quiet`, tone: "danger" } : { text: w.days ? `${plural(w.days, "day")}` : "Today", tone: "muted" } })) };
  }
  return { say: "Ask me what waits on client feedback, the interviews to arrange, or what to chase first." };
}

/** AURA's first words when the chat opens. */
export function brief(role: HomeRole, d: LeadDesk = SAMPLE_DESK): Answer {
  if (role === "Lead") return leadBrief(d);
  if (role === "Director") return { ...directorAnswer("review"), say: `${plural(WAITING.length, "set")} ${WAITING.length === 1 ? "waits" : "wait"} on your review today.` };
  return { ...opsAnswer("chase"), say: `${plural(CHASE.length, "thing")} to chase and ${plural(INTERVIEWS.filter((i) => !i.confirmed).length, "interview")} not confirmed.` };
}

export function answer(role: HomeRole, text: string, d: LeadDesk = SAMPLE_DESK): Answer {
  const q = text.toLowerCase();
  return role === "Lead" ? leadAnswer(q, d) : role === "Director" ? directorAnswer(q) : opsAnswer(q);
}

export const SUGGEST: Record<HomeRole, string[]> = {
  Lead: ["Team checks now", "Who hasn't started?", "What needs a decision?", "Who is under 10 CVs?", "Roles not on LinkedIn"],
  Director: ["Sets waiting for me", "Where is everyone?", "By client"],
  Ops: ["What to chase first", "Interviews to arrange", "Waiting on client feedback"],
};

/** The three numbers under Start chat. */
export function startStats(role: HomeRole, d: LeadDesk = SAMPLE_DESK): [string, string][] {
  if (role === "Lead")
    return [
      [String(d.team.filter((t) => t.day.started).length), `of ${d.team.length} TAs started`],
      [String(d.team.filter((t) => t.day.eod).length), "EODs sent"],
      [String(d.decide.length), "decisions waiting"],
    ];
  if (role === "Director")
    return [
      [String(WAITING.length), "sets to review"],
      [String(STAGES.find(([s]) => s === "Interview")?.[1] ?? 0), "in interviews"],
      [String(STAGES.find(([s]) => s === "Placed")?.[1] ?? 0), "placed"],
    ];
  return [
    [String(WITH_CLIENT.length), "with clients"],
    [String(INTERVIEWS.length), "interviews to arrange"],
    [String(CHASE.length), "to chase"],
  ];
}
