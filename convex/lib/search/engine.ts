/**
 * The new engine: slim profiles held in memory, every must applied to
 * everyone (no 400-person pool, R1–R9), everyone who passes scored with a
 * reason, and counts that say exactly what was searched (P2).
 *
 * Unknown values: kept by default for place, years, nationality, salary and
 * notice (flagged and ranked lower, decision 4); left out by default for
 * gender and age (owner decision, 17 Nov), with a tick to include them. Every
 * results page carries both numbers.
 *
 * Gender, age, nationality and religion are never ranking factors: they only
 * filter, and only when the TA asks.
 */
import type { Chip, Profile, Spec } from "./types";
import { within, closeness, PLACE_BY_ID } from "./lists/places";
import { ROLE_BY_ID, rolesNear } from "./lists/roles";
import { QUAL_BY_ID, QUAL_STATUS_RANK } from "./lists/qualifications";
import { EMPLOYERS } from "./lists/companies";
import { toUsdMonthly } from "./lists/money";
import { LEVEL_LABEL } from "./lists/levels";
import { norm, wordRe } from "./vocab";
import { now } from "./today";

export interface Hit { id: string; score: number; stage1: number; ai?: number; reason: string; flags: string[] }
export interface Counts {
  searchable: number;
  /** People who meet every must (unknowns counted per the ticks). */
  fit: number;
  /** Per field: unknown and kept / unknown and left out. */
  unknown: Record<string, { kept: number; leftOut: number }>;
  /** How many each must removed on its own, for empty-result messages (P15). */
  removedBy: Record<string, number>;
  ranked: number;
}
export interface Result { hits: Hit[]; counts: Counts; ms: number }

const STATUS_RANK: Record<string, number> = { ...QUAL_STATUS_RANK, holds: 3 };
const ageOf = (p: Profile) => (p.dob ? (now().getTime() - Date.parse(p.dob)) / (365.25 * 864e5) : null);
const monthsSince = (iso: string) => (now().getTime() - Date.parse(iso)) / (30.44 * 864e5);

const SYNONYMS: Record<string, string[]> = { excel: ["ms excel", "advanced excel", "microsoft excel"], "microsoft office": ["ms office", "office 365"], "ms office": ["microsoft office"], sap: ["sap fico", "sap mm", "sap successfactors"], ifrs: ["slfrs", "ifrs"], "power bi": ["powerbi"], autocad: ["auto cad"] };

type Tri = true | false | null; // null = unknown

/** Does this profile meet this chip? null when the profile has no value for it. */
export function meets(p: Profile, c: Chip): Tri {
  const v = c.values ?? [];
  const inRange = (x: number) => (c.min == null || x >= c.min) && (c.max == null || x <= c.max);
  let r: Tri;
  switch (c.field) {
    case "role": {
      if (c.qualifier === "ever") {
        const all = [...p.roles, ...p.jobs.filter((j) => !j.internship && j.role).map((j) => j.role!)];
        r = all.length ? all.some((x) => v.includes(x)) : null;
      } else r = p.roles.length ? p.roles.some((x) => v.includes(x)) : null;
      break;
    }
    case "level": r = p.level == null ? null : inRange(p.level); break;
    case "place": r = p.place ? v.some((x) => within(p.place, x)) : null; break;
    case "workedIn": {
      const places = [...p.workedCountries.map((x) => `c-${x}`), ...(p.place ? [p.place] : [])];
      r = places.length ? places.some((pl) => v.some((x) => within(pl, x))) : null;
      break;
    }
    case "nationality": r = p.nationality ? v.includes(p.nationality) : null; break;
    case "years": r = p.years == null ? null : inRange(p.years); break;
    case "age": { const a = ageOf(p); r = a == null ? null : inRange(Math.floor(a)); break; }
    case "gender": r = p.gender ? v.includes(p.gender) : null; break;
    case "qualification": {
      const ids = new Set(v.flatMap((x) => [x, ...(QUAL_BY_ID.get(x)?.sameAs ?? [])]));
      const minRank = STATUS_RANK[c.qualifier ?? "part_qualified"] ?? 1;
      r = p.quals.some((q) => ids.has(q.id) && (STATUS_RANK[q.status] ?? 0) >= minRank);
      break;
    }
    case "companyType": r = (c.qualifier === "now" ? p.companyTypesNow : p.companyTypesEver).some((x) => v.includes(x)); break;
    case "company": {
      const names = c.qualifier === "now" ? (p.jobs[0]?.end === "present" ? [p.jobs[0].company] : []) : p.employers;
      r = v.some((want) => {
        const e = EMPLOYERS.find((x) => x.name === want);
        const forms = [want, ...(e?.aliases ?? [])].map(norm).filter((f) => f.length > 1);
        return names.some((n) => forms.some((f) => wordRe(f).test(norm(n))));
      });
      break;
    }
    case "skill": case "keyword": {
      const hay = `${p.text} ${p.skills.map(norm).join(" ; ")}`;
      r = v.some((s) => [norm(s), ...(SYNONYMS[norm(s)] ?? [])].some((f) => wordRe(f).test(hay)));
      break;
    }
    case "cvDate": r = c.max == null || monthsSince(p.cvDate) <= c.max; break;
    case "salary": {
      if (!p.salary) { r = null; break; }
      const wantCur = c.currency ?? "LKR";
      const period = c.label === "year" ? "year" : "month";
      const same = p.salary.currency === wantCur;
      const mine = same ? (p.salary.period === period ? p.salary.amount : period === "month" ? p.salary.amount / 12 : p.salary.amount * 12) : null;
      const usd = (x: number) => toUsdMonthly(x, wantCur, period);
      const theirs = mine ?? (p.salary.usdMonthly != null && usd(1) ? p.salary.usdMonthly / usd(1)! : null);
      r = theirs == null ? null : inRange(theirs);
      break;
    }
    case "notice": r = p.noticeDays == null ? null : inRange(p.noticeDays); break;
    case "language": r = p.languages.length ? v.some((l) => p.languages.some((x) => norm(x) === norm(l))) : null; break;
    case "visa": r = p.visa ? v.includes(p.visa) : null; break;
    case "licence": r = p.licence ? v.includes(p.licence) : null; break;
    default: r = null;
  }
  return r === null ? null : c.not ? !r : r;
}

const keepUnknown = (c: Chip) => c.includeUnknown ?? !["age", "gender", "role", "visa", "licence"].includes(c.field);

function roleScore(p: Profile, want: string[]): { s: number; why: string } {
  if (p.roles.some((r) => want.includes(r))) return { s: p.roles[0] && want.includes(p.roles[0]) ? 1 : 0.9, why: `${ROLE_BY_ID.get(want.find((w) => p.roles.includes(w))!)!.label.split(" /")[0]} now` };
  // A past role counts less the longer ago it ended (S10).
  let best = 0, why = "";
  for (const j of p.jobs) {
    if (j.internship || !j.role || !want.includes(j.role)) continue;
    const endY = j.end === "present" ? now().getUTCFullYear() : Number((j.end ?? j.start ?? "1990").slice(0, 4));
    const ago = now().getUTCFullYear() - endY;
    const s = ago <= 2 ? 0.6 : ago <= 5 ? 0.4 : 0.2;
    if (s > best) { best = s; why = `was ${j.title} until ${endY}`; }
  }
  const near = p.roles.some((r) => want.some((w) => rolesNear(r, w))) ? 0.35 : 0;
  return near > best ? { s: near, why: `${p.title} (related role)` } : { s: best, why: why || p.title || "role unknown" };
}

export interface SearchOpts { limit?: number; recheck?: (top: Profile[], spec: Spec, hits: Hit[]) => Promise<Map<string, { fit: number; reason: string }> | null> }

export class Engine {
  readonly profiles: Profile[];
  /** People by current role, so a role must reads only its own (the plan's "role family first"). */
  private byRole = new Map<string, Profile[]>();
  private noRole: Profile[] = [];
  constructor(all: Profile[]) {
    this.profiles = all.filter((p) => p.searchable);
    for (const p of this.profiles) {
      if (!p.roles.length) this.noRole.push(p);
      for (const r of p.roles) { let l = this.byRole.get(r); if (!l) this.byRole.set(r, (l = [])); l.push(p); }
    }
  }

  /** Who could pass the musts: a current-role must narrows to that role (and people with no role, counted as unknown). */
  private pool(musts: Chip[]): Profile[] {
    const role = musts.find((c) => c.field === "role" && !c.not && c.qualifier !== "ever");
    if (!role) return this.profiles;
    const seen = new Set<Profile>();
    for (const r of role.values ?? []) for (const p of this.byRole.get(r) ?? []) seen.add(p);
    for (const p of this.noRole) seen.add(p);
    return [...seen];
  }

  async search(spec: Spec, opts: SearchOpts = {}): Promise<Result> {
    const t0 = performance.now();
    const limit = opts.limit ?? 50;
    const musts = spec.chips.filter((c) => c.must);
    const prefs = spec.chips.filter((c) => !c.must);
    const counts: Counts = { searchable: this.profiles.length, fit: 0, unknown: {}, removedBy: {}, ranked: 0 };
    const pass: { p: Profile; flags: string[] }[] = [];
    // Cheap and narrow musts first.
    const order: Record<string, number> = { role: 0, gender: 1, nationality: 2, place: 3, years: 4, age: 5, level: 6 };
    musts.sort((a, b) => (order[a.field] ?? 9) - (order[b.field] ?? 9));
    const pool = this.pool(musts);
    const roleMust = musts.find((c) => c.field === "role" && !c.not && c.qualifier !== "ever");
    if (roleMust) counts.removedBy.role = this.profiles.length - pool.length;
    for (const p of pool) {
      const flags: string[] = [];
      let ok = true;
      for (const c of musts) {
        const m = meets(p, c);
        if (m === true) continue;
        if (m === null) {
          const u = (counts.unknown[c.field] ??= { kept: 0, leftOut: 0 });
          if (keepUnknown(c)) { u.kept++; flags.push(`${c.field} unknown`); continue; }
          u.leftOut++;
        } else counts.removedBy[c.field] = (counts.removedBy[c.field] ?? 0) + 1;
        ok = false;
        break;
      }
      if (ok) pass.push({ p, flags });
    }
    counts.fit = pass.length;
    counts.ranked = pass.length;

    // ── Stage 1: the fit score, on everyone who passed ──
    const roleChip = spec.chips.find((c) => c.field === "role" && !c.not);
    const levelChip = spec.chips.find((c) => c.field === "level");
    const yearsChip = spec.chips.find((c) => c.field === "years");
    const placePref = prefs.filter((c) => c.field === "place" && !c.not);
    const band = yearsChip?.qualifier?.match(/^prefer-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/);
    const scored: Hit[] = pass.map(({ p, flags }) => {
      const parts: [number, number][] = []; // [weight, 0..1]
      const why: string[] = [];
      const gaps: string[] = [];
      if (roleChip) {
        const r = roleScore(p, roleChip.values!);
        parts.push([32, r.s]);
        why.push(r.why);
      } else if (p.title) why.push(p.title);
      if (levelChip) {
        const lo = levelChip.min ?? 0, hi = levelChip.max ?? 8;
        const d = p.level == null ? null : p.level < lo ? lo - p.level : p.level > hi ? p.level - hi : 0;
        parts.push([12, d == null ? 0.5 : Math.max(0, 1 - 0.3 * d)]);
        if (d && d > 0) why.push(`level ${LEVEL_LABEL.get(p.level!)?.split(" /")[0]}`);
      }
      if (yearsChip || band) {
        const lo = band ? Number(band[1]) : yearsChip!.min ?? 0;
        const hi = band ? Number(band[2]) : yearsChip!.max ?? 99;
        const y = p.years;
        parts.push([12, y == null ? 0.45 : y < lo ? Math.max(0, 1 - 0.25 * (lo - y)) : y > hi ? Math.max(0.2, 1 - 0.08 * (y - hi)) : 1]);
        why.push(y == null ? "years not stated" : `${y} yrs${p.yearsApprox ? " (approx.)" : ""}${p.yearsSource === "ta" ? " (TA verified)" : ""}`);
      } else if (p.years != null) why.push(`${p.years} yrs`);
      for (const c of placePref) { const s = Math.max(...c.values!.map((x) => closeness(p.place, x))); parts.push([8, p.place ? s : 0.3]); }
      const placeName = p.place ? PLACE_BY_ID.get(p.place)?.name : null;
      why.push(placeName ?? "place not on file");
      // Qualifications, companies and skills asked for, must or preference.
      for (const c of spec.chips.filter((x) => !x.not && ["qualification", "companyType", "company", "skill", "keyword", "language", "workedIn", "visa", "licence", "nationality"].includes(x.field))) {
        const m = meets(p, c);
        const w = c.field === "qualification" ? 10 : c.field === "skill" || c.field === "keyword" ? 7 : 6;
        let s = m === true ? 1 : 0;
        if (c.field === "qualification" && m === true) {
          const held = p.quals.filter((q) => c.values!.includes(q.id) || c.values!.some((v) => QUAL_BY_ID.get(v)?.sameAs?.includes(q.id)));
          const best = Math.max(...held.map((q) => STATUS_RANK[q.status] ?? 0));
          s = 0.7 + 0.1 * best;
          why.push(`${QUAL_BY_ID.get(held[0].id)!.label.split(" (")[0]} ${held.find((q) => STATUS_RANK[q.status] === best)!.status.replace("_", " ")}`.replace(" holds", ""));
        } else if (m !== true) gaps.push(`${(c.values ?? []).join("/")} not mentioned`);
        else if (c.field === "skill" || c.field === "companyType" || c.field === "company") why.push(c.field === "companyType" ? c.values!.join("/").replace("big4", "Big 4") : (c.values ?? []).join("/"));
        parts.push([w, s]);
      }
      // CV freshness: older CVs are flagged and rank lower, never hidden.
      const age = monthsSince(p.cvDate);
      parts.push([5, age < 12 ? 1 : age < 24 ? 0.85 : age < 36 ? 0.7 : age < 60 ? 0.5 : 0.3]);
      if (age >= 36) flags.push(`CV from ${p.cvDate.slice(0, 4)}`);
      // Unknowns on a must the TA kept are flagged and cost a little.
      const total = parts.reduce((s, [w]) => s + w, 0) || 1;
      let score = (parts.reduce((s, [w, x]) => s + w * x, 0) / total) * 100;
      score -= 3 * flags.filter((f) => f.endsWith("unknown")).length;
      const reason = `${why.filter(Boolean).join(", ")}${gaps.length ? ` — ${gaps.join("; ")}` : ""}`;
      return { id: p.id, score: Math.round(score * 10) / 10, stage1: Math.round(score * 10) / 10, reason, flags };
    });
    scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

    // ── Stage 2 (optional): the AI re-checks the top 50; it can reorder, never add anyone ──
    if (opts.recheck && scored.length > 1) {
      const top = scored.slice(0, 50);
      const byId = new Map(this.profiles.map((p) => [p.id, p]));
      const verdicts = await opts.recheck(top.map((h) => byId.get(h.id)!), spec, top);
      if (verdicts) {
        for (const h of top) {
          const v = verdicts.get(h.id);
          if (!v) continue;
          h.ai = v.fit;
          h.score = Math.round((0.6 * h.stage1 + 0.4 * v.fit * 10) * 10) / 10;
          if (v.reason) h.reason = `${h.reason} · AI: ${v.reason}`;
        }
        top.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
        scored.splice(0, top.length, ...top);
      }
    }
    return { hits: scored.slice(0, limit), counts, ms: performance.now() - t0 };
  }
}

/** The honest header line (Phase 6). */
export function header(c: Counts): string {
  const unk = Object.entries(c.unknown).map(([f, u]) => [u.kept ? `${u.kept} with no ${f} on file (kept)` : "", u.leftOut ? `${u.leftOut} with no ${f} on file (left out — tick to include)` : ""].filter(Boolean).join(", ")).filter(Boolean);
  return `${c.fit.toLocaleString()} of ${c.searchable.toLocaleString()} people meet every must · all ${c.ranked.toLocaleString()} ranked${unk.length ? ` · ${unk.join(" · ")}` : ""}`;
}
