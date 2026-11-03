import { repo } from "@/data/store";
import { STAGE_LABEL, type User } from "@/data/types";
import { can, isDeskWide, seesEveryTaRow } from "@/lib/auth";
import { levelLabel } from "@/lib/linkViews";
import { mobileHeadhunting } from "@/lib/mobile/headhunting";
import type { ExcelTableRowPayload, ExcelTablesPayload } from "@/lib/mobile/excelTablesTypes";
import { movedBackToTables, awaitingShortlist } from "@/lib/pipeline";
import { rowApplication } from "@/lib/sharedLinks";
import { profileLink } from "@/lib/url";
import { scopeLinks } from "@/lib/visibility";
import { inWorkLocation, workLocationView } from "@/lib/workLocations";
import { interestOf } from "@/lib/linkViews";
import { newestFirst, noteByline } from "@/lib/leadNotes";
import { BULK_STAGES } from "@/lib/bulkStages";

/** The website's scoped Excel Tables rows, reshaped as mobile candidate cards. */
export function mobileExcelTables(user: User, openingId: string, requestedLocation?: string): ExcelTablesPayload | null {
  if (!mobileHeadhunting(user, openingId)) return null;
  const opening = repo.opening(openingId);
  const client = opening ? repo.client(opening.clientId) : null;
  if (!opening || !client) return null;

  let selected: string | undefined;
  try { selected = workLocationView(opening, requestedLocation); } catch { return null; }
  const users = repo.users();
  const names = Object.fromEntries(users.map((row) => [row.id, row.name]));
  const deskWide = new Set(users.filter(isDeskWide).map((row) => row.id));
  const scoped = scopeLinks(repo.linkVault(openingId), user, (id) => deskWide.has(id))
    .filter(({ row }) => inWorkLocation(row, selected));
  const seesEveryone = isDeskWide(user) || seesEveryTaRow(user);

  const rows: ExcelTableRowPayload[] = scoped.map(({ row }) => {
    const found = row.candidateId
      ? repo.applicationsForCandidate(row.candidateId).find((app) => app.openingId === openingId && inWorkLocation(app, row.workLocationId ?? ""))
      : undefined;
    const active = found && !movedBackToTables(found) && !awaitingShortlist(found) ? found : null;
    const linked = rowApplication(row, active, (id) => deskWide.has(id));
    const readOnly = seesEveryTaRow(user) && row.addedBy !== user.id && !deskWide.has(row.addedBy);
    const byName = (id: string) => names[id] ?? "Someone";
    return {
      id: row.id,
      name: row.name,
      guessedName: profileLink(row.linkedinUrl)?.guessedName ?? null,
      title: row.title,
      company: row.company,
      linkedinUrl: row.linkedinUrl,
      phoneNumber: row.phoneNumber,
      phoneSource: row.phoneSource,
      outcome: row.outcome,
      interest: interestOf(row, linked.app),
      isEyeMarked: row.isEyeMarked,
      isAddOn: Boolean(row.isAddOn),
      level: row.level ?? null,
      addedAt: row.createdAt,
      addedByName: byName(row.addedBy),
      readOnly,
      takenByName: linked.takenBy ? byName(linked.takenBy) : null,
      pipeline: linked.app ? { applicationId: linked.app.id, stage: linked.app.stage, stageLabel: STAGE_LABEL[linked.app.stage] ?? linked.app.stage } : null,
      cvMatch: row.cvMatch ? { fullName: row.cvMatch.fullName, strength: row.cvMatch.strength, hasCv: row.cvMatch.hasCv, reasons: row.cvMatch.reasons } : null,
      conversation: [...row.conversationLog].sort((a, b) => b.at - a.at).map((item) => ({ ...item, byName: byName(item.by) })),
      taNotes: [...(row.taNotes ?? [])].sort((a, b) => b.at - a.at).map((item) => ({ ...item, byName: byName(item.by), canRemove: item.by === user.id || isDeskWide(user) })),
      leadNotes: newestFirst(row.leadNotes).map((item) => {
        const byline = noteByline(item, names);
        return { id: item.id, at: item.at, note: item.note, byline: `${byline.role} · ${byline.name}`, canRemove: item.by === user.id };
      }),
    };
  });

  const ownRows = scoped.map(({ row }) => row).filter((row) => row.addedBy === user.id);
  const locationKey = selected || undefined;
  const sheets = repo.linkLevels(openingId, user.id, locationKey).map((level) => ({
    n: level.n,
    label: levelLabel(level),
    name: level.name ?? "",
    count: ownRows.filter((row) => row.level === level.n).length,
    canManage: true,
  }));
  const target = repo.latestLinkLevel(openingId, user.id, locationKey);
  const adders = [...new Set(scoped.map(({ row }) => row.addedBy))].map((id) => ({
    id, name: id === user.id ? "Me" : byName(names, id), count: scoped.filter(({ row }) => row.addedBy === id).length,
  }));
  const count = (interest: ExcelTableRowPayload["interest"]) => rows.filter((row) => row.interest === interest).length;
  return {
    apiVersion: 1,
    context: { openingId, title: opening.title, clientName: client.name },
    permissions: {
      canAdd: can(user, "opening.sourcing", { openingId, assignment: repo.assignmentFor(openingId, user.id) ?? null }).ok && selected !== "",
      canLeadNote: can(user, "link.note").ok,
      canUploadCv: can(user, "opening.act", { openingId, assignment: repo.assignmentFor(openingId, user.id) ?? null }).ok && selected !== "",
      canExport: rows.length > 0,
    },
    locations: (opening.workLocations ?? []).map((row) => ({ id: row.id, name: row.name, archived: Boolean(row.archived) })),
    bulkStages: BULK_STAGES.map((stage) => ({ stage, label: STAGE_LABEL[stage] })),
    selectedLocationId: selected === undefined ? null : selected,
    addingTo: target ? `Adding to ${levelLabel(target)}` : `Adding to a new L${repo.nextLinkLevel(openingId, user.id, locationKey)}`,
    sheets,
    adders,
    counts: { all: rows.length, pending: count("pending"), interested: count("interested"), notInterested: count("not_interested"), eyeMarked: rows.filter((row) => row.isEyeMarked).length, addOns: rows.filter((row) => row.isAddOn).length },
    rows,
  };
}

function byName(names: Record<string, string>, id: string): string {
  return names[id] ?? "Someone";
}
