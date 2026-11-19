import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireActor, assertJobAccess } from "./guard";
import { mapUser } from "../../src/data/convex/map";
import { workdayDate } from "../../src/lib/workday";
import { workSessionStart } from "../../src/lib/workdayRequirements";
import { dailySendProblem, sameCandidateList, EMAIL_RETENTION_MS, MISSED_EOD_DAYS, type DailyEmailSnapshot } from "../../src/lib/dailyEmail";
import { validateResearchLink, checkResearchSubmission, scoopsOnly } from "../../src/lib/eod-format";
import { dailyEmailsFor, finalizeDailyEmail, middayRequired } from "../lib/dailyEmail";
import { defaultRecipients, defaultSubject, effortRow, eligibleApplications, shortlistRows } from "../lib/eodCompose";
import { requiredChecks } from "../lib/workdayChecks";
import { refreshWorkdayChecks } from "./workdays";
import { requireWorkLocation, inWorkLocation } from "../../src/lib/workLocations";
import { activeWorkLocationIds } from "../../src/lib/workLocations";

type Ctx = QueryCtx | MutationCtx;
const submissionType = v.union(v.literal("midday"), v.literal("eod"));
const fields = v.record(v.string(), v.string());
const worker = (u: Doc<"users">) => ["ta", "ta_support"].includes(mapUser(u).role);

async function access(ctx: Ctx, actorId: string, jobId: Id<"jobs">, readOnly = false) {
  const user = await requireActor(ctx, actorId);
  const role = mapUser(user).role;
  if (!["ta", "ta_support", "ta_lead", "director", "admin", "ops", ...(readOnly ? ["viewer"] : [])].includes(role)) throw new Error("You cannot access recruitment emails.");
  if (!["admin", "ta_lead", "director", "ops"].includes(role)) await assertJobAccess(ctx, user, jobId, ["primary_recruiter", "supporting_recruiter", "ta_lead", "director"]);
  const job = await ctx.db.get(jobId);
  if (!job) throw new Error("This opening no longer exists.");
  return user;
}

async function workday(ctx: Ctx, user: Doc<"users">, jobId: Id<"jobs">) {
  const days = await ctx.db.query("taWorkdays").withIndex("by_user", q => q.eq("userId", user._id)).collect();
  const day = days.find(d => d.date === workdayDate(Date.now()) && (d.finishedAt === undefined || d.closureReason === "eod"));
  if (worker(user) && (!day || day.date !== workdayDate(Date.now()) || !day.jobs.some(j => j.jobId === jobId)))
    throw new Error("Start today's workday and add this opening before sending.");
  return day?.date === workdayDate(Date.now()) && day.jobs.some(j => j.jobId === jobId) ? day : null;
}

/** "The candidate list changed" with the names (17 Nov): it named nobody, so a desk dropped out,
 *  rejected and deleted the one candidate they had touched, again and again, while another blocked it. */
async function listChanged(ctx: Ctx, onPage: readonly Id<"applications">[], ready: readonly Id<"applications">[]) {
  const name = async (id: Id<"applications">) => {
    const app = await ctx.db.get(id);
    const person = app ? await ctx.db.get(app.candidateId) : null;
    return person?.fullName?.trim() || "a candidate";
  };
  const say = async (ids: Id<"applications">[], what: string) =>
    ids.length ? `${(await Promise.all(ids.map(name))).join(", ")} ${ids.length === 1 ? "is" : "are"} ${what}` : "";
  const parts = [
    await say(ready.filter(id => !onPage.includes(id)), "ready to send but not on your page"),
    await say(onPage.filter(id => !ready.includes(id)), "on your page but no longer ready to send"),
  ].filter(Boolean);
  return `The candidate list changed${parts.length ? `: ${parts.join("; ")}` : ""}. Reload, review the updated list and send again.`;
}

export const saveAttachment = internalMutation({
  args: { actorId: v.string(), jobId: v.id("jobs"), applicationId: v.id("applications"), storageId: v.id("_storage"), name: v.string() },
  handler: async (ctx, args) => {
    const user = await access(ctx, args.actorId, args.jobId);
    const app = await ctx.db.get(args.applicationId);
    if (!app || app.jobId !== args.jobId || (worker(user) && app.ownerTaId !== user._id)) throw new Error("This attachment is not on your position.");
    return ctx.db.insert("dailyEmailAttachments", { userId: user._id, jobId: args.jobId, applicationId: args.applicationId,
      storageId: args.storageId, name: args.name, createdAt: Date.now(), expiresAt: Date.now() + EMAIL_RETENTION_MS });
  },
});

/** The send action reads the saved CV files itself: a 5 MB set passed as action arguments never got a result (30 Oct). */
export const storedFiles = internalQuery({
  args: { ids: v.array(v.id("dailyEmailAttachments")) },
  handler: async (ctx, args) => {
    const files = [];
    for (const id of args.ids) {
      const f = await ctx.db.get(id);
      if (!f) throw new Error("A saved CV attachment is missing.");
      files.push({ name: f.name, storageId: f.storageId });
    }
    return files;
  },
});

export const attachment = internalQuery({
  args: { actorId: v.string(), emailId: v.id("dailyEmails"), attachmentId: v.id("dailyEmailAttachments") },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email) throw new Error("Email not found.");
    const user = await access(ctx, args.actorId, email.jobId, true);
    if (worker(user) && email.userId !== user._id) throw new Error("This email belongs to another TA.");
    const snapshot = email.snapshot as DailyEmailSnapshot | undefined;
    if (!snapshot || !email.expiresAt || email.expiresAt <= Date.now() || !snapshot.attachments?.some(a => a.id === args.attachmentId)) throw new Error("This attachment is no longer retained.");
    const file = await ctx.db.get(args.attachmentId);
    if (!file || file.userId !== email.userId || file.jobId !== email.jobId) throw new Error("Attachment not found.");
    return { url: await ctx.storage.getUrl(file.storageId), name: file.name };
  },
});

/** Metadata only: the sidebar does not fetch every rendered email or PDF. */
export const sent = internalQuery({
  args: { actorId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireActor(ctx, args.actorId);
    const emails = await ctx.db.query("dailyEmails").withIndex("by_user_accepted", q => q.eq("userId", user._id).gte("acceptedAt", Date.now() - EMAIL_RETENTION_MS)).collect();
    const saved = await Promise.all(emails.filter(e => e.submissionType === "eod" && e.status === "accepted" && e.finalizedAt && e.snapshot && (e.expiresAt ?? 0) > Date.now()).map(async e => ({
      id: e._id, rootId: e.parentId ?? e._id, jobId: e.jobId, title: (await ctx.db.get(e.jobId))?.title ?? "Unavailable position",
      date: e.date, sentAt: e.acceptedAt!, workType: e.workType ?? e.snapshot.workType, subject: e.snapshot.subject,
      to: e.snapshot.to, cc: e.snapshot.cc, revised: !!e.parentId,
    })));
    const legacy = await ctx.db.query("eodEmailCopies").withIndex("by_expires", q => q.gte("expiresAt", Date.now())).collect();
    const adopted = new Set(emails.map(e => e.legacyCopyId));
    return [...saved, ...await Promise.all(legacy.filter(e => e.sentBy === user._id && e.sentAt >= Date.now() - EMAIL_RETENTION_MS && !adopted.has(e._id)).map(async e => ({
      id: e._id, rootId: e.roundId, jobId: e.openingId, title: (await ctx.db.get(e.openingId))?.title ?? "Unavailable position",
      date: workdayDate(e.sentAt), sentAt: e.sentAt, workType: e.effort?.hundredOrFollowUp,
      subject: e.subject, to: e.to, cc: e.cc, revised: e.version > 1, legacy: true,
    })))];
  },
});

export const list = internalQuery({
  args: { actorId: v.string(), jobId: v.id("jobs"),
    /**
     * The new UI (ui/email:emails, 19 Nov): the last 31 days only, read by date,
     * and without the sent HTML and draft fields it never shows. Every email the
     * opening ever had, each with its whole HTML, was 2.8 s and 81 KB a read.
     */
    recent: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await access(ctx, args.actorId, args.jobId, true);
    const since = workdayDate(Date.now() - 31 * 86400000);
    const rows = args.recent
      ? await ctx.db.query("dailyEmails").withIndex("by_job_date", q => q.eq("jobId", args.jobId).gte("date", since)).collect()
      : await ctx.db.query("dailyEmails").withIndex("by_job", q => q.eq("jobId", args.jobId)).collect();
    return rows.filter(e => !worker(user) || e.userId === user._id).map(e =>
      e.expiresAt && e.expiresAt <= Date.now() ? { ...e, fields: {}, snapshot: undefined }
        : args.recent ? { ...e, fields: {}, snapshot: e.snapshot ? { ...(e.snapshot as DailyEmailSnapshot), html: "" } : undefined }
        : e);
  },
});

export const createDraft = internalMutation({
  args: { actorId: v.string(), jobId: v.id("jobs"), workLocationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await access(ctx, args.actorId, args.jobId);
    await workday(ctx, user, args.jobId);
    const location = requireWorkLocation((await ctx.db.get(args.jobId))!, args.workLocationId);
    const date = workdayDate(Date.now());
    const emails = (await dailyEmailsFor(ctx, user._id, args.jobId, date)).filter(e => inWorkLocation(e, location?.id ?? ""));
    const problem = dailySendProblem(emails, "midday", false);
    if (problem) throw new Error(problem);
    return ctx.db.insert("dailyEmails", { jobId: args.jobId, userId: user._id, date,
      workLocationId: location?.id, workLocationName: location?.name,
      submissionType: "midday", number: Math.max(0, ...emails.filter(e => e.submissionType === "midday").map(e => e.number)) + 1,
      revision: 0, status: "draft", fields: {}, applicationIds: [], createdAt: Date.now(), expiresAt: Date.now() + 31 * 86400000 });
  },
});

export const saveDraft = internalMutation({
  args: { actorId: v.string(), id: v.id("dailyEmails"), revision: v.number(), fields },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.id);
    if (!email) throw new Error("That draft no longer exists.");
    const user = await access(ctx, args.actorId, email.jobId);
    if (email.userId !== user._id || !["draft", "failed"].includes(email.status)) throw new Error("Only your unsent drafts can be edited.");
    if (email.date !== workdayDate(Date.now())) throw new Error("This draft belongs to a previous day. Start today's email.");
    if (email.revision !== args.revision) throw new Error("This draft changed in another tab. Reload before editing it.");
    if (JSON.stringify(args.fields).length > 250000) throw new Error("This draft is too large to save.");
    await ctx.db.patch(email._id, { fields: args.fields, revision: email.revision + 1 });
    return { revision: email.revision + 1 };
  },
});

export const begin = internalMutation({
  args: { actorId: v.string(), jobId: v.id("jobs"), submissionType,
    workLocationId: v.optional(v.string()),
    draftId: v.optional(v.id("dailyEmails")), revision: v.optional(v.number()), parentId: v.optional(v.id("dailyEmails")),
    forDate: v.optional(v.string()),
    applicationIds: v.array(v.id("applications")), snapshot: v.any(), confirmed: v.boolean(), previewConfirmed: v.optional(v.boolean()), trackedAt: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await access(ctx, args.actorId, args.jobId);
    const job = (await ctx.db.get(args.jobId))!;
    const source = args.parentId ? await ctx.db.get(args.parentId) : null;
    if (args.parentId && (!source || source.userId !== user._id || source.jobId !== args.jobId || source.submissionType !== "eod" || args.submissionType !== "eod" || source.status !== "accepted" || !source.snapshot || (source.expiresAt ?? 0) <= Date.now()))
      throw new Error("Only your retained EOD emails can be corrected.");
    const parent = source;
    const location = parent ? job.workLocations?.find(l => l.id === parent.workLocationId) : requireWorkLocation(job, args.workLocationId);
    const locationId = parent ? parent.workLocationId : location?.id;
    if (parent && args.workLocationId !== parent.workLocationId) throw new Error("A correction must keep its original work location.");
    if (parent && !args.previewConfirmed) throw new Error("Review and confirm the revised email preview before sending.");
    // A missed end of day (30 Oct): a past day's candidates sent today. Like a correction it needs no
    // workday and no Today's Checks — those belong to a day that is over — but it keeps the link tick.
    const late = args.forDate;
    if (late && (parent || args.submissionType !== "eod" || !args.applicationIds.length || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(late)
      || late >= workdayDate(Date.now()) || late < workdayDate(Date.now() - MISSED_EOD_DAYS * 86400000)))
      throw new Error("That end of day can no longer be sent late.");
    const day = parent || late ? null : await workday(ctx, user, args.jobId);
    const workEntry = day?.jobs.find(j => j.jobId === args.jobId);
    if (workEntry && location) {
      if (workEntry.workLocationIds?.length && !workEntry.workLocationIds.includes(location.id)) throw new Error("This location was added after today's work started. Its daily emails begin tomorrow.");
      if (!workEntry.workLocationIds?.length) await ctx.db.patch(day!._id, { jobs: day!.jobs.map(j => j.jobId === args.jobId ? { ...j, workLocationIds: activeWorkLocationIds(job) } : j) });
    }
    const setup = day && args.submissionType === "eod" ? await requiredChecks(ctx, day, day.jobs.find(j => j.jobId === args.jobId)!) : null;
    const date = workdayDate(Date.now());
    // A late email sent today must not count as today's own end of day.
    const emails = (await dailyEmailsFor(ctx, user._id, args.jobId, date)).filter(e => inWorkLocation(e, locationId ?? "") && !e.forDate);
    // Pending sends on older dates also hold the opening until reconciled — this TA's own: with
    // two TAs on one job, Priya's stuck email blocked Sameera's EOD with no email of his (28 Oct).
    const all = await ctx.db.query("dailyEmails").withIndex("by_user_job_date", q => q.eq("userId", user._id).eq("jobId", args.jobId)).collect();
    // An email from before the job had locations holds only a job without them.
    if (all.some(e => (e.workLocationId ? e.workLocationId === locationId : !locationId) && (e.status === "sending" || e.status === "uncertain" || e.status === "accepted" && !e.finalizedAt))) throw new Error("Your earlier email on this location is still sending or needs reconciliation. Ask your TA Lead to check it in Today's Checks before you send again.");
    const problem = dailySendProblem(emails, args.submissionType, worker(user) && await middayRequired(ctx, date), !!parent || !!late);
    if (problem) throw new Error(problem);
    const snapshot = args.snapshot as DailyEmailSnapshot;
    for (const id of snapshot.workbookLinkIds ?? []) {
      const row = await ctx.db.get(id as Id<"linkVault">);
      if (!row || row.openingId !== args.jobId || !inWorkLocation(row, locationId ?? "")) throw new Error("A workbook row changed location. Reload and review the email before sending.");
    }
    const entry = day?.jobs.find(j => j.jobId === args.jobId);
    const selectedMode = parent?.workType ?? parent?.snapshot?.workType ?? entry?.workType ?? "100%";
    if (snapshot.workType && snapshot.workType !== selectedMode) throw new Error("The work type changed. Reload and review the email before sending.");
    snapshot.workType = selectedMode;
    for (const a of snapshot.attachments ?? []) {
      const file = await ctx.db.get(a.id as Id<"dailyEmailAttachments">);
      if (!file || file.userId !== user._id || file.jobId !== args.jobId || file.applicationId !== a.applicationId || !args.applicationIds.includes(file.applicationId)) throw new Error("The saved CV attachment does not belong to this email.");
    }
    const link = validateResearchLink(snapshot.researchLink);
    // Every candidate a scoop: no ChatGPT link asked for (owner, 17 Nov). Read from the rows, not the caller.
    const scoops = scoopsOnly(await Promise.all(args.applicationIds.map(id => ctx.db.get(id))));
    if (args.submissionType === "midday") {
      if (!scoops && (!link.ok || !args.confirmed)) throw new Error(link.ok ? "Confirm your ChatGPT link before sending." : link.reason);
    } else {
      const check = checkResearchSubmission({ role: mapUser(user).role, kind: "director", link: snapshot.researchLink, confirmed: args.confirmed,
        excused: !!setup?.eodChecks.find(c => c.key.startsWith("chatgpt:"))?.exception, scoopsOnly: scoops });
      if (!check.ok) throw new Error(check.reason);
    }
    if (!sameCandidateList(snapshot.rows.map(r => r.applicationId), args.applicationIds)) throw new Error("The email preview does not match its candidate list. Reload before sending.");
    if (!snapshot.subject.trim() || !snapshot.to.length) throw new Error("Add a subject and a recipient.");
    if (parent) {
      if (!sameCandidateList(parent.applicationIds, args.applicationIds) || !parent.applicationIds.every((id, i) => id === args.applicationIds[i])) throw new Error("A correction must keep the original candidates and their order.");
    } else {
      const entry = day?.jobs.find(j => j.jobId === args.jobId);
      const currentWorkType = entry?.workType ?? "100%";
      const sessionStart = entry ? workSessionStart(entry) : null;
      // Midday and EOD use the page's one rule (17 Nov). Midday used to take every unsent Director
      // Review CV from any day while the page lists only today's, so one older CV - usually a missed
      // end of day - refused every midday send for good, and no reload or drop-out could clear it.
      // One function since 19 Nov (convex/lib/eodCompose.ts): the new UI's email is built from it too.
      const eligible = await eligibleApplications(ctx, { jobId: args.jobId, userId: user._id, worker: worker(user), locationId, workType: currentWorkType, sessionStart, day: late ?? date });
      if (!sameCandidateList(args.applicationIds, eligible.map(a => a._id))) throw new Error(await listChanged(ctx, args.applicationIds, eligible.map(a => a._id)));
      if (day && args.submissionType === "eod") {
        const blockers = setup!.eodChecks.filter(c => !["director_cv", "chatgpt", "midday_email"].includes(c.key.split(":")[0]) && c.status !== "complete" && !c.exception);
        if (blockers.length) throw new Error(`Complete Today's Checks: ${blockers.map(c => c.label).join("; ")}`);
      }
    }
    // A legacy send still in flight must not be bypassed through the new UI.
    if (day) {
      const receipts = await ctx.db.query("taWorkdayMail").withIndex("by_workday_job", q => q.eq("workdayId", day._id).eq("jobId", args.jobId)).collect();
      if (receipts.some(r => (!r.workLocationId || r.workLocationId === locationId) && (["sending", "uncertain"].includes(r.status) || (r.status === "accepted" && !r.finalizedAt)))) throw new Error("An earlier email needs reconciliation before sending.");
      if (!parent && receipts.some(r => inWorkLocation(r, locationId ?? "") && r.status === "accepted" && !r.revised && !r.recoveryReopenedAt && (r.submissionType ?? "eod") === "eod")) throw new Error("The end-of-day email has already been sent today for this location.");
    }
    const draft = args.draftId ? await ctx.db.get(args.draftId) : null;
    if (args.draftId && args.submissionType !== "midday") throw new Error("Only a midday email can use this draft.");
    if (args.submissionType === "midday" && (!draft || !inWorkLocation(draft, locationId ?? "") || draft.submissionType !== "midday" || draft.userId !== user._id || draft.jobId !== args.jobId || draft.date !== date || !["draft", "failed"].includes(draft.status) || draft.revision !== args.revision))
      throw new Error("This midday draft changed. Reload it before sending.");
    const now = Date.now();
    const payload = { status: "sending" as const, startedAt: now, snapshot, applicationIds: args.applicationIds,
      trackedAt: args.trackedAt, workType: selectedMode, expiresAt: now + EMAIL_RETENTION_MS };
    const id = draft ? draft._id : await ctx.db.insert("dailyEmails", { jobId: args.jobId, userId: user._id, date: parent?.date ?? date,
      workLocationId: locationId, workLocationName: parent?.workLocationName ?? location?.name,
      submissionType: "eod", number: 1, revision: 0, fields: {}, createdAt: now,
      ...(late ?? parent?.forDate ? { forDate: late ?? parent!.forDate } : {}),
      ...(parent ? { parentId: parent.parentId ?? parent._id } : {}), ...payload });
    if (draft) await ctx.db.patch(id, { ...payload, revision: draft.revision + 1 });
    if (day) {
      const receiptId = await ctx.db.insert("taWorkdayMail", { workdayId: day._id, userId: user._id, jobId: args.jobId,
        workLocationId: locationId,
        dailyEmailId: id, submissionType: args.submissionType, applicationIds: args.applicationIds,
        workType: selectedMode,
        status: "sending", startedAt: now, subject: snapshot.subject, sentTo: snapshot.to[0], researchLink: snapshot.researchLink });
      await ctx.db.patch(id, { receiptId });
    }
    return { id };
  },
});

export const reconcile = internalMutation({
  args: { actorId: v.string(), id: v.id("dailyEmails"), accepted: v.boolean(), reason: v.string() },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.id);
    if (!email) throw new Error("That email no longer exists.");
    const lead = await access(ctx, args.actorId, email.jobId);
    // Any lead or admin, not only this opening's lead: a stuck send held the
    // TA's whole day while the one named lead was away (docs/19 A3, 2 Nov).
    if (!["admin", "ta_lead", "director"].includes(mapUser(lead).role)) throw new Error("Only a TA Lead, Director or admin can reconcile the email.");
    if (email.finalizedAt || !["sending", "uncertain", "accepted"].includes(email.status)) throw new Error("This email does not need reconciliation.");
    if (!args.reason.trim() || args.reason.length > 1000) throw new Error("Record how you verified the sending mailbox and its message reference.");
    if (email.status === "sending" && Date.now() - (email.startedAt ?? 0) < 300000) throw new Error("Wait five minutes and check the sending mailbox before reconciling.");
    if (email.status === "accepted" && !args.accepted) throw new Error("Microsoft Graph already accepted this email.");
    const patch = { status: args.accepted ? "accepted" as const : "failed" as const,
      ...(args.accepted ? { acceptedAt: email.acceptedAt ?? Date.now() } : {}), reconciledBy: lead._id, reconciliationReason: args.reason.trim() };
    await ctx.db.patch(email._id, patch);
    if (email.receiptId) await ctx.db.patch(email.receiptId, { status: patch.status, reconciledAt: Date.now(), reconciledBy: lead._id, reconciliationReason: args.reason.trim() });
    if (args.accepted) await finalizeDailyEmail(ctx, { ...email, ...patch });
    await refreshWorkdayChecks(ctx, email.jobId, lead._id);
    return { ok: true };
  },
});

/** Uncertain sends the checker (ta/eodMail:checkUncertain) may look up in the sender's Sent Items. */
export const uncertainToCheck = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Past the 10 minutes a Convex action can run, so a send still in flight is never called "not sent".
    const rows = await ctx.db.query("dailyEmails").withIndex("by_status", q => q.eq("status", "uncertain").lt("startedAt", Date.now() - 11 * 60000)).take(10);
    return rows
      .filter(e => !e.finalizedAt && !e.reconciledBy && !e.roundId && e.startedAt && e.snapshot?.subject && e.snapshot?.from)
      .map(e => ({ id: e._id, from: String(e.snapshot.from), subject: String(e.snapshot.subject), since: e.startedAt! - 60000 }));
  },
});

/**
 * The checker found out from Microsoft Graph whether an uncertain send reached Sent Items (9 Nov): sent -> accepted and
 * finalized like a reconcile, not sent -> failed so the TA can send again. No person, no Graph send: it never resends.
 */
export const autoReconcile = internalMutation({
  args: { id: v.id("dailyEmails"), sent: v.boolean() },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.id);
    if (!email || email.status !== "uncertain" || email.finalizedAt || email.reconciledBy) return { ok: false };
    const reason = args.sent ? "Checked automatically: the message is in the sending mailbox's Sent Items." : "Checked automatically: the message is not in the sending mailbox's Sent Items, so it was never sent.";
    const patch = { status: args.sent ? "accepted" as const : "failed" as const,
      // Keep the error the send itself recorded: on 10 Nov every failed row showed only this line and the real cause was gone.
      ...(args.sent ? { acceptedAt: email.acceptedAt ?? Date.now() } : { sendError: email.sendError ? `${email.sendError} | ${reason}`.slice(0, 500) : reason }), reconciliationReason: reason };
    await ctx.db.patch(email._id, patch);
    if (email.receiptId) await ctx.db.patch(email.receiptId, { status: patch.status, reconciledAt: Date.now(), reconciliationReason: reason });
    if (args.sent) await finalizeDailyEmail(ctx, { ...email, ...patch });
    await refreshWorkdayChecks(ctx, email.jobId, email.userId);
    return { ok: true };
  },
});

export const result = internalMutation({
  args: { id: v.id("dailyEmails"), status: v.union(v.literal("accepted"), v.literal("failed"), v.literal("uncertain")),
    delivered: v.optional(v.object({ from: v.string(), to: v.array(v.string()), cc: v.array(v.string()) })),
    error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.id);
    // A sweep may have moved a slow send to "uncertain"; the action's real answer still wins.
    if (!email || (email.status !== "sending" && email.status !== "uncertain")) return;
    const acceptedAt = args.status === "accepted" ? Date.now() : undefined;
    const snapshot = { ...email.snapshot, ...(args.delivered ?? {}) };
    await ctx.db.patch(email._id, { status: args.status, ...(acceptedAt ? { acceptedAt } : {}), ...(args.error ? { sendError: args.error.slice(0, 500) } : {}), snapshot });
    if (email.receiptId) await ctx.db.patch(email.receiptId, { status: args.status, ...(acceptedAt ? { acceptedAt } : {}) });
    if (args.status === "accepted") await finalizeDailyEmail(ctx, { ...email, status: "accepted", acceptedAt, snapshot });
    await refreshWorkdayChecks(ctx, email.jobId, email.userId);
  },
});

/** Release pipeline run_function only. Re-running never moves the rollout date. */
export const enableRequirement = internalMutation({
  args: { dryRun: v.boolean() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("dailyEmailPolicy").withIndex("by_key", q => q.eq("key", "midday")).first();
    const requiredFrom = existing?.requiredFrom ?? workdayDate(Date.now() + 86400000);
    if (!args.dryRun && !existing) await ctx.db.insert("dailyEmailPolicy", { key: "midday", requiredFrom });
    return { dryRun: args.dryRun, requiredFrom };
  },
});

/**
 * Past days (up to MISSED_EOD_DAYS back) with Director Review candidates this TA never sent, newest first. Read when
 * the end-of-day page opens, never on a send: begin only checks the one day it is sending.
 */
export const missedDays = internalQuery({
  args: { actorId: v.string(), jobId: v.id("jobs"), workLocationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await access(ctx, args.actorId, args.jobId);
    if (!worker(user)) return [];
    const today = workdayDate(Date.now());
    const first = workdayDate(Date.now() - MISSED_EOD_DAYS * 86400000);
    const sent = new Set((await ctx.db.query("reviewRounds").withIndex("by_opening", q => q.eq("openingId", args.jobId)).collect())
      .filter(r => r.kind === "director" && !r.recoveryReopenedAt).flatMap(r => r.applicationIds as string[]));
    for (const e of await ctx.db.query("dailyEmails").withIndex("by_user_job_date", q => q.eq("userId", user._id).eq("jobId", args.jobId)).collect())
      if (e.status === "accepted" && !e.recoveryReopenedAt) for (const id of e.applicationIds) sent.add(id);
    const waiting = await ctx.db.query("applications").withIndex("by_job_stage", q => q.eq("jobId", args.jobId).eq("currentStage", "second_shortlist")).collect();
    const days = new Map<string, number>();
    for (const a of waiting) {
      const day = workdayDate(a.lastStageChangedAt);
      if (a.ownerTaId === user._id && !sent.has(a._id) && inWorkLocation(a, args.workLocationId ?? "") && day >= first && day < today)
        days.set(day, (days.get(day) ?? 0) + 1);
    }
    return [...days].map(([date, count]) => ({ date, count })).sort((a, b) => b.date.localeCompare(a.date));
  },
});

/**
 * The email the TA is about to send, built here (19 Nov, D5 step 1): the people
 * (the same roster begin enforces), the L-sheet line, To / Cc and the subject - as
 * the old eod page builds them on the Next server. The new UI shows this; the send
 * will be built from it on the server, never from the browser.
 */
export const compose = internalQuery({
  args: { actorId: v.string(), jobId: v.id("jobs"), workLocationId: v.optional(v.string()), forDate: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await access(ctx, args.actorId, args.jobId, true);
    const job = (await ctx.db.get(args.jobId))!;
    const location = requireWorkLocation(job, args.workLocationId);
    const today = workdayDate(Date.now());
    const late = args.forDate && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(args.forDate) && args.forDate < today ? args.forDate : undefined;
    const days = late ? [] : await ctx.db.query("taWorkdays").withIndex("by_user", q => q.eq("userId", user._id)).order("desc").take(3);
    const day = days.find(d => d.date === today && (d.finishedAt === undefined || d.closureReason === "eod"));
    const entry = day?.jobs.find(j => j.jobId === args.jobId);
    const workType = entry?.workType ?? "100%";
    const eligible = await eligibleApplications(ctx, {
      jobId: args.jobId, userId: user._id, worker: worker(user), locationId: location?.id,
      workType: late ? "100%" : workType, sessionStart: late || !entry ? null : workSessionStart(entry), day: late ?? today,
    });
    const rows = await shortlistRows(ctx, eligible);
    const effort = await effortRow(ctx, {
      jobId: args.jobId, user, locationId: location?.id,
      at: late ? Date.parse(`${late}T12:00:00+05:30`) : Date.now(), onlyIds: late ? rows.map(r => r.applicationId as Id<"applications">) : undefined,
    });
    if (entry && !late) effort.hundredOrFollowUp = entry.workType;
    const { to, cc } = await defaultRecipients(ctx);
    return {
      rows, effort, to, cc, workType, late: late ?? null,
      subject: defaultSubject(job, location?.name ?? null, rows, effort.sets),
      applicationIds: rows.map(r => r.applicationId),
      workLocationId: location?.id ?? null,
      onWorkday: !!entry,
    };
  },
});
