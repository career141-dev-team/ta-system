// What the person asked AURA, read before anything happens (owner 20 Nov 2026: the
// pet's Ask box and the top bar sent every question to the Database page). Four kinds:
//   day    - "how is my work today", "how many shortlisted today": answered at once
//            from the person's own day (ui/myDay:today), no model;
//   open   - "open pipeline for finance", "go to TA Track": that screen;
//   search - "find SAP consultants in Colombo", "do we have Ruwan": the Database page;
//   chat   - anything else: AURA's Today chat (Claude Haiku on the person's desk).
// Pure, so it is checked by askAura.check.ts.

export type DayPosition = { id: string; title: string; client: string; cvsToday: number; shortlistedToday: number; directorToday: number; sentToday: number; sentYesterday: number };
export type MyDay = {
  workday: { startedAt: number; finishedAt: number | null; positions: number } | null;
  plan: { state: string; done: number; of: number; open: number; next: { title: string; startMin: number } | null; late: number } | null;
  checks: { done: number; of: number };
  totals: { positions: number; cvsToday: number; shortlistedToday: number; directorToday: number; sentToday: number; sentYesterday: number; searchesToday?: number };
  positions: DayPosition[];
};

export type Topic = "overview" | "shortlisted" | "director" | "cvs" | "checks" | "plan" | "searches";
export type Route = { kind: "day"; topic: Topic } | { kind: "open"; path: string; label: string } | { kind: "search"; q: string } | { kind: "chat" };
export type Row = { main: string; meta?: string; href?: string };
export type Said = { say: string; rows: Row[] };

const SCREENS: [RegExp, string, string][] = [
  [/\btoday\b|\bmy day\b|\bhome\b/, "/today", "Today"],
  [/\bopenings?\b|\bpositions?\b|\bjobs?\b/, "/openings", "Openings"],
  [/\bstrategy planner\b|\bplanner\b/, "/strategy", "Strategy Planner"],
  [/\bdatabase\b/, "/database", "Database"],
  [/\bta track\b|\btracker\b/, "/ta-track", "TA Track"],
  [/\blinkedin search\b/, "/linkedin-search", "LinkedIn Search"],
  [/\bpeople\b|\broles\b/, "/people", "People & roles"],
  [/\bfeedback\b/, "/feedback", "Feedback"],
  [/\bbin\b/, "/bin", "Bin"],
];
// An opening's own views, by the words a TA would use.
const VIEWS: [RegExp, string, string][] = [
  [/\bpipeline\b|\bkanban\b|\bboard\b/, "pipeline", "Pipeline"],
  [/\bscoops?\b/, "scoops", "Scoops"],
  [/\blinkedin( job| post)?s?\b/, "linkedin-job", "LinkedIn Job"],
  [/\bjd\b|\bjob description\b/, "jd", "Job Description"],
  [/\bdatabase cvs?\b|\bmatches\b/, "database", "Database CVs"],
  [/\bstrateg(y|ies)\b/, "strategies", "Strategies"],
  [/\bmidday\b|\beod\b|\bend of day\b|\bemails?\b/, "midday", "Midday & EOD"],
  [/\bresearch\b/, "hh-research", "Research"],
  [/\bsuggestions?\b/, "hh-suggestions", "Suggestions"],
  [/\bexcel( tables?)?\b|\bl-?sheets?\b/, "hh-tables", "Excel Tables"],
  [/\breferees?\b|\breferee calls?\b/, "hh-referees", "Referee Calls"],
];

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

/** The position a sentence names, by a word of its title or client; one position alone is that one. */
function positionIn(text: string, positions: { id: string; title: string; client: string }[]) {
  const said = new Set(words(text));
  const hits = positions.filter((p) => [...words(p.title), ...words(p.client)].some((w) => said.has(w)));
  if (hits.length === 1) return hits[0];
  if (!hits.length && positions.length === 1) return positions[0];
  return null;
}

export function readAsk(text: string, positions: { id: string; title: string; client: string }[] = []): Route {
  const t = text.toLowerCase().trim();
  const mine = /\b(my|me|i|i'?ve|i'?m|am i|today)\b/.test(t);

  // Day questions first: "how many shortlisted today" is about my day, not a search.
  if (mine || /\bhow many\b/.test(t)) {
    if (/\bsearch(es)?\b/.test(t) && /\bhow many\b|\bi (did|done|made|ran)\b/.test(t)) return { kind: "day", topic: "searches" };
    if (/shortlist/.test(t)) return { kind: "day", topic: "shortlisted" };
    if (/director/.test(t)) return { kind: "day", topic: "director" };
    if (/\bchecks?\b/.test(t)) return { kind: "day", topic: "checks" };
    if (/\bnew cvs?\b|\bcvs?\b.*\b(came|today|in)\b/.test(t)) return { kind: "day", topic: "cvs" };
    if (/\bplan\b|\bnext\b|\blate\b|\bbehind\b|\bto ?do\b/.test(t)) return { kind: "day", topic: "plan" };
    if (/\b(work|day|doing|progress|status|summary)\b/.test(t)) return { kind: "day", topic: "overview" };
  }

  // "open ...", "go to ...", "show me ...": a screen, or a view of one position.
  const open = t.match(/^(?:please )?(?:open|go to|goto|take me to|show me|show)\s+(?:my\s+|the\s+)?(.+)$/);
  if (open) {
    const rest = open[1];
    const view = VIEWS.find(([re]) => re.test(rest));
    if (view) {
      const p = positionIn(rest, positions);
      if (p) return { kind: "open", path: `/openings/demo?job=${p.id}&view=${view[1]}`, label: `${view[2]} for ${p.title}` };
      if (!/\bdatabase\b/.test(rest) || /cvs?|matches/.test(rest)) return { kind: "open", path: "/openings", label: "Openings - pick the position" };
    }
    const screen = SCREENS.find(([re]) => re.test(rest));
    if (screen) return { kind: "open", path: screen[1], label: screen[2] };
  }

  // Asking AURA to do something with words ("write a note to a candidate") is a chat.
  if (/^(?:please )?(?:write|draft|email|send|tell|explain|help|summari[sz]e|make|create|plan|remind)\b/.test(t)) return { kind: "chat" };

  // Looking for people: the Database page, with the words already in the box.
  if (/^(?:find|search|look for|lookup|who\b|any\b)|\bdo we have\b|\bcandidates?\b|\bprofiles?\b|\bconsultants?\b|\bengineers?\b|\bmanagers?\b|\bdevelopers?\b|\d+\+? ?years?\b/.test(t))
    return { kind: "search", q: text.trim() };

  return { kind: "chat" };
}

const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const open = (id: string, view: string) => `/openings/demo?job=${id}&view=${view}`;

/** The answer to a day question, in AURA's words, from the person's own day. */
export function dayAnswer(day: MyDay, topic: Topic): Said {
  const t = day.totals;
  const per = (k: keyof DayPosition, unit: string, view: string, many?: string): Row[] =>
    day.positions.filter((p) => (p[k] as number) > 0).map((p) => ({ main: p.title, meta: `${p.client} · ${n(p[k] as number, unit, many)}`, href: open(p.id, view) }));
  const planLine = () => {
    const p = day.plan;
    if (!p) return day.workday ? "No plan yet - plan your day with AURA on Today." : "Start your workday and plan it with AURA on Today.";
    if (p.state === "draft") return "Your plan is waiting for your approval on Today.";
    if (p.state === "closed") return `Day closed: ${p.done} of ${p.of} done.`;
    return `${p.done} of ${p.of} done${p.next ? `. Next: ${p.next.title} at ${hm(p.next.startMin)}` : ""}${p.late ? `. ${n(p.late, "task")} running late` : ""}.`;
  };

  switch (topic) {
    case "shortlisted":
      return { say: t.shortlistedToday ? `You shortlisted ${n(t.shortlistedToday, "candidate")} today.` : "No shortlists yet today.", rows: per("shortlistedToday", "shortlisted", "pipeline", "shortlisted") };
    case "director":
      return {
        say: `${n(t.directorToday, "CV")} moved to Director Review today; your emails sent the Director ${t.sentToday} today and ${t.sentYesterday} yesterday.`,
        rows: per("directorToday", "to Director", "pipeline", "to Director"),
      };
    case "cvs":
      return { say: t.cvsToday ? `${n(t.cvsToday, "new CV")} came in today across your positions.` : "No new CVs yet today.", rows: per("cvsToday", "new CV", "pipeline") };
    case "checks":
      return { say: day.workday ? (day.checks.of ? `${day.checks.done} of ${day.checks.of} checks done today.` : "No checks on today's positions yet.") : "Your workday has not started, so there are no checks yet.", rows: [] };
    case "plan":
      return { say: planLine(), rows: [] };
    case "searches":
      // Counted from the Database chat's searches (ui/searches:record); older backends do not send it.
      if (t.searchesToday === undefined) return { say: "I do not count your database searches yet.", rows: [] };
      return { say: t.searchesToday ? `You ran ${n(t.searchesToday, "database search", "database searches")} today.` : "No database searches yet today.", rows: [{ main: "Open the Database chat", href: "/database" }] };
    default:
      return {
        say: day.workday ? `Your day started at ${clock(day.workday.startedAt)}${day.workday.finishedAt ? ` and finished at ${clock(day.workday.finishedAt)}` : ""}, on ${n(day.workday.positions, "position")}.` : "Your workday has not started yet.",
        rows: [
          { main: "Shortlisted today", meta: String(t.shortlistedToday) },
          { main: "CVs to Director today", meta: String(t.directorToday) },
          { main: "New CVs today", meta: String(t.cvsToday) },
          ...(day.workday ? [{ main: "Checks", meta: `${day.checks.done} of ${day.checks.of}` }] : []),
          { main: "Plan", meta: planLine() },
        ],
      };
  }
}

/** Signed out: a made-up day, so the box shows what it will do. */
export const SAMPLE_DAY: MyDay = {
  workday: null,
  plan: null,
  checks: { done: 0, of: 0 },
  totals: { positions: 4, cvsToday: 9, shortlistedToday: 3, directorToday: 2, sentToday: 0, sentYesterday: 7 },
  positions: [
    { id: "demo", title: "SAP Transformation Lead", client: "PGP Glass", cvsToday: 5, shortlistedToday: 2, directorToday: 2, sentToday: 0, sentYesterday: 4 },
    { id: "demo", title: "Finance Manager", client: "Hayleys", cvsToday: 4, shortlistedToday: 1, directorToday: 0, sentToday: 0, sentYesterday: 3 },
  ],
};
