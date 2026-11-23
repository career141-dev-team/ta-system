/**
 * The new UI's JD chat (22 Nov 2026; AI-FLOWS items 14-15): old AURA's JD page -
 * write the JD from the notes, change it in words, put an earlier version back -
 * through its own actions and rules (src/lib/openings/jdWrites.ts).
 *
 * GET ?position=   the JD and its status, the JD chat (each answer that worked
 *                  keeps the JD it produced, so it can be put back), the person's own
 *                  notes, and whether they may write (the old page's canWrite).
 * POST { do }      "generate" { notes } = generateJdWithModel, "revise" { request,
 *                  currentJd } = reviseJd, "restore" { messageId } = restoreJdVersion,
 *                  each through inline(); their own opening.manage check decides.
 *
 * Who: the person's Clerk session token (Bearer), read by Clerk like the old page's
 * cookie. Only new.career141.com may call it from a browser.
 */
import { NextResponse } from "next/server";
import { generateJdWithModel, restoreJdVersion, reviseJd } from "@/app/actions";
import { primeStore } from "@/data/prime";
import { repo } from "@/data/store";
import { allows } from "@/lib/auth";
import { inline } from "@/lib/inlineResult";
import { currentUser } from "@/lib/session";
import { uiCors } from "@/lib/uiCors";

export const dynamic = "force-dynamic";

const cors = (req: Request) => uiCors(req.headers.get("origin"), "GET, POST, OPTIONS");
const answer = (req: Request, body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors(req) });
const signIn = (req: Request) => answer(req, { ok: false, message: "Sign in to continue." }, 401);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || !user.isActive) return signIn(req);
  const id = new URL(req.url).searchParams.get("position") ?? "";
  await primeStore({ openingId: id });
  const o = id ? repo.opening(id) : null;
  if (!o) return answer(req, { ok: false, message: "That opening is no longer here." }, 404);
  const mine = repo.briefsForOpening(id).filter((b) => b.capturedBy === user.id).pop() ?? null;
  return answer(req, {
    ok: true,
    jd: { markdown: o.jdMarkdown ?? "", status: o.jdStatus },
    // The old page's own rule for every edit on the opening (1 Oct).
    canWrite: o.assignedTaIds.includes(user.id) || allows(user, "opening.manage", { openingId: id, assignment: repo.assignmentFor(id, user.id) ?? null }),
    notes: mine?.notesMarkdown ?? "",
    chat: repo.jdChat(id).slice(-60).map((m) => ({
      id: m.id, role: m.role, body: m.body, at: m.at, failed: !!m.failed,
      by: m.byUserId ? repo.user(m.byUserId)?.name?.split(" ")[0] ?? null : null,
      jd: m.jdMarkdown ?? null,
    })),
  });
}

export async function POST(req: Request) {
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return signIn(req);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const openingId = str(b?.openingId, 100);
  if (!b || !openingId) return answer(req, { ok: false, message: "Which opening is this? Reload and try again." }, 400);
  const form = new FormData();
  form.set("openingId", openingId);
  let run: (f: FormData) => Promise<unknown>;
  switch (b.do) {
    case "generate":
      form.set("notes", str(b.notes, 20000));
      run = generateJdWithModel;
      break;
    case "revise":
      form.set("request", str(b.request, 2000));
      form.set("currentJd", str(b.currentJd, 60000));
      run = reviseJd;
      break;
    case "restore":
      form.set("messageId", str(b.messageId, 100));
      run = restoreJdVersion;
      break;
    default:
      return answer(req, { ok: false, message: "That button is not known. Reload the page." }, 400);
  }
  try {
    const r = await inline(() => run(form));
    return answer(req, { ok: r.ok, message: r.message, tone: r.tone });
  } catch {
    return signIn(req);
  }
}
