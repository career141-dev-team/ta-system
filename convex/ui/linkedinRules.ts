// LinkedIn Search on the new UI: the rules with no Convex in them, so a test can hold them.

/** The desk's paid searching stops here each Colombo day (suggested limit, 26 Nov);
 *  LINKEDIN_SEARCH_DAILY_USD in the backend settings changes it. */
export const DEFAULT_DAY_LIMIT_USD = 10;
export const dayLimit = (raw: string | undefined) => (raw && Number(raw) >= 0 ? Number(raw) : DEFAULT_DAY_LIMIT_USD);
/** A run older than this never finished (an action lives 10 minutes at most). */
export const STUCK_MS = 12 * 60_000;
export const MAX_RUNNING = 4;

export type RunKind = "search" | "answer" | "confirm" | "more" | "widen" | "refine" | "find";
export const WIDEN = ["level", "years", "city", "industry", "titles"] as const;

/** Who may spend on a search: desk people, never a client or a viewer. */
export const maySearch = (role: string) => !["client", "viewer"].includes(role);

/** Why this person cannot start a run now, or null. */
export function startRefusal(x: { role: string; keyOn: boolean; spentUsd: number; limitUsd: number; mine: number; desk: number }): string | null {
  if (!maySearch(x.role)) return "LinkedIn Search is for the desk's own people.";
  if (!x.keyOn) return "LinkedIn Search is not switched on yet. Ask your admin to add the search key.";
  if (x.mine > 0) return "Your last search is still running. Wait for it, or cancel it.";
  if (x.desk >= MAX_RUNNING) return "The team has several searches running. Try again in a minute.";
  if (x.spentUsd >= x.limitUsd) return "The desk has used today's LinkedIn Search allowance. It is back tomorrow.";
  return null;
}

/** What a TA sees: the people and the warnings, never what it cost (plan, section 6). */
export function forViewer(out: Record<string, unknown>, admin: boolean): Record<string, unknown> {
  if (admin) return out;
  const { credits: _credits, usd: _usd, ...rest } = out;
  return rest;
}
