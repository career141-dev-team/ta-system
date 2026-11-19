// The pipeline's stages and the rules of a move, as the TA System has them today
// (read from its code 13 Nov 2026: src/lib/pipeline.ts, pipelineWrites.ts,
// RowActions.tsx, closingWrites.ts). The board asks `checkMove` before it lets a
// card land, so the new UI cannot do what the old one refuses. The backend stays
// the judge once this is wired; this is only so the screen never offers a move
// that will be refused, and always says why in plain words.
// Check: node "src/app/openings/[id]/pipelineRules.check.mjs"

export type StageDef = { name: string; dot: string; count: number; closed?: boolean };

// In the order the work moves, with the design's dot colours. Director Review,
// Rejected and Dropped out were not in the design's seven columns; the TA System
// has them and TAs use them every day (FLOW-CHECK 2.1).
export const STAGES: StageDef[] = [
  { name: "TA Follow-Up", dot: "#14b8c4", count: 96 },
  { name: "AI Follow-Up", dot: "#e8b417", count: 96 },
  { name: "Director Review", dot: "#6366f1", count: 12 },
  { name: "Director Shortlist", dot: "#2f80ed", count: 96 },
  { name: "Client Shortlist", dot: "#a43ee0", count: 96 },
  { name: "Interview", dot: "#16a34a", count: 96 },
  { name: "Offer", dot: "#f97316", count: 96 },
  { name: "Placed", dot: "#1d4d3a", count: 96 },
  { name: "Rejected", dot: "#e5342b", count: 40, closed: true },
  { name: "Dropped out", dot: "#8c9090", count: 18, closed: true },
];

const CLOSED = ["Rejected", "Dropped out"];

/** Where a candidate may go next, by hand, from each stage. Every stage may also
 *  go to Rejected or Dropped out (with a reason). Nobody is moved INTO Ai
 *  Follow-Up by hand: the assistant takes candidates there itself. */
const NEXT: Record<string, string[]> = {
  "TA Follow-Up": ["Director Review"],
  "AI Follow-Up": ["TA Follow-Up", "Director Review"],
  "Director Review": ["Director Shortlist", "TA Follow-Up"],
  "Director Shortlist": ["Client Shortlist"],
  "Client Shortlist": ["Interview", "Offer"],
  Interview: ["Offer", "Placed"],
  Offer: ["Placed"],
  Placed: [],
  Rejected: ["TA Follow-Up", "Director Review"],
  "Dropped out": ["TA Follow-Up", "Director Review"],
};

/** What a move needs from the person before it is saved. */
export type Needs = "reason" | "interview" | "offer" | "placement";

export type MoveCard = {
  /** What is still needed before Director Review: "CV", "Salary", "Notice Period". */
  missing: string[];
  /** False while nobody has shortlisted them: Shortlist comes first (it claims the
   *  candidate for the TA and puts them in TA Follow-Up). */
  owned?: boolean;
};

export type Verdict = { ok: true; needs?: Needs } | { ok: false; why: string };

/** TA Lead, admin and Director decide shortlists and may move someone out of Placed. */
export const decides = (role: string) => /lead|admin|director/i.test(role);

const list = (a: string[]) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a.at(-1));

export function checkMove(card: MoveCard, from: string, to: string, role: string): Verdict {
  if (from === to) return { ok: false, why: "Already in " + to + "." };
  if (card.owned === false) return { ok: false, why: "Nobody has shortlisted them yet. Shortlist them first." };
  if (to === "AI Follow-Up") return { ok: false, why: "Nobody is moved into AI Follow-Up by hand. The assistant takes candidates there itself." };
  if (CLOSED.includes(to)) {
    if (CLOSED.includes(from)) return { ok: false, why: `Already ${from.toLowerCase()}. Move them back to TA Follow-Up first.` };
    if (from === "Placed" && !decides(role)) return { ok: false, why: "Only a TA Lead or an admin can move someone out of Placed." };
    return { ok: true, needs: "reason" };
  }
  if (!NEXT[from]?.includes(to)) {
    const next = NEXT[from] ?? [];
    return {
      ok: false,
      why: next.length ? `From ${from} a candidate goes to ${list(next)}, or is rejected.` : `Nobody moves on from ${from}.`,
    };
  }
  if (to === "Director Review" && card.missing.length)
    return { ok: false, why: `Needs ${list(card.missing.map((m) => (m === "CV" ? "a CV" : m.toLowerCase())))} before Director Review.` };
  if (to === "Director Shortlist" && !decides(role)) return { ok: false, why: "Director Shortlist comes from the Director's reply." };
  if (to === "Client Shortlist" && !decides(role)) return { ok: false, why: "Client Shortlist comes from the client's reply." };
  if (to === "Interview") return { ok: true, needs: "interview" };
  if (to === "Offer") return { ok: true, needs: "offer" };
  if (to === "Placed") return { ok: true, needs: "placement" };
  return { ok: true };
}

/** Every stage this card could be sent to from `from`, for the card's menu: the
 *  next stages first, then the two endings. Each with its verdict, so a refused
 *  one is shown greyed with the reason instead of hidden. */
export function movesFrom(card: MoveCard, from: string, role: string) {
  const to = [...(NEXT[from] ?? []), ...CLOSED.filter((c) => c !== from)];
  return to.map((name) => ({ name, verdict: checkMove(card, from, name, role) }));
}

// The reasons the TA System offers (RowActions.tsx). "Other" asks for the words.
export const REJECT_REASONS = [
  "Not enough sector experience",
  "Package expectation above range",
  "Notice period too long",
  "Client passed",
  "Withdrew - counter-offered",
  "Accepted another offer",
  "Other",
];
/** Dropping out at Offer is a declined offer, with its own reasons. */
export const DECLINE_REASONS = [
  "Accepted another offer",
  "Counter-offered by current employer",
  "Package not agreed",
  "Family or relocation",
  "Went quiet",
];
