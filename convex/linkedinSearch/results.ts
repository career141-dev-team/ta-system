/**
 * results.ts — turn Crustdata output into complete, checked result rows (Full Plan v1.2, section 5).
 *
 * - Columns are read by meaning, not exact name (Crustdata's AI names them differently each time).
 * - Blank title / company / location → listed for a re-fetch by id (gap fill, done by the engine).
 * - Years as text are parsed; otherwise "unknown". Years in an area: column, evidence, or job list.
 * - Location checked by us; repeats removed by link and by name + company; company spread.
 * - Five must-have ticks; Crustdata's checks kept as evidence — never a reason to drop a person.
 */
import type { MustHaveTicks, ResultFlags, ResultRow, StandardForm, Tick, YearsValue } from "./types";
import type { AgentColumn, AgentRead, AgentRow, PersonProfile } from "./crustdata";
import { AREA_KEYWORDS, countryOf, functionsIn, LEVEL_NAME, levelIndex, levelsIn, PROFESSION_RE, QUAL_RE } from "./vocab";

// ---- Small readers ---------------------------------------------------------------------------

export function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("raw" in o && o.raw) return toText(o.raw);
    for (const k of ["name", "title", "value", "text", "label"]) if (k in o && o[k]) return toText(o[k]);
    const parts = ["city", "state", "country"].map((k) => toText(o[k])).filter(Boolean);
    if (parts.length) return parts.join(", ");
    return "";
  }
  return "";
}

const BLANKS = /^(n\/?a|na|none|null|not (listed|available|reported|found|specified|stated)|unknown|-|—|\?|\{\}|\[\])$/i;
function clean(v: unknown): string {
  const s = toText(v);
  if (!s || BLANKS.test(s) || s.startsWith("{")) return "";
  return s;
}

/** "21", "6 to 10 years", "More than 10", "15+", "3 years 4 months", "Not listed" → YearsValue. */
export function parseYears(v: unknown): YearsValue {
  const text = toText(v);
  const t = text.toLowerCase();
  if (!t || BLANKS.test(t)) return { min: null, max: null, text: text || "unknown", known: false };
  if (typeof v === "number" && Number.isFinite(v)) return { min: v, max: v, text: `${v}`, known: true };
  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)?\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)/);
  if (m) return { min: +m[1], max: +m[2], text, known: true };
  m = t.match(/(?:more than|over|above|at least|\b)(\d+(?:\.\d+)?)\s*\+/) ?? t.match(/(?:more than|over|above|at least)\s+(\d+(?:\.\d+)?)/);
  if (m) return { min: +m[1], max: null, text, known: true };
  m = t.match(/(?:less than|under|below|up to)\s+(\d+(?:\.\d+)?)/);
  if (m) return { min: null, max: +m[1], text, known: true };
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)?(?:\s*(?:and\s*)?(\d+)\s*months?)?/);
  if (m) {
    const y = +m[1] + (m[2] ? Math.round((+m[2] / 12) * 10) / 10 : 0);
    if (y <= 60) return { min: y, max: y, text, known: true };
  }
  return { min: null, max: null, text, known: false };
}

export function yearsShown(y: YearsValue): string {
  if (!y.known) return "unknown";
  if (y.min != null && y.max != null) return y.min === y.max ? `${y.min}` : `${y.min}–${y.max}`;
  if (y.min != null) return `${y.min}+`;
  return `up to ${y.max}`;
}

export function normaliseUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  let s = u.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "").replace(/^[a-z]{2,3}\.linkedin\.com/, "linkedin.com").replace(/^www\./, "");
  s = s.split(/[?#]/)[0].replace(/\/+$/, "");
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep */
  }
  return s;
}

export function personKey(name: string, company: string): string | null {
  const n = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
  const c = company.toLowerCase().replace(/\b(pvt|private|ltd|limited|plc|group|holdings|inc|llc)\b/g, "").replace(/[^a-z0-9]/g, "");
  return n && c ? `${n}|${c}` : null;
}

// ---- Columns by meaning ----------------------------------------------------------------------

export type ColumnRole = "name" | "url" | "headline" | "title" | "company" | "years" | "areaYears" | "location" | "city" | "country" | "other";

export function columnRole(c: AgentColumn, area?: string | null): ColumnRole {
  const t = `${c.key} ${c.label ?? ""} ${c.field ?? ""}`.toLowerCase().replace(/_/g, " ");
  if (/headline/.test(t)) return "headline";
  if (/url|link|linkedin|profile url/.test(t)) return "url";
  // Tenure in the current job and the employer's head office are not the person's total years / company / place.
  if (/\b(at|in|with)\s+(the\s+)?(current|present)\s+(company|employer|role|job|position)|\btenure\b|\btime in (role|company)\b/.test(t)) return "other";
  if (/\b(hq|headquarters?|head office)\b/.test(t)) return "other";
  if (/(years?|experience|exper|tenure)/.test(t)) {
    const areaWords = area ? area.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2) : [];
    if (/\b(in|relevant|specific|domain|area|field)\b/.test(t) && !/\btotal\b/.test(t)) return "areaYears";
    if (areaWords.some((w) => t.includes(w))) return "areaYears";
    if (/skills?/.test(t)) return "other";
    return "years";
  }
  if (/compan|employer|organi[sz]ation|firm|workplace/.test(t)) return "company";
  // "Country" alone is a country; "Location (city and country)" is a location.
  const label = (c.label ?? c.key).toLowerCase().replace(/_/g, " ");
  if (/\bcountry\b/.test(t) && !/\b(city|location|town)\b/.test(label)) return "country";
  if (/location/.test(label)) return "location";
  if (/\bcity\b|\btown\b/.test(t)) return /,/.test(label) ? "location" : "city";
  if (/location|based|region|address/.test(t)) return "location";
  if (/title|role|position|designation|job/.test(t)) return "title";
  if (/\bname\b/.test(t) && !/school|company/.test(t)) return "name";
  return "other";
}

/** A title that is really a headline ("Merchandiser at X | Ex-Y | MBA"). */
function looksLikeHeadline(s: string): boolean {
  return s.length > 70 || /\s\|\s|\s@\s|\bat\s+[A-Z]/.test(s) || (s.match(/,/g)?.length ?? 0) >= 2;
}

function splitLocation(raw: string): { city: string | null; country: string | null } {
  // Crustdata writes "City not listed, United Arab Emirates" and "Abu Dhabi (inferred), …".
  const s = raw.replace(/\b(city\s+)?not\s+(listed|reported|available|stated)\b|\bunknown\b/gi, "").replace(/\s*\((inferred|estimated|approx\.?)\)/gi, "").replace(/^\s*,\s*/, "").trim();
  if (!s) return { city: null, country: null };
  const parts = s.split(/\s*,\s*/).filter(Boolean);
  let country: string | null = null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const c = countryOf(parts[i]);
    if (c) {
      country = c;
      break;
    }
  }
  const first = parts[0] ?? "";
  const firstCountry = countryOf(first);
  const city = parts.length > 1 || (firstCountry && firstCountry !== first && !COUNTRY_WORD.test(first)) ? first : null;
  if (!country && firstCountry) country = firstCountry;
  return { city: city && countryOf(city) === city ? null : city, country };
}
const COUNTRY_WORD = /^(sri lanka|bangladesh|india|pakistan|uae|united arab emirates|saudi arabia|qatar|oman|kuwait|bahrain|maldives|singapore)$/i;

function companyFromHeadline(h: string): string {
  const m = h.match(/\b(?:at|@)\s+([^|,•\-–]+?)(?:\s*[|,•\-–]|$)/);
  return m ? m[1].trim() : "";
}

// ---- Ticks and checks --------------------------------------------------------------------------

type CheckKind = keyof MustHaveTicks;
function constraintKind(text: string): CheckKind | null {
  const t = text.toLowerCase();
  if (/\b(based|located|lives|living|location|reside|country|city)\b/.test(t)) return "location";
  if (/\byears?\b/.test(t)) return "years";
  if (/\b(level|senior|seniority|junior)\b/.test(t)) return "level";
  if (/\b(industry|sector|compan(y|ies)|employer|manufactur\w*|works at|firm)\b/.test(t)) return "industry";
  if (/\b(title|function|role|position|works (in|as))\b/.test(t)) return "function";
  return null;
}

function tickOf(a: string | undefined): Tick {
  if (!a) return "unknown";
  if (a === "satisfied" || a === "met" || a === "yes") return "yes";
  if (/violat|unsatisf|not_satisf|not met|^no$/.test(a)) return "no";
  return "unknown";
}

/** Related functions do not count as "another function" (an electrical engineer in a solar search). */
const RELATED: Record<string, string[]> = {
  renewable_engineering: ["electrical_maintenance"],
  electrical_maintenance: ["renewable_engineering", "manufacturing"],
  strategy: ["finance", "planning", "marketing"],
  finance: ["strategy"],
  merchandising: ["marketing", "sales", "supply_chain"],
  manufacturing: ["planning", "supply_chain", "electrical_maintenance"],
  ehs: ["manufacturing"],
};

function titleLevelIdx(title: string): number | null {
  const lv = levelsIn(title);
  if (!lv.length) return null;
  return Math.max(...lv.map(levelIndex));
}

export function levelTick(title: string, f: StandardForm): { tick: Tick; above: boolean; below: boolean } {
  if (!f.levelLow || !f.levelHigh) return { tick: "unknown", above: false, below: false };
  const i = titleLevelIdx(title);
  if (i == null) return { tick: PROFESSION_RE.test(title) ? "unknown" : "unknown", above: false, below: false };
  const above = i > levelIndex(f.levelHigh);
  const below = i < levelIndex(f.levelLow);
  return { tick: above || below ? "no" : "yes", above, below };
}

function functionTick(title: string, headline: string, f: StandardForm): { tick: Tick; other: boolean } {
  if (!f.function) return { tick: "unknown", other: false };
  const fs = functionsIn(title || headline);
  if (fs.includes(f.function)) return { tick: "yes", other: false };
  const words = new Set(
    f.titles
      .join(" ")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 3 && !/^(assistant|senior|manager|general|head|executive|deputy|director|chief|officer|engineer|analyst)$/.test(w)),
  );
  const tw = (title || headline).toLowerCase().split(/[^a-z]+/);
  if (tw.some((w) => words.has(w))) return { tick: "yes", other: false };
  if (!fs.length) return { tick: "unknown", other: false };
  const related = RELATED[f.function] ?? [];
  if (fs.some((x) => related.includes(x))) return { tick: "unknown", other: false };
  return { tick: "no", other: true };
}

function yearsTick(y: YearsValue, f: StandardForm): Tick {
  const want = f.totalYears;
  if (!want || !y.known) return "unknown";
  const lo = y.min ?? y.max ?? 0;
  const hi = y.max ?? y.min ?? 99;
  if (want.min != null && hi < want.min) return "no";
  if (want.max != null && lo > want.max + 1) return "no";
  return "yes";
}

function locationTick(country: string | null, f: StandardForm): Tick {
  if (!f.location.country || !country) return "unknown";
  return country.toLowerCase() === f.location.country.toLowerCase() ? "yes" : "no";
}

export function matchesExcluded(company: string, excluded: string[]): boolean {
  const c = company.toLowerCase();
  if (!c) return false;
  return excluded.some((e) => {
    const x = e.toLowerCase().trim();
    if (!x) return false;
    const head = x.split(/\s+/)[0];
    // "MAS" catches "MAS Active", "MAS Intimates"; "Delmo Chicken & Agro" catches "Delmo".
    const word = (w: string) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(c);
    return word(x) || (head.length >= 3 && word(head));
  });
}

/** Years in an area from a job list: jobs whose company name, title or industry says the area. */
export function areaYearsFromJobs(
  jobs: { name?: string; title?: string; company_industries?: string[]; start_date?: string | null; end_date?: string | null }[],
  area: string,
  now = new Date(),
): number | null {
  const key = Object.keys(AREA_KEYWORDS).find((k) => area.toLowerCase().includes(k)) ?? (/solar|pv/i.test(area) ? "solar" : null);
  const re = key ? AREA_KEYWORDS[key] : new RegExp(area.split(/\s+/)[0], "i");
  let months = 0;
  let any = false;
  for (const j of jobs) {
    const text = `${j.name ?? ""} ${j.title ?? ""} ${(j.company_industries ?? []).join(" ")}`;
    if (!re.test(text) || !j.start_date) continue;
    const s = new Date(j.start_date);
    const e = j.end_date ? new Date(j.end_date) : now;
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
    months += Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth());
    any = true;
  }
  return any ? Math.round((months / 12) * 10) / 10 : null;
}

function areaFromEvidence(texts: string[], area: string): YearsValue | null {
  const word = area.split(/[^a-z]+/i).find((w) => w.length > 2) ?? area;
  for (const t of texts) {
    const m = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\+?\\s*(?:years?|yrs?)[^.]{0,60}${word}|${word}[^.]{0,60}?(\\d+(?:\\.\\d+)?)\\+?\\s*(?:years?|yrs?)`, "i"));
    if (m) {
      const n = +(m[1] ?? m[2]);
      if (n <= 50) return { min: n, max: n, text: `${n} (from evidence)`, known: true };
    }
  }
  return null;
}

// ---- Rows ------------------------------------------------------------------------------------

function emptyFlags(): ResultFlags {
  return { thin: false, aboveLevel: false, belowLevel: false, otherFunction: false, atClient: false, seenBefore: false, cityNotReported: false, declined: false, unreachable: false, similarToRejected: false, heldBy: null };
}

function baseRow(): ResultRow {
  return {
    crustdataId: null, linkedinUrl: null, name: "", headline: "", currentTitle: "", currentCompany: "", city: null, country: null,
    totalYears: { min: null, max: null, text: "unknown", known: false }, areaYears: null,
    mustHaves: { function: "unknown", level: "unknown", years: "unknown", industry: "unknown", location: "unknown" },
    evidence: [], qualificationsInHeadline: [], flags: emptyFlags(), warnings: [], dataDate: null, source: "agent", rank: 0,
    hidden: false, hiddenReason: null, filled: [], seenBefore: [],
  };
}

/** One Agent Search row → result row (before checks). */
export function rowFromAgent(r: AgentRow, columns: AgentColumn[], constraints: { id: string; text: string }[], f: StandardForm, dataDate: string | null): ResultRow {
  const row = baseRow();
  row.crustdataId = r.id != null ? String(r.id) : null;
  row.dataDate = dataDate;
  const byRole: Partial<Record<ColumnRole, unknown>> = {};
  const roleOfKey = new Map<string, ColumnRole>();
  for (const c of columns ?? []) roleOfKey.set(c.key, columnRole(c, f.areaYears?.area));
  // Columns in Crustdata's order (the asked-for columns come first; "normalized title" etc. come later).
  const keys = [...(columns ?? []).map((c) => c.key), ...Object.keys(r.values ?? {}).filter((k) => !roleOfKey.has(k))];
  for (const k of keys) {
    const v = (r.values ?? {})[k];
    const role = roleOfKey.get(k) ?? columnRole({ key: k }, f.areaYears?.area);
    if (role === "other") continue;
    if (byRole[role] == null || clean(byRole[role]) === "") byRole[role] = v;
  }
  row.name = clean(byRole.name);
  row.linkedinUrl = clean(byRole.url) || null;
  let title = clean(byRole.title);
  let headline = clean(byRole.headline);
  // Swapped columns: a headline in the title column, a short title in the headline column.
  if (title && looksLikeHeadline(title) && (!headline || !looksLikeHeadline(headline))) [title, headline] = [headline, title];
  row.currentTitle = title && !looksLikeHeadline(title) ? title : title && !headline ? "" : title;
  if (!row.currentTitle && title) headline = headline || title;
  row.headline = headline;
  row.currentCompany = clean(byRole.company);
  const loc = splitLocation(clean(byRole.location));
  const countryText = clean(byRole.country);
  const cLoc = countryText.includes(",") ? splitLocation(countryText) : null;
  const country = cLoc ? cLoc.country ?? "" : countryText;
  row.country = (country && (countryOf(country) ?? country)) || loc.country;
  row.city = clean(byRole.city) || loc.city || cLoc?.city || null;
  row.totalYears = parseYears(byRole.years);
  if (f.areaYears) {
    const a = byRole.areaYears != null ? parseYears(byRole.areaYears) : null;
    row.areaYears = a && a.known ? a : null;
  }
  const ctext = new Map((constraints ?? []).map((c) => [c.id, c.text]));
  row.evidence = (r.constraints ?? []).map((c) => ({ check: ctext.get(c.constraint_id) ?? c.constraint_id, verdict: tickOf(c.assessment), text: c.evidence ?? "" }));
  if (f.areaYears && !row.areaYears) row.areaYears = areaFromEvidence(row.evidence.map((e) => e.text), f.areaYears.area);
  return row;
}

/** One normal-search profile → result row. */
export function rowFromProfile(p: PersonProfile, f: StandardForm | null, source: ResultRow["source"] = "normal"): ResultRow {
  const row = baseRow();
  row.source = source;
  const get = (path: string): unknown => {
    if (path in p) return p[path];
    return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), p);
  };
  row.crustdataId = get("crustdata_person_id") != null ? String(get("crustdata_person_id")) : null;
  row.name = clean(get("basic_profile.name"));
  row.headline = clean(get("basic_profile.headline"));
  row.currentTitle = clean(get("basic_profile.current_title"));
  const loc = get("basic_profile.location") as Record<string, unknown> | string | undefined;
  if (loc && typeof loc === "object") {
    row.country = countryOf(toText(loc.country)) ?? (clean(loc.country) || null);
    row.city = clean(loc.city) || null;
    if (!row.country && loc.raw) Object.assign(row, splitLocation(toText(loc.raw)));
  } else if (typeof loc === "string") {
    const s = splitLocation(loc);
    row.country = s.country;
    row.city = s.city;
  }
  row.linkedinUrl = clean(get("social_handles.professional_network_identifier.profile_url")) || null;
  const current = get("experience.employment_details.current");
  const jobs = Array.isArray(current) ? (current as Record<string, unknown>[]) : [];
  const main = jobs.find((j) => j.is_default) ?? jobs[0];
  row.currentCompany = clean(main?.name ?? main?.company_name) || companyFromHeadline(row.headline);
  if (!row.currentTitle && main?.title) row.currentTitle = clean(main.title);
  row.dataDate = clean(get("basic_profile.last_updated") ?? get("metadata.updated_at")) || null;
  const fit = clean(get("fit"));
  if (fit) row.evidence.push({ check: "Normal search fit", verdict: fit === "strong" ? "yes" : fit === "weak" ? "no" : "unknown", text: fit });
  if (f?.areaYears) {
    const past = get("experience.employment_details.past");
    const all = [...jobs, ...(Array.isArray(past) ? (past as Record<string, unknown>[]) : [])] as Parameters<typeof areaYearsFromJobs>[0];
    const y = all.length ? areaYearsFromJobs(all, f.areaYears.area) : null;
    if (y != null) row.areaYears = { min: y, max: y, text: `${y} (from dated jobs)`, known: true };
  }
  return row;
}

/** Fields still blank after the main search (→ gap fill by id). */
export function blanks(r: ResultRow): string[] {
  const out: string[] = [];
  if (!r.currentTitle) out.push("title");
  if (!r.currentCompany) out.push("company");
  if (!r.country) out.push("location");
  if (!r.linkedinUrl) out.push("url");
  return out;
}

/** Merge a re-fetched profile into a row (only blanks are filled). */
export function fillFrom(r: ResultRow, p: ResultRow): ResultRow {
  const fill = <K extends keyof ResultRow>(k: K, label: string) => {
    if (!r[k] && p[k]) {
      (r as Record<string, unknown>)[k] = p[k];
      r.filled.push(label);
    }
  };
  fill("currentTitle", "title");
  fill("currentCompany", "company");
  fill("country", "country");
  fill("city", "city");
  fill("linkedinUrl", "url");
  fill("headline", "headline");
  fill("name", "name");
  if (!r.dataDate && p.dataDate) r.dataDate = p.dataDate;
  if ((!r.areaYears || !r.areaYears.known) && p.areaYears?.known) r.areaYears = p.areaYears;
  return r;
}

// ---- Checks on every row ---------------------------------------------------------------------

export function checkRow(r: ResultRow, f: StandardForm): ResultRow {
  const w: string[] = [];
  const lt = levelTick(r.currentTitle, f);
  const ft = functionTick(r.currentTitle, r.headline, f);
  r.flags.aboveLevel = lt.above;
  r.flags.belowLevel = lt.below;
  r.flags.otherFunction = ft.other;
  r.flags.atClient = matchesExcluded(r.currentCompany, f.excludeCompanies) || matchesExcluded(r.headline.match(/\bat\s+(.+)$/i)?.[1] ?? "", f.excludeCompanies);
  r.flags.thin = (!r.currentTitle && r.headline.length < 15) || (!r.currentCompany && !r.headline) || (!r.currentTitle && !r.currentCompany);
  r.flags.cityNotReported = !!r.country && !r.city;

  // Ticks: ours where we can tell, Crustdata's evidence otherwise.
  const fromEvidence = (k: CheckKind): Tick => {
    const ts = r.evidence.filter((e) => constraintKind(e.check) === k).map((e) => e.verdict);
    if (!ts.length) return "unknown";
    if (ts.includes("no")) return "no";
    if (ts.every((t) => t === "yes")) return "yes";
    return "unknown";
  };
  const or = (a: Tick, b: Tick): Tick => (a !== "unknown" ? a : b);
  r.mustHaves = {
    function: or(ft.tick, fromEvidence("function")),
    level: or(lt.tick, fromEvidence("level")),
    years: or(yearsTick(r.totalYears, f), fromEvidence("years")),
    industry: fromEvidence("industry"),
    location: or(locationTick(r.country, f), fromEvidence("location")),
  };

  const quals = [...new Set([...`${r.headline} ${r.currentTitle}`.matchAll(QUAL_RE)].map((m) => m[1].toUpperCase()))];
  r.qualificationsInHeadline = quals;
  if (f.qualifications.length && !quals.some((q) => f.qualifications.includes(q))) {
    w.push(`${f.qualifications.join(" / ")} not in the headline — check on LinkedIn.`);
  }
  if (r.flags.thin) w.push("Thin profile — call or message to check (do not skip).");
  if (r.flags.aboveLevel) w.push(`Above the level asked (${LEVEL_NAME[f.levelHigh!]} is the ceiling).`);
  if (r.flags.belowLevel) w.push(`Below the level asked (${LEVEL_NAME[f.levelLow!]} is the floor).`);
  if (r.flags.otherFunction) w.push("Title looks like another function — check the profile.");
  if (r.flags.atClient) w.push("Works at the client or an excluded company.");
  if (r.flags.cityNotReported) w.push("City not reported; country matches.");
  if (!r.totalYears.known) w.push("Total years unknown — check on LinkedIn.");
  if (f.areaYears) {
    if (!r.areaYears?.known) {
      const kw = Object.entries(AREA_KEYWORDS).find(([k]) => f.areaYears!.area.toLowerCase().includes(k.replace("_", " ")) || (k === "solar" && /solar|pv/i.test(f.areaYears!.area)));
      if (kw && kw[1].test(`${r.currentCompany} ${r.currentTitle}`)) w.push(`Current job is in ${f.areaYears.area}; years in the area unknown — check on LinkedIn.`);
    } else {
      w.push(`Years in ${f.areaYears.area} are approximate — check on LinkedIn.`);
    }
  }
  if (r.filled.length) w.push(`Filled by re-fetch: ${r.filled.join(", ")}.`);
  r.warnings = w;
  return r;
}

// ---- Whole-list steps ------------------------------------------------------------------------

/** Remove repeats by LinkedIn link and by name + company. The first (best ranked) row stays and gains the other's blanks. */
export function removeRepeats(rows: ResultRow[], alreadyShown: { urls?: Set<string>; keys?: Set<string>; ids?: Set<string> } = {}): { rows: ResultRow[]; removed: number } {
  const byUrl = new Map<string, ResultRow>();
  const byKey = new Map<string, ResultRow>();
  const byId = new Map<string, ResultRow>();
  const out: ResultRow[] = [];
  let removed = 0;
  for (const r of rows) {
    const u = normaliseUrl(r.linkedinUrl);
    const k = personKey(r.name, r.currentCompany);
    if ((u && alreadyShown.urls?.has(u)) || (k && alreadyShown.keys?.has(k)) || (r.crustdataId && alreadyShown.ids?.has(r.crustdataId))) {
      removed++;
      continue;
    }
    const twin = (u && byUrl.get(u)) || (k && byKey.get(k)) || (r.crustdataId && byId.get(r.crustdataId)) || null;
    if (twin) {
      fillFrom(twin, r);
      twin.filled = twin.filled.filter((x) => x !== "name");
      // Remember the twin's other link / key / id, so a later row with them is caught too.
      if (u) byUrl.set(u, twin);
      if (k) byKey.set(k, twin);
      if (r.crustdataId) byId.set(r.crustdataId, twin);
      removed++;
      continue;
    }
    if (u) byUrl.set(u, r);
    if (k) byKey.set(k, r);
    if (r.crustdataId) byId.set(r.crustdataId, r);
    out.push(r);
  }
  return { rows: out, removed };
}

/** Our location check: hide people outside the country; keep "city not reported" when the country matches. */
export function locationCheck(rows: ResultRow[], f: StandardForm): number {
  let hidden = 0;
  if (!f.location.country) return 0;
  const want = f.location.country.toLowerCase();
  for (const r of rows) {
    if (r.hidden) continue;
    if (r.country && r.country.toLowerCase() !== want) {
      r.hidden = true;
      r.hiddenReason = `Lives in ${r.country}, not ${f.location.country}.`;
      hidden++;
    } else if (!r.country) {
      r.warnings.push("Location not reported — check on LinkedIn.");
    }
  }
  return hidden;
}

export type CompanySpread = { company: string; count: number }[];

export function companySpread(rows: ResultRow[]): CompanySpread {
  const m = new Map<string, { company: string; count: number }>();
  for (const r of rows) {
    if (r.hidden || !r.currentCompany) continue;
    const k = r.currentCompany.toLowerCase().replace(/\b(pvt|private|ltd|limited|plc)\b|[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    const e = m.get(k) ?? { company: r.currentCompany, count: 0 };
    e.count++;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

/** "At most N per company" (option). Extra people are hidden, not deleted. */
export function capPerCompany(rows: ResultRow[], n: number | null): number {
  if (!n) return 0;
  const seen = new Map<string, number>();
  let hidden = 0;
  for (const r of rows) {
    if (r.hidden || !r.currentCompany) continue;
    const k = r.currentCompany.toLowerCase();
    const c = (seen.get(k) ?? 0) + 1;
    seen.set(k, c);
    if (c > n) {
      r.hidden = true;
      r.hiddenReason = `More than ${n} from ${r.currentCompany}.`;
      hidden++;
    }
  }
  return hidden;
}

/** Hide the client's own staff when the setting is on (they stay visible with a flag otherwise). */
export function hideClientStaff(rows: ResultRow[], on: boolean): number {
  if (!on) return 0;
  let n = 0;
  for (const r of rows) {
    if (!r.hidden && r.flags.atClient) {
      r.hidden = true;
      r.hiddenReason = "Works at the client or an excluded company.";
      n++;
    }
  }
  return n;
}

export function rank(rows: ResultRow[]): ResultRow[] {
  const score = (r: ResultRow) => {
    const t = Object.values(r.mustHaves);
    return t.filter((x) => x === "yes").length * 2 - t.filter((x) => x === "no").length * 3 - (r.flags.declined ? 20 : 0) - (r.flags.similarToRejected ? 4 : 0) - (r.flags.thin ? 1 : 0);
  };
  // Stable: Crustdata's order (best first) breaks ties.
  // Agent and saved rows first (checked per person); normal-search rows (basic, fewer checks) after them.
  const group = (r: ResultRow) => (r.source === "normal" ? 1 : 0);
  const ordered = rows
    .map((r, i) => ({ r, i, s: score(r) }))
    .sort((a, b) => Number(a.r.hidden) - Number(b.r.hidden) || group(a.r) - group(b.r) || b.s - a.s || a.i - b.i);
  let n = 0;
  return ordered.map(({ r }) => {
    r.rank = r.hidden ? 0 : ++n;
    return r;
  });
}

/** Crustdata's warnings for the top of the list. */
export function agentWarnings(read: AgentRead): string[] {
  const w: string[] = [];
  if (read.reason) w.push(`Crustdata: result is ${read.reason}.`);
  if (read.note) w.push(`Crustdata note: ${read.note}`);
  return w;
}

/** All rows of an Agent read, checked (no gap fill — the engine does that with the client). */
export function rowsFromAgentRead(read: AgentRead, f: StandardForm): ResultRow[] {
  const p = read.person;
  if (!p) return [];
  const date = read.createdAt ? read.createdAt.slice(0, 10) : null;
  // Bad rows (null, no values) never throw: a paid search is never lost to one broken row.
  return (Array.isArray(p.rows) ? p.rows : []).filter((r): r is AgentRow => !!r && typeof r === "object").map((r) => rowFromAgent(r, p.columns ?? [], p.constraints ?? [], f, date));
}
