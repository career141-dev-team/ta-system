/**
 * The new UI's TA Support Excel desk (R4, 21 Nov 2026): old /support-tables
 * ("Position review") through its own reads. Read only - nothing here writes.
 *
 * GET                       every position (title, client)
 * GET ?position=            that position's Excel Tables rows (supportTableRows, all of
 *                           them, newest first, at most 2,000) and the L counts by TA
 *                           (supportSheetCounts), as the old page reads them
 * GET ?position=&view=eod&date=&cursor=
 *                           the saved EOD emails for that day (ta/supportViews:eod,
 *                           8 at a time), with their saved copy while it is kept
 *
 * Who: tables.readAll, the old page's rule. The person's Clerk session token (Bearer),
 * read by Clerk like the old page's cookie. Only new.career141.com may call it.
 */
import { NextResponse } from "next/server";
import { primeStore } from "@/data/prime";
import { repo } from "@/data/store";
import { allows, isDeskWide } from "@/lib/auth";
import { convexActorForEmail, convexQuery } from "@/lib/convexServer";
import { DAILY_EMAIL_LABEL } from "@/lib/dailyEmail";
import { interestOf } from "@/lib/linkViews";
import { awaitingShortlist, movedBackToTables } from "@/lib/pipeline";
import { currentUser } from "@/lib/session";
import { rowApplication } from "@/lib/sharedLinks";
import type { SupportEodPage } from "@/lib/supportEod";
import { supportSheetCounts, supportTableRows } from "@/lib/supportTables";
import { supportRow } from "@/lib/uiSupport";
import { uiCors } from "@/lib/uiCors";
import { workdayDate } from "@/lib/workday";

export const dynamic = "force-dynamic";
const MAX_ROWS = 2000;

const cors = (req: Request) => uiCors(req.headers.get("origin"), "GET, OPTIONS");
const answer = (req: Request, body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors(req) });

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || !user.isActive) return answer(req, { ok: false, message: "Sign in to continue." }, 401);
  if (!allows(user, "tables.readAll")) return answer(req, { ok: false, message: "Only TA Support, TA leads and admins can read every position's tables." }, 403);
  const sp = new URL(req.url).searchParams;
  const positionId = sp.get("position") ?? "";
  await primeStore({});
  const clients = new Map(repo.clients().map((c) => [c.id, c.name]));
  if (!positionId) {
    const positions = repo.openings().slice().sort((a, b) => a.title.localeCompare(b.title))
      .map((o) => ({ id: o.id, title: o.title, client: clients.get(o.clientId) ?? "" }));
    return answer(req, { ok: true, positions });
  }
  const opening = repo.openings().find((o) => o.id === positionId);
  if (!opening) return answer(req, { ok: false, message: "That position is no longer here." }, 404);
  const users = repo.users();
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const names = (id: string) => nameOf.get(id) ?? "Unavailable user";

  if (sp.get("view") === "eod") {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("date") ?? "") ? sp.get("date")! : workdayDate(Date.now());
    try {
      const actor = await convexActorForEmail(user.email);
      if (!actor) throw new Error("no actor");
      const page = await convexQuery<SupportEodPage>("ta/supportViews:eod", { actorId: actor._id, jobId: opening.id, date, ...(sp.get("cursor") ? { cursor: sp.get("cursor") } : {}) });
      return answer(req, {
        ok: true, date, nextCursor: page.nextCursor,
        emails: page.emails.map((e) => ({
          id: e.id, ta: names(e.userId), date: e.date, status: DAILY_EMAIL_LABEL[e.status], revision: e.revision,
          location: e.workLocationName, subject: e.subject, html: e.html,
        })),
      });
    } catch {
      return answer(req, { ok: false, message: "Could not load the saved EOD emails. Try again in a minute." }, 503);
    }
  }

  // Only this position's detail is loaded, as the old page does.
  await primeStore({ openingId: opening.id });
  const vault = repo.linkVault(opening.id);
  const rows = supportTableRows(user, vault, { openingId: opening.id });
  const apps = repo.applications(opening.id);
  const deskWide = new Set(users.filter(isDeskWide).map((u) => u.id));
  const locations = new Map((opening.workLocations ?? []).map((l) => [l.id, l.name]));
  const sheets = users.flatMap((ta) => [undefined, ...(opening.workLocations ?? []).map((l) => l.id)]
    .flatMap((location) => repo.linkLevels(opening.id, ta.id, location).map((s) => ({ userId: ta.id, level: s.n, name: s.name, workLocationId: location }))));
  const sheetName = new Map(sheets.map((s) => [JSON.stringify([s.userId, s.level, s.workLocationId ?? ""]), s.name]));
  const now = Date.now();
  const out = rows.slice(0, MAX_ROWS).map((row) => {
    const found = row.candidateId ? apps.find((a) => a.candidateId === row.candidateId && (a.workLocationId ?? "") === (row.workLocationId ?? "")) : null;
    const onPipeline = found && !movedBackToTables(found) && !awaitingShortlist(found) ? found : null;
    const { app, takenBy } = rowApplication(row, onPipeline, (id) => deskWide.has(id));
    return supportRow(row, interestOf(row, app), names, {
      sheetName: row.level ? sheetName.get(JSON.stringify([row.addedBy, row.level, row.workLocationId ?? ""])) : undefined,
      location: row.workLocationId ? locations.get(row.workLocationId) : undefined,
      takenBy: takenBy ?? undefined,
    }, now);
  });
  const counts = supportSheetCounts(user, vault, sheets, opening.id, "", now).map((c) => ({
    ta: names(c.userId), taId: c.userId, sheet: c.level || null, name: c.name, location: c.workLocationId ? locations.get(c.workLocationId) : undefined,
    total: c.total, today: c.addedToday,
  }));
  return answer(req, {
    ok: true,
    position: { id: opening.id, title: opening.title, client: clients.get(opening.clientId) ?? "" },
    total: rows.length, rows: out, counts,
  });
}
