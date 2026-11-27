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
export type List = Status | "unassigned" | "today";
// "today": open openings assigned today (day 0).
export const inList = (o: Opening, l: List) =>
  l === "unassigned" ? o.status === "active" && o.team.length === 0 : l === "today" ? o.status === "active" && o.days === 0 : o.status === l;
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
  /** The client's name is hidden from candidates (the old system's isConfidential). */
  confidential?: boolean;
  /** Posted on the Career141 website's job vacancies page. */
  website?: boolean;
};

export const TARGET: Record<Priority, number> = { 1: 14, 2: 21, 3: 30, 4: 45, 5: 60 };
export const TARGET_WORDS: Record<Priority, string> = { 1: "2 wks", 2: "3 wks", 3: "1 mo", 4: "6 wks", 5: "2 mo" };

export const STATUS: Record<List, { label: string; dot: string; plural: string }> = {
  today: { label: "Today", dot: "bg-info", plural: "Today" },
  active: { label: "Active", dot: "bg-success", plural: "Active" },
  unassigned: { label: "Unassigned", dot: "bg-violet", plural: "Unassigned" },
  hold: { label: "On hold", dot: "bg-warn", plural: "On hold" },
  placed: { label: "Placed", dot: "bg-brand", plural: "Placed" },
  lost: { label: "Lost", dot: "bg-ink-3", plural: "Lost" },
};
export const ORDER: List[] = ["today", "active", "unassigned", "hold", "placed", "lost"];

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
  /** "3 people" said with no city: the number waits and goes onto the city picked next. */
  headcount: number;
  priority: Priority;
  team: string[];
  musts: string;
  hiringFor: string;
  gender: string;
  autoFollowUp: boolean;
  referee: boolean;
  confidential: boolean;
  website: boolean;
  /** Which fields AURA filled from the words (marked ✦). */
  read: string[];
};

export const EMPTY: Read = {
  role: "",
  client: "",
  clientKnown: false,
  locations: [],
  headcount: 1,
  priority: 3,
  team: [],
  musts: "",
  // The TA System's default is a local hire.
  hiringFor: "Local",
  gender: "Any",
  // Off until someone switches it on, as in the TA System.
  autoFollowUp: false,
  referee: false,
  confidential: false,
  website: false,
  read: [],
};

/** One of the desk's clients named in the words: its whole name, or a first word only
 *  it has, written with its capital ("Hayleys" for Hayleys Fabric). "Sri Lanka" is
 *  taken out first - it once read as Lanka Tiles (owner, 20 Nov). */
export function clientIn(text: string, clients: string[]): string | null {
  const plain = text.replace(/\bSri\s+Lanka\b/gi, " ");
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const has = (w: string, flags: string) => new RegExp(`(^|[^\\w])${esc(w)}($|[^\\w])`, flags).test(plain);
  const whole = clients.filter((c) => c.trim() && has(c.trim(), "i"));
  if (whole.length) return whole.sort((a, b) => b.length - a.length)[0];
  const first = (c: string) => c.trim().split(/\s+/)[0];
  const hits = clients.filter((c) => {
    const w = first(c);
    return w.length >= 3 && /^[A-Z]/.test(w) && clients.filter((x) => first(x) === w).length === 1 && has(w, "");
  });
  return hits.length === 1 ? hits[0] : null;
}

/** A stand-in for AURA reading a brief or a JD: what the words plainly say, nothing
 *  guessed. ponytail: word rules only; with the backend this is one model call that
 *  returns the same fields. */
export function readBrief(text: string, desk: { clients?: string[]; team?: string[] } = {}): Read {
  const r: Read = { ...EMPTY, read: [], locations: [], team: [] };
  const t = text.toLowerCase();
  const client = clientIn(text, desk.clients ?? CLIENTS);
  if (client) Object.assign(r, { client, clientKnown: true });
  else {
    // A new client only when the brief names it outright ("Client: Acme Ltd"). A JD's
    // "for", "at" or a place ("Sri Lanka") once became a client (owner, 20 Nov), and
    // Create would have added that client for real.
    const m = text.match(/^[ \t]*(?:client|company|employer|organi[sz]ation)(?:\s+name)?\s*[:–-]\s*(.+?)\s*$/im);
    if (m) r.client = m[1].slice(0, 80);
  }
  if (r.client) r.read.push("client");

  // A JD names the role on its own line ("Job Title: Project Coordinator"); a spoken
  // brief says it after "wants / needs / looking for" - a small word before the title
  // is passed over ("an organized Project Coordinator").
  const titled = text.match(/^[ \t]*(?:job\s*title|title|position|role|designation|vacancy)\s*[:–-]\s*(.+?)\s*$/im);
  const role = text.match(/\b(?:[Ww]ants?|[Nn]eeds?|[Hh]iring|[Ll]ooking for)\s+(?:an?\s+)?(?:[a-z]+\s+)?([A-Z][^,.—–-]*?)(?=\s+(?:for|in|at|to|who)\b|\s*[,.—–-]|$)/);
  if (titled) {
    r.role = titled[1].slice(0, 120);
    r.read.push("role");
  } else if (role) {
    const move = text.match(/\bfor their\s+(.+?)\s+(?:move|project|programme|rollout)\b/i);
    r.role = move ? `${role[1].trim()} — ${move[1]}` : role[1].trim();
    r.read.push("role");
  }
  // Every city named, each with the number written next to it ("2 in Colombo",
  // "Kandy 1", "Colombo x2"); a city with no number takes the overall headcount
  // ("3 people") or 1.
  const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const num = String.raw`(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)`;
  const heads = t.match(new RegExp(String.raw`\b${num}\s*(?:people|persons|positions|hires|heads|vacancies|openings|candidates|recruits)\b|\bhiring\s+${num}\b(?!\s*(?:years?|yrs?|weeks?|months?))`));
  const headsSaid = heads ? heads[1] ?? heads[2] : "";
  const all = headsSaid ? Math.min(50, Math.max(1, Number(headsSaid) || WORDS[headsSaid] || 1)) : 1;
  r.headcount = all;
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
  r.team = (desk.team ?? TEAM).filter((n) => new RegExp(`\\b${n.toLowerCase()}\\b`).test(t));
  if (r.team.length) r.read.push("team");

  const musts: string[] = [];
  // "1–3 years" is a range, not "3+"; "5 years" / "5+ years" mean at least 5.
  const range = t.match(/(\d{1,2})\s*(?:–|—|-|to)\s*(\d{1,2})\s*\+?\s*years?/);
  const years = t.match(/(\d{1,2})\s*\+?\s*(?:\+\s*)?years?/);
  const yearsSaid = range ? `${range[1]}–${range[2]} years` : years ? `${years[1]}+ years` : "";
  // "must have led ..." in a brief, or a JD's "Must-Have: ..." line.
  const must = text.match(/\bmust(?:[\s-]+have)?\s*:?\s+(.+?)(?:[.;]|$)/im);
  const mustText = must?.[1].trim() ?? "";
  const said = (range ?? years)?.[0];
  if (yearsSaid && !(said && mustText.toLowerCase().includes(said))) musts.push(yearsSaid);
  if (mustText) musts.push(mustText);
  // "LKR 120,000 – 150,000/month" as written; "budget around 1.2M" as ~LKR 1.2M.
  const lkr = text.match(/\b(?:LKR|Rs\.?)\s*([\d,.]*\d\s*[MK]?)(?:\s*(?:–|—|-|to)\s*(?:LKR|Rs\.?)?\s*([\d,.]*\d\s*[MK]?))?/i);
  const pay = text.match(/\b(?:budget|salary|package|pay)\b[^\d]{0,15}([\d.]+\s*[MK])/i);
  if (lkr) musts.push(`LKR ${lkr[1].trim()}${lkr[2] ? `–${lkr[2].trim()}` : ""}`);
  else if (pay) musts.push(`~LKR ${pay[1].replace(/\s/g, "")}`);
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
