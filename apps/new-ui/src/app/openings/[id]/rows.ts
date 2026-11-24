import type { WorkView } from "./view";

// No React here: the opening page (a server component) reads these lists too.
/** The opening page's two lists, in their order - also the tabs on Back's board. */
export const ATS_ROWS: readonly (readonly [string, WorkView])[] = [
  ["Pipeline", "pipeline"],
  ["LinkedIn Job", "linkedin-job"],
  ["Database CVs", "database"],
  ["Strategies", "strategies"],
  ["Scoops", "scoops"],
  ["Job Description", "jd"],
  ["Snippets", "snippets"],
  ["Midday Email", "midday"],
];
export const HH_ROWS: readonly (readonly [string, WorkView])[] = [
  ["Research", "hh-research"],
  ["Suggestions", "hh-suggestions"],
  ["Excel Tables", "hh-tables"],
  ["Referee Calls", "hh-referees"],
];
