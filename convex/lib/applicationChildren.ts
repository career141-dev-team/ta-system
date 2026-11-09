// convex/lib/applicationChildren.ts
//
// The rows that hang off one application, and removing them. Shared by deleting a whole opening
// (ta/openingDelete.ts) and deleting one person from Dropped out (ta/applicationDelete.ts).

import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** Rows hanging off one application, by the index that finds them. */
const APPLICATION_CHILDREN: [table: string, index: string][] = [
  ["pipelineEvents", "by_application"],
  ["aiCalls", "by_application"],
  ["voiceCallSessions", "by_application_startedAt"],
  ["voiceAnswers", "by_application_committedAt"],
  ["communications", "by_applicationId"],
  ["candidateInquiries", "by_applicationId"],
  ["directorReviews", "by_applicationId"],
  ["clientReviews", "by_applicationId"],
  ["interviews", "by_applicationId"],
  ["offers", "by_applicationId"],
  ["callFeedback", "by_application"],
  ["taOutreach", "by_application"],
  ["taScreeningCalls", "by_application"],
];

/** Remove the rows under one application. False when the batch ran out first. */
export async function removeApplicationChildren(
  ctx: MutationCtx,
  applicationId: Id<"applications">,
  del: (id: string) => Promise<void>,
  left: () => number,
): Promise<boolean> {
  for (const [table, index] of APPLICATION_CHILDREN) {
    const rows = await ctx.db
      .query(table as never)
      .withIndex(index as never, (q: any) => q.eq("applicationId", applicationId))
      .take(Math.max(1, left()));
    for (const r of rows) await del((r as { _id: string })._id);
    if (left() <= 0) return false;
  }
  return true;
}
