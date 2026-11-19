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

// ----- The Director's and Ops's desks (ui/homes, 19 Nov) -----

/** Each board column in the words the old Director dashboard used. */
export const STAGE_WORDS: Record<string, string> = {
  ta_follow_up: "TA Follow-up",
  ai_follow_up: "AI Follow-up",
  director_review: "Director Review",
  director_shortlist: "Director shortlist",
  client_shortlist: "Client shortlist",
  interview: "Interview",
  offer: "Offer",
  placed: "Placed",
};

/** An interview time as the homes write it: "Mon 17 Nov, 10:30" (Colombo). */
export function interviewWhen(ms: number): string {
  const d = new Date(ms);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Colombo" }).replace(",", "");
  return `${day}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Colombo" })}`;
}

/** What Ops should chase: a client quiet 3+ days on a candidate, and an interview within
 *  two days that nobody has confirmed. Quietest client first, then soonest interview. */
export function chaseOf(
  withClient: { who: string; client: string; days: number }[],
  interviews: { who: string; at: number; confirmed: boolean }[],
  now: number,
): { what: string; action: string }[] {
  const quiet = withClient
    .filter((w) => w.days >= 3)
    .sort((a, b) => b.days - a.days)
    .map((w) => ({ what: `${w.client} has not answered on ${w.who} for ${w.days} days`, action: "Chase the client" }));
  const soon = interviews
    .filter((i) => !i.confirmed && i.at - now <= 2 * 86_400_000)
    .map((i) => ({ what: `${i.who}'s interview is ${interviewWhen(i.at)} — not confirmed yet`, action: `Call ${i.who.split(" ")[0]}` }));
  return [...quiet, ...soon].slice(0, 20);
}
