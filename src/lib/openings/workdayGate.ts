import type { User } from "@/data/types";
import { convexQuery } from "@/lib/convexServer";
import { decideOn } from "./writes";

/**
 * Why this person cannot add CVs to this opening right now, or null.
 *
 * The workday rule (convex/lib/workdayScope) used to be met only after a file
 * had been uploaded and stored, so a TA whose workday did not include the
 * position saw a failed upload and an orphaned file (2 Nov). Asked before the
 * file is read, and when the panel loads, the same sentence appears with nothing
 * wasted.
 */
export async function workdayBlock(user: User, openingId: string): Promise<string | null> {
  const decision = await decideOn(user, "opening.act", { openingId }, { convexQuery });
  return decision.ok ? null : decision.message;
}
