/** The new search's two data shapes: a candidate's profile and a search spec. */

export type QualStatus = "studying" | "part_qualified" | "finalist" | "member" | "holds";

export interface ProfileJob {
  role: string | null;
  level: number | null;
  title: string;
  company: string;
  companyTypes: string[];
  country: string | null;
  /** "YYYY-MM" or "YYYY"; null when the CV gives none. */
  start: string | null;
  /** "YYYY-MM", "YYYY", "present", or null when not written. */
  end: string | null;
  internship: boolean;
}

export interface Profile {
  id: string;
  /** False for merged duplicates and records whose CV file is lost (D11, R9). */
  searchable: boolean;
  roles: string[];
  family: string | null;
  level: number | null;
  title: string;
  /** Most specific place id resolved from where they live now. */
  place: string | null;
  country: string | null;
  nationality: string | null;
  gender: "male" | "female" | null;
  genderSource: "cv" | "nic" | null;
  /** ISO date; with "stated_age" only the year is meaningful. */
  dob: string | null;
  dobSource: "cv" | "nic" | "stated_age" | null;
  years: number | null;
  yearsSource: "ta" | "job_dates" | "stated" | null;
  /** True when some dates were years only, or an open job was not the latest. */
  yearsApprox: boolean;
  jobs: ProfileJob[];
  workedCountries: string[];
  quals: { id: string; status: QualStatus }[];
  skills: string[];
  companyTypesNow: string[];
  companyTypesEver: string[];
  employers: string[];
  salary: { amount: number; currency: string; period: "month" | "year"; kind: "current" | "expected"; usdMonthly: number | null } | null;
  noticeDays: number | null;
  visa: string | null;
  licence: string | null;
  languages: string[];
  cvDate: string;
  /** Text for whole-word matching: titles now and before, skills, qualifications, employers. */
  text: string;
  /** Fields the builder could not fill, for "unknown" counts. */
  gaps: string[];
}

export type Field =
  | "role" | "level" | "place" | "nationality" | "workedIn" | "years" | "age" | "gender" | "qualification"
  | "companyType" | "company" | "skill" | "keyword" | "cvDate" | "salary" | "notice" | "language" | "visa" | "licence";

/**
 * One chip. `not` turns it into an exclusion; ranges use min/max. A must
 * filters; a preference only ranks. `includeUnknown` decides what happens to
 * people whose value is not on file (the tick on the results page).
 */
export interface Chip {
  field: Field;
  values?: string[];
  min?: number | null;
  max?: number | null;
  not?: boolean;
  must: boolean;
  includeUnknown?: boolean;
  /** Qualification: lowest status that counts. Role: whether past roles count ("now" | "ever"). Salary: "current" | "expected". Company: "now" | "ever". */
  qualifier?: string;
  /** Currency of a salary chip. */
  currency?: string;
  label?: string;
}

export interface Spec {
  chips: Chip[];
  /** A question to ask the TA, only for a real ambiguity. */
  question?: string | null;
  /** Words the reader could not turn into a chip, shown back to the TA. */
  unread?: string[];
}
