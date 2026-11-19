/**
 * The new UI's Midday / End of day send (D5 step 3, 19 Nov).
 *
 * new.career141.com cannot build the email's files itself: the Prepared CV PDFs
 * (Word -> PDF, the green box stamped) and the Excel Tables workbook are made
 * only here. So the new page posts the old page's own form, with the person's
 * Clerk session token, and this route runs the old action - sendDailyEmail,
 * with every rule it has (who may, the workday, the research link, referee
 * calls, work type and location, the files, the reservation, the sender, saving
 * the edits back). One rule for both UIs; nothing here decides anything.
 *
 * Who is asking: Clerk reads the Bearer token exactly as it reads the old page's
 * cookie (src/proxy.ts), and the action's own authorize() checks it.
 */
import { NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { sendDailyEmail } from "@/app/actions";
import { inline } from "@/lib/inlineResult";
import { formFields, readSendRedirect, redirectUrl } from "@/lib/uiDailyEmail";
import { uiCors } from "@/lib/uiCors";

const cors = (origin: string | null) => uiCors(origin, "POST, OPTIONS");

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const headers = cors(req.headers.get("origin"));
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401, headers });
  const read = formFields(await req.json().catch(() => null));
  if (!read.ok) return NextResponse.json(read, { status: 400, headers });
  const form = new FormData();
  for (const [k, v] of read.fields) form.append(k, v);
  try {
    // A refusal said through back()/fail() comes back as a sentence; the action's
    // own closing redirect (sent or not) is read below.
    const r = await inline(() => sendDailyEmail(form), "Nothing was sent. Try again.");
    return NextResponse.json({ ok: false, message: r.message }, { headers });
  } catch (e) {
    const url = isRedirectError(e) ? redirectUrl((e as { digest?: unknown }).digest) : null;
    if (url?.startsWith("/signin")) return NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401, headers });
    if (url) return NextResponse.json(readSendRedirect(url), { headers });
    console.error("[api/ui/daily-email]", e);
    return NextResponse.json({ ok: false, message: "Nothing was sent: the email could not be prepared. Try again." }, { status: 500, headers });
  }
}
