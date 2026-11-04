// convex/lib/jdFacts.ts
//
// What the follow-up assistant may tell a candidate who asks about the role
// (4 Nov). It saw only the first 400 characters of the JD, so "outerwear" or
// "any category except intimates" further down never reached it and it said
// "a consultant will confirm" for things the JD answers. The TA lead's rule on
// the floor: answer from the PRE-REQUISITES first, the main point only, then
// hand over to a person.

/** The line every answered question ends with - the TA lead's own words. */
export const HANDOVER_LINE = "One of our team members will reach out to you shortly.";

const PREREQ_HEADING = /^[ \t#*]*pre[- ]?requisites?\b.*$/im;

/**
 * The JD split for the assistant: its PRE-REQUISITES section (the client's
 * requirements) and the rest (the role and its responsibilities), each capped.
 * A JD with no such heading gives no prerequisites and the whole text as the role.
 */
export function jdForQuestions(jd: string | null | undefined, cap = 1500): { prerequisites: string; role: string } {
  const text = String(jd ?? "").trim();
  const m = PREREQ_HEADING.exec(text);
  if (!m) return { prerequisites: "", role: text.slice(0, cap) };
  return {
    prerequisites: text.slice(m.index + m[0].length).trim().slice(0, cap),
    role: text.slice(0, m.index).trim().slice(0, cap),
  };
}

/**
 * The answer cut to two sentences, with the hand-over line once at the end -
 * two or three lines in all, never five or six (owner, 4 Nov).
 */
export function withHandover(answer: string | null | undefined): string {
  const a = String(answer ?? "")
    .replace(/\s*one of our team members will reach out to you shortly\.?/gi, "")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(" ");
  return a ? `${a} ${HANDOVER_LINE}` : `Thank you for asking. ${HANDOVER_LINE}`;
}

/**
 * Expected salary above the opening's top figure: a person calls, nobody
 * bargains by message (a candidate asked 7.5 against the client's 7, 4 Nov).
 * Both must look like real amounts, so "7.5" read against 700000 never fires.
 */
export const aboveBudget = (expected: unknown, salaryMax: unknown) =>
  typeof expected === "number" && typeof salaryMax === "number" &&
  expected >= 1000 && salaryMax >= 1000 && expected > salaryMax;
