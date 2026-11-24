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
};
export type LiveAnswer = { ok: true; total: number; rows: LivePerson[]; read: string | null; chips: string[]; refining: boolean; problem: string | null };

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
  if (/\b(AND|OR|NOT)\b|"[^"]+"/.test(t)) return { kind: "search", mode: "boolean", q: t };
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

/** Past searches as chats: a search continued later (its words start the same) shows once. */
export function pastChats(rows: { id: string; query: string; at: number }[]): { id: string; query: string; at: number }[] {
  const out: { id: string; query: string; at: number }[] = [];
  for (const r of rows) if (!out.some((o) => o.query.startsWith(r.query))) out.push(r);
  return out;
}
