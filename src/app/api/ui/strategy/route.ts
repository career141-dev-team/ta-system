/**
 * The new UI's Strategy Planner (D10a, 20 Nov): the lead's planner through the
 * old app's own rules.
 *
 * GET gives what the old /strategy page builds (strategy.assign checked first):
 * every job still being worked (plannerJobs), the strategy list, every row on
 * those jobs with whether it is ticked, struck, given to whom, accepted, done and
 * submitted, and each active TA with how many strategies they are on this week.
 * POST { do, ...fields } runs the old planner action (src/lib/uiStrategy.ts):
 * updateStrategyLine, addStrategyDoneBy, removeStrategyDoneBy,
 * setStrategyNotApplicable, saveStrategy, setStrategyActive - each checks its rights.
 *
 * Who is asking: the person's Clerk session token (Bearer), read by Clerk exactly
 * like the old page's cookie. Only new.career141.com may call it from a browser.
 */
import { NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  addStrategyDoneBy, removeStrategyDoneBy, saveStrategy, setStrategyActive, setStrategyNotApplicable, updateStrategyLine,
} from "@/app/actions";
import { primeStore } from "@/data/prime";
import { repo } from "@/data/store";
import { allows, can, isTa } from "@/lib/auth";
import { inline } from "@/lib/inlineResult";
import { currentUser } from "@/lib/session";
import { isTicked, plannerJobs, strategyAcceptanceStatus } from "@/lib/strategyPlanner";
import { redirectUrl } from "@/lib/uiDailyEmail";
import { readUiBody } from "@/lib/uiLinks";
import { LINE_FIELDS, STRATEGY_ACTIONS, weekLoad, type StrategyAction } from "@/lib/uiStrategy";
import { uiCors } from "@/lib/uiCors";

export const dynamic = "force-dynamic";

const RUN: Record<StrategyAction, (form: FormData) => Promise<unknown>> = {
  line: updateStrategyLine, addTa: addStrategyDoneBy, removeTa: removeStrategyDoneBy, na: setStrategyNotApplicable,
  saveStrategy, active: setStrategyActive,
};

const cors = (req: Request) => uiCors(req.headers.get("origin"), "GET, POST, OPTIONS");
const answer = (req: Request, body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors(req) });
const signIn = (req: Request) => answer(req, { ok: false, message: "Sign in to continue." }, 401);

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return signIn(req);
  // The old page's own guard: the planner is for those who give strategies.
  const may = can(user, "strategy.assign");
  if (!may.ok) return answer(req, { ok: false, message: may.message }, 403);
  await primeStore();
  const all = repo.strategyAssignments();
  const clientName = (id: string) => repo.client(id)?.name ?? "";
  const jobs = plannerJobs(repo.openings(), repo.users(), all, clientName);
  const onJob = new Set(jobs.map((j) => j.opening.id));
  const rows = all.filter((r) => onJob.has(r.openingId));
  const tas = repo.users().filter((u) => u.isActive && isTa(u)).sort((a, b) => a.name.localeCompare(b.name));
  return answer(req, {
    ok: true,
    canManage: allows(user, "strategy.manage"),
    strategies: repo.strategies(true).map((s) => ({ id: s.id, name: s.name, group: s.group ?? "", description: s.description ?? "", active: s.active, sortOrder: s.sortOrder })),
    jobs: jobs.map((j) => ({
      id: j.opening.id, client: clientName(j.opening.clientId), title: j.opening.title, priority: j.opening.priorityTier, assignedAt: j.opening.assignedAt,
      tas: j.tas.map((t) => t.id), createdAt: j.opening.createdAt,
    })),
    tas: tas.map((t) => ({ id: t.id, name: t.name, week: weekLoad(rows, t.id) })),
    rows: rows.map((r) => ({
      job: r.openingId, strategyId: r.strategyId, name: r.strategyName, ticked: isTicked(r), na: r.notApplicable,
      doneBy: r.doneBy.map((id) => ({ id, pending: strategyAcceptanceStatus(r, id) === "pending" })),
      assignedAt: r.assignedAt, doneAt: r.doneAt, note: r.note, proofs: r.proofs.length,
      submittedAt: r.submittedAt, submittedBy: r.submittedBy,
    })),
  });
}

export async function POST(req: Request) {
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return signIn(req);
  const read = readUiBody(STRATEGY_ACTIONS, await req.json().catch(() => null));
  if (!read.ok) return answer(req, read, 400);
  const form = new FormData();
  for (const [k, v] of read.fields) form.append(k, v);
  if (read.action === "line" && !LINE_FIELDS.has(String(form.get("field")))) return answer(req, { ok: false, message: "That cannot be changed here." }, 400);
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
