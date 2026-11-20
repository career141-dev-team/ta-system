/**
 * The new UI's Strategy Planner (D10a, 20 Nov) - pure half.
 *
 * new.career141.com posts `{ do, ...fields }` to src/app/api/ui/strategy; this says
 * which old planner action each `do` runs and which of the old forms' own field
 * names it may carry. Every job action names the opening and the strategy, which
 * is how the old table finds (or makes) the row.
 */

export const STRATEGY_ACTIONS = {
  line: ["openingId", "strategyId", "field", "value"],
  addTa: ["openingId", "strategyId", "taId"],
  removeTa: ["openingId", "strategyId", "taId"],
  na: ["openingId", "strategyId", "na"],
  saveStrategy: ["id", "name", "group", "description", "active"],
  active: ["id", "active"],
} as const;
export type StrategyAction = keyof typeof STRATEGY_ACTIONS;
/** The fields the old table lets a lead change in place. */
export const LINE_FIELDS = new Set(["selected", "assignedAt", "doneAt", "note"]);

/** How many strategies a TA is on this Colombo week (Monday to Sunday), for the
 *  planner's "has room / busy". `assignedAt` is the row's Colombo day (ms). */
export function weekLoad(rows: { doneBy: string[]; assignedAt: number | null; notApplicable: boolean }[], taId: string, now = Date.now()): number {
  const day = new Date(now + 5.5 * 3_600_000);
  const monday = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - ((day.getUTCDay() + 6) % 7)) - 5.5 * 3_600_000;
  return rows.filter((r) => !r.notApplicable && r.doneBy.includes(taId) && r.assignedAt !== null && r.assignedAt >= monday && r.assignedAt < monday + 7 * 86_400_000).length;
}
