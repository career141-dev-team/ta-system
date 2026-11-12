import type { ReferralPerson } from "./referralSearch";
import { buildXlsx } from "./xlsx";

export const REFERRAL_EXPORT_HEADERS = [
  "Name", "Title", "Company", "Phone", "Email", "Relationship", "Named by", "CV on file", "Read from CV",
];

/** Most people one export carries: the search shows at most 60 (SHOW in convex/ta/referenceSearch). */
export const REFERRAL_EXPORT_MAX = 60;

/** One row per referee. `held` is the name of a CV we hold under a similar name, if any. */
export function referralRows(people: ReferralPerson[], held: Map<string, string> = new Map()): string[][] {
  return people.map((p) => [
    p.name,
    p.designation ?? "",
    p.company ?? "",
    p.phone ?? "",
    p.email ?? "",
    p.relationship ?? "",
    p.namedBy.map((c) => c.fullName).join(", "),
    held.get(p.name) ?? "",
    p.at ? new Date(p.at).toISOString().slice(0, 10) : "",
  ]);
}

export function referralWorkbook(people: ReferralPerson[], held?: Map<string, string>): Buffer {
  return buildXlsx({ name: "Referees", headers: REFERRAL_EXPORT_HEADERS, rows: referralRows(people, held) });
}
