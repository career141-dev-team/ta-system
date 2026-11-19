"use client";

// AURA's day plan, phase 1 (owner 19 Nov 2026, docs/AURA-DAY-AGENT.md): under AURA's
// latest plan card the TA presses "Approve this plan"; from then the plan is the
// day's plan - each task ticked off here, skipped with a reason, and the day closed
// with what is open carried to tomorrow (never marked done).
// Signed in, the plan lives in the backend (ui/plan) and approving is refused until
// Start workday (Decision 2). Signed out (the sample), the same flow runs in this tab.
// Reminders come in phase 2, changing the plan by chat in phase 3.

import { useRef, useState, useSyncExternalStore } from "react";
import { door, useDoorMutation, useDoorQuery } from "@/lib/backend";
import { useSignedInPerson } from "@/lib/role";
import { petSay } from "@/lib/pet";
import { DUR, EASE, gsap } from "@/lib/gsap";
import { short, type DayPosition, type Plan, type Step } from "./plan";
import { askForPopups } from "../PlanReminders";

type TaskState = "planned" | "doing" | "done" | "skipped" | "carried";
type Task = { key: string; title: string; kind: string; jobId: string | null; startMin: number; minutes: number; priority: string; state: TaskState; reason: string | null };
type DayPlanView = { state: "draft" | "approved" | "closed"; finishMin: number; tasks: Task[]; tally: { done: number; of: number; open: number } };
type Answer = { ok: true; message: string } | { ok: false; message: string };

const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
/** AURA's plan writes "2:30" for half past two in the afternoon; the day runs 7:00-19:00. */
const minutesOf = (at: string) => {
  const [h, m] = at.split(":").map(Number);
  return ((h < 7 ? h + 12 : h) * 60 + (m || 0)) | 0;
};
/** What kind of work a step is, from its words (the plan's own wording, plan.ts). */
function kindOf(s: Step): string {
  const w = s.what.toLowerCase();
  if (/\beod\b|end of day/.test(w)) return "eod_email";
  if (/midday/.test(w)) return "midday_email";
  if (/interview/.test(w)) return "interview";
  if (/director review/.test(w)) return "director_review";
  if (/strateg/.test(w)) return "strategy";
  if (/chase|follow/.test(w)) return "follow_up";
  if (/review|suggestion|cv/.test(w)) return "cv_review";
  if (/sourc|search|linkedin/.test(w)) return "sourcing";
  return "other";
}
/** AURA's plan as tasks, in order; each step runs until the next one starts (the
 *  last one, the EOD, 30 minutes). A step's `minutes` is its start (plan.ts). */
export function toTasks(plan: Plan, positions: DayPosition[], live: boolean) {
  const starts = plan.steps.map((s) => (Number.isFinite(s.minutes) ? s.minutes : minutesOf(s.at)));
  return plan.steps.map((s, i) => {
    const pos = s.where ? positions.find((p) => short(p) === s.where || p.title === s.where) : undefined;
    const next = starts[i + 1];
    const minutes = Math.min(480, Math.max(5, next !== undefined && next > starts[i] ? next - starts[i] : 30));
    return {
      key: `t${i + 1}`,
      title: s.what.slice(0, 120),
      kind: kindOf(s),
      // Sample positions have sample ids the backend does not know.
      jobId: live && pos ? pos.id : undefined,
      startMin: starts[i],
      minutes,
      priority: s.tone === "brand" ? "high" : "normal",
    };
  });
}

// Signed out: the sample plan, for this tab only.
let sample: DayPlanView | null = null;
const subs = new Set<() => void>();
const setSample = (p: DayPlanView | null) => {
  sample = p;
  subs.forEach((f) => f());
};
const tallyOf = (tasks: Task[]) => {
  const counted = tasks.filter((t) => t.state !== "skipped");
  return { done: counted.filter((t) => t.state === "done").length, of: counted.length, open: counted.filter((t) => t.state === "planned" || t.state === "doing").length };
};

function useDayPlan() {
  const live = useSignedInPerson() !== null;
  const read = useDoorQuery(door.planToday, live ? {} : "skip") as { ok: true; plan: DayPlanView | null } | { ok: false; message: string } | undefined;
  const local = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => sample,
    () => null,
  );
  const saveDraft = useDoorMutation(door.planSaveDraft);
  const approveIt = useDoorMutation(door.planApprove);
  const setTaskIt = useDoorMutation(door.planSetTask);
  const closeIt = useDoorMutation(door.planClose);
  const snoozeIt = useDoorMutation(door.planSnooze);
  const plan = live ? (read?.ok ? read.plan : null) : local;

  const approve = async (tasks: ReturnType<typeof toTasks>): Promise<Answer> => {
    if (!live) {
      const t: Task[] = tasks.map((x) => ({ ...x, jobId: null, state: "planned", reason: null }));
      setSample({ state: "approved", finishMin: 17 * 60, tasks: t, tally: tallyOf(t) });
      return { ok: true, message: "Plan approved. AURA will keep you on it." };
    }
    const saved = (await saveDraft({ tasks })) as Answer;
    if (!saved.ok) return saved;
    return (await approveIt({})) as Answer;
  };
  const setTask = async (key: string, state: TaskState, reason?: string): Promise<Answer> => {
    if (!live) {
      if (!sample) return { ok: false, message: "There is no plan for today." };
      const t = sample.tasks.map((x) => (x.key === key ? { ...x, state, reason: state === "skipped" ? reason ?? null : null } : x));
      setSample({ ...sample, tasks: t, tally: tallyOf(t) });
      return { ok: true, message: "Saved." };
    }
    return (await setTaskIt({ key, state, reason })) as Answer;
  };
  const close = async (): Promise<Answer> => {
    if (!live) {
      if (!sample) return { ok: false, message: "There is no plan for today." };
      const open = sample.tasks.filter((x) => x.state === "planned" || x.state === "doing").length;
      const t = sample.tasks.map((x) => (x.state === "planned" || x.state === "doing" ? { ...x, state: "carried" as const } : x));
      setSample({ ...sample, state: "closed", tasks: t, tally: tallyOf(t) });
      return { ok: true, message: open ? `Plan closed. ${open} open ${open === 1 ? "task carries" : "tasks carry"} to tomorrow.` : "Plan closed. Everything is done." };
    }
    return (await closeIt({})) as Answer;
  };
  // Reminders run in the backend, so quieting them is for a signed-in plan only.
  const snooze = async (key: string | undefined, minutes: number): Promise<Answer> =>
    live ? ((await snoozeIt({ key, minutes })) as Answer) : { ok: true, message: "Reminders run when you are signed in." };
  return { live, plan, loading: live && read === undefined, approve, setTask, close, snooze };
}

const BTN_DARK = "flex h-[max(2.75rem,36px)] items-center gap-2 rounded-full bg-ink px-[max(1.25rem,14px)] text-[max(0.9375rem,13px)] font-medium text-white transition-colors hover:bg-black disabled:opacity-50";
const BTN_LINE = "flex h-[max(2.75rem,36px)] items-center rounded-full border border-border-strong px-[max(1.25rem,14px)] text-[max(0.9375rem,13px)] font-medium text-ink transition-colors hover:bg-surface-2";

/** Under AURA's latest plan: the approve button, then the approved plan itself. */
export default function PlanApproval({ plan, positions }: { plan: Plan; positions: DayPosition[] }) {
  const { live, plan: day, loading, approve } = useDayPlan();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  if (loading) return null;
  if (day && day.state !== "draft") return <DayPlanCard />;
  return (
    <div data-plan-act className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy || plan.steps.length === 0}
        onClick={async () => {
          setBusy(true);
          askForPopups();
          const a = await approve(toTasks(plan, positions, live));
          setBusy(false);
          setSaid(a.ok ? null : a.message);
          petSay(a.ok ? "done" : "failed", a.message);
        }}
        className={BTN_DARK + " self-start bg-brand hover:bg-brand-strong"}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4">
          <path d="m5 12 5 5 9-10" />
        </svg>
        {busy ? "Approving…" : "Approve this plan"}
      </button>
      <p className="text-[max(0.8125rem,11.5px)] text-ink-3">{said ?? "AURA starts reminding you once you approve: at each task's start, near its end, and if it runs over."}</p>
    </div>
  );
}

/** The approved plan: tick, skip with a reason, close the day. */
function DayPlanCard() {
  const { live, plan: day, setTask, close, snooze } = useDayPlan();
  const [skipping, setSkipping] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [closing, setClosing] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  if (!day) return null;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const closed = day.state === "closed";

  const flip = async (t: Task) => {
    const a = await setTask(t.key, t.state === "done" ? "planned" : "done");
    if (!a.ok) petSay("failed", a.message);
    else if (t.state !== "done") {
      petSay("done", `“${t.title}” done.`);
      const row = card.current?.querySelector(`[data-task="${t.key}"]`);
      if (row) gsap.fromTo(row, { scale: 0.985 }, { scale: 1, duration: DUR.base, ease: EASE.pop });
    }
  };

  return (
    <div ref={card} className="rounded-lg border border-border bg-white px-[max(1.5rem,14px)] py-[max(1.25rem,12px)]">
      <div className="mb-[max(0.5rem,6px)] flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={"rounded-full px-[max(0.625rem,7px)] py-0.5 text-[max(0.8125rem,11.5px)] font-medium " + (closed ? "bg-surface-2 text-ink-2" : "bg-brand-soft text-brand")}>
          {closed ? "Day closed" : "Approved"}
        </span>
        <span className="text-[max(0.875rem,12px)] text-ink-3">
          {day.tally.done} of {day.tally.of} done{day.tally.open ? ` · ${day.tally.open} open` : ""}
        </span>
        {!closed && live && (
          <button type="button" onClick={async () => petSay("done", (await snooze(undefined, 60)).message)} className="ml-auto text-[max(0.8125rem,11.5px)] text-ink-3 hover:text-ink">
            Pause reminders 1 h
          </button>
        )}
      </div>
      <ol className="flex flex-col divide-y divide-border">
        {day.tasks.map((t) => {
          const end = t.startMin + t.minutes;
          const late = !closed && (t.state === "planned" || t.state === "doing") && nowMin > end;
          const done = t.state === "done";
          const gone = t.state === "skipped" || t.state === "carried";
          return (
            <li key={t.key} data-task={t.key} className="py-[max(0.6rem,7px)]">
              <div className="flex items-center gap-[max(1rem,10px)]">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  aria-label={done ? `Undo “${t.title}”` : `Mark “${t.title}” done`}
                  disabled={closed || gone}
                  onClick={() => flip(t)}
                  className={"flex size-[max(1.5rem,20px)] shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40 " + (done ? "border-brand bg-brand text-white" : "border-border-strong hover:border-brand")}
                >
                  {done && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-3">
                      <path d="m5 12 5 5 9-10" />
                    </svg>
                  )}
                </button>
                <span className="w-[max(5.5rem,74px)] shrink-0 font-mono text-[max(0.8125rem,11.5px)] text-ink-3">
                  {hm(t.startMin)}–{hm(end)}
                </span>
                <span className={"min-w-0 flex-1 text-[max(1rem,13.5px)] " + (done || gone ? "text-ink-3 line-through" : "text-ink")}>{t.title}</span>
                {late && <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[max(0.75rem,11px)] font-medium text-warn">Running over</span>}
                {t.state === "carried" && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[max(0.75rem,11px)] font-medium text-ink-2">Tomorrow</span>}
                {t.state === "skipped" && !closed && (
                  <button type="button" onClick={() => setTask(t.key, "planned")} className="shrink-0 text-[max(0.8125rem,11.5px)] text-ink-3 hover:text-ink">
                    Bring back
                  </button>
                )}
                {!closed && !gone && !done && live && (
                  <button type="button" onClick={async () => petSay("done", (await snooze(t.key, 30)).message)} title="No reminders for this task for 30 minutes" className="shrink-0 text-[max(0.8125rem,11.5px)] text-ink-3 hover:text-ink">
                    Quiet 30 min
                  </button>
                )}
                {!closed && !gone && !done && (
                  <button type="button" onClick={() => (setSkipping(skipping === t.key ? null : t.key), setWhy(""))} className="shrink-0 text-[max(0.8125rem,11.5px)] text-ink-3 hover:text-ink">
                    Skip
                  </button>
                )}
              </div>
              {t.state === "skipped" && t.reason && <p className="ml-[max(2.5rem,30px)] mt-0.5 text-[max(0.8125rem,11.5px)] text-ink-3">Skipped: {t.reason}</p>}
              {skipping === t.key && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const a = await setTask(t.key, "skipped", why);
                    if (!a.ok) return petSay("failed", a.message);
                    setSkipping(null);
                  }}
                  className="ml-[max(2.5rem,30px)] mt-2 flex items-center gap-2"
                >
                  <input autoFocus value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why skip it?" aria-label="Why skip it?" maxLength={300} className="min-w-0 flex-1 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[max(0.875rem,12px)] text-ink outline-none focus:border-brand" />
                  <button type="submit" disabled={!why.trim()} className="rounded-full bg-ink px-3.5 py-1.5 text-[max(0.8125rem,11.5px)] font-medium text-white disabled:opacity-40">
                    Skip it
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ol>
      {!closed && (
        <div className="mt-[max(0.9rem,10px)] flex flex-wrap items-center gap-[max(0.75rem,8px)]">
          <button
            type="button"
            onClick={async () => {
              if (!closing) return setClosing(true);
              const a = await close();
              setClosing(false);
              petSay(a.ok ? "done" : "failed", a.message);
            }}
            className={closing ? BTN_DARK : BTN_LINE}
          >
            {closing ? `Close the day${day.tally.open ? ` — ${day.tally.open} open carry to tomorrow` : ""}` : "Close my day"}
          </button>
          {closing && (
            <button type="button" onClick={() => setClosing(false)} className="text-[max(0.875rem,12px)] text-ink-3 hover:text-ink">
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
