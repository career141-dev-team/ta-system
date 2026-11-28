// The Database chat on real candidates (Ask AURA part 3, 20 Nov 2026; ta-system #42).
// Signed in, a search goes to the old server's /api/ui/database, which runs old
// AURA's own Database search (the engine and the desk rules), so the chat finds the
// same people as old AURA. The pure half (what a message means, how one person is
// shown) is checked by live.check.ts; the fetch is at the bottom.

import type { Chip, Person } from "./aura";

export type LivePerson = {
  id: string;
  name: string;
  title: string;
  company: string;
  city: string;
  years: number | null;
  notice: string | null;
  score: number | null;
  why: string;
  hasCv: boolean;
  career?: { period: string; title: string; company: string }[];
  /** The search could not confirm everything asked for this person. */
  unsure?: boolean;
};
export type LiveAnswer = { ok: true; total: number; rows: LivePerson[]; read: string | null; reply?: string | null; trail?: string[]; chips: string[]; refining: boolean; problem: string | null };

/** What a live message asks for. */
export type LiveAsk =
  | { kind: "search"; mode: "natural" | "boolean"; q: string }
  | { kind: "names"; names: string[] }
  | { kind: "like"; name: string }
  | { kind: "add"; who: string; job: string }
  | { kind: "download"; who: string }
  | { kind: "takeOut" }
  | { kind: "remove" }
  | { kind: "startOver" };

const nameLike = (s: string) => /^[A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,3}$/.test(s);

/**
 * One message, read against the search it continues (`prior`: the messages the last
 * answer ran, one per line). Plain words add to the search, as old AURA's chat does.
 */
export function readLive(raw: string, prior: string): LiveAsk {
  const t = raw.trim();
  if (/^start over$/i.test(t)) return { kind: "startOver" };
  const sl = t.match(/^shortlist\s+(.+?)\s+for\s+(.+)$/i) ?? t.match(/^add\s+(.+?)\s+to\s+(.+)$/i);
  if (sl) return { kind: "add", who: sl[1], job: sl[2].replace(/^(?:the|a)\s+/i, "") };
  if (/^take\s+.+\s+out of\s+/i.test(t)) return { kind: "takeOut" };
  if (/^(?:remove|drop|without|no longer)\s+/i.test(t) && prior) return { kind: "remove" };
  if (/download/i.test(t)) return { kind: "download", who: t };
  const like = t.match(/(?:people|someone|others|more)\s+like\s+(.+?)[.?]?$|similar to\s+(.+?)[.?]?$/i);
  if (like) return { kind: "like", name: (like[1] ?? like[2]).trim() };
  const lines = t
    .split(/\n|,|;|\band\b/)
    .map((s) => s.replace(/\b(?:do we have|referral:?|is|are)\b|in (?:our|the) database|\?|"|“|”/gi, "").trim())
    .filter(Boolean);
  if (/do we have|referral|in (?:our|the) database/i.test(t) || (lines.length >= 2 && lines.every(nameLike))) {
    const names = lines.filter(nameLike);
    if (names.length) return { kind: "names", names };
  }
  // A formula only when it reads like one (26 Nov 2026): "Should be ACA or CIMA OR ACCA." in a pasted
  // brief was run as Boolean, every word ("we", "for", "a") a must, and the people were nonsense.
  // A sentence (a full stop, or a long text) is plain words unless it holds a bracketed formula.
  const ops = /\b(AND|OR|NOT)\b|"[^"]+"/.test(t);
  const sentence = /[.!?](\s|$)/.test(t) || t.split(/\s+/).length > 20;
  if (ops && (!sentence || /\([^)]*\b(AND|OR|NOT)\b[^)]*\)/.test(t))) return { kind: "search", mode: "boolean", q: t };
  return { kind: "search", mode: "natural", q: prior ? `${prior}\n${t}` : t };
}

/** Notice in months, as the chat's cards and filters count it (99 = not known). */
export function noticeMonths(text: string | null): number {
  if (!text) return 99;
  if (/immediate|now/i.test(text)) return 0;
  const n = Number(text.match(/\d+/)?.[0]);
  if (!n) return 99;
  if (/month/i.test(text)) return n;
  if (/week/i.test(text)) return Math.round(n / 4);
  return Math.round(n / 30);
}

/** One real person as a chat card. `cv` is filled by the caller (the CV address needs the server). */
export function personOf(p: LivePerson, cv?: string): Person {
  return {
    id: p.id,
    name: p.name,
    title: p.title,
    company: p.company,
    city: p.city,
    years: p.years ?? 0,
    notice: noticeMonths(p.notice),
    tags: [],
    score: p.score ?? 0,
    why: [p.why, p.years != null ? `${p.years} yrs` : "", p.notice ? `notice ${p.notice}` : ""].filter(Boolean).join(" · "),
    ...(cv ? { cv } : {}),
    ...(p.career?.length ? { career: p.career } : {}),
    ...(p.unsure ? { unsure: true } : {}),
  };
}

/** The engine's chips, shown as they were read (not removable: the search is the words). */
export const chipsOf = (labels: string[]): Chip[] => labels.map((label) => ({ label, added: false, test: "live" }));

/** "them / the top 3 / Kasun": who on screen a message means. */
export function whoIn(text: string, last: Person[]): Person[] {
  const low = text.toLowerCase();
  const named = last.filter((p) => low.includes(p.name.toLowerCase()) || low.includes(`${p.name.split(" ")[0].toLowerCase()} `));
  if (named.length) return named;
  const n = Number(low.match(/top\s+(\d+)/)?.[1] ?? 0);
  return n ? last.slice(0, n) : last.slice(0, 10);
}

/** The position a phrase names, by a word of its title or client. */
export function jobIn<J extends { id: string; title: string; client: string }>(phrase: string, jobs: J[]): J | null {
  const said = new Set(phrase.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3));
  const hits = jobs.filter((j) => `${j.title} ${j.client}`.toLowerCase().split(/[^a-z0-9]+/).some((w) => said.has(w)));
  return hits.length === 1 ? hits[0] : null;
}

/** Past searches as chats: independent chatIds stay separate; legacy prefix-continued searches show once. */
export function pastChats<T extends { id: string; query: string; at: number; chatId?: string | null }>(rows: T[]): T[] {
  const out: T[] = [];
  const seenChat = new Set<string>();
  for (const r of rows) {
    if (r.chatId) {
      if (seenChat.has(r.chatId)) continue;
      seenChat.add(r.chatId);
      out.push(r);
      continue;
    }
    if (!out.some((o) => !o.chatId && o.query.startsWith(r.query))) out.push(r);
  }
  return out;
}

/** Safe parse of saved conversation turns from Convex searchHistory.turnsJson. */
export function parseSavedTurns<T>(raw?: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** Serialize conversation turns within Convex document limits (~200 KB cap). */
export function serializeTurns(turns: unknown[], maxBytes = 200_000): string {
  const json = JSON.stringify(turns);
  if (json.length <= maxBytes) return json;
  // Keep the most recent turns if a very long chat exceeds the cap.
  for (let keep = turns.length - 1; keep >= 2; keep--) {
    const trimmed = JSON.stringify(turns.slice(-keep));
    if (trimmed.length <= maxBytes) return trimmed;
  }
  return JSON.stringify(turns.slice(-2));
}
