// convex/ui/planRules.ts
//
// The plain rules of AURA's day plan (owner 19 Nov 2026, docs/AURA-DAY-AGENT.md in
// ta-system-ui): what a task may hold, which state may follow which, and how a plan
// is summed up. No database here, so tests/uidoor.test.ts holds them.
// Phase 1: draft -> approved -> closed; a task is planned, doing, done, skipped or
// carried; nothing is ever deleted and every change is written to the task's history.

export const PLAN_KINDS = ["cv_review", "sourcing", "strategy", "follow_up", "director_review", "midday_email", "eod_email", "interview", "other"] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];
export const PRIORITIES = ["high", "normal", "low"] as const;
export type TaskState = "planned" | "doing" | "done" | "skipped" | "carried";
export type PlanState = "draft" | "approved" | "closed";

export const MAX_TASKS = 40;
export const DEFAULT_FINISH = 17 * 60; // 17:00, owner 19 Nov (Decision 5)

/** One task as the screen sends it while planning. */
export type DraftTask = {
  key: string;
  title: string;
  detail?: string;
  kind: string;
  jobId?: string;
  startMin: number;
  minutes: number;
  priority: string;
  dependsOn?: string;
};

/** Why a draft cannot be saved, in plain words; null when it can. */
export function draftRefusal(tasks: DraftTask[], finishMin: number, myJobs: Set<string>): string | null {
  if (tasks.length > MAX_TASKS) return `A day plan holds at most ${MAX_TASKS} tasks.`;
  if (!Number.isInteger(finishMin) || finishMin < 6 * 60 || finishMin > 23 * 60 + 59) return "The finish time must be between 6:00 and 23:59.";
  const keys = new Set<string>();
  for (const t of tasks) {
    const name = t.title.trim();
    if (!name) return "Every task needs a name.";
    if (name.length > 120) return `“${name.slice(0, 40)}…” is too long a name (120 characters at most).`;
    if ((t.detail ?? "").length > 500) return `The note on “${name}” is too long (500 characters at most).`;
    if (!t.key || keys.has(t.key)) return "Two tasks share one id. Reload the page.";
    keys.add(t.key);
    if (!(PLAN_KINDS as readonly string[]).includes(t.kind)) return `“${name}” has a kind the plan does not know.`;
    if (!(PRIORITIES as readonly string[]).includes(t.priority)) return `“${name}” has a priority the plan does not know.`;
    if (!Number.isInteger(t.startMin) || t.startMin < 0 || t.startMin > 23 * 60 + 59) return `“${name}” starts at a time that does not exist.`;
    if (!Number.isInteger(t.minutes) || t.minutes < 5 || t.minutes > 8 * 60) return `“${name}” must take between 5 minutes and 8 hours.`;
    if (t.jobId && !myJobs.has(t.jobId)) return `“${name}” is on a position you are not assigned to.`;
  }
  for (const t of tasks) if (t.dependsOn && !keys.has(t.dependsOn)) return `“${t.title.trim()}” waits on a task that is not in the plan.`;
  return null;
}

/** Which task states may follow which, by the TA's own hand. */
const NEXT: Record<TaskState, TaskState[]> = {
  planned: ["doing", "done", "skipped"],
  doing: ["planned", "done", "skipped"],
  done: ["planned"], // undo a tick
  skipped: ["planned"], // bring it back
  carried: [],
};
export function taskMoveRefusal(from: TaskState, to: TaskState, plan: PlanState, reason?: string): string | null {
  if (plan === "closed") return "Today's plan is closed.";
  if (!NEXT[from].includes(to)) return from === to ? "It is already like that." : "That task cannot change like that.";
  if (to === "skipped" && !(reason ?? "").trim()) return "Say why it is skipped.";
  return null;
}

/** "9:05" -> 545 and back; the plan keeps minutes after Colombo midnight. */
export const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

/** The plan in numbers: done of all (skipped tasks are not counted), and what is open. */
export function planTally(tasks: { state: TaskState }[]): { done: number; of: number; open: number } {
  const counted = tasks.filter((t) => t.state !== "skipped");
  const done = counted.filter((t) => t.state === "done").length;
  return { done, of: counted.length, open: counted.filter((t) => t.state === "planned" || t.state === "doing").length };
}

/** A line for a task's history. */
export type HistoryLine = { at: number; by: string; what: string };
export const historyOf = (history: HistoryLine[] | undefined, line: HistoryLine): HistoryLine[] => [...(history ?? []), line].slice(-50);

// ----- Phase 2: reminders (docs/AURA-DAY-AGENT.md section 6) -----
// For each open task, at most four moments, each sent once: starting, nearly due,
// overdue, still pending. One reminder reaches the TA at a time; a moment more than
// 15 minutes old when it is first looked at is marked and never sent (no burst of old
// reminders after approving mid-day). Snoozed tasks and a quiet plan wait.

export type Moment = "start" | "near" | "over" | "still";
export type RemTask = { key: string; title: string; kind: string; startMin: number; minutes: number; state: TaskState; snoozedUntil?: number; reminded?: string[] };
const MIN = 60_000;
export const FRESH_MS = 15 * MIN;
const RANK: Record<Moment, number> = { over: 0, still: 1, near: 2, start: 3 };

/** Colombo midnight of a plan's date, in ms. */
export const dayStartOf = (date: string) => Date.parse(`${date}T00:00:00+05:30`);

/** When each reminder of one task falls. */
export function momentsOf(t: RemTask, dayStart: number): { moment: Moment; at: number }[] {
  if (t.state !== "planned" && t.state !== "doing") return [];
  const start = dayStart + t.startMin * MIN;
  const end = start + t.minutes * MIN;
  const out: { moment: Moment; at: number }[] = [];
  if (t.state === "planned") out.push({ moment: "start", at: start });
  if (t.minutes >= 10) out.push({ moment: "near", at: Math.min(start + 0.8 * t.minutes * MIN, end - 5 * MIN) });
  out.push({ moment: "over", at: end + 5 * MIN }, { moment: "still", at: end + 35 * MIN });
  return out;
}

/** The words of a reminder: short, about this task only. */
export function reminderText(t: RemTask, moment: Moment, now: number, dayStart: number): string {
  const left = Math.max(1, Math.round((dayStart + (t.startMin + t.minutes) * MIN - now) / MIN));
  if (moment === "start") {
    if (t.kind === "midday_email") return "Time for the Midday email.";
    if (t.kind === "eod_email") return "Time to prepare your end-of-day email.";
    return `Next: ${t.title} (${t.minutes} min).`;
  }
  if (moment === "near") return `${left} minutes left on ${t.title}.`;
  if (moment === "over") return `${t.title} ran over. Need more time, or move it?`;
  return `${t.title} is still open.`;
}

const id = (key: string, m: Moment) => `${key}:${m}`;

/** What to send now (at most one) and which moments to mark as handled. */
export function dueNow(tasks: RemTask[], dayStart: number, now: number, quietUntil?: number): { deliver: { key: string; moment: Moment; text: string } | null; mark: Map<string, Moment[]> } {
  const mark = new Map<string, Moment[]>();
  if (quietUntil && now < quietUntil) return { deliver: null, mark };
  const due = tasks
    .flatMap((t) => momentsOf(t, dayStart).map((m) => ({ t, ...m })))
    .filter((d) => d.at <= now && !(d.t.reminded ?? []).includes(id(d.t.key, d.moment)) && !(d.t.snoozedUntil && now < d.t.snoozedUntil));
  const fresh = due.filter((d) => now - d.at <= FRESH_MS).sort((a, b) => RANK[a.moment] - RANK[b.moment] || a.at - b.at);
  const add = (key: string, m: Moment) => mark.set(key, [...(mark.get(key) ?? []), m]);
  for (const d of due) if (now - d.at > FRESH_MS) add(d.t.key, d.moment);
  const first = fresh[0];
  if (!first) return { deliver: null, mark };
  add(first.t.key, first.moment);
  // A task that ran over does not also get its older "nearly due" or "starting".
  for (const d of fresh) if (d.t.key === first.t.key && RANK[d.moment] > RANK[first.moment]) add(d.t.key, d.moment);
  return { deliver: { key: first.t.key, moment: first.moment, text: reminderText(first.t, first.moment, now, dayStart) }, mark };
}

/** When the plan should next wake: the earliest unsent moment still ahead (or one
 *  more fresh one waiting its turn, two minutes on), after any snooze or quiet. */
export function nextWake(tasks: RemTask[], dayStart: number, now: number, quietUntil?: number): number | null {
  let best: number | null = null;
  for (const t of tasks)
    for (const m of momentsOf(t, dayStart)) {
      if ((t.reminded ?? []).includes(id(t.key, m.moment))) continue;
      if (now - m.at > FRESH_MS) continue;
      let at = Math.max(m.at, t.snoozedUntil ?? 0, quietUntil ?? 0);
      if (at <= now) at = now + 2 * MIN;
      if (best === null || at < best) best = at;
    }
  return best;
}

/** The "plan not approved yet" nudge: one hour after the workday started. */
export const NUDGE_AFTER_MS = 60 * MIN;
