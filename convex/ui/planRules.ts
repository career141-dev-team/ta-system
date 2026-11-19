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

// ── Phase 2: reminders (owner 19 Nov 2026, AURA-DAY-AGENT §6) ─────────────────
// Each open task gets at most four reminders, each once: at its start (if not begun),
// nearly due (80% of its time gone, at least 5 minutes before the end), overdue
// (5 minutes after the end) and still pending (30 minutes after that). Nothing before
// the plan is approved; done, skipped and carried tasks get nothing.
// ponytail: no snooze / quiet mode yet - phase 3 (talking to AURA) is what sets them.

export type Moment = "start" | "nearly" | "overdue" | "pending";
const URGENCY: Record<Moment, number> = { start: 1, nearly: 2, pending: 3, overdue: 4 };
const RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

export type RemindTask = { key: string; title: string; startMin: number; minutes: number; priority: string; state: TaskState; reminded?: string[] };

/** When each of a task's reminders falls, in minutes after Colombo midnight. */
export function momentsOf(t: Pick<RemindTask, "startMin" | "minutes" | "state">): { moment: Moment; at: number }[] {
  const end = t.startMin + t.minutes;
  const nearly = Math.min(t.startMin + Math.round(t.minutes * 0.8), end - 5);
  return [
    // Already on it: no "next" nudge.
    ...(t.state === "planned" ? [{ moment: "start" as const, at: t.startMin }] : []),
    ...(nearly > t.startMin ? [{ moment: "nearly" as const, at: nearly }] : []),
    { moment: "overdue", at: end + 5 },
    { moment: "pending", at: end + 35 },
  ];
}

const open = (t: RemindTask) => t.state === "planned" || t.state === "doing";

/** The words of one reminder. */
export function reminderText(t: RemindTask, moment: Moment, nowMin: number): string {
  const end = t.startMin + t.minutes;
  if (moment === "start") return `Next: ${t.title} (${t.minutes} min).`;
  if (moment === "nearly") return `${Math.max(1, end - nowMin)} minutes left on ${t.title}.`;
  if (moment === "overdue") return `${t.title} ran over. Need more time, or move it?`;
  return `${t.title} is still open.`;
}

/**
 * The one reminder to send now, or null. A task late enough for a later moment drops
 * its earlier ones (`also`), so a closed laptop never comes back to a pile; of several
 * tasks, the most urgent wins and the rest wait for the next wake-up (§6: one at a time).
 */
export function dueReminder(tasks: RemindTask[], nowMin: number): { key: string; moment: Moment; text: string; also: Moment[] } | null {
  let best: { t: RemindTask; moment: Moment; also: Moment[] } | null = null;
  for (const t of tasks) {
    if (!open(t)) continue;
    const due = momentsOf(t).filter((m) => m.at <= nowMin && !(t.reminded ?? []).includes(m.moment));
    if (!due.length) continue;
    const last = due[due.length - 1].moment;
    const pick = { t, moment: last, also: due.slice(0, -1).map((m) => m.moment) };
    // More urgent moment, then higher priority, then the earlier task.
    const wins = (x: typeof pick, y: typeof pick) =>
      URGENCY[x.moment] - URGENCY[y.moment] || (RANK[y.t.priority] ?? 1) - (RANK[x.t.priority] ?? 1) || y.t.startMin - x.t.startMin;
    if (!best || wins(pick, best) > 0) best = pick;
  }
  return best && { key: best.t.key, moment: best.moment, text: reminderText(best.t, best.moment, nowMin), also: best.also };
}

/** When the next reminder falls (minutes after Colombo midnight), or null when none is left. */
export function nextReminderMin(tasks: RemindTask[]): number | null {
  let next: number | null = null;
  for (const t of tasks) {
    if (!open(t)) continue;
    for (const m of momentsOf(t)) if (!(t.reminded ?? []).includes(m.moment) && (next === null || m.at < next)) next = m.at;
  }
  return next;
}

/** §4: a plan still a draft an hour after the day started is mentioned once. */
export const DRAFT_NUDGE_AFTER_MIN = 60;
export const DRAFT_NUDGE_TEXT = "Your plan is not approved yet. Approve it so I can keep you on time.";

/** Minutes after Colombo midnight, and a plan minute back to a clock time. */
export const colomboMin = (now: number) => Math.floor(((now + 5.5 * 3600_000) % 86_400_000) / 60_000);
export const atOf = (date: string, min: number) => Date.parse(`${date}T00:00:00+05:30`) + min * 60_000;
