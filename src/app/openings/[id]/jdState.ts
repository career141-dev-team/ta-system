import { useSyncExternalStore } from "react";

// Whether this opening's job description is approved - one fact every view of the
// opening reads, as in the TA System, where approval is what lets a post go live,
// Snippets be made and matching run (16 Nov 2026: the Job Description view kept its
// own "approved", while LinkedIn Job and Snippets each had a fixed one, so approving
// unlocked nothing).
// ponytail: kept for the visit; with the backend it is a field on the opening.
let approved = false;
const subs = new Set<() => void>();

export const useJdApproved = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => approved,
    () => false,
  );

export function setJdApproved(v: boolean) {
  approved = v;
  subs.forEach((f) => f());
}

// The job description's text, kept for the visit so other views can send it (Database
// search takes the title and the whole JD). ponytail: with the backend it is the opening's JD.
export type Section = { h: string; p?: string; list?: string[] };
export const TITLE0 = "Senior Manager — SAP Business Transformation";
/** Client · place · type · reports to - the quiet line under the title. */
export const META0 = "PGP Glass, Colombo · hybrid, Full-time, Reports to the Group CIO";
export const SECTIONS0: Section[] = [
  {
    h: "About the role",
    p: "PGP Glass is moving its six plants to SAP S/4HANA. You will lead the programme end to end — from blueprint to hyper-care — and make sure the business, not just IT, comes out stronger.",
  },
  {
    h: "Responsibilities",
    list: [
      "Own the S/4HANA roadmap, budget and partner relationships",
      "Lead a team of 12 across finance, supply chain and manufacturing streams",
      "Run cut-over and data migration for six plants",
      "Report progress to the executive committee every month",
    ],
  },
  {
    h: "Requirements",
    list: [
      "10+ years in SAP, with at least one manufacturing rollout led end to end",
      "Strong FI/CO, MM and PP knowledge",
      "Experience managing system integrators",
    ],
  },
  {
    h: "Qualifications",
    list: ["A degree in engineering, IT or accounting", "SAP S/4HANA certification is an advantage", "PMP or PRINCE2 is an advantage"],
  },
  {
    h: "Skills",
    list: [
      "Programme planning, budgeting and vendor management",
      "Clear written and spoken English; Sinhala or Tamil an advantage",
      "Leading cross-functional teams through change",
    ],
  },
  {
    h: "Experience",
    list: [
      "At least 5 years leading SAP programmes or delivery teams",
      "Manufacturing, FMCG or supply chain businesses preferred",
    ],
  },
  { h: "Package", p: "Around LKR 1.2M a month, plus performance bonus and medical cover" },
];
type Jd = { title: string; metaText: string; sections: Section[] };
let jd: Jd = { title: TITLE0, metaText: META0, sections: SECTIONS0 };
export const getJd = () => jd;
export const setJd = (v: Jd) => void (jd = v);
export const jdText = (v: Jd = jd) =>
  [v.title, v.metaText.split(",").map((m) => m.trim()).filter(Boolean).join(" · "), ...v.sections.map((x) => [x.h, x.p, ...(x.list ?? []).filter(Boolean).map((l) => `• ${l}`)].filter(Boolean).join("\n"))].join("\n\n");
