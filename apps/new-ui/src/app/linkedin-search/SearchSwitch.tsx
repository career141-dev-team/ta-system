"use client";

// Which LinkedIn Search this person gets (26 Nov 2026): the search engine once the
// backend has its search key, the older web search until then (and in sample mode),
// so releasing the engine breaks nothing before the key is in.

import { door, useDoorQuery, useLive } from "@/lib/backend";
import LinkedInSearch from "./LinkedInSearch";
import RecruiterSearch from "./RecruiterSearch";

export default function SearchSwitch() {
  const live = useLive();
  const status = useDoorQuery(door.liStatus, live ? {} : "skip") as { ok: boolean; on?: boolean } | undefined;
  if (live && status === undefined) return null;
  return live && status?.ok && status.on ? <RecruiterSearch /> : <LinkedInSearch />;
}
