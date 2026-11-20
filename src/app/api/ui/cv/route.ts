/**
 * The new UI's CV popup (D6, 19 Nov): a candidate's CV as a PDF, by the
 * application (?app=) or, for a database match, by the candidate (?candidate=).
 * It runs the old CV route itself (/api/cv/[candidateId]) with ?view=pdf, so the
 * access rule (lib/cvAccess) and the Word -> PDF step are the old ones.
 * Who is asking: the Clerk session token, read like the old page's cookie.
 */
import { NextRequest, NextResponse } from "next/server";
import { GET as cvFile } from "@/app/api/cv/[candidateId]/route";
import { primeApplication } from "@/lib/primeApplication";
import { repo } from "@/data/store";
import { currentUser } from "@/lib/session";
import { uiCors, withCors } from "@/lib/uiCors";

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: uiCors(req.headers.get("origin"), "GET, OPTIONS") });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const appId = req.nextUrl.searchParams.get("app");
  let candidateId = req.nextUrl.searchParams.get("candidate");
  // Who is asking comes first (19 Nov): a signed-out call must not make the
  // server load every application just to be refused.
  const user = await currentUser();
  if (!user) return withCors(new NextResponse("Sign in to open a CV.", { status: 401 }), origin);
  if (appId) {
    await primeApplication(appId, user.id);
    candidateId = repo.application(appId)?.candidateId ?? null;
  }
  if (!candidateId) return withCors(new NextResponse("Not found.", { status: 404 }), origin);
  const url = new URL(`/api/cv/${encodeURIComponent(candidateId)}`, req.url);
  url.searchParams.set("view", "pdf");
  if (appId) url.searchParams.set("app", appId);
  if (req.nextUrl.searchParams.get("download") === "1") url.searchParams.set("download", "1");
  const res = await cvFile(new NextRequest(url, { headers: req.headers }), { params: Promise.resolve({ candidateId }) });
  return withCors(res, origin);
}
