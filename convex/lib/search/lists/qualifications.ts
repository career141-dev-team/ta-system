/**
 * Qualifications, Sri Lankan and international, with a status ladder:
 * studying < part qualified < finalist < member (or "holds" for degrees,
 * licences and certificates). A search for "CIMA" accepts part qualified and
 * up unless the TA says "fully qualified" / "member" / "finalist".
 */

export interface Qualification {
  id: string;
  label: string;
  kind: "professional" | "degree" | "school" | "licence" | "certificate";
  /** Text that names it on a CV or in a request, lower case, whole words. */
  names: string[];
  /** Equivalents a TA usually accepts ("CA" asked: CA Sri Lanka, ICAI, ICAEW all count). */
  sameAs?: string[];
  country?: string;
}

export const QUAL_STATUS = ["studying", "part_qualified", "finalist", "member"] as const;
export type QualStatus = (typeof QUAL_STATUS)[number];
export const QUAL_STATUS_RANK: Record<QualStatus, number> = { studying: 0, part_qualified: 1, finalist: 2, member: 3 };

export const QUALIFICATIONS: Qualification[] = [
  // Accounting, Sri Lanka
  { id: "ca_sl", label: "CA Sri Lanka (ICASL)", kind: "professional", names: ["ca sri lanka", "icasl", "chartered accountant sri lanka", "aca sri lanka", "institute of chartered accountants of sri lanka", "ca (sl)", "ca sl"], sameAs: ["ca_india", "aca_icaew"], country: "LK" },
  { id: "cima", label: "CIMA", kind: "professional", names: ["cima", "acma", "cgma", "chartered institute of management accountants", "fcma"] },
  { id: "acca", label: "ACCA", kind: "professional", names: ["acca", "fcca", "association of chartered certified accountants"] },
  { id: "aat_sl", label: "AAT Sri Lanka", kind: "professional", names: ["aat", "aat sri lanka", "maat", "association of accounting technicians"], country: "LK" },
  { id: "cma_sl", label: "CMA Sri Lanka", kind: "professional", names: ["cma sri lanka", "cma (sl)", "institute of certified management accountants of sri lanka"], country: "LK" },
  // Accounting, international
  { id: "ca_india", label: "CA India (ICAI)", kind: "professional", names: ["icai", "ca india", "ca (india)", "ca inter", "ca final", "chartered accountant india", "institute of chartered accountants of india"], sameAs: ["ca_sl", "aca_icaew"], country: "IN" },
  { id: "aca_icaew", label: "ACA (ICAEW)", kind: "professional", names: ["icaew", "aca icaew", "aca (icaew)", "fca icaew"], sameAs: ["ca_sl", "ca_india"], country: "GB" },
  { id: "cpa_us", label: "CPA (US)", kind: "professional", names: ["us cpa", "cpa usa", "cpa (us)", "certified public accountant", "cpa"], country: "US" },
  { id: "cpa_au", label: "CPA Australia", kind: "professional", names: ["cpa australia"], country: "AU" },
  { id: "cma_us", label: "CMA (US, IMA)", kind: "professional", names: ["cma usa", "cma (us)", "us cma", "ima cma"] },
  { id: "cfa", label: "CFA", kind: "professional", names: ["cfa", "chartered financial analyst"] },
  { id: "frm", label: "FRM", kind: "professional", names: ["frm", "financial risk manager"] },
  { id: "cia", label: "CIA (internal audit)", kind: "professional", names: ["certified internal auditor", "cia (iia)", "iia cia"] },
  { id: "cisa", label: "CISA", kind: "professional", names: ["cisa"] },
  { id: "acams", label: "CAMS (anti-money laundering)", kind: "certificate", names: ["cams", "acams"] },
  // HR
  { id: "chrm", label: "CHRM / CIPM (IPM Sri Lanka)", kind: "professional", names: ["chrm", "cipm", "ipm sri lanka", "institute of personnel management", "chartered institute of personnel management", "dhrm", "ipm"], country: "LK" },
  { id: "cipd", label: "CIPD", kind: "professional", names: ["cipd", "chartered institute of personnel and development", "mcipd", "assoc cipd"], country: "GB" },
  { id: "shrm", label: "SHRM-CP / SCP", kind: "certificate", names: ["shrm", "shrm-cp", "shrm-scp", "shrm cp"] },
  // Marketing
  { id: "slim", label: "SLIM (marketing, Sri Lanka)", kind: "professional", names: ["slim", "sri lanka institute of marketing", "slim diploma", "pgd marketing slim"], country: "LK" },
  { id: "cim", label: "CIM (marketing, UK)", kind: "professional", names: ["cim", "chartered institute of marketing", "cim diploma"], country: "GB" },
  // Project and IT
  { id: "pmp", label: "PMP", kind: "certificate", names: ["pmp", "project management professional"] },
  { id: "prince2", label: "PRINCE2", kind: "certificate", names: ["prince2", "prince 2"] },
  { id: "aws", label: "AWS certification", kind: "certificate", names: ["aws certified", "aws solutions architect", "aws certification"] },
  { id: "azure", label: "Microsoft Azure certification", kind: "certificate", names: ["azure certified", "az-900", "az-104", "azure administrator"] },
  { id: "ccna", label: "CCNA / CCNP", kind: "certificate", names: ["ccna", "ccnp"] },
  { id: "istqb", label: "ISTQB", kind: "certificate", names: ["istqb"] },
  { id: "scrum", label: "Scrum certification", kind: "certificate", names: ["csm", "psm", "certified scrum master", "professional scrum master"] },
  // Engineering, construction, safety
  { id: "ceng", label: "Chartered Engineer (IESL / CEng)", kind: "professional", names: ["ceng", "chartered engineer", "iesl", "miesl", "amiesl", "amie"] },
  { id: "rics", label: "RICS (MRICS / AssocRICS)", kind: "professional", names: ["rics", "mrics", "assocrics", "aiqs"] },
  { id: "nebosh", label: "NEBOSH", kind: "certificate", names: ["nebosh", "nebosh igc", "iosh"] },
  // Nursing and health licences
  { id: "slnc", label: "Sri Lanka Nursing Council registration", kind: "licence", names: ["slnc", "sri lanka nursing council", "slmc nursing"], country: "LK" },
  { id: "dha", label: "DHA licence (Dubai)", kind: "licence", names: ["dha", "dha licence", "dha license", "dubai health authority"], country: "AE" },
  { id: "doh_ad", label: "DOH / HAAD licence (Abu Dhabi)", kind: "licence", names: ["haad", "doh licence", "doh license", "department of health abu dhabi", "doh abu dhabi"], country: "AE" },
  { id: "moh_uae", label: "MOH UAE licence", kind: "licence", names: ["moh uae", "mohap", "ministry of health uae"], country: "AE" },
  { id: "qchp", label: "QCHP / DHP licence (Qatar)", kind: "licence", names: ["qchp", "prometric qatar", "dhp qatar", "qatar council for healthcare practitioners"], country: "QA" },
  { id: "scfhs", label: "SCFHS (Saudi)", kind: "licence", names: ["scfhs", "saudi council for health specialties", "saudi commission for health specialties", "mumaris"], country: "SA" },
  { id: "nmc_uk", label: "NMC registration (UK)", kind: "licence", names: ["nmc", "nmc pin", "nursing and midwifery council"], country: "GB" },
  { id: "prometric", label: "Prometric exam passed", kind: "certificate", names: ["prometric", "dataflow"] },
  { id: "slmc", label: "SLMC registration (doctor)", kind: "licence", names: ["slmc", "sri lanka medical council"], country: "LK" },
  // Degrees and schooling
  { id: "bsc_nursing", label: "BSc Nursing", kind: "degree", names: ["bsc nursing", "b.sc nursing", "bachelor of science in nursing", "bsn"] },
  { id: "gnm", label: "GNM / Diploma in Nursing", kind: "degree", names: ["gnm", "diploma in nursing", "general nursing and midwifery", "nursing diploma"] },
  { id: "mbbs", label: "MBBS", kind: "degree", names: ["mbbs", "md medicine"] },
  { id: "bpharm", label: "BPharm", kind: "degree", names: ["bpharm", "b.pharm", "bachelor of pharmacy"] },
  { id: "llb", label: "LLB / Attorney-at-Law", kind: "degree", names: ["llb", "attorney-at-law", "attorney at law", "bachelor of laws", "barrister"] },
  { id: "mba", label: "MBA", kind: "degree", names: ["mba", "master of business administration", "executive mba"] },
  { id: "masters", label: "Master's degree", kind: "degree", names: ["msc", "m.sc", "ma", "masters", "master of science", "master's", "mcom", "m.com"] },
  { id: "bachelors", label: "Bachelor's degree", kind: "degree", names: ["bsc", "b.sc", "ba", "bcom", "b.com", "bba", "bachelor", "degree", "b.tech", "btech", "be", "b.e", "beng", "bachelor's"] },
  { id: "hnd", label: "HND / Higher Diploma", kind: "degree", names: ["hnd", "higher national diploma", "hndip", "higher diploma"] },
  { id: "diploma", label: "Diploma", kind: "degree", names: ["diploma"] },
  { id: "nvq", label: "NVQ (Sri Lanka)", kind: "certificate", names: ["nvq", "nvq level"], country: "LK" },
  { id: "al", label: "GCE A/L", kind: "school", names: ["a/l", "a level", "a-level", "gce a/l", "advanced level"] },
  { id: "ol", label: "GCE O/L", kind: "school", names: ["o/l", "o level", "gce o/l", "ordinary level"] },
  { id: "pgde", label: "PGDE / Teaching qualification", kind: "degree", names: ["pgde", "pgce", "nie", "b.ed", "bed", "teaching diploma", "national diploma in teaching"] },
  // Licences and visas are not qualifications but are read the same way.
];

export const QUAL_BY_ID = new Map(QUALIFICATIONS.map((q) => [q.id, q]));

export const VISA_STATUSES = ["citizen", "residence_visa", "employment_visa_transferable", "employment_visa", "visit_visa", "golden_visa", "dependent_visa", "work_permit", "needs_sponsorship", "right_to_work"] as const;
export const DRIVING_LICENCES = ["lk_light", "lk_heavy", "gcc_light", "gcc_heavy", "uk_full", "in_light", "other"] as const;
