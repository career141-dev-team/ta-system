"use client";

import { useState } from "react";
import { startWorkday, useLiveDesk, useWorkday } from "@/lib/workday";
import Today from "./Today";
import Workday from "./Workday";
import Home from "./Homes";
import AuraHome from "./AuraHome";
import { useRole, useSignedInPerson, worksADay } from "@/lib/role";
import { door, useDoorQuery } from "@/lib/backend";
import type { MyDay } from "@/lib/askAura";

// Which Today to show: T1 "Good morning" until the workday is started, then T2.
// The started day itself lives in src/lib/workday.ts, because the opening's
// screens read it too: no upload, shortlist or move before the day is started
// (FLOW-CHECK 6.1, 6.2).
export default function TodayScreen() {
  // "pending" while the page is drawn on the server and hydrates, so neither screen
  // flashes before the browser knows which one it is.
  const started = useWorkday();
  // Signed in, the backend starts a day with its first position (ta/workdays:start),
  // so Start shows the positions to pick; the first pick starts the day.
  const live = useLiveDesk() !== null;
  const [choosing, setChoosing] = useState(false);
  // No workday of their own: an admin keeps the team board; a TA Lead, Director or Ops
  // person starts on the AURA chat (owner 19 Nov 2026).
  const role = useRole();
  // Signed in, the line and numbers under Start workday are the TA's own (ui/myDay:today,
  // owner 20 Nov 2026); signed out they stay the design's sample.
  const signed = useSignedInPerson() !== null;
  const read = useDoorQuery(door.myDay, signed && worksADay(role) ? {} : "skip") as ({ ok: true } & MyDay) | { ok: false } | undefined;
  const mine = read && read.ok ? read.totals : null;
  const real = mine
    ? {
        line: `${mine.positions} ${mine.positions === 1 ? "position is" : "positions are"} yours today.`,
        stats: [
          [String(mine.sentYesterday), "CVs to Director yesterday"],
          [String(mine.shortlistedToday), "shortlisted today"],
          [String(mine.cvsToday), "new CVs today"],
        ] as [string, string][],
      }
    : signed
      ? { line: "Reading your day…", stats: [] as [string, string][] }
      : {};
  if (role === "Admin") return <Home key={role} role="Lead" />;
  if (!worksADay(role)) return <AuraHome key={role} role={role as "Lead" | "Director" | "Ops"} />;

  if (started === "pending") return <div className="flex-1" />;
  if (started === "none" && live) return choosing ? <Workday startedAt={null} /> : <Today onStart={() => setChoosing(true)} {...real} />;
  if (started === "none") return <Today onStart={startWorkday} {...real} />;
  return <Workday startedAt={started} />;
}
