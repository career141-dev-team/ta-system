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
 * The answer cut to one sentence, with the hand-over line once at the end
 * (owner, 4 Nov: never five or six lines; 13 Nov: "very crisp and smaller").
 */
export function withHandover(answer: string | null | undefined): string {
  const a = String(answer ?? "")
    .replace(/\s*one of our team members will reach out to you shortly\.?/gi, "")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .slice(0, 1)
    .join(" ");
  return a ? `${a} ${HANDOVER_LINE}` : `Thank you for asking. ${HANDOVER_LINE}`;
}

/*
 * Short WhatsApp replies (owner, 13 Nov: "very crisp and smaller, no need
 * multiple lines"). A candidate was told "Your profile is now 100% complete
 * and has been advanced to the next stage" after answering the opening's own
 * question, and read it as selected; another got "We are still waiting on
 * your Are you available to commence on Friday, 13th November 2026? to
 * progress your application" - a question glued into a sentence built for
 * "CV" and "salary".
 */

/** One line: no line breaks, at most two sentences. */
export function oneLine(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(" ");
}

/** All details in: thanks, and a person reviews it. Never "complete", "advanced" or "selected". */
export const doneReply = (firstName: string) =>
  `Thank you, ${firstName}! We have your details, and our team will review them and contact you.`;

/** One missing item as a question: an opening's question as itself, a field by name. */
export function askFor(item: string): string {
  const t = item.trim();
  if (/\?\s*$/.test(t)) return t;
  return `Could you share your ${/^CV( Document)?$/i.test(t) ? "CV" : t.toLowerCase()}?`;
}

/** The next ONE thing to ask, after a reply. */
export function nextAsk(remaining: string[], firstName: string): string | null {
  const first = (remaining[0] ?? "").trim();
  return first ? `Thanks, ${firstName}! ${askFor(first)}` : null;
}

/** The reminder: one line, one thing. */
export const reminderAsk = (remaining: string[], firstName: string, jobTitle: string) =>
  `Hi ${firstName}, a quick reminder about *${jobTitle}*: ${remaining.length ? askFor(remaining[0]) : "any updates to your CV?"}`;

/**
 * Expected salary above the opening's top figure: a person calls, nobody
 * bargains by message (a candidate asked 7.5 against the client's 7, 4 Nov).
 * Both must look like real amounts, so "7.5" read against 700000 never fires.
 */
export const aboveBudget = (expected: unknown, salaryMax: unknown) =>
  typeof expected === "number" && typeof salaryMax === "number" &&
  expected >= 1000 && salaryMax >= 1000 && expected > salaryMax;
