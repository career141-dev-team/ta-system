// A new opening on real data (D9, 20 Nov 2026; ta-system #39) - the pure half.
// The New opening sheet reads a brief into its own words (data.ts Read); the old
// TA System's form wants a client id, the TAs' ids, its own nationality and gender
// words and work locations with ids. This turns one into the other. No imports:
// `node createRules.check.ts`.

export type Person = { id: string; name: string };
export type Brief = {
  role: string; client: string; locations: { city: string; people: number }[]; team: string[];
  musts: string; hiringFor: string; gender: string; autoFollowUp: boolean;
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The client by its name; null = a new client (added first, if the person may). */
export const clientOf = (name: string, clients: Person[]) => clients.find((c) => same(c.name, name)) ?? null;

/** A team chip ("Hasini" or "Hasini Fernando") to the TA it names; unknown names are left out. */
export function teamIds(team: string[], tas: Person[]): string[] {
  const ids = team.map((t) => (tas.find((p) => same(p.name, t)) ?? tas.find((p) => same(p.name.split(/\s+/)[0], t)))?.id);
  return [...new Set(ids.filter((x): x is string => !!x))];
}

/** The old form's fields for createOpeningInline. */
export function createFields(r: Brief, brief: string, clientId: string, tas: Person[]) {
  // The old form asks the nationality; "local" is its own word for a local hire.
  // An expat hire needs the country of the passport, which the brief does not give:
  // it is said in the notes, and set on the opening in AURA.
  const notes = [brief.trim(), r.musts.trim() && `Must have: ${r.musts.trim()}`, r.hiringFor === "Expat" && "Hiring an expat - set the nationality."]
    .filter(Boolean).join("\n\n");
  return {
    clientId,
    title: r.role.trim(),
    notes: notes.slice(0, 20000),
    country: "Sri Lanka",
    hiringFor: "local",
    targetGender: r.gender === "Female" || r.gender === "Male" ? r.gender : "",
    ...(r.autoFollowUp ? { autoFollowUp: "on" } : {}),
    ...(r.locations.length
      ? { workLocations: JSON.stringify(r.locations.map((l, i) => ({ id: `loc-${i + 1}`, name: l.city.trim(), vacancies: l.people }))) }
      : {}),
    assignedTaIds: teamIds(r.team, tas),
  };
}
