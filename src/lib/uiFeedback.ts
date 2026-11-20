/**
 * The new UI's Feedback (R2, 20 Nov) - pure half.
 *
 * The new board has four columns (New, Lead review, With the builders, Done) and
 * three kinds (Broken, Idea, Question); the old `feedbacks` table has seven
 * statuses and six categories. This is the one map between them, both ways, so
 * the old /feedback desk and the new board show the same item in the same place.
 */
import type { FeedbackCategory, FeedbackItem, FeedbackPriority, FeedbackStatus } from "@/data/types";

export type Kind = "broke" | "idea" | "question";
export type Column = "new" | "review" | "builders" | "done";
export type Outcome = "fixed" | "answered" | "declined";

const KIND_OF: Record<FeedbackCategory, Kind> = {
  bug: "broke", ui_issue: "broke", performance: "broke",
  feature_request: "idea", workflow: "idea",
  other: "question",
};
/** The new form's kind as the old table's category. */
export const CATEGORY_OF: Record<Kind, FeedbackCategory> = { broke: "bug", idea: "feature_request", question: "other" };
/** "It blocks my work" is the old form's top priority. */
export const priorityOf = (blocks: boolean): FeedbackPriority => (blocks ? "urgent" : "medium");

/** Where an old row sits on the new board. Waiting for a lead: New until the person looking has opened it. */
export function columnOf(status: FeedbackStatus, read: boolean): { column: Column; outcome?: Outcome } {
  switch (status) {
    case "pending_lead": return { column: read ? "review" : "new" };
    case "approved_for_admin":
    case "in_progress": return { column: "builders" };
    case "resolved": return { column: "done", outcome: "fixed" };
    case "resolved_by_lead": return { column: "done", outcome: "answered" };
    default: return { column: "done", outcome: "declined" };
  }
}

/** One old row as the new board's card - what the old desk shows, nothing more. */
export function itemOf(f: FeedbackItem, read: boolean, now = Date.now()) {
  const { column, outcome } = columnOf(f.status, read);
  return {
    id: f.id,
    kind: KIND_OF[f.category] ?? "question",
    title: f.title,
    text: f.description,
    by: f.submittedByName.split(" ")[0] || f.submittedByName,
    byId: f.submittedBy,
    at: f.createdAt,
    ago: agoOf(f.createdAt, now),
    blocks: f.priority === "urgent" || f.priority === "high",
    page: f.pageUrl || undefined,
    screenshot: Boolean(f.screenshot),
    voice: Boolean(f.voiceNote),
    status: column,
    outcome,
    oldStatus: f.status,
    // What the person was told: the builders' words when they decided, else the lead's.
    answer: f.adminResolution || (f.status === "pending_lead" ? undefined : f.leadNotes) || undefined,
    read,
  };
}

export function agoOf(at: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - at) / 60_000));
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : d < 7 ? `${d} days` : `${Math.round(d / 7)} wk`;
}

/** The new board's buttons as the old actions' own decisions. */
export const LEAD_DECISION = { builders: "approved_for_admin", answered: "resolved_by_lead", declined: "declined_by_lead" } as const;
export const ADMIN_STATUS = { working: "in_progress", fixed: "resolved", declined: "declined_by_admin" } as const;
