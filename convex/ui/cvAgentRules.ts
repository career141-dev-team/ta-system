// convex/ui/cvAgentRules.ts
//
// AURA on a CV (D11 item 4, owner 20 Nov 2026): the pure half - what Claude Haiku is
// told and what of its answer reaches the CV popup. No database, no network, so
// tests/uicvbox.test.ts holds every rule.
//
// The popup's own word rules move, size, add and remove the green box first, at no
// cost. Haiku gets only what they cannot read: a change to what the box says in the
// TA's own words ("put that he speaks Tamil in the notes", "salary is 450k now"), or a
// question about the CV, answered from the CV's text alone. It never saves: the popup
// shows the change and saves it through /api/ui/cv-box, the old save and its rules.

export type BoxText = {
  designation: string;
  company: string;
  currentSalary: string;
  expectedSalary: string;
  notice: string;
  notes: string[];
};
export type CvAnswer = { kind: "box"; content: BoxText; reply: string } | { kind: "answer"; say: string };

export const CV_SYSTEM = `You help a recruiter with ONE candidate's CV. You get the CV's text and the green box: the CAREER141 box printed on the CV for the client, with "designation", "company", "currentSalary", "expectedSalary", "notice" and "notes" (a list of short lines).
If the recruiter asks to change what the box says, answer {"kind":"box","content":{all six fields},"reply":"one short sentence saying what changed"} - change only what they asked, keep the rest exactly, and use their words for the values.
Otherwise answer their question from the CV text only: {"kind":"answer","say":"a short plain answer"}. If the CV does not say, say so. Never invent a fact, a number or a date.
Answer JSON only.`;

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

export function cvTurn(o: { said: string; box: BoxText | null; cvText: string }): string {
  return [
    `GREEN BOX: ${o.box ? JSON.stringify(o.box) : "(not on the CV yet - a change adds it)"}`,
    `CV TEXT:\n${o.cvText.slice(0, 12000) || "(the CV's text could not be read)"}`,
    `RECRUITER: ${clip(o.said, 500)}`,
  ].join("\n\n");
}

/** The model's answer, checked: one of the two shapes, every field a short string,
 *  at most 12 notes. A box answer missing a field keeps the box's own value. */
export function cleanCvAnswer(raw: unknown, box: BoxText | null): CvAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === "answer") {
    const say = clip(r.say, 800);
    return say ? { kind: "answer", say } : null;
  }
  if (r.kind !== "box" || !r.content || typeof r.content !== "object") return null;
  const c = r.content as Record<string, unknown>;
  const was = box ?? { designation: "", company: "", currentSalary: "", expectedSalary: "", notice: "", notes: [] };
  const field = (k: keyof Omit<BoxText, "notes">, n: number) => (typeof c[k] === "string" ? clip(c[k], n) : was[k]);
  const notes = Array.isArray(c.notes) ? c.notes.map((x) => clip(x, 200)).filter(Boolean).slice(0, 12) : was.notes;
  const content: BoxText = {
    designation: field("designation", 120),
    company: field("company", 120),
    currentSalary: field("currentSalary", 80),
    expectedSalary: field("expectedSalary", 80),
    notice: field("notice", 80),
    notes,
  };
  return { kind: "box", content, reply: clip(r.reply, 300) || "Changed the green box." };
}
