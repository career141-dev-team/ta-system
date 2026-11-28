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
import { chipAgent, chipReadLine, chipScore, chipSearch, genderAsked, genderByName, limitAsked, type ChipHit } from "@/lib/chipSearchClient";
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
  const { q, mode, full, currentIds } = read.body;
  // 23 Nov: the tables (vocabulary, openings) only. This route reads applications for one thing, the
  // availability rule (free / in a pipeline / placed before) in searchDatabase, and its rows carry no
  // pipeline markers, so the ~10k applications are loaded below only when the search asks for that rule.
  await primeStore({});

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

  // 26 Nov 2026: the chip search answers first (one final answer, no quick pass);
  // the old engine below runs only when it cannot answer.
  // "Female/male only": the other gender is removed by name BEFORE the search's AI check, so the
  // check is spent on people who can be shown (records rarely say male or female; cards hold no names).
  // 26 Nov 2026: 28,002 records (Aug-Sep CV import) were never filled from their CV: no name,
  // no email, no phone, no CV file. The new search finds them from their CV text, but a TA
  // cannot reach them, so they are not shown (owner: "hide them").
  // The data layer (src/lib/live/mapLive.ts) writes "Unnamed candidate" into an empty name, so that counts as none.
  const realName = (n?: string | null) => !!n?.trim() && n.trim() !== "Unnamed candidate";
  const reachable = (c: { fullName?: string | null; email?: string | null; phone?: string | null }) =>
    !!(realName(c.fullName) || c.email?.trim() || c.phone?.trim());
  const want = genderAsked(q);
  const askedLimit = limitAsked(q, ROWS);
  const cap = askedLimit ?? ROWS;
  const turns = q.split("\n");

  // 27 Nov 2026: try the tool-calling agent over the 94,830-card chip search engine first.
  // It handles arbitrary constraints ("Healthcare or Hospitality only", "show top 10",
  // follow-up comparisons/refinements) and falls back cleanly to chipSearch below if unavailable.
  const fm = (g: unknown): "f" | "m" | null => (g === "female" || g === "f" ? "f" : g === "male" || g === "m" ? "m" : null);
  const knownGenders: Record<string, "f" | "m"> = {};
  // 28 Nov 2026: "Manish Mittal where is his location" got "not found" with his CV open beside the
  // chat. The cards hold no names, so the agent could not tell that the name was someone on screen.
  // The names of the people on screen (only those) now go with the question.
  const screenNames: Record<string, string> = {};
  if (currentIds?.length) {
    await primeStore({ candidateIds: currentIds });
    for (const id of currentIds) {
      const c = repo.candidate(id);
      if (realName(c?.fullName)) screenNames[id] = c!.fullName!.trim().slice(0, 80);
      const g = want ? fm(String(c?.gender ?? "").toLowerCase()) : null;
      if (g) knownGenders[id] = g;
    }
  }
  const agentAns = await chipAgent({
    turns,
    currentIds,
    genders: knownGenders,
    names: screenNames,
    wantGender: want,
    limit: askedLimit,
  });
  if (agentAns) {
    try {
      const ids = agentAns.candidates.map((c) => c.id);
      if (ids.length) await primeStore({ candidateIds: ids });
      let found = agentAns.candidates
        .map((a) => ({ a, c: repo.candidate(a.id) }))
        .filter((x): x is { a: (typeof agentAns.candidates)[number]; c: NonNullable<typeof x.c> } => !!x.c && reachable(x.c));
      // 28 Nov 2026: the query agent already filtered by what the whole chat asked ("male" after
      // an earlier "female" means male). The word check here reads every message at once and
      // would undo that, so it stays for the first agent only.
      if (want && found.length && agentAns.agent !== 2) {
        const mine = want === "female" ? "f" : "m";
        const resolved = found.map((x) => fm(x.a.gender) ?? fm(String(x.c.gender ?? "").toLowerCase()));
        const askNames = found.map((x, i) => (resolved[i] ? "" : x.c.fullName ?? ""));
        const byName = askNames.some(Boolean) ? await genderByName(askNames) : [];
        const withG = found.map((x, i) => ({ ...x, g: resolved[i] ?? byName?.[i] ?? "?" }));
        found = withG
          .filter((x) => x.g === mine || x.g === "?")
          .sort((x, y) => {
            const tierDiff = (y.a.tier === "confirmed" ? 1 : 0) - (x.a.tier === "confirmed" ? 1 : 0);
            if (tierDiff !== 0) return tierDiff;
            const gDiff = (y.g === mine ? 1 : 0) - (x.g === mine ? 1 : 0);
            if (gDiff !== 0) return gDiff;
            return y.a.fit - x.a.fit;
          });
      }
      const named = (x: (typeof found)[number]) => realName(x.c.fullName);
      found = [...found.filter(named), ...found.filter((x) => !named(x))];
      // "unsure": the agent could not confirm everything asked for this person (something is not on
      // file). They come after the confirmed people whatever their score, so the screen says why.
      const rows = found.slice(0, cap).map(({ a, c }) => ({ ...personOf(c, a.fit, a.reason), ...(a.tier === "unconfirmed" ? { unsure: true } : {}) }));
      // The chat shows plain text: a model's **bold** or `code` marks would show as symbols.
      const plain = (s: string) => s.replace(/\*\*|__|`/g, "").trim();
      if (rows.length || agentAns.reply) {
        return answer(req, {
          ok: true,
          total: askedLimit ? rows.length : Math.max(rows.length, agentAns.total),
          rows,
          read: agentAns.read || null,
          reply: agentAns.reply ? plain(agentAns.reply) : null,
          trail: agentAns.trail?.length ? agentAns.trail.slice(0, 12) : undefined,
          chips: [],
          refining: false,
          problem: null,
        });
      }
    } catch {
      // Fall through to standard chipSearch below.
    }
  }

  const narrow = want
    ? async (hits: ChipHit[]) => {
        const pool = hits.slice(0, 300);
        await primeStore({ candidateIds: pool.map((h) => h.id) });
        const people = pool.map((h) => ({ h, c: repo.candidate(h.id) }));
        // The search card first (NIC, "Mrs", "Gender:" lines in the CV: 14,849 known), then the AURA record.
        const known = people.map((x) => fm(x.h.gender) ?? fm(String(x.c?.gender ?? "").toLowerCase()));
        // The name only for the rest, so fewer names go to the model.
        const ask = people.map((x, i) => (known[i] || !x.c ? "" : x.c.fullName ?? ""));
        const byName = ask.some(Boolean) ? await genderByName(ask) : [];
        const mine = want === "female" ? "f" : "m";
        // sure: known or the name clearly says; maybe: nobody can tell; the rest leave.
        const sure: string[] = [], maybe: string[] = [], genders: Record<string, "f" | "m"> = {};
        people.forEach((x, i) => {
          if (!x.c || !reachable(x.c)) return;
          const g = known[i] ?? byName?.[i] ?? "?";
          if (g === "f" || g === "m") genders[x.h.id] = g;
          if (g === mine) sure.push(x.h.id);
          else if (g === "?") maybe.push(x.h.id);
        });
        return byName ? { ids: [...sure, ...maybe], genders } : null;
      }
    : undefined;
  const chip = await chipSearch(turns, narrow);
  if (chip && chip.hits.length) {
    try {
      const pool = chip.hits.slice(0, ROWS * 3);
      await primeStore({ candidateIds: pool.map((h) => h.id) });
      let found = pool
        .map((h) => ({ h, c: repo.candidate(h.id) }))
        .filter((x): x is { h: ChipHit; c: NonNullable<typeof x.c> } => !!x.c && reachable(x.c));
      // 26 Nov 2026: when the AI check passed 5 or more, only checked people are shown - the
      // unchecked ones after them were weak (cement, tea, seafood for a hospital brief).
      const checked = found.filter((x) => x.h.ai != null);
      if (checked.length >= 5) found = checked;
      // Records with no name (a CV read, no name saved) go to the end, never on top.
      const named = (x: (typeof found)[number]) => realName(x.c.fullName);
      found = [...found.filter(named), ...found.filter((x) => !named(x))];
      const rows = found.slice(0, cap).map(({ h, c }) => personOf(c, chipScore(h.score), h.aiWhy || h.why.join(" · ")));
      if (rows.length) {
        return answer(req, { ok: true, total: askedLimit ? rows.length : chip.total, rows, read: chipReadLine(chip) || null, chips: [], refining: false, problem: null });
      }
    } catch {
      // The records could not be read: the old engine below answers instead.
    }
  }

  const criteria = parseConversation(q, repo.vocabulary()).criteria;
  if (criteria.availability !== "any") await primeStore({ allApplications: true });
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
