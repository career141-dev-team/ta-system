// convex/ui/briefRules.ts
//
// AURA reads a new opening's brief (D11 item 1, owner 20 Nov 2026: "Haiku reading for
// new opening"). The pure half: what Claude Haiku is told, and what of its answer may
// reach the New opening sheet. No database, no network - tests/uibrief.test.ts holds
// every rule.
//
// Why the checks: on 20 Nov a pasted JD's "Colombo, Sri Lanka" became the client Lanka
// Tiles, and Create would have added that client for real. So the model only fills
// fields; a client is one of the desk's own names or, when the words name a company
// outright, a new one the person sees before Create; a TA is one of the given names;
// nothing is saved here - the sheet's Create still runs the old save and its rules.

export type BriefFields = {
  role: string;
  client: string;
  /** The client is one of the desk's clients (else a new one, named in the words). */
  clientKnown: boolean;
  locations: { city: string; people: number }[];
  /** 1-5; null = not said (the sheet keeps its P3). */
  priority: number | null;
  team: string[];
  musts: string;
  hiringFor: "Local" | "Expat";
  gender: "Any" | "Female" | "Male";
  /** 28 Nov 2026 (owner): nice-to-haves, the salary / package, and any other detail the JD states as label/value. */
  nice?: string;
  salary?: string;
  extra?: { label: string; value: string }[];
};
export type BriefAnswer = { fields: BriefFields; read: string[]; reply: string };

export const BRIEF_SYSTEM = `You read a recruiter's brief or a pasted job description for ONE new job opening and fill its fields, as JSON.
Fields:
- "role": the job title only, e.g. "Project Coordinator". Not a sentence.
- "client": the hiring company. Use a name from CLIENTS when the words mean one of them (spelling may differ). A company not in CLIENTS only when the words name it as the employer. A country, city or department is never the client. Unsure or not said: "".
- "locations": [{"city","people"}] - the cities where the people will work and how many in each; people defaults to 1. Not countries.
- "priority": 1-5 only if the words say P1-P5 or a deadline (2 weeks=1, 3 weeks=2, 1 month=3, 6 weeks=4, 2 months=5); else null.
- "team": recruiters to put on it, only names from TEAM that the words ask for.
- "musts": the must-haves in one short line separated by " · " (experience years as written, e.g. "1–3 years", key skills, qualifications). Leave out nice-to-haves and the salary.
- "nice": the nice-to-haves (preferred, an advantage, a plus) in one short line separated by " · "; "" when none.
- "salary": the salary or package as written with its currency, e.g. "LKR 300,000–400,000 + vehicle"; "" when not said.
- "extra": up to 8 other details the words state that fit no field above, as [{"label","value"}] with short labels, e.g. Reports to, Working days, Languages, Education, Benefits, Start date. [] when none.
- "hiringFor": "Expat" only if the words ask for a foreigner/expat, else "Local".
- "gender": "Female" or "Male" only if the words ask for one, else "Any".
- "reply": one short plain sentence to the recruiter saying what you filled or changed, and what is still missing.
Never invent anything the words do not say. Answer JSON only.`;

export const CHANGE_NOTE = `The recruiter is correcting the fields you filled. CURRENT holds them. Apply only what the new sentence asks, keep every other field as it is, and answer the whole set of fields. The recruiter may add a field of their own, rename one, change its value or take it off: "extra" is the whole list after the change (keep the others exactly). Taking off nice-to-haves or the salary is "".`;

const clip = (s: string, n: number) => s.slice(0, n);

/** What the model is shown: the desk's names, the fields so far (when correcting), the words. */
export function briefTurn(o: { text: string; clients: string[]; team: string[]; current?: BriefFields; said?: string }): string {
  const parts = [
    `CLIENTS: ${o.clients.length ? o.clients.map((c) => clip(c, 80)).join(" | ") : "(none given)"}`,
    `TEAM: ${o.team.length ? o.team.map((t) => clip(t, 60)).join(" | ") : "(none given)"}`,
  ];
  if (o.current && o.said) parts.push(`CURRENT: ${JSON.stringify(o.current)}`, `BRIEF:\n${clip(o.text, 6000)}`, `NEW SENTENCE: ${clip(o.said, 500)}`);
  else parts.push(`BRIEF:\n${clip(o.text, 8000)}`);
  return parts.join("\n\n");
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const str = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");

/** One of the desk's clients for a name the model gave: the same name, ignoring case and marks. */
export function knownClient(name: string, clients: string[]): string | null {
  const n = norm(name);
  if (!n) return null;
  return clients.find((c) => norm(c) === n) ?? null;
}

const PLAIN = new Set(["the", "and", "plc", "ltd", "pvt", "private", "limited", "holdings", "group", "company", "lanka", "sri", "ceylon", "inc", "llc"]);
/**
 * The client must be in the words themselves: a name the model brings in from the
 * list without the brief naming it is dropped. One word of the name that is its own
 * (not "PLC", "Group" or "Lanka") is enough; "Sri Lanka" never counts.
 */
export function named(client: string, words: string): boolean {
  const said = ` ${norm(words.replace(/\bsri\s+lanka\b/gi, " "))} `;
  if (said.includes(` ${norm(client)} `)) return true;
  return norm(client).split(" ").some((w) => w.length >= 3 && !PLAIN.has(w) && said.includes(` ${w} `));
}

/** A place is never a client (the 20 Nov "Sri Lanka" -> Lanka Tiles fault). */
const PLACE = /^(sri lanka|lanka|colombo|kandy|galle|negombo|jaffna|kurunegala|maldives|india|dubai|uae|qatar|singapore)$/i;

/**
 * The model's answer, checked, laid over what the sheet had (or nothing). Anything
 * not of the right shape is dropped and the earlier value kept; "read" names the
 * fields this answer filled, so the sheet can mark them.
 */
export function cleanBrief(raw: unknown, clients: string[], team: string[], words: string, before?: BriefFields): BriefAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const base: BriefFields = before ?? { role: "", client: "", clientKnown: false, locations: [], priority: null, team: [], musts: "", hiringFor: "Local", gender: "Any" };
  const out: BriefFields = { ...base, locations: [...base.locations], team: [...base.team] };
  const read: string[] = [];
  const took = (k: string) => read.includes(k) || read.push(k);

  const role = str(r.role, 120);
  if (role && role !== base.role) (out.role = role), took("role");

  if (typeof r.client === "string") {
    const said = str(r.client, 80);
    const known = knownClient(said, clients);
    if (known && named(known, words)) (out.client = known), (out.clientKnown = true);
    else if (said && !known && !PLACE.test(said) && named(said, words)) (out.client = said), (out.clientKnown = false);
    else if (!said && before) (out.client = ""), (out.clientKnown = false);
    if (out.client !== base.client) took("client");
  }

  if (Array.isArray(r.locations)) {
    const locs = r.locations
      .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>) : null))
      .filter((l): l is Record<string, unknown> => !!l)
      .map((l) => ({ city: str(l.city, 60), people: Math.min(50, Math.max(1, Math.round(Number(l.people) || 1))) }))
      .filter((l) => l.city && !/^sri lanka$/i.test(l.city))
      .slice(0, 50);
    const seen = new Set<string>();
    const uniq = locs.filter((l) => !seen.has(l.city.toLowerCase()) && seen.add(l.city.toLowerCase()));
    if (JSON.stringify(uniq) !== JSON.stringify(base.locations)) (out.locations = uniq), took("where");
  }

  const p = Number(r.priority);
  if (Number.isInteger(p) && p >= 1 && p <= 5 && p !== base.priority) (out.priority = p), took("priority");
  else if (r.priority === null && before) out.priority = base.priority;

  if (Array.isArray(r.team)) {
    const names = r.team.map((t) => str(t, 60)).map((t) => team.find((n) => norm(n) === norm(t)) ?? team.find((n) => norm(n.split(/\s+/)[0]) === norm(t)));
    const kept = [...new Set(names.filter((n): n is string => !!n))];
    if (JSON.stringify(kept) !== JSON.stringify(base.team)) (out.team = kept), took("team");
  }

  const musts = str(r.musts, 400);
  if (typeof r.musts === "string" && musts !== base.musts) (out.musts = musts), took("musts");
  if (r.hiringFor === "Expat" || r.hiringFor === "Local") out.hiringFor = r.hiringFor;
  if (r.gender === "Female" || r.gender === "Male" || r.gender === "Any") out.gender = r.gender;

  const nice = str(r.nice, 400);
  if (typeof r.nice === "string" && nice !== (base.nice ?? "")) (out.nice = nice), took("nice");
  const salary = str(r.salary, 160);
  if (typeof r.salary === "string" && salary !== (base.salary ?? "")) (out.salary = salary), took("salary");
  if (Array.isArray(r.extra)) {
    const extra = r.extra
      .map((e) => (e && typeof e === "object" ? (e as Record<string, unknown>) : null))
      .map((e) => ({ label: str(e?.label, 40), value: str(e?.value, 200) }))
      .filter((e) => e.label && e.value)
      .slice(0, 8);
    if (JSON.stringify(extra) !== JSON.stringify(base.extra ?? [])) (out.extra = extra), took("extra");
  }

  const reply = str(r.reply, 300) || (read.length ? "Filled what the brief says - check it before you create." : "Nothing changed.");
  return { fields: out, read, reply };
}
