// The Strategy Planner on real data (D10a, 20 Nov 2026; ta-system #41) - the pure half.
// The planner's screens keep one row per job and strategy with one TA and a day on
// this week's board; the old TA System keeps a row with its TAs (doneBy), a tick,
// a strike (N/A), the day given and what was submitted. These turn one into the
// other, and a change on a screen into the old planner's steps. No imports:
// `node strategyRules.check.ts`.

export type LiveRow = {
  job: string; strategyId: string; name: string; ticked: boolean; na: boolean;
  doneBy: { id: string; pending: boolean }[]; assignedAt: number | null; doneAt: number | null;
  note: string | null; proofs: number; submittedAt: number | null; submittedBy: string | null;
};
export type Step = { do: "line" | "addTa" | "removeTa" | "na"; field?: string; value?: string; taId?: string; na?: string };
type ScreenRow = { state: "open" | "waiting" | "working" | "done" | "na"; ta?: string; days?: [number, number] };

const COLOMBO = 5.5 * 3_600_000;
/** "2026-11-20" for a moment, on the Colombo calendar. */
export const ymd = (t: number) => new Date(t + COLOMBO).toISOString().slice(0, 10);
/** Monday of this Colombo week (a Colombo midnight). */
export function mondayOf(now: number): number {
  const d = new Date(now + COLOMBO);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)) - COLOMBO;
}
/** The board's five days, "Mon 16" .. "Fri 20", and today's place (Sat/Sun = Fri). */
export function weekOf(now: number): { labels: string[]; today: number } {
  const mon = mondayOf(now);
  const labels = [0, 1, 2, 3, 4].map((i) => new Date(mon + i * 86_400_000 + COLOMBO).toUTCString().replace(/^(\w{3}), (\d+).*$/, (_, w, n) => `${w} ${Number(n)}`));
  return { labels, today: Math.min(4, Math.floor((now - mon) / 86_400_000)) };
}

const label = (t: number) => new Date(t + COLOMBO).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
function ago(t: number, now: number): string {
  const m = Math.max(1, Math.round((now - t) / 60_000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : m < 2880 ? "Yesterday" : `${Math.round(m / 1440)} days ago`;
}

/** One old row as the screens' row, or null when the lead has not chosen it. */
export function screenRow(r: LiveRow, now: number) {
  const ta = r.doneBy[0];
  const state = r.na ? "na" : r.submittedAt ? "done" : ta ? (r.doneBy.some((d) => d.pending) ? "waiting" : "working") : r.ticked ? "open" : null;
  if (!state) return null;
  const mon = mondayOf(now);
  const at = r.assignedAt;
  const idx = at !== null && at >= mon && at < mon + 5 * 86_400_000 ? Math.floor((at - mon) / 86_400_000) : null;
  return {
    job: r.job, name: r.name, state, ta: ta?.id,
    ...(idx !== null ? { days: [idx, idx] as [number, number] } : {}),
    ...(at !== null ? { assigned: label(at), ...(idx === null ? { when: label(at) } : {}) } : {}),
    ...(r.doneAt !== null ? { done: label(r.doneAt) } : {}),
    ...(r.submittedAt !== null ? { ago: ago(r.submittedAt, now), read: now - r.submittedAt > 2 * 86_400_000 } : {}),
    ...(r.note ? { note: r.note } : {}),
    ...(r.proofs ? { proofs: r.proofs } : {}),
  };
}

/** The old planner's steps for one job and strategy going from `was` to `now`
 *  (undefined = taken off the job). `day` turns a board day into "YYYY-MM-DD". */
export function stepsFor(was: ScreenRow | undefined, next: ScreenRow | undefined, day: (i: number) => string): Step[] {
  const out: Step[] = [];
  if (!next) {
    if (was?.ta) out.push({ do: "removeTa", taId: was.ta });
    if (was?.state === "na") out.push({ do: "na", na: "0" });
    else if (was) out.push({ do: "line", field: "selected", value: "0" });
    return out;
  }
  if (next.state === "na") return was?.state === "na" ? [] : [{ do: "na", na: "1" }];
  if (was?.state === "na") out.push({ do: "na", na: "0" });
  if (!was || was.state === "na") out.push({ do: "line", field: "selected", value: "1" });
  if (next.ta !== was?.ta) {
    if (was?.ta) out.push({ do: "removeTa", taId: was.ta });
    if (next.ta) out.push({ do: "addTa", taId: next.ta });
  }
  const d = next.days?.[0];
  if (d !== undefined && d !== was?.days?.[0]) out.push({ do: "line", field: "assignedAt", value: day(d) });
  return out;
}
