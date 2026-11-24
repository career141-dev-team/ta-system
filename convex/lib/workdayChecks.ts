import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { setupChecks, researchMissing, researchVersion, linkedinPostUrl, RESEARCH_LABELS, workSessionStart, SUGGESTIONS_WORKDAY_REQUIRED, MIN_OWN_EXCEL_PROFILES } from "../../src/lib/workdayRequirements";
import type { WorkdayCheck } from "../../src/lib/workday";
import { isEodSendCheck, canExcuseCheck, applyTaskExceptions, workdayDate } from "../../src/lib/workday";
import { linkKey } from "../../src/lib/url";
import { middayRequired, dailyEmailsFor } from "./dailyEmail";
import { isEodCandidateEligible } from "../../src/lib/eodEligibility";
import { jobEodComplete, workdayLocationIds } from "./workLocationEmails";

/*
 * How many of the newest suggestion rows are read to find the latest round a
 * TA may see. A Suggestions run writes about twenty rows, so this covers the
 * last ten or so rounds; every row of every run ever made used to be read on
 * every poll of every position (10 Nov). ponytail: a TA whose own latest
 * round sits more than ten rounds back reads as "no suggestions yet".
 */
const SUGGESTION_ROWS = 200;
const SOURCING_RUNS = 25;

export async function requiredChecks(ctx: QueryCtx | MutationCtx, day: Doc<"taWorkdays">, entry: Doc<"taWorkdays">["jobs"][number], opts: { lean?: boolean } = {}) {
  /*
   * `lean` (jobView, for a Follow-up or Add-on position): only director_cv,
   * chatgpt, daily_email and mail survive checksForWorkType, so the JD, post,
   * suggestion and profile evidence below would be read and then dropped. A
   * day with fifteen carried positions read them fifteen times on every poll;
   * the drawer's query ran to 4.9 s against a 1 s budget (10 Nov). The write
   * paths (saveCheck, emailPreflight) read everything, whatever the mode.
   */
  const full = !opts.lean;
  const none = <T,>(): Promise<T[]> => Promise.resolve([]);
  const [notes, research, posts, links, newestSuggestions, runs, apps, receipts, rounds, job] = await Promise.all([
    ctx.db.query("taWorkdayCheckNotes").withIndex("by_user_job", q => q.eq("userId", day.userId).eq("jobId", entry.jobId)).first(),
    // Research stays for every mode: saveCheck kind "research" reads it.
    ctx.db.query("researchReports").withIndex("by_opening", q => q.eq("openingId", entry.jobId)).first(),
    full ? ctx.db.query("jobPosts").withIndex("by_opening", q => q.eq("openingId", entry.jobId)).collect() : none<Doc<"jobPosts">>(),
    full ? ctx.db.query("linkVault").withIndex("by_workday_added", q => q.eq("openingId", entry.jobId).eq("addedBy", day.userId)).collect() : none<Doc<"linkVault">>(),
    // Newest rounds first; bounded (see SUGGESTION_ROWS).
    full ? ctx.db.query("profileSuggestions").withIndex("by_opening_round", q => q.eq("openingId", entry.jobId)).order("desc").take(SUGGESTION_ROWS) : none<Doc<"profileSuggestions">>(),
    full ? ctx.db.query("taSourcingRuns").withIndex("by_job", q => q.eq("jobId", entry.jobId)).order("desc").take(SOURCING_RUNS) : none<Doc<"taSourcingRuns">>(),
    ctx.db.query("applications").withIndex("by_workday_owner", q => q.eq("jobId", entry.jobId).eq("ownerTaId", day.userId)).collect(),
    ctx.db.normalizeId("taWorkdays", day._id) ? ctx.db.query("taWorkdayMail").withIndex("by_workday_job", q => q.eq("workdayId", day._id).eq("jobId", entry.jobId)).collect() : Promise.resolve([]),
    // 23 Nov: only director rounds are used below, so read just those.
    ctx.db.query("reviewRounds").withIndex("by_opening_kind", q => q.eq("openingId", entry.jobId).eq("kind", "director")).collect(),
    ctx.db.get(entry.jobId),
  ]);
  const applicable = newestSuggestions.filter(s => !s.generatedFor || s.generatedFor === day.userId);
  const latestRun = runs.filter(r => !r.userId || r.userId === day.userId).sort((a,b) => b.at - a.at)[0];
  const round = Math.max(latestRun?.round ?? 0, ...applicable.map(s => s.round));
  const latest = applicable.filter(s => s.round === round);
  const suggestionVersion = JSON.stringify([round, latestRun?.at ?? null, latest.map(s => [s._id, s.generatedAt])]);
  const goodPosts = posts.filter(p => linkedinPostUrl(p.externalUrl));
  const post = goodPosts.sort((a,b) => (a.postedAt ?? a.createdAt) - (b.postedAt ?? b.createdAt))[0];
  // Evidence for the records in hand only - the post and the latest round's
  // suggestions - not every evidence row the job has ever collected (10 Nov).
  const evidenceFor = (recordId: string) =>
    ctx.db.query("taWorkdayEvidence").withIndex("by_job_record", q => q.eq("jobId", entry.jobId).eq("recordId", recordId)).collect();
  const [postRows, suggestionRows] = await Promise.all([
    post ? evidenceFor(post._id) : Promise.resolve([]),
    Promise.all(latest.map(s => evidenceFor(s._id))).then(lists => lists.flat()),
  ]);
  const postEvidence = post ? postRows.filter(p => p.table === "jobPosts" && p.version === post.externalUrl).sort((a,b) => b.at-a.at)[0] : undefined;
  const suggestionEvidence = suggestionRows.filter(p => p.table === "profileSuggestions" && latest.some(s => s._id === p.recordId && s.status === p.version)).sort((a,b) => b.at-a.at)[0];
  const unique = [...new Map(links.filter(l => !!linkKey(l.linkedinUrl)).sort((a,b) => b.createdAt-a.createdAt)
    .map(l => [linkKey(l.linkedinUrl) ?? l.linkedinUrl, l])).values()].sort((a,b) => a.createdAt-b.createdAt);
  const sentIds = new Set(rounds.filter(r => r.kind === "director" && !r.recoveryReopenedAt).flatMap(r => r.applicationIds as string[]));
  const since = workSessionStart(entry);
  const accepted = receipts.filter(r => r.status === "accepted" && r.finalizedAt && !r.recoveryReopenedAt && (entry.workType !== "Add-on" || r.startedAt >= since));
  const dailyEod = receipts.filter(r => r.status === "accepted" && r.finalizedAt && !r.revised && !r.recoveryReopenedAt && (r.submissionType ?? "eod") === "eod" && workdayDate(r.startedAt) === day.date);
  const inDirectorReview = apps.filter(a => !sentIds.has(a._id) && isEodCandidateEligible({
    stage: a.currentStage,
    ownerTaId: a.ownerTaId,
    isAddOn: a.isAddOn,
    lastStageChangedAt: a.lastStageChangedAt,
  }, { taId: day.userId, workType: entry.workType, sessionStart: since, day: day.date }));
  const ready = (await Promise.all(inDirectorReview.map(async app => {
    const candidate = await ctx.db.get(app.candidateId);
    return app.cvFileId || app.cvFileName || candidate?.cvUploadId || candidate?.cvFileName ? app : null;
  }))).filter((app): app is NonNullable<typeof app> => app !== null);
  const ownNotes = notes?.workdayId === day._id ? notes : null;
  const setup = { jobId: entry.jobId, workType: entry.workType, userId: day.userId,
    jd: { version: job?.jobDescription ?? "", approved: job?.jdStatus === "approved", reviewedVersion: notes?.jdVersion, at: notes?.jdReviewedAt, by: day.userId },
    post: post ? { id: post._id, at: postEvidence?.at ?? post.postedAt ?? undefined, by: postEvidence?.by } : undefined,
    research: { version: researchVersion(research), reviewedVersion: notes?.researchVersion,
      missing: researchMissing(research?.fields ?? {}, notes?.unavailableReasons ?? {}),
      unavailable: researchMissing(research?.fields ?? {}, {}).filter(key => notes?.unavailableReasons?.[key]?.trim()).map(key => `${RESEARCH_LABELS[key]} unavailable: ${notes!.unavailableReasons[key]}`),
      at: notes?.researchReviewedAt, by: day.userId },
    suggestions: { successful: !!latestRun || latest.length > 0, pending: latest.filter(s => s.status === "new").length,
      count: latest.length, version: suggestionVersion, emptyReason: notes?.emptySuggestionsVersion === suggestionVersion ? notes.emptySuggestionsReason : undefined,
      at: latest.length ? suggestionEvidence?.at : notes?.emptySuggestionsAt, by: latest.length ? suggestionEvidence?.by : day.userId },
    profiles: { count: unique.length, at: unique[MIN_OWN_EXCEL_PROFILES - 1]?.createdAt }, ready: ready.length,
    submitted: new Set(accepted.flatMap(r => r.applicationIds as string[])).size,
    noCandidateReason: entry.workType !== "Add-on" || (ownNotes?.noCandidateAt ?? 0) >= since ? ownNotes?.noCandidateReason : undefined,
    noCandidateAt: ownNotes?.noCandidateAt,
    chatgptLink: ownNotes?.chatgptLink ?? accepted.at(-1)?.researchLink,
    confirmedAt: ownNotes?.confirmedAt ?? accepted.at(-1)?.acceptedAt,
    emailAt: await jobEodComplete(ctx, entry, dailyEod) ? Math.max(...dailyEod.map(r => r.finalizedAt!)) : undefined,
  };
  // Version the underlying evidence, not the exception or a rendered progress label.
  const versions: Record<string, unknown> = {
    jd_review: [setup.jd.version, setup.jd.approved, setup.jd.reviewedVersion],
    linkedin_post: posts.map(p => [p._id, p.externalUrl]),
    suggestions: [suggestionVersion, latest.map(s => [s._id, s.status])],
    excel_profiles: unique.map(l => [l._id, l.linkedinUrl]),
    chatgpt: [ownNotes?.chatgptLink ?? null, ownNotes?.confirmedAt ?? null],
  };
  const exceptions = ctx.db.normalizeId("taWorkdays", day._id)
    ? await ctx.db.query("taWorkdayExceptions").withIndex("by_workday_job", q => q.eq("workdayId", day._id).eq("jobId", entry.jobId)).collect() : [];
  const decorate = (rows: WorkdayCheck[]) => applyTaskExceptions(rows.map(c => canExcuseCheck(c)
    ? { ...c, exceptionVersion: JSON.stringify([since, versions[c.key.split(":")[0]]]) } : c), exceptions, day.date === workdayDate(Date.now()));
  const checks = decorate(setupChecks(setup, true));
  if (job?.workLocations?.length && setup.emailAt) {
    const cv = checks.find(c => c.key.startsWith("director_cv:"));
    if (cv && cv.status !== "complete") Object.assign(cv, { status: "complete", completedAt: setup.emailAt, completedBy: day.userId, progress: "All location EODs sent, including activity-only reports" });
  }
  const eodChecks = checks.filter(isEodSendCheck);
  if (await middayRequired(ctx, day.date)) {
    const emails = await dailyEmailsFor(ctx, day.userId, entry.jobId, day.date);
    const requiredLocations = await workdayLocationIds(ctx, entry);
    const midday = emails.filter(e => e.submissionType === "midday" && e.status === "accepted" && e.finalizedAt);
    const sent = (!requiredLocations.length || requiredLocations.every(id => midday.some(e => e.workLocationId === id))) ? midday.at(-1) : undefined;
    const check: WorkdayCheck = { key: `midday_email:${entry.jobId}`, jobId: entry.jobId,
      label: "Midday email sent", href: `/openings/${entry.jobId}/midday`, kind: "email", canCarry: false,
      evidenceAt: sent?.acceptedAt ?? 0, status: sent ? "complete" : "incomplete",
      completedAt: sent?.acceptedAt, completedBy: sent?.userId, blocksEmail: true,
      progress: sent ? "Sent and recorded" : "Send at least one midday email today" };
    checks.push(check);
    eodChecks.push(check);
  }
  const suggestionsCheck = eodChecks.find(c => c.key.startsWith("suggestions:")) ?? null;
  const candidateCheck = checks.find(c => c.key.startsWith("director_cv:"));
  if (candidateCheck?.status === "complete" && ready.length && !accepted.length) {
    candidateCheck.completedAt = Math.min(...ready.map(a => a.lastStageChangedAt));
    candidateCheck.evidence = ready.map(a => a._id).join(",");
  }
  return { checks: SUGGESTIONS_WORKDAY_REQUIRED ? checks : checks.filter(c => !c.key.startsWith("suggestions:")),
    eodChecks, suggestionsCheck, notes, research, suggestionVersion, latest, latestRun, job };
}

/** Editing shared text invalidates every TA's review, including when old text is restored. */
export async function invalidateJdReviews(ctx: MutationCtx, jobId: Id<"jobs">) {
  const notes = await ctx.db.query("taWorkdayCheckNotes").withIndex("by_job", q => q.eq("jobId", jobId)).collect();
  for (const note of notes) if (note.jdVersion !== undefined) await ctx.db.patch(note._id, { jdVersion: undefined });
}

export async function recordJdReview(ctx: MutationCtx, userId: Id<"users">, jobId: Id<"jobs">, version: string) {
  const notes = await ctx.db.query("taWorkdayCheckNotes").withIndex("by_user_job", q => q.eq("userId", userId).eq("jobId", jobId)).first();
  const patch = { jdVersion: version, jdReviewedAt: notes?.jdVersion === version ? notes.jdReviewedAt ?? Date.now() : Date.now() };
  if (notes) await ctx.db.patch(notes._id, patch);
  else await ctx.db.insert("taWorkdayCheckNotes", { userId, jobId, ...patch });
}

/** Event reads never manufacture a completion time for legacy evidence. */
export async function withTaskHistory(ctx: QueryCtx | MutationCtx, day: Doc<"taWorkdays">, jobId: Id<"jobs">, checks: WorkdayCheck[], includeHistorical = true) {
  const events = await ctx.db.query("taWorkdayTaskEvents").withIndex("by_workday_job", q => q.eq("workdayId", day._id).eq("jobId", jobId)).collect();
  const exceptions = await ctx.db.query("taWorkdayExceptions").withIndex("by_workday_job", q => q.eq("workdayId", day._id).eq("jobId", jobId)).collect();
  const names = new Map<string, string>();
  for (const id of new Set([...exceptions.map(e => e.by), ...events.flatMap(e => [e.by, e.completedBy].filter(Boolean)), ...checks.map(c => c.completedBy).filter(Boolean)])) {
    const normalized = ctx.db.normalizeId("users", id!);
    const user = normalized ? await ctx.db.get(normalized) : null;
    if (user) names.set(id!, user.fullName);
  }
  const current = new Set(checks.map(c => c.key));
  for (const event of events) if (includeHistorical && !current.has(event.key) && event.key.includes(":")) {
    // Historical events must not put the paused requirement back in the sidebar.
    if (!SUGGESTIONS_WORKDAY_REQUIRED && event.key.startsWith("suggestions:")) continue;
    if (event.key.startsWith("research:") || event.key.startsWith("director_candidate:")) continue;
    current.add(event.key);
    checks.push({ key: event.key, jobId, label: event.label, href: event.href, kind: event.kind as WorkdayCheck["kind"],
      canCarry: false, evidenceAt: 0, status: "complete" });
  }
  return checks.map(c => {
    const history = events.filter(e => e.key === c.key).sort((a,b) => a.at-b.at);
    const last = history.at(-1);
    const same = last?.status === c.status;
    return { ...c, completedAt: same && c.status === "complete" ? last?.completedAt ?? c.completedAt : c.completedAt,
      completedBy: names.get(c.completedBy ?? "") ?? c.completedBy ?? (same ? names.get(last?.completedBy ?? "") ?? last?.completedBy : undefined),
      exception: c.exception ? { ...c.exception, by: names.get(c.exception.by) ?? c.exception.by } : undefined,
      events: [...history.map(e => ({ status: e.status, at: e.at, by: names.get(e.by ?? ""), evidence: e.evidence, observed: e.observed })),
        ...exceptions.filter(e => e.key === c.key).map(e => ({ status: e.action === "submit" ? "reason_submitted" : "reason_withdrawn", at: e.at, by: names.get(e.by), evidence: e.reason }))].sort((a,b) => a.at-b.at) };
  });
}
