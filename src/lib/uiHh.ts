/**
 * The new UI's Headhunting tabs (D8b, 20 Nov) - pure half.
 *
 * new.career141.com posts `{ do, ...fields }` to src/app/api/ui/hh; this says
 * which old action each `do` runs and which of the old forms' own field names it
 * may carry. The runs (Research, Benchmark, Suggestions, the assistant) stay the
 * old server's, as the door map says long AI jobs do.
 */

export const HH_ACTIONS = {
  research: ["openingId"],
  benchmark: ["openingId"],
  pickBenchmark: ["openingId", "entryId"],
  correctClient: ["openingId", "researchNotes"],
  editField: ["openingId", "field", "value"],
  suggestions: ["openingId"],
  keep: ["openingId", "suggestionId"],
  dismiss: ["openingId", "suggestionId"],
  chooseCv: ["openingId", "suggestionId", "candidateId"],
  chat: ["openingId", "body"],
} as const;
export type HhAction = keyof typeof HH_ACTIONS;

/** The HH Overview numbers, from the opening's Excel Tables rows (the old hh/page.tsx). */
export function hhCounts(vault: { outcome: string; isEyeMarked?: boolean }[]) {
  const reachedCv = (v: { outcome: string }) => v.outcome === "cv_received" || v.outcome === "shortlisted";
  const eye = vault.filter((v) => v.isEyeMarked);
  return {
    links: vault.length,
    approached: vault.filter((v) => v.outcome !== "no_contact").length,
    notApproached: vault.filter((v) => v.outcome === "no_contact").length,
    reached: vault.filter(reachedCv).length,
    eye: eye.length,
    eyeReached: eye.filter(reachedCv).length,
  };
}
