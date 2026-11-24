/**
 * The TA judge on a reverse match (25 Nov 2026).
 *
 * The engine's score blends a skills heuristic with vector similarity and is
 * multiplied up for an exact role family, so on a real opening most people sat
 * at 93-100 and the order meant nothing: a "Senior Engineer – Product
 * Development" headed the Garment Technologist list above actual Garment
 * Technologists, and a 29-year Cutting Manager was still on it. TAs said the
 * database matches "do not match" many times.
 *
 * So the engine's best 40 (after its own gates) go to the text model as one
 * anonymous line each — current title, employer, years, place, top skills,
 * never a name, phone, email or CV text — and it answers `n|score|reason` the
 * way a TA would judge them for this job. Its score orders the list and its
 * reason leads the row. When the model does not answer, the engine's list
 * stands as it was. Pure parts here; the call is in matching/agent2.
 */

export interface JudgeJob {
  title: string;
  seniority?: string | null;
  minYears?: number | null;
  maxYears?: number | null;
  location?: string | null;
  industry?: string | null;
  mustHaves?: string[];
  summary?: string | null;
}

export interface JudgeRow {
  title: string;
  company: string;
  years: number | null;
  location: string;
  skills: string[];
}

export interface Verdict {
  score: number;
  reason: string;
}

/** How many of the engine's best are judged. */
export const JUDGE_POOL = 40;
/** Under this the judge says a TA would not put them forward; they leave the list. */
export const JUDGE_FLOOR = 50;

const clean = (s: unknown, max: number) => String(s ?? "").replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function judgeLine(n: number, r: JudgeRow): string {
  const years = typeof r.years === "number" && Number.isFinite(r.years) ? `${Math.round(r.years * 10) / 10} yrs` : "years not stated";
  const skills = r.skills.map((s) => clean(s, 40)).filter(Boolean).slice(0, 6).join(", ");
  return `${n}. ${clean(r.title, 80) || "title not stated"} at ${clean(r.company, 60) || "employer not stated"} · ${years} · ${clean(r.location, 50) || "place not stated"}${skills ? ` · ${skills}` : ""}`;
}

export function judgePrompt(job: JudgeJob, lines: string[]): { system: string; user: string } {
  const yrs =
    job.minYears && job.maxYears ? `${job.minYears}-${job.maxYears} years` : job.minYears ? `${job.minYears}+ years` : job.maxYears ? `up to ${job.maxYears} years` : "not stated";
  return {
    system:
      "You are a senior talent acquisition consultant at Career141 in Sri Lanka. You judge, from a one-line summary of each person's current work, whether a TA would put them forward for this job. Be strict like a good TA: the same work at the same level comes first; a different discipline, a much more senior or much more junior level, or the wrong industry where the job names one scores low.",
    user: `JOB: ${clean(job.title, 120)}
Level: ${clean(job.seniority, 40) || "not stated"} · Experience: ${yrs} · Location: ${clean(job.location, 80) || "Sri Lanka"} · Industry: ${clean(job.industry, 80) || "not stated"}
${job.mustHaves?.length ? `Must-haves: ${job.mustHaves.map((m) => clean(m, 60)).slice(0, 8).join("; ")}\n` : ""}${job.summary ? `About the job: ${clean(job.summary, 900)}\n` : ""}
PEOPLE:
${lines.join("\n")}

For every person, one line, nothing else:
n|score|reason
score 0-100: 85+ = does this exact job at the right level now; 70-84 = close (similar title, one level off, or adjacent industry); 50-69 = possible but a stretch; under 50 = a TA would not put them forward.
reason: under 15 words, what fits and what is missing.`,
  };
}

/** `n|score|reason` lines, read leniently; only numbers that were asked about. */
export function readJudge(text: string, count: number): Map<number, Verdict> {
  const out = new Map<number, Verdict>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]?\s*\[?(\d{1,3})\]?\s*[|.):-]?\s*(\d{1,3})\s*[|:-]\s*(.*)$/);
    if (!m) continue;
    const n = Number(m[1]);
    const score = Number(m[2]);
    if (n < 1 || n > count || score > 100 || out.has(n)) continue;
    out.set(n, { score, reason: m[3].replace(/^\W+/, "").trim().slice(0, 160) });
  }
  return out;
}

/** One person once: the same name with the same current title is one row (duplicate CV records). */
export function dedupeByPerson<T extends { candidateName?: string; candidateRole?: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const norm = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return rows.filter((r) => {
    const name = norm(r.candidateName);
    if (!name) return true;
    const key = `${name}|${norm(r.candidateRole)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The judged list: judged rows by the judge's score (those under the floor
 * left out), then the rest in the engine's order. If the judge would leave
 * nobody, the engine's list stands.
 */
export function applyJudge<T extends { overallScore: number; reason?: string }>(rows: T[], verdicts: Map<number, Verdict>): T[] {
  if (verdicts.size === 0) return rows;
  const judged: T[] = [];
  const rest: T[] = [];
  rows.forEach((r, i) => {
    const v = verdicts.get(i + 1);
    if (!v) {
      if (i >= JUDGE_POOL) rest.push(r);
      return;
    }
    if (v.score < JUDGE_FLOOR) return;
    judged.push({ ...r, overallScore: v.score, reason: `${v.reason}${r.reason ? ` — ${r.reason}` : ""}` });
  });
  if (judged.length === 0) return rows;
  judged.sort((a, b) => b.overallScore - a.overallScore);
  return [...judged, ...rest];
}
