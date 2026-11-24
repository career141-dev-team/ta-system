import { createContext, useContext } from "react";

// The work views of one opening, in the two sets of the bottom bar (owner's design,
// Figma 713-2421, 13 Nov 2026) - the old TA System's "ATS | Headhunting" sidebar
// switch moved into the bar. They open in place on the opening screen (owner, 12 Nov
// 2026: "Don't need to change the page").
export const VIEW_TABS = [
  ["pipeline", "Pipeline"],
  ["scoops", "Scoops"],
  ["linkedin-job", "LinkedIn Job"],
  ["jd", "Job Description"],
  ["database", "Database CVs"],
  // Not in the bar design; the old system has it. A placeholder until its screen comes.
  ["referral", "Referral Search"],
  ["snippets", "Snippets"],
  ["strategies", "Strategies"],
  ["midday", "Midday & EOD"],
] as const;

export const HH_VIEWS = [
  ["hh-overview", "Overview"],
  ["hh-research", "Research"],
  ["hh-suggestions", "Suggestions"],
  ["hh-tables", "Excel Tables"],
  ["hh-referees", "Referee Calls"],
] as const;

export type WorkView = (typeof VIEW_TABS)[number][0] | (typeof HH_VIEWS)[number][0];
export type ViewSet = "ats" | "hh";

/** A view's name, for its notch, its tab and the "not built yet" line. */
export const viewLabel = (v: string) => [...VIEW_TABS, ...HH_VIEWS].find(([key]) => key === v)?.[1] ?? "";
export type View = "overview" | WorkView;

/** Which set of the bar a view belongs to. */
export const setOf = (v: View): ViewSet => (v.startsWith("hh-") ? "hh" : "ats");

/** The window event the Back button sends: back to the opening. */
export const SHOW_TABS = "viewtabs:show";

/** True for a work view's key (for checking a stored value). */
export const isWorkView = (v: unknown): v is WorkView => typeof v === "string" && viewLabel(v) !== "";

export const ViewContext = createContext<{
  view: View;
  go: (next: View) => void;
  /** The view Back last left, so its row on the opening page can show where you were. */
  from?: View;
}>({
  view: "overview",
  go: () => {},
});

export const useOpeningView = () => useContext(ViewContext);
