"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

// ponytail: reads ?referee=1 until the backend sends the opening's own flag.
function Badge() {
  if (useSearchParams().get("referee") !== "1") return null;
  return <span className="rounded-full bg-violet-soft px-3.5 py-1 text-small font-medium text-violet">Referee opening</span>;
}

export default function RefereeBadge() {
  return (
    <Suspense>
      <Badge />
    </Suspense>
  );
}
