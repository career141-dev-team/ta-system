import { Suspense } from "react";
import CandidateView from "./CandidateView";

export const metadata = { title: "Candidate - TA System" };

// One candidate on one opening (the TA System's candidate/[appId] page). Which one
// comes in the address (?stage=&n=&name=...), so a static build serves it and a
// card, a bell or a reload can open it.
export default function Page() {
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <CandidateView />
    </Suspense>
  );
}
