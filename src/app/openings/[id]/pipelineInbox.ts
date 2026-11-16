// People shortlisted in another view of this opening (Scoops, LinkedIn Job, Database
// CVs, Excel Tables) land on the Pipeline board, in TA Follow-Up - as they do in the
// TA System, where a shortlist anywhere is one stage move (16 Nov 2026: each view held
// its own sample people, so a shortlist said "moved to TA Follow-Up" and the board
// never showed them).
// ponytail: a list in the page's memory until the backend is wired; then the board
// simply reads its stage again and this file goes.

export type Arrival = {
  name: string;
  title: string;
  company?: string;
  location?: string;
  years?: number;
  /** Notice period in days. */
  notice?: number;
  /** Their CV file, when the view has one. Without it the card still needs a CV. */
  cv?: string;
  /** The sourcing channel code (L, HH, SCOOP...), when the view knows it. */
  channel?: string;
};

// Append-only: every board reads from where it last stopped, so a board kept alive
// from an earlier visit of the page cannot take people away from the one on screen.
export const arrivals: Arrival[] = [];
const subs = new Set<() => void>();

export function sendToPipeline(a: Arrival) {
  arrivals.push(a);
  subs.forEach((f) => f());
}

export function onArrival(f: () => void) {
  subs.add(f);
  return () => void subs.delete(f);
}
