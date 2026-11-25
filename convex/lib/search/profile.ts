/**
 * The profile builder: Haiku reads one CV and fills the profile, choosing
 * only from the fixed lists; code then checks every answer against the lists,
 * counts the years from the job dates, decodes a Sri Lankan NIC, resolves the
 * place, and lets a TA's verified years win.
 *
 * Gender and date of birth are recorded only when the CV states them (a
 * "Gender"/"Sex" line, a date of birth or a stated age) or the NIC encodes
 * them. Never from a name, a photo or "Mr/Mrs".
 */
import { ROLES, ROLE_BY_ID } from "./lists/roles";
import { LEVELS, LEVEL_RULES_BY_COUNTRY } from "./lists/levels";
import { QUALIFICATIONS, QUAL_BY_ID, VISA_STATUSES, DRIVING_LICENCES } from "./lists/qualifications";
import { COMPANY_TYPES, EMPLOYERS } from "./lists/companies";
import { COUNTRIES, COUNTRY_BY_CODE, resolvePlace, resolveNationality, countryOf, PLACE_BY_ID } from "./lists/places";
import { toUsdMonthly } from "./lists/money";
import type { Profile, ProfileJob, QualStatus } from "./types";

import { now } from "./today";

export const PROFILE_SYSTEM = `You read one CV and return a JSON search profile. Choose every coded value ONLY from the lists below. If the CV does not say something, use null or []; never guess.

ROLE ids (the occupation, never the seniority; "Finance Manager", "Chief Accountant" and "Accounts Executive" are all accountant):
${ROLES.map((r) => `${r.id}: ${r.label}`).join("\n")}

LEVEL ranks (one ladder for every country):
${LEVELS.map((l) => `${l.rank} ${l.label}`).join("\n")}
How titles map by country:
${LEVEL_RULES_BY_COUNTRY}

QUALIFICATION ids:
${QUALIFICATIONS.map((q) => `${q.id}: ${q.label}`).join("\n")}
Status for professional bodies: member (ACMA, FCCA, ACA, MAAT, "Chartered Accountant", "Member"), finalist ("passed finalist", "affiliate", all exams done), part_qualified (some levels or papers done), studying ("reading for", "student"). Degrees, school results, licences and certificates: holds.

COMPANY TYPE ids: ${COMPANY_TYPES.map((c) => c.id).join(", ")}. Known firms: Big 4 = Deloitte, PwC, EY, KPMG.
VISA ids: ${VISA_STATUSES.join(", ")}
DRIVING LICENCE ids: ${DRIVING_LICENCES.join(", ")}
COUNTRY codes: ${COUNTRIES.map((c) => c.code).join(" ")}

Return exactly this JSON:
{
 "roles": [role id of the CURRENT or latest job; add a second id only when that one job is genuinely two roles, e.g. "HR & Admin Executive"],
 "level": rank of the current or latest job,
 "title": "current or latest job title as written",
 "residence": {"place": "city or town where the person LIVES NOW, as written (not a permanent or home-country address when a current location is given)", "country": "code"} or null,
 "nationality": "code" or null,
 "gender": "male" | "female" | null   (ONLY from an explicit Gender/Sex line; never from the name or a title such as Mr/Mrs),
 "dob": "YYYY-MM-DD" or null   (ONLY from an explicit date of birth),
 "statedAge": number or null   (ONLY from an explicit "Age: N"),
 "jobs": [ every job, newest first: {"role": id, "level": rank, "title": "...", "company": "...", "companyTypes": [ids], "country": "code or null", "start": "YYYY-MM" or "YYYY" or null, "end": "YYYY-MM" or "YYYY" or "present" or null, "internship": true|false } ],
 "qualifications": [{"id": id, "status": "member"|"finalist"|"part_qualified"|"studying"|"holds"}],
 "skills": [up to 15 skills as plain standard names, e.g. "Excel" for "MS Excel", "Microsoft Office" for "MS Office"],
 "salary": {"amount": number in full units (1.5 lakhs = 150000; 12 LPA = 1200000), "currency": "ISO code", "period": "month"|"year", "kind": "current"|"expected"} or null,
 "noticeDays": number or null (immediate = 0, one month = 30),
 "visa": id or null,
 "drivingLicence": id or null,
 "languages": ["English", ...],
 "statedYears": number of years of experience the CV claims, or null
}
Rules: "Present", "Till date", "To date", "Current", "Todate" all mean "present". A job written with only a start year and no end is end null, not present. Referees are not jobs. An internship or trainee programme under a year is internship true. Answer with the JSON only.`;

export const profileUser = (cvText: string, cvDate: string) => `CV received: ${cvDate}\n\n${cvText.slice(0, 9000)}`;

interface Raw {
  roles?: string[]; level?: number | null; title?: string;
  residence?: { place?: string | null; country?: string | null } | null;
  nationality?: string | null; gender?: string | null; dob?: string | null; statedAge?: number | null;
  jobs?: { role?: string | null; level?: number | null; title?: string; company?: string; companyTypes?: string[]; country?: string | null; start?: string | null; end?: string | null; internship?: boolean }[];
  qualifications?: { id?: string; status?: string }[];
  skills?: string[]; salary?: { amount?: number; currency?: string; period?: string; kind?: string } | null;
  noticeDays?: number | null; visa?: string | null; drivingLicence?: string | null; languages?: string[]; statedYears?: number | null;
}

const COMPANY_TYPE_IDS = new Set<string>(COMPANY_TYPES.map((c) => c.id));
const STATUS = new Set(["studying", "part_qualified", "finalist", "member", "holds"]);

/** Sri Lankan NIC: YYDDD…V or YYYYDDD…; day over 500 is a woman. */
export function decodeNic(text: string): { dob: string; gender: "male" | "female" } | null {
  const m = text.match(/\b(?:NIC|N\.I\.C|National Identity Card)[^:\n]*:\s*((?:19|20)\d{2}\d{3}\d{5}|\d{2}\d{3}\d{4}[VvXx])\b/i) ?? text.match(/\b(\d{9}[VvXx]|(?:19|20)\d{10})\b/);
  if (!m) return null;
  const v = m[1];
  const year = v.length === 12 ? Number(v.slice(0, 4)) : 1900 + Number(v.slice(0, 2));
  let day = Number(v.length === 12 ? v.slice(4, 7) : v.slice(2, 5));
  const gender = day > 500 ? "female" : "male";
  if (day > 500) day -= 500;
  if (day < 1 || day > 366) return null;
  const d = new Date(Date.UTC(year, 0, day));
  return { dob: d.toISOString().slice(0, 10), gender };
}

function parseDate(s: string | null | undefined): { d: Date; approx: boolean } | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})(?:-(\d{1,2}))?/);
  if (!m) return null;
  return { d: new Date(Date.UTC(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, 1)), approx: !m[2] };
}

/**
 * Years of work from the job dates (D1): internships left out; overlaps
 * counted once; an open job runs to today only if it is the latest; a job
 * with a start and no end counts nothing beyond the start of the next job.
 */
export function yearsFromJobs(jobs: ProfileJob[], today = now()): { years: number | null; approx: boolean } {
  // A start date the code cannot read (25 Nov 2026: one such CV stopped the whole
  // card build) counts as no start, not a crash.
  const real = jobs.filter((j) => !j.internship && parseDate(j.start));
  if (!real.length) return { years: null, approx: false };
  const sorted = [...real].sort((a, b) => parseDate(a.start)!.d.getTime() - parseDate(b.start)!.d.getTime());
  let approx = false;
  const spans: [number, number][] = [];
  for (const [i, j] of sorted.entries()) {
    const s = parseDate(j.start)!;
    approx ||= s.approx;
    const latest = i === sorted.length - 1;
    let e: Date;
    if (j.end === "present") e = latest ? today : (approx = true, parseDate(sorted[i + 1].start)!.d);
    else if (j.end) { const p = parseDate(j.end); e = p ? p.d : s.d; approx ||= !!p?.approx; if (p?.approx) e = new Date(Date.UTC(p.d.getUTCFullYear(), 11, 31)); }
    else { e = latest ? s.d : parseDate(sorted[i + 1].start)!.d; approx = true; }
    if (e > today) e = today;
    if (e > s.d) spans.push([s.d.getTime(), e.getTime()]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let ms = 0, cs = -Infinity, ce = -Infinity;
  for (const [s, e] of spans) { if (s > ce) { if (ce > cs) ms += ce - cs; cs = s; ce = e; } else ce = Math.max(ce, e); }
  if (ce > cs) ms += ce - cs;
  return { years: Math.round((ms / (365.25 * 864e5)) * 10) / 10, approx };
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#&./ -]+/g, " ").replace(/\s+/g, " ").trim();

/** Turn Haiku's answer into a checked profile. Anything off-list is dropped and noted as a gap. */
export function finishProfile(rec: { id: string; cvText: string; cvDate: string; taYears: number | null; mergedInto: string | null; cvFileMissing: boolean }, raw: Raw | null): Profile {
  const gaps: string[] = [];
  const r = raw ?? {};
  const roles = (r.roles ?? []).filter((x) => ROLE_BY_ID.has(x)).slice(0, 2);
  if (!roles.length) gaps.push("role");
  const level = typeof r.level === "number" && r.level >= 0 && r.level <= 8 ? Math.round(r.level) : null;
  if (level == null) gaps.push("level");
  const jobs: ProfileJob[] = (r.jobs ?? []).map((j) => ({
    role: j.role && ROLE_BY_ID.has(j.role) ? j.role : null,
    level: typeof j.level === "number" && j.level >= 0 && j.level <= 8 ? j.level : null,
    title: String(j.title ?? ""),
    company: String(j.company ?? ""),
    companyTypes: (j.companyTypes ?? []).filter((c) => COMPANY_TYPE_IDS.has(c)),
    country: j.country && COUNTRY_BY_CODE.has(j.country) ? j.country : null,
    start: j.start ?? null,
    end: j.end ?? null,
    internship: !!j.internship,
  }));
  // Company types we know by name, whatever the model said (Big 4 is never missed).
  for (const j of jobs) {
    const known = EMPLOYERS.find((e) => [e.name, ...e.aliases].some((n) => words(j.company).includes(words(n)) && n.length > 2));
    if (known) j.companyTypes = [...new Set([...j.companyTypes, ...known.types])];
  }
  // Place: where they live now; the country alone if the town is not on the list.
  let place = r.residence?.place ? resolvePlace(r.residence.place) : null;
  const resCountry = r.residence?.country && COUNTRY_BY_CODE.has(r.residence.country) ? r.residence.country : null;
  if (place && resCountry && countryOf(place) !== resCountry) place = null;
  if (!place && resCountry) place = `c-${resCountry}`;
  if (!place) gaps.push("place");
  const nationality = r.nationality && COUNTRY_BY_CODE.has(r.nationality) ? r.nationality : resolveNationality(r.nationality ?? null);
  if (!nationality) gaps.push("nationality");

  // Gender and birth: stated on the CV, else the NIC.
  const nic = decodeNic(rec.cvText);
  let gender: Profile["gender"] = r.gender === "male" || r.gender === "female" ? r.gender : null;
  let genderSource: Profile["genderSource"] = gender ? "cv" : null;
  if (!gender && nic) { gender = nic.gender; genderSource = "nic"; }
  let dob: string | null = r.dob && /^\d{4}-\d{2}-\d{2}$/.test(r.dob) ? r.dob : null;
  let dobSource: Profile["dobSource"] = dob ? "cv" : null;
  if (!dob && nic) { dob = nic.dob; dobSource = "nic"; }
  if (!dob && typeof r.statedAge === "number" && r.statedAge > 14 && r.statedAge < 80) {
    dob = `${new Date(rec.cvDate).getUTCFullYear() - r.statedAge}-07-01`;
    dobSource = "stated_age";
  }
  if (!gender) gaps.push("gender");
  if (!dob) gaps.push("dob");

  // Years: a TA's figure wins; else the dates; else what the CV claims.
  const counted = yearsFromJobs(jobs);
  let years = counted.years, yearsSource: Profile["yearsSource"] = years != null ? "job_dates" : null;
  if (rec.taYears != null) { years = rec.taYears; yearsSource = "ta"; }
  else if (years == null && typeof r.statedYears === "number") { years = r.statedYears; yearsSource = "stated"; }
  if (years == null) gaps.push("years");

  const quals = (r.qualifications ?? []).filter((q) => q.id && QUAL_BY_ID.has(q.id)).map((q) => ({ id: q.id!, status: (STATUS.has(q.status ?? "") ? q.status : "holds") as QualStatus }));
  const latest = jobs[0];
  const companyTypesNow = latest && latest.end === "present" ? latest.companyTypes : [];
  const companyTypesEver = [...new Set(jobs.flatMap((j) => j.companyTypes))];
  const s = r.salary;
  const salary = s && typeof s.amount === "number" && s.amount > 0 && s.currency
    ? { amount: s.amount, currency: s.currency.toUpperCase(), period: (s.period === "year" ? "year" : "month") as "month" | "year", kind: (s.kind === "current" ? "current" : "expected") as "current" | "expected", usdMonthly: toUsdMonthly(s.amount, s.currency.toUpperCase(), s.period === "year" ? "year" : "month") }
    : null;
  const skills = [...new Set((r.skills ?? []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 15);
  const title = String(r.title ?? latest?.title ?? "");
  const text = words([title, ...jobs.map((j) => `${j.title} ${j.company}`), ...skills, ...quals.map((q) => QUAL_BY_ID.get(q.id)!.label)].join(" | "));
  return {
    id: rec.id,
    searchable: !rec.mergedInto && !rec.cvFileMissing,
    roles,
    family: roles[0] ? ROLE_BY_ID.get(roles[0])!.family : null,
    level,
    title,
    place,
    country: place ? PLACE_BY_ID.get(place)?.country ?? null : null,
    nationality,
    gender, genderSource, dob, dobSource,
    years, yearsSource, yearsApprox: counted.approx && yearsSource === "job_dates",
    jobs,
    workedCountries: [...new Set(jobs.filter((j) => !j.internship && j.country).map((j) => j.country!))],
    quals, skills,
    companyTypesNow, companyTypesEver,
    employers: [...new Set(jobs.map((j) => j.company).filter(Boolean))],
    salary,
    noticeDays: typeof r.noticeDays === "number" ? r.noticeDays : null,
    visa: r.visa && (VISA_STATUSES as readonly string[]).includes(r.visa) ? r.visa : null,
    licence: r.drivingLicence && (DRIVING_LICENCES as readonly string[]).includes(r.drivingLicence) ? r.drivingLicence : null,
    languages: (r.languages ?? []).map(String),
    cvDate: rec.cvDate,
    text,
    gaps,
  };
}

/** The model's JSON, with or without a code fence or a sentence around it; null when unreadable. */
export function jsonOf<T = unknown>(text: string | null): T | null {
  if (!text) return null;
  const t = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    return JSON.parse(t) as T;
  } catch {
    const s = Math.min(...["{", "["].map((c) => (t.indexOf(c) < 0 ? Infinity : t.indexOf(c))));
    const e = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (!Number.isFinite(s) || e <= s) return null;
    try {
      return JSON.parse(t.slice(s, e + 1)) as T;
    } catch {
      return null;
    }
  }
}
