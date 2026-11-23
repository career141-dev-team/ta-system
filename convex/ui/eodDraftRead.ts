// convex/ui/eodDraftRead.ts
//
// Draft my EOD's read (23 Nov 2026): the email's own rows (ta/dailyEmails:compose, which
// checks the person may write this opening's email), then each person's record and CV
// text. Internal: only ui/eodDraft:notes calls it, with the signed-in person's id.

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { DraftPerson } from "./eodDraftRules";

// ponytail: the first 10 people of the email; a bigger set drafts the first 10.
const MAX_PEOPLE = 10;

export const people = internalQuery({
  args: { userId: v.id("users"), jobId: v.id("jobs"), workLocationId: v.optional(v.string()), forDate: v.optional(v.string()) },
  handler: async (ctx, a): Promise<{ job: { title: string; client: string }; people: DraftPerson[] }> => {
    const email = (await ctx.runQuery(internal.ta.dailyEmails.compose, {
      actorId: a.userId as string,
      jobId: a.jobId,
      workLocationId: a.workLocationId,
      forDate: a.forDate,
    })) as { applicationIds: string[] };
    const job = (await ctx.db.get(a.jobId))!;
    const out: DraftPerson[] = [];
    for (const id of email.applicationIds.slice(0, MAX_PEOPLE)) {
      const app = await ctx.db.get(id as Id<"applications">);
      if (!app) continue;
      const c = (await ctx.db.get(app.candidateId)) as Doc<"candidates"> | null;
      if (!c) continue;
      const resume = await ctx.db
        .query("candidateResumes")
        .withIndex("by_candidateId", (q) => q.eq("candidateId", app.candidateId))
        .order("desc")
        .first();
      out.push({
        id,
        name: c.fullName ?? "",
        title: (c as { currentTitle?: string }).currentTitle ?? "",
        employer: c.currentEmployer ?? "",
        years: c.totalExperienceYears ?? null,
        skills: c.skills ?? [],
        cvText: (resume?.rawText ?? "").slice(0, 4000),
      });
    }
    return { job: { title: job.title, client: (job as { clientName?: string }).clientName ?? "" }, people: out };
  },
});
