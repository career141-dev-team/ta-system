// T3 · Today, the day plan (owner's design, 14 Nov 2026): the TA says how the day
// looks ("I have an interview at 2:30 - keep the afternoon light") and AURA lays the
// day out from today's positions: the 100% hunt first, follow-up chases, anything
// ready for the Director, the interview at the time given, and the EOD check before
// it is due at 6 (AURA drafts it at 5).
// ponytail: word rules over sample work; with the backend this is one model call
// over the person's real queue (suggestions, replies waiting, CVs ready, interviews).

export type WorkType = "100%" | "Follow-up" | "Add-on";
/** `todo`: Rashmi's strategies on it due today (17 Nov 2026), worked first on that position. */
export type DayPosition = { id: string; title: string; client: string; type: WorkType; todo?: string[] };
export type Step = { at: string; minutes: number; what: string; tone: "brand" | "warn" | "info" | "none"; where?: string; href?: string };
export type Plan = { headline: string; steps: Step[]; first?: string };

/** The short name the design uses for a position ("SAP", "Finance"). */
export const short = (p: DayPosition) => (p.title.match(/\bSAP\b/) ? "SAP" : p.title.split(" ")[0]);

const clock = (m: number) => `${Math.floor(m / 60) > 12 ? Math.floor(m / 60) - 12 : Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

/** "2:30", "2.30pm", "14:30", "at 3" -> minutes after midnight; afternoon unless
 *  it says am or is 8 to 11. The last time in the text wins ("interview at 2:30 ...
 *  move it to 3:00" means 3:00). A bare number counts only after "at" or "to". */
export function timeIn(text: string): number | null {
  const all = [...text.matchAll(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/gi)].filter(
    (x) => x[2] || x[3] || /\b(?:at|to)\s+$/i.test(text.slice(0, x.index)),
  );
  const m = all.at(-1);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  const am = m[3]?.toLowerCase() === "am";
  if (!am && h < 8) h += 12;
  if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
  return h * 60 + min;
}

/** Is this message about the shape of the day (so AURA plans), or something else? */
export const aboutTheDay = (text: string) => /\b(plan|day|light|busy|interview|meeting|call|leave|lunch|morning|afternoon|start|first|today)\b/i.test(text);

export function planDay(positions: DayPosition[], said: string): Plan {
  const light = /\b(light|free|easy|keep .*afternoon|leave early)\b/i.test(said);
  const interviewAt = /\binterview|meeting|call\b/i.test(said) ? timeIn(said) : null;
  const hunt = positions.filter((p) => p.type === "100%");
  const follow = positions.filter((p) => p.type !== "100%");
  const lead = hunt[0] ?? positions[0];

  // The work, in the order it should be done.
  const work: Omit<Step, "at" | "minutes">[] = [];
  const strategies = (p: DayPosition, tone: Step["tone"]) =>
    (p.todo ?? []).forEach((name) => work.push({ what: `${name} — Rashmi’s strategy`, tone, where: short(p), href: "/openings/demo" }));
  for (const p of hunt) {
    strategies(p, "brand");
    work.push({ what: "Review 6 headhunting suggestions", tone: "brand", where: short(p), href: "/openings/demo" });
    work.push({ what: "Chase 2 candidates for salary and notice", tone: "brand", where: short(p), href: "/openings/demo" });
  }
  for (const p of follow) {
    strategies(p, "warn");
    work.push({ what: p.type === "Add-on" ? "Source 3 add-on profiles" : "Send Nimali to Director Review", tone: "warn", where: short(p), href: "/openings/demo" });
  }

  // Slots: a light afternoon packs the work into the morning; otherwise it spreads.
  // A fuller day (strategies on top) gets 45-minute blocks.
  const morning = [9 * 60, 10 * 60 + 30, 12 * 60];
  const later = [13 * 60 + 30, 15 * 60, 16 * 60];
  const tight = [9 * 60, 9 * 60 + 45, 10 * 60 + 30, 11 * 60 + 15, 12 * 60, 13 * 60 + 30, 14 * 60 + 15, 15 * 60, 15 * 60 + 45, 16 * 60 + 30];
  const slots =
    work.length > 6 ? (light ? tight.slice(0, 6) : tight) : light ? [...morning, 11 * 60 + 15, 12 * 60 + 30] : [...morning, ...later];
  const steps: Step[] = work.slice(0, slots.length).map((w, i) => ({ ...w, minutes: slots[i], at: "" }));
  if (interviewAt !== null) steps.push({ minutes: interviewAt, at: "", what: "Interview — Dilini Perera", tone: "info", where: lead ? lead.client.split(" ")[0] : undefined, href: "/openings/demo" });
  steps.push({ minutes: 17 * 60, at: "", what: "Check AURA’s EOD drafts and send", tone: "none" });
  steps.sort((a, b) => a.minutes - b.minutes);
  for (const s of steps) s.at = clock(s.minutes);

  const lastHunt = Math.max(...steps.filter((s) => s.tone === "brand").map((s) => s.minutes), 0);
  const by = lastHunt && lastHunt <= 12 * 60 + 30 ? "by lunch" : lastHunt ? `by ${clock(lastHunt + 60)}` : "";
  const n = positions.reduce((a, p) => a + (p.todo?.length ?? 0), 0);
  const left = Math.max(0, work.length - slots.length);
  const extra = (n ? ` Rashmi’s ${n} strateg${n === 1 ? "y" : "ies"} for today ${n === 1 ? "is" : "are"} in it.` : "") + (left > 0 ? ` ${left} more for tomorrow.` : "");
  const headline =
    (hunt.length && by ? `Here’s your day. You’ll close today’s ${short(hunt[0])} set ${by}.` : positions.length ? "Here’s your day." : "Pick a position first, and I’ll plan the day around it.") +
    (positions.length ? extra : "");
  return { headline, steps: positions.length ? steps : [], first: lead ? short(lead) : undefined };
}
