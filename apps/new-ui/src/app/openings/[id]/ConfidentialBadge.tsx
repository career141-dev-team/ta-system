"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { door, jobFromAddress, useDoorQuery, useLive, type Answer } from "@/lib/backend";

type Summary = Answer<{ opening: { confidential: boolean } }>;

// The opening's confidential flag: the real one (?job=<id>, ui/opening:summary) when
// signed in, the ?confidential=1 the Openings card carries in the sample build.
function Badge() {
  const live = useLive();
  const sample = useSearchParams().get("confidential") === "1";
  const job = live ? jobFromAddress() : null;
  const got = useDoorQuery(door.summary, job ? { openingId: job } : "skip") as Summary | undefined;
  const on = live ? !!got?.ok && got.opening.confidential : sample;
  if (!on) return null;
  return <span className="rounded-full bg-warn-soft px-3.5 py-1 text-small font-medium text-warn">Confidential</span>;
}

export default function ConfidentialBadge() {
  return (
    <Suspense>
      <Badge />
    </Suspense>
  );
}
