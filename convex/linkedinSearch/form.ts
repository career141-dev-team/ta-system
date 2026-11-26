/**
 * form.ts — request / pasted JD / opening → the standard form (Full Plan v1.2, section 4.1).
 *
 * Two layers:
 *  1. `formFromRules(request)` — deterministic rules. Always runs, needs nothing outside.
 *  2. `extractForm(request, { llm })` — asks the LLM to fill what the rules left empty
 *     (role on messy JDs, must-haves, industry), then runs the same rule clean-up again.
 *     The LLM never overrides: removed items, the TA's own lines, location found by rules.
 *
 * Same need → same form → same `formKey` (used as Crustdata's idempotency key).
 */
import type { Level, Llm, RemovedItem, SearchRequest, StandardForm, YearsRange } from "./types";
import {
  AREA_KEYWORDS, countryOf, expandShortForms, FUNCTIONS, functionOf, GULF, HOME_COUNTRY, INDUSTRIES, industryOf,
  LEVEL_YEARS, levelIndex, levelsIn, LEVELS, placesIn, PROFESSION_RE, QUAL_RE, sha256Hex,
} from "./vocab";

const RESULTS_PER_SEARCH = 30;
const MAX_MUST = 3;
const MAX_TITLES = 12;

// ------------------------------------------------------------------------------------------
// 1. Clean the text and take out what must not / cannot be searched (section 4.2, "removed").
// ------------------------------------------------------------------------------------------

type Removal = { kind: RemovedItem["item"]; re: RegExp; why: string; wholeLine?: boolean };

const WHY = {
  salary: "Salary and package cannot be searched on LinkedIn. Kept as a note for the TA.",
  benefits: "Allowances and benefits cannot be searched. Kept as a note.",
  working_terms: "Working terms (hours, employment type, reporting line) are not searched.",
  notice_period: "Notice period and availability are not on profiles. Ask the person.",
  gender: "Gender is never searched (it would be guessed from names or photos, and it is discrimination).",
  age: "Age is never searched (discrimination; profiles do not hold it).",
  religion: "Religion is never searched (discrimination).",
  marital_status: "Marital status is never searched (discrimination).",
  nationality: "Nationality is not searched (it would be guessed from names). Where the person lives or studied is used instead.",
  ethnicity: "Ethnicity is never searched (discrimination).",
  soft_skills: "Soft skills cannot be checked from a profile. Check them in the interview.",
  chat_ask: "Chat requests are not part of a search. Use the company spread on the results instead.",
} as const;

// A "segment" runs to the next ", " (a comma not inside a number like 6,000) or the end of the line,
// so a salary or a notice period on a one-line request is cut out without losing the role, years or place.
const SEG = "(?:(?!\\s-\\s(?!\\s*(?:\\d|LKR|USD|Rs|BDT|AED|INR)))[^,\\n]|,(?=\\d))*";
const AMOUNT = "[\\d][\\d,.]*\\s*(?:k|mn|m|million|lakhs?|lacs?)?\\b";
const segRe = (words: string, prefix = "") => new RegExp(`${prefix}\\b(?:${words})\\b${SEG}`, "gi");

const REMOVALS: Removal[] = [
  // Pasted JD header lines ("Reporting To - Executive Director", "Gross Salary - LKR …"): the whole line goes.
  { kind: "salary", re: /^[ \t]*(gross salary|basic salary|salary|package|remuneration)[ \t]*-[^\n]*$/gim, why: WHY.salary, wholeLine: true },
  { kind: "benefits", re: /^[ \t]*(allowances?[^\n-]*|fuel entitlement|vehicle|accommodation[^\n-]*|meals?|bonus)[ \t]*-[^\n]*$/gim, why: WHY.benefits, wholeLine: true },
  { kind: "working_terms", re: /^[ \t]*(employment type|reporting to|reports to|working days[^\n-]*|working hours|office hours)[ \t]*-[^\n]*$/gim, why: WHY.working_terms, wholeLine: true },
  { kind: "salary", re: segRe("salary|package|take[- ]home|ctc|remuneration|compensation", "(?:\\b(?:gross|basic|monthly|expected|net)\\s+)?"), why: WHY.salary },
  { kind: "salary", re: new RegExp(`\\b(?:LKR|USD|Rs\\.?|BDT|AED|INR)\\s?${AMOUNT}(?:\\s*(?:-|to)\\s*(?:LKR|USD|Rs\\.?|BDT|AED|INR)?\\s?${AMOUNT})?(?:\\s*(?:take home|per month|p\\.?m\\.?))?`, "gi"), why: WHY.salary },
  { kind: "benefits", re: segRe("allowances?|fuel entitlement|vehicle|accommodation|meals?|medical cover|bonus|insurance cover"), why: WHY.benefits },
  { kind: "working_terms", re: segRe("working days|working hours|office hours|employment type|reporting to|reports to"), why: WHY.working_terms },
  { kind: "notice_period", re: segRe("notice period|immediate joiners?|join immediately|available immediately|availability"), why: WHY.notice_period },
  { kind: "gender", re: /^\s*gender\s*[-:–][^\n]*$/gim, why: WHY.gender, wholeLine: true },
  { kind: "gender", re: /(,?\s*\band\s+|,\s*)?\b(only\s+)?(males?|females?|men|women|gentlemen|gents|lady|ladies)(\s+candidates?)?(\s+only)?(\s+(are\s+)?(preferred|required|needed))?\b/gi, why: WHY.gender },
  { kind: "age", re: /[^.\n,]*\b(age[sd]?\s*(limit|between|below|under|[-:–]|\d{2})|aged\s+\d{2}|\d{2}\s*(-|to)\s*\d{2}\s*years?\s+(of\s+age|old)|years\s+old|(below|under|less than|not more than|not older than)[ \t]+\d{2}[ \t]*(years)?(?![ \t]*(years?[ \t]*)?(of[ \t]+)?(experience|exp)))[^.\n,]*/gi, why: WHY.age },
  { kind: "religion", re: /[^.\n,]*\b(religion|buddhists?|christians?|muslims?|hindus?|catholics?)\b[^.\n,]*/gi, why: WHY.religion },
  { kind: "marital_status", re: /[^.\n,]*\b(marital status|married|unmarried)\b[^.\n,]*/gi, why: WHY.marital_status },
  { kind: "nationality", re: /^\s*nationality\s*[-:–][^\n]*$/gim, why: WHY.nationality, wholeLine: true },
  { kind: "nationality", re: /\b(local nationals?|[a-z]+ nationals? only|nationality)\b/gi, why: WHY.nationality },
  { kind: "ethnicity", re: /\b(sinhalese|tamils?|moors?|burghers?)\s+(candidates?|only|people|persons?)\b/gi, why: WHY.ethnicity },
  { kind: "soft_skills", re: /^[^\n]*\b(communication|interpersonal|team player|problem[- ]solving|self[- ]motivated|positive attitude|work independently|willingness to|leadership skills|people skills|presentation skills)\b[^\n]{0,160}$/gim, why: WHY.soft_skills, wholeLine: true },
  { kind: "chat_ask", re: /(,?\s*\band\s+)?\b(suggest|recommend|advise|tell me|let me know)\s+(me\s+)?(what|which|some|any|a few|good|other|possible|the best)\b[^.\n]*?(?=\s+and\s+(only\s+)?(males?|females?)\b|[.\n]|$)/gi, why: WHY.chat_ask },
  { kind: "chat_ask", re: /\b(can you|could you|please)\s+(help|share|send|give)\b[^.\n]*/gi, why: WHY.chat_ask },
];

/** Framing words that carry no search content ("I need to find a LinkedIn profile for …"). Dropped silently. */
const FRAMING: RegExp[] = [
  /\bi\s+(need|want)\s+to\s+find\s+(a\s+)?linkedin\s+profiles?\s+(for|of)\s+/gi,
  /\brefer\s+(to\s+)?the\s+jd\s+and\s+find\s+(all\s+)?suitable\s+candidates?\s+profiles?\s+for\s+this\s+position\s*/gi,
  /\bfind\s+(all\s+)?suitable\s+(candidates?|profiles?)\s*/gi,
];

function normalise(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/[–—−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, " ")
    .replace(/^[ \t]*[•●▪◦*·][ \t]*/gm, "")
    .replace(/\t+/g, " - ")
    .replace(/^\s*-\s+/gm, "")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function takeOut(text: string): { text: string; removed: RemovedItem[] } {
  const removed: RemovedItem[] = [];
  let t = text;
  for (const r of REMOVALS) {
    t = t.replace(r.re, (m) => {
      const clean = m.trim().replace(/^,?\s*and\s+/i, "");
      if (clean.length > 0) removed.push({ item: r.kind, text: clean.slice(0, 160), why: r.why });
      return r.wholeLine ? "" : " ";
    });
  }
  for (const f of FRAMING) t = t.replace(f, " ");
  t = t.replace(/[ ]{2,}/g, " ").replace(/\s+([,.])/g, "$1").replace(/,\s*,/g, ",").replace(/\n{2,}/g, "\n").trim();
  // One note per kind is enough for the TA; keep the first text of each.
  const seen = new Set<string>();
  const dedup = removed.filter((r) => (seen.has(r.item) ? false : (seen.add(r.item), true)));
  return { text: t, removed: dedup };
}

// ------------------------------------------------------------------------------------------
// 2. Read the fields.
// ------------------------------------------------------------------------------------------

/** Lines that are the TA's own instruction, not the JD. The TA's lines win over the JD. */
const TA_LINE = /^(only|must|look(ing)?\s+for|we\s+need|i\s+need|need|please|pls|find|search|with the designation|candidates?\s+(should|must)|prefer|not\s+from|exclude|excluding|except)\b/i;

function isCapsLine(l: string): boolean {
  const letters = l.replace(/[^A-Za-z]/g, "");
  if (letters.length < 8) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length > 0.75 && l.split(/\s+/).length >= 3;
}

function splitLines(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

const KV = /^(designation|position|job title|title|role|working location|location|work location|job location|based in|industry|experience|qualifications?|company|client|employer|organi[sz]ation)\s*[-:]\s*(.+)$/i;

function kv(lines: string[], key: RegExp): string | null {
  for (const l of lines) {
    const m = l.match(KV);
    if (m && key.test(m[1])) return m[2].trim();
  }
  return null;
}

function cleanCompany(s: string): string {
  return s
    .replace(/\((pvt|private)\)\s*(ltd|limited)\.?/gi, "")
    .replace(/\b(pvt|private)\.?\s*(ltd|limited)\.?|\b(plc|ltd|limited|inc|llc)\.?$/gi, "")
    .replace(/['’]s$/, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[,.\-]+$/, "")
    .trim();
}

function stripCountrySuffix(s: string): string {
  const words = s.split(/\s+/);
  if (words.length > 1 && countryOf(words[words.length - 1])) return words.slice(0, -1).join(" ");
  return s;
}

/** The JD / opening title (first title-like line, "Designation - X", or "looking for an X to …"). */
function readTitle(lines: string[], full: string, opening?: SearchRequest["opening"]): { title: string | null; client: string | null; line: string | null } {
  if (opening?.title) return { title: opening.title, client: opening.client ?? null, line: null };
  const d = kv(lines, /designation|position|job title|^title$|^role$/i);
  if (d) return { title: d, client: null, line: lines.find((l) => l.includes(d)) ?? null };
  const looking = full.match(/\blooking for an?\s+([A-Za-z][^.,\n]{3,80}?)\s+(to|who|with|for|in|that|from|at)\b/i);
  if (looking && (levelsIn(looking[1]).length || PROFESSION_RE.test(looking[1]) || functionOf(looking[1]))) return { title: cutTitle(looking[1].trim()), client: null, line: null };
  const firstLines = lines.slice(0, 3).flatMap((x) => x.split(/(?<=[.!?])\s+(?=[A-Z])/));
  for (const l of firstLines.slice(0, 5)) {
    if (l.length > 160 || KV.test(l) || /^(overview|about|our client|key)/i.test(l)) continue;
    // "EHS MANAGER FOR Heavy manufacturing sector" → title before FOR.
    const forSplit = l.match(/^(.{3,60}?)\s+(for|in|from)\s+/i);
    let candidate = forSplit && (levelsIn(forSplit[1]).length || functionOf(forSplit[1])) ? forSplit[1] : l;
    // "Sri Lankans in the UAE, Quantity Surveyor for building projects, 8+ years" → the part that is a title.
    // "QS - building projects - SL - 5 to 8 yrs" → parts split on " - " too (when more than two parts).
    const dashParts = candidate.split(/\s+-\s+/);
    const parts = (dashParts.length > 2 ? dashParts : [candidate]).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);
    const titled = parts.find((x) => !SL_PEOPLE.test(x) && (levelsIn(x).length || PROFESSION_RE.test(x) || functionOf(x)));
    if (parts.length > 1 && titled) {
      const t = titled.match(/^(.{3,60}?)\s+(for|in|from|with)\s+/i);
      candidate = t && (levelsIn(t[1]).length || PROFESSION_RE.test(t[1]) || functionOf(t[1])) ? t[1] : titled;
      if (dashParts.length > 2) return { title: cutTitle(candidate), client: null, line: l };
    }
    if (!(levelsIn(candidate).length || PROFESSION_RE.test(candidate) || functionOf(candidate))) continue;
    // "Chief financial officer - Ananta Bangladesh" → title + client.
    const dash = candidate.match(/^(.+?)\s+-\s+(.+)$/);
    if (dash && !functionOf(dash[2]) && !levelsIn(dash[2]).length && !PROFESSION_RE.test(dash[2]) && dash[2].split(/\s+/).length <= 4) {
      return { title: dash[1].trim(), client: cleanCompany(stripCountrySuffix(dash[2].trim())), line: l };
    }
    return { title: cutTitle(candidate.replace(/[,.;]+$/, "").trim()), client: null, line: l };
  }
  return { title: null, client: null, line: null };
}

/** The request wants locals / another nationality / anyone (then the default "Sri Lankans" rule is not applied). */
const LOCALS = /\b(locals?|local\s+(candidates?|nationals?|people|hires?|talent)|any\s+nationality|all\s+nationalities|nationality\s*(-|:)?\s*(open|any)|(indian|bangladeshi|pakistani|nepali|filipino|emirati|qatari|saudi|omani|kuwaiti|bahraini|maldivian|vietnamese|indonesian|kenyan|ethiopian)s?(\s+nationals?)?)\b/i;

/** Filler words TAs mix in (Sinhala / Tamil "one needed" etc.) and nationality words — never part of a title. */
const FILLER = /\b(ekak|kenek|kenekwa|kenekva|oni|one|onna|onee|ona|venum|vendum|thevai|sri\s*lankans?|indians?|bangladeshis?|local|expats?)\b/gi;

/**
 * Keep the title part only: stop at digits / "only" / "with" / places, and drop trailing words that are not a
 * function ("FINANCE MANAGER APPAREL 8 YEARS ONLY IN SRI LANKA" → "Finance Manager").
 */
function cutTitle(t: string): string {
  let s = t.replace(FILLER, " ").replace(/\s{2,}/g, " ").trim();
  const stop = s.search(/\s(\d|only\b|with\b|having\b|who\b|in\s+(sri|the|a)\b|at\b)/i);
  if (stop > 0) s = s.slice(0, stop);
  if (s.includes(" - ")) return s.trim();
  const words = s.split(/\s+/);
  let last = -1;
  words.forEach((w, i) => {
    if (levelsIn(w).length || PROFESSION_RE.test(w) || /^(manager|executive|engineer|officer|head|director|surveyor)s?$/i.test(w)) last = i;
  });
  if (last >= 0 && last < words.length - 1) {
    const rest = words.slice(last + 1).join(" ");
    if (!functionOf(rest) && !/^(of|&|and)\b/i.test(rest) && (industryOf(rest) || placesIn(rest).length || /^(company|companies|sector|industry|role|position|job)$/i.test(rest))) {
      s = words.slice(0, last + 1).join(" ");
    }
  }
  return s.trim();
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(And|Of|In|For|The|At|To)\b/g, (w) => w.toLowerCase())
    .replace(/\b(Ehs|Hse|Hr|It|Pv|Qs|Gm|Agm|Dgm|Cfo|Ceo|Coo|Cmo|Vp|Capex|Fmcg|Uae)\b/g, (w) => w.toUpperCase());
}

function tidyTitle(t: string): string {
  let s = t.replace(FILLER, " ").replace(/^(?:i\s+|we\s+)?(?:need|want|looking for|require|hiring|find)\s+(?:an?\s+)?/i, "").replace(/\s*-\s*/g, " - ").replace(/\s{2,}/g, " ").trim();
  // Shouting titles → title case; normal case is kept. Shouted single words ("EXECUTIVE") too.
  if (isCapsLine(s) || s === s.toUpperCase()) s = titleCase(s);
  s = s.replace(/\b[A-Z]{4,}\b/g, (w) => (/^(CAPEX|OPEX|FMCG|NEBOSH)$/.test(w) ? w : titleCase(w)));
  s = expandShortForms(s);
  // Titles keep EHS / HSE short (the long form is for the query text).
  s = s.replace(/\s*\((CEO|COO|CFO|CMO|CTO|MD|GM|VP|HOD|AGM|DGM)\)/gi, "");
  return s.replace(/EHS \(Environment, Health & Safety\)/g, "EHS").replace(/HSE \(Health, Safety & Environment\)/g, "HSE");
}

// ---- Years -------------------------------------------------------------------------------

type YearsHit = { min: number | null; max: number | null; area: string | null; ta: boolean; strong: boolean };

const YEARS_RANGE = /(\d{1,2})\s*(?:years?\s*)?(?:-|to)\s*(\d{1,2})\s*\+?\s*years?/i;
const YEARS_MIN = /(?:(?:minimum|min\.?|at least|over|more than|above)\s+(?:of\s+)?)?(\d{1,2})\s*(\+|plus)?\s*years?/i;

function readYears(lines: string[], taLines: Set<string>): YearsHit[] {
  const hits: YearsHit[] = [];
  for (const l of lines) {
    const x = expandShortForms(l);
    if (!/\byears?\b/i.test(x) || /\byears?\s+(old|of age)\b/i.test(x)) continue;
    let min: number | null = null;
    let max: number | null = null;
    let end = 0;
    const r = x.match(YEARS_RANGE);
    if (r) {
      min = +r[1];
      max = +r[2];
      end = (r.index ?? 0) + r[0].length;
    } else {
      const m = x.match(YEARS_MIN);
      if (!m) continue;
      min = +m[1];
      end = (m.index ?? 0) + m[0].length;
      if (/\b(below|under|less than|up to|maximum|max)\s+$/i.test(x.slice(0, m.index))) {
        max = min;
        min = null;
      }
    }
    if ((min ?? 0) > 45 || (max ?? 0) > 45) continue;
    const after = x.slice(end);
    const areaM = after.match(/^\s*(?:of\s+)?(?:relevant\s+|hands[- ]on\s+|industry\s+|working\s+|post[- ]qualification\s+|total\s+)?(?:experience|exp)?\s*(?:in|with|within|of)\s+(?:the\s+)?(?!relevant\b|experience\b|exp\b)([^.;\n]{3,120})/i);
    hits.push({ min, max, area: areaM ? areaM[1].trim() : null, ta: taLines.has(l), strong: isCapsLine(l) || /^(must|only)\b|\b(must have|only)\b/i.test(l) });
  }
  return hits;
}

/** Short area name for the "years in an area" column, only for real areas (solar, activewear…). */
function areaName(area: string | null, industryKey: string | null): string | null {
  if (!area) return null;
  for (const [k, re] of Object.entries(AREA_KEYWORDS)) {
    if (re.test(area)) {
      if (k === "solar" || (k === "renewable" && /solar/i.test(area))) return "solar PV";
      if (k === "capex") return "CAPEX / investment evaluation";
      return k;
    }
  }
  if (industryKey && /\b(industry|sector)\b/i.test(area)) return null;
  return null;
}

// ---- Location ----------------------------------------------------------------------------

const SL_PEOPLE = /\bsri\s*lankans?\b/i;
const ANYWHERE = /\b(anywhere|any country|worldwide|globally|either in sri lanka or|in sri lanka or (any(where)?\s+)?(outside|abroad|overseas)|sri lanka or abroad|sri lanka and (outside|abroad|overseas))\b/i;
const OVERSEAS = /\b(overseas|abroad|foreign|outside sri lanka|expats?)\b/i;
const EXPLICIT_LOC = /\b(only\s+(in|from)|profiles?\s+only\s+from|based\s+in|living\s+in|lives\s+in|resid\w+\s+in|located\s+in|from)\s+(the\s+)?([A-Za-z ]{3,30})/i;

type LocRead = {
  country: string | null;
  city: string | null;
  studiedIn: string | null;
  named: string[];
  sriLankansReadAsHome: boolean;
  overseasNoCountry: boolean;
  notes: string[];
};

function readLocation(text: string, lines: string[], taText: string, opening?: SearchRequest["opening"]): LocRead {
  const notes: string[] = [];
  const out: LocRead = { country: null, city: null, studiedIn: null, named: [], sriLankansReadAsHome: false, overseasNoCountry: false, notes };
  const slPeople = SL_PEOPLE.test(text);

  // Sri Lankans abroad: "Sri Lankans in the UAE", "Sri Lankans overseas".
  // "Sri Lankans … either in Sri Lanka or anywhere outside" → Sri Lankans in any country (owner's CEO request, 26 Nov).
  if (SL_PEOPLE.test(text) && ANYWHERE.test(text)) {
    out.studiedIn = HOME_COUNTRY;
    out.named = ["Sri Lankans anywhere (Sri Lanka or abroad)"];
    out.notes.push("Searching Sri Lankans anywhere: living in Sri Lanka, or abroad and studied in Sri Lanka (never guessed from names).");
    return out;
  }
  const lineWithSl = lines.filter((l) => SL_PEOPLE.test(l));
  for (const l of lineWithSl) {
    const abroad = placesIn(l).filter((p) => p.country !== HOME_COUNTRY);
    if (abroad.length) {
      out.country = abroad[0].country;
      out.city = abroad[0].isCity ? titleCase(abroad[0].word) : null;
      out.studiedIn = HOME_COUNTRY;
      out.named = [...new Set(abroad.map((p) => `Sri Lankans in ${p.country}`))];
      if (/\bsri\s*lanka\b(?!ns?)/i.test(l.replace(SL_PEOPLE, ""))) out.named.unshift(HOME_COUNTRY);
      out.notes.push(`Searching people who live in ${out.country} and studied in Sri Lanka (not guessed from names).`);
      return out;
    }
    if (OVERSEAS.test(l)) {
      out.overseasNoCountry = true;
      out.named.push("Sri Lankans overseas (country not named)");
      if (/\bsri\s*lanka\b(?!ns?)/i.test(l.replace(SL_PEOPLE, ""))) out.named.unshift(HOME_COUNTRY);
    }
  }

  // "Sri Lanka / overseas", "Sri Lanka or overseas", "local or abroad" → two locations (no "Sri Lankans" needed).
  if (!out.overseasNoCountry && /\b(sri lanka|local(ly)?)\s*(\/|\bor\b|\band\b)\s*(overseas|abroad)\b|\b(overseas|abroad)\s*(\/|\bor\b|\band\b)\s*(sri lanka|local(ly)?)\b|\b(based|living|located|candidates?)\s+(overseas|abroad)\b/i.test(text)) {
    out.overseasNoCountry = true;
    out.named = [HOME_COUNTRY, "overseas (country not named)"];
  }

  // Explicit TA instruction: "only in Sri Lanka", "profiles only from Sri Lanka".
  const explicit = taText.match(EXPLICIT_LOC);
  let explicitCountry: string | null = null;
  if (explicit) {
    const ps = placesIn(explicit[4]);
    if (ps.length) explicitCountry = ps[0].country;
  }

  // Job location lines ("Location - Waradala, Sri Lanka", "Working Location - Corporate Office - Colombo").
  const locLine = opening?.location ?? kv(lines, /location|based in/i);
  const locPlaces = locLine ? placesIn(locLine) : [];
  let city: string | null = null;
  let jobCountry: string | null = null;
  if (locLine) {
    const cityHit = locPlaces.find((p) => p.isCity);
    if (cityHit) city = titleCase(cityHit.word);
    jobCountry = locPlaces[0]?.country ?? null;
    if (!city) {
      // Unknown town before a country: "Waradala, Sri Lanka".
      const m = locLine.match(/([A-Z][a-z]+)\s*,\s*([A-Za-z ]+)$/);
      if (m && countryOf(m[2])) {
        city = m[1];
        jobCountry = countryOf(m[2]);
      }
    }
  }

  const allPlaces = placesIn(text);
  const firstCountry = allPlaces[0]?.country ?? null;
  if (!city) {
    // "knitwear, Katunayake" — a town named anywhere is where the person should live (never the company HQ).
    const c = allPlaces.find((p) => p.isCity && !/\b(head office|hq|headquarter)/i.test(text.slice(Math.max(0, p.at - 30), p.at)));
    if (c) city = titleCase(c.word);
  }

  if (out.overseasNoCountry) {
    // Keep home as the default; the check asks where.
    out.country = HOME_COUNTRY;
    return out;
  }

  // A job abroad while the TA asks for Sri Lankans → person location is open; the job place is not the person's.
  out.country = explicitCountry ?? (slPeople ? HOME_COUNTRY : null) ?? jobCountry ?? firstCountry;
  if (!explicitCountry && slPeople && !jobCountry && !allPlaces.some((p) => p.country === HOME_COUNTRY)) {
    out.sriLankansReadAsHome = true;
  }
  if (out.country && (out.country === jobCountry || !jobCountry)) out.city = city;
  else if (city) out.notes.push(`Job is in ${city}; searching people who live in ${out.country}.`);
  if (jobCountry && out.country && jobCountry !== out.country) out.notes.push(`Job location (${jobCountry}) is not used as the person's location.`);
  out.named = [...new Set([out.country].filter(Boolean) as string[])];
  // Two different person countries named in the TA's own lines ("Sri Lanka / overseas", "Sri Lanka or India").
  const taCountries = [...new Set(placesIn(taText).map((p) => p.country))];
  if (!explicitCountry && taCountries.length > 1 && /\b(or|\/)\b|\//.test(taText)) out.named = taCountries;
  return out;
}

// ---- Industry, must-haves, nice-to-haves, exclusions ---------------------------------------

const REQUIREMENT_LINE = /\b(experience|background|from|within|in the|working (in|at|for))\b[^\n]{0,80}\b(industry|sector|companies|company|firms?|groups?|manufactur\w*|installations?|projects?)\b/i;
const NICE_LINE = /^(exposure to|preferred|desirable|advantage|an advantage|is a plus|nice to have|working knowledge|knowledge of|familiarity)/i;
const MUST_LINE = /\b(essential|mandatory|must have|must|required|is a must|only)\b/i;
const EDUCATION_LINE = /\b(degree|diploma|bsc|b\.sc|msc|hnd|nvq|bachelor'?s?|master'?s?|graduate of|a\/l|o\/l)\b/i;

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cleanMust(l: string): string | null {
  let s = l
    .replace(/^(only|must have|must|need|we need)\s+/i, "")
    .replace(/\b(is|are)\s+(essential|mandatory|required|a must)\b\.?/i, "")
    .replace(/\b(only|profiles?)\b\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[.,;:]+$/, "");
  if (s.length < 2) return null;
  if (isCapsLine(s) || s === s.toUpperCase()) s = s.toLowerCase();
  if (!/\b(experience|exposure|knowledge)\b/i.test(s) && s.split(/\s+/).length <= 4) s = `${s} experience`;
  return capFirst(s);
}

function readExclusions(text: string, client: string | null, req: SearchRequest): string[] {
  const out: string[] = [];
  if (client) out.push(client);
  const kvClient = kv(splitLines(text), /^(company|client|employer|organi[sz]ation)$/i);
  // "COMPANY : Leading Apparel Manufacturing – Activewear …" is a description of a hidden client, not a name.
  if (kvClient && !/^(leading|a|an|reputed|well[- ]known|large|top|our client|confidential|prestigious|renowned|one of)\b/i.test(kvClient)) out.push(cleanCompany(kvClient));
  if (req.opening?.client) out.push(cleanCompany(req.opening.client));
  for (const m of text.matchAll(/\bat\s+([A-Z][\w&.'’]*(?:\s+[A-Z&][\w&.'’]*){0,5})\s*\(?(?:[Pp]vt|PVT|[Pp]rivate)\)?\s*(?:[Ll]td|LTD|[Ll]imited)\b/g)) out.push(cleanCompany(m[1]));
  const NAME = "[A-Za-z][\\w&.'’-]*(?:\\s+[A-Z][\\w&.'’-]*){0,3}";
  // Case-sensitive on purpose: after the first word, a company name continues only with capitalised words.
  const KW = "[Nn]ot\\s+(?:at|from|in)|NOT\\s+(?:AT|FROM|IN)|[Ee]xclud\\w*|EXCLUD\\w*|[Ee]xcept|EXCEPT|[Oo]ther than|[Nn]o\\s+one\\s+from|[Aa]void|AVOID|[Nn]o|NO";
  const EXCL = new RegExp(`\\b(${KW})\\s+(${NAME}(?:\\s*(?:,|\\b(?:or|and|OR|AND)\\b|\\/)\\s*${NAME})*)`, "g");
  const STOP = /^(experience|exp|years?|any|the|group|companies|company|one|more|less|need|travel|salary|objection|limit|other|candidates?|people|profiles?|freshers?|graduates?)$/i;
  for (const m of text.matchAll(EXCL)) {
    const weak = /^(no|avoid|except)$/i.test(m[1]);
    // The names must end the clause ("avoid Big 4 audit profiles" is not a company list).
    const after = text.slice((m.index ?? 0) + m[0].length).split(/[,.;\n]/)[0].replace(/\([^)]*\)/g, "").trim();
    if (after && !/^(group companies|companies|group|or (any|their) group companies)?$/i.test(after)) continue;
    for (let c of m[2].split(/\s*(?:,|\bor\b|\band\b|\/)\s*/)) {
      c = c.trim().replace(/\s+(group|companies|company)$/i, "");
      if (!c || STOP.test(c) || STOP.test(c.split(/\s+/)[0]) || countryOf(c) || placesIn(c).length) continue;
      const properName = /^[A-Z]/.test(c) && (c.split(/\s+/).length > 1 || !industryOf(c));
      if (levelsIn(c).length || PROFESSION_RE.test(c) || (!properName && (functionOf(c) || industryOf(c)))) continue;
      if (weak && !/^[A-Z]/.test(c)) continue;
      // Lower-case names: short ones are acronyms ("mas" → "MAS"), longer ones title case.
      if (c === c.toLowerCase()) c = c.length <= 4 ? c.toUpperCase() : titleCase(c);
      out.push(cleanCompany(c));
    }
  }
  for (const c of req.offLimits ?? []) out.push(cleanCompany(c));
  const seen = new Set<string>();
  return out.filter((c) => c && !countryOf(c) && !seen.has(c.toLowerCase()) && (seen.add(c.toLowerCase()), true));
}

function readSplitRoles(text: string): string[] {
  // "a Finance Manager and an HR Manager" (two titles, each with its own article).
  const two = text.match(/\ban?\s+([A-Za-z][\w&]*(?:\s+[A-Za-z][\w&]*){0,3}?)\s+(?:and|&)\s+an?\s+([A-Za-z][\w&]*(?:\s+[A-Za-z][\w&]*){0,3}?)(?=[,.\n]|\s+(?:for|in|at|from|with)\b|$)/i);
  const isTitle = (x: string) => !!(levelsIn(x).length || PROFESSION_RE.test(x));
  if (two && isTitle(two[1]) && isTitle(two[2])) return [tidyTitle(two[1]), tidyTitle(two[2])];
  const m = text.match(/\b(\d+|one|two|three)\s+([a-z][a-z ]{2,40}?)\s+(?:and|&|,)\s+(\d+|one|two|three)\s+([a-z][a-z ]{2,40}?)(?=[,.\n]|\s+(?:for|in|at|from|with)\b|$)/i);
  if (!m) return [];
  const a = m[2].trim().replace(/s$/i, "");
  const b = m[4].trim().replace(/s$/i, "");
  return a.toLowerCase() === b.toLowerCase() ? [] : [titleCase(a), titleCase(b)];
}

// ---- Titles -------------------------------------------------------------------------------

const LEVEL_TITLE: Record<Level, (core: string) => string[]> = {
  trainee: (c) => [`${c} Trainee`],
  executive: (c) => (/(engineer|surveyor|analyst|accountant|merchandiser|planner)$/i.test(c) ? [c, `Assistant ${c}`] : [`${c} Executive`]),
  senior_executive: (c) => (/(engineer|surveyor|analyst|accountant|merchandiser|planner)$/i.test(c) ? [`Senior ${c}`] : [`Senior ${c} Executive`]),
  assistant_manager: (c) => [`Assistant Manager ${c}`],
  manager: (c) => [`${c} Manager`],
  senior_manager: (c) => [`Senior ${c} Manager`],
  agm: (c) => [`AGM ${c}`],
  dgm: (c) => [`DGM ${c}`],
  gm: (c) => [`General Manager ${c}`, `Head of ${c}`],
  director: (c) => [`Director of ${c}`],
  c_level: (c) => (/finance/i.test(c) ? ["Chief Financial Officer"] : /operations|manufacturing/i.test(c) ? ["Chief Operating Officer"] : [`Chief ${c} Officer`]),
};

/** CEO / COO / MD / VP titles inside the level window, plus "VP / Director <X>" for the backgrounds the TA names. */
function generalTitles(low: Level, high: Level, sideText: string): string[] {
  const inWin = (l: Level) => levelIndex(l) >= levelIndex(low) && levelIndex(l) <= levelIndex(high);
  const out: string[] = [];
  if (inWin("c_level")) out.push("Chief Executive Officer", "Chief Operating Officer", "Managing Director");
  const sides = ["Operations", ...FUNCTIONS.filter((x) => x.key !== "general_management" && x.key !== "planning" && x.words.test(sideText)).map((x) => x.core[0])];
  if (inWin("director")) for (const s of [...new Set(sides)].slice(0, 4)) out.push(`Vice President ${s}`, `Director of ${s}`);
  if (inWin("gm")) out.push("General Manager Operations");
  return out;
}

function closeTitles(role: string, fnKey: string, low: Level | null, high: Level | null, taTitles: string[], sideText = ""): string[] {
  const out = [role, ...taTitles];
  const fn = FUNCTIONS.find((f) => f.key === fnKey);
  if (fnKey === "general_management" && low && high) out.push(...generalTitles(low, high, sideText));
  else if (fn && low && high) {
    const span = LEVELS.slice(levelIndex(low), levelIndex(high) + 1).slice(0, 4);
    for (const lvl of span) {
      for (const core of fn.core.slice(0, 2)) out.push(...LEVEL_TITLE[lvl](core.replace(/\s+Engineer$/, " Engineer")));
      for (const side of fn.side ?? []) out.push(...LEVEL_TITLE[lvl](side).slice(0, 1));
    }
  }
  const seen = new Set<string>();
  return out
    .map((t) => t.replace(/\s{2,}/g, " ").trim())
    .filter((t) => t && !seen.has(t.toLowerCase()) && (seen.add(t.toLowerCase()), true))
    .slice(0, MAX_TITLES);
}

function readTaTitles(taLines: string[]): string[] {
  const out: string[] = [];
  for (const l of taLines) {
    const des = l.match(/\bdesignation of\s+(.+?)(?:\s+(?:from|at|in|with)\s+|$)/i);
    if (des) out.push(...des[1].split(/\s+or\s+|\s*\/\s*|,\s*/i).map((s) => tidyTitle(s.trim())).filter(Boolean));
  }
  return out;
}

/** Standalone title lines (a list of titles the TA typed). */
function readTitleList(lines: string[]): string[] {
  return lines
    .filter((l) => l.length <= 45 && !TA_LINE.test(l) && !/[.:;]$/.test(l) && l.split(/\s+/).length <= 5 && !KV.test(l))
    .filter((l) => (levelsIn(l).length || PROFESSION_RE.test(l)) && !/\b(and|the|with|to|for)\b.*\b(and|the|with|to|for)\b/i.test(l))
    .map(tidyTitle);
}

// ------------------------------------------------------------------------------------------
// 3. Put it together.
// ------------------------------------------------------------------------------------------

function emptyForm(): StandardForm {
  return {
    type: "by_role", role: "", function: "", titles: [], levelLow: null, levelHigh: null,
    location: { country: null, city: null, studiedIn: null }, totalYears: null, areaYears: null,
    industry: null, notIndustries: [], companySize: null, mustHaves: [], niceToHaves: [], suggestedMustHaves: [], aiMustHaves: [], excludeCompanies: [],
    currentCompanies: [], qualifications: [], count: RESULTS_PER_SEARCH, extraRules: [], removed: [], notes: [],
    signals: {
      jdTitleLevel: null, jdTitle: null, locationsNamed: [], jdIndustryHint: null, taIndustryHint: null, splitRoles: [],
      freshGraduate: false, extraMustHaves: [], yearsFromJd: null, yearsFromTa: null, client: null,
      sriLankansReadAsHome: false, locationDefault: null, localsAsked: false, overseasNoCountry: false, onlyCompaniesNamed: false, chars: 0,
    },
  };
}

/** Levels whose usual years cover the middle of a years range (used when the title has no level word). */
function levelsForYears(y: YearsRange): [Level, Level] | null {
  const lo = y.min ?? (y.max != null ? Math.max(0, y.max - 3) : null);
  const hi = y.max ?? (y.min != null ? y.min + 5 : null);
  if (lo == null || hi == null) return null;
  const fits = LEVELS.filter((l) => {
    const [a, b] = LEVEL_YEARS[l];
    return a <= hi && b >= lo && l !== "trainee" && l !== "c_level" && l !== "director";
  });
  // Keep the two that fit best (closest typical middle).
  const mid = (lo + hi) / 2;
  const best = fits
    .map((l) => ({ l, d: Math.abs((LEVEL_YEARS[l][0] + LEVEL_YEARS[l][1]) / 2 - mid) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 2)
    .map((x) => x.l)
    .sort((a, b) => levelIndex(a) - levelIndex(b));
  return best.length ? [best[0], best[best.length - 1]] : null;
}

/** The rule layer. Deterministic; no outside calls. */
export function formFromRules(req: SearchRequest): StandardForm {
  const f = emptyForm();
  f.type = req.type ?? "by_role";
  const raw = [req.opening?.jd, req.text].filter(Boolean).join("\n");
  const norm0 = normalise(raw);
  // "(CMO role, Bangladesh)" → context for the TA, not a level or a place.
  let norm = norm0.replace(/\(([^()]*\brole\b[^()]*)\)/gi, (_m, inner) => {
    f.notes.push(`Context: ${inner.trim()} (not searched).`);
    return " ";
  });
  const taNote = req.taNote ? normalise(req.taNote) : "";
  f.signals.chars = norm.length + taNote.length;

  // Qualifications are read before anything is removed, from the whole text.
  const allText = `${norm}\n${taNote}`;
  f.qualifications = [...new Set([...allText.matchAll(QUAL_RE)].map((m) => m[1].toUpperCase()))].sort();

  const { text: kept0, removed } = takeOut(norm);
  const { text: taKept0, removed: taRemoved } = takeOut(taNote);
  // Short forms everywhere ("QS", "SL", "yrs", "exp"), so two wordings of one need read the same.
  const kept = expandShortForms(kept0);
  const taKept = expandShortForms(taKept0);
  f.removed = [...removed, ...taRemoved.filter((r) => !removed.some((x) => x.item === r.item))];

  const lines = splitLines(kept);
  const short = kept.length + taKept.length < 300;
  const taLineList = [...splitLines(taKept), ...lines.filter((l) => short || TA_LINE.test(l) || isCapsLine(l))];
  const taSet = new Set(taLineList);

  // Title and client.
  const { title: jdTitleRaw, client, line: titleLine } = readTitle(lines, kept, req.opening);
  const jdTitle = jdTitleRaw ? tidyTitle(jdTitleRaw) : null;
  f.signals.jdTitle = jdTitle;
  f.signals.client = client;

  // The TA's own text, without the title line (so "CFO - client" does not count as the target).
  const taText = taLineList
    .map((l) => (titleLine && l === titleLine ? l.replace(jdTitleRaw ?? "", " ") : l))
    .join("\n");

  const titleList = readTitleList(lines.filter((l) => l !== titleLine));
  const taTitles = [...readTaTitles(taLineList), ...titleList];

  // Function.
  const fn = functionOf(jdTitle ?? "") ?? functionOf(taTitles.join(" ")) ?? functionOf(taText) ?? functionOf(kept);
  f.function = fn?.key ?? "";

  // Years — the TA's line wins over the JD.
  const hits = readYears(lines.concat(splitLines(taKept)), taSet);
  const taHit = hits.find((h) => h.ta && h.strong) ?? hits.find((h) => h.ta);
  const jdHit = hits.find((h) => !h.ta);
  f.signals.yearsFromTa = taHit ? { min: taHit.min, max: taHit.max } : null;
  f.signals.yearsFromJd = jdHit ? { min: jdHit.min, max: jdHit.max } : null;
  const yHit = taHit ?? jdHit ?? null;

  // Industry — TA line first, JD requirement lines second. "no prior banking experience needed" is not an industry.
  const NEG = /\b(no|not|without|non)[- ](?:prior |previous |any )?[^,.;\n]*/gi;
  const taInd = industryOf(taText.replace(NEG, " "));
  const reqLines = lines.filter((l) => !taSet.has(l) && !NICE_LINE.test(l) && (REQUIREMENT_LINE.test(l) || l === titleLine || /\blooking for\b/i.test(l)) && !(client && l.includes(client)));
  const jdInd = industryOf(reqLines.join("\n").replace(NEG, " ")) ?? (jdTitle ? industryOf(jdTitle) : null);
  f.signals.taIndustryHint = taInd?.key ?? null;
  f.signals.jdIndustryHint = jdInd?.key ?? null;
  const ind = taInd ?? jdInd;
  if (ind) {
    f.industry = ind.name;
    f.notIndustries = [...ind.not];
    // Activewear named with apparel/merch/manufacturing → keep the more specific industry.
  }

  // Years in an area vs total years.
  if (yHit) {
    const area = areaName(yHit.area, ind?.key ?? null);
    if (area) f.areaYears = { area, min: yHit.min, max: yHit.max };
    else f.totalYears = { min: yHit.min, max: yHit.max };
    // A second, total line ("10+ years in total") next to an area line.
    const other = hits.find((h) => h !== yHit && !areaName(h.area, null));
    if (area && other && (other.ta || !yHit.ta)) f.totalYears = { min: other.min, max: other.max };
  }

  // Level — target level from the TA's lines; else the JD title; else from years.
  const taLevels = levelsIn(expandShortForms(taText).replace(/\b(Assistant General Manager|Deputy General Manager)\b/g, (m) => (m.startsWith("Assistant") ? "AGM" : "DGM")))
    .concat(taTitles.flatMap((t) => levelsIn(t)));
  const titleLevels = jdTitle ? levelsIn(jdTitle) : [];
  f.signals.jdTitleLevel = titleLevels.length ? titleLevels.sort((a, b) => levelIndex(b) - levelIndex(a))[0] : null;
  const pool = taLevels.length ? taLevels : titleLevels;
  if (pool.length) {
    const idx = pool.map(levelIndex);
    f.levelLow = LEVELS[Math.min(...idx)];
    f.levelHigh = LEVELS[Math.max(...idx)];
  } else if (yHit && (jdTitle ? PROFESSION_RE.test(jdTitle) : true)) {
    const lv = levelsForYears({ min: yHit.min, max: yHit.max });
    if (lv) {
      [f.levelLow, f.levelHigh] = lv;
      f.notes.push("Level read from the years asked for. Change it if needed.");
    }
  }
  if (taLevels.length && f.signals.jdTitleLevel && !taLevels.includes(f.signals.jdTitleLevel)) {
    f.notes.push(`JD title is "${jdTitle}". Searching the target level you asked for, not the JD title.`);
  }

  // Role (canonical): target-level title when the TA's target differs from the JD title.
  const coreTitle = fn?.core[0] ?? (jdTitle ? jdTitle.replace(/^(.*?)\s+-\s+/, "") : "");
  if (jdTitle && (!taLevels.length || taLevels.includes(f.signals.jdTitleLevel as Level))) f.role = jdTitle;
  else if (f.levelHigh && coreTitle) f.role = LEVEL_TITLE[f.levelHigh](coreTitle).slice(-1)[0];
  else f.role = jdTitle ?? taTitles[0] ?? "";
  f.titles = f.role ? closeTitles(f.role, f.function, f.levelLow, f.levelHigh, taTitles, taText) : taTitles.slice(0, MAX_TITLES);
  // A general role whose target is below C-level drops the C-level JD title ("COO JD, looking for GM / Directors").
  if (f.function === "general_management" && f.levelHigh && f.levelHigh !== "c_level") f.titles = f.titles.filter((t) => !/^chief\b/i.test(t));

  // Location.
  const loc = readLocation(kept + "\n" + taKept, lines.concat(splitLines(taKept)), taText, req.opening);
  f.location = { country: loc.country, city: loc.city, studiedIn: loc.studiedIn };
  f.signals.locationsNamed = loc.named;
  f.signals.sriLankansReadAsHome = loc.sriLankansReadAsHome;
  // Owner's rule (26 Nov): default is Sri Lanka or Sri Lankans; follow other places / nationalities only when asked.
  f.signals.localsAsked = LOCALS.test(norm0 + "\n" + (req.taNote ?? ""));
  if (!f.location.country && !f.location.studiedIn && !loc.overseasNoCountry) {
    f.location.country = HOME_COUNTRY;
    f.signals.locationDefault = "home";
    f.notes.push("No location given — searching people who live in Sri Lanka (default).");
  } else if (f.location.country && f.location.country !== HOME_COUNTRY && !f.location.studiedIn && !f.signals.localsAsked && f.type !== "india") {
    f.location.studiedIn = HOME_COUNTRY;
    f.signals.locationDefault = "sri_lankans_abroad";
    f.notes.push(`Searching Sri Lankans living in ${f.location.country} (default). Say "locals" to search everyone there.`);
  }
  f.signals.overseasNoCountry = loc.overseasNoCountry;
  f.notes.push(...loc.notes);

  // Company size.
  const size = allText.match(/\b(large|big|leading|top|tier[- ]?1|multinational)\s+(export\s+)?(groups?|companies|firms|organi[sz]ations|conglomerates|manufacturers)\b|\b\d[\d,]*\s*\+?\s*employees\b/i);
  if (size) f.companySize = size[0].toLowerCase();

  // Must-haves (max 3) and nice-to-haves.
  const musts: string[] = [];
  const taMusts: string[] = [];
  const nices: string[] = [];
  const isFieldLine = (l: string) =>
    /\byears?\b/i.test(expandShortForms(l)) && !/\b(experience in|exposure to)\b.*\b(and|,)\b/i.test(l) ? true : /\b(sri lanka|location|based|lives|overseas)\b/i.test(l) || SL_PEOPLE.test(l);
  // The TA's note is often one paragraph: read it sentence by sentence.
  const taSentences = taLineList.flatMap((x) => x.split(/(?<=[.!?])\s+(?=[A-Z])/));
  for (const x of taSentences) taSet.add(x);
  for (const l of [...taSentences, ...lines.filter((x) => !taSet.has(x))]) {
    if (l === titleLine || EDUCATION_LINE.test(l) || QUAL_RE.test(l) || (QUAL_RE.lastIndex = 0)) continue;
    if (NICE_LINE.test(l)) {
      if (l.split(/\s+/).length <= 4 || /:$/.test(l)) continue;
      nices.push(capFirst(l.replace(/[.;]+$/, "")));
      continue;
    }
    // "The main criteria here is they should be having activewear … experience" → the TA's must-have.
    const crit = taSet.has(l) ? l.match(/\b(?:main criteri\w*|key requirement|must)\b[^.]*?\b(?:should (?:be )?hav(?:e|ing)|must (?:have|be having)|is that they have|is)\s+([^.]{6,160})/i) : null;
    if (crit) {
      const m = cleanMust(crit[1].replace(/^(they|the person|candidates?)\s+(should\s+)?(be\s+)?(having|have)\s+/i, ""));
      if (m) taMusts.push(m);
      continue;
    }
    if (taSet.has(l) && /^only\b/i.test(l) && !isFieldLine(l) && !/designation/i.test(l)) {
      const m = cleanMust(l);
      if (m) musts.push(m);
    } else if (!taSet.has(l) && /\b(essential|mandatory|is a must|must have)\b/i.test(l) && !isFieldLine(l)) {
      const m = cleanMust(l);
      if (m) musts.push(m);
    }
  }
  // "3-5 years of experience in HV and LV systems, generators …" → the skill part is a must-have.
  if (yHit?.area && !f.areaYears && yHit.area.split(/\s+/).length >= 3 && !industryOf(yHit.area)) {
    musts.unshift(`Experience in ${yHit.area.replace(/\s+for this position.*$/i, "").replace(/[,.]+$/, "")}`);
  }
  // The TA's own criterion wins over a JD must-have on the same subject ("activewear").
  const MUST_STOP = /^(experience|strong|proven|hands|having|their|career|knowledge|ability|manufacturing|management)$/i;
  const keyWords = (m: string) => m.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 6 && !MUST_STOP.test(w));
  const taKeys = new Set(taMusts.flatMap(keyWords));
  const jdMusts = musts.filter((m) => !keyWords(m).some((w) => taKeys.has(w)));
  musts.splice(0, musts.length, ...taMusts, ...jdMusts);
  const seenM = new Set<string>();
  const uniqM = musts.filter((m) => !seenM.has(m.toLowerCase()) && (seenM.add(m.toLowerCase()), true));
  f.mustHaves = uniqM.slice(0, MAX_MUST);
  f.signals.extraMustHaves = uniqM.slice(MAX_MUST);
  f.niceToHaves = [...nices, ...uniqM.slice(MAX_MUST)].slice(0, 5);

  // Exclusions, split roles, fresh graduates, "only these companies".
  f.excludeCompanies = readExclusions(kept + "\n" + taKept, client, req);
  f.signals.splitRoles = readSplitRoles(kept + "\n" + taKept);
  f.signals.freshGraduate = /\b(fresh graduates?|management trainees?|graduate trainees?|undergraduates?|internship|no experience (needed|required)|0\s*-\s*1\s*years?)\b/i.test(allText);
  const onlyFrom = taText.match(/\bonly\s+(?:from|at)\s+([A-Z][\w&]*(?:\s+[A-Z][\w&]*)*)/);
  f.signals.onlyCompaniesNamed = !!onlyFrom && placesIn(onlyFrom[1]).length === 0;

  // Search types (section 3).
  applyType(f, req);

  if (req.edits) applyEdits(f, req.edits);
  return canonical(f);
}

function applyType(f: StandardForm, req: SearchRequest): void {
  switch (f.type) {
    case "by_company":
      f.currentCompanies = (req.companies ?? []).map(cleanCompany);
      f.excludeCompanies = f.excludeCompanies.filter((c) => !f.currentCompanies.some((x) => x.toLowerCase() === c.toLowerCase()));
      break;
    case "more_like_this": {
      const p = req.likePerson ?? {};
      if (p.title) {
        const t = tidyTitle(p.title);
        f.role = f.role || t;
        f.titles = [...new Set([t, ...f.titles])].slice(0, MAX_TITLES);
        const lv = levelsIn(t);
        if (lv.length && !f.levelLow) f.levelLow = f.levelHigh = lv[0];
        if (!f.function) f.function = functionOf(t)?.key ?? "";
      }
      if (p.industry && !f.industry) f.industry = industryOf(p.industry)?.name ?? p.industry;
      if (p.years != null && !f.totalYears) f.totalYears = { min: Math.max(0, p.years - 3), max: p.years + 3 };
      if (p.country && !f.location.country) f.location.country = countryOf(p.country) ?? p.country;
      const cos = [p.company, ...(p.companies ?? [])].filter(Boolean) as string[];
      if (cos.length) f.niceToHaves = [...new Set([...f.niceToHaves, `Worked at ${cos.map(cleanCompany).join(", ")} or similar companies`])];
      break;
    }
    case "sri_lankans_abroad":
      f.location.studiedIn = HOME_COUNTRY;
      if (f.location.country === HOME_COUNTRY) f.location.country = null;
      break;
    case "gulf_now_home":
      f.location = { country: HOME_COUNTRY, city: f.location.city, studiedIn: null };
      f.extraRules.push(`Has a past job in the Gulf (${GULF.join(", ")})`);
      break;
    case "ready_to_come_home":
      f.location.studiedIn = HOME_COUNTRY;
      if (f.location.country === HOME_COUNTRY) f.location.country = null;
      f.extraRules.push("Profile shows open to work");
      break;
    case "india":
      if (f.location.country !== "India") f.location = { country: "India", city: f.location.city, studiedIn: null };
      break;
    case "same_school":
      if (req.institution) f.extraRules.push(`Studied at, or is a member of, ${req.institution}`);
      break;
    case "languages":
      if (req.languages?.length) f.extraRules.push(`Profile lists the languages ${req.languages.join(", ")}`);
      break;
    case "ready_to_move":
      f.extraRules.push("3 or more years in the current job, or profile shows open to work");
      break;
    case "contract":
      f.extraRules.push("Employment type is contract, freelance or self-employed");
      break;
    case "boolean":
      fromBoolean(f, req.text ?? "");
      break;
    default:
      break;
  }
}

/** LinkedIn-style Boolean → form: quoted / OR'd phrases → titles; NOT terms → exclusions. */
function fromBoolean(f: StandardForm, text: string): void {
  const nots = [...text.matchAll(/\bNOT\s+(\([^)]*\)|"[^"]+"|\S+)/g)].map((m) => m[1].replace(/[()"]/g, ""));
  const positive = text.replace(/\bNOT\s+(\([^)]*\)|"[^"]+"|\S+)/g, " ");
  const phrases = [...positive.matchAll(/"([^"]+)"/g)].map((m) => tidyTitle(m[1]));
  const titles = phrases.filter((p) => levelsIn(p).length || PROFESSION_RE.test(p) || functionOf(p));
  if (titles.length) {
    f.titles = [...new Set([...titles, ...f.titles])].slice(0, MAX_TITLES);
    f.role = f.role || titles[0];
    if (!f.function) f.function = functionOf(titles.join(" "))?.key ?? "";
  }
  for (const n of nots.flatMap((x) => x.split(/\s+OR\s+/))) {
    const ind = industryOf(n);
    if (ind) f.notIndustries.push(ind.name);
    else if (/^[A-Z]/.test(n)) f.excludeCompanies.push(cleanCompany(n));
  }
}

/** Apply TA answers / edits (field → value). Used by the check loop and by refine(). */
export function applyEdits(f: StandardForm, edits: SearchRequest["edits"]): StandardForm {
  if (!edits) return f;
  for (const [k, v] of Object.entries(edits)) {
    if (v === undefined) continue;
    if (k === "location" && v && typeof v === "object") f.location = { ...f.location, ...(v as object) };
    else (f as Record<string, unknown>)[k] = v;
  }
  if (edits.mustHaves) f.aiMustHaves = f.aiMustHaves.filter((m) => edits.mustHaves!.includes(m));
  if (edits.levelLow || edits.levelHigh) f.notes = f.notes.filter((n) => !n.startsWith("Level read from"));
  if (edits.location) f.signals.sriLankansReadAsHome = false;
  return f;
}

/** Sort and trim everything that goes into the key, so word order never changes the search. */
function canonical(f: StandardForm): StandardForm {
  const uniq = (xs: string[]) => {
    const seen = new Set<string>();
    return xs.map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && (seen.add(x.toLowerCase()), true));
  };
  f.titles = uniq(f.titles).slice(0, MAX_TITLES);
  f.mustHaves = uniq(f.mustHaves).slice(0, MAX_MUST);
  f.niceToHaves = uniq(f.niceToHaves);
  f.notIndustries = uniq(f.notIndustries).sort();
  f.excludeCompanies = uniq(f.excludeCompanies).sort((a, b) => a.localeCompare(b));
  f.currentCompanies = uniq(f.currentCompanies).sort((a, b) => a.localeCompare(b));
  f.extraRules = uniq(f.extraRules);
  f.notes = uniq(f.notes);
  if (f.levelLow && f.levelHigh && levelIndex(f.levelLow) > levelIndex(f.levelHigh)) [f.levelLow, f.levelHigh] = [f.levelHigh, f.levelLow];
  f.count = f.count || RESULTS_PER_SEARCH;
  return f;
}

/** The parts of the form that decide the search. Same parts → same key. */
export function formKeyParts(f: StandardForm): unknown {
  const low = (s: string | null) => (s ?? "").trim().toLowerCase();
  return {
    type: f.type,
    function: f.function,
    titles: f.titles.map(low).sort(),
    level: [f.levelLow, f.levelHigh],
    location: [low(f.location.country), low(f.location.city), low(f.location.studiedIn)],
    years: f.totalYears ? [f.totalYears.min, f.totalYears.max] : null,
    area: f.areaYears ? [low(f.areaYears.area), f.areaYears.min, f.areaYears.max] : null,
    industry: low(f.industry),
    not: f.notIndustries.map(low).sort(),
    size: low(f.companySize),
    must: f.mustHaves.map(low).sort(),
    nice: f.niceToHaves.map(low).sort(),
    exclude: f.excludeCompanies.map(low).sort(),
    current: f.currentCompanies.map(low).sort(),
    extra: f.extraRules.map(low).sort(),
    count: f.count,
  };
}

/** Stable key: "c141-" + 40 hex. Used as the Crustdata Idempotency-Key and the saved-search key. */
export function formKey(f: StandardForm): string {
  return "c141-" + sha256Hex(JSON.stringify(formKeyParts(f))).slice(0, 40);
}

// ------------------------------------------------------------------------------------------
// 4. LLM layer (optional).
// ------------------------------------------------------------------------------------------

const LLM_SYSTEM = `You read a recruiter's request or a pasted job description and return ONE JSON object, nothing else.
Keys (use null or [] when not stated; never guess):
"role": the job title being hired, short forms expanded (e.g. "Quantity Surveyor");
"targetLevels": the seniority the recruiter wants to SEARCH, from their own lines first (e.g. ["AGM","DGM","GM"]); not salary;
"personCountry": where the PERSON should live (not the company's office, not the job abroad unless the recruiter says so);
"personCity": city if stated for the person or the job;
"totalYears": {"min":n|null,"max":n|null};
"areaYears": {"area":"solar PV","min":n,"max":n} only if years in a specific area are stated, else null;
"industry": the industry or company type the person should come from;
"notIndustries": look-alike industries to leave out (e.g. fabric mills vs garment makers);
"mustHaves": up to 3 hard skills or experience items that are truly required (no soft skills, no degrees, no salary, no gender, no age, no nationality, no years, no location);
"niceToHaves": up to 3 preferred items;
"excludeCompanies": the client company and companies the recruiter says to leave out.`;

type LlmDraft = {
  role?: string | null;
  targetLevels?: string[] | null;
  personCountry?: string | null;
  personCity?: string | null;
  totalYears?: { min: number | null; max: number | null } | null;
  areaYears?: { area: string; min: number | null; max: number | null } | null;
  industry?: string | null;
  notIndustries?: string[] | null;
  mustHaves?: string[] | null;
  niceToHaves?: string[] | null;
  excludeCompanies?: string[] | null;
};

function parseJson(s: string): LlmDraft | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as LlmDraft;
  } catch {
    return null;
  }
}

/**
 * Rules first, then the LLM fills only what the rules left empty. Removed items, the TA's own lines
 * and the location the rules found always win. Falls back to rules only when the LLM fails.
 */
/** Saved LLM answers by text, so the same JD always gives the same form (wire to a Convex table). */
export type LlmCache = { get(key: string): Promise<string | null> | string | null; set(key: string, value: string): Promise<void> | void };
const memoryLlmCache = new Map<string, string>();
export const defaultLlmCache: LlmCache = { get: (k) => memoryLlmCache.get(k) ?? null, set: (k, v) => void memoryLlmCache.set(k, v) };

export async function extractForm(req: SearchRequest, deps: { llm?: Llm; cache?: LlmCache } = {}): Promise<StandardForm> {
  const ruled = formFromRules(req);
  if (!deps.llm) return ruled;
  const gaps = !ruled.role || !ruled.function || !ruled.industry || ruled.mustHaves.length === 0 || (!ruled.totalYears && !ruled.areaYears) || !ruled.location.country;
  if (!gaps) return ruled;
  let draft: LlmDraft | null = null;
  try {
    // Send the cleaned text only: removed items (salary, gender…) never reach the model either.
    const cleaned = takeOut(normalise([req.opening?.jd, req.text, req.taNote].filter(Boolean).join("\n"))).text.slice(0, 8000);
    const cache = deps.cache ?? defaultLlmCache;
    const ck = "llm-form-" + sha256Hex(cleaned.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()).slice(0, 32);
    let answer = await cache.get(ck);
    if (answer == null) {
      answer = await deps.llm({ system: LLM_SYSTEM, user: cleaned, maxTokens: 700 });
      if (parseJson(answer)) await cache.set(ck, answer);
    }
    draft = parseJson(answer);
  } catch {
    draft = null;
  }
  if (!draft) {
    ruled.notes.push("Form read by rules only (the AI reader was not available).");
    return ruled;
  }
  const f = ruled;
  if (!f.role && draft.role) {
    f.role = tidyTitle(draft.role);
    f.function = f.function || functionOf(f.role)?.key || "";
  }
  if (!f.levelLow && draft.targetLevels?.length) {
    const lv = levelsIn(draft.targetLevels.join(" / "));
    if (lv.length) {
      const idx = lv.map(levelIndex);
      f.levelLow = LEVELS[Math.min(...idx)];
      f.levelHigh = LEVELS[Math.max(...idx)];
    }
  }
  if (!f.location.country && draft.personCountry) f.location.country = countryOf(draft.personCountry) ?? draft.personCountry;
  if (!f.location.city && draft.personCity && countryOf(draft.personCity) === f.location.country) f.location.city = titleCase(draft.personCity);
  if (!f.totalYears && !f.areaYears && draft.totalYears && (draft.totalYears.min != null || draft.totalYears.max != null)) f.totalYears = draft.totalYears;
  // Area only when it maps to a known area name (fixed words → stable key).
  const area = draft.areaYears?.area ? areaName(draft.areaYears.area, null) : null;
  if (!f.areaYears && area && draft.areaYears) f.areaYears = { area, min: draft.areaYears.min, max: draft.areaYears.max };
  // Industry only when it maps to a known industry (fixed words → stable key).
  if (!f.industry && draft.industry) {
    const ind = industryOf(draft.industry);
    // Not the client's own industry: the words must appear outside the lines that name the client.
    const client = f.signals.client ?? f.excludeCompanies[0] ?? null;
    const outside = (req.text ?? "").split("\n").filter((l) => !client || !l.toLowerCase().includes(client.toLowerCase().split(/\s+/)[0])).join("\n");
    if (ind && ind.words.test(outside)) {
      f.industry = ind.name;
      f.notIndustries = [...ind.not];
    }
  }
  // Free-text items vary from run to run, so they are suggestions for the TA, not search rules.
  const ok = (m: string) =>
    !takeOut(m).removed.length && !(QUAL_RE.test(m) || (QUAL_RE.lastIndex = 0)) && !EDUCATION_LINE.test(m) && !/\b(client|not named)\b/i.test(m);
  // Owner (26 Nov): AI must-haves are added to the search up to 3 in all; the TA removes any she does not want.
  // The AI answer is kept per text (LlmCache), so the same JD still gives the same form and key.
  const fromAi = (draft.mustHaves ?? []).filter(ok).map(capFirst).filter((m) => !f.mustHaves.some((x) => x.toLowerCase() === m.toLowerCase()));
  const room = Math.max(0, MAX_MUST - f.mustHaves.length);
  f.aiMustHaves = fromAi.slice(0, room);
  f.mustHaves = [...f.mustHaves, ...f.aiMustHaves];
  f.suggestedMustHaves = fromAi.slice(room, room + 5);
  const named = (draft.excludeCompanies ?? []).map(cleanCompany).filter((c) => c && !/\b(client|not named|unnamed)\b/i.test(c) && new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(req.text ?? ""));
  if (named.length) f.excludeCompanies = [...f.excludeCompanies, ...named];
  f.titles = closeTitles(f.role, f.function, f.levelLow, f.levelHigh, f.titles);
  return canonical(f);
}

/** Change one field and say what changed (refine, don't restart). */
export function refineForm(f: StandardForm, edits: NonNullable<SearchRequest["edits"]>): { form: StandardForm; changed: string[] } {
  const next = structuredClone(f);
  applyEdits(next, edits);
  canonical(next);
  const a = formKeyParts(f) as Record<string, unknown>;
  const b = formKeyParts(next) as Record<string, unknown>;
  const changed = Object.keys(b).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  return { form: next, changed };
}

/** "Widen": loosen one field (nearby title, next industry, nearby city, ±2 years, next level). */
export function widenForm(f: StandardForm, field: "level" | "years" | "city" | "industry" | "titles"): { form: StandardForm; changed: string[] } {
  const e: NonNullable<SearchRequest["edits"]> = {};
  if (field === "level" && f.levelLow && f.levelHigh) {
    e.levelLow = LEVELS[Math.max(0, levelIndex(f.levelLow) - 1)];
    e.levelHigh = LEVELS[Math.min(LEVELS.length - 1, levelIndex(f.levelHigh) + 1)];
  }
  if (field === "years" && f.totalYears) e.totalYears = { min: f.totalYears.min != null ? Math.max(0, f.totalYears.min - 2) : null, max: f.totalYears.max != null ? f.totalYears.max + 2 : null };
  if (field === "city") e.location = { ...f.location, city: null };
  if (field === "industry") {
    e.industry = f.industry ? f.industry.replace(/ (making|manufacturers making) .*$/, "") : null;
    e.notIndustries = [];
  }
  if (field === "titles") e.titles = closeTitles(f.role, f.function, f.levelLow, f.levelHigh, []).concat(f.titles);
  return refineForm(f, e);
}

export { INDUSTRIES };
