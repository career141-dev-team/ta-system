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
