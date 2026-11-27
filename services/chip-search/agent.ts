/**
 * Tool-calling search agent built directly on top of the 94,830-card chip search
 * engine (27 Nov 2026). Keeps 100% of cards.jsonl and convex/lib/search/* as fast
 * in-memory tools, while giving the Database chat a real multi-turn, requirement-
 * verifying brain that obeys arbitrary prompts ("top 10", "Healthcare or Hospitality
 * only", "Female only", "compare #1 and #3", "drop banking and find 5 more").
 *
 * Pure with respect to the model call (`callModel` is injected), so every rule and
 * guardrail is unit-tested without network access (tests/chipsearchagent.test.ts).
 */
import { PLACE_BY_ID } from "../../convex/lib/search/lists/places";
import { createSearch } from "../../convex/lib/search/chipSearch";

export type AgentToolBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type AgentTextBlock = { type: "text"; text: string };
export type AgentContentBlock = AgentToolBlock | AgentTextBlock | { type: string; [k: string]: unknown };
export type AgentMessage = { role: "user" | "assistant"; content: string | AgentContentBlock[] };
export type AgentModelResponse = {
  content: AgentContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};
export type AgentModelCaller = (req: {
  system: string;
  messages: AgentMessage[];
  tools: unknown[];
}) => Promise<AgentModelResponse | null>;

export type AgentCandidate = {
  id: string;
  tier: "confirmed" | "unconfirmed";
  fit: number;
  reason: string;
  gender: "male" | "female" | null;
};

export type AgentResult = {
  ok: true;
  reply: string;
  read: string;
  total: number;
  candidates: AgentCandidate[];
  steps: number;
  ms: number;
};

export type AgentInput = {
  turns: string[];
  currentIds?: string[];
  genders?: Record<string, "f" | "m">;
  wantGender?: "female" | "male" | null;
  limit?: number | null;
};

const LEVEL_WORD = ["trainee", "executive", "senior executive", "assistant manager", "manager", "senior manager", "head", "director", "C-level"];

const normGender = (g: unknown): "f" | "m" | null =>
  g === "f" || g === "female" ? "f" : g === "m" || g === "male" ? "m" : null;

const genderLabel = (g: "f" | "m" | null): "female" | "male" | null =>
  g === "f" ? "female" : g === "m" ? "male" : null;

const AGENT_SYSTEM = `You are AURA, a senior executive-search researcher in Sri Lanka searching a 94,830-CV database through tools.
Every recruiter message in the conversation is a real instruction. Follow it accurately like an expert researcher:

1. IDENTIFY EVERY REQUIREMENT IN THE CONVERSATION:
   - Role / job title and seniority level.
   - Hard MUST-HAVE constraints ("only", "must be", "should be fully qualified", "female only", "in Colombo", specific industries, qualifications, years, exclusions like "not banking").
   - Exact count if requested ("top 10", "show 5", "first 15").
   - Whether this turn is a NEW SEARCH, a REFINEMENT of the current list, or a QUESTION / COMPARISON about current_candidates.

2. SEARCH SMARTLY USING THE TOOLS (you have up to 5 tool rounds):
   - Use run_chip_search for fast structured retrieval across all 94,830 cards.
   - For multi-industry "A or B" briefs (e.g. "Healthcare or Hospitality only"), run SEPARATE run_chip_search calls (one for Healthcare, one for Hospitality/Hotel) so neither industry is missed!
   - Use search_cv_text when a prompt asks for a specific tool, language, school, company, or niche term (e.g. "SAP S/4HANA", "Tamil", "Big 4", "Ninewells").
   - Use inspect_cards on your top candidates BEFORE finishing so you verify their actual employers, titles, qualifications, and gender from their real career history.

3. STRICT ACCURACY RULES (never violate):
   - NEVER include a candidate who clearly FAILS a hard requirement (e.g. coffee/software/cement/trading company when "Healthcare or Hospitality only" is required; CMA-only when ACA/CIMA/ACCA is required; male when "female only" is required).
   - CA Sri Lanka (ca_sl) equals ACA. CMA (cma_sl) is NOT ACA/CIMA/ACCA.
   - Mark tier="confirmed" ONLY when all hard requirements are clearly satisfied on the card.
   - Mark tier="unconfirmed" when a candidate fits the role & verifiable requirements, fails NOTHING, but one attribute (like gender or qualifications) is not on file. Confirmed candidates always rank ahead of unconfirmed ones.
   - If fewer than the requested count truly match, return ONLY the real matches and explain plainly in "reply" — NEVER pad with wrong-industry or wrong-level candidates.
   - NEVER invent candidate IDs. Every ID in finish_answer must come from a tool result or current_candidates.
   - If the user asks a follow-up question or comparison ("compare #1 and #3", "who has hospital experience?"), inspect those IDs and answer directly in "reply", keeping only the relevant candidate IDs in "candidates".

Always end by calling the finish_answer tool.`;

const TOOLS = [
  {
    name: "run_chip_search",
    description: "Run the fast 94,830-card chip search engine (~50ms) for a focused search query. Call multiple times for 'A or B' industries or alternative job titles.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Focused search query, e.g. 'Head of Finance hospital healthcare ACA CIMA ACCA Sri Lanka' or 'Head of Finance hotel hospitality resort ACA CIMA ACCA Sri Lanka'" },
        limit: { type: "number", description: "Max hits to return (default 40, max 60)" },
      },
      required: ["query"],
    },
  },
  {
    name: "inspect_cards",
    description: "Read full in-memory card details (all employers, titles, company types, qualifications, gender, years, skills, CV snippet) for up to 30 candidate IDs to verify hard requirements.",
    input_schema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Candidate IDs to inspect (max 30)" },
      },
      required: ["ids"],
    },
  },
  {
    name: "search_cv_text",
    description: "Exact case-insensitive word scan across all 94,830 cards (or within a list of candidate IDs) for specific employers, tools, languages, schools, or niche terms.",
    input_schema: {
      type: "object",
      properties: {
        mustWords: { type: "array", items: { type: "string" }, description: "Words that must ALL appear in the candidate's card/CV" },
        anyWords: { type: "array", items: { type: "string" }, description: "Optional list where at least ONE word must appear" },
        withinIds: { type: "array", items: { type: "string" }, description: "Optional subset of candidate IDs to scan" },
        limit: { type: "number", description: "Max hits to return (default 40, max 60)" },
      },
      required: ["mustWords"],
    },
  },
  {
    name: "finish_answer",
    description: "Return the final verified answer and ranked candidate list to the recruiter.",
    input_schema: {
      type: "object",
      properties: {
        reply: { type: "string", description: "Concise, helpful recruiter-facing summary answering the prompt (and noting any unconfirmed items or shortfall)" },
        read: { type: "string", description: "Short summary of what was searched, e.g. 'Head of Finance · ACA/CIMA/ACCA · Healthcare or Hospitality · Female · top 10'" },
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              tier: { type: "string", enum: ["confirmed", "unconfirmed"] },
              fit: { type: "number", description: "Match score from 1 to 99" },
              reason: { type: "string", description: "Concise under-14-word explanation of why they match (role, employer/industry, quals, gender status)" },
            },
            required: ["id", "tier", "fit", "reason"],
          },
        },
      },
      required: ["reply", "read", "candidates"],
    },
  },
];

export function createAgent(cards: any[], search: ReturnType<typeof createSearch>, callModel: AgentModelCaller) {
  const byId = new Map<string, any>(cards.map((c) => [c.id, c]));

  const summaryOf = (c: any, genders: Record<string, "f" | "m">, score?: number, why?: string[]) => {
    const g = genders[c.id] ?? normGender(c.gender);
    const lv = c.level ?? c.jobs?.[0]?.level;
    return {
      id: c.id,
      ...(score != null ? { score } : {}),
      title: c.title || c.jobs?.[0]?.title || "",
      company: c.jobs?.[0]?.company || "",
      companyTypes: c.jobs?.[0]?.companyTypes ?? c.companyTypesNow ?? [],
      prevCompanies: (c.jobs ?? []).slice(1, 4).map((j: any) => `${j.title || ""} @ ${j.company || ""}`).filter((s: string) => s !== " @ "),
      place: PLACE_BY_ID.get(c.place)?.name ?? null,
      years: c.years ?? null,
      level: lv != null ? LEVEL_WORD[lv] ?? String(lv) : null,
      gender: genderLabel(g) ?? "not on file",
      quals: (c.quals ?? []).slice(0, 6).map((q: any) => q.id ?? q),
      ...(why?.length ? { why } : {}),
    };
  };

  const detailOf = (c: any, genders: Record<string, "f" | "m">) => {
    const g = genders[c.id] ?? normGender(c.gender);
    const lv = c.level ?? c.jobs?.[0]?.level;
    return {
      id: c.id,
      title: c.title || "",
      place: PLACE_BY_ID.get(c.place)?.name ?? null,
      years: c.years ?? null,
      level: lv != null ? LEVEL_WORD[lv] ?? String(lv) : null,
      gender: genderLabel(g) ?? "not on file",
      quals: (c.quals ?? []).map((q: any) => q.id ?? q),
      jobs: (c.jobs ?? []).slice(0, 6).map((j: any) => ({
        title: j.title || "",
        company: j.company || "",
        types: j.companyTypes ?? [],
        start: j.start ?? null,
        end: j.end ?? null,
      })),
      skills: (c.skills ?? []).slice(0, 15),
      cvSnippet: String(c.text ?? "").slice(0, 700),
    };
  };

  return async function runAgent(input: AgentInput): Promise<AgentResult | null> {
    const t0 = Date.now();
    const genders = input.genders ?? {};
    const want = normGender(input.wantGender ?? null);
    const wrong = want === "f" ? "m" : want === "m" ? "f" : null;
    const seenIds = new Set<string>();
    const currentIds = (input.currentIds ?? []).filter((id) => byId.has(id)).slice(0, 40);
    for (const id of currentIds) seenIds.add(id);

    const isAllowedGender = (id: string) => {
      if (!wrong) return true;
      const c = byId.get(id);
      const g = genders[id] ?? normGender(c?.gender);
      return g !== wrong;
    };

    const userParts = [
      `CONVERSATION TURNS (oldest to newest):\n${input.turns.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
    ];
    if (input.limit) userParts.push(`REQUESTED RESULT LIMIT: ${input.limit} candidates maximum.`);
    if (want) userParts.push(`REQUESTED GENDER: ${genderLabel(want)} only (confirmed ${genderLabel(want)} must rank ahead of "not on file"; ${genderLabel(wrong)} must be excluded).`);
    if (currentIds.length) {
      userParts.push(
        `CURRENT_CANDIDATES ON SCREEN (${currentIds.length}, numbered #1..#${currentIds.length}):\n` +
          currentIds
            .map((id, i) => {
              const c = byId.get(id);
              const s = summaryOf(c, genders);
              return `#${i + 1} [${id}] ${s.title} @ ${s.company} | ${s.place ?? "?"} | ${s.years ?? "?"} yrs | ${s.gender} | quals: ${s.quals.join(", ") || "-"}`;
            })
            .join("\n"),
      );
    }

    const messages: AgentMessage[] = [{ role: "user", content: userParts.join("\n\n") }];
    const MAX_STEPS = 4;

    for (let step = 1; step <= MAX_STEPS; step++) {
      const res = await callModel({ system: AGENT_SYSTEM, messages, tools: TOOLS });
      if (!res || !Array.isArray(res.content)) return null;

      const toolUses = res.content.filter((b): b is AgentToolBlock => b.type === "tool_use");
      const finish = toolUses.find((t) => t.name === "finish_answer");

      if (finish) {
        const rawCands = Array.isArray(finish.input.candidates) ? finish.input.candidates : [];
        const dedup = new Set<string>();
        const verified: (AgentCandidate & { _gMatch: number })[] = [];

        for (const item of rawCands) {
          if (!item || typeof item !== "object") continue;
          const r = item as Record<string, unknown>;
          const id = String(r.id ?? "").trim();
          // Guardrail 1: zero hallucinations — ID must exist in cards AND have been seen in this turn.
          if (!id || dedup.has(id) || !seenIds.has(id) || !byId.has(id)) continue;
          // Guardrail 2: enforce gender exclusion even if the model slipped.
          if (!isAllowedGender(id)) continue;
          dedup.add(id);

          const card = byId.get(id);
          const g = genders[id] ?? normGender(card?.gender);
          const tier: "confirmed" | "unconfirmed" = r.tier === "unconfirmed" ? "unconfirmed" : "confirmed";
          const fit = Number.isFinite(Number(r.fit)) ? Math.max(1, Math.min(99, Math.round(Number(r.fit)))) : 70;
          const reason = String(r.reason ?? "").trim().slice(0, 180);
          // Guardrail 3: confirmed requested gender ranks ahead of unknown gender.
          const gMatch = want ? (g === want ? 1 : 0) : 1;
          verified.push({ id, tier, fit, reason, gender: genderLabel(g), _gMatch: gMatch });
        }

        verified.sort((a, b) => {
          const tierDiff = (b.tier === "confirmed" ? 1 : 0) - (a.tier === "confirmed" ? 1 : 0);
          if (tierDiff !== 0) return tierDiff;
          if (b._gMatch !== a._gMatch) return b._gMatch - a._gMatch;
          return b.fit - a.fit;
        });

        const totalMatched = verified.length;
        // Guardrail 4: enforce exact requested limit (e.g. "show top 10").
        const capped = input.limit ? verified.slice(0, input.limit) : verified;
        const candidates: AgentCandidate[] = capped.map(({ _gMatch: _, ...c }) => c);
        const reply = String(finish.input.reply ?? "").trim();
        const read = String(finish.input.read ?? "").trim();

        return {
          ok: true,
          reply: reply || (candidates.length ? `Found ${candidates.length} matching candidates.` : "No candidates matched all requirements."),
          read,
          total: totalMatched,
          candidates,
          steps: step,
          ms: Date.now() - t0,
        };
      }

      if (!toolUses.length) {
        // Model replied with plain text without calling finish_answer; treat as direct conversational reply.
        const text = res.content
          .filter((b): b is AgentTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        if (!text) return null;
        return { ok: true, reply: text, read: "", total: 0, candidates: [], steps: step, ms: Date.now() - t0 };
      }

      messages.push({ role: "assistant", content: res.content });

      const toolResults: AgentContentBlock[] = [];
      for (const call of toolUses) {
        let out: unknown = { error: "Unknown tool" };
        try {
          if (call.name === "run_chip_search") {
            const q = String(call.input.query ?? "").trim();
            const lim = Math.max(1, Math.min(60, Number(call.input.limit) || 40));
            const r = await search([q], { inspect: false });
            const filtered = r.all.filter((h: any) => isAllowedGender(h.card.id));
            const slice = filtered.slice(0, lim);
            for (const h of slice) seenIds.add(h.card.id);
            out = {
              total: filtered.length,
              returned: slice.length,
              hits: slice.map((h: any) => summaryOf(h.card, genders, h.score, h.why)),
            };
          } else if (call.name === "inspect_cards") {
            const ids = (Array.isArray(call.input.ids) ? call.input.ids : []).map(String).slice(0, 30);
            const found = ids
              .map((id) => byId.get(id))
              .filter((c): c is any => !!c && isAllowedGender(c.id));
            for (const c of found) seenIds.add(c.id);
            out = { inspected: found.length, cards: found.map((c) => detailOf(c, genders)) };
          } else if (call.name === "search_cv_text") {
            const must = (Array.isArray(call.input.mustWords) ? call.input.mustWords : [])
              .map((w) => String(w ?? "").toLowerCase().trim())
              .filter(Boolean);
            const any = (Array.isArray(call.input.anyWords) ? call.input.anyWords : [])
              .map((w) => String(w ?? "").toLowerCase().trim())
              .filter(Boolean);
            const lim = Math.max(1, Math.min(60, Number(call.input.limit) || 40));
            const pool =
              Array.isArray(call.input.withinIds) && call.input.withinIds.length
                ? call.input.withinIds.map((id) => byId.get(String(id))).filter(Boolean)
                : cards;
            const matches: any[] = [];
            for (const c of pool) {
              if (!isAllowedGender(c.id)) continue;
              const blob = `${c.title ?? ""} ${(c.jobs ?? []).map((j: any) => `${j.title ?? ""} ${j.company ?? ""}`).join(" ")} ${(c.skills ?? []).join(" ")} ${(c.quals ?? []).map((q: any) => q.id ?? q).join(" ")} ${c.text ?? ""}`.toLowerCase();
              if (must.length && !must.every((w) => blob.includes(w))) continue;
              if (any.length && !any.some((w) => blob.includes(w))) continue;
              matches.push(c);
              if (matches.length >= lim) break;
            }
            for (const c of matches) seenIds.add(c.id);
            out = { returned: matches.length, hits: matches.map((c) => summaryOf(c, genders)) };
          }
        } catch (e) {
          out = { error: e instanceof Error ? e.message : String(e) };
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(out),
        });
      }

      if (step === MAX_STEPS - 1) {
        toolResults.push({
          type: "text",
          text: "You are on your final step. Call finish_answer now with your verified candidates.",
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    return null;
  };
}
