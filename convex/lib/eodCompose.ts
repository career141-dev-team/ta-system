// convex/lib/eodCompose.ts
//
// The Midday / End of day email as the backend builds it (19 Nov, D5 step 1).
// Until now only the Next server could build the email (src/lib/eod.ts reads the
// in-memory desk). The new UI has no server, and the send must never take an
// email's rows or recipients from a browser, so the backend builds them here with
// the same helpers the old app uses (shortlistRowFor, effortBucket, subjectLine,
// eodRecipients - all in src/lib, shared).
//
// `eligibleApplications` is THE roster rule: ta/dailyEmails:begin calls it too, so
// what the screen shows and what the send accepts cannot drift apart (the 17 Nov
// "The candidate list changed" fault was two copies of this rule).

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isEodCandidateEligible } from "../../src/lib/eodEligibility";
import { inWorkLocation } from "../../src/lib/workLocations";
import { workdayDate } from "../../src/lib/workday";
import { colomboDayStart } from "../../src/lib/calendar";
import { effortBucket, headhuntedCandidates, type EffortBucket } from "../../src/lib/cvSource";
import { eodRecipients, shortlistRowFor, subjectLine, type EffortRow, type ShortlistRow } from "../../src/lib/eod-format";
import { DEFAULT_SHORTLIST_INBOX } from "../../src/lib/routing";
import { workingStageKey } from "../../src/lib/workingStage";
import { mapApplication, mapCandidateDoc } from "../../src/data/convex/map";
import { projectApplication } from "../ta/model/projections";

type Ctx = QueryCtx | MutationCtx;
type WorkType = "100%" | "Follow-up" | "Add-on";

/**
 * The people this TA's Director email is about: in Director Review, theirs, moved
 * on the day, not already sent (a Director round or an accepted email), in the
 * work location. Exactly the rule begin enforces.
 */
export async function eligibleApplications(
  ctx: Ctx,
  o: { jobId: Id<"jobs">; userId: Id<"users">; worker: boolean; locationId?: string | null; workType: WorkType; sessionStart: number | null | undefined; day: string },
): Promise<Doc<"applications">[]> {
  const rounds = await ctx.db.query("reviewRounds").withIndex("by_opening", (q) => q.eq("openingId", o.jobId)).collect();
  const sent = new Set<string>(rounds.filter((r) => r.kind === "director" && !r.recoveryReopenedAt).flatMap((r) => r.applicationIds));
  const mine = await ctx.db.query("dailyEmails").withIndex("by_user_job_date", (q) => q.eq("userId", o.userId).eq("jobId", o.jobId)).collect();
  for (const e of mine.filter((e) => e.status === "accepted" && !e.recoveryReopenedAt)) for (const id of e.applicationIds) sent.add(id);
  // Only Director Review can be eligible (isEodCandidateEligible; Convex stores it as
  // second_shortlist), so only that stage is read - same rows, same order. 19 Nov:
  // the whole opening's applications were read here, twice per compose (1.9 s).
  const apps = await ctx.db.query("applications").withIndex("by_job_stage", (q) => q.eq("jobId", o.jobId).eq("currentStage", "second_shortlist")).collect();
  return apps.filter(
    (a) =>
      inWorkLocation(a, o.locationId ?? "") &&
      !sent.has(a._id) &&
      isEodCandidateEligible(
        { stage: a.currentStage, ownerTaId: a.ownerTaId, isAddOn: a.isAddOn, lastStageChangedAt: a.lastStageChangedAt },
        { taId: o.worker ? o.userId : null, workType: o.workType, sessionStart: o.sessionStart ?? null, day: o.day },
      ),
  );
}

const asApp = (d: Doc<"applications">) => mapApplication(projectApplication(d) as never);

/** Table 1: one line per person, in set order (src/lib/eod.ts shortlistRows). */
export async function shortlistRows(ctx: Ctx, apps: Doc<"applications">[]): Promise<ShortlistRow[]> {
  const sorted = [...apps].sort((a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0));
  const out: ShortlistRow[] = [];
  for (const a of sorted) {
    const c = await ctx.db.get(a.candidateId);
    if (c) out.push(shortlistRowFor(asApp(a), mapCandidateDoc(c as never), out.length + 1));
  }
  return out;
}

/** The TA's working stage on the opening (repo.workingStage). */
async function workingStage(ctx: Ctx, jobId: Id<"jobs">, userId: Id<"users">): Promise<WorkType> {
  const a = await ctx.db
    .query("jobAssignments")
    .withIndex("by_jobId_userId", (q) => q.eq("jobId", jobId).eq("userId", userId))
    .filter((q) => q.eq(q.field("isActive"), true))
    .first();
  if (a) return (a.workingStage as WorkType | undefined) ?? "100%";
  const held = await ctx.db.query("taSettings").withIndex("by_key", (q) => q.eq("key", workingStageKey(jobId, userId))).first();
  return held && ["100%", "Follow-up", "Add-on"].includes(held.value) ? (held.value as WorkType) : "100%";
}

/** Table 2: the L-sheet line for the day (src/lib/eod.ts effortRow, same rules). */
export async function effortRow(
  ctx: Ctx,
  o: { jobId: Id<"jobs">; user: Doc<"users">; locationId?: string | null; at: number; onlyIds?: Id<"applications">[] },
): Promise<EffortRow> {
  const since = colomboDayStart(o.at);
  const until = o.onlyIds ? since + 86_400_000 : Infinity;
  const me = o.user._id as string;
  const vault = (await ctx.db.query("linkVault").withIndex("by_opening", (q) => q.eq("openingId", o.jobId)).collect()).filter((r) =>
    inWorkLocation(r, o.locationId ?? ""),
  );
  let day: Doc<"applications">[];
  if (o.onlyIds) {
    day = (await Promise.all(o.onlyIds.map((id) => ctx.db.get(id)))).filter((a): a is Doc<"applications"> => !!a);
  } else {
    // sentToDirectorToday: today's Director rounds by this TA, plus who is waiting tonight.
    const rounds = await ctx.db.query("reviewRounds").withIndex("by_opening", (q) => q.eq("openingId", o.jobId)).collect();
    const ids = new Set<string>(rounds.filter((r) => r.kind === "director" && (r.sentBy as string) === me && r.sentAt >= since && !r.recoveryReopenedAt).flatMap((r) => r.applicationIds));
    const waiting = await eligibleApplications(ctx, { jobId: o.jobId, userId: o.user._id, worker: true, locationId: o.locationId, workType: "100%", sessionStart: null, day: workdayDate(o.at) });
    for (const a of waiting) ids.add(a._id);
    day = (await Promise.all([...ids].map((id) => ctx.db.get(id as Id<"applications">)))).filter(
      (a): a is Doc<"applications"> => !!a && a.jobId === o.jobId && inWorkLocation(a, o.locationId ?? ""),
    );
  }
  const scouted = vault.filter(
    (v) =>
      ((v.addedBy as string) === me && v.createdAt >= since && v.createdAt < until) ||
      ((v.addedBy as string) === me && (v.outcomeAt ?? 0) >= since && (v.outcomeAt ?? 0) < until) ||
      v.conversationLog.some((l) => (l.by as string) === me && l.at >= since && l.at < until),
  ).length;
  const headhunted = headhuntedCandidates(vault.map((v) => ({ candidateId: (v.candidateId ?? null) as string | null })) as never);
  const count: Record<EffortBucket, number> = { backUp: 0, addOns: 0, scoop: 0, da: 0, post: 0, l: 0 };
  for (const a of day) {
    const b = effortBucket(asApp(a), headhunted);
    if (b) count[b]++;
  }
  const kind = await workingStage(ctx, o.jobId, o.user._id);
  // The set this TA's latest CV went into.
  // Their own candidates only (job + owner index), not the whole opening (19 Nov).
  const mine = await ctx.db.query("applications").withIndex("by_workday_owner", (q) => q.eq("jobId", o.jobId).eq("ownerTaId", o.user._id)).collect();
  const sets = mine.filter((a) => typeof a.setNumber === "number").map((a) => a.setNumber as number);
  return {
    date: new Date(o.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Colombo" }),
    assignee: o.user.fullName,
    hundredOrFollowUp: kind,
    lEffort: kind === "Follow-up" ? day.length : scouted,
    sets: sets.length ? Math.max(...sets) : null,
    da: count.da,
    scoop: count.scoop || null,
    l: count.l,
    post: count.post,
    addOns: count.addOns || null,
    backUp: count.backUp || null,
  };
}

/** The inbox that watches for the Director's reply (repo.shortlistInbox). */
export async function shortlistInbox(ctx: Ctx): Promise<string> {
  const row = await ctx.db.query("taSettings").withIndex("by_key", (q) => q.eq("key", "shortlistInbox")).first();
  return row?.value ?? DEFAULT_SHORTLIST_INBOX;
}

/**
 * To and Cc: joborders@, the desk's copies and the shortlist inbox, less what the
 * TA took off, plus what they added (eodRecipients, the old send's own rule).
 */
export async function recipients(ctx: Ctx, edits: { removed?: string[]; extraTo?: string[]; extraCc?: string[] } = {}): Promise<{ to: string[]; cc: string[] }> {
  return eodRecipients({ removed: edits.removed ?? [], extraTo: edits.extraTo ?? [], extraCc: edits.extraCc ?? [], shortlistInbox: await shortlistInbox(ctx) });
}

/** To and Cc before the TA changes them. */
export const defaultRecipients = (ctx: Ctx) => recipients(ctx);

/** "SET 1 - CLIENT - TITLE - 3 CVs", or "... - DAILY ACTIVITY" with nobody (the eod page's default). */
export function defaultSubject(job: Doc<"jobs">, locationName: string | null, rows: ShortlistRow[], setNumber: number | string | null): string {
  const title = `${job.title}${locationName ? ` - ${locationName}` : ""}`;
  if (!rows.length) return `${job.clientName.toUpperCase()} - ${title.toUpperCase()} - DAILY ACTIVITY`;
  return subjectLine(job.clientName, title, typeof setNumber === "number" ? setNumber : Number(setNumber) || 1, rows.length);
}
