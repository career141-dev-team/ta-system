/**
 * The AI reader's prompt and the checks on its answer, with no Node
 * dependencies, so the same code runs in the lab and in the try-it page.
 */
import { ROLES, ROLE_BY_ID } from "./lists/roles";
import { LEVELS } from "./lists/levels";
import { QUALIFICATIONS, QUAL_BY_ID, VISA_STATUSES, DRIVING_LICENCES } from "./lists/qualifications";
import { COMPANY_TYPES, EMPLOYERS } from "./lists/companies";
import { GROUPS, PLACE_BY_ID, COUNTRY_BY_CODE, resolvePlace, widenLk } from "./lists/places";
import type { Chip, Field, Spec } from "./types";
import { readMessage, applyRead } from "./ruleReader";
import { norm } from "./vocab";

export const READER_SYSTEM = `You turn a recruiter's search message into search chips for a candidate database (international: Sri Lanka, the Gulf, India, the UK and more). You are given the chips so far and the new message; return the COMPLETE updated list of chips as JSON: {"chips": [...], "question": null or "a short question only for a real ambiguity", "unread": ["words you could not use"]}.

A chip: {"field": F, "values": [...], "min": n, "max": n, "not": true|false, "must": true|false, "includeUnknown": true|false, "qualifier": "...", "currency": "ISO"}
Fields:
- role: values = role ids below. The occupation only; the seniority goes in level. "PA to CEO" is role personal_assistant (the boss is context). qualifier "now" (default) or "ever" ("ex-", "former", "background as").
- level: min/max ranks on this ladder: ${LEVELS.map((l) => `${l.rank} ${l.label}`).join("; ")}. A level word inside the role ("Senior Accountant", "HR Manager") is must false with min=max at that rank. "manager level only", "manager or above" is must true.
- place: where the person LIVES now. values = place names as written (city, district, province, country) or a group: ${GROUPS.map((g) => g.name).join(", ")}. "Colombo" means the Colombo district including suburbs. includeUnknown true unless the TA says only confirmed.
- workedIn: countries or groups the person WORKED in ("Gulf experience", "worked in Qatar", "returnees from the Middle East").
- nationality: values = ISO country codes ("Sri Lankans" = LK). Nationality is not residence.
- years: years of work experience, min/max. A bare "5 years" = min 5, must, qualifier "prefer-5-8" (the figure plus 2, or plus half of it when that is more). "not more than 6 years" = max 6. "5 years minimum" = min 5, no max. includeUnknown true.
- age: the person's age in years, min/max. "25-35 years old", "aged 25 to 35", "not older than 40", "under 30" (when no experience word), "in their 30s" are AGE, never experience. includeUnknown false.
- gender: values ["female"] or ["male"]. "ladies", "women", "female only" = female. "not women", "no females", "exclude female candidates" = values ["male"]. "nurse in Male" is the city Malé (place), not a gender. "male or female", "any gender" = no gender chip. includeUnknown false.
- qualification: values = qualification ids below; qualifier = lowest status that counts: "member" (fully qualified, member, chartered), "finalist", "part_qualified", "studying", or "holds" (degrees, licences, certificates). Professional bodies default to "part_qualified".
- companyType: values = ${COMPANY_TYPES.map((c) => c.id).join(", ")}. "Big 4" is big4, never a company called Big. qualifier "now" or "ever" (default ever).
- company: values = company names as written ("Dialog", "MAS"). "not from Dialog" is not true, qualifier "now".
- skill: values = a skill or tool ("SAP", "IFRS", "Python"). must false unless the TA says must/only/mandatory.
- keyword: a word that must appear in the profile, only when the TA lists keywords explicitly.
- cvDate: max = months since the CV came in ("CVs from the last 2 years" = 24).
- salary: min/max in FULL units (1.5 lakhs = 150000, 85k = 85000, 12 LPA = 1200000); currency ISO code or null; qualifier "expected" (default) or "current".
- notice: max days (immediate = 7, one month = 30).
- language: values = language names. visa: values from ${VISA_STATUSES.join(", ")}. licence: values from ${DRIVING_LICENCES.join(", ")}.

Must or preference: everything the TA states is must true, except: level read from a role title; skills; and anything marked "preferably", "ideally", "nice to have", "an advantage", "preferred". Negation ("not", "no", "exclude", "except", "outside", "other than") sets not true on the chip it governs.
Conversation: the new message changes the chips so far. A new place, years, age, gender, level, role, salary or notice REPLACES the old chip of that field unless the message says "also"/"or". "anywhere is fine", "location doesn't matter" removes place chips; "experience doesn't matter" removes years; "any gender" removes gender. Skills, qualifications and companies add up. Never bring back a chip that is not in the chips so far unless the new message asks for it.

ROLE ids: ${ROLES.map((r) => `${r.id} (${r.label})`).join("; ")}
QUALIFICATION ids: ${QUALIFICATIONS.map((q) => `${q.id} (${q.label})`).join("; ")}
Answer with the JSON only.`;

export const readerUser = (spec: Spec, message: string) =>
  `Chips so far: ${JSON.stringify(spec.chips.map(({ label: _l, ...c }) => c))}\nNew message: ${message}`;

const FIELDS = new Set<Field>(["role", "level", "place", "nationality", "workedIn", "years", "age", "gender", "qualification", "companyType", "company", "skill", "keyword", "cvDate", "salary", "notice", "language", "visa", "licence"]);
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);

function placeId(v: string): string | null {
  const g = GROUPS.find((x) => norm(x.name) === norm(v) || x.aliases.includes(norm(v)));
  if (g) return g.id;
  if (PLACE_BY_ID.has(v)) return v;
  if (/^colombo$/i.test(v.trim())) return "lk-d-colombo";
  if (/^mal[eé]'?$/i.test(v.trim())) return "mv-male";
  const id = resolvePlace(v);
  return id && !/colombo \d/i.test(v) ? widenLk(id) : id;
}

/** Check one chip from the model against the lists; null if it cannot be used. */
export function checkChip(c: Record<string, unknown>): Chip | null {
  const field = c.field as Field;
  if (!FIELDS.has(field)) return null;
  const vals = Array.isArray(c.values) ? (c.values as unknown[]).map(String) : [];
  const out: Chip = { field, must: c.must !== false, ...(c.not ? { not: true } : {}) };
  if (num(c.min) != null) out.min = num(c.min);
  if (num(c.max) != null) out.max = num(c.max);
  if (typeof c.includeUnknown === "boolean") out.includeUnknown = c.includeUnknown;
  if (typeof c.qualifier === "string") out.qualifier = c.qualifier;
  if (typeof c.currency === "string" && c.currency) out.currency = c.currency.toUpperCase();
  switch (field) {
    case "role": out.values = vals.filter((v) => ROLE_BY_ID.has(v)); break;
    case "place": case "workedIn": out.values = vals.map((v) => (field === "workedIn" && COUNTRY_BY_CODE.has(v.toUpperCase()) ? `c-${v.toUpperCase()}` : placeId(v))).filter((v): v is string => !!v); break;
    case "nationality": out.values = vals.map((v) => v.toUpperCase()).filter((v) => COUNTRY_BY_CODE.has(v)); break;
    case "gender": out.values = vals.filter((v) => v === "male" || v === "female"); break;
    case "qualification": out.values = vals.filter((v) => QUAL_BY_ID.has(v)); out.qualifier ??= QUAL_BY_ID.get(out.values[0])?.kind === "professional" ? "part_qualified" : "holds"; break;
    case "companyType": out.values = vals.filter((v) => COMPANY_TYPES.some((t) => t.id === v)); break;
    case "company": out.values = vals.map((v) => EMPLOYERS.find((e) => [e.name, ...e.aliases].some((n) => norm(n) === norm(v)))?.name ?? v); break;
    case "visa": out.values = vals.filter((v) => (VISA_STATUSES as readonly string[]).includes(v)); break;
    case "licence": out.values = vals.filter((v) => (DRIVING_LICENCES as readonly string[]).includes(v)); break;
    case "skill": case "keyword": case "language": out.values = vals.filter(Boolean); break;
    default: break;
  }
  const ranged = ["level", "years", "age", "cvDate", "salary", "notice"].includes(field);
  if (ranged ? out.min == null && out.max == null : !out.values?.length) return null;
  if (["age", "gender"].includes(field) && out.includeUnknown == null) out.includeUnknown = false;
  if (["years", "place", "salary", "notice"].includes(field) && out.includeUnknown == null) out.includeUnknown = true;
  return out;
}

/**
 * Turn the model's answer into the updated spec: every chip checked against
 * the lists, the rule reader's chip used where the model's does not check
 * out, and the owner's "at Dialog means now or before" rule applied.
 * Null when the answer is not usable (the caller keeps the rule reading).
 */
export function specFromAnswer(spec: Spec, message: string, text: string | null): Spec | null {
  const rules = applyRead(spec, readMessage(message));
  const j = jsonOf<{ chips?: unknown[]; question?: string | null; unread?: string[] }>(text);
  if (!j || !Array.isArray(j.chips)) return null;
  const chips = j.chips.map((c) => checkChip(c as Record<string, unknown>)).filter((c): c is Chip => !!c);
  // Owner, 9 Oct: "at Dialog", "in Dialog", "from Dialog" mean now or before; only "currently/now" narrows it.
  const saysNow = /\b(currently|now|presently|current)\b/i.test(message);
  for (const c of chips) if ((c.field === "company" || c.field === "companyType") && c.qualifier === "now" && !c.not && !saysNow) c.qualifier = "ever";
  // A field the model named but whose values did not check out falls back to the rule reader's chip.
  const named = new Set((j.chips as { field?: string }[]).map((c) => c.field));
  for (const f of named) if (!chips.some((c) => c.field === f)) chips.push(...rules.chips.filter((c) => c.field === f));
  return { chips, question: j.question ?? null, unread: j.unread ?? [] };
}

/** A JSON answer, tolerating a code fence or words around it. */
export function jsonOf<T = unknown>(text: string | null): T | null {
  if (!text) return null;
  const t = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(t) as T; } catch {
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(t.slice(a, b + 1)) as T; } catch { return null; }
  }
}
