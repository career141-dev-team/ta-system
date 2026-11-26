/**
 * check.ts — the free check before any money is spent (Full Plan v1.2, section 4.2).
 *
 * Reads a standard form and returns questions for the TA (blocking), warnings (not blocking),
 * the removed items, and separate forms when the request held several roles.
 * Pure: no outside calls. The market-size count (≈ $0.009) is done by the engine only when
 * `wantsMarketCount` is true and the caller allows it.
 */
import type { CheckQuestion, CheckResult, Level, StandardForm } from "./types";
import { HOME_COUNTRY, LEVEL_NAME, LEVEL_YEARS, levelIndex, LEVELS } from "./vocab";

const MAX_MUST = 3;

function lv(l: Level | null): string {
  return l ? LEVEL_NAME[l] : "?";
}

function levelRange(f: StandardForm): string {
  if (!f.levelLow || !f.levelHigh) return "?";
  return f.levelLow === f.levelHigh ? lv(f.levelLow) : `${lv(f.levelLow)} – ${lv(f.levelHigh)}`;
}

function yearsText(y: { min: number | null; max: number | null }): string {
  if (y.min != null && y.max != null) return `${y.min}–${y.max} years`;
  if (y.min != null) return `${y.min}+ years`;
  if (y.max != null) return `up to ${y.max} years`;
  return "any years";
}

/** The levels whose usual years overlap a years range. */
function levelsFitting(min: number, max: number): Level[] {
  return LEVELS.filter((l) => LEVEL_YEARS[l][0] <= max && LEVEL_YEARS[l][1] >= min);
}

/**
 * @param accepted question codes the TA already answered with "keep as is" (they no longer block).
 */
export function checkForm(f: StandardForm, accepted: CheckQuestion["code"][] = []): CheckResult {
  const q: CheckQuestion[] = [];
  const warnings: string[] = [];
  const s = f.signals;

  // ---- Missing ----------------------------------------------------------------------------
  if (!f.role && f.titles.length === 0 && f.currentCompanies.length === 0) {
    q.push({ code: "missing_role", field: "role", question: "Which role or job title should we search for?" });
  }
  if (!f.location.country && !f.location.studiedIn) {
    q.push({
      code: "missing_location",
      field: "location",
      question: "Where should the person live? (The company's office is not used.)",
      options: [HOME_COUNTRY, "Sri Lankans in the UAE", "Bangladesh", "India"],
    });
  }
  if (!f.levelLow || !f.levelHigh) {
    q.push({
      code: "missing_level",
      field: "levelLow",
      question: "Which level do you want — lowest and highest? (For example Assistant Manager to Manager.)",
      options: ["Executive – Senior Executive", "Assistant Manager – Manager", "Senior Manager – DGM", "GM / Head – Director"],
    });
  }
  if (!f.totalYears && !f.areaYears && f.type !== "find_one") {
    q.push({
      code: "missing_years",
      field: "totalYears",
      question: "How many years of experience? (Total years, or years in a specific area.)",
      options: suggestYears(f),
    });
  }

  // ---- Clashing ---------------------------------------------------------------------------
  const raw = f.totalYears ?? (f.areaYears ? { min: f.areaYears.min, max: f.areaYears.max } : null);
  // Post-qualification years: qualifying takes about 3 years, so compare 3 more years with the level.
  const pq = f.signals.postQualification ? 3 : 0;
  const years = raw ? { min: raw.min != null ? raw.min + pq : null, max: raw.max != null ? raw.max + pq : null } : null;
  if (years && f.levelLow && f.levelHigh && f.totalYears) {
    const [lowMin] = LEVEL_YEARS[f.levelLow];
    const [, highMax] = LEVEL_YEARS[f.levelHigh];
    const yMin = years.min ?? 0;
    const yMax = years.max ?? yMin;
    const tooMany = yMax > highMax + 0 && (years.max != null || yMin > highMax);
    const tooFew = years.max != null && years.max < lowMin;
    if (tooMany || tooFew) {
      const fits = levelsFitting(yMin, yMax).filter((l) => l !== "trainee");
      const suggest = fits.length ? `${lv(fits[0])} – ${lv(fits[Math.min(fits.length - 1, 2)])}` : "";
      q.push({
        code: "clash_level_years",
        field: "levelLow",
        question: `${levelRange(f)} with ${yearsText(years)}? People with ${yearsText(years)} are usually ${suggest}. Which do you want?`,
        options: [`Keep ${levelRange(f)}`, suggest ? `Search ${suggest}` : "Change the years"].filter(Boolean),
      });
    }
  }
  if (s.jdIndustryHint && s.taIndustryHint && s.jdIndustryHint !== s.taIndustryHint && !sameFamily(s.jdIndustryHint, s.taIndustryHint)) {
    q.push({
      code: "clash_jd_ta_industry",
      field: "industry",
      question: `The JD points to ${industryWord(s.jdIndustryHint)}, but you asked for ${industryWord(s.taIndustryHint)}. Which one?`,
      options: [industryWord(s.taIndustryHint), industryWord(s.jdIndustryHint), "Both (no industry rule)"],
    });
  }
  if (s.jdTitleLevel && f.levelLow && f.levelHigh) {
    const i = levelIndex(s.jdTitleLevel);
    const outside = i < levelIndex(f.levelLow) || i > levelIndex(f.levelHigh);
    if (outside) {
      // The TA set the target on purpose (e.g. CFO JD → GM / AGM / DGM): a note, not a question.
      warnings.push(`JD title "${s.jdTitle}" is ${lv(s.jdTitleLevel)}. Searching ${levelRange(f)} as asked.`);
    }
  }
  if (s.overseasNoCountry || s.locationsNamed.length > 1) {
    const named = s.locationsNamed.length ? s.locationsNamed : [HOME_COUNTRY, "overseas"];
    q.push({
      code: s.overseasNoCountry ? "overseas_where" : "clash_two_locations",
      field: "location",
      question: `Two locations named (${named.join(" / ")}). One search uses one location. Which first? (The other can run as a second search.)`,
      options: s.overseasNoCountry
        ? [`Lives in ${HOME_COUNTRY}`, "Sri Lankans anywhere (Sri Lanka or abroad)", "Sri Lankans living in Bangladesh", "Sri Lankans living in the UAE"]
        : [...named, "Both — two searches"],
    });
  }
  if (s.locationDefault === "home") {
    warnings.push("No location given — searching people who live in Sri Lanka (default). Name a country to search there.");
  } else if (s.locationDefault === "sri_lankans_abroad") {
    warnings.push(`Searching Sri Lankans living in ${f.location.country} (default). Say "locals" to search everyone there.`);
  }

  // ---- Too narrow / too broad ---------------------------------------------------------------
  let wantsMarketCount = false;
  if (s.extraMustHaves.length > 0) {
    q.push({
      code: "too_many_must_haves",
      field: "mustHaves",
      question: `More than ${MAX_MUST} must-haves. Keep the 3 that matter most; the rest rank people as nice-to-haves.`,
      options: [...f.mustHaves, ...s.extraMustHaves],
    });
    wantsMarketCount = true;
  }
  if (s.onlyCompaniesNamed || (f.currentCompanies.length > 0 && f.currentCompanies.length <= 3)) {
    wantsMarketCount = true;
    warnings.push("Only a few companies named. The market size is counted first so you can see how many people exist.");
  }
  if (f.mustHaves.length + (f.areaYears ? 1 : 0) + (f.industry ? 1 : 0) + f.extraRules.length >= 5) wantsMarketCount = true;
  const broad = !!f.location.country && (f.role || f.titles.length) && !f.levelLow && !f.industry && !f.totalYears && !f.areaYears && f.mustHaves.length === 0 && f.currentCompanies.length === 0;
  if (broad && !q.some((x) => x.code === "missing_years")) {
    q.push({
      code: "too_broad",
      field: "industry",
      question: "This matches thousands of people, so the 30 shown would be random. Add an industry, level or years.",
    });
  } else if (broad) {
    q.push({ code: "too_broad", field: "industry", question: "Very broad: only a title and a country. Which industry or company type?" });
  }

  // ---- Several roles ------------------------------------------------------------------------
  const splitForms: StandardForm[] = [];
  if (s.splitRoles.length > 1) {
    q.push({
      code: "split_roles",
      field: "role",
      question: `Several roles in one request (${s.splitRoles.join(", ")}). They will run as ${s.splitRoles.length} separate searches. OK?`,
      options: ["Yes, separate searches", "No, one role only"],
    });
    for (const r of s.splitRoles) {
      const g = structuredClone(f);
      g.role = r;
      g.titles = [r];
      g.signals.splitRoles = [];
      splitForms.push(g);
    }
  }

  // ---- Fresh graduates ----------------------------------------------------------------------
  if (s.freshGraduate || f.levelHigh === "trainee") {
    warnings.push(
      "Fresh-graduate roles: LinkedIn data is weak (mostly students and empty profiles). Better: job posts, university career units and our own CV database.",
    );
  }

  // ---- Removed items ------------------------------------------------------------------------
  for (const r of f.removed) {
    if (r.item === "working_terms") continue;
    warnings.push(`Not searched — ${r.text.slice(0, 60)}: ${r.why}`);
  }
  if (f.qualifications.length) {
    warnings.push(`${f.qualifications.join(", ")} not sent to the search (cannot be verified; it costs more). Checked in each person's headline instead.`);
  }

  const open = q.filter((x) => !accepted.includes(x.code));
  return { ok: open.length === 0, questions: open, warnings, removed: f.removed, splitForms, wantsMarketCount };
}

function suggestYears(f: StandardForm): string[] {
  if (!f.levelLow || !f.levelHigh) return ["3–5 years", "5–8 years", "8+ years", "15+ years"];
  const a = LEVEL_YEARS[f.levelLow][0];
  const b = LEVEL_YEARS[f.levelHigh][1];
  const mid = Math.round((a + b) / 2);
  return [`${a}–${mid} years`, `${mid}+ years`, `${a}+ years`];
}

const FAMILY: Record<string, string> = {
  solar_manufacturing: "solar_m", solar_installation: "solar_i", renewable: "solar", activewear: "apparel", intimates: "apparel_i", apparel: "apparel",
  fabric: "fabric", manufacturing: "mfg", heavy_manufacturing: "mfg",
};
function sameFamily(a: string, b: string): boolean {
  // A combined rule ("healthcare or hospitality") covers each of its parts.
  if (a.startsWith("combo:")) return a.slice(6).split("+").includes(b) || sameFamily(a.slice(6).split("+")[0], b);
  if (b.startsWith("combo:")) return sameFamily(b, a);
  // "renewable" is the parent of both solar kinds; "apparel" of activewear; "manufacturing" of heavy manufacturing.
  // "apparel or textile" is the parent of apparel, activewear, intimates and fabric.
  if (a === "apparel_textile" || b === "apparel_textile") return [a, b].every((x) => ["apparel_textile", "apparel", "activewear", "intimates", "fabric"].includes(x));
  if (a === "renewable" || b === "renewable") return /solar|renewable/.test(a) && /solar|renewable/.test(b);
  if (a === "apparel" || b === "apparel") return FAMILY[a]?.startsWith("apparel") && FAMILY[b]?.startsWith("apparel");
  if (a === "manufacturing" || b === "manufacturing") return true;
  return FAMILY[a] === FAMILY[b];
}

function industryWord(k: string): string {
  const w: Record<string, string> = {
    solar_manufacturing: "solar panel manufacturers",
    solar_installation: "solar installation / EPC companies",
    renewable: "renewable energy companies",
    fabric: "fabric / textile mills",
    apparel: "garment / apparel makers",
    activewear: "activewear makers",
    intimates: "intimates makers",
    heavy_manufacturing: "heavy manufacturing",
    manufacturing: "manufacturing companies",
    construction: "construction companies",
    fmcg: "FMCG companies",
    food_agro: "food / agriculture companies",
    banking: "banks / financial services",
  };
  return w[k] ?? k;
}

/** Turn a chosen option back into form edits (the page calls this when a TA clicks an answer). */
export function answerToEdits(f: StandardForm, code: CheckQuestion["code"], answer: string): Partial<StandardForm> | null {
  const a = answer.trim();
  switch (code) {
    case "missing_location":
    case "clash_two_locations":
    case "overseas_where": {
      if (/sri lankans anywhere/i.test(a)) return { location: { country: null, city: null, studiedIn: HOME_COUNTRY } };
      const abroad = a.match(/sri lankans (?:living )?in (?:the )?(.+)$/i);
      if (abroad) {
        const country = abroad[1].trim().replace(/^uae$/i, "United Arab Emirates");
        return { location: { country, city: null, studiedIn: HOME_COUNTRY } };
      }
      if (/^both/i.test(a)) return null; // the page runs two searches
      const country = a.replace(/^lives in\s+/i, "");
      return { location: { country, city: f.location.country === country ? f.location.city : null, studiedIn: null } };
    }
    case "clash_level_years":
    case "missing_level": {
      if (/^keep/i.test(a)) return {}; // accepted as is: pass the code in `accepted`
      const names = a.replace(/^search\s+/i, "").split(/\s*[–-]\s*/);
      const find = (n: string) => (Object.entries(LEVEL_NAME).find(([, v]) => v.toLowerCase().startsWith(n.toLowerCase().split(" (")[0]))?.[0] ?? null) as Level | null;
      const lo = find(names[0]);
      const hi = find(names[names.length - 1]);
      return lo && hi ? { levelLow: lo, levelHigh: hi } : null;
    }
    case "missing_years": {
      const m = a.match(/(\d+)\s*(?:[–-]\s*(\d+)|\+)?/);
      if (!m) return null;
      return { totalYears: { min: +m[1], max: m[2] ? +m[2] : null } };
    }
    default:
      return null;
  }
}
