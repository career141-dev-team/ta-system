/**
 * The new UI's Referee Calls (D8c, 20 Nov): the sheet and its Save through the
 * old app's own rules.
 *
 * GET ?opening=&location=&day= gives what the old page shows this person
 * (hh/referees/page.tsx): a TA their own calls, desk-wide people and TA Support
 * everyone's, for one work location and one work day, with the days there are
 * and whether this sheet can be changed (a TA, a real location, today only).
 * POST { do, ...fields } runs the old action (src/lib/uiReferees.ts): "save" is
 * saveRefereeCalls, "result" is updateRefereeCall - each checks its own rights.
 *
 * Who is asking: the person's Clerk session token (Bearer), read by Clerk exactly
 * like the old page's cookie. Only new.career141.com may call it from a browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { saveRefereeCalls, updateRefereeCall } from "@/app/actions";
import { primeStore } from "@/data/prime";
import { repo } from "@/data/store";
import type { RefereeCall } from "@/data/types";
import { isDeskWide, isTa, seesEveryTaRow } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import { readUiBody } from "@/lib/uiLinks";
import { REFEREE_ACTIONS } from "@/lib/uiReferees";
import { uiCors } from "@/lib/uiCors";
import { workdayDate } from "@/lib/workday";
import { inWorkLocation, workLocationView } from "@/lib/workLocations";

export const dynamic = "force-dynamic";

const cors = (req: Request) => uiCors(req.headers.get("origin"), "GET, POST, OPTIONS");
const answer = (req: Request, body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors(req) });
const signIn = (req: Request) => answer(req, { ok: false, message: "Sign in to continue." }, 401);

const rowOf = (c: RefereeCall, nameOf: Map<string, string>) => ({
  id: c.id, company: c.company, referral: c.referral, contactNumber: c.contactNumber ?? "", feedback: c.feedback,
  result: c.result ?? null, addedBy: c.addedBy, by: nameOf.get(c.addedBy) ?? "", createdAt: c.createdAt,
});

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const openingId = sp.get("opening") ?? "";
  const user = await currentUser();
  if (!user) return signIn(req);
  await primeStore({ openingId });
  const opening = repo.opening(openingId);
  if (!opening) return answer(req, { ok: false, message: "That opening is no longer here." }, 404);

  // The old page's own rules, line for line.
  let workLocationId: string | undefined;
  try {
    workLocationId = workLocationView(opening, sp.get("location") ?? undefined);
  } catch (e) {
    return answer(req, { ok: false, message: (e as Error).message }, 400);
  }
  const seesEveryone = isDeskWide(user) || seesEveryTaRow(user);
  const visible = repo.refereeCalls(openingId)
    .filter((call) => seesEveryone || call.addedBy === user.id)
    .filter((call) => inWorkLocation(call, workLocationId));
  const today = workdayDate(Date.now());
  const days = [...new Set([today, ...visible.map((call) => call.date)])].sort((a, b) => b.localeCompare(a));
  const day = days.includes(sp.get("day") ?? "") ? sp.get("day")! : today;
  const nameOf = new Map(repo.users().map((u) => [u.id, u.name]));
  return answer(req, {
    ok: true,
    me: user.id,
    day,
    today,
    days,
    workLocationId: workLocationId ?? null,
    locations: (opening.workLocations ?? []).map((w) => ({ id: w.id, name: w.name })),
    calls: visible.filter((call) => call.date === day).sort((a, b) => a.createdAt - b.createdAt).map((c) => rowOf(c, nameOf)),
    canEdit: isTa(user) && workLocationId !== "" && day === today,
    showTa: seesEveryone,
  });
}

export async function POST(req: Request) {
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return signIn(req);
  const read = readUiBody(REFEREE_ACTIONS, await req.json().catch(() => null));
  if (!read.ok) return answer(req, read, 400);
  const form = new FormData();
  for (const [k, v] of read.fields) form.append(k, v);
  if (read.action === "result" && form.get("field") !== "result") return answer(req, { ok: false, message: "Choose Positive or Not successful." }, 400);
  try {
    // Both old actions answer as data already (each runs inline() itself).
    const r = read.action === "save" ? await saveRefereeCalls(form) : await updateRefereeCall(form);
    const nameOf = new Map(repo.users().map((u) => [u.id, u.name]));
    return answer(req, {
      ok: r.ok,
      message: r.message,
      ...("calls" in r && r.calls ? { calls: r.calls.map((c) => rowOf(c, nameOf)) } : {}),
      ...("call" in r && r.call ? { call: rowOf(r.call, nameOf) } : {}),
    });
  } catch (e) {
    if (isRedirectError(e)) return signIn(req);
    throw e;
  }
}
