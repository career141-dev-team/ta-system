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

// ----- Phase 3: changing the plan by talking (docs/AURA-DAY-AGENT.md section 7) -----
// The TA's sentence becomes ONE change. Plain rules read the common sentences; the
// model is asked only when they cannot (ui/planTalk). All times, the slide of the
// tasks after, and the clashes are worked out here, so the same request always gives
// the same plan. A task AURA cannot pick for sure is asked about, never guessed.

export type ChangeOp = "extend" | "move" | "set_end" | "snooze" | "shift_pending" | "add" | "skip" | "set_finish" | "done";
export type Change = { op: ChangeOp; key?: string; minutes?: number; atMin?: number; title?: string; reason?: string; all?: boolean };
export type TalkTask = { key: string; title: string; startMin: number; minutes: number; state: TaskState };
export type Read = { change: Change } | { ask: string; options?: string[] } | null;

const OPEN = (t: { state: TaskState }) => t.state === "planned" || t.state === "doing";

/** "2:30", "2.30pm", "14:30", "at 3", "by 4pm" -> minutes after midnight. The day runs
 *  7:00-19:00, so a bare 1-6 is the afternoon. The last time in the text wins. */
export function timeOf(text: string): number | null {
  const all = [...text.matchAll(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/gi)].filter(
    (x) => x[2] || x[3] || /\b(?:at|to|by|till|until)\s+$/i.test(text.slice(0, x.index)),
  );
  const x = all.at(-1);
  if (!x) return null;
  let h = Number(x[1]);
  const m = Number(x[2] ?? 0);
  if (h > 23 || m > 59) return null;
  const ap = x[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  else if (ap === "am" && h === 12) h = 0;
  else if (!ap && h >= 1 && h <= 6) h += 12;
  else if (!ap && h < 12 && /\b(tonight|evening|night)\b/i.test(text)) h += 12;
  return h * 60 + m;
}

/** "15 minutes", "half an hour", "an hour", "1.5 hours" -> minutes. */
export function minutesOf(text: string): number | null {
  if (/\bhalf an hour\b/i.test(text)) return 30;
  if (/\ban hour\b/i.test(text)) return 60;
  const h = text.match(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b/i);
  if (h) return Math.round(Number(h[1]) * 60);
  const m = text.match(/\b(\d{1,3})\s*(?:m|min|mins|minutes?)\b/i);
  return m ? Number(m[1]) : null;
}

const STOP = new Set(["the", "a", "an", "to", "my", "this", "that", "task", "it", "for", "on", "and", "with", "move", "by", "at", "of", "me", "i", "please", "done", "skip", "need", "more", "another", "minutes", "minute", "finish", "finished", "complete", "will"]);
const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? [];

/** The task the sentence is about: one named by its words, else "this" = the task in
 *  hand (doing, else the open one whose time covers now, else the next open one). */
export function pickTask(text: string, tasks: TalkTask[], nowMin: number): { task: TalkTask } | { ask: string; options: string[] } | null {
  const open = tasks.filter(OPEN);
  const said = new Set(words(text));
  const scored = open
    .map((t) => ({ t, n: words(t.title).filter((w) => said.has(w)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  if (scored.length && (scored.length === 1 || scored[0].n > scored[1].n)) return { task: scored[0].t };
  if (scored.length > 1) {
    const options = scored.slice(0, 3).map((x) => x.t.title);
    return { ask: `Which one: ${options.join(", or ")}?`, options };
  }
  const inHand =
    open.find((t) => t.state === "doing") ??
    open.find((t) => t.startMin <= nowMin && nowMin < t.startMin + t.minutes) ??
    open.filter((t) => t.startMin >= nowMin).sort((a, b) => a.startMin - b.startMin)[0];
  return inHand ? { task: inHand } : null;
}

/** The common sentences, read with no model. Null = ask the model. */
export function readChange(text: string, tasks: TalkTask[], nowMin: number): Read {
  const t = text.trim();
  const low = t.toLowerCase();
  const mins = minutesOf(t);
  const at = timeOf(t);
  const withTask = (f: (task: TalkTask) => Change): Read => {
    const p = pickTask(t, tasks, nowMin);
    if (!p) return { ask: "Which task do you mean?" };
    return "ask" in p ? p : { change: f(p.task) };
  };

  if (/\b(stop|pause|quiet|no) (reminding|reminders?)\b|\bdon.?t remind\b/.test(low)) {
    if (/\b(all|everything|the plan|any)\b/.test(low)) return { change: { op: "snooze", minutes: mins ?? 30, all: true } };
    return withTask((task) => ({ op: "snooze", key: task.key, minutes: mins ?? 30 }));
  }
  if (/\b(work|working|stay|leave)\b.*\b(till|until|at|to)\b/.test(low) && at !== null) return { change: { op: "set_finish", atMin: at } };
  if (/\b(finish|end) (my|the) (day|work)\b/.test(low) && at !== null) return { change: { op: "set_finish", atMin: at } };
  if (/\b(pending|remaining|rest of|all my)\b/.test(low) && /\b(afternoon|after lunch)\b/.test(low)) return { change: { op: "shift_pending", atMin: 13 * 60 } };
  if (/\b(pending|remaining|rest of)\b/.test(low) && at !== null) return { change: { op: "shift_pending", atMin: at } };
  if ((/\b(another|more|extra|additional)\b/.test(low) || /\bneed\b.*\bmore\b/.test(low)) && mins) return withTask((task) => ({ op: "extend", key: task.key, minutes: mins }));
  if (/\b(skip|drop|cancel)\b|\bwon.?t do\b/.test(low)) {
    const reason = t.match(/\b(?:because|as|since)\b\s*(.+)$/i)?.[1]?.trim();
    return withTask((task) => ({ op: "skip", key: task.key, reason: reason || "Changed in chat" }));
  }
  if (/\b(complete|finish|done)\b.*\bby\b/.test(low) && at !== null) return withTask((task) => ({ op: "set_end", key: task.key, atMin: at }));
  if (/\b(done|finished|completed)\b/.test(low)) return withTask((task) => ({ op: "done", key: task.key }));
  if (/^(please\s+)?add\b|\burgent\b|\bcame up\b/.test(low)) {
    const title = /^(please\s+)?add\b/.test(low)
      ? t.replace(/^(please\s+)?add\s+(a|an)?\s*/i, "").replace(/\s+(at|for|by)\s+\d.*$/i, "").trim()
      : "Urgent work";
    return { change: { op: "add", title: title.slice(0, 120) || "New task", atMin: at ?? nowMin, minutes: mins ?? 30 } };
  }
  if (/\b(move|shift|push|reschedule|change|put)\b/.test(low) && at !== null) return withTask((task) => ({ op: "move", key: task.key, atMin: at }));
  return null;
}

export type AppliedTask = { key: string; startMin: number; minutes: number; state: TaskState; title: string; snoozeMin?: number; reason?: string; added?: boolean };
export type Applied = { tasks: AppliedTask[]; finishMin: number; say: string; clashes: string[]; changed: string[] };

const endOf = (t: { startMin: number; minutes: number }) => t.startMin + t.minutes;

/** Push open tasks that now overlap later, in time order, keeping their length. */
function slide(list: AppliedTask[], first: string): string[] {
  const moved: string[] = [];
  const order = list.filter(OPEN).sort((a, b) => a.startMin - b.startMin || (a.key === first ? -1 : b.key === first ? 1 : 0));
  for (let i = 1; i < order.length; i++) {
    const prevEnd = endOf(order[i - 1]);
    if (order[i].startMin < prevEnd) {
      order[i].startMin = prevEnd;
      moved.push(order[i].key);
    }
  }
  return moved;
}

/** Apply one change to a copy of the plan (section 7, steps 1-3); saving is the caller's. */
export function applyChange(tasks: TalkTask[], change: Change, finishMin: number, nowMin: number): Applied | { refused: string } {
  const list: AppliedTask[] = tasks.map((t) => ({ key: t.key, title: t.title, startMin: t.startMin, minutes: t.minutes, state: t.state }));
  const task = change.key ? list.find((t) => t.key === change.key) : undefined;
  if (change.key && (!task || !OPEN(task))) return { refused: "That task is not open any more." };
  let finish = finishMin;
  let say = "";
  let changed: string[] = [];

  switch (change.op) {
    case "extend": {
      const m = change.minutes ?? 0;
      if (!task || m < 5 || m > 240) return { refused: "Add between 5 minutes and 4 hours." };
      task.minutes = Math.min(480, task.minutes + m);
      changed = [task.key, ...slide(list, task.key)];
      say = `${task.title} now ends at ${hm(endOf(task))}.`;
      break;
    }
    case "move": {
      if (!task || change.atMin === undefined) return { refused: "Say the time to move it to." };
      task.startMin = change.atMin;
      changed = [task.key, ...slide(list, task.key)];
      say = `${task.title} moved to ${hm(task.startMin)}–${hm(endOf(task))}.`;
      break;
    }
    case "set_end": {
      if (!task || change.atMin === undefined) return { refused: "Say when it will be finished." };
      if (change.atMin <= task.startMin) return { refused: `That is before ${task.title} starts (${hm(task.startMin)}).` };
      task.minutes = Math.min(480, change.atMin - task.startMin);
      changed = [task.key, ...slide(list, task.key)];
      say = `${task.title} now ends at ${hm(endOf(task))}.`;
      break;
    }
    case "snooze": {
      const m = change.minutes ?? 30;
      if (m < 5 || m > 240) return { refused: "Quiet reminders for 5 minutes to 4 hours." };
      if (task) {
        task.snoozeMin = m;
        changed = [task.key];
      }
      say = task ? `No reminders about ${task.title} for ${m} minutes. The task stays.` : `No reminders for ${m} minutes.`;
      break;
    }
    case "shift_pending": {
      const from = Math.max(change.atMin ?? 13 * 60, nowMin);
      let at = from;
      for (const t of list.filter((x) => x.state === "planned").sort((a, b) => a.startMin - b.startMin)) {
        if (t.startMin >= from) continue;
        t.startMin = at;
        at = endOf(t);
        changed.push(t.key);
      }
      if (changed.length) changed.push(...slide(list, changed[0]));
      say = changed.length ? `${changed.length} pending ${changed.length === 1 ? "task moves" : "tasks move"} to start from ${hm(from)}.` : "Nothing pending was before then.";
      break;
    }
    case "add": {
      const at = change.atMin ?? nowMin;
      const m = change.minutes ?? 30;
      if (m < 5 || m > 480) return { refused: "A task takes between 5 minutes and 8 hours." };
      const title = (change.title || "New task").slice(0, 120);
      const key = `c${at}${title.length}${list.length}`;
      list.push({ key, title, startMin: at, minutes: m, state: "planned", added: true });
      changed = [key, ...slide(list, key)];
      say = `Added ${title.slice(0, 60)} at ${hm(at)} for ${m} minutes.`;
      break;
    }
    case "skip": {
      if (!task) return { refused: "Which task should be skipped?" };
      task.state = "skipped";
      task.reason = (change.reason ?? "Changed in chat").slice(0, 300);
      changed = [task.key];
      say = `Skipped ${task.title}.`;
      break;
    }
    case "done": {
      if (!task) return { refused: "Which task is done?" };
      task.state = "done";
      changed = [task.key];
      say = `${task.title} done.`;
      break;
    }
    case "set_finish": {
      if (change.atMin === undefined || change.atMin < 6 * 60 || change.atMin > 23 * 60 + 59) return { refused: "The finish time must be between 6:00 and 23:59." };
      finish = change.atMin;
      say = `Your day now finishes at ${hm(finish)}.`;
      break;
    }
  }

  // Clashes, said plainly: past the planned finish, or two open tasks at once.
  const open = list.filter(OPEN).sort((a, b) => a.startMin - b.startMin);
  const clashes: string[] = [];
  for (const t of open) if (endOf(t) > finish) clashes.push(`${t.title} now ends after your finish (${hm(finish)}).`);
  for (let i = 1; i < open.length; i++) if (open[i].startMin < endOf(open[i - 1])) clashes.push(`${open[i - 1].title} and ${open[i].title} overlap.`);
  const slid = changed.slice(1).map((k) => list.find((t) => t.key === k)!).filter(Boolean);
  if (slid.length && change.op !== "shift_pending") say += ` ${slid.map((t) => `${t.title} moves to ${hm(t.startMin)}`).join("; ")}.`;
  return { tasks: list, finishMin: finish, say, clashes: clashes.slice(0, 3), changed: [...new Set(changed)] };
}
