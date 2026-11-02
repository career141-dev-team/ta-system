import { repo } from "@/data/store";
import type { AssignmentRole, User } from "@/data/types";
import type { OpeningWriteDeps } from "@/lib/openings/writes";

/**
 * Bells for the things that used to change in silence (2 Nov).
 *
 * A priority tier moved, an opening went on hold or was closed, a candidate was
 * placed — all three were written to the record and told nobody, so the people
 * working the opening found out by opening the page. `candidate_placed` had
 * been declared in the notification types since the start and never once sent.
 *
 * The actor is never told what they just did themselves.
 */
export type OpeningBellType = "opening_changed" | "candidate_placed";

export async function tellOpeningPeople(
  actor: User,
  openingId: string,
  roles: AssignmentRole[],
  bell: { type: OpeningBellType; title: string; body: string },
  deps: Pick<OpeningWriteDeps, "convexMutation">,
): Promise<void> {
  const people = new Set(
    repo
      .assignments(openingId)
      .filter((a) => roles.includes(a.role))
      .map((a) => a.userId),
  );
  // The lead answers for the opening, so the lead hears about it either way.
  const taLeadId = repo.opening(openingId)?.taLeadId;
  if (taLeadId) people.add(taLeadId);
  people.delete(actor.id);
  if (!people.size) return;

  await Promise.all(
    [...people].map((userId) =>
      deps
        .convexMutation("ta/notifications:create", {
          userId,
          type: bell.type,
          title: bell.title,
          body: bell.body,
          jobId: openingId,
        })
        .catch((e) => console.error(`[notifications] ${bell.type} failed:`, e)),
    ),
  );
}

/** The seats that are actually working the opening. */
export const RECRUITER_SEATS: AssignmentRole[] = ["primary_recruiter", "supporting_recruiter"];
