// Reading a line typed to AURA on the plan page ("Put Dilini on Direct headhunt and
// Referral extraction tomorrow") into strategies, who and which day.
// ponytail: plain word matching over the strategy list and the TAs' first names; with
// the backend this is the planning model. Anything it cannot place, the page says so.

export type Said = {
  /** Each strategy named, with the TA named closest before it (or the first TA named). */
  picks: { name: string; ta?: string }[];
  /** Index into the week (0 = Mon), when a day was named. */
  day?: number;
  /** "switch off", "remove", "drop": take the named strategies off. */
  off: boolean;
  /** TAs named, even when no strategy was. */
  tas: string[];
};

const norm = (s: string) => ` ${s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim()} `;
const DAYS = [/\bmon(day)?\b/, /\btue(s|sday)?\b/, /\bwed(nesday)?\b/, /\bthu(rs|rsday)?\b/, /\bfri(day)?\b/];

/** `names` = the strategies on the list; `tas` = [id, first name]; `today` = index of today. */
export function readPlan(text: string, names: string[], tas: [string, string][], today: number): Said {
  // "AURA, put ..." is talking to AURA, not naming the Aura strategy.
  let t = norm(text.replace(/^\s*(hey\s+)?aura\s*[,:-]/i, ""));
  const found: { at: number; name?: string; ta?: string }[] = [];
  // Longest strategy names first, blanked once found so a shorter one cannot match inside.
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    const k = norm(n);
    const at = t.indexOf(k);
    if (at < 0) continue;
    found.push({ at, name: n });
    t = t.slice(0, at) + " ".repeat(k.length) + t.slice(at + k.length);
  }
  for (const [id, first] of tas) {
    const at = t.indexOf(norm(first));
    if (at >= 0) found.push({ at, ta: id });
  }
  found.sort((a, b) => a.at - b.at);
  const people = found.filter((f) => f.ta).map((f) => f.ta!);
  let last: string | undefined;
  const picks: Said["picks"] = [];
  for (const f of found) {
    if (f.ta) last = f.ta;
    else picks.push({ name: f.name!, ta: last ?? people[0] });
  }
  const day = /\btoday\b/.test(t) ? today : /\btomorrow\b/.test(t) ? today + 1 : DAYS.findIndex((d) => d.test(t));
  return { picks, day: day >= 0 && day <= 4 ? day : undefined, off: /\b(off|remove|drop|cancel)\b/.test(t), tas: people };
}
