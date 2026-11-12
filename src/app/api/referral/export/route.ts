import { primeStore } from "@/data/prime";
import { repo } from "@/data/store";
import { isConvex } from "@/data/mode";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/auth";
import { seatFor } from "@/lib/visibility";
import { referralSearch } from "@/lib/referralSearch";
import { findByNames } from "@/lib/nameCheck";
import { referralWorkbook, REFERRAL_EXPORT_MAX } from "@/lib/referralExport";
import { excelFilename, excelDownloadDisposition } from "@/lib/excelFilename";

export const dynamic = "force-dynamic";

/**
 * Referees ticked on a Referral Search, as an .xlsx (12 Nov). The browser sends
 * only ids plus the search text; the search runs again here (cached 5 minutes)
 * and only the ticked people are kept, so the file can never hold a row the
 * search did not return. Phone numbers and emails leave in bulk here, so it
 * needs `database.read` and, from an opening, a sourcing seat on it.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!can(user, "database.read").ok) return new Response("Not allowed.", { status: 403 });
  if (!isConvex()) return new Response("Referral Search needs the backend.", { status: 503 });

  const form = await req.formData();
  const q = String(form.get("q") ?? "").trim().slice(0, 500);
  const drop = form.getAll("x").map(String).slice(0, 30);
  const ids = new Set(form.getAll("id").map(String).slice(0, REFERRAL_EXPORT_MAX));
  const openingId = String(form.get("for") ?? "");
  if (!q || !ids.size) return new Response("Nothing selected.", { status: 400 });

  let label = "Database";
  if (openingId) {
    await primeStore({ openingId });
    const opening = repo.opening(openingId);
    if (!opening) return new Response("Opening not found.", { status: 404 });
    const assignment = repo.assignmentFor(openingId, user.id) ?? null;
    const onStrategy = repo.strategyAssignments(openingId).some((r) => r.doneBy.includes(user.id));
    if (!seatFor(user, assignment?.role ?? null, onStrategy).canSeeSourcing) return new Response("Not allowed.", { status: 403 });
    label = opening.title;
  }

  try {
    let actorId: string | null = null;
    try {
      const { convexActorForEmail } = await import("@/lib/convexServer");
      actorId = (await convexActorForEmail(user.email))?._id ?? null;
    } catch {
      // Reads go without an actor, as on the page.
    }
    const a = await referralSearch(q, drop, actorId);
    const people = a.people.filter((p) => ids.has(p.id));
    if (!people.length) return new Response("None of the selected people are in this search any more. Search again.", { status: 409 });

    const held = new Map<string, string>();
    try {
      for (const c of await findByNames(people.map((p) => p.name), actorId, { loose: false })) {
        if (c.matches[0]) held.set(c.name, c.matches[0].fullName);
      }
    } catch (e) {
      console.warn("[referral-export] CV lookup failed:", (e as Error)?.message);
    }

    console.info(`[referral-export] ${user.id} exported ${people.length} referee(s) for "${q.slice(0, 80)}"${openingId ? ` on ${openingId}` : ""}`);
    const file = excelFilename("Referees", label);
    return new Response(new Uint8Array(referralWorkbook(people, held)), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": excelDownloadDisposition(file),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.warn("[referral-export] failed:", (e as Error)?.message);
    return new Response("Could not export just now. Try again in a moment.", { status: 500 });
  }
}
