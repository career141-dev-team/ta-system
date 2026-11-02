/**
 * The words of the end-of-day reminders (convex/ta/eodReminders.ts), kept here
 * so the tests can read them without a backend. Nothing here decides who is
 * reminded; that is the cron's job.
 */

export interface OutstandingEod {
  taName: string;
  title: string;
  leadId: string | null;
}

/** 17:30: one bell per TA naming the 100% openings still without an end of day. */
export function taReminderText(titles: string[]): { title: string; body: string } {
  const n = titles.length;
  return {
    title: n === 1 ? "End of day not sent yet" : `End of day not sent yet for ${n} positions`,
    body: `${titles.join(" · ")}. Your workday completes when the end-of-day email is sent.`,
  };
}

/** 18:30: one bell per lead listing each TA and opening still without an end of day. */
export function leadDigestByLead(rows: OutstandingEod[]): Map<string, { title: string; body: string }> {
  const byLead = new Map<string, OutstandingEod[]>();
  for (const row of rows) {
    if (!row.leadId) continue;
    byLead.set(row.leadId, [...(byLead.get(row.leadId) ?? []), row]);
  }
  const out = new Map<string, { title: string; body: string }>();
  for (const [leadId, list] of byLead) {
    out.set(leadId, {
      title: list.length === 1 ? "1 end of day still not sent" : `${list.length} end of days still not sent`,
      body: list.map((r) => `${r.taName} · ${r.title}`).join("; "),
    });
  }
  return out;
}
