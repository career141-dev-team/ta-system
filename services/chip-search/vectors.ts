/**
 * Search by meaning for the query agent (28 Nov 2026): "someone who has run a
 * hospital finance team" has no column and no fixed words, but every CV's full
 * text was turned into a vector when it was read, and those sit in Qdrant on
 * this server. This turns the agent's sentence into a vector the same way and
 * asks Qdrant for the nearest people - only among the ids the agent's own
 * query kept, when it gives them.
 *
 * The sentence must be embedded as the CVs were, or the answers are quietly
 * wrong: the backend embeds CVs with openai/text-embedding-3-small through
 * OpenRouter and keeps the first 1,024 numbers (convex/matching/agent2.ts
 * embedText). Same model, same cut here. The index compares by angle (cosine),
 * so the cut vector's shorter length does not matter.
 *
 * Read only: one search call. Null when a key or the address is missing, and
 * the agent is then not offered the tool.
 */
const MODEL = "openai/text-embedding-3-small";
const WIDTH = 1024;
const COLLECTION = "candidate_vectors";

export type Similar = (text: string, ids: string[] | null, limit: number) => Promise<{ ok: true; hits: { id: string; similarity: number }[] } | { ok: false; error: string }>;

export function createSimilar(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Similar | null {
  const key = (env.OPENROUTER_API_KEY || "").trim();
  const url = (env.QDRANT_URL || "").trim().replace(/\/+$/, "");
  const qkey = (env.QDRANT_API_KEY || "").trim();
  if (!key || !url) return null;
  const cache = new Map<string, number[]>();

  const embed = async (text: string): Promise<number[]> => {
    const clean = text.replace(/\s+/g, " ").trim().slice(0, 4000);
    const had = cache.get(clean);
    if (had) return had;
    const r = await fetchImpl("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: clean }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json()) as { data?: { embedding?: number[] }[]; error?: { message?: string } };
    const v = j.data?.[0]?.embedding;
    if (!r.ok || !Array.isArray(v) || v.length < WIDTH) throw new Error(`the sentence could not be read for meaning (${j.error?.message ?? r.status})`);
    const cut = v.slice(0, WIDTH);
    if (cache.size > 200) cache.clear();
    cache.set(clean, cut);
    return cut;
  };

  return async (text, ids, limit) => {
    try {
      if (!text.trim()) return { ok: false, error: "Say in a sentence who you are looking for." };
      if (ids && !ids.length) return { ok: true, hits: [] };
      const vector = await embed(text);
      const r = await fetchImpl(`${url}/collections/${COLLECTION}/points/search`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(qkey ? { "api-key": qkey } : {}) },
        body: JSON.stringify({ vector, limit, with_payload: ["candidateId"], ...(ids ? { filter: { must: [{ key: "candidateId", match: { any: ids } }] } } : {}) }),
        signal: AbortSignal.timeout(10_000),
      });
      const j = (await r.json()) as { result?: { id: unknown; score: number; payload?: { candidateId?: string } }[]; status?: { error?: string } };
      if (!r.ok) return { ok: false, error: `The meaning search refused the request (${j.status?.error ?? r.status}).` };
      return { ok: true, hits: (j.result ?? []).map((p) => ({ id: String(p.payload?.candidateId ?? p.id), similarity: Math.round((p.score ?? 0) * 100) / 100 })) };
    } catch (e) {
      return { ok: false, error: `The meaning search could not run: ${e instanceof Error ? e.message : String(e)}` };
    }
  };
}
