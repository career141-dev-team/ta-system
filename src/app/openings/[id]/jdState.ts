import { useSyncExternalStore } from "react";

// Whether this opening's job description is approved - one fact every view of the
// opening reads, as in the TA System, where approval is what lets a post go live,
// Snippets be made and matching run (16 Nov 2026: the Job Description view kept its
// own "approved", while LinkedIn Job and Snippets each had a fixed one, so approving
// unlocked nothing).
// ponytail: kept for the visit; with the backend it is a field on the opening.
let approved = false;
const subs = new Set<() => void>();

export const useJdApproved = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => approved,
    () => false,
  );

export function setJdApproved(v: boolean) {
  approved = v;
  subs.forEach((f) => f());
}
