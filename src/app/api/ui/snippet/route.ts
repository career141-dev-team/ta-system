/**
 * The new UI's Snippets (R6, 21 Nov 2026): the social card of a real opening, through
 * the old /openings/[id]/snippets page's own rules.
 *
 * GET ?position=   the card's fields from the opening (snippetFromOpening: title,
 *                  level, industry, places, package, the approved JD's bullets, the
 *                  person's own email and phone). Refused to a seat the old rail does
 *                  not offer sourcing to (seatFor); "approved: false" until the JD is.
 * POST             the old refine (/api/snippet/refine) as it is: DeepSeek through
 *                  lib/ai, the word rules when the model does not answer. Saves nothing.
 *
 * Who: the person's Clerk session token (Bearer), read by Clerk like the old page's
 * cookie. Only new.career141.com may call it from a browser.
 */
import { NextResponse } from "next/server";
import { POST as refine } from "@/app/api/snippet/refine/route";
import { primeStore } from "@/data/prime";
import { repo } from "@/data/store";
import { currentUser } from "@/lib/session";
import { snippetFromOpening } from "@/lib/snippet";
import { uiCors, withCors } from "@/lib/uiCors";
import { seatFor } from "@/lib/visibility";

export const dynamic = "force-dynamic";

const cors = (req: Request) => uiCors(req.headers.get("origin"), "GET, POST, OPTIONS");
const answer = (req: Request, body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors(req) });
const signIn = (req: Request) => answer(req, { ok: false, message: "Sign in to continue." }, 401);

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || !user.isActive) return signIn(req);
  const id = new URL(req.url).searchParams.get("position") ?? "";
  await primeStore({ openingId: id });
  const o = id ? repo.opening(id) : null;
  const client = o ? repo.client(o.clientId) : null;
  if (!o || !client) return answer(req, { ok: false, message: "That opening is no longer here." }, 404);
  const assignment = repo.assignmentFor(o.id, user.id) ?? null;
  const onStrategy = repo.strategyAssignments(o.id).some((r) => r.doneBy.includes(user.id));
  if (!seatFor(user, assignment?.role ?? null, onStrategy).canSeeSourcing) {
    return answer(req, { ok: false, message: "Snippets are for the people working this opening." }, 403);
  }
  // The old page: the card is written from the approved JD, so a post never says
  // something the JD does not.
  if (o.jdStatus !== "approved") return answer(req, { ok: true, approved: false });
  const fields = snippetFromOpening({
    title: o.title,
    clientIndustry: client.industry,
    locations: o.locations,
    salaryMin: o.salaryMin,
    salaryMax: o.salaryMax,
    currency: o.salaryCurrency,
    packageNotes: o.packageNotes,
    jdMarkdown: o.jdMarkdown,
    taEmail: user.email,
    taPhone: user.phone ?? null,
  });
  return answer(req, { ok: true, approved: true, fields });
}

export async function POST(req: Request) {
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return signIn(req);
  return withCors(await refine(req), req.headers.get("origin"));
}
