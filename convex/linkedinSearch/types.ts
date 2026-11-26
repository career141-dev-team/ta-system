/**
 * LinkedIn Search engine — shared types.
 *
 * Plain data only (no classes) so every value can be stored in Convex as-is.
 * See the Full Plan v1.2, sections 4–6.
 */

/** Level ladder used for target level, ceilings and level checks (lowest first). */
export type Level =
  | "trainee"
  | "executive"
  | "senior_executive"
  | "assistant_manager"
  | "manager"
  | "senior_manager"
  | "agm"
  | "dgm"
  | "gm"
  | "director"
  | "c_level";

export type SearchType =
  | "by_role"
  | "by_company"
  | "more_like_this"
  | "widen"
  | "boolean"
  | "find_one"
  | "sri_lankans_abroad"
  | "gulf_now_home"
  | "ready_to_come_home"
  | "india"
  | "same_school"
  | "languages"
  | "ready_to_move"
  | "contract";

export type YearsRange = { min: number | null; max: number | null };

/** Where the person lives (never the employer's head office). */
export type PersonLocation = {
  country: string | null;
  city: string | null;
  /** "Sri Lankans abroad": lives in `country`, studied in this country. Never guessed from names. */
  studiedIn: string | null;
};

/** Something taken out of the request, with the reason the TA is told. */
export type RemovedItem = { item: RemovedKind; text: string; why: string };
export type RemovedKind =
  | "salary"
  | "benefits"
  | "notice_period"
  | "gender"
  | "age"
  | "religion"
  | "marital_status"
  | "nationality"
  | "ethnicity"
  | "soft_skills"
  | "chat_ask"
  | "working_terms";

/**
 * The standard form (section 4.1). Every search type produces one; the same need
 * always gives the same form, the same query text and the same idempotency key.
 */
export type StandardForm = {
  type: SearchType;
  /** Main role title, short forms expanded ("Quantity Surveyor"). */
  role: string;
  /** Function key from the vocabulary ("finance", "strategy", …) or "" if unknown. */
  function: string;
  /** Role + close titles (max 12). */
  titles: string[];
  /** Target level — the level the TA wants, not the JD title. */
  levelLow: Level | null;
  levelHigh: Level | null;
  location: PersonLocation;
  totalYears: YearsRange | null;
  /** "3–5 years in solar PV" → own result column. */
  areaYears: { area: string; min: number | null; max: number | null } | null;
  industry: string | null;
  /** Look-alike industries to leave out ("garment / apparel makers"). */
  notIndustries: string[];
  companySize: string | null;
  /** Maximum 3. */
  mustHaves: string[];
  niceToHaves: string[];
  /** Must-haves the AI reader suggests for a pasted JD. Shown as one-click adds; not searched until the TA picks them. */
  suggestedMustHaves: string[];
  /** Must-haves the AI added (owner, 26 Nov: "add it; if they want to remove anything they can"). The page shows a remove button on each. */
  aiMustHaves: string[];
  /** Companies to leave out (client, its group, off-limits clients). */
  excludeCompanies: string[];
  /** Companies the person must currently work at ("by company" search). */
  currentCompanies: string[];
  /** Qualifications / memberships — never sent to Crustdata, checked in the headline. */
  qualifications: string[];
  /** Always 30 for a main search. */
  count: number;
  /** Extra hard rule for special search types ("open to work", "past job in the Gulf", …). */
  extraRules: string[];
  /** Items removed and noted (not searched). Not part of the form key. */
  removed: RemovedItem[];
  /** Plain notes for the TA (e.g. "JD title CFO; searching the target level"). Not part of the form key. */
  notes: string[];
  /** Raw signals the free check reads. Not part of the form key. */
  signals: FormSignals;
};

export type FormSignals = {
  /** Level read from the JD title, when different from the target. */
  jdTitleLevel: Level | null;
  jdTitle: string | null;
  /** All person locations named (more than one → clash). */
  locationsNamed: string[];
  /** Industries named in the JD body vs in the TA's own lines (clash when they differ). */
  jdIndustryHint: string | null;
  taIndustryHint: string | null;
  /** Separate roles found ("2 merchandisers and 1 production planner"). */
  splitRoles: string[];
  freshGraduate: boolean;
  /** Must-haves that did not fit in the 3 slots. */
  extraMustHaves: string[];
  /** Years lines found (JD and TA) for the check. */
  yearsFromJd: YearsRange | null;
  yearsFromTa: YearsRange | null;
  /** The client named in the text. */
  client: string | null;
  /** "Sri Lankans" was read as "lives in Sri Lanka" (no other country named). */
  sriLankansReadAsHome: boolean;
  /** Years are counted after qualifying ("8-10 years post-qualification"): about 3 more years in total. */
  postQualification: boolean;
  /** Owner's default (26 Nov): no place → lives in Sri Lanka; another country → Sri Lankans living there. */
  locationDefault: "home" | "sri_lankans_abroad" | null;
  /** The request asks for locals / another nationality / any nationality (then everyone in that country). */
  localsAsked: boolean;
  /** Overseas named without a country ("sri lankans overseas"). */
  overseasNoCountry: boolean;
  /** "Only X companies" / small named list. */
  onlyCompaniesNamed: boolean;
  /** Text length used (for the "long JD" note). */
  chars: number;
};

/** What the TA gives (section 3). */
export type SearchRequest = {
  type?: SearchType;
  /** Typed need or pasted JD. */
  text?: string;
  /** The TA's own line, which wins over the JD. */
  taNote?: string;
  opening?: { id?: string; title?: string; client?: string; location?: string; jd?: string };
  /** By company. */
  companies?: string[];
  /** More like this. */
  likePerson?: { title?: string; company?: string; companies?: string[]; industry?: string; years?: number; country?: string };
  /** Languages / same school. */
  languages?: string[];
  institution?: string;
  /** Answers to check questions or direct edits (field → value). Applied last. */
  edits?: Partial<Omit<StandardForm, "signals" | "removed" | "notes">>;
  /** Off-limits clients from settings. */
  offLimits?: string[];
};

export type CheckQuestion = {
  code:
    | "missing_location"
    | "missing_level"
    | "missing_years"
    | "missing_role"
    | "clash_level_years"
    | "clash_jd_ta_industry"
    | "clash_jd_title_level"
    | "clash_two_locations"
    | "too_narrow"
    | "too_many_must_haves"
    | "too_broad"
    | "split_roles"
    | "overseas_where"
    | "sri_lankans_where";
  field: keyof StandardForm | "count";
  question: string;
  /** Suggested answers the page can show as buttons. */
  options?: string[];
};

export type CheckResult = {
  /** True when nothing blocks the search. */
  ok: boolean;
  questions: CheckQuestion[];
  /** Shown to the TA but not blocking. */
  warnings: string[];
  removed: RemovedItem[];
  /** Separate forms when the request held several roles. */
  splitForms: StandardForm[];
  /** True when a market-size count should be shown before searching. */
  wantsMarketCount: boolean;
};

/** Five must-have ticks (section 5). */
export type Tick = "yes" | "no" | "unknown";
export type MustHaveTicks = { function: Tick; level: Tick; years: Tick; industry: Tick; location: Tick };

export type YearsValue = { min: number | null; max: number | null; text: string; known: boolean };

export type ResultFlags = {
  thin: boolean;
  aboveLevel: boolean;
  belowLevel: boolean;
  otherFunction: boolean;
  atClient: boolean;
  seenBefore: boolean;
  cityNotReported: boolean;
  declined: boolean;
  unreachable: boolean;
  /** Same title as someone marked "not relevant" (or rejected) for this opening → lower in the list. */
  similarToRejected: boolean;
  heldBy: string | null;
};

export type ResultRow = {
  crustdataId: string | null;
  linkedinUrl: string | null;
  name: string;
  headline: string;
  currentTitle: string;
  currentCompany: string;
  city: string | null;
  country: string | null;
  totalYears: YearsValue;
  /** Approximate — check on LinkedIn. */
  areaYears: YearsValue | null;
  mustHaves: MustHaveTicks;
  /** Crustdata's evidence per check (as information, never a reason to drop). */
  evidence: { check: string; verdict: Tick; text: string }[];
  qualificationsInHeadline: string[];
  flags: ResultFlags;
  warnings: string[];
  dataDate: string | null;
  source: "saved" | "agent" | "normal";
  rank: number;
  hidden: boolean;
  hiddenReason: string | null;
  /** Fields filled by the gap-fill re-fetch. */
  filled: string[];
  seenBefore: SeenBefore[];
};

export type SeenBefore = {
  searchId: string;
  by: string;
  at: string;
  openingId?: string;
  verdict?: Verdict;
};

export type Verdict = "good" | "maybe" | "not_relevant";
export type Outcome = "declined" | "unreachable" | "shortlisted" | "placed" | "rejected_by_director" | "rejected_by_client";

export type SpendKind = "agent" | "show_more" | "find_one" | "gap_fill" | "count" | "fallback";

export type SpendEntry = {
  userId: string;
  searchId?: string;
  openingId?: string;
  kind: SpendKind;
  credits: number;
  usd: number;
  crustdataRef: string;
  createdAt: string;
};

export type Settings = {
  resultsPerSearch: number;
  showMoreSize: number;
  declinedHideDays: number;
  hideClientStaff: boolean;
  agentTimeoutSeconds: number;
  creditPriceUSD: number;
  /** Stop before a paid call when the balance would drop below this (keeps e.g. the director's test credit). */
  reserveCredits: number;
  maxPerCompany: number | null;
  pollSeconds: number;
  /** Ask the normal search (show more, top-up, fallback) for the current employer too, so the company column is never blank. */
  normalSearchWithCompany: boolean;
  /** Fill a short main-search list to 30 with the basic search automatically. Off (owner, 26 Nov): the TA presses Show more. */
  autoTopUp: boolean;
  /**
   * Agent query style: "full" (one rule per item), "joined" (overlapping rules joined; fewer checks) or "auto".
   * Auto (default, from the 26 Nov paid test): joined when the form has no area years and no must-haves
   * (UAE QS: 23% cheaper, same quality); full otherwise (solar with area years: joined was 29% cheaper but weaker).
   */
  queryStyle: "full" | "joined" | "auto";
};

export const DEFAULT_SETTINGS: Settings = {
  resultsPerSearch: 30,
  showMoreSize: 30,
  declinedHideDays: 180,
  hideClientStaff: true,
  agentTimeoutSeconds: 300,
  creditPriceUSD: 0.3,
  reserveCredits: 0,
  maxPerCompany: null,
  pollSeconds: 10,
  normalSearchWithCompany: true,
  autoTopUp: false,
  queryStyle: "auto",
};

/** The one LLM hook. Return the model's text answer. Wire to convex/lib/llm.ts. */
export type Llm = (args: { system: string; user: string; maxTokens?: number }) => Promise<string>;
