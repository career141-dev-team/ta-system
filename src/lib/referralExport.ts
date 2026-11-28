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

/** The ticked ids grouped by the search that showed them, bounded: at most 10
 *  searches and REFERRAL_EXPORT_MAX people in all. Pure, so it is tested. */
export function picksBySearch(form: FormData): { q: string; x: string[]; ids: Set<string> }[] {
  let raw: { id?: unknown; q?: unknown; x?: unknown }[] = [];
  try {
    const v = JSON.parse(String(form.get("picks") ?? "[]"));
    if (Array.isArray(v)) raw = v;
  } catch {
    // A broken list counts as nothing ticked.
  }
  if (!raw.length && form.get("q")) raw = form.getAll("id").map((id) => ({ id, q: form.get("q"), x: form.getAll("x") }));
  const out = new Map<string, { q: string; x: string[]; ids: Set<string> }>();
  let n = 0;
  for (const p of raw) {
    const q = String(p.q ?? "").trim().slice(0, 500);
    const x = (Array.isArray(p.x) ? p.x : []).map(String).slice(0, 30);
    if (!q || !p.id || n >= REFERRAL_EXPORT_MAX) continue;
    const key = JSON.stringify([q, x]);
    if (!out.has(key)) {
      if (out.size >= 10) continue;
      out.set(key, { q, x, ids: new Set() });
    }
    out.get(key)!.ids.add(String(p.id));
    n++;
  }
  return [...out.values()];
}
