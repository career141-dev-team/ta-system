/**
 * A short way to write a search spec, for the test sets:
 *
 *   role=accountant|auditor   ~level=2   level=4..8   place=lk-d-colombo   !place=lk-d-kandy
 *   years>=5   years<=6   years=2..3   age=25..35   age<=35   gender=female   nat=LK   worked=g-gcc
 *   qual=cima:finalist   ctype=big4   ctype@now=bank   company=Dialog Axiata PLC   skill=SAP
 *   cv<=24   salary<=150000:LKR   notice<=30   lang=Arabic   visa=visit_visa   licence=gcc_light
 *   role@ever=accountant
 *
 * "~" marks a preference, "!" an exclusion; chips are separated by ";".
 * The same strings are the expected readings in the phrasing suite and the
 * truth specs that decide who is relevant to a test search.
 */
import type { Chip, Field } from "../../convex/lib/search/types";

const FIELD: Record<string, Field> = { role: "role", level: "level", place: "place", years: "years", age: "age", gender: "gender", nat: "nationality", worked: "workedIn", qual: "qualification", ctype: "companyType", company: "company", skill: "skill", kw: "keyword", cv: "cvDate", salary: "salary", notice: "notice", lang: "language", visa: "visa", licence: "licence" };

export function parseDsl(s: string): Chip[] {
  return s.split(";").map((x) => x.trim()).filter(Boolean).map((part) => {
    let p = part;
    const pref = p.startsWith("~"); if (pref) p = p.slice(1);
    const not = p.startsWith("!"); if (not) p = p.slice(1);
    const m = p.match(/^([a-z]+)(?:@([a-z]+))?\s*(>=|<=|=)\s*(.+)$/);
    if (!m) throw new Error(`bad dsl: ${part}`);
    const [, key, qual, op, rhs] = m;
    const field = FIELD[key];
    if (!field) throw new Error(`bad field: ${key}`);
    const c: Chip = { field, must: !pref, ...(not ? { not: true } : {}) };
    if (qual) c.qualifier = qual;
    const ranged = ["level", "years", "age", "cvDate", "salary", "notice"].includes(field);
    if (ranged) {
      const [val, cur] = rhs.split(":");
      if (op === ">=") c.min = Number(val);
      else if (op === "<=") c.max = Number(val);
      else if (val.includes("..")) { const [a, b] = val.split(".."); c.min = Number(a); c.max = Number(b); }
      else { c.min = Number(val); c.max = Number(val); }
      if (cur) c.currency = cur;
    } else {
      const [vals, q2] = rhs.split(":");
      c.values = vals.split("|").map((v) => v.trim());
      if (q2) c.qualifier = q2;
    }
    return c;
  });
}


