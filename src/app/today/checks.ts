// Today's Checks, one list per position on the day (the TA System's workday drawer,
// workday skill "What each work mode requires", 16 Nov 2026). A 100% position needs
// the whole hunt; Follow-up and Add-on only what an EOD for returning work needs
// (RETURNING_CHECKS: director_cv, chatgpt, daily_email). The candidate checks
// (review:, details:, followup:...) are hidden from a TA's drawer in the old system
// too, so they are not here.
// Placeholder evidence until the backend is wired: the server builds each check
// from what was really done, and an excuse is voided when the evidence changes.

export type WorkType = "100%" | "Follow-up" | "Add-on";
export type CheckKey =
  | "jd_review"
  | "linkedin_post"
  | "suggestions"
  | "excel_profiles"
  | "director_cv"
  | "chatgpt"
  | "midday_email"
  | "daily_email";

export type Check = {
  key: CheckKey;
  label: string;
  /** What is still to do, in the TA System's words. */
  todo: string;
  /** Where the work is done (the opening's view). */
  view: string;
  done: boolean;
  /** "Couldn't complete this task": the reason the lead reads. */
  excuse?: string;
};

const ALL: Omit<Check, "done">[] = [
  { key: "jd_review", label: "Job description reviewed", todo: "Read the approved JD and confirm it", view: "Job Description" },
  { key: "linkedin_post", label: "LinkedIn post", todo: "Add the live LinkedIn post's link", view: "LinkedIn Job" },
  { key: "suggestions", label: "Suggestions decided", todo: "Select or rule out every suggestion", view: "Suggestions" },
  { key: "excel_profiles", label: "Your Excel profiles", todo: "Add at least 1 profile of your own", view: "Excel Tables" },
  { key: "director_cv", label: "Director Review candidates", todo: "No eligible candidates today - an activity-only email is allowed", view: "Pipeline" },
  { key: "chatgpt", label: "ChatGPT share link", todo: "Paste a chatgpt.com/share link", view: "Midday & EOD" },
  { key: "midday_email", label: "Midday email", todo: "Send the midday email", view: "Midday & EOD" },
  { key: "daily_email", label: "End of day email", todo: "Send the End of day email", view: "Midday & EOD" },
];

const RETURNING: CheckKey[] = ["director_cv", "chatgpt", "daily_email"];
/** The old system's canExcuseCheck: only these can be excused with a reason. */
export const EXCUSABLE: CheckKey[] = ["jd_review", "linkedin_post", "suggestions", "excel_profiles", "chatgpt"];
/** Done by sending, so it never blocks the EOD itself. */
const NOT_BLOCKING: CheckKey[] = ["daily_email"];

/** The checks a position needs for its work type; `done` = keys already done. */
export function checksFor(type: WorkType, done: CheckKey[]): Check[] {
  return ALL.filter((c) => type === "100%" || RETURNING.includes(c.key)).map((c) => ({
    ...c,
    // Always complete in the old system: zero candidates still allows an activity EOD.
    done: c.key === "director_cv" || done.includes(c.key),
  }));
}

export const settled = (c: Check) => c.done || !!c.excuse;

/** Checks left before this position's EOD may go (done or excused counts). */
export const leftBeforeEod = (list: Check[]) => list.filter((c) => !settled(c) && !NOT_BLOCKING.includes(c.key));

/** How far along: settled checks out of all, for the rail's ring. */
export const progress = (list: Check[]) => (list.length ? list.filter(settled).length / list.length : 0);
