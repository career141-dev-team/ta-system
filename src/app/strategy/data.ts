// Strategy Planner sample data and rules (owner's designs S1-S4, 14 Nov 2026), on the
// old TA System's rules (strategy-planner skill): a lead picks strategies for an open
// job and puts a TA on each with a day; the TA accepts, works, marks done with a note
// and proof pictures, and submits; the lead reads each submission. A strategy can be
// struck "not for this job".
// ponytail: one in-memory store shared by the planner's screens for this visit; with
// the backend it is the strategies / strategyAssignments tables.

import { useSyncExternalStore } from "react";

export type TaId = "DR" | "CS" | "SP" | "DK" | "RM";
export type Ta = { id: TaId; name: string; first: string; week: number; chip: string };

/** The TAs, with how many strategies each already has this week (sample). */
export const TAS: Ta[] = [
  { id: "DR", name: "Dilini R.", first: "Dilini", week: 2, chip: "bg-violet-soft text-violet" },
  { id: "CS", name: "Chathura S.", first: "Chathura", week: 6, chip: "bg-brand-soft text-brand" },
  { id: "SP", name: "Sewwandi P.", first: "Sewwandi", week: 5, chip: "bg-warn-soft text-warn" },
  { id: "DK", name: "Dinuka K.", first: "Dinuka", week: 9, chip: "bg-info-soft text-info" },
  { id: "RM", name: "Ravindu M.", first: "Ravindu", week: 3, chip: "bg-sticky-sky text-info" },
];
export const ta = (id: TaId) => TAS.find((t) => t.id === id)!;
/** 8 or more in a week is full; the planner says so. */
export const busy = (t: Ta) => t.week >= 8;

const SEED = [
  { name: "LinkedIn", band: "bg-info-soft text-info", items: ["LinkedIn search", "Recruiter search & post", "InMail", "Designation search", "Previous post screening", "L search extraction", "LinkedIn post"] },
  { name: "Headhunting", band: "bg-violet-soft text-violet", items: ["Direct headhunt", "Company extraction", "Referral extraction", "Shortlist – company"] },
  { name: "Database & inbound", band: "bg-warn-soft text-warn", items: ["Repository", "SCOOP", "Smart Ad", "Email campaign"] },
  { name: "AI tools", band: "bg-brand-soft text-brand", items: ["AI search", "Aura", "ChatGPT", "Gemini"] },
] as const;

// The strategy list (old /strategy/manage): leads add, rename, retire and bring back.
// A retired one leaves the planner's choices; jobs that already use it keep it.
export type Entry = { name: string; group: string; description: string; active: boolean };
const BAND: Record<string, string> = Object.fromEntries(SEED.map((g) => [g.name, g.band]));
export const band = (group: string) => BAND[group] ?? "bg-surface-2 text-ink-2";
let catalogue: Entry[] = SEED.flatMap((g) => g.items.map((name) => ({ name, group: g.name, description: "", active: true })));
const catListeners = new Set<() => void>();
export const useCatalogue = () =>
  useSyncExternalStore(
    (f) => {
      catListeners.add(f);
      return () => void catListeners.delete(f);
    },
    () => catalogue,
    () => catalogue,
  );
export function setCatalogue(next: (c: Entry[]) => Entry[]) {
  catalogue = next(catalogue);
  catListeners.forEach((f) => f());
}
export type Group = { name: string; band: string; items: { name: string; retired: boolean }[] };
/** The groups to draw, headings in list order: what is on the list, plus a retired one
 *  that a job still uses (tagged retired). */
export function groupsOf(cat: Entry[], used: Row[]): Group[] {
  const out: Group[] = [];
  for (const e of cat) {
    if (!e.active && !used.some((r) => r.name === e.name)) continue;
    let g = out.find((x) => x.name === e.group);
    if (!g) out.push((g = { name: e.group, band: band(e.group), items: [] }));
    g.items.push({ name: e.name, retired: !e.active });
  }
  return out;
}
export const namesOf = (gs: Group[]) => gs.flatMap((g) => g.items.map((i) => i.name));

export type Job = { id: string; client: string; title: string; p: number; industry: string; assigned: string; tas: TaId[]; day: number; of: number; pipeline: number; shortlist: number };

export const JOBS: Job[] = [
  { id: "j1", client: "PGP Glass", title: "Senior Manager — SAP Business Transformation", p: 1, industry: "Manufacturing", assigned: "12 Nov", tas: ["CS", "DK"], day: 9, of: 14, pipeline: 31, shortlist: 3 },
  { id: "j2", client: "Maersk", title: "Head of Logistics", p: 1, industry: "Logistics", assigned: "11 Nov", tas: [], day: 4, of: 14, pipeline: 12, shortlist: 0 },
  { id: "j3", client: "Brandix", title: "Quality Assurance Lead", p: 2, industry: "Apparel", assigned: "10 Nov", tas: ["SP"], day: 5, of: 21, pipeline: 18, shortlist: 1 },
  { id: "j9", client: "Ceylon Biscuits", title: "Sales Executive", p: 4, industry: "FMCG", assigned: "9 Nov", tas: ["SP"], day: 6, of: 45, pipeline: 22, shortlist: 0 },
  { id: "j4", client: "Hayleys Fabric", title: "Finance Manager", p: 2, industry: "Textiles", assigned: "8 Nov", tas: ["CS"], day: 7, of: 21, pipeline: 40, shortlist: 4 },
  { id: "j5", client: "John Keells", title: "Senior Accountant", p: 3, industry: "Conglomerate", assigned: "7 Nov", tas: ["SP", "DR"], day: 8, of: 30, pipeline: 27, shortlist: 2 },
  { id: "j6", client: "Dialog Axiata", title: "HR Business Partner", p: 3, industry: "Telecom", assigned: "6 Nov", tas: ["DR"], day: 9, of: 30, pipeline: 35, shortlist: 5 },
  { id: "j10", client: "Softlogic", title: "Brand Manager", p: 3, industry: "Retail", assigned: "5 Nov", tas: ["CS"], day: 10, of: 30, pipeline: 9, shortlist: 0 },
  { id: "j7", client: "Lanka Tiles", title: "Plant Engineer", p: 3, industry: "Manufacturing", assigned: "4 Nov", tas: ["DK"], day: 11, of: 30, pipeline: 16, shortlist: 1 },
  { id: "j8", client: "Cargills", title: "Store Manager", p: 4, industry: "Retail", assigned: "3 Nov", tas: ["RM"], day: 12, of: 45, pipeline: 11, shortlist: 0 },
  { id: "j11", client: "MAS Holdings", title: "Production Planner", p: 5, industry: "Apparel", assigned: "2 Nov", tas: ["DK"], day: 13, of: 60, pipeline: 7, shortlist: 0 },
];
export const job = (id: string) => JOBS.find((j) => j.id === id);

/** The week on the team board (sample week; Tuesday is today). */
export const WEEK = ["Mon 11", "Tue 12", "Wed 13", "Thu 14", "Fri 15"];
export const TODAY = 1;
const dayName = (d: number) => WEEK[d].split(" ")[0];
/** "Today", "Fri", "Wed–Thu". */
export const whenLabel = (from: number, to = from) => (from === to ? (from === TODAY ? "Today" : dayName(from)) : `${dayName(from)}–${dayName(to)}`);

/** open = chosen, nobody on it; waiting = given, not accepted; working = accepted;
 *  done = done and submitted; na = struck, not for this job. */
export type State = "open" | "waiting" | "working" | "done" | "na";
export type Row = {
  job: string;
  name: string;
  state: State;
  ta?: TaId;
  /** Days on the week board (indexes into WEEK), and the label shown. */
  days?: [number, number];
  when?: string;
  assigned?: string;
  accepted?: string;
  done?: string;
  /** When it was submitted ("10 min ago"), and whether the lead has read it. */
  ago?: string;
  read?: boolean;
  note?: string;
  proofs?: number;
  cvs?: number;
};

const r = (job: string, name: string, state: State, ta?: TaId, extra: Partial<Row> = {}): Row => ({ job, name, state, ta, ...extra });
const DONE = { assigned: "8 Nov", accepted: "9 Nov", done: "11 Nov", read: true, proofs: 2, ago: "3 days ago", note: "Ran it as planned. Two people came through to TA Follow-up." };

let rows: Row[] = [
  r("j4", "LinkedIn search", "done", "CS", { ...DONE, read: false, ago: "Yesterday", note: "Searched 3 finance groups and saved 22 profiles; 9 approached, 3 replied." }),
  r("j4", "InMail", "working", "CS", { assigned: "8 Nov", accepted: "9 Nov", when: "Thu", days: [3, 3] }),
  r("j4", "Direct headhunt", "done", "DR", {
    ...DONE,
    read: false,
    ago: "10 min ago",
    proofs: 3,
    cvs: 2,
    note: "Called 14 finance managers at Brandix, MAS and Hirdaramani. 5 interested, 2 sent CVs (both now in TA Follow-up). Two asked to talk again in January.",
  }),
  r("j4", "Aura", "waiting", "DR", { assigned: "12 Nov", when: "Fri", days: [4, 4] }),
  // Today, so Chathura's desk on Today has a strategy due (17 Nov 2026).
  r("j4", "Company extraction", "waiting", "CS", { assigned: "12 Nov", when: "Today", days: [1, 1] }),
  r("j5", "LinkedIn search", "done", "SP", DONE),
  r("j5", "Recruiter search & post", "na"),
  r("j5", "Designation search", "done", "SP", { ...DONE, read: false, ago: "1 h ago", note: "Searched Senior Accountant and Finance Executive titles in Colombo; 11 approached, 4 interested." }),
  r("j5", "Company extraction", "working", "DR", { assigned: "7 Nov", accepted: "7 Nov", when: "Wed", days: [2, 2] }),
  r("j5", "Referral extraction", "working", "DR", { assigned: "7 Nov", accepted: "8 Nov", when: "Thu", days: [3, 3] }),
  ...["LinkedIn search", "Recruiter search & post", "InMail", "Direct headhunt", "AI search"].map((n) => r("j6", n, "done", "DR", DONE)),
  r("j6", "LinkedIn post", "done", "DR", { ...DONE, read: false, ago: "2 h ago", note: "Posted twice with the role card; 31 applied, 6 fit the brief." }),
  r("j7", "LinkedIn search", "done", "DK", DONE),
  r("j7", "Referral extraction", "done", "DK", { ...DONE, read: false, ago: "Yesterday", note: "Asked 6 plant engineers for names; 8 referrals, 3 called back." }),
  r("j7", "Direct headhunt", "working", "DK", { assigned: "5 Nov", accepted: "5 Nov", when: "Wed–Thu", days: [2, 3] }),
  r("j7", "Smart Ad", "open"),
  r("j8", "LinkedIn search", "waiting", "RM", { assigned: "11 Nov", when: "Today", days: [1, 1] }),
  r("j8", "Direct headhunt", "na"),
  r("j8", "Shortlist – company", "waiting", "RM", { assigned: "11 Nov", when: "Wed", days: [2, 2] }),
  r("j8", "Email campaign", "waiting", "RM", { assigned: "11 Nov", when: "Fri", days: [4, 4] }),
];

const listeners = new Set<() => void>();
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
export const useRows = () => useSyncExternalStore(subscribe, () => rows, () => rows);
export function setRows(next: (rs: Row[]) => Row[]) {
  rows = next(rows);
  listeners.forEach((f) => f());
}
/** Put one strategy on a job (replacing what it had). */
export const saveRow = (row: Row) => setRows((rs) => [...rs.filter((x) => !(x.job === row.job && x.name === row.name)), row]);
/** A job's plan saved but not sent ("Save draft"), kept for this visit. */
export const drafts = new Map<string, Row[]>();

/** "10 min ago" -> 10, "1 h ago" -> 60, "Yesterday" -> 1440: newest submissions first. */
export const minutesAgo = (ago = "") => (/min/.test(ago) ? parseInt(ago) : / h /.test(ago) ? parseInt(ago) * 60 : /Yesterday/.test(ago) ? 1440 : (parseInt(ago) || 9) * 1440);

// ----- Derived (pure, checked in data.check.ts) -----

/** The job's live rows (not struck), in the board bar's order: submitted, working,
 *  waiting, not started. */
const ORDER: State[] = ["done", "working", "waiting", "open"];
export const liveRows = (all: Row[], jobId: string) =>
  all.filter((x) => x.job === jobId && x.state !== "na").sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));

export type JobStatus = { kind: "none" | "waiting" | "progress" | "done"; text: string; count: number };
export function jobStatus(all: Row[], jobId: string): JobStatus {
  const live = liveRows(all, jobId);
  const waiting = live.filter((x) => x.state === "waiting").length;
  if (!live.length) return { kind: "none", text: "Not planned", count: 0 };
  if (waiting) return { kind: "waiting", text: `${waiting} waiting to accept`, count: live.length };
  if (live.every((x) => x.state === "done")) return { kind: "done", text: "All submitted", count: live.length };
  return { kind: "progress", text: "In progress", count: live.length };
}

export const counts = (all: Row[]) => ({
  unplanned: JOBS.filter((j) => !liveRows(all, j.id).length).length,
  waiting: all.filter((x) => x.state === "waiting").length,
  unread: all.filter((x) => x.state === "done" && x.read === false).length,
});

/** AURA's plan for a job: the two headhunting strategies to the TA with the lightest
 *  week, LinkedIn search and post to the job's own TA (or the lightest) today.
 *  ponytail: a fixed rule over sample numbers; with the backend, a model reading what
 *  reached the Director on similar roles and each TA's real week. */
export function auraPlan(j: Job): { text: string; rows: Row[] } {
  const light = [...TAS].sort((a, b) => a.week - b.week)[0];
  const own = j.tas.length ? ta(j.tas[0]) : light;
  const next = TODAY + 1;
  const rowsOut: Row[] = [
    { job: j.id, name: "LinkedIn search", state: "open", ta: own.id, when: "Today", days: [TODAY, TODAY] },
    { job: j.id, name: "LinkedIn post", state: "open", ta: own.id, when: "Today", days: [TODAY, TODAY] },
    { job: j.id, name: "Direct headhunt", state: "open", ta: light.id, when: whenLabel(next, next + 1), days: [next, next + 1] },
    { job: j.id, name: "Referral extraction", state: "open", ta: light.id, when: "Fri", days: [4, 4] },
  ];
  const text =
    own.id === light.id
      ? `All four for ${light.first} (lightest week): LinkedIn search and post today, then Direct headhunt and Referral extraction.`
      : `Direct headhunt and Referral extraction for ${light.first} (lightest week), LinkedIn search and post for ${own.first} today.`;
  return { text, rows: rowsOut };
}

/** What reached the Director on similar roles (sample). */
export const WORKED = [
  ["Direct headhunt", 4, 6],
  ["LinkedIn search", 5, 9],
  ["Referral extraction", 2, 5],
  ["Company extraction", 2, 6],
  ["Smart Ad", 0, 4],
] as const;
