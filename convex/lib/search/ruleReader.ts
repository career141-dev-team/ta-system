/**
 * The rule-based request reader: instant, no model, and what runs when the
 * AI is down. It turns a TA's message into chips, each a must or a
 * preference, and applies it to the spec so far.
 *
 * What it gets right that today's parser does not (audit Q1–Q11):
 * - negation before places, nationality, gender and companies ("not in Kandy",
 *   "outside Colombo", "no females", "not from Dialog");
 * - years of experience vs age ("25-35 years old" is age; "not more than 6
 *   years" is a ceiling; "5 years minimum" has no ceiling; "1 year" and "five
 *   years" count);
 * - lakhs, k and currencies ("1.5 lakhs" is 150,000; "below 200,000" is not 200,000K);
 * - whole words only, short words only in capitals ("IT", "BA"), "Male" the
 *   city vs male the gender, "Big 4" a company type, not the company "Big";
 * - a later message can clear a chip ("anywhere is fine", "experience does not matter").
 */
import type { Chip, Spec, Field } from "./types";
import { norm, wordRe, ROLE_PHRASES, ROLES_FOR_PHRASE, ROLE_HEADS, QUAL_PHRASES, COMPANY_TYPE_PHRASES, EMPLOYER_PHRASES, PLACE_PHRASES, DEMONYMS, SKILLS, LANGUAGES, NUMBER_WORDS, lev } from "./vocab";
import { levelFromTitle } from "./lists/levels";
import { readMoney } from "./lists/money";
import { PLACE_BY_ID, widenLk } from "./lists/places";
import { QUAL_BY_ID } from "./lists/qualifications";
import { ROLE_BY_ID } from "./lists/roles";

const PREF = /\b(prefer(?:ably|red|ence)?|ideally|nice to have|bonus|advantage(?:ous)?|plus point|would be good|good to have|if possible|desirable)\b/;
const MUST = /\b(must|mandatory|essential|required|only|strictly|compulsory|need(?:s)? to have)\b/;
const NEG = /\b(not|no|non|exclude|excluding|except|without|other than|outside|apart from|but not|avoid|never)\b/;

/** Expand the shorthand TAs type. */
function expand(t: string): string {
  return ` ${t} `
    .replace(/\bexecs?\b/g, "executive").replace(/\bmgrs?\b/g, "manager").replace(/\basst\.?\b/g, "assistant")
    .replace(/\b(snr|sr)\.?(?= [a-z])/g, "senior").replace(/\bjnr\b/g, "junior").replace(/\baccts?\b/g, "accounts")
    .replace(/\byrs?\b/g, "years").replace(/\bexp\b/g, "experience").replace(/\bqualif(?:ied)?\b/g, "qualified")
    .replace(/\bpart-qualified\b/g, "part qualified").replace(/\bmin\b/g, "minimum").replace(/\bmax\b/g, "maximum")
    .replace(/\bfemale's\b/g, "female").replace(/\bladies\b/g, "female").replace(/\blady\b/g, "female").replace(/\bwomen\b/g, "female").replace(/\bwoman\b/g, "female")
    .replace(/\bgents\b/g, "male").replace(/\bgentlemen\b/g, "male").replace(/\bmen\b/g, "male").replace(/\bguys\b/g, "male")
    .replace(/ am\s*-\s*/g, " assistant manager ").replace(/\bteam leads?\b/g, "team lead")
    .replace(/\s+/g, " ");
}

function numberIn(s: string): number | null {
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (m) return Number(m[1]);
  for (const [w, n] of Object.entries(NUMBER_WORDS)) if (wordRe(w).test(s) && (w.length > 2 || s.trim() === w)) return n;
  return null;
}

interface Read { chips: Chip[]; clear: Field[]; unread: string[]; question?: string; additive?: boolean }

/** Read one message. The caller merges it into the spec. */
export function readMessage(raw: string): Read {
  const BOSS = /\b(pa|personal assistant|executive assistant|secretary|assistant)\s+(to|for)\s+(the\s+)?(ceo|cfo|coo|cto|md|managing director|director|chairman|gm|general manager|president|chief executive officer)\b/gi;
  const caps = raw.replace(BOSS, "$1 ");
  let t = expand(norm(raw));
  const orig = t;
  const additive = /\b(also|as well|add|plus|too|and also)\b/.test(t);
  const chips: Chip[] = [];
  const clear: Field[] = [];
  const unread: string[] = [];
  const eat = (s: string) => { t = t.replace(s, " "); };
  /** Preference words count only inside the same clause (between commas, "and", full stops). */
  const prefAround = (s: string) => {
    const at = t.indexOf(s);
    if (at < 0) return PREF.test(t);
    const before = t.slice(0, at);
    const startCut = Math.max(before.lastIndexOf(","), before.lastIndexOf(";"), before.lastIndexOf(". "), before.lastIndexOf(" and "));
    const rest = t.slice(at + s.length);
    const ends = [rest.indexOf(","), rest.indexOf(";"), rest.indexOf(". "), rest.indexOf(" and ")].filter((x) => x >= 0);
    const clause = t.slice(startCut + 1, at + s.length + (ends.length ? Math.min(...ends) : rest.length));
    return PREF.test(clause) && !MUST.test(clause);
  };
  const negBefore = (at: number, span = 28) => {
    const before = t.slice(Math.max(0, at - span), at);
    // The negation must govern this word: "not in Kandy", "excluding Colombo"; a later "and" breaks it.
    const m = before.match(/(?:\b(?:not|no|exclude|excluding|except|other than|outside(?: of)?|apart from|but not|avoid|non)\b)([^,.;]*)$/);
    return !!m && !/\b(and|with|but|who|from (?!\w+ only))\b/.test(m[1].replace(/\bfrom\b/, "")) || /\bnon-?$/.test(before.trim());
  };

  // "PA to the CEO" is a PA: the boss is context, never the role (P7).
  t = t.replace(/\b(pa|personal assistant|executive assistant|secretary|assistant)\s+(to|for)\s+(the\s+)?(ceo|cfo|coo|cto|md|managing director|director|chairman|gm|general manager|president|chief executive officer)\b/g, "$1 ");

  // ── CV date first: "CVs from the last 2 years" is not experience ──
  let cvd: RegExpMatchArray | null;
  if ((cvd = t.match(/\b(?:cvs?|resumes?|profiles?|applied|updated|received)\s*(?:from|in|within|during|of)?\s*(?:the )?(?:last|past) (\d+|one|two|three|six|twelve)?\s*(months?|years?)\b/) ?? t.match(/\b(?:from|within|in) (?:the )?(?:last|past) (\d+|one|two|three|six|twelve)?\s*(months?|years?)\b(?! (?:of )?experience)/))) {
    const n = numberIn(cvd[1] ?? "1") ?? 1;
    chips.push({ field: "cvDate", max: /year/.test(cvd[2]) ? n * 12 : n, must: !prefAround(cvd[0]) }); eat(cvd[0]);
  } else if (/\b(recent|latest|fresh|new) (cvs?|resumes?|profiles?)\b/.test(t)) chips.push({ field: "cvDate", max: 12, must: false });

  // ── Clearing a chip from the chat (Q3) ──
  if (/\b(anywhere|any location|location (?:is )?(?:flexible|does ?n[o']t matter|not important|no issue)|remove (?:the )?location|any city|location no bar|all over (?:the )?(?:island|country))\b/.test(t)) clear.push("place");
  if (/\b(experience (?:does ?n[o']t matter|not important|no bar|is flexible)|any (?:amount of )?experience|remove (?:the )?(?:years|experience))\b/.test(t)) clear.push("years");
  if (/\b(any gender|both genders|male or female|female or male|gender (?:does ?n[o']t matter|no bar|not important)|remove (?:the )?gender)\b/.test(t)) { clear.push("gender"); t = t.replace(/\b(any gender|both genders|male or female|female or male)\b/g, " "); }
  if (/\b(any age|age (?:does ?n[o']t matter|no bar|not important)|remove (?:the )?age)\b/.test(t)) clear.push("age");
  if (/\b(any nationality|nationality (?:does ?n[o']t matter|no bar))\b/.test(t)) clear.push("nationality");
  if (/\b(salary (?:does ?n[o']t matter|no bar|is flexible)|remove (?:the )?salary)\b/.test(t)) clear.push("salary");
  t = t.replace(/\b(anywhere(?: is fine)?|any location|location (?:is )?(?:flexible|does ?n[o']t matter|not important|no issue)|remove (?:the )?(?:location|years|experience|gender|age|salary)|any city|location no bar|(?:experience|age|gender|nationality|salary) (?:does ?n[o']t matter|not important|no bar|is flexible)|any (?:amount of )?experience|any age|any nationality)\b/g, " ");

  // ── Age, before years: "25-35 years old" is age, never experience ──
  const AGE_UNIT = "(?:years? old|yrs old|years of age|of age|y/?o\\b)";
  const ageRange = t.match(new RegExp(`\\b(?:aged?|age between|age group|between the ages? of)?\\s*(\\d{2})\\s*(?:-|to|and)\\s*(\\d{2})\\s*${AGE_UNIT}`)) ?? t.match(/\b(?:aged|age|age between|age group|age range|age limit|between the ages? of)\s*(?:between\s*)?(\d{2})\s*(?:-|to|and)\s*(\d{2})\b/);
  if (ageRange) {
    chips.push({ field: "age", min: Number(ageRange[1]), max: Number(ageRange[2]), must: !prefAround(ageRange[0]), includeUnknown: false });
    eat(ageRange[0]);
  } else {
    const ageMax = t.match(new RegExp(`\\b(?:not (?:older|more) than|younger than|under|below|less than|max(?:imum)? age(?: of| is)?|age (?:limit|below|under|less than|max(?:imum)?)(?: of| is)?|upto|up to|not above|not over)\\s*(\\d{2})(?!\\d)\\s*(?:${AGE_UNIT})?`));
    const ageMin = t.match(new RegExp(`\\b(?:older than|over|above|at least|minimum age(?: of)?|not younger than|not less than)\\s*(\\d{2})\\s*${AGE_UNIT}`)) ?? t.match(/\b(?:minimum age(?: of| is)?|age (?:above|over|minimum)(?: of)?)\s*(\d{2})\b/);
    const isAge = (m: RegExpMatchArray) => new RegExp(AGE_UNIT).test(m[0]) || /\bage\b|older|younger/.test(m[0]) || (!/experience|years? (?:in|of|as)/.test(t.slice(t.indexOf(m[0]), t.indexOf(m[0]) + m[0].length + 25)) && !/\byears?\b/.test(m[0]) && Number(m[1]) >= 18 && Number(m[1]) <= 70 && !/(salary|k\b|lakh|aed|lkr|rs|notice|days)/.test(t.slice(t.indexOf(m[0]), t.indexOf(m[0]) + m[0].length + 12)) && !/(salary|lkr|rs|aed|usd|qar|sar|gbp)\s*$/.test(t.slice(0, t.indexOf(m[0]))));
    if (ageMax && isAge(ageMax)) { chips.push({ field: "age", max: Number(ageMax[1]), must: !prefAround(ageMax[0]), includeUnknown: false }); eat(ageMax[0]); }
    if (ageMin && isAge(ageMin)) { chips.push({ field: "age", min: Number(ageMin[1]), must: !prefAround(ageMin[0]), includeUnknown: false }); eat(ageMin[0]); }
    const decade = t.match(/\b(?:in (?:their|his|her) )?(early|mid|late)?[ -]?(20|30|40|50)s\b/) ?? t.match(/\b(?:in (?:their|his|her) )(early|mid|late)?[ -]?(twenties|thirties|forties|fifties)\b/);
    if (decade && !ageMax && !ageMin) {
      const base = Number(decade[2]) || { twenties: 20, thirties: 30, forties: 40, fifties: 50 }[decade[2]]!;
      const [lo, hi] = decade[1] === "early" ? [base, base + 3] : decade[1] === "mid" ? [base + 3, base + 6] : decade[1] === "late" ? [base + 6, base + 9] : [base, base + 9];
      chips.push({ field: "age", min: lo, max: hi, must: !prefAround(decade[0]), includeUnknown: false });
      eat(decade[0]);
    }
    const otherYears = /\d+(?:\.\d)?\s*\+?\s*years?\s*(?:of )?(?:experience|exp)/.test(t);
    const bareAge = t.match(/\b(?:below|under|less than|not more than|not above|younger than)\s*(\d{2})\s*years?\b(?! (?:of )?(?:experience|exp))/);
    if (bareAge && !chips.some((c) => c.field === "age") && (otherYears || Number(bareAge[1]) >= 25)) { chips.push({ field: "age", max: Number(bareAge[1]), must: !prefAround(bareAge[0]), includeUnknown: false }); eat(bareAge[0]); }
    const ageOnly = t.match(/\bage (?:of |around |about )?(\d{2})\b(?!\s*(?:-|to|and)\s*\d)/);
    if (ageOnly && !chips.some((c) => c.field === "age")) { const n = Number(ageOnly[1]); chips.push({ field: "age", min: n - 2, max: n + 2, must: !prefAround(ageOnly[0]), includeUnknown: false }); eat(ageOnly[0]); }
    const single = t.match(new RegExp(`\\b(?:around |about )?(\\d{2})\\s*${AGE_UNIT}`));
    if (single && !chips.some((c) => c.field === "age")) { const n = Number(single[1]); chips.push({ field: "age", min: n - 2, max: n + 2, must: !prefAround(single[0]), includeUnknown: false }); eat(single[0]); }
    if (/\b(young|youngsters|fresh graduates?|school leavers?)\b/.test(t) && !chips.some((c) => c.field === "age") && /\byoung\b/.test(t)) unread.push("young (say an age range to filter by age)");
  }

  // ── Years of experience (Q2) ──
  const YRS = "(?:years?|yrs?)(?: of)?(?: (?:work|working|relevant|industry|post[- ]qualification|total))?(?: experience| exp)?";
  const yrsAt = (m: RegExpMatchArray | null) => (m ? m[0] : "");
  let y: RegExpMatchArray | null;
  if ((y = t.match(new RegExp(`\\b(\\d+(?:\\.\\d)?)\\s*(?:-|to|–)\\s*(\\d+(?:\\.\\d)?)\\s*\\+?\\s*${YRS}`)))) {
    chips.push({ field: "years", min: Number(y[1]), max: Number(y[2]), must: !prefAround(y[0]), includeUnknown: true }); eat(y[0]);
  } else if ((y = t.match(new RegExp(`\\b(?:not less than|no less than)\\s*(\\d+(?:\\.\\d)?|${Object.keys(NUMBER_WORDS).join("|")})\\s*${YRS}`)))) {
    chips.push({ field: "years", min: numberIn(y[1])!, must: !prefAround(y[0]), includeUnknown: true }); eat(y[0]);
  } else if ((y = t.match(new RegExp(`\\b(?:not more than|no more than|up to|upto|maximum(?: of)?|less than|under|below|at most|not exceeding|within)\\s*(\\d+(?:\\.\\d)?|${Object.keys(NUMBER_WORDS).join("|")})\\s*${YRS}`)))) {
    chips.push({ field: "years", max: numberIn(y[1])!, must: !prefAround(y[0]), includeUnknown: true }); eat(y[0]);
  } else if ((y = t.match(new RegExp(`\\b(?:at least|minimum(?: of)?|more than|over|above|not less than|no less than)\\s*(\\d+(?:\\.\\d)?|${Object.keys(NUMBER_WORDS).join("|")})\\s*\\+?\\s*${YRS}`)) ?? t.match(new RegExp(`\\b(\\d+(?:\\.\\d)?)\\s*\\+\\s*${YRS}`)) ?? t.match(new RegExp(`\\b(\\d+(?:\\.\\d)?)\\s*${YRS}\\s*(?:\\+|minimum|min|or more|and above|plus|at least)`)))) {
    const n = numberIn(y[1] ?? y[0])!;
    chips.push({ field: "years", min: /more than|over|above/.test(y[0]) ? n : n, must: !prefAround(y[0]), includeUnknown: true }); eat(y[0]);
  } else if ((y = t.match(new RegExp(`\\b(\\d+(?:\\.\\d)?|${Object.keys(NUMBER_WORDS).filter((w) => w.length > 2).join("|")})\\s*${YRS}`)))) {
    // A bare "5 years": filter on 5 or more, rank 5–8 highest (owner decision 3, as recommended).
    const n = numberIn(y[1])!;
    chips.push({ field: "years", min: n, max: null, must: !prefAround(y[0]), includeUnknown: true, qualifier: `prefer-${n}-${n + Math.max(2, Math.ceil(n / 2))}` }); eat(y[0]);
  } else if ((y = t.match(/\b(fresher|freshers|fresh graduate|no experience|entry level|0 experience)\b/))) {
    chips.push({ field: "years", max: 1, must: true, includeUnknown: true }); eat(y[0]);
  } else if ((y = t.match(/\b(?:at least|minimum)?\s*(?:a|one) year\b/))) {
    chips.push({ field: "years", min: 1, must: true, includeUnknown: true }); eat(y[0]);
  }
  void yrsAt;

  // ── Money (Q11) ──
  const salaryM = t.match(/\b(salary|package|ctc|pay|expecting|expectation|earning|drawing|budget)\b(?:[^;]|$){0,40}/);
  if (salaryM) {
    const seg = salaryM[0];
    const money = readMoney(seg);
    if (money && money.amount >= 100) {
      const lower = /\b(above|over|more than|at least|minimum|from)\b/.test(seg) && !/\b(below|under|less than|up to|upto|max|within|not more than)\b/.test(seg);
      chips.push({ field: "salary", ...(lower ? { min: money.amount } : { max: money.amount }), currency: money.currency ?? undefined, qualifier: /\b(current|drawing|earning|present)\b/.test(seg) ? "current" : "expected", must: !PREF.test(seg), includeUnknown: true, label: money.period ?? undefined });
      eat(seg);
    }
  }

  // ── Notice (Q10) ──
  if ((y = t.match(/\b(immediate(?:ly)?(?: joiners?| available| start)?|available (?:now|immediately)|can (?:join|start) (?:immediately|at once|now))\b/))) { chips.push({ field: "notice", max: 7, must: true, includeUnknown: true }); eat(y[0]); }
  else if ((y = t.match(/\b(?:notice(?: period)?|can (?:join|start)|join(?:ing)?)\s*(?:of|is|period)?\s*(?:less than|under|within|below|not more than|max(?:imum)?|up to|in)?\s*(?:(\d+|a|one|two|three)\s*(month|months|week|weeks|days?))\b/))) {
    const n = numberIn(y[1]) ?? 1;
    const days = /month/.test(y[2]) ? n * 30 : /week/.test(y[2]) ? n * 7 : n;
    chips.push({ field: "notice", max: days, must: !prefAround(y[0]), includeUnknown: true }); eat(y[0]);
  }

  // ── Gender (Q1, Q6) ──
  // "nurse in Male" is the Maldives capital; gender words after "in/at/from/based in" are places.
  const placeMale = /\b(?:in|at|from|based in|located in|living in) male\b/;
  const gt = t.replace(placeMale, " in maldivesmale ");
  const g = gt.match(/\b(?:only |strictly )?(female|females|girls?|male|males|boys?)(?: only| candidates? only)?\b/);
  if (g) {
    const at = gt.indexOf(g[0]);
    const val = /^(fe|girl)/.test(g[1]) ? "female" : "male";
    // "no males" negates only the word it names: "female candidates only, no
    // males" stays female (it was flipped to male, the held-out set, 25 Nov).
    const neg = negBefore(at, 25) || (val === "female" ? /\bno females?\b/ : /\bno males?\b/).test(gt);
    chips.push({ field: "gender", values: [neg ? (val === "female" ? "male" : "female") : val], must: !prefAround(g[0]), includeUnknown: false, label: neg ? `not ${val}` : undefined });
    if (/\b(female|male)s? or (fe)?males?\b/.test(gt)) chips.pop();
    t = gt.replace(g[0], " ");
  } else t = gt;

  // ── Languages, visa, licence (before places: "UAE driving licence" is not a place) ──
  for (const l of LANGUAGES) {
    const m = t.match(new RegExp(`\\b${l}(?:[- ]speaking| speaker| fluent| fluency)\\b|\\bfluent in ${l}\\b|\\b(?:speaks?|speak) ${l}\\b`));
    if (m) { chips.push({ field: "language", values: [l[0].toUpperCase() + l.slice(1)], must: !prefAround(m[0]) }); t = t.replace(m[0], " "); }
  }
  if ((y = t.match(/\b(transferable visa|visa transferable|noc available|with noc)\b/))) { chips.push({ field: "visa", values: ["employment_visa_transferable", "residence_visa", "golden_visa", "citizen"], must: !prefAround(y[0]), includeUnknown: false }); eat(y[0]); }
  else if ((y = t.match(/\b(visit visa|on visit)\b/))) { chips.push({ field: "visa", values: ["visit_visa"], must: !prefAround(y[0]), includeUnknown: false }); eat(y[0]); }
  else if ((y = t.match(/\b(golden visa)\b/))) { chips.push({ field: "visa", values: ["golden_visa"], must: !prefAround(y[0]), includeUnknown: false }); eat(y[0]); }
  else if ((y = t.match(/\b(right to work|no sponsorship)\b/))) { chips.push({ field: "visa", values: ["citizen", "right_to_work"], must: true, includeUnknown: false }); eat(y[0]); }
  if ((y = t.match(/\b(uae|gcc|gulf|qatar|saudi|ksa)? ?(heavy|light)? ?(vehicle )?(driving )?licen[cs]e\b/)) && /(driving|vehicle)/.test(y[0])) {
    const gcc = !!y[1];
    const heavy = y[2] === "heavy";
    chips.push({ field: "licence", values: gcc ? (heavy ? ["gcc_heavy"] : ["gcc_light", "gcc_heavy"]) : heavy ? ["gcc_heavy", "lk_heavy"] : ["gcc_light", "gcc_heavy", "lk_light", "lk_heavy", "uk_full", "in_light"], must: !prefAround(y[0]), includeUnknown: false });
    eat(y[0]);
  }

  // ── Qualifications, with status (before places: "CA Sri Lanka" is not a place) ──
  const qualChips: Chip[] = [];
  for (const q of QUAL_PHRASES) {
    const re = q.phrase.length <= 3 && !["cima", "acca", "aat", "cfa", "pmp", "mba", "hnd", "llb", "dha", "nmc"].includes(q.phrase) ? wordRe(q.phrase, "") : wordRe(q.phrase);
    const m = (q.phrase.length <= 3 ? ` ${caps.replace(/[^A-Za-z0-9/&. ]/g, " ")} ` : t).match(q.phrase.length <= 3 ? new RegExp(`(?<![A-Za-z0-9])${q.phrase.toUpperCase().replace(/[./]/g, (c) => `\\${c}`)}(?![A-Za-z0-9])`) : re);
    if (!m) continue;
    if (q.phrase === "ca" && !/\bCA\b/.test(caps)) continue;
    const at = t.indexOf(q.phrase);
    const win = t.slice(Math.max(0, at - 30), at + q.phrase.length + 30);
    const status = /part[- ]qualified|partly/.test(win) ? "part_qualified" : /fully qualified|member|chartered|passed|\bqualified\b/.test(win) && !/finalist/.test(win) ? "member" : /finalist|affiliate/.test(win) ? "finalist" : /part[- ]qualified|partly|some papers|levels?/.test(win) ? "part_qualified" : /studying|reading|student/.test(win) ? "studying" : null;
    const kind = QUAL_BY_ID.get(q.id)!.kind;
    const min = status ?? (kind === "professional" ? "part_qualified" : "holds");
    const neg = at >= 0 && negBefore(at, 18);
    if (!chips.some((c) => c.field === "qualification" && c.values!.includes(q.id))) qualChips.push({ field: "qualification", values: [q.id], qualifier: min, not: neg || undefined, must: !(at >= 0 ? prefAround(q.phrase) : PREF.test(t)) });
    if (at >= 0) t = t.replace(q.phrase, " ");
    if (status) t = t.replace(/\b(fully qualified|passed finalist|finalist|affiliate|part qualified|member|studying|reading for)\b/, " ");
  }
  chips.push(...qualChips);

  // ── Nationality ──
  for (const d of DEMONYMS) {
    const re = wordRe(d.phrase);
    const m = t.match(re);
    if (!m || d.code === "*expat") continue;
    const at = t.indexOf(m[0]);
    // "Sri Lankan" right before a role or "nationals"/"candidates" is nationality; "Sri Lankan company" is not.
    const after = t.slice(at + m[0].length, at + m[0].length + 25);
    if (/^\s*(compan|firm|bank|market|experience|operations?|subsidiar)/.test(after)) continue;
    // "except Saudi", "in Saudi", "worked in Saudi" name the country, not a nationality.
    if (/\b(in|except|outside|to|across|than|worked|working|experience)\s*(?:the\s*)?$/.test(t.slice(Math.max(0, at - 20), at))) continue;
    const neg = negBefore(at);
    const prev = chips.find((c) => c.field === "nationality" && !!c.not === neg);
    if (prev) prev.values!.push(d.code); else chips.push({ field: "nationality", values: [d.code], not: neg || undefined, must: !prefAround(m[0]), includeUnknown: false });
    eat(m[0]);
  }

  // ── Places: lived in vs worked in, negation, "or" lists (Q1, Q4, F1), in the order typed ──
  const found: { at: number; len: number; id: string; phrase: string }[] = [];
  {
    let scan = t;
    for (const p of PLACE_PHRASES) {
      const re = new RegExp(wordRe(p.phrase).source, "gi");
      for (const m of scan.matchAll(re)) {
        const at = m.index!;
        const after = scan.slice(at + m[0].length, at + m[0].length + 14);
        if (/^\s*(road|rd|street|mawatha)\b/.test(after)) continue;
        const before = scan.slice(Math.max(0, at - 30), at);
        if (p.phrase === "male" && !/\b(in|at|from|based in|living in)\s*$/.test(before)) continue;
        found.push({ at, len: m[0].length, id: /^colombo \d/.test(p.phrase) ? p.id : widenLk(p.id), phrase: m[0] });
        scan = scan.slice(0, at) + " ".repeat(m[0].length) + scan.slice(at + m[0].length);
      }
    }
  }
  found.sort((a, b) => a.at - b.at);
  let lastPlace: Chip | null = null;
  let lastEnd = -1;
  for (const f of found) {
    const before = t.slice(Math.max(0, f.at - 30), f.at);
    const after = t.slice(f.at + f.len, f.at + f.len + 14);
    const wbefore = orig.slice(Math.max(0, orig.indexOf(f.phrase) - 40), Math.max(0, orig.indexOf(f.phrase)));
    const nowThere = /\b(currently|now|presently)\b/.test(wbefore);
    const worked = !nowThere && (/\b(worked|working|experience|exp|employed|served|stint)\b[^,.;]{0,22}$/.test(wbefore) || /^\s*(experience|exp|returnees?|returned)\b/.test(after) || /\bex[- ]$/.test(before));
    const country = PLACE_BY_ID.get(f.id)?.kind === "country";
    // "nurses not from India", "people from the Philippines": a country after "from" is nationality.
    if (country && !worked && /\bfrom\s*(?:the\s*)?$/.test(before)) {
      const neg = negBefore(f.at, 30);
      chips.push({ field: "nationality", values: [PLACE_BY_ID.get(f.id)!.country!], not: neg || undefined, must: !prefAround(f.phrase), includeUnknown: false });
      t = t.slice(0, f.at) + " ".repeat(f.len) + t.slice(f.at + f.len);
      continue;
    }
    const field: Field = worked ? "workedIn" : "place";
    // "outside Colombo and Gampaha": the negation carries over a list.
    const between = lastEnd >= 0 ? t.slice(lastEnd, f.at) : "";
    const listed: boolean = !!lastPlace && lastPlace.field === field && /^\s*(,|and|or|&|\/)?\s*(,|and|or)?\s*$/.test(between);
    const neg: boolean = listed ? !!lastPlace!.not : negBefore(f.at);
    const pref = prefAround(f.phrase);
    const prev: Chip | undefined = chips.find((c) => c.field === field && !!c.not === neg && c.must === !pref);
    if (prev) { prev.values!.push(f.id); lastPlace = prev; }
    else { lastPlace = { field, values: [f.id], not: neg || undefined, must: !pref, includeUnknown: field === "place" ? true : undefined }; chips.push(lastPlace); }
    lastEnd = f.at + f.len;
    t = t.slice(0, f.at) + " ".repeat(f.len) + t.slice(f.at + f.len);
  }
  if (/\b(overseas|abroad|foreign) (experience|exposure)\b/.test(t)) { chips.push({ field: "workedIn", values: ["g-overseas"], must: !PREF.test(t) }); t = t.replace(/\b(overseas|abroad|foreign) (experience|exposure)\b/, " "); }

  // ── Company types and companies (Q6: Big 4 is a type, not the company "Big") ──
  for (const c of COMPANY_TYPE_PHRASES) {
    const m = t.match(wordRe(c.phrase));
    if (!m) continue;
    const at = t.indexOf(m[0]);
    if (c.id === "bank" && /\b(bank (?:reconciliation|statements?|teller))/.test(t.slice(at, at + 25))) continue;
    if (c.id === "hotel" && !/\b(hotel|resort|5 star|five star)/.test(m[0])) continue;
    const now = /\b(currently|now|presently|working (?:at|in))\b[^,.;]{0,30}$/.test(t.slice(0, at));
    // "Apparel merchandiser", "bank teller": a word describing the role ranks, it does not filter.
    const adjective = ROLE_PHRASES.some((r) => !r.caps && t.slice(at + m[0].length).trimStart().startsWith(r.phrase));
    chips.push({ field: "companyType", values: [c.id], qualifier: now ? "now" : "ever", not: negBefore(at, 20) || undefined, must: !adjective && !prefAround(m[0]) });
    t = t.replace(m[0], " ");
  }
  for (const e of EMPLOYER_PHRASES) {
    const m = t.match(wordRe(e.phrase));
    if (!m) continue;
    const at = t.indexOf(m[0]);
    const before = t.slice(Math.max(0, at - 25), at);
    const neg = /\b(not from|not at|not in|excluding|except|other than|no one from|nobody from|not currently at|not working at)\s*$/.test(before);
    const now = /\b(currently|now|presently)\b[^,.;]{0,20}$/.test(before);
    chips.push({ field: "company", values: [e.name], qualifier: neg ? "now" : now ? "now" : "ever", not: neg || undefined, must: !prefAround(m[0]) });
    t = t.replace(m[0], " ");
  }

  // ── Role and level ──
  const roleChips: Chip[] = [];
  let levelFromRole: number | null = null;
  for (const r of ROLE_PHRASES) {
    const re = r.caps ? new RegExp(`(?<![A-Za-z0-9])${r.phrase.toUpperCase().replace(/[.&]/g, (c) => `\\${c}`)}s?(?![A-Za-z0-9])`) : wordRe(r.phrase);
    const hay = r.caps ? caps : t;
    const m = hay.match(re);
    if (!m) continue;
    if (r.caps && r.phrase === "it") continue;
    const at = r.caps ? t.indexOf(r.phrase) : t.indexOf(m[0]);
    const pre = at >= 0 ? t.slice(Math.max(0, at - 25), at) : "";
    const lvlWords = ((pre.match(/\b(senior|junior|trainee|intern|assistant manager|assistant|head of|chief|team lead|lead|principal|deputy|associate)\s*$/)?.[1] ?? "") + " " + r.phrase).replace(/s\b/g, "");
    let lv = levelFromTitle(lvlWords.trim());
    // "talent acquisition intern", "accountant trainee": the junior word comes after the role.
    const post = at >= 0 ? t.slice(at + m[0].length, at + m[0].length + 14) : "";
    if (/^\s*(interns?|internship|trainees?|apprentices?)\b/.test(post)) { lv = 0; levelFromRole = 0; }
    if (lv != null && (levelFromRole == null || lv > levelFromRole) && (/\b(senior|junior|trainee|intern|head|chief|lead|manager|director|supervisor|assistant manager|cfo|ceo|coo|cto|gm|agm|dgm|executive assistant)\b/.test(lvlWords))) levelFromRole = lv;
    const neg = at >= 0 && negBefore(at, 20);
    const ever = /\b(ex|former|formerly|previously|used to be|background as|worked as|was an?|past experience as)\b[^,.;]{0,15}$/.test(pre);
    const q = ever ? "ever" : "now";
    for (const role of ROLES_FOR_PHRASE.get(r.phrase) ?? [r.role]) {
      if (roleChips.some((c) => c.values!.includes(role) && !!c.not === neg && c.qualifier === q)) continue;
      const prev = roleChips.find((c) => !!c.not === neg && c.qualifier === q);
      if (prev) prev.values!.push(role);
      else roleChips.push({ field: "role", values: [role], not: neg || undefined, qualifier: q, must: true });
    }
    if (at >= 0) t = t.slice(0, at) + " ".repeat(r.phrase.length) + t.slice(at + r.phrase.length);
  }
  // Typos ("acountant") on the role's head word.
  if (!roleChips.length) {
    for (const w of t.split(" ")) {
      if (w.length < 6 || /^(experience|experienced|candidate|candidates|someone|preferably|position|required|minimum|maximum|working|exclude|excluding|qualified|between|matter|profiles?)$/.test(w)) continue;
      for (const [head, role] of ROLE_HEADS) {
        if (Math.abs(head.length - w.length) <= 2 && lev(w, head) <= (head.length >= 9 ? 2 : 1)) { roleChips.push({ field: "role", values: [role], qualifier: "now", must: true, label: `${ROLE_BY_ID.get(role)!.label} (read "${w}")` }); break; }
      }
      if (roleChips.length) break;
    }
  }
  chips.push(...roleChips);
  // Level: from the role phrase it is a preference; "manager level only", "or above" make it a must.
  let lvlM2: RegExpMatchArray | null = null;
  const lvlM = t.match(/\b(?:(only|strictly)\s+)?(?:at\s+)?(trainee|junior|executive|senior executive|assistant manager|manager|senior manager|head|director|gm|c-?suite)\s+(?:level|grade|and above|or above|or higher|and below|or below)(?:\s+only)?\b/);
  if (lvlM) {
    const map: Record<string, number> = { trainee: 0, junior: 1, executive: 1, "senior executive": 2, "assistant manager": 3, manager: 4, "senior manager": 5, head: 6, director: 7, gm: 7, "c-suite": 8, csuite: 8 };
    const r0 = map[lvlM[2]];
    chips.push({ field: "level", min: /below/.test(lvlM[0]) ? 0 : r0, max: /above|higher/.test(lvlM[0]) ? 8 : r0, must: true });
    eat(lvlM[0]);
  } else if (levelFromRole != null) {
    chips.push({ field: "level", min: levelFromRole, max: levelFromRole, must: false });
  } else if (roleChips.length && (lvlM2 = t.match(/\b(who is|who's|who are|that is|that are|thats|is|are|must be|should be|has to be|have to be|needs to be|need to be|only)\s+(?:an?\s+)?(trainee|intern|junior|senior|team lead|supervisor|assistant manager|senior manager|manager|head|director)s?\b(?!\s+(?:level|grade|and|or)\b)/))) {
    // Seniority said apart from the role: "an accountant who is a senior" is
    // the same preference as "a senior accountant"; "must be senior" makes it a must.
    const lv = levelFromTitle(lvlM2[2]);
    if (lv != null) chips.push({ field: "level", min: lv, max: lv, must: /must|has to|have to|needs? to|only/.test(lvlM2[1]) });
  } else if (!roleChips.length) {
    // A later message about seniority alone: "make it a team lead".
    const lw = t.match(/\b(trainee|junior|senior|team lead|supervisor|assistant manager|senior manager|manager|head|director)\b/);
    if (lw) { const lv = levelFromTitle(lw[1]); if (lv != null) chips.push({ field: "level", min: lv, max: lv, must: false }); }
  }

  // ── Skills and keywords: whole words, preference unless "must"/"only"/"mandatory" ──
  for (const s of SKILLS) {
    const k = norm(s);
    const re = k.length <= 3 ? new RegExp(`(?<![A-Za-z0-9])${s.replace(/[.+#]/g, (c) => `\\${c}`)}(?![A-Za-z0-9])`) : wordRe(k);
    const m = (k.length <= 3 ? caps : t).match(re);
    if (!m) continue;
    const at = t.indexOf(k);
    const win = at >= 0 ? t.slice(Math.max(0, at - 30), at + k.length + 20) : t;
    if (!chips.some((c) => c.field === "skill" && c.values!.some((v) => norm(v).includes(k)))) chips.push({ field: "skill", values: [s], not: (at >= 0 && negBefore(at, 15)) || undefined, must: MUST.test(win) && !PREF.test(win) });
    if (at >= 0) t = t.replace(k, " ");
  }
  // Leftover meaningful words are shown back, never silently made into filters (Q7, Q8, R8).
  const STOP = /^(a|an|the|and|or|with|who|has|have|in|at|of|to|for|from|on|is|are|be|any|some|someone|somebody|person|people|candidates?|profiles?|cvs?|looking|need|want|find|me|show|get|please|good|strong|solid|experience|experienced|years?|background|knowledge|knows|skills?|level|role|roles|job|position|working|work|worked|currently|now|based|living|located|must|should|only|ideally|preferably|preferred|also|plus|but|not|no|than|more|less|least|maximum|minimum|like|similar|someone|that|this|those|these|can|able|will|would|good|well|very|etc|field|industry|sector|company|companies|firm|firms|exposure|qualified|nationals?|candidates?|staff|hire|hiring|urgently|urgent|immediately|age|aged|old|year|lakhs?|salary|expected|below|above|under|over|within|between|both|either|which|whom|whose|ex|exclude|excluding|except|ex-|ex|i|we|our|us|they|them|their|his|her|it|its|as|by|if|so|up|out|all|other|than|into|about|around|any|also|too|just|really|mainly)$/;
  const left = t.split(/\s+/).filter((w) => w.length > 2 && !STOP.test(w) && !/^\d+$/.test(w) && !/^[^a-z]+$/.test(w));
  unread.push(...left);
  // "ACCA or CIMA", "Brandix or MAS", "5 star hotels": one chip each, any value counts.
  const merged: Chip[] = [];
  for (const c of chips) {
    const m = ["qualification", "company", "companyType", "licence", "language", "nationality"].includes(c.field) && merged.find((x) => x.field === c.field && !!x.not === !!c.not && x.must === c.must && x.qualifier === c.qualifier);
    if (m) m.values = [...new Set([...m.values!, ...c.values!])];
    else merged.push(c);
  }
  return { chips: merged, clear, unread, additive };
}

/**
 * Apply a message's reading to the spec so far. Single-value fields (place,
 * years, age, gender, level, salary, notice, cvDate) are replaced by a new
 * chip of the same field; lists (skills, qualifications, companies) add up.
 * A removed chip stays removed: nothing here re-reads earlier messages (Q5, P4).
 */
export function applyRead(spec: Spec, read: Read): Spec {
  let chips = spec.chips.filter((c) => !read.clear.includes(c.field));
  const REPLACE: Field[] = ["place", "years", "age", "gender", "level", "salary", "notice", "cvDate", "nationality", "role"];
  for (const c of read.chips) {
    if (REPLACE.includes(c.field)) {
      // "not in Kandy" adds to a positive place; "in Colombo instead" replaces it.
      const same = (x: Chip) => x.field === c.field && !!x.not === !!c.not && (c.field !== "role" || !c.not);
      if (read.additive && (c.field === "place" || c.field === "role")) {
        // "also Sharjah": add to the chip of that field.
        const prev = chips.find((x) => x.field === c.field && !!x.not === !!c.not);
        if (prev) { prev.values = [...new Set([...prev.values!, ...c.values!])]; continue; }
      } else if (c.field === "role" && chips.some((x) => x.field === "role" && !x.not) && !c.not) {
        // A second role in a later message replaces the first, unless it says "or"/"also".
        chips = chips.filter((x) => !(x.field === "role" && !x.not));
      } else if (c.field === "age" && (c.min == null || c.max == null)) {
        // "under 35" after "over 25" narrows the range rather than replacing it.
        const prev = chips.find((x) => x.field === "age");
        if (prev) { chips = chips.filter((x) => x !== prev); c.min ??= prev.min; c.max ??= prev.max; }
      } else chips = chips.filter((x) => !same(x));
    }
    // "not in Colombo" after "in Colombo": the later message wins, so the value leaves the opposite chip.
    if (c.values?.length) {
      chips = chips.flatMap((x) => {
        if (x.field !== c.field || !!x.not === !!c.not || !x.values) return [x];
        const left = x.values.filter((v) => !c.values!.includes(v));
        return left.length ? [{ ...x, values: left }] : [];
      });
    }
    chips.push(c);
  }
  return { chips, question: read.question ?? null, unread: read.unread };
}

/** The whole conversation, message by message. */
export function readConversation(turns: string[], start: Spec = { chips: [] }): Spec {
  return turns.reduce((spec, msg) => applyRead(spec, readMessage(msg)), start);
}

export function chipLabel(c: Chip): string {
  if (c.label && !/^(month|year)$/.test(c.label)) return c.label;
  const vals = (c.values ?? []).map((v) => ROLE_BY_ID.get(v)?.label ?? PLACE_BY_ID.get(v)?.name ?? QUAL_BY_ID.get(v)?.label ?? v).join(" or ");
  const range = c.min != null && c.max != null ? `${c.min}–${c.max}` : c.min != null ? `${c.min}+` : c.max != null ? `up to ${c.max}` : "";
  const what = { role: "", level: "level ", place: "in ", nationality: "", workedIn: "worked in ", years: "", age: "age ", gender: "", qualification: "", companyType: "", company: "", skill: "", keyword: "", cvDate: "CV from last ", salary: "salary ", notice: "notice ", language: "", visa: "visa ", licence: "licence " }[c.field];
  const unit = c.field === "years" ? " years" : c.field === "cvDate" ? " months" : c.field === "notice" ? " days" : "";
  return `${c.not ? "not " : ""}${what}${vals}${range}${unit}${c.must ? "" : " (preferred)"}`.trim();
}
