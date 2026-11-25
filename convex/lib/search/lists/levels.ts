/**
 * One level ladder for every country. Titles mean different things in
 * different places, so the mapping notes below go to Haiku with the CV and are
 * applied by `levelFromTitle` for TA requests ("senior accountant", "AM - HR").
 */

export const LEVELS = [
  { rank: 0, id: "trainee", label: "Trainee / Intern" },
  { rank: 1, id: "executive", label: "Executive / Officer / Associate" },
  { rank: 2, id: "senior_executive", label: "Senior Executive / Senior Officer" },
  { rank: 3, id: "assistant_manager", label: "Assistant Manager / Team Lead / Supervisor" },
  { rank: 4, id: "manager", label: "Manager" },
  { rank: 5, id: "senior_manager", label: "Senior Manager" },
  { rank: 6, id: "head", label: "Head / AGM / DGM / Associate Director" },
  { rank: 7, id: "director", label: "GM / Director / VP" },
  { rank: 8, id: "c_suite", label: "C-suite / MD / CEO" },
] as const;

export type LevelId = (typeof LEVELS)[number]["id"];
export const LEVEL_RANK = new Map<string, number>(LEVELS.map((l) => [l.id, l.rank]));
export const LEVEL_LABEL = new Map<number, string>(LEVELS.map((l) => [l.rank, l.label]));

/** What Haiku is told about titles by country. Plain sentences, one per rule. */
export const LEVEL_RULES_BY_COUNTRY = `
- Sri Lanka, India, Bangladesh, Pakistan, Maldives: "Executive", "Officer", "Associate" are rank 1; "Senior Executive", "Senior Officer" rank 2; "Assistant Manager", "AM", "Asst Mgr", "Team Lead", "Supervisor", "In-charge" rank 3; "Manager" rank 4; "Senior Manager" rank 5; "AGM", "DGM", "Head of" rank 6; "GM", "Director" rank 7; "CEO", "MD", "CFO", "COO" rank 8.
- India banks: "AVP" is rank 4, "VP" rank 5, "SVP" rank 6. India IT: "Associate"/"Trainee Engineer" 0-1, "Senior Software Engineer" 2, "Tech Lead"/"Module Lead" 3.
- Sri Lanka special titles: "Chief Accountant" is rank 4 (heads the accounts team, not C-suite); "Chief Clerk" and "Chief Cashier" are rank 2; "Management Assistant" is rank 1.
- Gulf (UAE, Qatar, Saudi, Kuwait, Oman, Bahrain): "Officer"/"Executive"/"Specialist" rank 1-2; "Senior Specialist" 2; "Supervisor"/"In-charge"/"Team Leader" 3; "Manager" 4; "Senior Manager" 5; "Head of" 6; "Director"/"GM" 7.
- UK and Ireland: "Assistant"/"Coordinator"/"Officer"/"Associate"/"Account Executive" rank 1; "Senior ..." 2; "Team Leader"/"Supervisor" 3; "Manager" 4; "Senior Manager" 5; "Head of"/"Associate Director" 6; "Director" 7; "Chief ..." 8.
- US: "Executive" alone after a function ("Sales Executive") is rank 1, but "Executive Director" is 7; "VP" in a bank is rank 4-5, outside banks 7.
- Everywhere: "Relationship Manager" in a bank is rank 2 unless "Senior"/"Head"; "Executive Assistant to the CEO", "PA to MD", "Secretary to the Director" are rank 2 (the role is the assistant, never the boss); "Trainee", "Intern", "Apprentice" rank 0; "Junior" rank 1.
- A Doctor's "Registrar" is rank 3, "Consultant" rank 5; a Nurse's "Staff Nurse" rank 1, "Nursing Sister"/"Charge Nurse" rank 3, "Head Nurse"/"Matron" rank 4.
`.trim();

/**
 * The rank a title implies, for requests ("senior accountant") and as a check.
 * Whole words only: "sr" inside "Classroom" or "Sri Lanka" is not "Senior" (D9).
 */
export function levelFromTitle(title: string, country?: string): number | null {
  const t = ` ${title.toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim()} `;
  const has = (...w: string[]) => w.some((x) => t.includes(` ${x} `));
  // Assistant to a boss is the assistant, never the boss (P7).
  if (/\b(pa|personal assistant|executive assistant|secretary)\b/.test(t) && /\b(to|of)\b/.test(t)) return 2;
  if (has("intern", "internship", "trainee", "apprentice", "cadet")) return 0;
  if (has("ceo", "cfo", "coo", "cto", "cmo", "chief executive officer", "chief financial officer", "managing director", "md", "chief operating officer")) return 8;
  if (has("chief accountant")) return 4;
  if (has("chief clerk", "chief cashier")) return 2;
  if (has("chief")) return 8;
  if (has("head nurse", "matron")) return 4;
  if (has("svp", "agm", "dgm", "assistant general manager", "deputy general manager", "head", "associate director")) return 6;
  if (has("general manager", "gm", "director", "vice president")) return 7;
  if (has("avp")) return 4;
  if (has("vp")) return country === "IN" ? 5 : 7;
  if (has("senior manager", "snr manager", "sr manager")) return 5;
  if (has("relationship manager") && !has("senior", "head")) return 2;
  if (has("assistant manager", "asst manager", "asst mgr", "am", "team lead", "team leader", "supervisor", "in charge", "lead", "charge nurse", "nursing sister", "registrar", "foreman")) return 3;
  if (has("manager", "mgr", "matron", "head nurse", "controller")) return 4;
  if (has("senior", "snr", "sr", "principal", "consultant physician")) return 2;
  if (has("junior", "jr", "assistant", "associate", "executive", "officer", "clerk", "coordinator", "specialist", "analyst", "engineer", "accountant", "nurse", "teacher", "developer")) return 1;
  return null;
}
