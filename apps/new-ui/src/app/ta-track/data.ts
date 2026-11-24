// TA Track's sample desk (owner's designs TT1 "the team" and TT2 "one TA", 14 Nov 2026).
//
// Two sources, as in production:
//   - the Work From Home Tracker (career141-dev/whf-tracker): per person, per day, per
//     website - time on the site (selected tab, browser in focus) split into active
//     (mouse or keyboard in the last minute) and idle (none for a minute, or a locked
//     computer), clicks, scrolls, seconds of mouse movement; and per browser whether
//     tracking is on and its last upload. Website names only - never full links, page
//     titles, typed text or screenshots. Kept 30 days, Colombo dates. Admins and leads
//     see everyone; a TA sees only themself.
//   - the TA System: CVs sent to the Director, Director shortlists, placements, the
//     day's set, Excel profiles, the workday's start and its events.
// GAP: the tracker keeps one total per website per day. The day timeline (active /
// idle / away by hour) needs it to keep hourly slices - a tracker change. The hours
// here are sample data.
// Everything below is made up and seeded, so it is the same on every load.

export type Site = { domain: string; activeMs: number; idleMs: number; clicks: number; scrolls: number; movementSeconds: number };
export type Day = {
  date: string; // YYYY-MM-DD, Colombo
  sites: Site[];
  cvsToDirector: number;
  shortlists: number;
  placements: number;
};
export type Ta = { id: string; name: string; days: Day[]; browsers: { name: string; lastSyncAt: number; enabled: boolean }[] };

export const GOAL = { activeHoursPerDay: 7, cvsPerDay: 5, setSize: 5, excelProfilesPerDay: 5 };
export const RETENTION_DAYS = 30;

const NAMES: [string, number][] = [
  ["Dilini", 1.12],
  ["Chathura", 1.0],
  ["Kavya", 0.95],
  ["Dinuka", 0.98],
  ["Sewwandi", 0.82],
  ["Nuwan", 0.8],
  ["Ravindu", 0.64],
  ["Tharushi", 0.9],
  ["Hasini", 0.88],
];

// Share of a day's active time per website, with how busy the hands are there.
const SITES: { domain: string; share: number; clicksPerMin: number; scrollsPerMin: number }[] = [
  { domain: "ta-system.career141.com", share: 0.36, clicksPerMin: 2.4, scrollsPerMin: 3 },
  { domain: "linkedin.com", share: 0.27, clicksPerMin: 1.6, scrollsPerMin: 5 },
  { domain: "outlook.office.com", share: 0.14, clicksPerMin: 1.1, scrollsPerMin: 2 },
  { domain: "web.whatsapp.com", share: 0.11, clicksPerMin: 1.4, scrollsPerMin: 1.5 },
  { domain: "chatgpt.com", share: 0.07, clicksPerMin: 0.8, scrollsPerMin: 1.2 },
  { domain: "docs.google.com", share: 0.03, clicksPerMin: 1, scrollsPerMin: 2 },
  { domain: "youtube.com", share: 0.02, clicksPerMin: 0.3, scrollsPerMin: 0.6 },
];

let seed = 141;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/** Today in Colombo, as YYYY-MM-DD. */
export const colomboDay = (t = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
const addDays = (date: string, n: number) => colomboDay(Date.parse(`${date}T12:00:00+05:30`) + n * 86400000);
export const weekday = (date: string) => new Date(`${date}T12:00:00+05:30`).getUTCDay(); // 0 Sun .. 6 Sat

function build(): Ta[] {
  seed = 141;
  const today = colomboDay();
  const now = Date.now();
  return NAMES.map(([name, pace], i) => {
    const days: Day[] = [];
    for (let back = RETENTION_DAYS - 1; back >= 0; back--) {
      const date = addDays(today, -back);
      const wd = weekday(date);
      // Weekends are empty - except today, so the sample always has a day to show.
      if ((wd === 0 || wd === 6) && back > 0) continue;
      // Today is part-way through.
      const part = back === 0 ? 0.72 : 1;
      // Ravindu's idle time doubles over the last few days (the design's note).
      const slack = name === "Ravindu" && back < 4 ? 2 : 1;
      const activeH = (5.4 + rand() * 1.8) * pace * part;
      const idleH = (0.5 + rand() * 0.6) * slack * part;
      const sites = SITES.map((s) => {
        const a = activeH * 3600000 * s.share * (0.75 + rand() * 0.5);
        const mins = a / 60000;
        return {
          domain: s.domain,
          activeMs: Math.round(a),
          idleMs: Math.round(idleH * 3600000 * s.share * (0.6 + rand() * 0.8)),
          clicks: Math.round(mins * s.clicksPerMin),
          scrolls: Math.round(mins * s.scrollsPerMin),
          movementSeconds: Math.round(mins * 60 * (0.25 + rand() * 0.2)),
        };
      });
      days.push({
        date,
        sites,
        cvsToDirector: Math.max(0, Math.round((3 + rand() * 4) * pace * part)),
        shortlists: Math.round(rand() * 2 * pace),
        placements: rand() > 0.93 ? 1 : 0,
      });
    }
    return {
      id: `ta${i}`,
      name,
      days,
      browsers: [{ name: "Chrome", lastSyncAt: now - (1 + i) * 60000 * (name === "Ravindu" ? 9 : 1), enabled: true }],
    };
  });
}
/** Built on first use, in the browser only: it depends on today's date and the clock,
 *  so building it on the server would not match what the browser draws. */
let built: Ta[] | undefined;
export const team = () => (built ??= build());

export type Range = "today" | "week" | "month" | "custom";
/** The dates a range covers, oldest first (Colombo; weekends are just empty). */
export function datesOf(range: Range, custom: [string, string]): string[] {
  const today = colomboDay();
  if (range === "today") return [today];
  let from = today;
  if (range === "week") {
    const wd = weekday(today);
    from = addDays(today, -((wd + 6) % 7)); // back to Monday
  } else if (range === "month") from = `${today.slice(0, 8)}01`;
  else from = custom[0];
  const to = range === "custom" ? custom[1] : today;
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const workdays = (dates: string[]) => dates.filter((d) => weekday(d) % 6 !== 0).length;

/** One person's totals over some dates. */
export function totals(ta: Ta, dates: string[]) {
  const set = new Set(dates);
  const days = ta.days.filter((d) => set.has(d.date));
  const sites = new Map<string, Site>();
  for (const d of days)
    for (const s of d.sites) {
      const t = sites.get(s.domain) ?? { domain: s.domain, activeMs: 0, idleMs: 0, clicks: 0, scrolls: 0, movementSeconds: 0 };
      t.activeMs += s.activeMs;
      t.idleMs += s.idleMs;
      t.clicks += s.clicks;
      t.scrolls += s.scrolls;
      t.movementSeconds += s.movementSeconds;
      sites.set(s.domain, t);
    }
  const list = [...sites.values()].sort((a, b) => b.activeMs + b.idleMs - (a.activeMs + a.idleMs));
  const sum = (k: keyof Omit<Site, "domain">) => list.reduce((n, s) => n + s[k], 0);
  return {
    days,
    sites: list,
    activeMs: sum("activeMs"),
    idleMs: sum("idleMs"),
    clicks: sum("clicks"),
    scrolls: sum("scrolls"),
    movementSeconds: sum("movementSeconds"),
    cvs: days.reduce((n, d) => n + d.cvsToDirector, 0),
    shortlists: days.reduce((n, d) => n + d.shortlists, 0),
    placements: days.reduce((n, d) => n + d.placements, 0),
  };
}

/** Where the time goes: websites grouped the way the design names them. */
export const GROUPS: { name: string; match: (d: string) => boolean; color: string }[] = [
  { name: "TA System", match: (d) => d.includes("career141"), color: "var(--color-brand)" },
  { name: "LinkedIn", match: (d) => d.includes("linkedin"), color: "var(--color-info)" },
  { name: "Outlook", match: (d) => d.includes("outlook") || d.includes("office"), color: "var(--color-violet)" },
  { name: "WhatsApp", match: (d) => d.includes("whatsapp"), color: "var(--color-success)" },
  { name: "ChatGPT", match: (d) => d.includes("chatgpt") || d.includes("openai"), color: "var(--color-warn)" },
  { name: "Other", match: () => true, color: "var(--color-border-strong)" },
];
export const groupOf = (domain: string) => GROUPS.find((g) => g.match(domain))!;

/** Sample hour blocks for the day timeline - see GAP above. */
export const HOURS: { from: number; to: number; kind: "active" | "idle" | "away" }[] = [
  { from: 8.87, to: 9.9, kind: "active" },
  { from: 9.9, to: 10.15, kind: "idle" },
  { from: 10.15, to: 11.55, kind: "active" },
  { from: 11.55, to: 11.7, kind: "away" },
  { from: 11.7, to: 12.75, kind: "active" },
  { from: 12.75, to: 13.2, kind: "idle" },
  { from: 13.2, to: 13.75, kind: "away" },
  { from: 13.75, to: 14.98, kind: "active" },
  { from: 14.98, to: 15.25, kind: "idle" },
  { from: 15.25, to: 15.85, kind: "active" },
];
/** The workday's own events (TA System), shown under the timeline. */
export const EVENTS: { at: string; what: string; tone: "brand" | "violet" | "plain" | "info" | "warn" }[] = [
  { at: "8:52", what: "Started workday", tone: "brand" },
  { at: "10:40", what: "Sent Kasun to Director", tone: "violet" },
  { at: "12:30", what: "Away 40 min", tone: "plain" },
  { at: "2:30", what: "Interview — Dilini", tone: "info" },
  { at: "6:00", what: "EOD due", tone: "warn" },
];

/** CSV for the chosen range, the tracker's own columns; formula cells defused. */
export function csv(tas: Ta[], dates: string[]) {
  const set = new Set(dates);
  const head = ["name", "date", "domain", "foregroundMs", "activeMs", "idleMs", "clicks", "scrolls", "movementSeconds"];
  const cell = (v: unknown) => `"${String(v).replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
  const lines = [head.join(",")];
  for (const ta of tas)
    for (const d of ta.days)
      if (set.has(d.date))
        for (const s of d.sites) lines.push([ta.name, d.date, s.domain, s.activeMs + s.idleMs, s.activeMs, s.idleMs, s.clicks, s.scrolls, s.movementSeconds].map(cell).join(","));
  return "﻿" + lines.join("\r\n");
}

export const hm = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(1, "0")}m` : `${m}m`;
};
