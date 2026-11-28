import { primeStore } from "@/data/prime";
import { repo } from "@/data/store";
import { isConvex } from "@/data/mode";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/auth";
import { seatFor } from "@/lib/visibility";
import { referralSearch } from "@/lib/referralSearch";
import { findByNames } from "@/lib/nameCheck";
import { referralWorkbook, picksBySearch } from "@/lib/referralExport";
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
  const openingId = String(form.get("for") ?? "");
  // 28 Nov: ticks from several searches come as `picks` (each id with the search
  // that showed it); a tab opened before that still sends one q + ids.
  const searches = picksBySearch(form);
  const q = searches[0]?.q ?? "";
  if (!searches.length) return new Response("Nothing selected.", { status: 400 });

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
    const seen = new Set<string>();
    const people = [];
    for (const s of searches) {
      const a = await referralSearch(s.q, s.x, actorId);
      for (const p of a.people) if (s.ids.has(p.id) && !seen.has(p.id)) (seen.add(p.id), people.push(p));
    }
    if (!people.length) return new Response("None of the selected people are in this search any more. Search again.", { status: 409 });

    const held = new Map<string, string>();
    try {
      for (const c of await findByNames(people.map((p) => p.name), actorId, { loose: false })) {
        if (c.matches[0]) held.set(c.name, c.matches[0].fullName);
      }
    } catch (e) {
      console.warn("[referral-export] CV lookup failed:", (e as Error)?.message);
    }

    console.info(`[referral-export] ${user.id} exported ${people.length} referee(s) from ${searches.length} search(es), first "${q.slice(0, 80)}"${openingId ? ` on ${openingId}` : ""}`);
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

