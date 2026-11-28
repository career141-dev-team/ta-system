// Reads the read-only export (psql COPY text format) into candidate records
// and their latest job history. Names, emails, phones and links are removed
// in the export itself (export.sql).
import fs from "node:fs";

const unc = (s: string) => s.replace(/\\(.)/g, (_m, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c));

export function lines(file: string): any[] {
  const out: any[] = [];
  for (const l of fs.readFileSync(file, "utf8").split("\n")) {
    if (!l) continue;
    try { out.push(JSON.parse(unc(l))); } catch { /* skip a broken row */ }
  }
  return out;
}

export function histories(file: string): Map<string, { t: number; h: any[]; x?: string; k?: string }> {
  const m = new Map<string, { t: number; h: any[]; x?: string; k?: string }>();
  for (const r of lines(file)) {
    if (!r.c) continue;
    const h = Array.isArray(r.h) ? r.h : null;
    const x = typeof r.x === "string" && r.x.trim() ? r.x : undefined;
    const k = typeof r.k === "string" && r.k ? r.k : undefined;
    if (!h && !x && !k) continue;
    const t = Number(r.t) || 0;
    const had = m.get(r.c);
    // The newest row's job history and CV text key; the CV's own text from whichever row holds it.
    if (!had || t > had.t) m.set(r.c, { t, h: h ?? had?.h ?? [], x: x ?? had?.x, k: k ?? had?.k });
    else { if (x && !had.x) had.x = x; if (k && !had.k) had.k = k; }
  }
  return m;
}

const cut = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

/**
 * Emails, phone numbers and NIC-length numbers out of CV text (28 Nov 2026):
 * the text goes into the table the query agent searches, and that table holds
 * no contact details. Up to two separators between digits, so "+94 (77) 123-4567"
 * goes and "2015-06 - 2020-03" stays. Names in the CV's own text cannot be taken out.
 */
export const scrub = (s: string) => s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").replace(/\+?\d(?:[ .()-]{0,2}\d){8,14}[VvXx]?/g, "[number]");

// Room for the record and about two pages of the CV itself.
const SEARCH_TEXT_MAX = 8000;
/**
 * What the query agent can search and read for things no column holds (a
 * language, a tool, a school, "led a team of 20"): the record as CV-like text,
 * then the CV's own text where the database has it. Scrubbed and capped.
 */
export function searchText(c: any, jobs: any[] | undefined, raw?: string): string {
  return scrub(`${cvText(c, jobs)}${raw ? `\n${raw.replace(/\s+/g, " ").trim()}` : ""}`).slice(0, SEARCH_TEXT_MAX);
}

/** One candidate as short CV-like text for the profile builder. No contact details. */
export function cvText(c: any, jobs: any[] | undefined): string {
  const L: string[] = [];
  const now = c.currentJobTitle || c.currentTitle;
  if (now) L.push(`Current role: ${now}${c.currentEmployer ? ` at ${c.currentEmployer}` : ""}`);
  if (c.location) L.push(`Location: ${cut(c.location, 160)}`);
  if (c.nationality) L.push(`Nationality: ${c.nationality}`);
  if (c.summary) L.push(`Summary: ${cut(c.summary, 700)}`);
  const hist = (jobs ?? []).slice(0, 12);
  if (hist.length) {
    L.push("Experience (newest first):");
    for (const j of hist) {
      const when = [j.startDate ?? j.start ?? "", j.endDate ?? j.end ?? (j.isCurrent ? "Present" : "")].filter(Boolean).join(" to ");
      L.push(`- ${cut(j.title, 120)} | ${cut(j.company, 120)}${j.location ? ` | ${cut(j.location, 60)}` : ""}${when ? ` | ${when}` : ""}${j.description ? ` | ${cut(j.description, 220)}` : ""}`);
    }
  } else if (Array.isArray(c.pastJobTitles) && c.pastJobTitles.length) {
    L.push(`Past job titles: ${c.pastJobTitles.slice(0, 10).join("; ")}`);
    if (c.employersText) L.push(`Employers: ${cut(c.employersText, 300)}`);
  }
  if (Array.isArray(c.education) && c.education.length) {
    L.push("Education and qualifications:");
    for (const e of c.education.slice(0, 8)) L.push(`- ${[e.degree, e.field, e.institution, e.year].filter(Boolean).join(" | ")}`);
  }
  if (Array.isArray(c.certifications) && c.certifications.length) L.push(`Certifications: ${c.certifications.slice(0, 10).map((x: any) => (typeof x === "string" ? x : x?.name)).filter(Boolean).join("; ")}`);
  if (Array.isArray(c.skills) && c.skills.length) L.push(`Skills: ${c.skills.slice(0, 25).join(", ")}`);
  if (Array.isArray(c.languages) && c.languages.length) L.push(`Languages: ${c.languages.join(", ")}`);
  if (Array.isArray(c.industries) && c.industries.length) L.push(`Industries: ${c.industries.join(", ")}`);
  if (typeof c.totalExperienceYears === "number") L.push(`Total experience stated: ${c.totalExperienceYears} years`);
  if (c.noticePeriod) L.push(`Notice period: ${c.noticePeriod}`);
  if (c.currentSalary) L.push(`Current salary: ${c.currentSalary}`);
  if (c.expectedSalary) L.push(`Expected salary: ${c.expectedSalary}`);
  return L.join("\n");
}

export function cvDate(c: any, histT?: number): string {
  const t = Number(c.lastUpdatedAt || c.firstSeenAt || c._creationTime || histT || Date.now());
  return new Date(t).toISOString().slice(0, 10);
}
