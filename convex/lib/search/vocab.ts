/** Word lists the rule-based reader needs, built from the fixed lists. */
import { ROLES } from "./lists/roles";
import { QUALIFICATIONS } from "./lists/qualifications";
import { COMPANY_TYPES, EMPLOYERS } from "./lists/companies";
import { PLACES, GROUPS, COUNTRIES } from "./lists/places";
import { ROLE_GEN } from "./lists/roleData";

export const norm = (s: string) =>
  s.toLowerCase().replace(/(\d),(?=\d{2,3}\b)/g, "$1").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[–—]/g, "-").replace(/[^a-z0-9+#&./',; -]+/g, " ").replace(/([,;])/g, " $1 ").replace(/\s+/g, " ").trim();

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole words only, so SAP never matches WhatsApp and HR never matches three (F2, Q7). */
export const wordRe = (phrase: string, flags = "i") => new RegExp(`(?<![a-z0-9])${esc(phrase)}(?![a-z0-9])`, flags);

/** Role phrases, longest first. Short ones (HR, QS, PA, BA) only when typed in capitals, except hr/qs. */
export const ROLE_PHRASES: { phrase: string; role: string; caps: boolean }[] = (() => {
  const out: { phrase: string; role: string; caps: boolean }[] = [];
  for (const r of ROLES) for (const t of new Set([...r.titles, r.label.toLowerCase().split(" / ")[0]])) {
    const p = norm(t);
    if (!p) continue;
    out.push({ phrase: p, role: r.id, caps: p.length <= 3 && !["hr", "qs"].includes(p) });
    // Plurals: accountants, nurses, QSs, HR executives.
    if (!/s$/.test(p) && p.length > 3) out.push({ phrase: `${p}s`, role: r.id, caps: false });
  }
  const extra: [string, string][] = [["accounts", "accountant"], ["finance", "accountant"], ["accounting", "accountant"], ["hr people", "hr"], ["hr person", "hr"], ["human resource", "hr"], ["coders", "software_engineer"], ["devs", "software_engineer"], ["engineer software", "software_engineer"], ["testers", "qa_engineer"], ["qa", "qa_engineer"], ["nursing", "nurse"], ["cooks", "chef"], ["drivers", "driver"], ["secretaries", "personal_assistant"], ["pas", "personal_assistant"], ["sales people", "sales"], ["salesman", "sales"], ["salesmen", "sales"], ["bdm", "sales"], ["quantity surveying", "quantity_surveyor"], ["merchandising", "merchandiser"], ["auditors", "auditor"], ["audit", "auditor"], ["recruiters", "recruiter"], ["ta", "recruiter"]];
  for (const [p, r] of extra) out.push({ phrase: p, role: r, caps: p === "ta" });
  return out.sort((a, b) => b.phrase.length - a.phrase.length);
})();

/** Every role a phrase names: "hr & admin executive" is HR and admin. */
export const ROLES_FOR_PHRASE: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const r of ROLE_PHRASES) m.set(r.phrase, [...new Set([...(m.get(r.phrase) ?? []), r.role])]);
  return m;
})();

/** Single words of role titles, for typo tolerance ("acountant"). */
export const ROLE_HEADS: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const r of ROLES) for (const t of r.titles) {
    const w = norm(t).split(" ");
    const head = w[w.length - 1];
    if (head.length >= 6 && !m.has(head)) m.set(head, r.id);
  }
  return m;
})();

export const QUAL_PHRASES: { phrase: string; id: string }[] = QUALIFICATIONS.flatMap((q) => q.names.map((n) => ({ phrase: norm(n), id: q.id })))
  .filter((x) => !["ma", "be", "b.e", "bed", "degree", "ba", "nie", "ipm"].includes(x.phrase))
  .concat([{ phrase: "degree", id: "bachelors" }, { phrase: "graduate", id: "bachelors" }, { phrase: "graduates", id: "bachelors" }, { phrase: "chartered", id: "ca_sl" }, { phrase: "ca qualified", id: "ca_sl" }, { phrase: "ca", id: "ca_sl" }, { phrase: "postgraduate", id: "masters" }, { phrase: "nursing licence", id: "slnc" }])
  .sort((a, b) => b.phrase.length - a.phrase.length);

export const COMPANY_TYPE_PHRASES = COMPANY_TYPES.flatMap((c) => c.words.map((w) => ({ phrase: norm(w), id: c.id as string }))).sort((a, b) => b.phrase.length - a.phrase.length);

export const EMPLOYER_PHRASES = EMPLOYERS.flatMap((e) => [e.name, ...e.aliases].filter((n) => n.length > 2 && !["mas", "access", "aia", "du", "e&", "hmc", "nhs"].includes(n.toLowerCase())).map((n) => ({ phrase: norm(n), name: e.name })))
  .concat(EMPLOYERS.filter((e) => ["MAS Holdings", "NHS"].includes(e.name)).map((e) => ({ phrase: norm(e.name.split(" ")[0]), name: e.name })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

/** Place names, longest first. Two-letter aliases (us, uk) only as typed in capitals. */
export const PLACE_PHRASES: { phrase: string; id: string }[] = (() => {
  const out: { phrase: string; id: string }[] = [];
  for (const p of PLACES) for (const n of [p.name, ...(p.aliases ?? [])]) {
    const k = norm(n);
    if (!k || k === "us" || k === "male city") continue;
    out.push({ phrase: k, id: p.id });
  }
  for (const g of GROUPS) for (const a of g.aliases) out.push({ phrase: norm(a), id: g.id });
  out.push({ phrase: "maldivesmale", id: "mv-male" }, { phrase: "male", id: "mv-male" }, { phrase: "colombo", id: "lk-d-colombo" }, { phrase: "greater colombo", id: "lk-d-colombo" }, { phrase: "colombo city", id: "lk-colombo" });
  return out.sort((a, b) => b.phrase.length - a.phrase.length);
})();

export const DEMONYMS: { phrase: string; code: string }[] = COUNTRIES.flatMap((c) => c.demonyms.flatMap((d) => [d, `${d}s`].map((x) => ({ phrase: x, code: c.code }))))
  .concat([{ phrase: "locals", code: "LK" }, { phrase: "expats", code: "*expat" }, { phrase: "filipinos", code: "PH" }, { phrase: "filipinas", code: "PH" }])
  .sort((a, b) => b.phrase.length - a.phrase.length);

/** Every skill the generated roles use, plus common extras. */
export const SKILLS: string[] = [...new Set([...ROLE_GEN.flatMap((r) => r.skills), "SAP", "Excel", "IFRS", "Python", "Java", "React", "Power BI", "Tableau", "SQL", "AutoCAD", "Revit", "Salesforce", "HACCP", "Opera PMS", "Selenium", "Primavera", "ICU", "BLS", "ACLS", "Arabic", "WPS", "Oracle", "Tally", "QuickBooks", "Xero", "Figma", "Photoshop", "Kubernetes", "Docker", "AWS", "Azure", "SEO", "Google Ads", "LinkedIn Recruiter", "FIDIC", "BOQ", "CostX", "Payroll", "VAT", "Lean manufacturing", "Garment costing"])]
  .sort((a, b) => b.length - a.length);

export const LANGUAGES = ["english", "sinhala", "tamil", "arabic", "hindi", "malayalam", "urdu", "tagalog", "dhivehi", "bengali", "nepali", "french", "german", "mandarin", "malay"];

export const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, a: 1, an: 1 };

export function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
