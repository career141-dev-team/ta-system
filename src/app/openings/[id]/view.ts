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

export type WorkView = (typeof VIEW_TABS)[number][0];
export type View = "overview" | WorkView;

export const ViewContext = createContext<{ view: View; go: (next: View) => void }>({
  view: "overview",
  go: () => {},
});

export const useOpeningView = () => useContext(ViewContext);
