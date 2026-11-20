/**
 * The new UI's green box on a Prepared CV (D11 item 4, 20 Nov): what the CAREER141
 * box says, read and saved through the old app's own rules.
 *
 * The box is not stored on its own: the Prepared CV (and so the End of day email)
 * draws it from the candidate's record - designation, company, current and expected
 * salary, notice - and the TA's notes on this application (lib/preparedCv boxContent).
 * Before this, what AURA put in the box lived only on the screen.
 *
 * GET ?app= gives the box as the record holds it (mayOpenCv, as the Prepared CV
 * itself): `content` (with this application's own notes) and `answers` (the
 * opening's follow-up answers, which the Prepared CV adds - shown, not edited here).
 * POST { appId, openingId, designation, company, currentSalary, expectedSalary,
 * notice, notes? } runs the old saveReviewDetails (opening.act, the TA who owns the
 * candidate, the same write as the Director-review details). Without `notes` the
 * application's notes are sent back as they are, so their marks are kept.
 *
 * Who is asking: the Clerk session token (Bearer). Only new.career141.com may call it.
 */
import { NextRequest, NextResponse } from "next/server";
import { saveReviewDetails } from "@/app/actions";
import { primeStore } from "@/data/prime";
import { repo } from "@/data/store";
import { mayOpenCv } from "@/lib/cvAccess";
import { inline } from "@/lib/inlineResult";
import { boxContent } from "@/lib/preparedCv";
import { currentUser } from "@/lib/session";
import { uiCors } from "@/lib/uiCors";
import { boxNotesToSend, ownNotes, readBoxBody } from "@/lib/uiCvBox";

export const dynamic = "force-dynamic";

const cors = (req: Request) => uiCors(req.headers.get("origin"), "GET, POST, OPTIONS");
const answer = (req: Request, body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...cors(req), "Cache-Control": "private, no-store" } });
const signIn = (req: Request) => answer(req, { ok: false, message: "Sign in to continue." }, 401);

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return signIn(req);
  const appId = req.nextUrl.searchParams.get("app") ?? "";
  if (!repo.application(appId)) await primeStore({ allApplications: true });
  const app = repo.application(appId);
  // A candidate's details are personal data: the same test as the Prepared CV.
  if (!app || !mayOpenCv(user, app.candidateId, app.id)) return answer(req, { ok: false, message: "That CV is not open to you." }, 404);
  await primeStore({ candidateIds: [app.candidateId] });
  const c = repo.candidate(app.candidateId);
  if (!c) return answer(req, { ok: false, message: "That candidate no longer exists." }, 404);
  const own = boxContent(app, c, null);
  const all = boxContent(app, c, repo.opening(app.openingId));
  return answer(req, {
    ok: true,
    content: {
      designation: own.currentDesignation ?? "",
      company: own.currentCompany ?? "",
      currentSalary: own.currentSalary ?? "",
      expectedSalary: own.expectedSalary ?? "",
      notice: own.noticePeriod ?? "",
      notes: own.notes,
    },
    answers: all.notes.slice(own.notes.length),
  });
}

export async function POST(req: Request) {
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return signIn(req);
  const read = readBoxBody(await req.json().catch(() => null));
  if (!read.ok) return answer(req, read, 400);
  const b = read.body;
  if (!repo.application(b.appId)) await primeStore({ allApplications: true });
  const app = repo.application(b.appId);
  if (!app || app.openingId !== b.openingId) return answer(req, { ok: false, message: "That candidate is not on this opening." }, 404);
  const form = new FormData();
  form.append("applicationId", b.appId);
  form.append("openingId", b.openingId);
  form.append("currentDesignation", b.designation);
  form.append("currentCompany", b.company);
  form.append("currentSalary", b.currentSalary);
  form.append("expectedSalary", b.expectedSalary);
  form.append("noticePeriod", b.notice);
  // The old save replaces the TA's notes with what it is sent, so they always go.
  for (const n of boxNotesToSend(b.notes, ownNotes(app.notes ?? []))) {
    form.append("customLabel", "");
    form.append("customValue", n);
  }
  try {
    const r = await inline(() => saveReviewDetails(form));
    return answer(req, { ok: r.ok, message: r.ok ? "Saved to the candidate. The Prepared CV and the End of day email use it." : r.message });
  } catch {
    // A sign-in redirect is the only navigation inline() lets through.
    return signIn(req);
  }
}
