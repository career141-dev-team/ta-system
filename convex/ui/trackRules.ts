// convex/ui/trackRules.ts
//
// TA Track for the new UI (R3, 21 Nov 2026), the pure part: the dates a request
// covers and how the tracker's rows become the screen's people -> days -> websites.
// The tracker keeps one row per browser, per day, per website; two browsers of one
// person are added together, as the old report does.

import { TRACKING_RETENTION_MS, trackingDay, validTrackingDate } from "../../src/lib/taTracking";

export const MAX_DAYS = 31;

export type TrackRow = {
  userId: string; date: string; domain: string;
  activeMs: number; idleMs: number; clicks: number; scrolls: number; movementSeconds: number; lastSeen: number;
};
export type Site = { domain: string; activeMs: number; idleMs: number; clicks: number; scrolls: number; movementSeconds: number };
export type Day = { date: string; sites: Site[]; cvsToDirector: number };
export type Person = { id: string; name: string; days: Day[]; browsers: { name: string; lastSyncAt: number; enabled: boolean }[] };

/** Every Colombo date from..to, oldest first; a sentence when the range is not allowed. */
export function datesBetween(from: string, to: string, now = Date.now()): string[] | string {
  if (!validTrackingDate(from, now) || !validTrackingDate(to, now)) return "Choose dates within the last 30 days.";
  if (from > to) return "The first date must come before the last.";
  const out: string[] = [];
  for (let t = Date.parse(`${from}T12:00:00+05:30`); out.length <= MAX_DAYS; t += 86_400_000) {
    const d = trackingDay(t);
    out.push(d);
    if (d >= to) return out;
  }
  return "Choose 31 days or fewer.";
}

/** People -> days -> websites, busiest website first; CVs to the Director laid on each day. */
export function peopleOf(
  rows: TrackRow[],
  people: { id: string; name: string }[],
  devices: { userId: string; lastSyncAt: number; enabled: boolean }[],
  cvs: { userId: string; date: string; count: number }[],
  now = Date.now(),
): Person[] {
  const byPerson = new Map<string, Map<string, Map<string, Site>>>();
  for (const r of rows) {
    if (r.lastSeen < now - TRACKING_RETENTION_MS) continue;
    const days = byPerson.get(r.userId) ?? new Map<string, Map<string, Site>>();
    byPerson.set(r.userId, days);
    const sites = days.get(r.date) ?? new Map<string, Site>();
    days.set(r.date, sites);
    const s = sites.get(r.domain) ?? { domain: r.domain, activeMs: 0, idleMs: 0, clicks: 0, scrolls: 0, movementSeconds: 0 };
    s.activeMs += r.activeMs; s.idleMs += r.idleMs; s.clicks += r.clicks; s.scrolls += r.scrolls; s.movementSeconds += r.movementSeconds;
    sites.set(r.domain, s);
  }
  const cvOn = new Map(cvs.map((c) => [`${c.userId}|${c.date}`, c.count]));
  return people.map((p) => {
    const days = byPerson.get(p.id) ?? new Map<string, Map<string, Site>>();
    const dates = new Set([...days.keys(), ...cvs.filter((c) => c.userId === p.id).map((c) => c.date)]);
    return {
      id: p.id,
      name: p.name,
      days: [...dates].sort().map((date) => ({
        date,
        sites: [...(days.get(date)?.values() ?? [])].sort((a, b) => b.activeMs + b.idleMs - (a.activeMs + a.idleMs)),
        cvsToDirector: cvOn.get(`${p.id}|${date}`) ?? 0,
      })),
      browsers: devices.filter((d) => d.userId === p.id).map((d, i) => ({ name: `Browser ${i + 1}`, lastSyncAt: d.lastSyncAt, enabled: d.enabled })),
    };
  });
}
