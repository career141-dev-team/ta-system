/**
 * Contact discovery: the rule one request is read into, and who it keeps (9 Nov).
 *
 * The Brevo clone asks "Find all Junior Developers". One model call turns the
 * sentence into a ContactRule (the titles that mean the job, the words that
 * rule a title out, the levels, any must-have skills); a person confirms it;
 * then every candidate is checked against it with no model at all, the same
 * way the Extras sales list is built (convex/lib/salesRole.ts). Free over
 * 78,000 people, the same answer every run, and every row says why it was kept.
 *
 * Pure, with no database or network, so the backend and the tests share it.
 */
import { LEVEL_LABEL, levelFromTitle } from "./roleLevel";

export type ContactRule = {
  /** What the list is called, e.g. "Junior developers". */
  label: string;
  /** Title phrases that mean the job. A title matches when it contains one as whole words. */
  titles: string[];
  /** Words that rule a title out even when a phrase matched ("business developer"). */
  exclude: string[];
  /** Allowed rungs of convex/lib/roleLevel.ts (0 Intern … 9 Director). Empty = every level. */
  levels: number[];
  /** Every one must appear in the person's skills or summary. Empty = no skill rule. */
  skills: string[];
  /** Also keep people whose earlier title matched (labelled "previous role"). */
  includePastRoles: boolean;
};

export type ContactMatchKind = "current" | "previous";

export type ContactMatch = {
  kind: ContactMatchKind;
  title: string;
  level: number | null;
  levelLabel: string;
  matchedBy: string;
};

export type ContactCandidate = {
  currentJobTitle?: string | null;
  currentTitle?: string | null;
  currentRoleRank?: number | null;
  totalExperienceYears?: number | null;
  jobHistory?: { title?: string | null; startDate?: string | null }[] | null;
  pastJobTitles?: string[] | null;
  skills?: string[] | null;
  summary?: string | null;
};

const MAX_TITLES = 40;
const MAX_WORDS = 20;

/** Lower case, letters and digits only, padded so " phrase " is a whole-word test. */
export const norm = (s: string | null | undefined) =>
  ` ${String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

const cleanList = (raw: unknown, max: number) =>
  [...new Set((Array.isArray(raw) ? raw : [])
    .filter((x): x is string => typeof x === "string")
    .map((x) => norm(x).trim())
    .filter((x) => x.length >= 2 && x.length <= 60))].slice(0, max);

/** A rule as it comes from the model or from Brevo's edit: checked, trimmed, never trusted. */
export function sanitizeRule(raw: unknown): ContactRule | { error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const titles = cleanList(r.titles, MAX_TITLES);
  if (titles.length === 0) return { error: "The rule needs at least one job title to look for." };
  const levels = [...new Set((Array.isArray(r.levels) ? r.levels : [])
    .map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < LEVEL_LABEL.length))].sort((a, b) => a - b);
  const label = typeof r.label === "string" && r.label.trim() ? r.label.trim().slice(0, 80) : titles[0];
  return {
    label,
    titles,
    exclude: cleanList(r.exclude, MAX_WORDS),
    levels,
    skills: cleanList(r.skills, 10),
    includePastRoles: r.includePastRoles !== false,
  };
}

const LEVEL_WORDS: [RegExp, number[]][] = [
  [/\b(intern|interns|internship|trainee|trainees)\b/, [0]],
  [/\b(junior|juniors|jr|entry level|graduate|graduates|fresher|freshers)\b/, [0, 1]],
  [/\b(mid level|mid-level|intermediate)\b/, [2]],
  [/\b(senior|seniors|sr)\b/, [3, 4]],
];
const FILLER = /\b(find|get|give|show|list|search|me|all|every|the|of|for|our|any|candidates?|profiles?|people|persons?|contacts?|emails?|with|who|are|in|a|an)\b/g;
// Only the last word is made singular: "Sales Managers" is "sales manager", never "sale manager".
const singular = (w: string) => /(ss|is|us)$/.test(w) ? w : w.replace(/ies$/, "y").replace(/s$/, "");

/**
 * The rule without a model: the words that are left once the request words go,
 * and the level its seniority word names. Used when no model key is set or the
 * model answers nonsense, so a request is never refused for want of a key.
 */
export function ruleFromWords(query: string): ContactRule | { error: string } {
  const q = norm(query).trim();
  let levels: number[] = [];
  let rest = q;
  for (const [re, lv] of LEVEL_WORDS) if (re.test(rest)) { levels = lv; rest = rest.replace(re, " "); }
  rest = rest.replace(FILLER, " ").replace(/\s+/g, " ").trim();
  const words = rest.split(" ").filter(Boolean);
  const phrase = words.map((w, i) => (i === words.length - 1 ? singular(w) : w)).join(" ");
  const label = query.trim().replace(/^(please\s+)?(find|get|give me|show me|show|list|search for|search)\s+((all|every|the)\s+)?/i, "").trim();
  return sanitizeRule({ label: (label || query.trim()).slice(0, 80), titles: phrase ? [phrase] : [], levels });
}

/** What the model is asked. Its answer still goes through sanitizeRule. */
export const RULE_PROMPT = `You turn a recruiter's request for a contact list into a search rule over CV job titles.
Answer with JSON only: {"label": string, "titles": string[], "exclude": string[], "levels": number[], "skills": string[], "includePastRoles": boolean}.
- titles: up to 40 short job-title phrases, lower case, that mean the requested job, including common alternative and related titles a CV might use (for "Customer Experience Manager": "customer experience manager", "cx manager", "customer success manager", "client experience manager", "customer service manager"). For a broad family ("financial professionals") list the main titles of the whole family. Do not add the seniority word to every title; levels handles seniority.
- exclude: words that, inside a title, mean it is NOT this job (for "developer": "business developer", "property developer").
- levels: the seniority rungs asked for, from 0 Intern, 1 Junior/Associate, 2 Mid-level, 3 Senior, 4 Lead/Assistant Manager, 5 Manager, 6 Senior Manager/Head, 7 AGM/DGM, 8 GM/VP, 9 Director/C-suite. Only when the request names a seniority ("junior" -> [0,1], "senior" -> [3,4]). Otherwise [].
- skills: only skills the request explicitly requires. Usually [].
- includePastRoles: true unless the request says "current" or "currently".
Never invent requirements the request does not state.`;

/** The titles to read, newest first: current, then dated history, then older ones. */
function titlesOf(c: ContactCandidate): { current: string; past: string[] } {
  const current = (c.currentJobTitle ?? c.currentTitle ?? "").trim();
  const key = (d?: string | null) => {
    const m = /(\d{4})(?:[-/](\d{1,2}))?/.exec(d ?? "");
    return m ? Number(m[1]) * 100 + Number(m[2] ?? 0) : 0;
  };
  const history = [...(c.jobHistory ?? [])]
    .filter((j) => (j.title ?? "").trim())
    .sort((a, b) => key(b.startDate) - key(a.startDate))
    .map((j) => j.title!.trim());
  const seen = new Set([norm(current)]);
  const past = [...history, ...(c.pastJobTitles ?? []).map((t) => t.trim())]
    .filter((t) => t && !seen.has(norm(t)) && (seen.add(norm(t)), true));
  return { current, past };
}

const phraseIn = (title: string, rule: ContactRule): string | null => {
  const t = norm(title);
  if (rule.exclude.some((w) => t.includes(` ${w} `))) return null;
  return rule.titles.find((p) => t.includes(` ${p} `)) ?? null;
};

/**
 * Does this person fit the rule, and why. The current title decides when it
 * matches the job: a Senior Developer is not on a junior list because they
 * were junior once. Only when the current title is some other job does an
 * earlier title count, and then the row says "previous role".
 */
export function matchCandidate(c: ContactCandidate, rule: ContactRule): ContactMatch | null {
  if (rule.skills.length) {
    const hay = norm([...(c.skills ?? []), c.summary ?? ""].join(" "));
    if (!rule.skills.every((s) => hay.includes(` ${s} `))) return null;
  }
  const levelOk = (lv: number | null) => rule.levels.length === 0 || (lv != null && rule.levels.includes(lv));
  const { current, past } = titlesOf(c);
  const hit = current ? phraseIn(current, rule) : null;
  if (hit) {
    const level = c.currentRoleRank ?? levelFromTitle(current, c.totalExperienceYears);
    return levelOk(level) ? { kind: "current", title: current, level, levelLabel: LEVEL_LABEL[level ?? -1] ?? "", matchedBy: hit } : null;
  }
  if (!rule.includePastRoles) return null;
  for (const title of past) {
    const p = phraseIn(title, rule);
    if (!p) continue;
    const level = levelFromTitle(title);
    if (levelOk(level)) return { kind: "previous", title, level, levelLabel: LEVEL_LABEL[level ?? -1] ?? "", matchedBy: p };
  }
  return null;
}

/** A plausible address, so a CV's "N/A" never becomes a contact. */
export const usableEmail = (e: string | null | undefined): string | null => {
  const v = (e ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(v) ? v : null;
};
