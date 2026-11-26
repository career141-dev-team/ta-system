/**
 * The chip search (Run 7, 26 Nov 2026): the job title decides first, then the
 * asked town, industry, level, years and a specialist word order the people,
 * and a final AI check reads the request again and removes misfits from the
 * top 60. Measured on 200 blind-graded test jobs: useful top 10 63%, years in
 * the asked range 99% (was 88% with the old search). Every AI call goes
 * through `ask`, so the search service (services/chip-search) and tests can
 * pass their own. Pure: no database, no network of its own.
 */
import { Engine } from "./engine";
import { readConversation, readMessage, applyRead, chipLabel } from "./ruleReader";
import { READER_SYSTEM, readerUser, specFromAnswer } from "./readerPrompt";
import { PLACE_BY_ID, closeness } from "./lists/places";
import { ROLE_BY_ID } from "./lists/roles";
import { levelFromTitle } from "./lists/levels";
import { EMPLOYERS } from "./lists/companies";

/** Employer type from the company name: the known employers list, then common words in Sri Lankan company names. */
const TYPE_WORDS: [string, RegExp][] = [
  ["bank", /\b(bank|banking)\b/],
  ["insurance", /\b(insurance|assurance|insurers?|takaful|life plc|general plc)\b/],
  ["finance_company", /\b(leasing|finance plc|finance company|finance ltd|credit plc|capital plc|microfinance|lb finance|lolc|vallibel finance|people's leasing|citizens development|siyapatha)\b/],
  ["hotel", /\b(hotels?|resorts?|spa|hospitality|inn|villas?|cinnamon|jetwing|shangri|hilton|marriott|taj|heritance|aitken spence hotels|amaya|galadari|kingsbury|anantara|hyatt|movenpick)\b/],
  ["hospital", /\b(hospitals?|medical|healthcare|health care|nawaloka|asiri|durdans|lanka hospitals|hemas hospitals|clinic|laborator(y|ies)|channelling)\b/],
  ["apparel", /\b(garments?|apparel|clothing|textiles?|knit|knitting|fabrics?|brandix|mas holdings|mas intimates|mas active|hirdaramani|hela|teejay|bodyline|star garments|jay jay mills|ocean lanka)\b/],
  ["fmcg", /\b(unilever|nestle|nestl[eé]|cargills|ceylon biscuits|cbl|hemas consumer|maliban|elephant house|ceylon cold stores|coca[ -]?cola|pepsi|fonterra|munchee|prima|swadeshi|dilmah|keells food|lion brewery|distilleries|reckitt|p&g|procter|haleon|glaxo|bairaha|crysbro|fmcg)\b/],
  ["software", /\b(software|technolog(y|ies)|tech|digital|labs|virtusa|ifs|wso2|99x|sysco|it solutions|infotech|systems)\b/],
  ["logistics", /\b(logistics|freight|shipping|cargo|maritime|express|forwarding|container|transport)\b/],
  ["construction", /\b(construction|builders|contractors?|engineering|maga|access engineering|sierra|icc|tudawe|sanken)\b/],
  ["education", /\b(school|college|university|campus|academy|institute|education)\b/],
  ["telco", /\b(dialog|mobitel|slt|airtel|hutch|telecom)\b/],
  ["bpo", /\b(bpo|kpo|outsourcing|shared services?|global services|wns|hcl|teleperformance)\b/],
  ["retail", /\b(supermarkets?|retail|keells super|arpico|glomark|food city|spar)\b/],
];
const EMP = EMPLOYERS.map((e) => ({ words: [e.name, ...e.aliases].map((a) => a.toLowerCase()), types: e.types as string[] }));
function empTypes(company: string | null | undefined): string[] {
  const c = (company ?? "").toLowerCase();
  if (!c) return [];
  const out = new Set<string>();
  for (const e of EMP) if (e.words.some((w) => c.includes(w))) e.types.forEach((t) => out.add(t));
  for (const [t, re] of TYPE_WORDS) if (re.test(c)) out.add(t);
  return [...out];
}

export type Ask = (system: string, user: string) => Promise<string | null>;
export { chipLabel, PLACE_BY_ID, ROLE_BY_ID };

const words = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9+#&]+/g, " ").split(" ").filter(Boolean);
const STOP = new Set(["senior", "junior", "sr", "snr", "jr", "lead", "principal", "of", "the", "and", "a", "an", "in", "for", "&", "-"]);
const GENERIC = new Set(["it", "engineering", "engineer", "sales", "operations", "quality", "admin", "administration", "finance", "marketing", "production", "technical", "project", "business", "customer", "service", "services", "manager", "officer", "executive", "head", "assistant", "consultant", "specialist", "analyst", "supervisor", "coordinator", "director", "staff", "team", "general", "development", "support", "management"]);
const SMALL = new Set(["of", "the", "and", "a", "in", "for", "&"]);
const hasW = (set: Set<string>, w: string) => set.has(w) || set.has(w + "s") || (w.endsWith("s") && set.has(w.slice(0, -1)));

const JOB_SYSTEM = `A recruiter in Sri Lanka typed a search or pasted a job description (spelling may be wrong). Find the job and answer JSON only:
{"job":"the job title, spelled right","names":["up to 8 other job titles people with this exact job write on their CVs"],"not":["words that, in a CV job title, mean a DIFFERENT job with the same name"],"industry":["only if the request names an industry or kind of employer: short words found in such employers' names or titles, e.g. apparel -> apparel, garment, clothing, textile, fashion, knit, MAS, Brandix, Hirdaramani"],"types":["the employer types this job is done in, ONLY when the job belongs to particular industries even if not said (motor claims -> insurance; bank branch manager -> bank; executive chef -> hotel; ICU nurse -> hospital; leasing recovery -> finance_company). Pick from: big4, audit_firm, bank, finance_company, insurance, fmcg, apparel, telco, bpo, hotel, hospital, software, construction, government, ngo, retail, logistics, airline, oil_gas, education. Empty for jobs found in any industry (accountant, HR executive, driver)"],"level":"the job's level as a number: 0 trainee/intern, 1 executive/officer, 2 senior executive, 3 assistant manager/team lead/supervisor, 4 manager, 5 senior manager, 6 head/AGM/DGM, 7 GM/director, 8 CEO/CFO/MD; null if not clear","key":["ONLY for specialist jobs: 1-3 short words every right person has in their job title or skills, e.g. SAP FICO consultant -> [\"SAP\"], Oracle DBA -> [\"Oracle\"], Dynamics 365 consultant -> [\"Dynamics\"], Linux administrator -> [\"Linux\"], AML manager -> [\"AML\",\"anti-money laundering\"], trade finance officer -> [\"trade finance\"], ICU nurse -> [\"ICU\",\"intensive care\"], HVAC engineer -> [\"HVAC\"], motor claims -> [\"motor\"], leasing recovery -> [\"leasing\",\"recovery\"]. Empty for general jobs (accountant, HR executive, sales executive)"],"industryOnly":"true ONLY when the request says the person MUST come from those industries (\"only\", \"must be from\", \"from healthcare or hospitality only\"); false when the industry is a preference or not named"}
Rules: names are the same work only, never a wider or nearby job; when the bare title is used in other fields, write the field into each name (e.g. "software QA lead", "test lead", not "QA lead"; "tea estate manager", "plantation manager", not "estate manager"). "not" examples: architect (building) -> ["software","solution","solutions","cloud","data","enterprise","network","security","systems"]; estate manager (plantation) -> ["real","property"]; software QA -> ["food","garment","factory","production"]. Empty lists when nothing applies. If no job is named: {"job":null,"names":[],"not":[],"industry":[],"types":[],"level":null,"key":[],"industryOnly":false}`;

/** The final layer: a recruiter's read of the shortlist against the request. */
const INSPECT_SYSTEM = `You are a senior recruiter in Sri Lanka checking a shortlist before you call anyone. The client's request comes first, then numbered people: title now @ company | place | years of experience | level | earlier titles | qualifications.
Score every person: 2 = call them (the right job or a very close one, the right level, years and place fit; a job abroad may take people in Sri Lanka or there), 1 = maybe (close but one thing is off or unclear), 0 = remove (a different job, clearly the wrong level, years far outside the range, the wrong industry when the request needs one, or abroad when the job is in a Sri Lankan town and the request wants locals).
Judge only what is written. Missing years, place or qualifications alone is never a 0. Do not reward a long CV; reward fit.
Answer JSON only: {"r":[[number,score,"reason in under 8 words"],...]} with one entry for every person.`;
const LEVEL_WORD = ["trainee", "executive", "senior executive", "assistant manager", "manager", "senior manager", "head", "director", "C-level"];

const NUM: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", fifteen: "15", twenty: "20" };
export function yearsAsked(text: string): { min: number; max: number | null } | null {
  const t = text.toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\b/g, (w) => NUM[w]);
  if (/\b(fresher|fresh graduate|no experience)\b/.test(t) && !/\d\s*\+?\s*(?:years?|yrs?)/.test(t)) return { min: 0, max: 1 };
  const Y = String.raw`\s*\+?\s*(?:years?|yrs?|y)\b`;
  const pats: [RegExp, (m: RegExpExecArray) => { min: number; max: number | null }][] = [
    [new RegExp(String.raw`(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)` + Y, "g"), (m) => ({ min: +m[1], max: +m[2] })],
    [new RegExp(String.raw`(?:min(?:imum)?\.?|at least|over|more than)\s*(?:of\s*)?(\d+(?:\.\d+)?)` + Y, "g"), (m) => ({ min: +m[1], max: null })],
    [new RegExp(String.raw`(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?|y)?`, "g"), (m) => ({ min: +m[1], max: null })],
    [new RegExp(String.raw`(\d+(?:\.\d+)?)` + Y, "g"), (m) => ({ min: +m[1], max: null })],
    // A bare range right after a years number: "5+ yrs (4-6 ok)".
    [/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/g, (m) => ({ min: +m[1], max: +m[2] })],
  ];
  // A ceiling the request names: "max 8", "not more than 8", "above 20 years are too senior".
  let cap: number | null = null;
  for (const m of t.matchAll(/\b(?:max(?:imum)?\.?|not more than|no more than|up to|under|below|above|over|more than)\s*(?:of\s*)?(\d+(?:\.\d+)?)/g)) {
    const word = m[0].split(/\s/)[0], after = t.slice(m.index! + m[0].length, m.index! + m[0].length + 60);
    if (/^(above|over|more)$/.test(word) && !/too senior|too experienced|overqualified|not suitable|not consider|no\b/.test(after)) continue;
    const n = +m[1]; if (n <= 45) cap = cap == null ? n : Math.min(cap, n);
  }
  const found: { at: number; v: { min: number; max: number | null }; exp: boolean; range: boolean; end: number }[] = [];
  pats.forEach(([re, f], pi) => { for (let m; (m = re.exec(t)); ) {
    const near = t.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40);
    const before = t.slice(Math.max(0, m.index - 15), m.index);
    if (/\b(age|aged|old|history|established|since|warranty|bond|contract|days?)\b/.test(before)) continue;
    if (/\b(above|over|more than|max(imum)?|not more than|no more than|up to|under|below)\s*$/.test(before) && pi > 0) continue;
    if (pi === 4 && !/\b(?:years?|yrs?)\b[^.]{0,12}$/.test(t.slice(Math.max(0, m.index - 25), m.index))) continue;
    const v = f(m); if (v.min > 40 || (v.max != null && (v.max < v.min || v.max > 45))) continue;
    const at = m.index;
    if (found.some((x) => at >= x.at && at < x.end)) continue;
    found.push({ at, v, exp: /experience|exp\b|expirience|experiance|background/.test(near), range: pi === 0 || pi === 4, end: at + m[0].length });
  } });
  // Only a ceiling given ("freshers ok or max 2 yrs"): 0 up to it.
  if (!found.length) {
    const only = /\b(?:max(?:imum)?\.?|not more than|no more than|up to|under|below)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/.exec(t);
    return only && +only[1] <= 45 ? { min: 0, max: +only[1] } : null;
  }
  // A range the request gives wins over a single number ("5+ yrs (4-6 ok)" is 4-6).
  found.sort((a, b) => Number(b.range) - Number(a.range) || Number(b.exp) - Number(a.exp) || a.at - b.at);
  const v = { ...found[0].v };
  if (v.max == null && cap != null && cap >= v.min) v.max = cap;
  return v;
}
const impliedMax = (min: number) => min + Math.max(3, Math.round(min * 0.6));
const parseJson = (t: string | null) => { if (!t) return null; try { return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); } catch { return null; } };

export function createSearch(cards: any[], ask: Ask) {
  const engine = new Engine(cards);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const titleWords = new Map<string, { now: Set<string>[]; past: Set<string>[] }>();
  for (const c of cards) {
    const jobs = c.jobs ?? [];
    const now = [c.title, ...jobs.filter((j: any) => j.end === "present").map((j: any) => j.title)];
    const past = jobs.filter((j: any) => j.end !== "present").map((j: any) => j.title);
    titleWords.set(c.id, { now: now.filter(Boolean).map((t: string) => new Set(words(t))), past: past.filter(Boolean).map((t: string) => new Set(words(t))) });
  }
  const titleMatch = (id: string, names: string[][]) => {
    const t = titleWords.get(id)!;
    let len = 0;
    for (const set of t.now) for (const n of names) if (n.every((w) => hasW(set, w))) len = Math.max(len, n.length);
    if (len) return { th: 2, len };
    if (t.past.some((set) => names.some((n) => n.every((w) => hasW(set, w))))) return { th: 1, len: 0 };
    return { th: 0, len: 0 };
  };
  const exactNow = (id: string, job: string[]) => job.length > 0 && titleWords.get(id)!.now.some((set) => job.every((w) => set.has(w) || set.has(w + "s")));
  const placeIn = (pid: string | null | undefined, want: string[]) => {
    for (let id = pid ?? undefined, i = 0; id && i < 8; id = PLACE_BY_ID.get(id)?.parent, i++) if (want.includes(id)) return true;
    return false;
  };
  const settle = (spec: any) => {
    for (const c of spec.chips) {
      if ((c.field === "role" || c.field === "level") && c.must) c.includeUnknown = false;
      if (c.field === "gender" || c.field === "age") c.includeUnknown = true;
      if (c.field === "place" && !c.not && (c.values ?? []).every((v: string) => (PLACE_BY_ID.get(v)?.country ?? "LK") !== "LK")) { c.must = false; c.label = `prefers ${chipLabel(c)} (job abroad)`; }
    }
    const pos = spec.chips.some((c: any) => c.field === "place" && !c.not);
    const neg = spec.chips.find((c: any) => c.field === "place" && c.not);
    if (neg && !pos) {
      const country = PLACE_BY_ID.get(neg.values[0])?.country;
      if (country) spec.chips.push({ field: "place", values: [`c-${country}`], must: true, label: `in ${country} (rest of the country)` });
    }
    return spec;
  };
  /** The AI reading of the whole conversation, falling back to the word rules per message. */
  const readAi = async (turns: string[]) => {
    let spec: any = { chips: [] }, ai = true;
    for (const m of turns) {
      const rules = applyRead(spec, readMessage(m));
      const out = specFromAnswer(spec, m, await ask(READER_SYSTEM, readerUser(spec, m)));
      if (out) spec = out; else { spec = rules; ai = false; }
    }
    return { spec, ai };
  };

  /** Checks the top `n` with the AI; returns them re-ordered (2s, then 1s) plus the removed ones. */
  const inspect = async (request: string, hits: any[], n = 60) => {
    const top = hits.slice(0, n);
    if (!top.length) return null;
    const line = (h: any, i: number) => {
      const c = h.card, lv = c.level ?? c.jobs?.[0]?.level;
      const before = (c.jobs ?? []).filter((j: any) => j.end !== "present").slice(0, 2).map((j: any) => j.title).filter(Boolean).join("; ");
      const quals = (c.quals ?? []).slice(0, 4).map((q: any) => q.id ?? q).join(", ");
      return `${i + 1}. ${c.title || "-"} @ ${c.jobs?.[0]?.company || "-"} | ${PLACE_BY_ID.get(c.place)?.name ?? "place not on file"} | ${c.years ?? "?"} yrs | ${lv != null ? LEVEL_WORD[lv] : "level ?"} | before: ${before || "-"} | ${quals || "-"}`;
    };
    const text = await ask(INSPECT_SYSTEM, `REQUEST:\n${request.slice(0, 3000)}\n\nPEOPLE:\n${top.map(line).join("\n")}`);
    const o = parseJson(text);
    if (!o?.r?.length) return null;
    const verdict = new Map<number, [number, string]>();
    for (const e of o.r) if (Array.isArray(e) && Number.isFinite(e[0])) verdict.set(Math.round(e[0]) - 1, [Math.max(0, Math.min(2, Math.round(e[1]))), String(e[2] ?? "")]);
    const graded = top.map((h, i) => ({ ...h, ai: verdict.get(i)?.[0] ?? 1, aiWhy: verdict.get(i)?.[1] ?? "" }));
    return {
      kept: [...graded.filter((h) => h.ai === 2), ...graded.filter((h) => h.ai === 1)],
      removed: graded.filter((h) => h.ai === 0),
      checked: top.length,
    };
  };

  return async function search(turns: string[], opts: { inspect?: boolean } = {}) {
    const all = turns.join("\n");
    const [read, jobRaw] = await Promise.all([readAi(turns), ask(JOB_SYSTEM, all)]);
    const jo = parseJson(jobRaw) ?? {};
    const TYPES = new Set(["big4", "audit_firm", "bank", "finance_company", "insurance", "fmcg", "apparel", "telco", "bpo", "hotel", "hospital", "software", "construction", "government", "ngo", "retail", "logistics", "airline", "oil_gas", "education"]);
    const job = { job: jo.job ?? null, names: (jo.names ?? []).map(String), not: (jo.not ?? []).map((x: any) => String(x).toLowerCase()), industryOnly: jo.industryOnly === true || jo.industryOnly === "true", industry: (jo.industry ?? []).map((x: any) => String(x).toLowerCase()).filter((x: string) => x.length > 1),
      types: (jo.types ?? []).map((x: any) => String(x)).filter((x: string) => TYPES.has(x)), level: Number.isFinite(jo.level) ? Math.max(0, Math.min(8, Math.round(jo.level))) : null,
      key: (jo.key ?? []).map((x: any) => String(x).toLowerCase().trim()).filter((x: string) => x.length > 1).slice(0, 3) as string[] };
    // A specialist word must appear as a whole word ("sap" not in "sapphire").
    const keyRe = job.key.map((k) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`));
    const hasKey = (s: string) => keyRe.some((re) => re.test(s));
    const spec = settle(read.spec ?? readConversation(turns));
    const asked = yearsAsked(all);
    let yc: any = spec.chips.find((c: any) => c.field === "years" && !c.not);
    if (asked) { if (!yc) spec.chips.push((yc = { field: "years", must: true })); yc.min = asked.min; yc.max = asked.max; }
    if (yc) { yc.must = true; yc.includeUnknown = true; delete yc.qualifier; if (yc.max == null && yc.min != null) yc.max = impliedMax(yc.min); }
    const names = [...new Set([job.job, ...job.names].filter(Boolean) as string[])];
    const nameWords = names.map((n) => words(n).filter((w) => !STOP.has(w))).filter((n) => n.length > 1 || (n.length === 1 && !GENERIC.has(n[0])));
    const jobWordSet = new Set(nameWords.flat());
    const roleChip = spec.chips.find((c: any) => c.field === "role" && !c.not);
    const rolesKept = (roleChip?.values ?? []).filter((r: string) => {
      const R = ROLE_BY_ID.get(r);
      return R && (!nameWords.length || [R.label, ...R.titles].some((t) => words(t).some((w) => jobWordSet.has(w))));
    });
    const t0 = performance.now();
    const wantPlace: string[] = spec.chips.filter((c: any) => c.field === "place" && !c.not && !/rest of the country/.test(c.label ?? "")).flatMap((c: any) => c.values ?? []);
    const placeWord = wantPlace.map((v) => PLACE_BY_ID.get(v)?.name ?? v).slice(0, 2).join(" / ") || "the asked place";
    const abroadJob = wantPlace.length > 0 && wantPlace.every((v) => (PLACE_BY_ID.get(v)?.country ?? "LK") !== "LK");
    const jobExact = job.job ? words(job.job).filter((w) => !SMALL.has(w)) : [];
    const chips = spec.chips.filter((c: any) => c !== roleChip && !(c.field === "years" && !c.not)).map((c: any) => ({ ...c, must: c.not || c.field === "gender" || c.field === "age" ? c.must : false }));
    const r = await engine.search({ ...spec, chips }, { limit: 1000000 });
    const ylo = yc?.min ?? null, yhi = yc?.max ?? null;
    const yfit = (y: number | null | undefined) => (ylo == null && yhi == null) ? 0 : y == null ? 5
      : (y >= (ylo ?? 0) && (yhi == null || y <= yhi)) ? 25
      : (y >= (ylo ?? 0) - 1 && (yhi == null || y <= yhi + 2)) ? 10 : -1;
    let scored: any[] = r.hits.map((h: any) => {
      const p = byId.get(h.id);
      const { th, len } = nameWords.length ? titleMatch(h.id, nameWords) : { th: 0, len: 0 };
      const rh = rolesKept.length && p.roles.some((x: string) => rolesKept.includes(x)) ? 1 : 0;
      const nowText = `${p.title ?? ""} ${p.jobs?.[0]?.title ?? ""}`.toLowerCase();
      const other = job.not.length > 0 && words(nowText).some((w) => job.not.includes(w));
      const emp = `${p.jobs?.[0]?.company ?? ""} ${nowText} ${(p.jobs ?? []).slice(1, 3).map((j: any) => j.company).join(" ")}`.toLowerCase();
      // Industry: the employer's name/title words, or the employer type on the card (bank, insurance, hotel...).
      const nowTypes: string[] = [...(p.jobs?.[0]?.companyTypes ?? []), ...(p.companyTypesNow ?? []), ...empTypes(p.jobs?.[0]?.company)];
      const cvText = (p.text ?? "").toLowerCase();
      const ind = (job.industry.length > 0 && job.industry.some((w: string) => emp.includes(w) || cvText.includes(w))) || (job.types.length > 0 && nowTypes.some((t) => job.types.includes(t)));
      const indOff = !ind && (job.industry.length > 0 || job.types.length > 0) && nowTypes.length > 0;
      // Place: the asked town counts most, then same district, then same province; abroad loses points (job in Sri Lanka).
      let pl = 0;
      if (wantPlace.length && p.place) {
        const c = Math.max(...wantPlace.map((w) => closeness(p.place, w)));
        if (abroadJob) pl = c >= 1 ? 20 : 0;
        // Run 7: a Sri Lankan town outweighs the gap between "exact title" and "title now".
        else pl = c >= 1 ? 80 : c >= 0.7 ? 55 : c >= 0.5 ? 25 : (PLACE_BY_ID.get(p.place)?.country ?? "LK") !== "LK" ? -30 : 0;
      }
      // Level: the job's level from the request; too junior is worse than a little senior, two steps junior much worse.
      const lv = (p.title ? levelFromTitle(p.title, p.country ?? undefined) : null) ?? p.level ?? p.jobs?.[0]?.level ?? null;
      const lf = job.level == null || lv == null ? 0 : lv === job.level ? 25 : Math.abs(lv - job.level) === 1 ? 10 : lv <= job.level - 2 ? -50 : lv < job.level ? -25 : -10;
      // Specialist word (SAP, Oracle, AML...): in the title now counts most, in skills or the CV next; missing loses points.
      const kf = !job.key.length ? 0 : hasKey(nowText) ? 50 : hasKey(`${(p.skills ?? []).join(" | ")} ${cvText}`.toLowerCase()) ? 25 : -40;
      return { h, p, th, len, rh, other, ind, indOff, pl, lf, kf, yf: yfit(p.years), ex: exactNow(h.id, jobExact), here: pl > 0 };
    }).filter((x: any) => !x.other && x.yf >= 0 && ((!roleChip && !nameWords.length) || x.th || x.rh));
    // 26 Nov 2026: "from healthcare or hospitality only" kept telecom and drinks people (industry only scored).
    if (job.industryOnly && scored.filter((x: any) => x.ind).length >= 10) scored = scored.filter((x: any) => !x.indOff);
    // The job title decides the tier (exact job > job title now > did it before > related role); town, industry, level and years order people inside it.
    const rank = (x: any) => (x.ex ? 200 : x.th === 2 ? 150 + 5 * Math.min(x.len, 3) : x.th === 1 ? 60 : 0) + (x.rh ? 10 : 0) + x.pl + (x.ind ? 40 : x.indOff ? -15 : 0) + x.lf + x.kf + x.yf + 0.3 * x.h.score;
    for (const x of scored) x.rank = rank(x);
    scored.sort((a: any, b: any) => b.rank - a.rank);
    const seen = new Set<string>(); let dups = 0;
    const hits = scored.filter((x: any) => {
      const keys = [x.p.personKey, x.p.titleKey].filter(Boolean);
      if (keys.some((k: string) => seen.has(k))) { dups++; return false; }
      keys.forEach((k: string) => seen.add(k)); return true;
    }).map((x: any) => ({
      card: x.p, score: Math.round(x.rank), reason: x.h.reason,
      why: [x.ex ? "exact job title now" : x.th === 2 ? "job title now" : x.th === 1 ? "did this job before" : "related role",
        x.pl >= 45 || (abroadJob && x.pl > 0) ? `in ${placeWord}` : x.pl >= 30 ? "same district" : x.pl > 0 ? "same province" : x.pl < 0 ? "abroad" : null,
        x.ind ? "right industry" : x.indOff ? "other industry" : null, x.lf === 25 ? "right level" : x.lf < 0 ? "level off" : null,
        x.yf === 25 ? "years in range" : x.yf === 10 ? "years close" : x.yf === 5 ? "years not on file" : null].filter(Boolean),
    }));
    const ms = performance.now() - t0;
    // How many hold this job now: under 10 means the data is thin, so the page says so.
    const holders = hits.filter((h: any) => h.why[0] === "exact job title now" || h.why[0] === "job title now").length;
    // A short request leaves things out: name what is missing so the page can ask.
    const missing: string[] = [];
    if (words(all).length <= 12) {
      if (job.level == null) missing.push("level");
      if (!wantPlace.length) missing.push("town");
      if (!yc) missing.push("years");
      if (!job.types.length && !job.industry.length) missing.push("industry");
    }
    // Final layer: the AI inspector reads the request again and removes the misfits from the top 40.
    let final = hits, removed: any[] = [], checked = 0;
    if (opts.inspect !== false) {
      // 26 Nov 2026: a strict request ("female", "healthcare only") can lose most of the first 60;
      // the people after them were then shown unchecked. Check the next 60 too, up to 180,
      // until 30 are kept.
      const kept: any[] = [];
      while (checked < Math.min(hits.length, 180) && kept.length < 30) {
        const ins = await inspect(all, hits.slice(checked));
        if (!ins) break;
        kept.push(...ins.kept); removed.push(...ins.removed); checked += ins.checked;
      }
      if (checked) final = [...kept.filter((h) => h.ai === 2), ...kept.filter((h) => h.ai !== 2), ...hits.slice(checked)];
    }
    return {
      hits: final, removed, checked, all: hits, dups, ms, ai: read.ai && jobRaw != null, holders, missing,
      job: names, not: job.not, industry: [...job.industry, ...job.types], level: job.level, years: yc ? [yc.min, yc.max] : null,
      chips: chips.filter((c: any) => c.field !== "years"), roles: rolesKept,
    };
  };
}
