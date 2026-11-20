/**
 * The new UI's Excel Tables (D8a, 19 Nov): the rows and every button, through
 * the old app's own rules.
 *
 * GET ?opening=&location= gives the rows the old table would show this person
 * (scopeLinks: a TA their own plus what a lead put in; leads, ops, TA Support
 * everyone's), each with the same interest, pipeline and "taken by" answers the
 * old table works out, and the person's own L-sheets. POST { do, ...fields } runs
 * the old action for that button (src/lib/uiLinks.ts says which, with which of the
 * old form's fields) through inline(), so every rule stays in one place.
 *
 * Who is asking: the person's Clerk session token (Bearer), read by Clerk exactly
 * like the old page's cookie. Only new.career141.com may call it from a browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  addLeadNote, addLink, addLinkLevel, addLinksBulk, addLinksToPipeline, addLinkTaNote, addLinkToPipeline, assignSelectedWorkLocations,
  assignWorkLocation, chooseCv, decideCvMatch, deleteLink, deleteLinkLevel, extractLinkProfile, findCv, logOutreach, removeLeadNote,
  removeLinkTaNote, renameLinkLevel, restoreLinkLevel, setLinkInterest, toggleEyeMark, toggleLinkAddOn, updateLink,
} from "@/app/actions";
import { primeStore } from "@/data/prime";
import { LINK_LEVEL_UNDO_MS, repo } from "@/data/store";
import { STAGE_LABEL } from "@/data/types";
import { can, isDeskWide, seesEveryTaRow } from "@/lib/auth";
import { inline } from "@/lib/inlineResult";
import { interestOf } from "@/lib/linkViews";
import { awaitingShortlist, movedBackToTables } from "@/lib/pipeline";
import { currentUser } from "@/lib/session";
import { rowApplication } from "@/lib/sharedLinks";
import { redirectUrl } from "@/lib/uiDailyEmail";
import { INTEREST_WORD, readLinkBody, REDIRECTING, type LinkAction } from "@/lib/uiLinks";
import { uiCors } from "@/lib/uiCors";
import { scopeLinks } from "@/lib/visibility";
import { inWorkLocation, workLocationView } from "@/lib/workLocations";

export const dynamic = "force-dynamic";

const RUN: Record<LinkAction, (form: FormData) => Promise<unknown>> = {
  add: addLink, extract: extractLinkProfile, paste: addLinksBulk,
  addSheet: addLinkLevel, deleteSheet: deleteLinkLevel, restoreSheet: restoreLinkLevel, renameSheet: renameLinkLevel,
  eye: toggleEyeMark, addon: toggleLinkAddOn, interest: setLinkInterest, toPipeline: addLinkToPipeline, toPipelineMany: addLinksToPipeline,
  update: updateLink, log: logOutreach, remove: deleteLink, leadNote: addLeadNote, removeLeadNote, note: addLinkTaNote,
  removeNote: removeLinkTaNote, location: assignWorkLocation, locationMany: assignSelectedWorkLocations, cvMatch: decideCvMatch, chooseCv,
};

const cors = (req: Request) => uiCors(req.headers.get("origin"), "GET, POST, OPTIONS");
const answer = (req: Request, body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors(req) });
const signIn = (req: Request) => answer(req, { ok: false, message: "Sign in to continue." }, 401);

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function GET(req: NextRequest) {
  const openingId = req.nextUrl.searchParams.get("opening") ?? "";
  const user = await currentUser();
  if (!user) return signIn(req);
  await primeStore({ openingId });
  const opening = repo.opening(openingId);
  if (!opening) return answer(req, { ok: false, message: "That opening is no longer here." }, 404);
  // Who sees which rows is the old table's own rule (scopeLinks, below); the old page checks nothing more.

  // The same answers as the old table (components/LinkVaultTable.tsx).
  const users = repo.users();
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const deskWide = new Set(users.filter(isDeskWide).map((u) => u.id));
  const location = workLocationView(opening, req.nextUrl.searchParams.get("location") ?? undefined);
  const rows = scopeLinks(repo.linkVault(openingId), user, (id) => deskWide.has(id))
    .filter(({ row }) => inWorkLocation(row, location))
    .map(({ row: r }) => {
      const found = r.candidateId
        ? repo.applicationsForCandidate(r.candidateId).find((a) => a.openingId === openingId && inWorkLocation(a, r.workLocationId ?? ""))
        : undefined;
      const onPipeline = found && !movedBackToTables(found) && !awaitingShortlist(found) ? found : null;
      const { app, takenBy } = rowApplication(r, onPipeline, (id) => deskWide.has(id));
      const declined = [...(r.conversationLog ?? [])].reverse().find((l) => l.channel === "Not interested");
      return {
        id: r.id,
        sheet: r.level ?? null,
        name: r.name ?? r.capture?.fullName ?? null,
        title: r.title ?? r.capture?.currentTitle ?? null,
        company: r.company ?? r.capture?.currentCompany ?? null,
        url: r.linkedinUrl,
        phone: r.phoneNumber ?? null,
        phoneSource: r.phoneSource ?? null,
        interest: INTEREST_WORD[interestOf(r, app)] ?? "approach",
        why: declined?.note ?? null,
        eye: !!r.isEyeMarked,
        hasCv: r.cvMatch?.hasCv ?? !!r.candidateId,
        cvMatch: r.cvMatch && !r.cvMatch.decided ? { name: r.cvMatch.fullName, strength: r.cvMatch.strength, reasons: r.cvMatch.reasons } : null,
        addOn: !!r.isAddOn,
        pipeline: app ? STAGE_LABEL[app.stage as keyof typeof STAGE_LABEL] ?? app.stage : null,
        appId: app?.id ?? null,
        shortlistedBy: takenBy ? nameOf.get(takenBy) ?? "another TA" : null,
        addedBy: nameOf.get(r.addedBy) ?? "",
        mine: r.addedBy === user.id,
        // TA Support reads every TA's rows but changes only its own (old table, 9 Oct).
        readOnly: seesEveryTaRow(user) && r.addedBy !== user.id && !deskWide.has(r.addedBy),
        createdAt: r.createdAt,
        workLocationId: r.workLocationId ?? null,
        notes: (r.taNotes ?? []).map((n) => ({ id: n.id, note: n.note, mine: n.by === user.id })),
        leadNotes: (r.leadNotes ?? []).map((n) => ({ id: n.id, note: n.note, byRole: n.byRole, mine: n.by === user.id })),
        log: (r.conversationLog ?? []).slice(-20).map((l) => ({ at: l.at, channel: l.channel, note: l.note })),
      };
    });
  // The person's own L-sheets here, and one deleted in the last 10 minutes (Undo).
  const key = location || undefined;
  const sheets = repo.linkLevels(openingId, user.id, key).map((l) => ({ n: l.n, at: l.at, name: l.name ?? null }));
  const now = Date.now();
  const undo = repo.allLinkLevels(openingId, user.id, key).find((l) => l.deleted && l.deletedAt && now - l.deletedAt < LINK_LEVEL_UNDO_MS);
  return answer(req, {
    ok: true,
    rows,
    sheets,
    undo: undo ? { n: undo.n, name: undo.name ?? null } : null,
    locations: (opening.workLocations ?? []).map((w) => ({ id: w.id, name: w.name })),
    canNote: can(user, "link.note").ok,
    seesEveryone: isDeskWide(user) || seesEveryTaRow(user),
  });
}

export async function POST(req: Request) {
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return signIn(req);
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  // Find CV only reads: database people who may be this profile.
  if (raw?.do === "findCv") {
    if (typeof raw.openingId !== "string" || typeof raw.entryId !== "string") return answer(req, { ok: false, message: "Which profile is this? Reload and try again." }, 400);
    try {
      return answer(req, await findCv({ openingId: raw.openingId, entryId: raw.entryId }));
    } catch {
      return signIn(req);
    }
  }
  const read = readLinkBody(raw);
  if (!read.ok) return answer(req, read, 400);
  const form = new FormData();
  for (const [k, v] of read.fields) form.append(k, v);
  try {
    const r = await inline(() => RUN[read.action](form));
    return answer(req, { ok: r.ok, message: r.message });
  } catch (e) {
    const url = isRedirectError(e) ? redirectUrl((e as { digest?: unknown }).digest) : null;
    if (!url || url.startsWith("/signin")) return signIn(req);
    // The sheet actions go back to the old page; that is their "done".
    const msg = new URL(url, "https://x").searchParams.get("msg");
    return answer(req, REDIRECTING.has(read.action) ? { ok: true, message: msg || "Saved." } : { ok: !msg, message: msg || "Saved." });
  }
}
