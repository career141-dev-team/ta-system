import { createContext, useContext } from "react";

// The work views of one opening, in the order of the View tabs bar. They open in
// place on the opening screen (owner, 12 Nov 2026: "Don't need to change the page").
export const VIEW_TABS = [
  ["pipeline", "Pipeline"],
  ["scoops", "Scoops"],
  ["linkedin-job", "LinkedIn Job"],
  ["jd", "Job Description"],
  ["database", "Database CVs"],
  ["snippets", "Snippets"],
  ["strategies", "Strategies"],
  ["midday", "Midday email"],
] as const;

// The Headhunting rows open in place too, like the ATS ones, rather than linking
// to pages that do not exist yet (owner, 12 Nov 2026: "properly connect the UI").
// They are not in the bottom View tabs bar, which is the ATS views only.
export const HH_VIEWS = [
  ["hh-research", "Research"],
  ["hh-suggestions", "Suggestions"],
  ["hh-tables", "Excel Tables"],
  ["hh-referees", "Referee Calls"],
] as const;

export type WorkView = (typeof VIEW_TABS)[number][0] | (typeof HH_VIEWS)[number][0];

/** A view's name, for its notch and the "not built yet" line. */
export const viewLabel = (v: string) => [...VIEW_TABS, ...HH_VIEWS].find(([key]) => key === v)?.[1] ?? "";
export type View = "overview" | WorkView;

/** The window event the Back button sends to raise the bottom bar. */
export const SHOW_TABS = "viewtabs:show";

/** True for a work view's key (for checking a stored list). */
export const isWorkView = (v: unknown): v is WorkView => typeof v === "string" && viewLabel(v) !== "";

export const ViewContext = createContext<{
  view: View;
  go: (next: View) => void;
  /** The work views this person has opened, in the order first opened: the tabs
   *  of the bottom bar (owner, 12 Nov 2026: "a dynamic tab bar"). */
  recent: WorkView[];
}>({
  view: "overview",
  go: () => {},
  recent: [],
});

export const useOpeningView = () => useContext(ViewContext);
