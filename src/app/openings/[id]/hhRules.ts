// Headhunting on real data (D8b, 20 Nov 2026; ta-system #37) - the pure half:
// what /api/ui/hh sends, and how the Research screen's eight answers map to the
// old report's fields. No imports, so `node hhRules.check.ts` can run it.

export type HhBenchmark = {
  id: string; name: string | null; title: string; company: string; url: string | null; kind: string;
  confidence: "high" | "medium" | "low"; note: string; sourceUrl: string | null; sourceTitle: string | null; picked: boolean;
};
export type HhSuggestion = {
  id: string; name: string; headline: string; company: string | null; location: string | null; url: string | null;
  tier: "priority" | "screen"; round: number; learnedFrom: number | null; why: string; concern: string | null;
  status: "new" | "kept" | "dismissed"; at: number; takenBy: string | null;
};
export type HhData = {
  overview: { links: number; approached: number; notApproached: number; reached: number; eye: number; eyeReached: number; benchmarkPicked: number };
  research: {
    client: { name: string; industry: string | null; notes: string } | null;
    report: {
      fields: Record<string, string | string[]>; edited: string[]; rivals: unknown[];
      sources: { url: string; title: string; quote: string }[]; generatedAt: number; model: string; searches: number;
    } | null;
    benchmarks: HhBenchmark[];
    benchmarksByDefault: boolean;
    seniority: string;
    reviewHere: boolean;
  };
  suggestions: {
    rows: HhSuggestion[]; round: number; maxRounds: number; steered: number; picked: string[];
    needsEmptyReason: boolean; chat: { id: string; role: "user" | "assistant"; body: string; at: number }[];
  };
};

/** The screen's answer -> the old report's field (lists are chips or semicolon lines). */
export const FIELD_OF = {
  titles: "similarDesignation", rivals: "competitors", website: "websiteLink", country: "country",
  location: "location", social: "socialMedia", services: "servicesProvider", overview: "companyOverview",
} as const;
export type AnswerKey = keyof typeof FIELD_OF;

/** The old fields as the screen's text: chips are comma lists, other lists one per "; ". */
export function answersOf(fields: Record<string, string | string[]>, chips: readonly string[]): Record<AnswerKey, string> {
  const out = {} as Record<AnswerKey, string>;
  for (const [k, f] of Object.entries(FIELD_OF) as [AnswerKey, string][]) {
    const v = fields[f] ?? "";
    out[k] = Array.isArray(v) ? v.join(chips.includes(k) ? ", " : "; ") : v;
  }
  return out;
}

/** One answer back as the old edit form sends it: a list field splits on ";" or new lines. */
export function editOf(k: AnswerKey, text: string): { field: string; value: string } {
  // Competitors are chips typed with commas; the old form splits on ";".
  return { field: FIELD_OF[k], value: k === "rivals" ? text.split(",").map((x) => x.trim()).filter(Boolean).join("; ") : text };
}

/** The old fields a person corrected by hand, as the screen's keys. */
export const editedOf = (edited: string[]) =>
  (Object.entries(FIELD_OF) as [AnswerKey, string][]).filter(([, f]) => edited.includes(f)).map(([k]) => k);

/** "12 Nov", or "today". */
export function ranOn(at: number, now = Date.now()): string {
  const d = new Date(at);
  if (d.toDateString() === new Date(now).toDateString()) return "today";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
