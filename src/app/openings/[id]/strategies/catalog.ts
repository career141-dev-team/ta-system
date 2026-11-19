// The 15 official recruitment strategies (Figma Strategies workspace, 19 Nov 2026),
// mapped dynamically from both the live backend (door.strategies) and the Strategy
// Planner store (src/app/strategy/data.ts) so every TA sees only their assigned
// strategies with each strategy's dedicated interactive interface.

import type { Role } from "@/lib/role";
import type { TaId } from "@/app/strategy/data";

export type StrategyKey =
  | "linkedin-search"
  | "recruiter-search"
  | "smart-ad"
  | "scoop"
  | "repository"
  | "direct-headhunt"
  | "inmail"
  | "email-campaign"
  | "ai-search"
  | "designation-search"
  | "previous-post-screening"
  | "l-search-extraction"
  | "company-extraction"
  | "shortlist-company"
  | "referral-extraction"
  | "custom";

export type StrategyStatus = "new" | "open" | "in_progress" | "running" | "done";

export type Proof = {
  id: string;
  url?: string;
  name?: string;
  tone?: "info" | "plain";
};

export type StrategyItem = {
  id: string;
  key: StrategyKey;
  title: string;
  status: StrategyStatus;
  /** Short label on the left rail ("today", "Thu", "running", "Fri", "11 Nov", "new"). */
  whenLabel: string;
  /** Header tag text ("Due today", "In progress", "Running", "Due Thursday", "Done · 11 Nov", "New from Rashmi"). */
  tagLabel: string;
  /** ISO date it was completed ("2026-11-11"). */
  doneOn?: string;
  /** Whether the latest update has been submitted to the lead. */
  sent: boolean;
  /** Whether "I used it" is toggled on in the log bar. */
  used: boolean;
  note: string;
  proofs: Proof[];
  /** TA initials / name when viewed by a Lead seeing everyone's strategies. */
  taId?: TaId;
  taName?: string;
  /** True when the strategy is not assigned to this opening (previewed from All 15). */
  unassigned?: boolean;
};

export type CatalogEntry = {
  number: number;
  key: Exclude<StrategyKey, "custom">;
  title: string;
  description: string;
  footer: string;
  highlightFooter?: boolean;
  headerMeta?: string;
  steps: [string, string, string];
  auraWhenNew: string;
  /** Known planner / backend aliases that resolve to this strategy. */
  aliases: string[];
};

export const STRATEGY_CATALOG: CatalogEntry[] = [
  {
    number: 1,
    key: "linkedin-search",
    title: "LinkedIn Search",
    description: "Search LinkedIn for people who fit the job.",
    footer: "Used on 81% of positions",
    highlightFooter: true,
    headerMeta: "Strategy 1 of 15 · used on 81% of positions",
    steps: [
      "Tell AURA who you need or attach the JD.",
      "AURA builds the search filters and ranks the closest matches.",
      "Screen the people and add the strong ones to your pipeline.",
    ],
    auraWhenNew: "I can turn the JD into LinkedIn search filters in seconds. Accept the strategy first.",
    aliases: ["linkedin search", "linkedin", "l search"],
  },
  {
    number: 2,
    key: "recruiter-search",
    title: "Recruiter Search and Post",
    description: "Search with LinkedIn Recruiter and Workable. Also post the job, and people apply to it.",
    footer: "Search and post",
    steps: [
      "Check that the JD is approved and the job post is live.",
      "Run a Recruiter / Workable search alongside inbound applicants.",
      "Move qualified applicants into TA Follow-up and log your numbers.",
    ],
    auraWhenNew: "I can prep the Recruiter search query and check your active post. Accept the strategy first.",
    aliases: ["recruiter search and post", "recruiter search & post", "linkedin post", "workable"],
  },
  {
    number: 3,
    key: "smart-ad",
    title: "Smart Ad",
    description: "Run an ad on WhatsApp or Facebook. People apply to it directly.",
    footer: "Ad",
    steps: [
      "Launch the role card on WhatsApp and Facebook.",
      "Track views, clicks, and which channel brings the strongest fits.",
      "Review applicants and move the right people into your pipeline.",
    ],
    auraWhenNew: "I can track your WhatsApp and Facebook ad applicants side by side. Accept first.",
    aliases: ["smart ad", "smart ads", "whatsapp ad", "facebook ad"],
  },
  {
    number: 4,
    key: "scoop",
    title: "Scoop",
    description: "Search our own database of past candidates.",
    footer: "Database",
    steps: [
      "Upload or review scoops shared by the Director, TA Lead, or Ops.",
      "Check who is unclaimed and matches this opening.",
      "Shortlist the right profiles directly into TA Follow-up.",
    ],
    auraWhenNew: "I already checked incoming scoops for this position. Accept the strategy to start.",
    aliases: ["scoop", "scoops"],
  },
  {
    number: 5,
    key: "repository",
    title: "Repository",
    description: "Search old candidates in the TA system (AURA).",
    footer: "Database",
    steps: [
      "Scan candidates already saved in AURA's repository.",
      "Review match reasons, notice periods, and CVs on file.",
      "Shortlist strong fits into TA Follow-up without starting from scratch.",
    ],
    auraWhenNew: "I found past candidates in AURA who match this brief. Accept the strategy first.",
    aliases: ["repository", "database", "database cvs", "aura repository"],
  },
  {
    number: 6,
    key: "direct-headhunt",
    title: "Direct Headhunt",
    description: "Find one person and contact them yourself.",
    footer: "63% of its CVs reach the director shortlist",
    highlightFooter: true,
    steps: [
      "Pick high-value target profiles with AURA.",
      "Reach out directly by call or WhatsApp.",
      "Log each outcome and move received CVs into your pipeline.",
    ],
    auraWhenNew: "I can line up 3 strong direct-headhunt targets from competitors. Accept first.",
    aliases: ["direct headhunt", "headhunt", "direct hunt"],
  },
  {
    number: 7,
    key: "inmail",
    title: "InMail",
    description: "Send LinkedIn InMail messages to candidates.",
    footer: "No data yet",
    steps: [
      "Send tailored InMails to passive candidates who fit the brief.",
      "Track opens and replies in one list, newest reply first.",
      "Follow up with opened-no-reply leads and move interested people to pipeline.",
    ],
    auraWhenNew: "I can draft short, high-reply InMail messages from the JD. Accept the strategy first.",
    aliases: ["inmail", "in-mail", "linkedin inmail"],
  },
  {
    number: 8,
    key: "email-campaign",
    title: "Email Campaign",
    description: "Send emails to many candidates.",
    footer: "No data yet",
    steps: [
      "Select a clean list of matching candidates with email addresses.",
      "Send a focused role pitch with the key highlights.",
      "Review replies and add interested candidates to TA Follow-up.",
    ],
    auraWhenNew: "I can draft the role email and pick the best recipients from our database. Accept first.",
    aliases: ["email campaign", "email outreach", "bulk email"],
  },
  {
    number: 9,
    key: "ai-search",
    title: "AI Search",
    description: "Give the job description to an AI tool. It gives search words and company lists.",
    footer: "Search",
    steps: [
      "AURA reads the job description.",
      "It gives you search words and company lists.",
      "You search with them. Then you log what you found.",
    ],
    auraWhenNew: "I can make the search words in a few seconds. Accept the strategy first.",
    aliases: ["ai search", "aura", "chatgpt", "gemini", "ai tools"],
  },
  {
    number: 10,
    key: "designation-search",
    title: "Designation-wise Search",
    description: "Search by job titles that worked on past positions.",
    footer: "Search",
    steps: [
      "Pick proven job titles from similar past placements.",
      "Run focused title searches across LinkedIn and our database.",
      "Add matching profiles to TA Follow-up and log what worked.",
    ],
    auraWhenNew: "I pulled the exact job titles that converted on past SAP roles. Accept first.",
    aliases: ["designation-wise search", "designation search", "title search"],
  },
  {
    number: 11,
    key: "previous-post-screening",
    title: "Previous Post Screening",
    description: "Look again at people who applied to old job posts.",
    footer: "No data yet",
    steps: [
      "Pick past job posts that match this role's requirements.",
      "Review applicants who reached later stages or were never screened.",
      "Add the strongest matches straight into this opening's pipeline.",
    ],
    auraWhenNew: "I found 3 old posts like this job with 12 strong applicants. Accept first.",
    aliases: ["previous post screening", "previous posts", "old post screening"],
  },
  {
    number: 12,
    key: "l-search-extraction",
    title: "L Search Extraction",
    description: "Take the companies and schools of good profiles you found. Then search those places.",
    footer: "Extraction",
    steps: [
      "Extract companies and universities from your strongest profiles.",
      "Pick the highest-signal organizations and alumni pools.",
      "Search inside them and shortlist fresh lookalike candidates.",
    ],
    auraWhenNew: "I can pull the shared companies and universities from your top profiles. Accept first.",
    aliases: ["l search extraction", "l-search extraction", "profile extraction"],
  },
  {
    number: 13,
    key: "company-extraction",
    title: "Company Extraction",
    description: "Make a list of competitor companies. Then search inside them.",
    footer: "Extraction",
    steps: [
      "Review competitor companies with matching teams.",
      "Pick the companies to target or add new ones.",
      "Review people inside those companies and open their CVs.",
    ],
    auraWhenNew: "I listed 8 competitor companies from the JD and your shortlist. Accept first.",
    aliases: ["company extraction", "competitor extraction", "target companies"],
  },
  {
    number: 14,
    key: "shortlist-company",
    title: "Company Search from Shortlisted Candidates",
    description: "Look at who got shortlisted. Then search their companies for similar people.",
    footer: "Extraction",
    steps: [
      "See which companies your shortlisted candidates came from.",
      "Search those exact teams for peers and deputies.",
      "Open CVs on file or add new matches to TA Follow-up.",
    ],
    auraWhenNew: "I found 4 companies behind your shortlisted candidates. Accept first.",
    aliases: [
      "company search from shortlisted candidates",
      "shortlist – company",
      "shortlist - company",
      "shortlist company",
    ],
  },
  {
    number: 15,
    key: "referral-extraction",
    title: "Referral Extraction",
    description: "Ask people you know for names.",
    footer: "Network",
    steps: [
      "Review warm contacts and referees who know this space.",
      "Reach out with a short ask for 1–2 trusted names.",
      "Add referred candidates to your pipeline and log your outreach.",
    ],
    auraWhenNew: "I found 4 trusted referees in SAP manufacturing who can suggest names. Accept first.",
    aliases: ["referral extraction", "referrals", "referral search"],
  },
];

export const CATALOG_BY_KEY: Record<Exclude<StrategyKey, "custom">, CatalogEntry> = Object.fromEntries(
  STRATEGY_CATALOG.map((c) => [c.key, c]),
) as Record<Exclude<StrategyKey, "custom">, CatalogEntry>;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function resolveStrategyKey(name: string): StrategyKey {
  const n = norm(name);
  for (const c of STRATEGY_CATALOG) {
    if (norm(c.title) === n) return c.key;
    if (c.aliases.some((a) => norm(a) === n)) return c.key;
  }
  for (const c of STRATEGY_CATALOG) {
    if (n.includes(norm(c.title)) || c.aliases.some((a) => n.includes(norm(a)))) return c.key;
  }
  return "custom";
}

export function catalogOf(key: StrategyKey): CatalogEntry | null {
  return key === "custom" ? null : CATALOG_BY_KEY[key];
}

export function shortDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function tagForStatus(status: StrategyStatus, whenLabel: string, doneOn: string | undefined, lead: string): string {
  if (status === "new") return `New from ${lead}`;
  if (status === "done") return doneOn ? `Done · ${shortDate(doneOn)}` : "Done";
  if (status === "running") return "Running";
  if (status === "in_progress") return "In progress";
  if (!whenLabel) return "To do";
  const low = whenLabel.toLowerCase();
  if (low === "today") return "Due today";
  if (low === "thu") return "Due Thursday";
  if (low === "fri") return "Due Friday";
  if (low === "wed") return "Due Wednesday";
  if (low === "tue") return "Due Tuesday";
  if (low === "mon") return "Due Monday";
  return `Due ${whenLabel}`;
}

/** Chathura's assigned strategies on the demo opening — matches the 9 Figma frames 1:1. */
export const CHATHURA_DEMO: StrategyItem[] = [
  {
    id: "st-linkedin-search",
    key: "linkedin-search",
    title: "LinkedIn Search",
    status: "in_progress",
    whenLabel: "today",
    tagLabel: "In progress",
    sent: false,
    used: false,
    note: "",
    proofs: [],
    taId: "CS",
    taName: "Chathura",
  },
  {
    id: "st-previous-post",
    key: "previous-post-screening",
    title: "Previous Post Screening",
    status: "open",
    whenLabel: "today",
    tagLabel: "Due today",
    sent: false,
    used: false,
    note: "",
    proofs: [],
    taId: "CS",
    taName: "Chathura",
  },
  {
    id: "st-inmail",
    key: "inmail",
    title: "InMail",
    status: "open",
    whenLabel: "Thu",
    tagLabel: "Due Thursday",
    sent: false,
    used: false,
    note: "",
    proofs: [],
    taId: "CS",
    taName: "Chathura",
  },
  {
    id: "st-smart-ad",
    key: "smart-ad",
    title: "Smart Ad",
    status: "running",
    whenLabel: "running",
    tagLabel: "Running",
    sent: false,
    used: false,
    note: "",
    proofs: [],
    taId: "CS",
    taName: "Chathura",
  },
  {
    id: "st-company-extraction",
    key: "company-extraction",
    title: "Company Extraction",
    status: "open",
    whenLabel: "Fri",
    tagLabel: "Due Friday",
    sent: false,
    used: false,
    note: "",
    proofs: [],
    taId: "CS",
    taName: "Chathura",
  },
  {
    id: "st-ai-search",
    key: "ai-search",
    title: "AI Search",
    status: "new",
    whenLabel: "new",
    tagLabel: "New from Rashmi",
    sent: false,
    used: false,
    note: "",
    proofs: [],
    taId: "CS",
    taName: "Chathura",
  },
  {
    id: "st-referral-extraction",
    key: "referral-extraction",
    title: "Referral Extraction",
    status: "new",
    whenLabel: "new",
    tagLabel: "New from Rashmi",
    sent: false,
    used: false,
    note: "",
    proofs: [],
    taId: "CS",
    taName: "Chathura",
  },
  {
    id: "st-direct-headhunt",
    key: "direct-headhunt",
    title: "Direct Headhunt",
    status: "done",
    whenLabel: "11 Nov",
    tagLabel: "Done · 11 Nov",
    doneOn: "2026-11-11",
    sent: true,
    used: true,
    note: "Called 3 SAP leads. 2 sent CVs. Next time I ask for the CV on the first call.",
    proofs: [
      { id: "dh-p1", name: "call-log-chamara.png", tone: "info" },
      { id: "dh-p2", name: "whatsapp-ruwan.png", tone: "plain" },
    ],
    taId: "CS",
    taName: "Chathura",
  },
  {
    id: "st-scoop",
    key: "scoop",
    title: "Scoop",
    status: "done",
    whenLabel: "10 Nov",
    tagLabel: "Done · 10 Nov",
    doneOn: "2026-11-10",
    sent: true,
    used: true,
    note: "Reviewed 8 Director scoops. Shortlisted 2 SAP S/4HANA leads into TA Follow-up.",
    proofs: [{ id: "sc-p1", name: "scoop-shortlist.png", tone: "info" }],
    taId: "CS",
    taName: "Chathura",
  },
  {
    id: "st-repository",
    key: "repository",
    title: "Repository",
    status: "done",
    whenLabel: "10 Nov",
    tagLabel: "Done · 10 Nov",
    doneOn: "2026-11-10",
    sent: true,
    used: true,
    note: "Searched AURA repository for SAP manufacturing leads. Found 3 active candidates.",
    proofs: [],
    taId: "CS",
    taName: "Chathura",
  },
];

/** Hasini (TA Support) has her own distinct assigned strategies — demonstrates per-TA dynamic adaptation. */
export const HASINI_DEMO: StrategyItem[] = [
  {
    id: "hs-scoop",
    key: "scoop",
    title: "Scoop",
    status: "in_progress",
    whenLabel: "today",
    tagLabel: "In progress",
    sent: false,
    used: false,
    note: "",
    proofs: [],
    taId: "DR",
    taName: "Hasini",
  },
  {
    id: "hs-repository",
    key: "repository",
    title: "Repository",
    status: "open",
    whenLabel: "today",
    tagLabel: "Due today",
    sent: false,
    used: false,
    note: "",
    proofs: [],
    taId: "DR",
    taName: "Hasini",
  },
  {
    id: "hs-prev-post",
    key: "previous-post-screening",
    title: "Previous Post Screening",
    status: "open",
    whenLabel: "Thu",
    tagLabel: "Due Thursday",
    sent: false,
    used: false,
    note: "",
    proofs: [],
    taId: "DR",
    taName: "Hasini",
  },
  {
    id: "hs-l-extract",
    key: "l-search-extraction",
    title: "L Search Extraction",
    status: "new",
    whenLabel: "new",
    tagLabel: "New from Rashmi",
    sent: false,
    used: false,
    note: "",
    proofs: [],
    taId: "DR",
    taName: "Hasini",
  },
  {
    id: "hs-shortlist-co",
    key: "shortlist-company",
    title: "Company Search from Shortlisted Candidates",
    status: "done",
    whenLabel: "11 Nov",
    tagLabel: "Done · 11 Nov",
    doneOn: "2026-11-11",
    sent: true,
    used: true,
    note: "Mapped 4 shortlisted candidates' companies and flagged 6 similar SAP peers.",
    proofs: [{ id: "hs-p1", name: "shortlist-companies.png", tone: "info" }],
    taId: "DR",
    taName: "Hasini",
  },
  {
    id: "hs-designation",
    key: "designation-search",
    title: "Designation-wise Search",
    status: "done",
    whenLabel: "10 Nov",
    tagLabel: "Done · 10 Nov",
    doneOn: "2026-11-10",
    sent: true,
    used: true,
    note: "Searched ERP Programme Director & SAP Delivery Manager titles across Colombo.",
    proofs: [],
    taId: "DR",
    taName: "Hasini",
  },
];

/** Additional strategy assigned to Dinuka on this job (visible in Lead whole-job view). */
export const DINUKA_DEMO: StrategyItem[] = [
  {
    id: "dk-recruiter",
    key: "recruiter-search",
    title: "Recruiter Search and Post",
    status: "in_progress",
    whenLabel: "today",
    tagLabel: "In progress",
    sent: false,
    used: false,
    note: "",
    proofs: [],
    taId: "DK",
    taName: "Dinuka",
  },
  {
    id: "dk-email",
    key: "email-campaign",
    title: "Email Campaign",
    status: "open",
    whenLabel: "Fri",
    tagLabel: "Due Friday",
    sent: false,
    used: false,
    note: "",
    proofs: [],
    taId: "DK",
    taName: "Dinuka",
  },
];

export function demoItemsForRole(role: Role): StrategyItem[] {
  if (role === "TA Support") return HASINI_DEMO.map((s) => ({ ...s, proofs: [...s.proofs] }));
  if (role === "Lead" || role === "Director" || role === "Ops") {
    return [...CHATHURA_DEMO, ...DINUKA_DEMO].map((s) => ({ ...s, proofs: [...s.proofs] }));
  }
  return CHATHURA_DEMO.map((s) => ({ ...s, proofs: [...s.proofs] }));
}

// ----- Sample workspace data matching the 9 Figma frames 1:1 -----

export type AvatarTone = "info" | "violet" | "warn" | "brand";

export const AVATAR_STYLE: Record<AvatarTone, string> = {
  info: "bg-info-soft text-info",
  violet: "bg-violet-soft text-violet",
  warn: "bg-warn-soft text-warn",
  brand: "bg-brand-soft text-brand",
};

export type OldPost = {
  id: string;
  title: string;
  company: string;
  posted: string;
  applied: number;
  fit: number;
  picked: boolean;
};

export const INITIAL_OLD_POSTS: OldPost[] = [
  { id: "op1", title: "SAP Programme Manager", company: "Hayleys", posted: "Aug 2026", applied: 14, fit: 5, picked: true },
  { id: "op2", title: "ERP Transformation Lead", company: "Brandix", posted: "May 2026", applied: 9, fit: 4, picked: true },
  { id: "op3", title: "S/4HANA Delivery Manager", company: "Virtusa", posted: "Feb 2026", applied: 18, fit: 3, picked: true },
];

export type OldPostApplicant = {
  id: string;
  initials: string;
  tone: AvatarTone;
  name: string;
  postId: string;
  appliedTo: string;
  role: string;
  before: string;
  tag: string;
  tagTone: "brand" | "neutral";
  fit: boolean;
  inPipeline?: boolean;
  cv: string;
};

export const INITIAL_OLD_POST_APPLICANTS: OldPostApplicant[] = [
  {
    id: "opa1",
    initials: "CW",
    tone: "info",
    name: "Chamara Weerasinghe",
    postId: "op1",
    appliedTo: "Applied to SAP Programme Manager",
    role: "ERP Programme Director · Hayleys",
    before: "Before: SAP Delivery Manager · MAS Holdings · 5 yrs",
    tag: "Reached client interview",
    tagTone: "brand",
    fit: true,
    cv: "/cvs/p1.pdf",
  },
  {
    id: "opa2",
    initials: "NA",
    tone: "violet",
    name: "Nimali Abeysekara",
    postId: "op2",
    appliedTo: "Applied to ERP Transformation Lead",
    role: "SAP MM Lead · IFS",
    before: "Before: SAP MM Consultant · Dialog Axiata · 4 yrs",
    tag: "Shortlisted by client",
    tagTone: "brand",
    fit: true,
    cv: "/cvs/p2.pdf",
  },
  {
    id: "opa3",
    initials: "DF",
    tone: "warn",
    name: "Dilan Fonseka",
    postId: "op3",
    appliedTo: "Applied to S/4HANA Delivery Manager",
    role: "SAP Delivery Manager · Dipped Products",
    before: "Before: SAP PP Lead · Ansell Lanka · 5 yrs",
    tag: "Not screened then",
    tagTone: "neutral",
    fit: true,
    cv: "/cvs/s1.pdf",
  },
  {
    id: "opa4",
    initials: "TJ",
    tone: "brand",
    name: "Tharindu Jay",
    postId: "op2",
    appliedTo: "Applied to ERP Transformation Lead",
    role: "SAP FICO Manager · Brandix",
    before: "Before: SAP FICO Consultant · Hirdaramani · 5 yrs",
    tag: "In your pipeline",
    tagTone: "neutral",
    fit: false,
    inPipeline: true,
    cv: "/cvs/s2.pdf",
  },
  {
    id: "opa5",
    initials: "HW",
    tone: "info",
    name: "Hasini Wickrama",
    postId: "op1",
    appliedTo: "Applied to SAP Programme Manager",
    role: "Transformation Lead · Royal Ceramics",
    before: "Before: Finance Systems Manager · Lanka Tiles · 5 yrs",
    tag: "Not screened then",
    tagTone: "neutral",
    fit: false,
    cv: "/cvs/s3.pdf",
  },
];

export type LinkedInSavedSearch = {
  id: string;
  query: string;
  found: string;
  progress: string;
  action: "Continue" | "Start";
  matches: { id: string; initials: string; tone: AvatarTone; name: string; role: string; location: string; cv: string }[];
};

export const INITIAL_LI_SEARCHES: LinkedInSavedSearch[] = [
  {
    id: "ls1",
    query: "SAP S/4HANA leads who ran a manufacturing rollout · Colombo",
    found: "1,240 found",
    progress: "25 screened · 6 saved",
    action: "Continue",
    matches: [
      { id: "lsm1", initials: "KP", tone: "info", name: "Kasun Perera", role: "SAP S/4HANA Lead · Virtusa", location: "Colombo", cv: "/cvs/p1.pdf" },
      { id: "lsm2", initials: "IS", tone: "violet", name: "Ishara Silva", role: "SAP Solution Architect · Virtusa", location: "Colombo", cv: "/cvs/p2.pdf" },
    ],
  },
  {
    id: "ls2",
    query: "ERP programme directors · Sri Lanka · 12+ years",
    found: "386 found",
    progress: "40 screened · 4 saved",
    action: "Continue",
    matches: [
      { id: "lsm3", initials: "CW", tone: "brand", name: "Chamara Weerasinghe", role: "ERP Programme Director · Hayleys", location: "Colombo", cv: "/cvs/s1.pdf" },
      { id: "lsm4", initials: "RG", tone: "warn", name: "Ruwan Gunawardena", role: "Head of SAP Delivery · IFS", location: "Colombo", cv: "/cvs/s2.pdf" },
    ],
  },
  {
    id: "ls3",
    query: "People like Kasun Perera",
    found: "92 found",
    progress: "Not screened yet",
    action: "Start",
    matches: [
      { id: "lsm5", initials: "SP", tone: "brand", name: "Shalini Perera", role: "ERP Programme Manager · MAS Holdings", location: "Colombo", cv: "/cvs/s3.pdf" },
    ],
  },
];

export type InMailPerson = {
  id: string;
  initials: string;
  tone: AvatarTone;
  name: string;
  role: string;
  message: string;
  when: string;
  status: "Interested" | "Not now" | "Opened" | "Sent";
  cv: string;
};

export const INITIAL_INMAIL_PEOPLE: InMailPerson[] = [
  {
    id: "im1",
    initials: "IS",
    tone: "info",
    name: "Ishara Silva",
    role: "SAP Solution Architect · Virtusa",
    message: "“Yes, happy to talk. Please send me the JD.”",
    when: "Replied today, 10:42 AM",
    status: "Interested",
    cv: "/cvs/p2.pdf",
  },
  {
    id: "im2",
    initials: "SD",
    tone: "violet",
    name: "Sameera Dias",
    role: "SAP Lead · Hayleys Fibre",
    message: "“Not looking right now. Try me in March.”",
    when: "Replied yesterday",
    status: "Not now",
    cv: "/cvs/s4.pdf",
  },
  {
    id: "im3",
    initials: "RG",
    tone: "warn",
    name: "Ruwan Gunawardena",
    role: "Head of SAP · Lanka Tiles",
    message: "Opened your InMail 2 times. No reply yet.",
    when: "Sent 14 Nov",
    status: "Opened",
    cv: "/cvs/s2.pdf",
  },
  {
    id: "im4",
    initials: "SP",
    tone: "brand",
    name: "Shalini Perera",
    role: "ERP Programme Manager · Rocell",
    message: "Opened your InMail. No reply yet.",
    when: "Sent 14 Nov",
    status: "Opened",
    cv: "/cvs/s3.pdf",
  },
  {
    id: "im5",
    initials: "AS",
    tone: "info",
    name: "Arjuna Silva",
    role: "Digital Transformation Lead · Ansell Lanka",
    message: "Not opened yet.",
    when: "Sent 15 Nov",
    status: "Sent",
    cv: "/cvs/s5.pdf",
  },
];

export type SmartAdApplicant = {
  id: string;
  initials: string;
  tone: AvatarTone;
  name: string;
  channel: "whatsapp" | "facebook";
  sourceLabel: string;
  role: string;
  before: string;
  fit: "Fit" | "Weak";
  cv: string;
};

export const INITIAL_AD_APPLICANTS: SmartAdApplicant[] = [
  {
    id: "ad1",
    initials: "DF",
    tone: "info",
    name: "Dilan Fonseka",
    channel: "whatsapp",
    sourceLabel: "From the WhatsApp ad · today",
    role: "SAP Delivery Manager · Dipped Products",
    before: "Before: SAP PP Lead · Ansell Lanka · 5 yrs",
    fit: "Fit",
    cv: "/cvs/s1.pdf",
  },
  {
    id: "ad2",
    initials: "HW",
    tone: "violet",
    name: "Hasini Wickrama",
    channel: "whatsapp",
    sourceLabel: "From the WhatsApp ad · today",
    role: "Transformation Lead · Royal Ceramics",
    before: "Before: Finance Systems Manager · Lanka Tiles · 5 yrs",
    fit: "Fit",
    cv: "/cvs/s3.pdf",
  },
  {
    id: "ad3",
    initials: "KB",
    tone: "warn",
    name: "Kasun Bandara",
    channel: "facebook",
    sourceLabel: "From the Facebook ad · yesterday",
    role: "SAP Basis Administrator · Softlogic",
    before: "Before: IT Executive · Abans · 3 yrs",
    fit: "Weak",
    cv: "/cvs/s6.pdf",
  },
  {
    id: "ad4",
    initials: "NP",
    tone: "brand",
    name: "Nadeesha Peiris",
    channel: "whatsapp",
    sourceLabel: "From the WhatsApp ad · yesterday",
    role: "SAP PP Consultant · MAS Holdings",
    before: "Before: Production Planner · Brandix · 4 yrs",
    fit: "Fit",
    cv: "/cvs/s5.pdf",
  },
];

export type CompetitorCompany = {
  id: string;
  letter: string;
  name: string;
  meta: string;
  countText: string;
  picked: boolean;
};

export const INITIAL_COMPANIES: CompetitorCompany[] = [
  { id: "c1", letter: "V", name: "Virtusa", meta: "IT services · Colombo", countText: "23 people in SAP roles", picked: true },
  { id: "c2", letter: "I", name: "IFS", meta: "ERP software · Colombo", countText: "18 people in SAP roles", picked: true },
  { id: "c3", letter: "M", name: "MAS Holdings", meta: "Apparel · Colombo", countText: "11 people in SAP roles", picked: true },
  { id: "c4", letter: "H", name: "Hayleys", meta: "Group · Colombo", countText: "9 people in SAP roles", picked: true },
  { id: "c5", letter: "B", name: "Brandix", meta: "Apparel · Colombo", countText: "7 people in SAP roles", picked: false },
];

export type CompanyPerson = {
  id: string;
  initials: string;
  tone: AvatarTone;
  name: string;
  company: string;
  location: string;
  role: string;
  before: string;
  hasCv: boolean;
  cv?: string;
};

export const INITIAL_COMPANY_PEOPLE: CompanyPerson[] = [
  {
    id: "cp1",
    initials: "KP",
    tone: "info",
    name: "Kasun Perera",
    company: "Virtusa",
    location: "Virtusa · Colombo",
    role: "SAP S/4HANA Lead · since 2020",
    before: "Before: Senior SAP Consultant · IFS · 3.5 yrs",
    hasCv: true,
    cv: "/cvs/p1.pdf",
  },
  {
    id: "cp2",
    initials: "IS",
    tone: "violet",
    name: "Ishara Silva",
    company: "Virtusa",
    location: "Virtusa · Colombo",
    role: "SAP Solution Architect · since 2019",
    before: "Before: SAP PP Consultant · Brandix · 3 yrs",
    hasCv: true,
    cv: "/cvs/p2.pdf",
  },
  {
    id: "cp3",
    initials: "RG",
    tone: "warn",
    name: "Ruwan Gunawardena",
    company: "IFS",
    location: "IFS · Colombo",
    role: "Head of SAP Delivery · since 2021",
    before: "Before: SAP Programme Manager · Lanka Tiles · 6 yrs",
    hasCv: false,
  },
  {
    id: "cp4",
    initials: "SP",
    tone: "brand",
    name: "Shalini Perera",
    company: "MAS Holdings",
    location: "MAS Holdings · Colombo",
    role: "ERP Programme Manager · since 2022",
    before: "Before: SAP MM Lead · Rocell · 4 yrs",
    hasCv: false,
  },
  {
    id: "cp5",
    initials: "CW",
    tone: "info",
    name: "Chamara Weerasinghe",
    company: "Hayleys",
    location: "Hayleys · Colombo",
    role: "ERP Programme Director · since 2021",
    before: "Before: SAP Delivery Manager · MAS Holdings · 5 yrs",
    hasCv: true,
    cv: "/cvs/s1.pdf",
  },
  {
    id: "cp6",
    initials: "TJ",
    tone: "brand",
    name: "Tharindu Jay",
    company: "Brandix",
    location: "Brandix · Colombo",
    role: "SAP FICO Manager · since 2020",
    before: "Before: SAP FICO Consultant · Hirdaramani · 5 yrs",
    hasCv: true,
    cv: "/cvs/s2.pdf",
  },
];

export type HeadhuntTarget = {
  id: string;
  initials: string;
  tone: AvatarTone;
  name: string;
  role: string;
  status: "CV received" | "Thinking about it" | "Reached out";
  lastContact: string;
  cv?: string;
};

export const INITIAL_HEADHUNT_TARGETS: HeadhuntTarget[] = [
  {
    id: "ht1",
    initials: "CW",
    tone: "info",
    name: "Chamara Weerasinghe",
    role: "ERP Programme Director · Hayleys",
    status: "CV received",
    lastContact: "Last contact: call, 11 Nov",
    cv: "/cvs/p1.pdf",
  },
  {
    id: "ht2",
    initials: "RG",
    tone: "violet",
    name: "Ruwan Gunawardena",
    role: "Head of SAP Delivery · IFS",
    status: "CV received",
    lastContact: "Last contact: WhatsApp, 11 Nov",
    cv: "/cvs/p2.pdf",
  },
  {
    id: "ht3",
    initials: "SP",
    tone: "warn",
    name: "Shalini Perera",
    role: "ERP Programme Manager · MAS Holdings",
    status: "Thinking about it",
    lastContact: "Last contact: call, 10 Nov",
  },
];

export type HeadhuntEvent = {
  id: string;
  date: string;
  text: string;
  channel: string;
};

export const INITIAL_HEADHUNT_EVENTS: HeadhuntEvent[] = [
  { id: "he1", date: "11 Nov", text: "Chamara sent his CV after the second call.", channel: "Call" },
  { id: "he2", date: "11 Nov", text: "Ruwan sent his CV on WhatsApp.", channel: "WhatsApp" },
  { id: "he3", date: "10 Nov", text: "Shalini asked for the JD. She wants a week to think.", channel: "Call" },
  { id: "he4", date: "9 Nov", text: "You picked 3 people with AURA and got their numbers.", channel: "AURA" },
];

export const AI_SEARCH_WORDS = [
  '"SAP S/4HANA" AND manufacturing',
  "ERP programme lead",
  "SAP delivery manager",
  '"business transformation" AND SAP',
  "S/4HANA rollout",
  "SAP MM OR PP lead",
  "Head of SAP",
];

export const AI_COMPANY_LIST = [
  "Virtusa",
  "IFS",
  "MAS Holdings",
  "Hayleys",
  "Brandix",
  "Dipped Products",
  "Ansell Lanka",
  "Lanka Tiles",
  "Royal Ceramics",
  "John Keells IT",
];

export type DailyPlanDay = {
  id: string;
  label: string;
  fullLabel: string;
  past: boolean;
  auraLine: string;
  tasks: {
    id: string;
    time: string;
    text: string;
    strategyKey: StrategyKey | "all";
    strategyLabel: string;
    state: "done" | "active" | "todo";
  }[];
};

export const INITIAL_DAILY_PLAN: DailyPlanDay[] = [
  {
    id: "mon",
    label: "Mon 16",
    fullLabel: "Mon 16 Nov",
    past: true,
    auraLine: "Monday is wrapped up. Scoop and Repository are done and submitted.",
    tasks: [
      { id: "m1", time: "9:30", text: "Review incoming Director scoops for this opening", strategyKey: "scoop", strategyLabel: "Scoop", state: "done" },
      { id: "m2", time: "11:30", text: "Scan AURA repository for SAP S/4HANA leads", strategyKey: "repository", strategyLabel: "Repository", state: "done" },
      { id: "m3", time: "3:00", text: "Submit Scoop and Repository logs to Rashmi", strategyKey: "all", strategyLabel: "All strategies", state: "done" },
    ],
  },
  {
    id: "tue",
    label: "Tue 17",
    fullLabel: "Tue 17 Nov",
    past: true,
    auraLine: "Direct Headhunt brought 2 CVs on Tuesday and reached Rashmi.",
    tasks: [
      { id: "t1", time: "9:00", text: "Follow-up calls with Chamara and Ruwan", strategyKey: "direct-headhunt", strategyLabel: "Direct Headhunt", state: "done" },
      { id: "t2", time: "1:30", text: "Launch WhatsApp and Facebook Smart Ads", strategyKey: "smart-ad", strategyLabel: "Smart Ad", state: "done" },
      { id: "t3", time: "4:00", text: "Submit Direct Headhunt proofs to Rashmi", strategyKey: "direct-headhunt", strategyLabel: "Direct Headhunt", state: "done" },
    ],
  },
  {
    id: "wed",
    label: "Wed 18",
    fullLabel: "Wed 18 Nov",
    past: false,
    auraLine: "Here is your day. LinkedIn Search first, then the old posts.",
    tasks: [
      { id: "w1", time: "9:00", text: "Screen the 25 closest LinkedIn results", strategyKey: "linkedin-search", strategyLabel: "LinkedIn Search", state: "done" },
      { id: "w2", time: "10:30", text: "Check the 12 people from old posts", strategyKey: "previous-post-screening", strategyLabel: "Previous Post Screening", state: "active" },
      { id: "w3", time: "12:00", text: "Reply to Ishara and send her the JD", strategyKey: "inmail", strategyLabel: "InMail", state: "todo" },
      { id: "w4", time: "2:00", text: "Review the 9 WhatsApp ad applicants", strategyKey: "smart-ad", strategyLabel: "Smart Ad", state: "todo" },
      { id: "w5", time: "4:30", text: "Log today’s numbers and submit to Rashmi", strategyKey: "all", strategyLabel: "All strategies", state: "todo" },
    ],
  },
  {
    id: "thu",
    label: "Thu 19",
    fullLabel: "Thu 19 Nov",
    past: false,
    auraLine: "Thursday focuses on InMail follow-ups and accepting new strategies.",
    tasks: [
      { id: "th1", time: "9:30", text: "Follow up with 2 candidates who opened your InMail", strategyKey: "inmail", strategyLabel: "InMail", state: "todo" },
      { id: "th2", time: "11:00", text: "Accept AI Search and run JD search strings", strategyKey: "ai-search", strategyLabel: "AI Search", state: "todo" },
      { id: "th3", time: "2:30", text: "Log InMail replies and submit to Rashmi", strategyKey: "inmail", strategyLabel: "InMail", state: "todo" },
    ],
  },
  {
    id: "fri",
    label: "Fri 20",
    fullLabel: "Fri 20 Nov",
    past: false,
    auraLine: "Finish Company Extraction across Virtusa, IFS, MAS and Hayleys.",
    tasks: [
      { id: "f1", time: "9:30", text: "Search inside the 5 picked competitor companies", strategyKey: "company-extraction", strategyLabel: "Company Extraction", state: "todo" },
      { id: "f2", time: "1:30", text: "Ask 4 referees for SAP lead referrals", strategyKey: "referral-extraction", strategyLabel: "Referral Extraction", state: "todo" },
      { id: "f3", time: "4:00", text: "Submit end-of-week strategy logs", strategyKey: "all", strategyLabel: "All strategies", state: "todo" },
    ],
  },
];
