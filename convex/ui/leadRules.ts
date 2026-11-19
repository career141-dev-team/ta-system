// convex/ui/leadRules.ts
//
// The plain rules behind the lead's desk (ui/lead:desk, 19 Nov) - no database, so
// tests/uidoor.test.ts can hold them. They keep the old lead dashboard's meaning
// (src/components/dash/LeadDashboard.tsx): "in the pipeline" is the TA's own
// candidates between shortlist and the client; a decision is a role with nobody on
// it, a JD waiting for approval, or a role past its priority target.

import { checksForWorkType, type WorkdayJobView, type WorkType } from "../../src/lib/workday";

/** The backend's stages the old dashboard counted as "in the pipeline". */
export const IN_PIPELINE = new Set(["ta_shortlist", "ai_call", "follow_up", "second_shortlist", "director_shortlist", "client_review"]);

/** A Colombo clock time, as the dashboards write it: "9:05". */
export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: "Asia/Colombo" }).replace(/^0/, "");
}

/** How many of a position's checks are done today: complete, or excused with a reason. */
export function tally(view: Pick<WorkdayJobView, "checks"> | null | undefined, workType: WorkType): { done: number; of: number } {
  if (!view) return { done: 0, of: 0 };
  const checks = checksForWorkType(workType, view.checks ?? []);
  return { done: checks.filter((c) => c.status === "complete" || c.exception).length, of: checks.length };
}

export type Decision = { title: string; client: string; why: string; red?: boolean };

/** What a lead must decide on one role, or nothing. Nobody on it outranks the rest. */
export function decisionOf(job: { title: string; client: string; tas: number; jdPending: boolean; day: number; target: number | null; tier: string | null }): Decision | null {
  if (job.tas === 0) return { title: job.title, client: job.client, why: "Nobody assigned", red: true };
  if (job.jdPending) return { title: job.title, client: job.client, why: "JD waiting for approval" };
  if (job.target !== null && job.day > job.target)
    return { title: job.title, client: job.client, why: `Day ${job.day} against ${job.tier ? `a ${job.tier}` : "the"} target of ${job.target} — close it or reassign` };
  return null;
}

/** Two letters for a name. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
