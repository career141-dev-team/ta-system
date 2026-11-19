import type { Application, Id, LinkVaultEntry } from "@/data/types";

/**
 * Where a CV came from, in the end-of-day sheet's terms (the desk, 28 Sep).
 *
 *   da        approached us directly — WhatsApp, a WhatsApp or Meta campaign,
 *             or a CV emailed in with no advert behind it
 *   post      applied through one of our adverts — a LinkedIn post above all
 *   l         headhunted: worked in Excel Tables, or captured off a profile
 *   database  picked from the database ("TBR") — not a hunted CV
 *
 * A LinkedIn-post applicant and a headhunted person both carry channel L
 * (store channelForIntake, convex map channelOf), so the channel alone cannot
 * tell them apart: the one who sits in the opening's Excel Tables was hunted,
 * and any other L applied.
 */
export type CvSource = "da" | "post" | "l" | "database";

/** The candidates an opening's Excel Tables rows became. */
export function headhuntedCandidates(vault: readonly LinkVaultEntry[]): Set<Id> {
  return new Set(vault.flatMap((v) => (v.candidateId ? [v.candidateId] : [])));
}

export function cvSource(app: Application, headhunted: ReadonlySet<Id>): CvSource {
  if (app.sourcingChannel === "SCOOP") return "database";
  if (headhunted.has(app.candidateId)) return "l";
  switch (app.sourcingChannel) {
    case "HH":
    case "IM":
      return "l";
    case "L":
      return "post";
    case "DA":
      return "da";
    default:
      // E and FB: an advert's applicant when filed against one, otherwise
      // someone who came to us of their own accord.
      return app.jobPostId ? "post" : "da";
  }
}

/** The column a CV is counted in on the end-of-day sheet. */
export type EffortBucket = "backUp" | "addOns" | "scoop" | "da" | "post" | "l";

/**
 * The one column a CV of the day goes in (the desk, 28 Sep), so the columns
 * add up to the day's total: a backup first, then a scoop mailed in by a lead,
 * then an add-on, then where it came from (lib/cvSource). A scoop stays a
 * scoop on an Add-on day — the desk counts what the leads sent under SCOOP. A
 * database pick is TBR, not a hunted CV, and is in none of them.
 */
export function effortBucket(app: Application, headhunted: ReadonlySet<Id>): EffortBucket | null {
  if (app.backupForApplicationId) return "backUp";
  if (app.scoopFrom || app.scoopReceivedAt) return "scoop";
  if (app.isAddOn) return "addOns";
  const source = cvSource(app, headhunted);
  return source === "database" ? null : source;
}

