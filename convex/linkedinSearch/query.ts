/**
 * query.ts — standard form → Crustdata Agent Search query (template 4.4) and → normal-search body.
 *
 * Same form → same text → same idempotency key. Qualifications are never sent (section 4.3).
 */
import type { Level, StandardForm } from "./types";
import { formKey } from "./form";
import { LEVEL_NAME, levelIndex, LEVELS } from "./vocab";

function lvName(l: Level): string {
  return LEVEL_NAME[l].replace(" (CEO, CFO, COO…)", "");
}

function yearsPhrase(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return `${min} to ${max} years`;
  if (min != null) return `at least ${min} years`;
  if (max != null) return `at most ${max} years`;
  return null;
}

/** Where the person lives — always the person, never the company's office. */
export function locationPhrase(f: StandardForm): string | null {
  const { country, city, studiedIn } = f.location;
  if (!country && studiedIn) {
    return `either lives in ${studiedIn}, or lives in another country and studied at a school or university in ${studiedIn}`;
  }
  if (!country) return null;
  if (studiedIn && studiedIn !== country) {
    return `currently lives in ${country} and studied at a school or university in ${studiedIn}`;
  }
  return city ? `currently lives in ${country} (preferably in or near ${city})` : `currently lives in ${country}`;
}

export type AgentQuery = { query: string; idempotencyKey: string; formKey: string };

/** Template 4.4, with fixed result columns. `count` overrides the form's count (e.g. the gap after saved people). */
export type QueryStyle = "full" | "joined" | "auto";

/** Auto: joined rules only when quality held in the paid test (no area years, no must-haves). */
export function pickStyle(f: StandardForm, style: QueryStyle): "full" | "joined" {
  if (style !== "auto") return style;
  return !f.areaYears && f.mustHaves.length === 0 ? "joined" : "full";
}

/**
 * Template 4.4. `style`:
 *  - "full": one rule per item (location; level; function; years; area; industry; exclusions; must-haves).
 *  - "joined": overlapping items joined so Crustdata checks fewer rules per person (cost test, 26 Nov):
 *    function + level; total + area years; industry + look-alikes + exclusions.
 */
export function agentQuery(f: StandardForm, count?: number, style: QueryStyle = "full"): AgentQuery {
  const n = count ?? f.count;
  if (pickStyle(f, style) === "joined") return joinedQuery(f, n);
  const hard: string[] = [];
  const loc = locationPhrase(f);
  if (loc) hard.push(`the person ${loc} (the person's own location, not the employer's head office)`);
  if (f.levelLow && f.levelHigh) {
    const lo = levelIndex(f.levelLow);
    const hi = levelIndex(f.levelHigh);
    const above = LEVELS[hi + 1];
    const below = lo > 0 ? LEVELS[lo - 1] : null;
    const range = lo === hi ? lvName(f.levelLow) : `${lvName(f.levelLow)} to ${lvName(f.levelHigh)}`;
    const ex = [above ? `${lvName(above)} or more senior` : null, below ? `${lvName(below)} or more junior` : null].filter(Boolean);
    hard.push(`current level ${range}${ex.length ? ` (exclude ${ex.join(" and ")})` : ""}`);
  }
  if (f.currentCompanies.length) hard.push(`currently works at ${f.currentCompanies.join(", ")}`);
  if (f.titles.length || f.role) {
    const titles = (f.titles.length ? f.titles : [f.role]).slice(0, 8);
    hard.push(`works in this function, with a current title like: ${titles.join("; ")}`);
  }
  const yrs = f.totalYears ? yearsPhrase(f.totalYears.min, f.totalYears.max) : null;
  if (yrs) hard.push(`${yrs} of total work experience`);
  if (f.areaYears) {
    const ay = yearsPhrase(f.areaYears.min, f.areaYears.max);
    if (ay) hard.push(`${ay} of experience in ${f.areaYears.area}`);
  }
  if (f.industry) {
    const size = f.companySize ? ` (${f.companySize})` : "";
    hard.push(`currently or recently works at ${f.industry}${size}${f.notIndustries.length ? `, not ${f.notIndustries.join(", not ")}` : ""}`);
  } else if (f.companySize) {
    hard.push(`works at ${f.companySize}`);
  }
  if (f.excludeCompanies.length) hard.push(`not currently at ${f.excludeCompanies.join(", ")} or any of their group companies`);
  for (const m of f.mustHaves) hard.push(m.charAt(0).toLowerCase() + m.slice(1));
  for (const r of f.extraRules) hard.push(r.charAt(0).toLowerCase() + r.slice(1));

  const lines = [
    `Find ${n} people. Hard requirements: ${hard.map((h, i) => `(${i + 1}) ${h}`).join("; ")}.`,
  ];
  if (f.niceToHaves.length) lines.push(`Preferred: ${f.niceToHaves.join("; ")}.`);
  lines.push(
    `Show exactly these columns for every person: current job title (not the headline), current company, ` +
      `location (city and country), total years of experience${f.areaYears ? `, years of experience in ${f.areaYears.area}` : ""}.`,
  );
  const key = formKey(f);
  // The key covers the count too, so "find 30" and "find the 12 still missing" never share a key.
  return { query: lines.join("\n"), idempotencyKey: n === f.count ? key : `${key}-n${n}`, formKey: key };
}

function levelWords(f: StandardForm): { range: string; ex: string } | null {
  if (!f.levelLow || !f.levelHigh) return null;
  const lo = levelIndex(f.levelLow);
  const hi = levelIndex(f.levelHigh);
  const above = LEVELS[hi + 1];
  const below = lo > 0 ? LEVELS[lo - 1] : null;
  const range = lo === hi ? lvName(f.levelLow) : `${lvName(f.levelLow)} to ${lvName(f.levelHigh)}`;
  const ex = [above ? `not ${lvName(above)} or more senior` : null, below ? `not ${lvName(below)} or more junior` : null].filter(Boolean).join(", ");
  return { range, ex };
}

function joinedQuery(f: StandardForm, n: number): AgentQuery {
  const hard: string[] = [];
  const loc = locationPhrase(f);
  if (loc) hard.push(`the person ${loc} (the person's own location, not the employer's head office)`);
  const titles = (f.titles.length ? f.titles : [f.role]).filter(Boolean).slice(0, 8);
  const lv = levelWords(f);
  if (titles.length || lv) {
    hard.push(
      `currently works ${titles.length ? `with a title like ${titles.join("; ")}` : "in this function"}` +
        (lv ? `, at ${lv.range} level${lv.ex ? ` (${lv.ex})` : ""}` : "") +
        (f.currentCompanies.length ? `, at ${f.currentCompanies.join(", ")}` : ""),
    );
  } else if (f.currentCompanies.length) hard.push(`currently works at ${f.currentCompanies.join(", ")}`);
  const yrs = f.totalYears ? yearsPhrase(f.totalYears.min, f.totalYears.max) : null;
  const ay = f.areaYears ? yearsPhrase(f.areaYears.min, f.areaYears.max) : null;
  if (yrs || ay) hard.push([yrs ? `${yrs} of total work experience` : null, ay ? `${ay} of experience in ${f.areaYears!.area}` : null].filter(Boolean).join(", including "));
  const where: string[] = [];
  if (f.industry) where.push(`currently or recently works at ${f.industry}${f.companySize ? ` (${f.companySize})` : ""}${f.notIndustries.length ? `, not ${f.notIndustries.join(", not ")}` : ""}`);
  else if (f.companySize) where.push(`works at ${f.companySize}`);
  if (f.excludeCompanies.length) where.push(`not currently at ${f.excludeCompanies.join(", ")} or any of their group companies`);
  if (where.length) hard.push(where.join("; and "));
  for (const m of f.mustHaves) hard.push(m.charAt(0).toLowerCase() + m.slice(1));
  for (const r of f.extraRules) hard.push(r.charAt(0).toLowerCase() + r.slice(1));
  const lines = [`Find ${n} people. Hard requirements: ${hard.map((h, i) => `(${i + 1}) ${h}`).join("; ")}.`];
  if (f.niceToHaves.length) lines.push(`Preferred: ${f.niceToHaves.join("; ")}.`);
  lines.push(
    `Show exactly these columns for every person: current job title (not the headline), current company, ` +
      `location (city and country), total years of experience${f.areaYears ? `, years of experience in ${f.areaYears.area}` : ""}.`,
  );
  const key = formKey(f);
  const base = n === f.count ? key : `${key}-n${n}`;
  return { query: lines.join("\n"), idempotencyKey: `${base}-j`, formKey: key };
}

/** Short sentence for the normal (semantic) search: titles + industry + area. */
export function normalSearchSentence(f: StandardForm): string {
  const parts = [(f.titles.length ? f.titles.slice(0, 4) : [f.role]).filter(Boolean).join(" or ")];
  if (f.industry) parts.push(`at ${f.industry}`);
  if (f.areaYears) parts.push(`with experience in ${f.areaYears.area}`);
  if (f.mustHaves[0]) parts.push(f.mustHaves[0].toLowerCase());
  if (f.location.studiedIn && f.location.studiedIn !== f.location.country) parts.push(`studied in ${f.location.studiedIn}`);
  return parts.filter(Boolean).join(", ");
}

export const BASIC_FIELDS = [
  "crustdata_person_id",
  "basic_profile.name",
  "basic_profile.headline",
  "basic_profile.current_title",
  "basic_profile.location",
  "social_handles.professional_network_identifier.profile_url",
  "fit",
];

/** Basic fields + the current employer. The employer is in the "experience" group, which may cost more per person
 *  (measured in the live test); used only when a company is blank after the main search. */
export const COMPANY_FIELDS = [...BASIC_FIELDS, "experience.employment_details.current"];

type Condition = { field: string; type: string; value: unknown };

/** Normal search body: country filter, leave-out list, the same sentence, basic fields only. */
export function normalSearchBody(
  f: StandardForm,
  opts: { limit: number; leaveOut?: (string | number)[]; fields?: string[]; cursor?: string },
): Record<string, unknown> {
  const conditions: Condition[] = [];
  if (f.location.country) conditions.push({ field: "basic_profile.location.country", type: "=", value: f.location.country });
  if (f.currentCompanies.length) conditions.push({ field: "experience.employment_details.current.company_name", type: "in", value: f.currentCompanies });
  if (f.excludeCompanies.length) conditions.push({ field: "experience.employment_details.current.company_name", type: "not_in", value: f.excludeCompanies });
  const ids = (opts.leaveOut ?? []).map((x) => (typeof x === "string" && /^\d+$/.test(x) ? Number(x) : x));
  if (ids.length) conditions.push({ field: "crustdata_person_id", type: "not_in", value: ids });
  const body: Record<string, unknown> = {
    filters: conditions.length === 1 ? conditions[0] : { op: "and", conditions },
    search: { query: normalSearchSentence(f), mode: "hybrid" },
    mode: "exact",
    fields: opts.fields ?? BASIC_FIELDS,
    limit: opts.limit,
  };
  if (opts.cursor) body.cursor = opts.cursor;
  return body;
}

/** Re-fetch people by Crustdata id (gap filling). */
export function refetchBody(ids: (string | number)[], fields: string[] = BASIC_FIELDS): Record<string, unknown> {
  return {
    filters: { field: "crustdata_person_id", type: "in", value: ids.map((x) => (typeof x === "string" && /^\d+$/.test(x) ? Number(x) : x)) },
    fields,
    limit: Math.max(1, ids.length),
  };
}

/** Find one person by name + company, or by LinkedIn link. */
export function findOneBody(p: { name?: string; company?: string; url?: string }, fields: string[] = BASIC_FIELDS): Record<string, unknown> {
  if (p.url) {
    return { filters: { field: "social_handles.professional_network_identifier.profile_url", type: "=", value: p.url }, fields, limit: 1 };
  }
  const conditions: Condition[] = [];
  if (p.name) conditions.push({ field: "basic_profile.name", type: "(.)", value: p.name });
  if (p.company) conditions.push({ field: "experience.employment_details.current.company_name", type: "(.)", value: p.company });
  return { filters: conditions.length === 1 ? conditions[0] : { op: "and", conditions }, fields, limit: 3 };
}
