/**
 * The new UI's Prepared CV (D6, 19 Nov): the CV with the CAREER141 box stamped,
 * by application (?app=), with the same one-off box details and position the old
 * route takes (designation, company, current, expected, notice, notes, x, y,
 * width; ?layout=1 for where the box sits). It runs the old route itself.
 */
import { NextResponse } from "next/server";
import { GET as preparedCv } from "@/app/api/prepared-cv/[appId]/route";
import { uiCors, withCors } from "@/lib/uiCors";

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: uiCors(req.headers.get("origin"), "GET, OPTIONS") });
}

export async function GET(req: Request) {
  const appId = new URL(req.url).searchParams.get("app") ?? "";
  if (!appId) return withCors(NextResponse.json({ error: "not found" }, { status: 404 }), req.headers.get("origin"));
  return withCors(await preparedCv(req, { params: Promise.resolve({ appId }) }), req.headers.get("origin"));
}
