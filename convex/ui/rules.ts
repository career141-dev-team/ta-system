import type { ShortlistRow } from "../../src/lib/eod-format";
import { colomboDaysBetween } from "../../src/lib/calendar";
// convex/ui/rules.ts
//
// The plain rules of the new UI's door (convex/ui), kept free of Convex so a
// test can run them (tests/uidoor.test.ts). Nothing here reads the database.
//
// Why the door exists (18 Nov): the old app reads Convex through its own
// Next.js server, which copies the desk into memory (src/data/prime.ts) and
// saves with a call that freezes the whole server while it waits
// (src/data/convex/syncCall.ts). That layer, not Convex, is what made a stage
// move take seconds and end in "did it move or not?". The new UI
// (career141-dev/ta-system-ui) calls these functions straight from the
// browser instead, signed in with the same Clerk accounts.

/** The board's columns, in the order the work moves (the new UI's STAGES). */
export const BOARD_STAGES = [
  "ta_follow_up",
  "ai_follow_up",
  "director_review",
  "director_shortlist",
  "client_shortlist",
  "interview",
  "offer",
  "placed",
  "rejected",
  "dropped_out",
] as const;
export type BoardStage = (typeof BOARD_STAGES)[number];

/** The backend stages behind each column (convex/ta/stages.ts TO_TA, read backwards). */
export const BACKEND_STAGES: Record<BoardStage, string[]> = {
  ta_follow_up: ["follow_up"],
  ai_follow_up: ["ta_shortlist", "ai_call"],
  director_review: ["second_shortlist"],
  director_shortlist: ["director_shortlist"],
  client_shortlist: ["client_review"],
  interview: ["interview"],
  offer: ["offer"],
  placed: ["placed"],
  rejected: ["rejected"],
  dropped_out: ["unresponsive"],
};

/** Cards sent per column. More are read by asking for that column again with a bigger limit. */
export const CARDS_PER_STAGE = 25;
export const CARDS_PER_STAGE_MAX = 200;
/** A column's count stops here; the board shows "500+". */
export const COUNT_CAP = 500;

export function cardLimit(asked: number | undefined): number {
  if (!asked || !Number.isFinite(asked)) return CARDS_PER_STAGE;
  return Math.max(1, Math.min(Math.floor(asked), CARDS_PER_STAGE_MAX));
}

/** What a move needs from the person before it is saved, refused in words. */
export function moveRefusal(stage: string, reason: string | undefined): string | null {
  if (!(BOARD_STAGES as readonly string[]).includes(stage)) return "That stage does not exist. Reload the page.";
  if (stage === "ai_follow_up") return "Nobody is moved into AI Follow-Up by hand. The assistant takes candidates there itself.";
  const said = (reason ?? "").trim();
  if (stage === "rejected" && !said) return "Say why they were rejected.";
  if (stage === "dropped_out" && !said) return "Say why they dropped out.";
  return null;
}

/**
 * A backend error as one sentence a TA can act on. The rules throw plain
 * English already (guard.ts, workdayScope.ts); this only strips Convex's
 * wrapping ("Uncaught Error: ... at handler") and never shows a stack.
 */
export function inWords(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const line = raw
    .replace(/^\[CONVEX [^\]]*\]\s*/, "")
    .replace(/^(Uncaught\s+)?(Error|ConvexError):\s*/i, "")
    .replace(/^\[Request ID: [^\]]*\]\s*Server Error\s*/i, "")
    .split("\n")[0]
    .replace(/\s+at\s+\S+.*$/, "")
    .trim();
  return line || fallback;
}

/** The identity claims the door matches a person on. */
export interface Identity {
  tokenIdentifier: string;
  subject: string;
  email?: string;
  emailVerified?: boolean;
}

/** Lower-cased, trimmed email, or null when it must not be trusted. */
export function matchableEmail(identity: Identity): string | null {
  // Clerk only puts verified addresses in the token; an explicit false is
  // still refused, so an unverified address can never become somebody's desk.
  if (identity.emailVerified === false) return null;
  const email = identity.email?.trim().toLowerCase();
  return email ? email : null;
}

export interface CandidateLike {
  fullName?: string;
  currentJobTitle?: string;
  currentEmployer?: string;
  location?: string;
  totalExperienceYears?: number;
  noticePeriodDays?: number;
  phone?: string;
  email?: string;
}

/** One card on the board: only what the card draws, never the CV text or a score paragraph. */
export function toCard(
  app: { id: string; stage: string; ownerTaId: string | null; isAddOn: boolean; backupForApplicationId: string | null; sourcingChannel: string | null; setNumber: number | null; lastStageChangedAt?: number },
  candidate: CandidateLike | null,
  missing: string[],
  me: string,
  ownerName: string | null,
) {
  return {
    id: app.id,
    stage: app.stage,
    name: candidate?.fullName?.trim() || "Name not on record",
    title: candidate?.currentJobTitle ?? null,
    company: candidate?.currentEmployer ?? null,
    location: candidate?.location ?? null,
    years: candidate?.totalExperienceYears ?? null,
    noticeDays: candidate?.noticePeriodDays ?? null,
    phone: candidate?.phone ?? null,
    email: candidate?.email ?? null,
    channel: app.sourcingChannel,
    setNumber: app.setNumber,
    addOn: app.isAddOn,
    backup: app.backupForApplicationId !== null,
    owned: app.ownerTaId !== null,
    mine: app.ownerTaId === me,
    /** First name of the TA who claimed them first (the collision lock), when it is not you. */
    lockedBy: app.ownerTaId && app.ownerTaId !== me ? (ownerName?.split(/\s+/)[0] ?? "another recruiter") : null,
    /** Still needed before Director Review ("a CV", "expected salary", ...). */
    missing,
    movedAt: app.lastStageChangedAt ?? null,
  };
}

/** The scoop upload's file rules (src/app/api/scoops/upload/route.ts): a PDF or Word file, 10 MB at most. */
export const SCOOP_MAX_BYTES = 10 * 1024 * 1024;
const SCOOP_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
export function scoopFileRefusal(name: string, size: number, type: string): string | null {
  if (size === 0) return "Choose a CV file first.";
  if (size > SCOOP_MAX_BYTES) return `${name} is over 10 MB. Save a smaller PDF and try again.`;
  if (!SCOOP_TYPES.has(type) && !/\.(pdf|docx?)$/i.test(name)) return `${name} is not a PDF or a Word document.`;
  return null;
}

// ── Rules moved out of the old app (PR 1b, 18 Nov) ──────────────────────────
// Each one is the old Next.js action's rule, word for word where it refused.

/**
 * The opening's follow-up questions from a list typed in the Automations panel
 * (src/app/actions.ts setOpeningQuestions + addOpeningQuestion): blank lines
 * dropped, a question keeps its id while its wording is unchanged so answers
 * stay attached, 200 characters each (it goes out on WhatsApp), no repeats,
 * 12 at most (store.ts).
 */
export function normalizeQuestions(
  existing: { id: string; label: string }[],
  labels: string[],
  newId: () => string,
): { ok: true; questions: { id: string; label: string }[] } | { ok: false; message: string } {
  const out: { id: string; label: string }[] = [];
  for (const raw of labels) {
    const label = raw.trim().replace(/\s+/g, " ");
    if (!label) continue;
    if (label.length > 200) return { ok: false, message: "Keep each question under 200 characters — it goes out on WhatsApp." };
    if (out.some((q) => q.label.toLowerCase() === label.toLowerCase())) return { ok: false, message: `"${label}" is asked twice.` };
    out.push({ id: existing.find((q) => q.label === label)?.id ?? newId(), label });
  }
  if (out.length > 12) return { ok: false, message: "An opening can ask 12 questions at most." };
  return { ok: true, questions: out };
}

/** A strategy row as the submit rule reads it. */
export interface StrategyRowLike {
  id: string;
  name: string;
  notApplicable: boolean;
  onIt: boolean;
  ticked: boolean;
}

/**
 * Which rows a TA's submit takes in (src/lib/openings/strategyWrites.ts
 * submitStrategies): only rows on this opening, not struck through, that they
 * are on or that are ticked; a typed date must be a date; a note under 500
 * characters; a row they are not on and left empty is skipped.
 */
export function strategyRowsToSubmit(
  rows: Map<string, StrategyRowLike>,
  input: { rowId: string; used: boolean; date: string; note: string }[],
  dayOf: (typed: string) => number | null,
  today: number,
): { ok: true; rows: { rowId: string; doneAt: number | null; note: string | null }[] } | { ok: false; message: string } {
  if (input.length === 0) return { ok: false, message: "There is nothing to submit." };
  const out: { rowId: string; doneAt: number | null; note: string | null }[] = [];
  for (const item of input) {
    const row = rows.get(item.rowId);
    if (!row || row.notApplicable) continue;
    if (!row.onIt && !row.ticked) continue;
    const typed = item.date.trim();
    const day = dayOf(typed);
    if (item.used && typed && day === null) return { ok: false, message: `That is not a date (${row.name}).` };
    const text = item.note.trim();
    if (text.length > 500) return { ok: false, message: `Keep the note under 500 characters (${row.name}).` };
    if (!row.onIt && !item.used && !text) continue;
    out.push({ rowId: row.id, doneAt: item.used ? day ?? today : null, note: text || null });
  }
  if (out.length === 0) return { ok: false, message: "None of those strategies are yours to update." };
  return { ok: true, rows: out };
}

/**
 * Day N of an opening, counted as the old app counts it (src/data/convex/map.ts):
 * from `assignedAt`, else from when the opening was created. 19 Nov: the door read
 * `assignedAt` alone, which openings from the old system never carry, so every
 * card on new.career141.com said "Day 0".
 */
export function daysOpen(j: { assignedAt?: number; createdAt?: string }, now: number): number {
  const from = j.assignedAt ?? (Date.parse(j.createdAt ?? "") || 0);
  return from ? colomboDaysBetween(from, now) : 0;
}

/** A board column's count from the rows read (each backend stage reads COUNT_CAP + 1): "500+" past the cap. */
export function columnCount(read: number): { count: number; capped: boolean } {
  return { count: Math.min(read, COUNT_CAP), capped: read > COUNT_CAP };
}

/** The Openings page's lists: a stored status in the UI's words. */
export type CardStatus = "active" | "hold" | "placed" | "lost";
const CARD_STATUS: Record<string, CardStatus> = { active: "active", draft: "active", on_hold: "hold", filled: "placed", cancelled: "lost" };

/** One Openings card (convex/ui/openings.ts list). Priority P1-P5, anything else P3 (the intake default). */
export const openingCard = {
  status: (stored: string): CardStatus => CARD_STATUS[stored] ?? "active",
  of(j: { id: string; client: string; title: string; status: string; priorityTier: string | null; days: number; team: string[]; made: number; website: boolean }) {
    const p = Number(/^P([1-5])$/.exec(j.priorityTier ?? "")?.[1] ?? 3);
    return { id: j.id, client: j.client, title: j.title, status: openingCard.status(j.status), priority: p, days: j.days, team: j.team, made: j.made, website: j.website };
  },
};

/** The table-1 cells a TA may change before sending (shortlistRowsFromForm). */
const EDITABLE = ["name", "age", "notice", "notes", "currentCompany", "currentDesignation", "currentRemuneration", "expectedRemuneration"] as const;
type Editable = (typeof EDITABLE)[number];
export type CellEdit = { applicationId: string; field: string; value: string };

/** The TA's edits laid over the rows built from the records; nothing else of a row can change. */
export function withEdits(rows: ShortlistRow[], edits: CellEdit[]): ShortlistRow[] {
  return rows.map((r, i) => {
    const out: ShortlistRow = { ...r, no: i + 1 };
    for (const e of edits) {
      if (e.applicationId !== r.applicationId || !(EDITABLE as readonly string[]).includes(e.field)) continue;
      const value = e.value.slice(0, 2000);
      if (e.field === "notes") {
        const notes = value.split("\n").map((n) => n.trim()).filter(Boolean);
        if (notes.length) out.notes = notes;
      } else if (e.field === "name") {
        if (value.trim()) out.name = value.trim();
      } else out[e.field as Exclude<Editable, "notes" | "name">] = value.trim();
    }
    return out;
  });
}

