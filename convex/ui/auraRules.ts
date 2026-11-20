// convex/ui/auraRules.ts
//
// AURA on Today (E5 group 1, 19 Nov): the pure half - what a reply costs, what
// the model is told, and what of its answer reaches the screen. No database, no
// network, so tests/aura.test.ts can hold every rule.
//
// Owner's decisions (19 Nov): Claude Haiku 5.5 for everything (convex/lib/llm.ts,
// ANTHROPIC_API_KEY), every call counted, $5 a day across the desk. AURA reads
// and suggests; it never moves, sends or saves anything itself.

/** The whole desk's AI spend for one Colombo day, in US dollars. */
export const AI_DAY_LIMIT_USD = 5;

/** Claude Haiku 5.5, US$ per million tokens (up to 100K-token prompts). */
const PRICE = { input: 0.1, output: 0.5 };

export function costOf(inputTokens: number, outputTokens: number): number {
  return (Math.max(0, inputTokens) * PRICE.input + Math.max(0, outputTokens) * PRICE.output) / 1_000_000;
}

/** One position on the TA's desk, as ui/desk:desk sends it. */
export type DeskPosition = {
  id: string;
  title: string;
  client: string;
  priority: string | null;
  day: number;
  target: number | null;
  skills: string[];
  years: [number, number | null];
  salary: string | null;
  where: string;
  hiring: string | null;
  pipeline: number;
  cvsToday: number;
  director: number;
  jdApproved: boolean;
  linkedinLive: boolean;
  strategies: { name: string; waiting: boolean }[];
};

export type Turn = { role: "user" | "assistant"; text: string };
export type TodayPick = { jobId: string; workType: string };

/** One step of a day plan. `start` is minutes after midnight and `minutes` how long it
 *  takes - the plan saved on Approve (ui/plan:saveDraft) is built from these, so every
 *  step has both (20 Nov: before, a live plan saved every task at midnight). */
export type Step = { at: string; start: number; minutes: number; what: string; where?: string; tone: "brand" | "warn" | "info" | "none" };

/** "14:30", "9:00", "2:30 pm", "9" -> minutes after midnight; null when it is not a time.
 *  A bare 1-6 with no am/pm is the afternoon: nobody plans 2:30 at night. */
export function clockMin(at: string): number | null {
  const m = at.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  const pm = m[3]?.startsWith("p"), am = m[3]?.startsWith("a");
  if (pm && h < 12) h += 12;
  else if (am && h === 12) h = 0;
  else if (!m[3] && h >= 1 && h <= 6) h += 12;
  return h * 60 + min;
}
/** 870 -> "2:30" (the plan card's own way of writing a time). */
export const clockText = (min: number) => `${Math.floor(min / 60) % 12 || 12}:${String(min % 60).padStart(2, "0")}`;
export type Row = { main: string; meta?: string; where?: string };
export type Reply =
  | { kind: "plan"; headline: string; steps: Step[] }
  | { kind: "answer"; say: string; rows: Row[]; chips: string[]; warn: string[] };

// Stable text first, so the API's prompt cache can hold it (llm.ts marks the system prompt).
export const SYSTEM = `You are AURA, the assistant inside Career141's recruitment desk, talking to one Talent Acquisition person (a TA) on the Today screen.
You get their desk as JSON: each open position they are on, with its priority (P1 most urgent; "day N of target" days), requirements, pipeline counts and the strategies their TA Lead gave them. "today" lists the positions on today's workday and each one's work type: "100%" is the main hunt of the day, "Follow-up" and "Add-on" are lighter.

Rules:
- Use only facts in the desk JSON. Never invent a candidate, a number, a client or a deadline. If something is not in the desk, say you do not have it.
- You only advise. You cannot move candidates, send emails or save anything; tell the TA which screen to use.
- Plain, short English. No jargon. No greetings, no sign-off.
- Order work the desk's way: 100% positions first, then lower P number, then positions past their target, then strategies waiting to be accepted.
- The End of day email is due by 6:00 pm; leave time for it.

Reply with one JSON object, nothing else, in one of two shapes:
1. A day plan, when they ask to plan the day or change the plan:
{"kind":"plan","headline":"one short sentence","steps":[{"at":"14:30","minutes":45,"what":"what to do, one line","where":"<position id or omit>","tone":"brand|warn|info|none"}]}
"at" is the start in 24-hour time; "minutes" is how long the step takes (5 to 240). Start from Now, one step after another with no overlaps, and keep a time they gave (an interview at 2:30 pm is "14:30"). The Midday email at 12:30 and the End of day email are added to every plan for you: do not list them. Plan the day to 17:00 unless they say another finish.
tone: brand = 100% work, warn = follow-up work, info = a meeting or interview they mentioned, none = admin. 3 to 8 steps, times in order.
2. Anything else:
{"kind":"answer","say":"one or two sentences","rows":[{"main":"short line","meta":"optional detail","where":"<position id or omit>"}],"chips":["optional short facts"],"warn":["optional short warnings"]}
At most 6 rows, 6 chips, 3 warnings.`;

const clip = (v: unknown, n: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const TONES = new Set(["brand", "warn", "info", "none"]);

/** The model's JSON made safe for the screen; null when it is not one of the two shapes. */
export function cleanReply(raw: unknown, ids: ReadonlySet<string>): Reply | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const where = (v: unknown) => (typeof v === "string" && ids.has(v) ? v : undefined);
  if (r.kind === "plan") {
    // A step without a time it can be saved at is dropped; steps go in time order and
    // each runs to the next one's start unless the model gave a shorter length.
    const timed = (Array.isArray(r.steps) ? r.steps : [])
      .slice(0, 10)
      .flatMap((s: Record<string, unknown>) => {
        const what = clip(s?.what, 160);
        const start = clockMin(clip(s?.at, 12));
        if (!what || start === null) return [];
        const tone = TONES.has(s?.tone as string) ? (s.tone as Step["tone"]) : "none";
        const said = Math.round(Number(s?.minutes));
        return [{ start, said: Number.isFinite(said) ? said : 0, what, tone, ...(where(s?.where) ? { where: where(s?.where) } : {}) }];
      })
      .sort((a, b) => a.start - b.start);
    const steps: Step[] = timed.map(({ said, ...s }, i) => {
      const gap = timed[i + 1] ? timed[i + 1].start - s.start : 0;
      const minutes = Math.min(240, Math.max(5, said >= 5 ? (gap > 0 ? Math.min(said, gap) : said) : gap > 0 ? gap : 30));
      return { at: clockText(s.start), start: s.start, minutes, what: s.what, tone: s.tone, ...(s.where ? { where: s.where } : {}) };
    });
    const headline = clip(r.headline, 200);
    return steps.length && headline ? { kind: "plan", headline, steps } : null;
  }
  if (r.kind === "answer") {
    const say = clip(r.say, 500);
    if (!say) return null;
    const rows = (Array.isArray(r.rows) ? r.rows : []).slice(0, 6).flatMap((x: Record<string, unknown>) => {
      const main = clip(x?.main, 160);
      return main ? [{ main, ...(clip(x?.meta, 160) ? { meta: clip(x?.meta, 160) } : {}), ...(where(x?.where) ? { where: where(x?.where) } : {}) }] : [];
    });
    const list = (v: unknown, n: number) => (Array.isArray(v) ? v : []).map((s) => clip(s, 80)).filter(Boolean).slice(0, n);
    return { kind: "answer", say, rows, chips: list(r.chips, 6), warn: list(r.warn, 3) };
  }
  return null;
}

/** The user turn: the desk, today's picks, the time, then what they said. Volatile, so it goes last. */
export function userTurn(desk: DeskPosition[], today: TodayPick[], now: string, text: string): string {
  return `Desk: ${JSON.stringify(desk)}\nToday: ${JSON.stringify(today)}\nNow (Colombo): ${now}\n\nThe TA says: ${text}`;
}

/** The last few turns, trimmed, so a long chat cannot grow the bill. */
export function trimHistory(history: Turn[]): Turn[] {
  return history
    .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.text === "string" && t.text.trim())
    .slice(-6)
    .map((t) => ({ role: t.role, text: t.text.slice(0, 1500) }));
}

/** One card in Today's "things" list (ui/desk:things). */
export type Thing = {
  kind: "ready" | "strategy" | "jd";
  id: string;
  jobId: string;
  applicationId?: string;
  title: string;
  sub: string;
  at: number;
};

/** "SAP Lead · expects LKR 850k · notice 1 month" - only what is on record. */
export function readyLine(opening: string, expected: number | null, noticeDays: number | null): string {
  const parts = [opening];
  if (expected) parts.push(`expects LKR ${expected >= 1000 ? `${Math.round(expected / 1000)}k` : expected}`);
  if (noticeDays !== null) parts.push(noticeDays === 0 ? "can start now" : noticeDays % 30 === 0 ? `notice ${noticeDays / 30} month${noticeDays === 30 ? "" : "s"}` : `notice ${noticeDays} days`);
  return parts.join(" · ");
}
