// convex/ui/eodDraftRules.ts
//
// Draft my EOD (AI-FLOWS 4, owner 23 Nov 2026): the pure half. AURA writes one or two
// short NOTES lines per candidate in the Midday / End of day email, from that person's
// own CV and record only. It never saves: the email screen shows them, the TA keeps,
// edits or deletes them, and the send saves them as it saves any note today.
// No database, no network: tests/uieoddraft.test.ts holds every rule.

export type DraftPerson = { id: string; name: string; title: string; employer: string; years: number | null; skills: string[]; cvText: string };
export type Drafted = Record<string, string[]>;

export const EOD_SYSTEM = `You help a recruiter write the NOTES column of a shortlist email to a Director. You get the job and, for each candidate, their record and CV text.
For each candidate write at most 2 short lines (under 90 characters each) a Director would want: relevant experience, key skills or achievements FOR THIS JOB, from the CV only.
Do not repeat salary, notice period, age, the current company or total years - other columns hold them. Never invent a fact, a number, a name or a date; if the CV says little, write fewer lines or none.
Answer JSON only: {"notes":{"<candidate id>":["line","line"]}}.`;

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** Lines about what other columns already show (salary, notice, age). */
const OTHER_COLUMN = /\b(salary|lkr|rs\.?|remuneration|notice|aged?|years old)\b/i;

export function eodTurn(job: { title: string; client: string }, people: DraftPerson[]): string {
  return [
    `JOB: ${clip(job.title, 200)}${job.client ? ` at ${clip(job.client, 120)}` : ""}`,
    ...people.map((p) =>
      [
        `CANDIDATE id=${p.id}: ${clip(p.name, 120)}`,
        `Record: ${[clip(p.title, 120), clip(p.employer, 120), p.years !== null ? `${p.years} years` : ""].filter(Boolean).join(" · ") || "(nothing on record)"}`,
        p.skills.length ? `Skills: ${p.skills.slice(0, 20).map((s) => clip(s, 60)).join(", ")}` : "",
        `CV:\n${p.cvText.slice(0, 4000) || "(no CV text)"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n\n");
}

/** The model's answer, checked: only the candidates asked about, at most 2 lines each,
 *  each under 100 characters, none about another column, no repeats. */
export function cleanDraft(raw: unknown, ids: string[]): Drafted | null {
  if (!raw || typeof raw !== "object") return null;
  const notes = (raw as Record<string, unknown>).notes;
  if (!notes || typeof notes !== "object") return null;
  const out: Drafted = {};
  for (const id of ids) {
    const lines = (notes as Record<string, unknown>)[id];
    if (!Array.isArray(lines)) continue;
    const keep = [...new Set(lines.map((l) => clip(l, 100).replace(/^[>•\-\s]+/, "")))].filter((l) => l.length > 2 && !OTHER_COLUMN.test(l)).slice(0, 2);
    if (keep.length) out[id] = keep;
  }
  return out;
}
