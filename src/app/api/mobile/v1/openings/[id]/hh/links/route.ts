import { revalidatePath } from "next/cache";
import {
  addLeadNoteInline,
  addLinkInline,
  addLinkTaNoteInline,
  addLinkToPipelineInline,
  addLinksToPipeline,
  assignSelectedWorkLocations,
  decideCvMatchInline,
  deleteLinkInline,
  logOutreachInline,
  moveSelectedCandidates,
  removeLeadNoteInline,
  removeLinkTaNoteInline,
  setLinkInterestInline,
  toggleEyeMarkInline,
  toggleLinkAddOnInline,
  updateLinkInline,
} from "@/app/actions";
import { primeStore } from "@/data/prime";
import { repo } from "@/data/store";
import { primeEyeMarked } from "@/lib/eyeMarkedStore";
import { mobileExcelTables } from "@/lib/mobile/excelTables";
import { excelTablesWriteBody, parseBody } from "@/lib/mobile/openingsBodies";
import { ok, refuse, signedOut } from "@/lib/mobile/respond";
import { decideOn } from "@/lib/openings/writes";
import { inline, type ActionResult } from "@/lib/inlineResult";
import { currentUser } from "@/lib/session";
import { requireWorkLocation } from "@/lib/workLocations";
import { convexQuery } from "@/lib/convexServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await primeStore({ openingId: id });
  const user = await currentUser();
  if (!user) return signedOut();
  if (!repo.opening(id)) return refuse(404, "This opening is no longer available.");
  await primeEyeMarked(id, user);
  const location = new URL(req.url).searchParams.get("location") ?? undefined;
  const payload = mobileExcelTables(user, id, location);
  return payload ? ok(payload) : refuse(403, "You may not have access to Excel Tables for this opening.");
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await primeStore({ openingId: id });
  const user = await currentUser();
  if (!user) return signedOut();
  const parsed = parseBody(excelTablesWriteBody, await req.json().catch(() => null), "Check the Excel Tables update and try again.");
  if (!parsed.ok) return refuse(400, parsed.message);
  const body = parsed.value;
  const fd = new FormData();
  fd.set("openingId", id);
  for (const [key, value] of Object.entries(body)) {
    if (key === "action" || value === null || Array.isArray(value)) continue;
    fd.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }

  if (body.action === "add_level" || body.action === "rename_level" || body.action === "delete_level") {
    const allowed = await decideOn(user, "opening.sourcing", { openingId: id }, { convexQuery });
    if (!allowed.ok) return refuse(allowed.status, allowed.message);
    const opening = repo.opening(id);
    if (!opening) return refuse(404, "This opening is no longer available.");
    let location;
    try { location = requireWorkLocation(opening, body.workLocationId ?? ""); }
    catch (error) { return refuse(400, error instanceof Error ? error.message : "Select an active work location first."); }
    if (body.action === "add_level") {
      const level = repo.addLinkLevel(id, user.id, location?.id);
      refresh(id);
      return ok({ ok: true as const, message: `L${level} started.`, level });
    }
    if (body.action === "rename_level") {
      if (!repo.renameLinkLevel(id, user.id, body.level, body.name, location?.id)) return refuse(404, `L${body.level} is not one of yours here.`);
      refresh(id);
      return ok({ ok: true as const, message: body.name.trim() ? `Renamed L${body.level} to ${body.name.trim().slice(0, 40)}.` : `L${body.level} shows its date again.` });
    }
    const moved = repo.deleteLinkLevel(id, user.id, body.level, location?.id);
    if (moved === null) return refuse(404, `L${body.level} is not one of yours here.`);
    refresh(id);
    return ok({ ok: true as const, message: `Deleted L${body.level}. ${moved ? `${moved} ${moved === 1 ? "link is" : "links are"} now in Not in a sheet.` : "It had no links."}` });
  }

  let result: ActionResult;
  if (body.action === "add_link") result = await addLinkInline(null, fd);
  else if (body.action === "update_row") result = await updateLinkInline(null, fd);
  else if (body.action === "log_outreach") result = await logOutreachInline(null, fd);
  else if (body.action === "toggle_eye") result = await toggleEyeMarkInline(null, fd);
  else if (body.action === "toggle_add_on") result = await toggleLinkAddOnInline(null, fd);
  else if (body.action === "set_interest") result = await setLinkInterestInline(null, fd);
  else if (body.action === "add_to_pipeline") result = await addLinkToPipelineInline(null, fd);
  else if (body.action === "decide_cv_match") result = await decideCvMatchInline(null, fd);
  else if (body.action === "add_ta_note") result = await addLinkTaNoteInline(null, fd);
  else if (body.action === "remove_ta_note") result = await removeLinkTaNoteInline(null, fd);
  else if (body.action === "add_lead_note") result = await addLeadNoteInline(null, fd);
  else if (body.action === "remove_lead_note") result = await removeLeadNoteInline(null, fd);
  else if (body.action === "delete_row") result = await deleteLinkInline(null, fd);
  else if (body.action === "bulk_add_to_pipeline") {
    for (const entryId of body.entryIds) fd.append("entryId", entryId);
    result = await inline(() => addLinksToPipeline(fd));
  } else if (body.action === "bulk_move") {
    for (const entryId of body.entryIds) fd.append("entryId", entryId);
    result = await inline(() => moveSelectedCandidates(fd));
  } else {
    for (const entryId of body.entryIds) fd.append("entryId", entryId);
    fd.set("targetWorkLocationId", body.workLocationId);
    result = await inline(() => assignSelectedWorkLocations(fd));
  }
  return result.ok ? ok({ ok: true as const, message: result.message, ...(result.tone === "warn" ? { tone: "note" as const } : {}) }) : refuse(400, result.message);
}

function refresh(openingId: string) {
  revalidatePath(`/openings/${openingId}`, "layout");
  revalidatePath(`/openings/${openingId}/hh`, "layout");
  revalidatePath(`/openings/${openingId}/hh/links`);
}
