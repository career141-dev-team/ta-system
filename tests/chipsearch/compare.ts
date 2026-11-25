/**
 * Compare a reading (chips) with the expected chips of a phrasing.
 * Also turns today's reading (the parser's criteria plus what the engine's
 * model read) into chips, so both are scored the same way.
 */
import type { Chip } from "../../convex/lib/search/types";
import { widenLk } from "../../convex/lib/search/lists/places";

export interface Verdict { correct: boolean; reversed: boolean; missing: string[]; wrong: string[]; extra: string[] }

const key = (c: Chip) => `${c.not ? "!" : ""}${c.field}`;
const vset = (c: Chip) => [...new Set((c.values ?? []).map((v) => (c.field === "place" || c.field === "workedIn" ? widenLk(v) : v.toLowerCase())))].sort().join("|");
const show = (c: Chip) => `${c.must ? "" : "~"}${c.not ? "!" : ""}${c.field}${c.qualifier ? `@${c.qualifier}` : ""}=${c.values?.join("|") ?? `${c.min ?? ""}..${c.max ?? ""}`}`;
/** Fields today's search does not filter on (role, level) are scored only for the new reader. */
export const FILTER_FIELDS = new Set(["place", "workedIn", "nationality", "years", "age", "gender", "qualification", "companyType", "company", "cvDate", "salary", "notice", "language", "visa", "licence"]);

export function compare(expected: Chip[], actual: Chip[], opts: { fields?: Set<string> } = {}): Verdict {
  const inScope = (c: Chip) => !opts.fields || opts.fields.has(c.field);
  const exp = expected.filter(inScope), act = actual.filter(inScope);
  const v: Verdict = { correct: true, reversed: false, missing: [], wrong: [], extra: [] };
  const used = new Set<Chip>();
  for (const e of exp) {
    const same = act.filter((a) => !used.has(a) && key(a) === key(e));
    const ranged = e.values == null;
    // Age edges are a convention ("under 30" is 29 or 30; "30 years old" is 30 or 28–32): within two years counts, for both searches.
    const edge = (x: number | null | undefined, y: number | null | undefined) => (x == null) === (y == null) && (x == null || (e.field === "age" ? Math.abs(x - y!) <= 2 : x === y));
    const match = same.find((a) => (ranged ? edge(a.min, e.min) && edge(a.max, e.max) : vset(a) === vset(e)));
    if (match) {
      used.add(match);
      const qualOk = !e.qualifier || e.qualifier === match.qualifier || (e.field === "qualification" && e.qualifier === "holds" && !match.qualifier);
      if (match.must !== e.must || !qualOk || (e.field === "role" && (e.qualifier ?? "now") !== (match.qualifier ?? "now"))) v.wrong.push(`${show(e)} read as ${show(match)}`);
      continue;
    }
    const near = same[0];
    if (near) { used.add(near); v.wrong.push(`${show(e)} read as ${show(near)}`); }
    else v.missing.push(show(e));
    // Reversed: the opposite of what was asked.
    const opposite = act.find((a) => a.field === e.field && !!a.not !== !!e.not && (e.values ? vset(a) === vset(e) : true));
    const otherGender = e.field === "gender" && act.some((a) => a.field === "gender" && !a.not && a.values?.[0] !== e.values?.[0] && !e.not);
    const flippedRange = ranged && near && ((e.max != null && e.min == null && near.min != null && near.max == null) || (e.min != null && e.max == null && near.max != null && near.min == null));
    if (opposite || otherGender || flippedRange) v.reversed = true;
  }
  for (const a of act) {
    if (used.has(a) || !a.must) continue;
    if (a.field === "level" || a.field === "skill" && !a.must) continue;
    v.extra.push(show(a));
  }
  v.correct = !v.missing.length && !v.wrong.length && !v.extra.length && !v.reversed;
  return v;
}

/**
 * Today's reading as chips: the filters today's search really applies — the
 * parser's chips (only the FIRST place, Q4), else the engine model's place and
 * years, the model's companies and exclusions, and the desk chips the results
 * page applies (gender, age, nationality, language, notice, salary).
 */
