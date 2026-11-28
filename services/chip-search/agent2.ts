/**
 * The query agent (28 Nov 2026, step 2 of the "chat like ChatGPT" plan).
 *
 * Why it exists: the owner typed "Eastern" and got people from India, typed
 * "only Batticaloa" / "only Kandy" / "male" and the list did not change. The
 * first agent (agent.ts) could only send a sentence to the chip search and
 * take the top 60 by points; it never saw a count and could not say "only".
 * Every repair so far was one more rule in our code, so the next prompt nobody
 * had thought of failed again.
 *
 * This agent writes its own query on the cards table (table.ts) for every
 * request, sees the rows and the count, and tries again when the answer is
 * empty or too wide. Our code decides nothing about what the recruiter meant.
 * It only keeps the search honest:
 *  - a query can only read (sql.ts) and is stopped after 2 seconds (query.ts);
 *  - nobody is shown who did not come back from a query or card read this turn;
 *  - the agent hands over the final query with its answer, and only people
 *    that query returns are shown, so what is on screen is what was searched.
 *
 * The model call is injected, so all of this is tested without a network
 * (tests/chipagent2.test.ts).
 */
import { PLACE_BY_ID } from "../../convex/lib/search/lists/places";
import { LEVELS } from "../../convex/lib/search/lists/levels";
import type { AgentCandidate, AgentContentBlock, AgentInput, AgentMessage, AgentModelCaller, AgentResult, AgentTextBlock, AgentToolBlock } from "./agent";
import type { Query } from "./query";

const MAX_STEPS = 8;
// The chat waits 60 s for this service (chipSearchClient WAIT_MS). Past this the agent is told to answer with what it has.
const HURRY_MS = 35_000;
const SHOWN_MAX = 60;
const FINAL_MAX = 5000;
const CV_READ_MAX = 3000;

const system = (tables: string) => `You are AURA, searching a recruitment firm's CV database in Sri Lanka for a recruiter. You search by writing SQL yourself.

${tables}

How to work:
- Read the whole conversation. Each message adds to or changes the ones before it; where two conflict, the newest wins. The people on screen, when listed, are what "these", "them" or "#3" refer to.
- Work out what the recruiter requires from what they mean, however they phrase it. A place, a gender, an industry, a qualification, an age, "with an email": if they asked for it, it is a condition in your query, not a preference. Place names mean Sri Lanka unless they say otherwise.
- Use the query tool. Count first, then fetch. Job titles are written many ways, so match titles with several LIKE patterns or the role column, and check the count looks sane.
- A null means the fact is not on file. It is neither yes nor no. When a condition leaves people out only because the fact is missing, count them and say so in your reply.
- Too few or none: say so plainly. Then find what is nearest by loosening one condition at a time (a town to its district, a district to its province), say which condition you loosened, and offer it. Never fill the list with people who fail something that was asked.
- Before you answer with people, read their cards with read_people and judge each against the request. Leave out anyone who does not fit. When what was asked is in no column, search the CV text if the tables list it, and read the CV before you rely on a match.
- A question that needs a number or a comparison, not a list, is answered in reply with no candidates.
- Finish with the finish tool. final_sql is one SELECT returning the id of every person who meets everything that was asked; only people it returns can be shown. searched says in plain words what you searched, for the recruiter to check.
- Never mention SQL, tables or columns to the recruiter. Write the reply as one colleague to another, short.`;

const TOOLS = [
  {
    name: "query",
    description: "Run one read-only SELECT on the tables. Returns the columns, up to 200 rows, and whether there were more. An error comes back as text: correct the query and run it again. Stopped after 2 seconds.",
    input_schema: { type: "object", properties: { sql: { type: "string" }, why: { type: "string", description: "What this query checks, in a few plain words for the recruiter, e.g. 'Accountants in the Eastern Province'. No SQL words." } }, required: ["sql", "why"] },
  },
  {
    name: "read_people",
    description: "The full card of up to 30 people by id: every job with employer and dates, qualifications, skills, place, years, level, gender. With with_cv, also each person's CV text (up to 10 people) - ask for it when what was asked is only in the CV.",
    input_schema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } }, with_cv: { type: "boolean" } }, required: ["ids"] },
  },
  {
    name: "finish",
    description: "Give the recruiter the answer.",
    input_schema: {
      type: "object",
      properties: {
        reply: { type: "string", description: "What you tell the recruiter: what you found, what is not on file, what you loosened if anything." },
        searched: { type: "string", description: "What was searched, in plain words, e.g. 'Accountant · Eastern Province · female · with email: 14'." },
        final_sql: { type: "string", description: "One SELECT returning the id column of everyone who meets all that was asked. Leave out when the answer is not a list of people." },
        candidates: {
          type: "array",
          description: `The people to show, best first, at most ${SHOWN_MAX}.`,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              fit: { type: "number", description: "1 to 99" },
              reason: { type: "string", description: "Why this person, in under 14 words." },
              confirmed: { type: "boolean", description: "False when something asked for is not on file for this person." },
            },
            required: ["id", "fit", "reason"],
          },
        },
      },
      required: ["reply", "searched"],
    },
  },
];

/** What the chat keeps from one answer and hands back with the next message, so "only the ones with email" changes the last search instead of starting over. */
export type LastSearch = { searched: string; sql: string };
export type QueryAgentResult = AgentResult & { agent: 2; trail: string[]; last: LastSearch | null };

const gWord = (g: unknown): "female" | "male" | null => (g === "f" || g === "female" ? "female" : g === "m" || g === "male" ? "male" : null);
const clip = (v: unknown) => (typeof v === "string" && v.length > 300 ? `${v.slice(0, 300)}…` : v);

export function createQueryAgent(cards: any[], query: Query, tables: string, callModel: AgentModelCaller) {
  const byId = new Map<string, any>(cards.map((c) => [c.id, c]));
  const sys = system(tables);

  const cardOf = (c: any, genders: Record<string, "f" | "m">) => {
    const lv = c.level ?? c.jobs?.[0]?.level;
    return {
      id: c.id,
      title: c.title || "",
      place: PLACE_BY_ID.get(c.place)?.name ?? null,
      years: c.years ?? null,
      level: lv != null ? LEVELS[lv]?.label ?? String(lv) : null,
      gender: gWord(genders[c.id] ?? c.gender) ?? "not on file",
      quals: (c.quals ?? []).map((q: any) => (q.status ? `${q.id} (${q.status})` : q.id ?? q)),
      jobs: (c.jobs ?? []).slice(0, 8).map((j: any) => ({ title: j.title || "", company: j.company || "", types: j.companyTypes ?? [], start: j.start ?? null, end: j.end ?? null })),
      skills: (c.skills ?? []).slice(0, 20),
      languages: c.languages ?? [],
      hasEmail: c.hasEmail ?? "not known",
      hasPhone: c.hasPhone ?? "not known",
    };
  };

  return async function runQueryAgent(input: AgentInput & { last?: LastSearch | null }): Promise<QueryAgentResult | null> {
    const t0 = Date.now();
    const genders = input.genders ?? {};
    const current = (input.currentIds ?? []).filter((id) => byId.has(id)).slice(0, 40);
    // Everyone a query or a card read returned this turn, plus who is on screen. Nobody else can be shown.
    const seen = new Set<string>(current);
    const note = (v: unknown) => { if (typeof v === "string" && byId.has(v)) seen.add(v); };
    // Each query in the agent's own plain words with what it found: shown to the recruiter as "how I searched".
    const trail: string[] = [];

    const parts = [`CONVERSATION (oldest first):\n${input.turns.map((t, i) => `${i + 1}. ${t}`).join("\n")}`];
    if (current.length) {
      parts.push(`ON SCREEN NOW (${current.length}):\n${current.map((id, i) => {
        const c = cardOf(byId.get(id), genders);
        return `#${i + 1} [${id}] ${c.title} @ ${c.jobs[0]?.company ?? "-"} | ${c.place ?? "place not on file"} | ${c.years ?? "?"} yrs | ${c.gender}`;
      }).join("\n")}`);
    }
    if (input.last?.sql) parts.push(`YOUR LAST SEARCH IN THIS CHAT, before the newest message: ${input.last.searched}\nIts query: ${input.last.sql}\nIf the newest message narrows or changes that search, start from this query.`);
    const messages: AgentMessage[] = [{ role: "user", content: parts.join("\n\n") }];

    for (let step = 1; step <= MAX_STEPS; step++) {
      const res = await callModel({ system: sys, messages, tools: TOOLS });
      if (!res || !Array.isArray(res.content)) return null;
      const calls = res.content.filter((b): b is AgentToolBlock => b.type === "tool_use");
      const text = res.content.filter((b): b is AgentTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();

      const fin = calls.find((c) => c.name === "finish");
      if (fin || !calls.length) {
        if (!fin && !text) return null;
        const inp = fin?.input ?? {};
        // The final query is the filter the recruiter is told about: only people it returns are shown.
        let allowed: Set<string> | null = null;
        let total = 0;
        const finalSql = String(inp.final_sql ?? "").trim();
        if (finalSql) {
          const a = await query(finalSql, FINAL_MAX);
          if (a.ok) { allowed = new Set(a.rows.map((r) => String(r[0]))); total = allowed.size; }
        }
        const dedup = new Set<string>();
        const picked: AgentCandidate[] = [];
        for (const item of Array.isArray(inp.candidates) ? inp.candidates : []) {
          const r = (item ?? {}) as Record<string, unknown>;
          const id = String(r.id ?? "").trim();
          if (!id || dedup.has(id) || !byId.has(id)) continue;
          if (allowed ? !allowed.has(id) : !seen.has(id)) continue;
          dedup.add(id);
          const fit = Number.isFinite(Number(r.fit)) ? Math.max(1, Math.min(99, Math.round(Number(r.fit)))) : 70;
          picked.push({ id, tier: r.confirmed === false ? "unconfirmed" : "confirmed", fit, reason: String(r.reason ?? "").trim().slice(0, 180), gender: gWord(genders[id] ?? byId.get(id)?.gender) });
        }
        // Confirmed people first, the agent's own order kept inside each group.
        const candidates = [...picked.filter((c) => c.tier === "confirmed"), ...picked.filter((c) => c.tier !== "confirmed")].slice(0, input.limit ?? SHOWN_MAX);
        const reply = String(inp.reply ?? text ?? "").trim();
        return {
          ok: true,
          reply: reply || (candidates.length ? `Found ${candidates.length} people.` : "Nobody in the database matches that."),
          read: String(inp.searched ?? "").trim(),
          total: Math.max(total, candidates.length),
          candidates,
          steps: step,
          ms: Date.now() - t0,
          agent: 2,
          trail,
          last: allowed ? { searched: String(inp.searched ?? "").trim(), sql: finalSql } : input.last ?? null,
        };
      }

      // The whole answer goes back as it came, thinking blocks included: the model needs its own reasoning on the next round.
      messages.push({ role: "assistant", content: res.content });
      const results: AgentContentBlock[] = [];
      for (const call of calls) {
        let out: unknown;
        if (call.name === "query") {
          const a = await query(String(call.input.sql ?? ""));
          if (a.ok) {
            for (const row of a.rows) for (const v of row) note(v);
            const one = a.rows.length === 1 && a.rows[0].length === 1 && typeof a.rows[0][0] === "number" ? a.rows[0][0] : null;
            const why = String(call.input.why ?? "").trim().slice(0, 120);
            if (why) trail.push(`${why}: ${one ?? `${a.rows.length}${a.more ? "+" : ""}`}`);
            out = { columns: a.columns, rows: a.rows.map((r) => r.map(clip)), returned: a.rows.length, more: a.more };
          } else out = { error: a.error };
        } else if (call.name === "read_people") {
          const withCv = call.input.with_cv === true;
          const found = (Array.isArray(call.input.ids) ? call.input.ids : []).map((id) => byId.get(String(id))).filter(Boolean).slice(0, withCv ? 10 : 30);
          for (const c of found) seen.add(c.id);
          // The ids are our own (looked up in the cards above), so they can go into the query as they are.
          const cv = new Map<string, string>();
          if (withCv && found.length) {
            const a = await query(`select person_id, substr(body, 1, ${CV_READ_MAX}) from cv_text where person_id in (${found.map((c) => `'${String(c.id).replace(/'/g, "''")}'`).join(",")})`, 10);
            if (a.ok) for (const r of a.rows) cv.set(String(r[0]), String(r[1] ?? ""));
          }
          out = { people: found.map((c) => (withCv ? { ...cardOf(c, genders), cv: cv.get(c.id) ?? "no CV text on file" } : cardOf(c, genders))) };
        } else out = { error: "No such tool." };
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out) });
      }
      if (step >= MAX_STEPS - 1 || Date.now() - t0 > HURRY_MS) results.push({ type: "text", text: "Time is nearly up. Call finish now with what you have, and say what you could not check." });
      messages.push({ role: "user", content: results });
    }
    return null;
  };
}
