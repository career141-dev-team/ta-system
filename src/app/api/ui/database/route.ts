/**
 * The new UI's Database chat on real candidates (Part 3 of Ask AURA, 20 Nov).
 * The chat used to answer from twelve made-up people; it now runs the old
 * Database search (database/results/page.tsx) through the same engine and the
 * same desk rules, so the chat and the old page find the same people.
 *
 * POST { q, mode?, full? }: `q` is the chat's messages one per line (a later
 * message changes an earlier one, as the old search reads them). Natural words
 * get the engine's quick deterministic answer (about a second) unless it is
 * already held; `full: true` waits for the full engine (models read the
 * sentence and re-rank), which the chat asks for right after, to replace the
 * quick list. Boolean runs the expression over every CV holding its words.
 * Read only: nothing is saved here.
 *
 * Who is asking: the person's Clerk session token (Bearer), read by Clerk exactly
 * like the old page's cookie; they need database.read, as the old search does.
 * Only new.career141.com may call it from a browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { primeStore } from "@/data/prime";
import { repo } from "@/data/store";
import { EMPTY_CRITERIA } from "@/data/types";
import { can } from "@/lib/auth";
import { booleanScore, booleanTerms } from "@/lib/booleanScore";
import { cachedEngineSearch, deskCriteria, engineSearch, incompleteProblem, quickEngineSearch, type EngineSearch } from "@/lib/engineSearch";
import { conversationText, describe, parseBoolean, parseConversation } from "@/lib/query";
import { keywordRetrieve } from "@/lib/retrieve";
import { currentUser } from "@/lib/session";
import { personOf, readSearchBody, ROWS } from "@/lib/uiDatabase";
import { uiCors } from "@/lib/uiCors";
import { safeErrorMessage } from "@/lib/userError";

export const dynamic = "force-dynamic";

// The same ceiling the old results page asks the engine for.
const ENGINE_LIMIT = 400;

const cors = (req: Request) => uiCors(req.headers.get("origin"), "POST, OPTIONS");
const answer = (req: Request, body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors(req) });

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return answer(req, { ok: false, message: "Sign in to continue." }, 401);
  const may = can(user, "database.read");
  if (!may.ok) return answer(req, { ok: false, message: may.message }, 403);
  const read = readSearchBody(await req.json().catch(() => null));
  if (!read.ok) return answer(req, read, 400);
  const { q, mode, full } = read.body;
  await primeStore({ allApplications: true });

  if (mode === "boolean") {
    const error = parseBoolean(q).error;
    if (error) return answer(req, { ok: false, message: error }, 400);
    try {
      // Every CV holding one of the words first; the expression is then checked on each (old page, 21 Sep).
      await primeStore({ candidateIds: await keywordRetrieve(booleanTerms(q), 1200) });
    } catch (e) {
      return answer(req, { ok: false, message: safeErrorMessage(e, "The database could not be searched. Try again.") }, 502);
    }
    const terms = booleanTerms(q);
    const { results, total } = repo.searchDatabase(EMPTY_CRITERIA, { boolean: q, limit: Number.MAX_SAFE_INTEGER });
    const rows = results
      .map((r) => ({ c: r.candidate, s: booleanScore(terms, r.candidate) }))
      .sort((a, b) => (b.s?.overall ?? 0) - (a.s?.overall ?? 0))
      .slice(0, ROWS)
      .map(({ c, s }) => personOf(c, s?.overall ?? null, s?.reasons[0] ?? ""));
    return answer(req, { ok: true, total, rows, read: null, chips: [], refining: false, problem: total ? null : "Nothing in the database matched that search." });
  }

  const criteria = parseConversation(q, repo.vocabulary()).criteria;
  let engine: EngineSearch | null = cachedEngineSearch(q, criteria, ENGINE_LIMIT);
  let refining = false;
  let problem: string | null = null;
  try {
    if (!engine && full) engine = await engineSearch(q, criteria, ENGINE_LIMIT);
    if (!engine) {
      // Started now so the full answer is held when the chat asks for it next.
      engineSearch(q, criteria, ENGINE_LIMIT).catch(() => undefined);
      engine = await quickEngineSearch(q, criteria, ENGINE_LIMIT);
      refining = true;
    }
  } catch (e) {
    // The engine needs a model; the words still work without one (old page's fallback).
    problem = `Ranked on words only - the matching engine could not run (${safeErrorMessage(e, "try again")}).`;
    refining = false;
    try {
      await primeStore({ candidateIds: await keywordRetrieve([conversationText(q), ...criteria.titles, ...criteria.skills.slice(0, 3)], 150) });
    } catch (inner) {
      return answer(req, { ok: false, message: safeErrorMessage(inner, "The database could not be searched. Try again.") }, 502);
    }
  }

  const hits = new Map((engine?.hits ?? []).map((h, i) => [h.candidateId, { ...h, at: i }]));
  if (engine) await primeStore({ candidateIds: [...hits.keys()] });
  // The engine finds and ranks; the desk's own rules (place, years, notice, salary) still narrow, never reorder.
  const { results, total } = repo.searchDatabase(engine ? deskCriteria(criteria) : criteria, {
    limit: Number.MAX_SAFE_INTEGER,
    similarity: engine ? new Map([...hits].map(([id, h]) => [id, h.score / 100])) : undefined,
    floor: 0,
  });
  if (engine) results.sort((a, b) => (hits.get(a.candidate.id)?.at ?? Infinity) - (hits.get(b.candidate.id)?.at ?? Infinity));
  const rows = results.slice(0, ROWS).map((r) => {
    const h = hits.get(r.candidate.id);
    return personOf(r.candidate, h ? h.score : null, h?.reason ?? "");
  });
  if (engine?.incomplete?.length) problem = incompleteProblem(engine.incomplete);
  else if (!problem && !total) problem = "Nothing in the database matched that search.";
  return answer(req, {
    ok: true,
    total,
    rows,
    read: engine?.interpretation?.interpretation || null,
    chips: describe(criteria).map((c) => c.label),
    refining,
    problem,
    // The backend's own words for a part that did not run (20 Nov), not shown
    // on screen: "the word search" failed after 10 s, not at the 30 s wait, and
    // the reason was thrown away. Our sentences around the server's message;
    // never the request, so never the admin key (convexServer).
    detail: engine?.incomplete?.length ? engine.incomplete.map((d) => d.slice(0, 300)) : undefined,
  });
}
