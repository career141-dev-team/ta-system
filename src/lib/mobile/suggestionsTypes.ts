/** Native Suggestions contract. Kept identical across backend and TA_APP. */
export interface SuggestionsPayload {
  apiVersion: 1;
  context: { openingId: string; title: string; clientName: string; userInitials: string };
  run: {
    round: number;
    maxRounds: number;
    roundsLeft: number;
    steered: number;
    canRun: boolean;
    needsEmptyReason: boolean;
  };
  counts: { pending: number; selected: number; dismissed: number };
  benchmark: { count: number; names: string[] };
  suggestions: SuggestionPayload[];
  messages: SuggestionMessagePayload[];
}

export interface SuggestionPayload {
  id: string;
  name: string;
  headline: string;
  company: string | null;
  location: string | null;
  linkedinUrl: string | null;
  tier: "priority" | "screen";
  why: string;
  concern: string | null;
  status: "new" | "kept" | "dismissed";
  round: number;
  generatedAt: number;
  takenByName: string | null;
}

export interface SuggestionMessagePayload {
  id: string;
  role: "user" | "assistant";
  body: string;
  action: "refine" | "search" | "answer" | null;
  affected: number;
  at: number;
}

export interface SuggestionCvHitPayload {
  candidateId: string;
  fullName: string;
  currentTitle: string | null;
  currentEmployer: string | null;
  location: string | null;
  linkedinUrl: string | null;
  email: string | null;
  phone: string | null;
  pastEmployers: string[];
  hasCv: boolean;
  strength: "same" | "possible" | "name";
  score: number;
  reasons: string[];
}

export type SuggestionsWriteBody =
  | { action: "run" }
  | { action: "keep"; suggestionId: string }
  | { action: "dismiss"; suggestionId: string }
  | { action: "find_cv"; suggestionId: string }
  | { action: "choose_cv"; suggestionId: string; candidateId: string }
  | { action: "send_message"; body: string }
  | { action: "save_empty_reason"; reason: string };

export type SuggestionsWriteResult = {
  ok: true;
  message: string;
  tone?: "ok" | "note";
  hits?: SuggestionCvHitPayload[];
  run?: { found: number; scanned: number; queries: number; rejected: number; cost: number; note?: string };
};
