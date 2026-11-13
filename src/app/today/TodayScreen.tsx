"use client";

import { startWorkday, useWorkday } from "@/lib/workday";
import Today from "./Today";
import Workday from "./Workday";

// Which Today to show: T1 "Good morning" until the workday is started, then T2.
// The started day itself lives in src/lib/workday.ts, because the opening's
// screens read it too: no upload, shortlist or move before the day is started
// (FLOW-CHECK 6.1, 6.2).
export default function TodayScreen() {
  // "pending" while the page is drawn on the server and hydrates, so neither screen
  // flashes before the browser knows which one it is.
  const started = useWorkday();

  if (started === "pending") return <div className="flex-1" />;
  if (started === "none") return <Today onStart={startWorkday} />;
  return <Workday startedAt={started} />;
}
