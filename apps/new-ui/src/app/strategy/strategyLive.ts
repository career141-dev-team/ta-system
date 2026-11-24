"use client";

// The Strategy Planner on real data (D10a, 20 Nov 2026; ta-system #41). Signed in as
// someone who gives strategies, the planner's shared store (data.ts) is filled from
// the old server's /api/ui/strategy - the jobs being worked, the strategy list, every
// row, the TAs and their week - and each change a lead makes on the Board, the
// Matrix, a job's plan or the Strategy list is sent as the old planner's own steps,
// then everything is read again. Other screens that read the store (the TA's
// Strategies tab, Today) only read it. The pure half is strategyRules.ts.

import { useEffect, useState } from "react";
import { cvHeaders, OLD_SERVER } from "@/lib/backend";
import { petSay } from "@/lib/pet";
import { JOBS, TAS, WEEK, saveRow, setCatalogue, setRows, setToday, type Entry, type Row, type TaId } from "./data";
import { screenRow, stepsFor, weekOf, ymd, mondayOf, type LiveRow } from "./strategyRules";

const URL_ST = `${OLD_SERVER}/api/ui/strategy`;
const NO_LINE = "Could not reach the TA System. Check your connection and try again.";
const CHIPS = ["bg-violet-soft text-violet", "bg-brand-soft text-brand", "bg-warn-soft text-warn", "bg-info-soft text-info", "bg-sticky-sky text-info"];
const TARGET: Record<string, number> = { P1: 14, P2: 21, P3: 30, P4: 45, P5: 60 };

type Planner = {
  canManage: boolean;
  strategies: { id: string; name: string; group: string; description: string; active: boolean; sortOrder: number }[];
  jobs: { id: string; client: string; title: string; priority: string; tas: string[]; assignedAt: number | null; createdAt: number }[];
  tas: { id: string; name: string; week: number }[];
  rows: LiveRow[];
};

/** Filled once the old planner has been read; until then the screens show the sample. */
let live: Planner | null = null;
const idByName = () => new Map((live?.strategies ?? []).map((s) => [s.name, s.id]));

async function call(body: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(URL_ST, {
    method: body.do ? "POST" : "GET",
    headers: { ...(body.do ? { "Content-Type": "application/json" } : {}), ...(await cvHeaders(URL_ST)) },
    ...(body.do ? { body: JSON.stringify(body) } : {}),
  }).catch(() => null);
  const got = (await res?.json().catch(() => null)) as ({ ok?: boolean; message?: string } & Partial<Planner>) | null;
  if (!body.do && got?.ok && got.rows) {
    live = got as Planner;
    fill(live);
  }
  return { ok: !!got?.ok, message: got?.message ?? NO_LINE };
}

/** The old planner into the shared store, in its screens' shape. */
function fill(p: Planner) {
  const now = Date.now();
  const wk = weekOf(now);
  WEEK.splice(0, WEEK.length, ...wk.labels);
  setToday(wk.today);
  TAS.splice(0, TAS.length, ...p.tas.map((t, i) => ({ id: t.id as TaId, name: t.name, first: t.name.split(/\s+/)[0], week: t.week, chip: CHIPS[i % CHIPS.length] })));
  JOBS.splice(0, JOBS.length, ...p.jobs.map((j) => {
    const from = j.assignedAt ?? j.createdAt;
    return {
      id: j.id, client: j.client, title: j.title, p: Number(j.priority.replace("P", "")) || 3, industry: "",
      assigned: new Date(from + 5.5 * 3_600_000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
      tas: j.tas as TaId[], day: Math.max(0, Math.floor((now - from) / 86_400_000)), of: TARGET[j.priority] ?? 30, pipeline: 0, shortlist: 0,
    };
  }));
  setCatalogue(() => [...p.strategies].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => ({ name: s.name, group: s.group || "Other", description: s.description, active: s.active })));
  setRows(() => p.rows.map((r) => screenRow(r, now)).filter((r): r is NonNullable<typeof r> => !!r) as Row[]);
}

/** Read the old planner once per visit while a planner screen is open; null = not
 *  signed in as someone who plans (the sample stays). */
export function usePlannerLive(on: boolean): { ready: boolean; error: string | null } {
  const [state, setState] = useState<{ ready: boolean; error: string | null }>({ ready: !!live, error: null });
  useEffect(() => {
    if (!on || live) return;
    void call({}).then((r) => setState({ ready: r.ok, error: r.ok ? null : r.message }));
  }, [on]);
  return state;
}
export const plannerIsLive = () => !!live;

/** Board day -> "YYYY-MM-DD" of this week. */
const dayOf = (i: number) => ymd(mondayOf(Date.now()) + i * 86_400_000 + 12 * 3_600_000);

/** Send the old steps for one job and strategy; then read everything again. */
async function send(job: string, name: string, was: Row | undefined, next: Row | undefined): Promise<void> {
  const strategyId = idByName().get(name);
  if (!strategyId) return void petSay("failed", `${name} is not on the strategy list yet - add it on the Strategy list first.`);
  for (const s of stepsFor(was, next, dayOf)) {
    const res = await call({ ...s, openingId: job, strategyId });
    if (!res.ok) {
      petSay("failed", res.message);
      break;
    }
  }
  await call({});
}

/** Put one strategy on a job as `next` (undefined = take it off), on the screen at
 *  once and, signed in, through the old planner. */
export function putRow(rows: Row[], job: string, name: string, next: Row | undefined) {
  const was = rows.find((x) => x.job === job && x.name === name);
  if (next) saveRow(next);
  else setRows((rs) => rs.filter((x) => !(x.job === job && x.name === name)));
  if (live) void send(job, name, was, next);
}

/** A job's whole plan replaced (Send on a job's plan). */
export async function putJob(rows: Row[], job: string, next: Row[]) {
  const was = rows.filter((x) => x.job === job);
  setRows((rs) => [...rs.filter((x) => x.job !== job), ...next]);
  if (!live) return;
  const names = [...new Set([...was, ...next].map((x) => x.name))];
  for (const n of names) await send(job, n, was.find((x) => x.name === n), next.find((x) => x.name === n));
}

/** The Strategy list: add, edit (name, heading, description) or retire / bring back. */
export async function putEntry(was: Entry | undefined, next: Entry) {
  setCatalogue((c) => (was ? c.map((e) => (e.name === was.name ? next : e)) : [...c, next]));
  if (!live) return;
  const id = was ? idByName().get(was.name) : undefined;
  const res = was && was.active !== next.active && id
    ? await call({ do: "active", id, active: next.active ? "1" : "0" })
    : await call({ do: "saveStrategy", ...(id ? { id } : {}), name: next.name, group: next.group, description: next.description, active: next.active ? "1" : "0" });
  petSay(res.ok ? "done" : "failed", res.message);
  await call({});
}
