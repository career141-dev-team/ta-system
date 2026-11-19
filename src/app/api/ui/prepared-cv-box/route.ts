/**
 * The new UI saving where the CAREER141 box sits on a Prepared CV (D6, 19 Nov):
 * the old action savePreparedCvBox (who may, the position checks, the save) run
 * through inline() so its answer comes back as data. Body: appId, openingId and
 * x, y, width - or reset: "1" for the automatic place.
 */
import { NextResponse } from "next/server";
import { savePreparedCvBox } from "@/app/actions";
import { inline } from "@/lib/inlineResult";
import { uiCors } from "@/lib/uiCors";

const FIELDS = ["appId", "openingId", "x", "y", "width", "reset"];

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: uiCors(req.headers.get("origin"), "POST, OPTIONS") });
}

export async function POST(req: Request) {
  const headers = uiCors(req.headers.get("origin"), "POST, OPTIONS");
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401, headers });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.appId !== "string" || typeof body.openingId !== "string") return NextResponse.json({ ok: false, message: "Which CV is this? Reload and try again." }, { status: 400, headers });
  const form = new FormData();
  for (const k of FIELDS) if (body[k] !== undefined) form.append(k, String(body[k]));
  try {
    const r = await inline(() => savePreparedCvBox(form));
    return NextResponse.json({ ok: r.ok, message: r.message }, { headers });
  } catch {
    // A sign-in redirect is the only navigation left inline() lets through.
    return NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401, headers });
  }
}
