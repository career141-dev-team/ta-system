// The Openings list's sample desk and AURA's reading of a brief (O1, owner's design,
// 14 Nov 2026). Rules from the old TA System (openings skill §1, §2, §6, §14):
// - lists: Active (open, with a TA), Unassigned (open, no TA yet), On hold, Placed, Lost;
// - "Day N of target": days since assigned against the priority's target
//   (P1 14, P2 21, P3 30, P4 45, P5 60 days);
// - a new opening needs a client and a role; a lead may put any TAs on it, a TA only
//   themself; none is allowed and it shows as Unassigned; the JD is drafted next;
// - delete puts an opening in the Bin for 7 days (only someone who manages openings).
// Placeholder data - nothing reads the backend yet.

/** Stored status. "Unassigned" is not one: it is an active opening with no TA. */
export type Status = "active" | "hold" | "placed" | "lost";
/** The lists on the page: Active counts every open opening (as the old "All active"),
 *  Unassigned is the open ones with nobody on them. */
export type List = Status | "unassigned";
export const inList = (o: Opening, l: List) => (l === "unassigned" ? o.status === "active" && o.team.length === 0 : o.status === l);
export type Priority = 1 | 2 | 3 | 4 | 5;
export type Opening = {
  id: string;
  client: string;
  title: string;
  status: Status;
  priority: Priority;
  /** Days since it was assigned (Colombo calendar days). */
  days: number;
  team: string[];
  /** Newer is higher - stands for createdAt. */
  made: number;
  note?: string;
  /** Hire from the referee table (the referees / people who applied) for this role. */
  referee?: boolean;
  /** Posted on the Career141 website's job vacancies page. */
  website?: boolean;
};

export const TARGET: Record<Priority, number> = { 1: 14, 2: 21, 3: 30, 4: 45, 5: 60 };
export const TARGET_WORDS: Record<Priority, string> = { 1: "2 wks", 2: "3 wks", 3: "1 mo", 4: "6 wks", 5: "2 mo" };

export const STATUS: Record<List, { label: string; dot: string; plural: string }> = {
  active: { label: "Active", dot: "bg-success", plural: "Active" },
  unassigned: { label: "Unassigned", dot: "bg-violet", plural: "Unassigned" },
  hold: { label: "On hold", dot: "bg-warn", plural: "On hold" },
  placed: { label: "Placed", dot: "bg-brand", plural: "Placed" },
  lost: { label: "Lost", dot: "bg-ink-3", plural: "Lost" },
};
export const ORDER: List[] = ["active", "unassigned", "hold", "placed", "lost"];

/** TAs who can be put on an opening (sample). */
export const TEAM = ["Chathura", "Dinuka", "Hasini", "Nipuna", "Sanduni", "Tharushi"];

export const CLIENTS = [
  "PGP Glass", "Hayleys Fabric", "MAS Bodyline", "Dialog Axiata", "Brandix", "Cargills", "John Keells", "Maersk",
  "Lanka Tiles", "Softlogic", "Nestlé", "HNB", "Rocell", "Virtusa", "IFS", "Hemas", "Unilever", "Access Engineering",
];

// Written out for the four the design shows first in each list; the rest are made up
// from a small set so the counts are real numbers.
const FIRST: Omit<Opening, "made">[] = [
  { id: "demo", client: "PGP Glass", title: "Senior Manager — SAP Business Transformation", status: "active", priority: 1, days: 9, team: ["Chathura", "Dinuka"], referee: true },
  { id: "o2", client: "Hayleys Fabric", title: "Finance Manager", status: "active", priority: 2, days: 4, team: ["Hasini"] },
  { id: "o3", client: "MAS Bodyline", title: "Production Executive", status: "active", priority: 3, days: 22, team: ["Nipuna"] },
  { id: "o4", client: "Dialog Axiata", title: "HR Business Partner", status: "active", priority: 3, days: 2, team: ["Sanduni"] },
  { id: "o5", client: "Brandix", title: "Quality Assurance Lead", status: "active", priority: 3, days: 1, team: [] },
  { id: "o6", client: "Cargills", title: "Store Manager", status: "active", priority: 4, days: 2, team: [] },
  { id: "o7", client: "John Keells", title: "Senior Accountant", status: "active", priority: 3, days: 0, team: [] },
  { id: "o8", client: "Maersk", title: "Head of Logistics", status: "active", priority: 2, days: 3, team: [] },
  { id: "o9", client: "Lanka Tiles", title: "Plant Engineer", status: "hold", priority: 3, days: 18, team: ["Dinuka"], note: "Paused by client" },
  { id: "o10", client: "Softlogic", title: "Digital Marketing Lead", status: "hold", priority: 4, days: 26, team: ["Hasini"], note: "Paused by client" },
  { id: "o11", client: "Nestlé", title: "Area Sales Manager", status: "hold", priority: 3, days: 31, team: ["Tharushi"], note: "Paused by client" },
  { id: "o12", client: "HNB", title: "Treasury Analyst", status: "hold", priority: 5, days: 12, team: ["Nipuna"], note: "Paused by client" },
];
const ROLES = [
  "Plant Manager", "Business Analyst", "Supply Chain Executive", "IT Project Manager", "Key Account Manager",
  "Credit Analyst", "Data Engineer", "HR Executive", "Merchandiser", "Procurement Manager", "Brand Manager",
  "Finance Executive", "Logistics Coordinator", "Software Engineer", "Sales Executive", "Internal Auditor",
];
const MORE: [Status, number, string?][] = [
  ["active", 23],
  ["hold", 2, "Paused by client"],
  ["placed", 8, "Placed"],
  ["lost", 3, "Client hired directly"],
];

function build(): Opening[] {
  const out: Opening[] = FIRST.map((o, i) => ({ ...o, made: 1000 - i }));
  let n = 0;
  for (const [status, count, note] of MORE)
    for (let i = 0; i < count; i++, n++) {
      const priority = ((n % 5) + 1) as Priority;
      out.push({
        id: `g${n}`,
        client: CLIENTS[(n * 7) % CLIENTS.length],
        title: ROLES[n % ROLES.length],
        status,
        priority,
        days: (n * 5) % (TARGET[priority] + 8),
        team: [TEAM[n % TEAM.length]],
        made: 900 - n,
        note,
      });
    }
  return out;
}
export const OPENINGS: Opening[] = build();

export const CITIES = ["Colombo", "Kandy", "Galle", "Negombo", "Horana", "Seethawaka", "Jaffna", "Kurunegala"];

export type Loc = { city: string; people: number };
export type Read = {
  role: string;
  client: string;
  clientKnown: boolean;
  /** Work locations, each with how many people (old system: 1 to 50 rows; the
   *  opening's headcount is their sum). Empty = Sri Lanka, city not set. */
  locations: Loc[];
  priority: Priority;
  team: string[];
  musts: string;
  hiringFor: string;
  gender: string;
  autoFollowUp: boolean;
  referee: boolean;
  website: boolean;
  /** Which fields AURA filled from the words (marked ✦). */
  read: string[];
};

export const EMPTY: Read = {
  role: "",
  client: "",
  clientKnown: false,
  locations: [],
  priority: 3,
  team: [],
  musts: "",
  // The TA System's default is a local hire.
  hiringFor: "Local",
  gender: "Any",
  // Off until someone switches it on, as in the TA System.
  autoFollowUp: false,
  referee: false,
  website: false,
  read: [],
};

/** A stand-in for AURA reading a brief or a JD: what the words plainly say, nothing
 *  guessed. ponytail: word rules only; with the backend this is one model call that
 *  returns the same fields. */
export function readBrief(text: string): Read {
  const r: Read = { ...EMPTY, read: [], locations: [], team: [] };
  const t = text.toLowerCase();
  const client = CLIENTS.find((c) => new RegExp(`\\b${c.split(" ")[0].toLowerCase()}\\b`).test(t));
  if (client) Object.assign(r, { client, clientKnown: true });
  else {
    const m = text.match(/\b(?:client|for|at)\s+([A-Z][\w&.]+(?:\s[A-Z][\w&.]+)*)/);
    if (m) r.client = m[1];
  }
  if (r.client) r.read.push("client");

  const role = text.match(/\b(?:[Ww]ants?|[Nn]eeds?|[Hh]iring|[Ll]ooking for)\s+(?:an?\s+)?([A-Z][^,.—–-]*?)(?=\s+(?:for|in|at|to|who)\b|\s*[,.—–-]|$)/);
  if (role) {
    const move = text.match(/\bfor their\s+(.+?)\s+(?:move|project|programme|rollout)\b/i);
    r.role = move ? `${role[1].trim()} — ${move[1]}` : role[1].trim();
    r.read.push("role");
  }
  // Every city named, each with the number written next to it ("2 in Colombo",
  // "Kandy 1", "Colombo x2"); a city with no number takes the overall headcount
  // ("3 people") or 1.
  const heads = t.match(/\b(\d{1,2})\s*(?:people|persons|positions|hires|heads|vacancies|openings)\b/);
  const all = heads ? Number(heads[1]) : 1;
  for (const c of CITIES) {
    const k = c.toLowerCase();
    if (!t.includes(k)) continue;
    const n = t.match(
      new RegExp(String.raw`\b(\d{1,2})\s*(?:people\s*|persons\s*)?(?:in|at|for)\s+${k}\b|\b${k}\s*(?:x|×|-|:)?\s*(\d{1,2})\b(?!\s*(?:years?|yrs?|weeks?|\+))`),
    );
    r.locations.push({ city: c, people: Math.min(50, Number(n?.[1] ?? n?.[2] ?? 0) || all) });
  }
  if (r.locations.length) r.read.push("where");
  const p = text.match(/\bP([1-5])\b/i);
  const weeks = t.match(/\b(\d+)\s*(?:weeks?|wks?)\b/);
  if (p) r.priority = Number(p[1]) as Priority;
  else if (weeks) r.priority = Number(weeks[1]) <= 2 ? 1 : Number(weeks[1]) <= 3 ? 2 : Number(weeks[1]) <= 4 ? 3 : 4;
  if (p || weeks) r.read.push("priority");
  r.team = TEAM.filter((n) => new RegExp(`\\b${n.toLowerCase()}\\b`).test(t));
  if (r.team.length) r.read.push("team");

  const musts: string[] = [];
  const years = t.match(/(\d+)\s*\+?\s*(?:\+\s*)?years?/);
  if (years) musts.push(`${years[1]}+ years`);
  const must = text.match(/\bmust (?:have\s+)?(.+?)(?:[.;]|$)/i);
  if (must) musts.push(must[1].trim());
  const pay = text.match(/\b(?:budget|salary|package|pay)\b[^\d]{0,15}([\d.]+\s*[MK])/i);
  if (pay) musts.push(`~LKR ${pay[1].replace(/\s/g, "")}`);
  if (musts.length) {
    r.musts = musts.join(" · ");
    r.read.push("musts");
  }
  if (/\b(female|women|ladies)\b/.test(t)) r.gender = "Female";
  else if (/\b(male|men)\b/.test(t)) r.gender = "Male";
  if (/\b(local|sri lankan)s?\b/.test(t)) r.hiringFor = "Local";
  else if (/\b(expat|foreign|overseas)\b/.test(t)) r.hiringFor = "Expat";
  return r;
}
