/**
 * The new UI's Headhunting tabs (D8b, 20 Nov): HH Overview, Research and
 * Suggestions through the old app's own rules.
 *
 * GET ?opening= gives what the three old pages show this person (hh/page.tsx,
 * hh/research, hh/suggestions): the Excel Tables counts, the research report
 * with its sources and benchmark, and the suggestions this person may see
 * (scopeSuggestions) with the rounds. POST { do, ...fields } runs the old action
 * for that button (src/lib/uiHh.ts) through inline(), so every rule, the run
 * limits included, stays in one place. "I reviewed the research" and the
 * empty-search reason are workday checks and save through ui/day:saveCheck.
 *
 * Who is asking: the person's Clerk session token (Bearer), read by Clerk exactly
 * like the old page's cookie. Only new.career141.com may call it from a browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  chooseCv, correctClientAndRerun, dismissSuggestion, editResearchField, keepSuggestion, pickBenchmark,
  runBenchmark, runResearch, runSuggestions, sendChatMessage,
} from "@/app/actions";
import { primeStore } from "@/data/prime";
import { repo } from "@/data/store";
import { EMPTY_RESEARCH } from "@/data/types";
import { isConvex } from "@/data/mode";
import { adultHit } from "@/lib/adultFilter";
import { can } from "@/lib/auth";
import { convexQuery } from "@/lib/convexServer";
import { SENIORITY_LABEL, benchmarkByDefault, seniorityOf } from "@/lib/incumbents";
import { inline } from "@/lib/inlineResult";
import { currentUser } from "@/lib/session";
import { MAX_ROUNDS } from "@/lib/sourcing";
import { redirectUrl } from "@/lib/uiDailyEmail";
import { HH_ACTIONS, hhCounts, type HhAction } from "@/lib/uiHh";
import { readUiBody } from "@/lib/uiLinks";
import { uiCors } from "@/lib/uiCors";
import { scopeSuggestions } from "@/lib/visibility";
import type { WorkdayCheck } from "@/lib/workday";

export const dynamic = "force-dynamic";

const RUN: Record<HhAction, (form: FormData) => Promise<unknown>> = {
  research: runResearch, benchmark: runBenchmark, pickBenchmark, correctClient: correctClientAndRerun,
  editField: editResearchField, suggestions: runSuggestions, keep: keepSuggestion, dismiss: dismissSuggestion,
  chooseCv, chat: sendChatMessage,
};

const cors = (req: Request) => uiCors(req.headers.get("origin"), "GET, POST, OPTIONS");
const answer = (req: Request, body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors(req) });
const signIn = (req: Request) => answer(req, { ok: false, message: "Sign in to continue." }, 401);

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function GET(req: NextRequest) {
  const openingId = req.nextUrl.searchParams.get("opening") ?? "";
  const user = await currentUser();
  if (!user) return signIn(req);
  await primeStore({ openingId });
  const o = repo.opening(openingId);
  if (!o) return answer(req, { ok: false, message: "That opening is no longer here." }, 404);
  // The old Headhunting pages need a sourcing seat on the opening (sourcingGate).
  const seat = can(user, "opening.sourcing", { openingId, assignment: repo.assignmentFor(openingId, user.id) ?? null });
  if (!seat.ok) return answer(req, { ok: false, message: seat.message }, 403);

  const client = repo.client(o.clientId);
  const report = repo.research(openingId);
  const f = report?.fields ?? EMPTY_RESEARCH;
  const benchmarks = repo.benchmarks(openingId);
  const nameOf = new Map(repo.users().map((u) => [u.id, u.name]));

  // Suggestions: a run belongs to whoever asked for it; rounds are the opening's.
  const scoped = scopeSuggestions(repo.suggestions(openingId), user);
  const everyRun = repo.suggestions(openingId);
  const round = everyRun.length ? Math.max(...everyRun.map((s) => s.round)) : 0;
  const check = isConvex() && (user.role === "ta" || user.role === "ta_support")
    ? await convexQuery<WorkdayCheck | null>("ta/workdays:suggestionsCheck", { actorId: user.id, jobId: openingId }).catch(() => null)
    : null;

  return answer(req, {
    ok: true,
    overview: { ...hhCounts(repo.linkVault(openingId)), benchmarkPicked: benchmarks.filter((b) => b.isSelected).length },
    research: {
      client: client ? { name: client.name, industry: client.industry ?? null, notes: client.researchNotes ?? "" } : null,
      report: report
        ? {
            fields: { ...f, competitorProfiles: undefined },
            edited: report.editedFields ?? [],
            rivals: f.competitorProfiles ?? [],
            // Reports saved before 12 Nov can still hold adult pages; never shown (old Sources).
            sources: report.sources.filter((s) => !adultHit(s)),
            generatedAt: report.generatedAt,
            model: report.model,
            searches: report.searches,
          }
        : null,
      benchmarks: benchmarks.map((b) => ({
        id: b.id, name: b.name, title: b.title, company: b.company, url: b.linkedinUrl, kind: b.kind,
        confidence: b.confidence, note: b.note, sourceUrl: b.sourceUrl, sourceTitle: b.sourceTitle, picked: b.isSelected,
      })),
      benchmarksByDefault: benchmarkByDefault(o.title),
      seniority: SENIORITY_LABEL[seniorityOf(o.title)],
      // The old page asks "I reviewed the research" only of the TA on this job at 100%.
      reviewHere: repo.workingStage(openingId, user.id) === "100%",
    },
    suggestions: {
      rows: scoped.map(({ row: s, takenBy }) => ({
        id: s.id, name: s.name, headline: s.headline, company: s.company, location: s.location, url: s.linkedinUrl,
        tier: s.tier, round: s.round, learnedFrom: s.learnedFrom ?? null, why: s.why, concern: s.concern ?? null,
        status: s.status, at: s.generatedAt, takenBy: takenBy ? nameOf.get(takenBy) ?? "another TA" : null,
      })),
      round,
      maxRounds: MAX_ROUNDS,
      steered: scoped.filter(({ row }) => row.status !== "new").length,
      picked: benchmarks.filter((b) => b.isSelected).map((b) => b.name ?? b.title),
      needsEmptyReason: !!check?.needsEmptySuggestionsReason,
      chat: repo.chat(openingId).slice(-30).map((m) => ({ id: m.id, role: m.role, body: m.body, at: m.at })),
    },
  });
}

export async function POST(req: Request) {
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return signIn(req);
  const read = readUiBody(HH_ACTIONS, await req.json().catch(() => null));
  if (!read.ok) return answer(req, read, 400);
  const form = new FormData();
  for (const [k, v] of read.fields) form.append(k, v);
  try {
    const r = await inline(() => RUN[read.action](form));
    return answer(req, { ok: r.ok, message: r.message });
  } catch (e) {
    const url = isRedirectError(e) ? redirectUrl((e as { digest?: unknown }).digest) : null;
    if (!url || url.startsWith("/signin")) return signIn(req);
    const msg = new URL(url, "https://x").searchParams.get("msg");
    return answer(req, { ok: !msg, message: msg || "Saved." });
  }
}
