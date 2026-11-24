"use client";

import { useSyncExternalStore } from "react";
import { useRole, useSignedInPerson, worksADay } from "./role";

// Today's started workday, shared by Today (which starts it) and by every screen
// the TA System gates on it: a TA cannot upload a CV, shortlist or move a candidate
// until the day is started (FLOW-CHECK 6.2; convex/lib/workdayScope.ts in the TA
// System). Placeholder until the backend is wired: the started day is kept in this
// browser only, for today's date, so a refresh keeps it and tomorrow starts fresh.
// With the backend the started workday - and which positions are on it - is the
// server's, and the server stays the judge.
const KEY = "ta-ui:workday";
const CHANGED = "workday:change";

const todayKey = () => new Date().toLocaleDateString("en-CA"); // 2026-11-13

// Where the start is kept when the browser blocks storage (a private window), so
// Start workday still works for this visit.
let memory: number | undefined;

// Signed in (19 Nov, D4): the day is the backend's, pushed here by backend.tsx
// (LiveWorkday) from ui/day:today. `undefined` = sample mode (the browser's own
// note below); `null` = live but not read yet.
export type LiveDay = { id: string; startedAt: number; finishedAt: number | null } | "none";
let live: LiveDay | null | undefined;
/** The whole ui/day:today answer, for Today's rail and checks. */
let liveDesk: unknown = null;

export function setLiveDay(day: LiveDay | null, desk: unknown) {
  live = day;
  liveDesk = desk;
  window.dispatchEvent(new Event(CHANGED));
}
/** Live mode only: the day before it is read is "pending", not "none". */
export function goLive() {
  if (live === undefined) live = null;
}
const readDesk = () => liveDesk;
/** ui/day:today's answer when signed in; null in sample mode or before it is read. */
export const useLiveDesk = () => useSyncExternalStore(subscribe, readDesk, () => null);

function read(): string {
  if (live !== undefined) return live === null ? "pending" : live === "none" ? "none" : String(live.startedAt);
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { day?: string; at?: number } | null;
    if (v?.day === todayKey() && v.at) return String(v.at);
  } catch {
    // Blocked storage: fall through to this visit's own memory.
  }
  return memory ? String(memory) : "none";
}
const subscribe = (cb: () => void) => {
  window.addEventListener(CHANGED, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGED, cb);
    window.removeEventListener("storage", cb);
  };
};

/** "pending" while the page hydrates, "none" before Start workday, else when it started. */
export function useWorkday(): "pending" | "none" | number {
  const v = useSyncExternalStore(subscribe, read, () => "pending");
  return v === "pending" || v === "none" ? v : Number(v);
}

export function startWorkday() {
  memory = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify({ day: todayKey(), at: memory }));
  } catch {
    // Blocked storage: `memory` keeps the day started for this visit.
  }
  window.dispatchEvent(new Event(CHANGED));
}

// The day ends by itself at the first 100% End of day email (the TA System's
// autoCompleteWorkday): the clock stops there, Follow-up and Add-on work can still
// be sent. Kept beside the start, for today only.
let memoryEnd: number | undefined;
function readEnd(): number {
  if (live !== undefined) return live && live !== "none" ? live.finishedAt ?? 0 : 0;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { day?: string; end?: number } | null;
    if (v?.day === todayKey() && v.end) return v.end;
  } catch {}
  return memoryEnd ?? 0;
}
/** When today's workday finished (0 = still running). */
export const useDayEnd = () => useSyncExternalStore(subscribe, readEnd, () => 0);

/** A 100% End of day email went: the first one finishes the day; later ones do not move it. */
export function endWorkday(at = Date.now()) {
  if (readEnd()) return;
  memoryEnd = at;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") ?? {};
    if (v.day === todayKey()) localStorage.setItem(KEY, JSON.stringify({ ...v, end: at }));
  } catch {}
  window.dispatchEvent(new Event(CHANGED));
}

/** The gate, in the TA System's words: empty when work is allowed. Only a TA is
 *  gated; a TA Lead, admin, Director or Ops person works without a started day.
 *  ponytail: "started today" only; whether THIS opening is on today's workday
 *  ("X is not on today's workday... Add another position") needs the day's
 *  positions from the backend. */
// The live build (R7, 21 Nov 2026): until the signed-in person is known the role is only
// a guess ("TA", or an old View-as pick), which told a TA lead "Your workday has not
// started" on Excel Tables. No gate until the real role arrives - the backend still
// judges every write.
const LIVE_BUILD = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export function useWorkdayGate(): string {
  const day = useWorkday();
  const role = useRole();
  const signed = useSignedInPerson();
  if (LIVE_BUILD && !signed) return "";
  if (!worksADay(role)) return "";
  return day === "none" ? "Your workday has not started today." : "";
}
