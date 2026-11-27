/**
 * The new UI's Database chat (Part 3 of Ask AURA, 20 Nov): what the browser may
 * send and what one candidate looks like in the chat's answer. Pure, so the
 * route's rules are tested without a server (tests/uidatabase.test.ts).
 */
import type { Candidate } from "@/data/types";

/** The chat sends its messages one per line, as the old search's `q` carries them. */
export const MAX_TURNS = 12;
export const MAX_CHARS = 2000;
/** People sent back per answer; the chat shows four and "see all". */
export const ROWS = 60;

export type SearchBody = { q: string; mode: "natural" | "boolean"; full: boolean; currentIds?: string[] };

export function readSearchBody(body: unknown): { ok: true; body: SearchBody } | { ok: false; message: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.q !== "string") return { ok: false, message: "Say who you are looking for." };
  const turns = b.q.split(/\n+/).map((t) => t.trim()).filter(Boolean);
  const q = turns.slice(-MAX_TURNS).join("\n");
  if (!q) return { ok: false, message: "Say who you are looking for." };
  if (q.length > MAX_CHARS) return { ok: false, message: "That search is too long. Start a new chat." };
  if (b.mode !== undefined && b.mode !== "natural" && b.mode !== "boolean") return { ok: false, message: "Unknown search mode." };
  const currentIds = Array.isArray(b.currentIds)
    ? b.currentIds.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).slice(0, 40)
    : [];
  const parsed: SearchBody = { q, mode: b.mode === "boolean" ? "boolean" : "natural", full: b.full === true };
  if (currentIds.length) parsed.currentIds = currentIds;
  return { ok: true, body: parsed };
}

export type UiPerson = {
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

const noticeOf = (c: Candidate) =>
  c.noticePeriod?.trim() || (c.noticePeriodDays == null ? null : c.noticePeriodDays === 0 ? "Immediate" : `${c.noticePeriodDays} days`);

export function personOf(c: Candidate, score: number | null, why: string): UiPerson {
  return {
    id: c.id,
    name: c.fullName,
    title: c.currentTitle ?? "",
    company: c.currentEmployer ?? "",
    city: c.location ?? "",
    years: c.totalExperienceYears,
    notice: noticeOf(c),
    score: score == null ? null : Math.round(score),
    why,
    hasCv: !!c.cvFileName && !c.cvFileMissing,
  };
}
