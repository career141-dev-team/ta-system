import { primeStore } from "@/data/prime";
import { repo } from "@/data/store";
import * as backend from "@/data/convex/backend";

/**
 * Hold one application and its opening, for the new UI's CV routes.
 *
 * Those routes asked for every application on the desk when the one they
 * needed was not held yet (`allApplications`), and the CV popup waited
 * 8-12 s on the live site (20 Nov audit). The application is read on its own
 * first, then only its opening is loaded. If that read fails the old
 * whole-desk load still runs, so nothing is refused that was allowed before.
 */
export async function primeApplication(appId: string, actorId: string | null): Promise<void> {
  if (!appId || repo.application(appId)) return;
  const row = await backend.application({ id: actorId }, appId).catch(() => null);
  await primeStore(row?.openingId ? { openingId: row.openingId } : { allApplications: true });
}
