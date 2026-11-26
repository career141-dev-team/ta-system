/**
 * Vocabulary: levels, short forms, functions, places, qualifications and industries.
 * Plain tables so the TA System team can extend them without touching the logic.
 */
import type { Level } from "./types";

export const LEVELS: Level[] = [
  "trainee",
  "executive",
  "senior_executive",
  "assistant_manager",
  "manager",
  "senior_manager",
  "agm",
  "dgm",
  "gm",
  "director",
  "c_level",
];

export const LEVEL_NAME: Record<Level, string> = {
  trainee: "Trainee",
  executive: "Executive",
  senior_executive: "Senior Executive",
  assistant_manager: "Assistant Manager",
  manager: "Manager",
  senior_manager: "Senior Manager",
  agm: "AGM",
  dgm: "DGM",
  gm: "GM / Head",
  director: "Director",
  c_level: "C-level (CEO, CFO, COO…)",
};

/** Typical total years per level in Sri Lankan / South Asian companies (for the level-vs-years clash). */
export const LEVEL_YEARS: Record<Level, [number, number]> = {
  trainee: [0, 2],
  executive: [1, 5],
  senior_executive: [3, 7],
  assistant_manager: [5, 10],
  manager: [7, 15],
  senior_manager: [10, 20],
  agm: [12, 22],
  dgm: [14, 25],
  gm: [15, 35],
  director: [15, 40],
  c_level: [15, 45],
};

export const levelIndex = (l: Level) => LEVELS.indexOf(l);

/**
 * Level words → level. Order matters: longer / more specific first.
 * Matched case-insensitively on word boundaries.
 */
export const LEVEL_WORDS: [RegExp, Level][] = [
  [/\b(chief\s+[a-z]+\s+officer|ceo|cfo|coo|cmo|cto|cio|chro|managing director|country manager)\b/i, "c_level"],
  [/\b(group\s+[a-z]+\s+director|directors?|vice president|vp|svp|evp)\b/i, "director"],
  [/\b(deputy general managers?|dgm)\b/i, "dgm"],
  [/\b(assistant general managers?|agm)\b/i, "agm"],
  [/\b(general managers?|gm|head of|heads?|hod)\b/i, "gm"],
  [/\b(senior managers?|sr\.?\s*managers?|principal)\b/i, "senior_manager"],
  [/\b(assistant managers?|asst\.?\s*managers?|am)\b/i, "assistant_manager"],
  [/\b(managers?|team lead)\b/i, "manager"],
  [/\b(senior executives?|sr\.?\s*executives?|senior (?:[a-z]+ )?(?:analyst|engineer|surveyor|accountant|merchandiser|planner|officer|specialist)s?)\b/i, "senior_executive"],
  [/\b(management trainees?|trainees?|interns?|internship|graduate trainees?|fresh graduates?)\b/i, "trainee"],
  [/\b(assistant (?:[a-z]+ )?(?:engineer|surveyor|accountant|merchandiser)s?|junior [a-z]+|executives?|officers?|associates?|coordinators?)\b/i, "executive"],
];

/** Profession words with no seniority in them ("Quantity Surveyor", "Engineer"). Level then comes from years. */
export const PROFESSION_RE = /\b(engineer|analyst|surveyor|accountant|merchandiser|planner|specialist|consultant|developer|designer|technologist)s?\b/i;

/** Find every level named in a text, in order of appearance. */
export function levelsIn(text: string): Level[] {
  const hits: { at: number; level: Level }[] = [];
  const taken: [number, number][] = [];
  for (const [re, level] of LEVEL_WORDS) {
    const g = new RegExp(re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      const s = m.index;
      const e = s + m[0].length;
      if (taken.some(([a, b]) => s < b && e > a)) continue;
      // "AM" only as a level when written in capitals (not "I am").
      if (/^am$/i.test(m[0]) && m[0] !== "AM") continue;
      // "head office", "headcount"; "director" in "reporting to the director" is context, not a level.
      if (/^heads?$/i.test(m[0]) && /^\s*(office|quarter)/i.test(text.slice(e))) continue;
      if (/\b(reporting|reports?)\s+(directly\s+)?to\s+(the\s+)?$/i.test(text.slice(Math.max(0, s - 30), s))) continue;
      taken.push([s, e]);
      hits.push({ at: s, level });
    }
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.level);
}

/** Short forms TAs use → full words. Applied to role titles and the free text. */
export const SHORT_FORMS: [RegExp, string][] = [
  [/\bQS\b/g, "Quantity Surveyor"],
  [/\bEHS\b/g, "EHS (Environment, Health & Safety)"],
  [/\bHSE\b/g, "HSE (Health, Safety & Environment)"],
  [/\bHOD\b/gi, "Head of Department"],
  [/\bDGM\b/g, "Deputy General Manager"],
  [/\bAGM\b/g, "Assistant General Manager"],
  [/\bAM\b/g, "Assistant Manager"],
  [/\bSr\.?(?=\s)/g, "Senior"],
  [/\bAsst\.?(?=\s)/gi, "Assistant"],
  [/\bMgr\b/gi, "Manager"],
  [/\bExec\b/gi, "Executive"],
  [/\bHR\b/g, "HR"],
  [/\bSL\b/g, "Sri Lanka"],
  [/\bKSA\b/g, "Saudi Arabia"],
  [/\bUAE\b/g, "UAE"],
  [/\byrs?\b/gi, "years"],
  [/\bexp\b\.?/gi, "experience"],
  [/\bmfg\b/gi, "manufacturing"],
];

export function expandShortForms(s: string): string {
  let out = s;
  for (const [re, full] of SHORT_FORMS) out = out.replace(re, full);
  return out;
}

/**
 * Functions: key → words that identify it in a title or request, and the core title words
 * used to build close titles. `side` adds sister titles ("GM Marketing & Merchandising").
 */
export type FunctionDef = { key: string; words: RegExp; core: string[]; side?: string[] };
export const FUNCTIONS: FunctionDef[] = [
  { key: "quantity_surveying", words: /\b(quantity survey\w*|qs|cost engineer\w*|estimat\w+)\b/i, core: ["Quantity Surveyor", "Cost Engineer"] },
  { key: "ehs", words: /\b(ehs|hse|she|health\s*(&|and)\s*safety|environment\w*,?\s*health|safety)\b/i, core: ["EHS", "HSE", "Health & Safety"] },
  { key: "renewable_engineering", words: /\b(solar|renewable|pv|photovoltaic|green energy|wind energy)\b/i, core: ["Solar PV Engineer", "Renewable Energy Engineer", "Electrical Engineer"] },
  { key: "electrical_maintenance", words: /\b(electrical (and|&) maintenance|maintenance engineer\w*|electrical engineer\w*|high[- ]voltage|low[- ]voltage|transformers?|generators?)\b/i, core: ["Electrical Engineer", "Maintenance Engineer", "Electrical & Maintenance Engineer"] },
  { key: "strategy", words: /\b(strateg\w+|corporate planning|business planning|investment analys\w+|feasibility|business analyst|insights)\b/i, core: ["Strategic Planning", "Corporate Strategy", "Business Analyst", "Investment Analyst"] },
  { key: "merchandising", words: /\b(merchandis\w+)\b/i, core: ["Merchandising"], side: ["Marketing & Merchandising"] },
  { key: "finance", words: /\b(finance|financial|cfo|accounts?|accountant|controller|treasury|audit)\b/i, core: ["Finance"] },
  { key: "manufacturing", words: /\b(manufacturing|production|plant|factory|operations)\b/i, core: ["Manufacturing", "Production", "Operations"] },
  { key: "hr", words: /\b(hr|human resources?|people|talent)\b/i, core: ["HR", "Human Resources"] },
  { key: "marketing", words: /\b(marketing|brand)\b/i, core: ["Marketing", "Brand"] },
  { key: "sales", words: /\b(sales|business development|key account)\b/i, core: ["Sales", "Business Development"] },
  { key: "supply_chain", words: /\b(supply chain|logistics|procurement|purchasing|sourcing)\b/i, core: ["Supply Chain", "Procurement"] },
  { key: "it", words: /\b(software|developer|it|information technology|data engineer|devops)\b/i, core: ["IT", "Software"] },
  { key: "planning", words: /\b(production planner|planning)\b/i, core: ["Production Planning"] },
];

export function functionOf(text: string): FunctionDef | null {
  for (const f of FUNCTIONS) if (f.words.test(text)) return f;
  return null;
}

export function functionsIn(text: string): string[] {
  return FUNCTIONS.filter((f) => f.words.test(text)).map((f) => f.key);
}

/** Places: city → country. Countries map to themselves. */
export const CITY_COUNTRY: Record<string, string> = {
  colombo: "Sri Lanka", kandy: "Sri Lanka", galle: "Sri Lanka", gampaha: "Sri Lanka", negombo: "Sri Lanka",
  kurunegala: "Sri Lanka", jaffna: "Sri Lanka", katunayake: "Sri Lanka", biyagama: "Sri Lanka", koggala: "Sri Lanka",
  horana: "Sri Lanka", kalutara: "Sri Lanka", matara: "Sri Lanka", anuradhapura: "Sri Lanka", ratnapura: "Sri Lanka",
  batticaloa: "Sri Lanka", trincomalee: "Sri Lanka", wattala: "Sri Lanka", waradala: "Sri Lanka", panadura: "Sri Lanka",
  moratuwa: "Sri Lanka", "sri jayawardenepura": "Sri Lanka", kelaniya: "Sri Lanka", ja_ela: "Sri Lanka", seeduwa: "Sri Lanka",
  dhaka: "Bangladesh", chittagong: "Bangladesh", chattogram: "Bangladesh", gazipur: "Bangladesh", narayanganj: "Bangladesh",
  mumbai: "India", delhi: "India", "new delhi": "India", bangalore: "India", bengaluru: "India", chennai: "India",
  hyderabad: "India", pune: "India", kolkata: "India", tiruppur: "India", coimbatore: "India", gurgaon: "India", noida: "India",
  dubai: "United Arab Emirates", "abu dhabi": "United Arab Emirates", sharjah: "United Arab Emirates",
  riyadh: "Saudi Arabia", jeddah: "Saudi Arabia", dammam: "Saudi Arabia", doha: "Qatar", muscat: "Oman",
  karachi: "Pakistan", lahore: "Pakistan", "ho chi minh": "Vietnam", hanoi: "Vietnam", nairobi: "Kenya",
  singapore: "Singapore", london: "United Kingdom", toronto: "Canada", sydney: "Australia", melbourne: "Australia",
};

export const COUNTRY_ALIASES: Record<string, string> = {
  "sri lanka": "Sri Lanka", "srilanka": "Sri Lanka", bangladesh: "Bangladesh", india: "India", pakistan: "Pakistan",
  "united arab emirates": "United Arab Emirates", uae: "United Arab Emirates", "u.a.e": "United Arab Emirates",
  "saudi arabia": "Saudi Arabia", saudi: "Saudi Arabia", ksa: "Saudi Arabia", qatar: "Qatar", oman: "Oman",
  kuwait: "Kuwait", bahrain: "Bahrain", maldives: "Maldives", singapore: "Singapore", australia: "Australia",
  "united kingdom": "United Kingdom", uk: "United Kingdom", canada: "Canada", "new zealand": "New Zealand",
  vietnam: "Vietnam", indonesia: "Indonesia", cambodia: "Cambodia", myanmar: "Myanmar", kenya: "Kenya",
  ethiopia: "Ethiopia", jordan: "Jordan", egypt: "Egypt",
};

export const GULF = ["United Arab Emirates", "Saudi Arabia", "Qatar", "Oman", "Kuwait", "Bahrain"];
export const HOME_COUNTRY = "Sri Lanka";

/** Country of a place word, or null. */
export function countryOf(place: string): string | null {
  const p = place.trim().toLowerCase().replace(/\.$/, "");
  return COUNTRY_ALIASES[p] ?? CITY_COUNTRY[p] ?? null;
}

/** All places named in a text, in order: { word, country, isCity }. */
export function placesIn(text: string): { word: string; country: string; isCity: boolean; at: number }[] {
  const out: { word: string; country: string; isCity: boolean; at: number }[] = [];
  const add = (dict: Record<string, string>, isCity: boolean) => {
    for (const [k, country] of Object.entries(dict)) {
      const word = k.replace(/_/g, "-");
      const re = new RegExp(`(^|[^a-z])(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![a-z])`, "gi");
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const at = m.index + m[1].length;
        // "Male" (Maldives) is left out on purpose: it clashes with gender words.
        if (k === "uk" && m[2] !== "UK") continue;
        if (k === "saudi" && /saudi arabia/i.test(text.slice(at, at + 12))) continue;
        out.push({ word: m[2], country, isCity, at });
      }
    }
  };
  add(COUNTRY_ALIASES, false);
  add(CITY_COUNTRY, true);
  return out.sort((a, b) => a.at - b.at);
}

/** Qualifications and memberships: never sent to Crustdata (section 4.3). */
export const QUALIFICATIONS = [
  "ACCA", "CIMA", "ACMA", "CGMA", "ACA", "FCA", "CA", "CPA", "CFA", "CMA", "AAT", "MAAT", "CIPM", "CPM", "PMP",
  "SHRM", "CIPD", "MBA", "MRICS", "RICS", "CIOB", "IESL", "CEng", "SLIM", "CIM", "CMI", "NEBOSH", "IOSH", "LEED",
];
export const QUAL_RE = new RegExp(`\\b(${QUALIFICATIONS.join("|")})\\b`, "g");

/** Industries with look-alikes to leave out (section 4.1). Order: most specific first. */
export type IndustryDef = { key: string; words: RegExp; name: string; not: string[] };
export const INDUSTRIES: IndustryDef[] = [
  { key: "fabric", words: /\b(fabrics?|textile mills?|textiles?|knit fabric|woven fabric|dyeing)\b/i, name: "fabric / textile manufacturers", not: ["garment / apparel makers"] },
  { key: "activewear", words: /\b(activewear|active wear|sportswear|athleisure)\b/i, name: "apparel manufacturers making activewear / sportswear", not: ["intimates / lingerie makers"] },
  { key: "intimates", words: /\b(intimates?|lingerie|intimate apparel)\b/i, name: "apparel manufacturers making intimates / lingerie", not: ["activewear makers"] },
  { key: "solar_manufacturing", words: /\bsolar\b[^.\n]{0,40}\bmanufactur\w*|\bmanufactur\w*[^.\n]{0,40}\bsolar\b/i, name: "solar panel / equipment manufacturers", not: ["solar installers / EPC contractors"] },
  { key: "solar_installation", words: /\b(solar|pv)\b[^.\n]{0,60}\b(install\w*|epc|projects?|rooftop|ground[- ]mounted)\b/i, name: "solar PV installers / EPC contractors", not: ["solar panel manufacturers"] },
  { key: "renewable", words: /\b(renewable energy|solar|green energy|wind)\b/i, name: "solar / renewable energy companies", not: [] },
  { key: "apparel", words: /\b(apparel|garments?|clothing)\b/i, name: "export apparel / garment manufacturers", not: [] },
  { key: "construction", words: /\b(construction|building projects?|civil engineering|contractors?|infrastructure)\b/i, name: "construction / building contractors and consultants", not: [] },
  { key: "heavy_manufacturing", words: /\bheavy\s+(manufacturing|industry|industries|engineering)\b/i, name: "heavy manufacturing (steel, cement, tyres, chemicals, heavy engineering)", not: ["apparel / light assembly"] },
  { key: "fmcg", words: /\b(fmcg|consumer goods)\b/i, name: "FMCG", not: [] },
  { key: "food_agro", words: /\b(food|agro|agriculture|poultry|dairy)\b/i, name: "food / agriculture", not: [] },
  { key: "banking", words: /\b(bank|banking|leasing|insurance|financial services)\b/i, name: "banking / financial services", not: [] },
  { key: "manufacturing", words: /\b(manufacturing|factory|factories|production plant)\b/i, name: "manufacturing", not: [] },
];

export function industryOf(text: string): IndustryDef | null {
  for (const d of INDUSTRIES) if (d.words.test(text)) return d;
  return null;
}

/** Company-name / title keywords per area, for "years in an area" when employers have no industry tag. */
export const AREA_KEYWORDS: Record<string, RegExp> = {
  solar: /\b(solar|pv|photovoltaic|green energy|renewable|sun ?power)\b/i,
  renewable: /\b(solar|renewable|green energy|wind|hydro)\b/i,
  activewear: /\b(active|sport|athle)\w*/i,
  fabric: /\b(fabric|textile|mills?|knit)\w*/i,
  capex: /\b(capex|investment|feasibility|project finance)\b/i,
};

// ---------------------------------------------------------------------------------------------
// Pure SHA-256 (sync), so form keys work in any runtime (Convex default runtime, Node, browser).
// ---------------------------------------------------------------------------------------------
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const len = bytes.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const bits = len * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bits >>> 0);
  view.setUint32(padded.length - 8, Math.floor(bits / 2 ** 32));
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
}
