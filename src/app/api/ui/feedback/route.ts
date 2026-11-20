/**
 * The new UI's Feedback (R2, 20 Nov): the Tell us panel and the Feedback board
 * through the old /feedback desk's own reads and actions.
 *
 * GET gives what the old desk shows this person (repo.feedbacks: a lead or
 * Director every item, an admin what a lead passed on plus their own, anyone else
 * their own), each as the new board's card (src/lib/uiFeedback.ts), plus what this
 * person may do. GET ?file=screenshot|voice&id= plays an item's own screenshot or
 * voice note through the old routes (they check who may see the item).
 *
 * POST, JSON { do, ... }: "send" = submitFeedbackAction, "lead" =
 * leadReviewFeedbackAction, "admin" = adminUpdateFeedbackAction, "read" =
 * markFeedbacksReadAction, "delete" = deleteFeedbacksAction - every rule (who may
 * review, who may delete, what they can see) stays inside those actions.
 * POST multipart { what: "shot" | "voice", file } stores a screenshot (3 MB image,
 * uploadFeedbackScreenshotAction) or a voice note (the old voice route) and gives
 * back its storage id for "send".
 *
 * Who is asking: the person's Clerk session token (Bearer), read by Clerk exactly
 * like the old page's cookie. Only new.career141.com may call it from a browser.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  adminUpdateFeedbackAction, deleteFeedbacksAction, leadReviewFeedbackAction, markFeedbacksReadAction,
  submitFeedbackAction, uploadFeedbackScreenshotAction,
} from "@/app/actions";
import { GET as screenshotFile } from "@/app/api/feedback/screenshot/[id]/route";
import { GET as voiceFile } from "@/app/api/feedback/voice/[id]/route";
import { POST as voiceUpload } from "@/app/api/feedback/voice/route";
import { primeStore } from "@/data/prime";
import { repo } from "@/data/store";
import { currentUser } from "@/lib/session";
import { ADMIN_STATUS, CATEGORY_OF, LEAD_DECISION, itemOf, priorityOf, type Kind } from "@/lib/uiFeedback";
import { uiCors, withCors } from "@/lib/uiCors";

export const dynamic = "force-dynamic";

const cors = (req: Request) => uiCors(req.headers.get("origin"), "GET, POST, OPTIONS");
const answer = (req: Request, body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors(req) });
const signIn = (req: Request) => answer(req, { ok: false, message: "Sign in to continue." }, 401);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 100) : []);

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user || !user.isActive) return signIn(req);
  const file = req.nextUrl.searchParams.get("file");
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (file === "screenshot" || file === "voice") {
    const res = await (file === "screenshot" ? screenshotFile : voiceFile)(req, { params: Promise.resolve({ id }) });
    return withCors(res, req.headers.get("origin"));
  }
  await primeStore();
  const read = repo.readFeedbackIds(user.id);
  return answer(req, {
    ok: true,
    me: user.id,
    // The old actions' own role tests, said once so the board shows only buttons that work.
    canLead: user.role === "ta_lead" || user.role === "director",
    canBuild: user.role === "admin" || user.role === "director",
    canDelete: user.role === "ta_lead" || user.role === "admin" || user.role === "director",
    items: repo.feedbacks(user).slice(0, 300).map((f) => itemOf(f, read.has(f.id))),
  });
}

export async function POST(req: Request) {
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return signIn(req);
  // A screenshot or voice note: stored first, sent with the words after.
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const what = form?.get("what");
    if (what === "voice") {
      // A fresh body with its own boundary; who is asking is read from this request by Clerk.
      const res = await voiceUpload(new NextRequest(req.url, { method: "POST", body: await rebuild(form!) }));
      return withCors(res, req.headers.get("origin"));
    }
    if (what !== "shot" || !form) return answer(req, { ok: false, message: "That file is not known. Reload the page." }, 400);
    const r = await uploadFeedbackScreenshotAction(form);
    return answer(req, r, r.ok ? 200 : 400);
  }
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return answer(req, { ok: false, message: "Nothing was sent." }, 400);
  switch (b.do) {
    case "send": {
      const kind: Kind = b.kind === "broke" || b.kind === "idea" ? b.kind : "question";
      const r = await submitFeedbackAction({
        category: CATEGORY_OF[kind],
        priority: priorityOf(b.blocks === true),
        description: str(b.text, 5000),
        pageUrl: str(b.page, 500) || undefined,
        screenshot: str(b.screenshot, 200) || undefined,
        voiceNote: str(b.voiceNote, 200) || undefined,
      });
      return answer(req, r);
    }
    case "lead": {
      const decision = LEAD_DECISION[b.decision as keyof typeof LEAD_DECISION];
      if (!decision) return answer(req, { ok: false, message: "Choose what to do with it." }, 400);
      return answer(req, await leadReviewFeedbackAction({ feedbackId: str(b.id, 100), decision, leadNotes: str(b.notes, 2000) || undefined }));
    }
    case "admin": {
      const status = ADMIN_STATUS[b.status as keyof typeof ADMIN_STATUS];
      if (!status) return answer(req, { ok: false, message: "Choose what to do with it." }, 400);
      return answer(req, await adminUpdateFeedbackAction({ feedbackId: str(b.id, 100), status, adminResolution: str(b.notes, 2000) || undefined }));
    }
    case "read":
      return answer(req, await markFeedbacksReadAction(ids(b.ids)));
    case "delete":
      return answer(req, await deleteFeedbacksAction(ids(b.ids)));
    default:
      return answer(req, { ok: false, message: "That button is not known. Reload the page." }, 400);
  }
}

/** The voice note as the old voice route reads it: one "file" field. */
async function rebuild(form: FormData): Promise<FormData> {
  const out = new FormData();
  const file = form.get("file");
  if (file instanceof Blob) out.append("file", file);
  return out;
}
