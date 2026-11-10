import { NextResponse } from "next/server";
import { primed, primeStore } from "@/data/prime";
import { currentUser } from "@/lib/session";
import { convexQuery } from "@/lib/convexServer";
import type { WorkdayPayload } from "@/lib/workday";
import { canViewWorkday } from "@/lib/workdayRoles";

export async function GET(request: Request) {
  // Inside a catch, like the backend calls below: a failed desk load left no
  // trace in the log (29 Oct).
  let user: Awaited<ReturnType<typeof currentUser>>;
  try {
    // Only the users table is read here (currentUser), and it is already in
    // memory once the desk has loaded. Waiting in the one prime queue meant a
    // 20-second poll sat behind every other page's reload - 10 to 28 s during
    // bulk CV work, and thrown away whenever a save overtook it - so the EOD
    // panel read "Could not load workday checks" with nothing wrong on the
    // backend (9 Nov). A person added today is still found: currentUser
    // refreshes the roster on a miss.
    if (!primed()) await primeStore({});
    user = await currentUser();
  } catch (err) {
    console.error("[api/workday] session", err instanceof Error ? err.message.slice(0, 300) : "");
    // The sentence names the step, so the next report says the cause (10 Nov).
    return NextResponse.json(
      { error: "Could not load workday checks: the desk is still loading. Please retry." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!user)
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!canViewWorkday(user.role))
    return NextResponse.json(
      { error: "Workdays are not available for your role." },
      { status: 403 },
    );
  // Which backend call was running, for the log below.
  let step = "ta/workdays:dashboard";
  try {
    const preview = new URL(request.url).searchParams.get("preview");
    if (preview) {
      step = "ta/workdays:startPreview";
      return NextResponse.json(
        await convexQuery("ta/workdays:startPreview", { actorId: user.id, jobId: preview }),
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const payload = await convexQuery<WorkdayPayload>("ta/workdays:dashboard", {
      actorId: user.id,
      detail: new URL(request.url).searchParams.get("detail") === "1",
      jobId: new URL(request.url).searchParams.get("job") || undefined,
      cursor: new URL(request.url).searchParams.get("cursor") || undefined,
      taId: new URL(request.url).searchParams.get("ta") || undefined,
      date: new URL(request.url).searchParams.get("date") || undefined,
      focusWorkday: new URL(request.url).searchParams.get("checkDay") || undefined,
      allHistory: new URL(request.url).searchParams.get("history") === "all",
    });
    if (payload.canWork && new URL(request.url).searchParams.get("detail") === "1") {
      step = "ta/dailyEmails:sent";
      payload.sentEmails = await convexQuery("ta/dailyEmails:sent", { actorId: user.id });
    }
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    // The panel shows only "Could not load workday checks"; reviewers saw a
    // 503 on every 20-second poll and the cause was nowhere (26 Oct). The
    // query string carries only the view asked for: date, page, TA and day ids.
    console.error("[api/workday]", step, `role=${user.role}`, new URL(request.url).search, err);
    const budget = err instanceof Error && /timed out|Too many|limit/i.test(err.message);
    return NextResponse.json(
      { error: budget ? "Could not load workday checks: the checks took too long to read. Please retry." : "Could not load workday checks. Please retry." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
