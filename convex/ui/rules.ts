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
