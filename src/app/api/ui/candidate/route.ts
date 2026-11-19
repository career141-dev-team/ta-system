/**
 * The new UI's candidate and job-description buttons (D7, 19 Nov): Add-on and
 * Backup marks, add to another job, the Database CVs shortlist, approve and re-read
 * the JD, and interview / offer / offer answer / placement.
 *
 * Each runs what the old app runs, so there is one rule for both UIs:
 * - the old actions as they are, through inline(), for the form buttons;
 * - the shared writers the phone app uses (interviewWrites, closingWrites) with the
 *   phone's own body rules, for interview and closing - the old page's offer and
 *   placement actions only answer by redirecting to its own candidate page.
 * GET gives one candidate's interviews and offers, so the new UI can show them and
 * name the offer an answer or a placement is for.
 *
 * Who is asking: the person's Clerk session token (Bearer), read by Clerk exactly
 * like the old page's cookie. Only new.career141.com may call it from a browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { addCandidateToJob, addToOpening, approveJd, reextractJobDetails, toggleAddOn, toggleBackup } from "@/app/actions";
import { primeStore } from "@/data/prime";
import { repo } from "@/data/store";
import { writeCandidateClosing } from "@/lib/candidates/closingWrites";
import { writeCandidateInterview } from "@/lib/candidates/interviewWrites";
import { storeOfferLetter } from "@/lib/candidates/offerLetter";
import { convexMutation, convexQuery } from "@/lib/convexServer";
import { inline } from "@/lib/inlineResult";
import { mobileCandidate } from "@/lib/mobile/candidate";
import { candidateClosingBody, candidateInterviewBody } from "@/lib/mobile/candidateBodies";
import { parseBody } from "@/lib/mobile/openingsBodies";
import { currentUser } from "@/lib/session";
import { readBody, type FormAction } from "@/lib/uiCandidate";
import { uiCors } from "@/lib/uiCors";

export const dynamic = "force-dynamic";

const RUN: Record<FormAction, (form: FormData) => Promise<unknown>> = {
  addon: toggleAddOn,
  backup: toggleBackup,
  addjob: addCandidateToJob,
  shortlistMatch: addToOpening,
  approveJd,
  rereadJd: reextractJobDetails,
};

const cors = (req: Request) => uiCors(req.headers.get("origin"), "GET, POST, OPTIONS");
const answer = (req: Request, body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors(req) });
const signIn = (req: Request) => answer(req, { ok: false, message: "Sign in to continue." }, 401);

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

/** One candidate's interviews and offers (?opening=&app=). */
export async function GET(req: NextRequest) {
  const openingId = req.nextUrl.searchParams.get("opening") ?? "";
  const appId = req.nextUrl.searchParams.get("app") ?? "";
  // Who is asking first: a signed-out call loads nothing.
  const user = await currentUser();
  if (!user) return signIn(req);
  await primeStore({ openingId });
  const seen = mobileCandidate(user, openingId, appId);
  if (seen.kind === "not_found") return answer(req, { ok: false, message: "That candidate is no longer on this opening." }, 404);
  if (seen.kind === "forbidden") return answer(req, { ok: false, message: seen.message }, 403);
  const interviews = repo.interviews(appId).map((i) => ({
    id: i.id, title: i.title, scheduledAt: i.scheduledAt, location: i.location, mode: i.mode,
    confirmed: !!i.confirmedAt, outcome: i.outcome, result: i.result,
  }));
  const offers = repo.offers(appId).map((o) => ({
    id: o.id, salary: o.salary, salaryBasis: o.salaryBasis, currency: o.currency, startDate: o.startDate, status: o.status,
  }));
  return answer(req, { ok: true, interviews, offers });
}

export async function POST(req: Request) {
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return signIn(req);
  // A placement comes as a form with the signed offer letter; everything else as JSON.
  let raw: unknown = null;
  let letter: File | null = null;
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("letter");
    letter = file instanceof File && file.size > 0 ? file : null;
    try {
      raw = JSON.parse(String(form?.get("payload") ?? ""));
    } catch {
      raw = null;
    }
  } else {
    raw = await req.json().catch(() => null);
  }
  const read = readBody(raw);
  if (!read.ok) return answer(req, read, 400);

  if (read.value.kind === "form") {
    const { action, fields } = read.value;
    const form = new FormData();
    for (const [k, v] of fields) form.append(k, v);
    try {
      const r = await inline(() => RUN[action](form));
      return answer(req, { ok: r.ok, message: r.message });
    } catch {
      // A sign-in redirect is the only navigation inline() lets through.
      return signIn(req);
    }
  }

  const { action, openingId, appId, body } = read.value;
  const user = await currentUser();
  if (!user) return signIn(req);
  await primeStore({ openingId });
  if (action === "interview") {
    const parsed = parseBody(candidateInterviewBody, body, "Check the interview details and try again.");
    if (!parsed.ok) return answer(req, parsed, 400);
    const r = await writeCandidateInterview(user, openingId, appId, parsed.value, { convexQuery, revalidatePath });
    return answer(req, { ok: r.ok, message: r.message }, r.ok ? 200 : r.status);
  }
  // A placement's letter is stored first, so a failed upload places nobody (docs/19 7.9).
  // The letter id is only ever the one stored here, never one the browser names.
  let withLetter = body;
  if (body && typeof body === "object" && (body as { action?: unknown }).action === "place") {
    if (!letter) return answer(req, { ok: false, message: "A placement needs the signed offer letter." }, 400);
    const stored = await storeOfferLetter(letter);
    if (!stored.ok) return answer(req, stored, 400);
    withLetter = { ...(body as object), offerLetterFileId: stored.fileId };
  }
  const parsed = parseBody(candidateClosingBody, withLetter, "Check the offer details and try again.");
  if (!parsed.ok) return answer(req, parsed, 400);
  const r = await writeCandidateClosing(user, openingId, appId, parsed.value, { convexQuery, convexMutation, revalidatePath });
  return answer(req, { ok: r.ok, message: r.ok && parsed.value.action === "place" ? "Placement recorded. Asma and the Director have been told." : r.message }, r.ok ? 200 : r.status);
}
