/**
 * The new UI's Openings and Bin (D9, 20 Nov): create an opening (and its client),
 * bin one, the Bin's restore / delete now, and the website switch, through the
 * old app's own actions.
 *
 * GET ?part=form gives what the old New opening page offers this person (its
 * clients, the TAs who can be put on it, whether they may add a client or lead
 * the team); GET ?part=bin gives the old Bin page (refused to clients and
 * viewers, as there). POST { do, ...fields } runs the old action
 * (src/lib/uiOpenings.ts): createOpeningInline, createClientInline, deleteOpening,
 * restoreFromBin, deleteFromBinNow, setOpeningOnWebsite - each checks its rights.
 *
 * Who is asking: the person's Clerk session token (Bearer), read by Clerk exactly
 * like the old page's cookie. Only new.career141.com may call it from a browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  createClientInline, createOpeningInline, deleteFromBinNow, deleteOpening, restoreFromBin, setOpeningOnWebsite,
} from "@/app/actions";
import { primeStore } from "@/data/prime";
import { isConvex } from "@/data/mode";
import { binItems } from "@/data/convex/backend";
import { repo } from "@/data/store";
import type { BinItem } from "@/data/types";
import { assignableTas } from "@/lib/assignable";
import { can, isDeskWide, isReadOnly } from "@/lib/auth";
import { inline } from "@/lib/inlineResult";
import { currentUser } from "@/lib/session";
import { redirectUrl } from "@/lib/uiDailyEmail";
import { readUiBody } from "@/lib/uiLinks";
import { OPENING_ACTIONS } from "@/lib/uiOpenings";
import { uiCors } from "@/lib/uiCors";

export const dynamic = "force-dynamic";

const cors = (req: Request) => uiCors(req.headers.get("origin"), "GET, POST, OPTIONS");
const answer = (req: Request, body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors(req) });
const signIn = (req: Request) => answer(req, { ok: false, message: "Sign in to continue." }, 401);

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function GET(req: NextRequest) {
  const part = req.nextUrl.searchParams.get("part");
  const user = await currentUser();
  if (!user) return signIn(req);
  if (part === "bin") {
    // The old Bin page: clients and viewers see the desk's work, not its deletes.
    if (isReadOnly(user) || user.role === "client") return answer(req, { ok: false, message: "The Bin is only for the recruitment team." }, 403);
    await primeStore();
    const items: BinItem[] = isConvex() ? await binItems({ id: user.id }) : repo.bin();
    return answer(req, { ok: true, items, mayPurge: isDeskWide(user) });
  }
  if (part === "form") {
    // The old New opening page: only people who may create one.
    const may = can(user, "opening.create");
    if (!may.ok) return answer(req, { ok: false, message: may.message }, 403);
    await primeStore({});
    return answer(req, {
      ok: true,
      clients: repo.clients().map((c) => ({ id: c.id, name: c.name, industry: c.industry ?? "" })),
      tas: assignableTas(repo.users()).map((u) => ({ id: u.id, name: u.name })),
      isLead: user.role === "ta_lead" || user.role === "admin",
      canAddClient: can(user, "client.manage").ok,
    });
  }
  return answer(req, { ok: false, message: "Ask for the form or the bin." }, 400);
}

export async function POST(req: Request) {
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return signIn(req);
  const read = readUiBody(OPENING_ACTIONS, await req.json().catch(() => null));
  if (!read.ok) return answer(req, read, 400);
  const form = new FormData();
  for (const [k, v] of read.fields) form.append(k, v);
  try {
    switch (read.action) {
      case "create": {
        // The old pop-up's own save: it answers rather than redirecting.
        const r = await createOpeningInline(form);
        return answer(req, r.ok ? { ok: true, message: `"${r.title}" created for ${r.clientName}.`, openingId: r.openingId } : { ok: false, message: r.error });
      }
      case "client": {
        const r = await createClientInline(form);
        return answer(req, r.ok ? { ok: true, message: `${r.client.name} added.`, client: r.client } : { ok: false, message: r.error });
      }
      case "website": {
        const r = await setOpeningOnWebsite(form);
        return answer(req, { ok: r.ok, message: r.ok ? (form.get("listed") === "on" ? "On the website." : "Off the website.") : r.message });
      }
      default: {
        // bin / restore / purge answer by a redirect or by done()/fail().
        const run = read.action === "bin" ? deleteOpening : read.action === "restore" ? restoreFromBin : deleteFromBinNow;
        const r = await inline(() => run(form));
        return answer(req, { ok: r.ok, message: r.message });
      }
    }
  } catch (e) {
    const url = isRedirectError(e) ? redirectUrl((e as { digest?: unknown }).digest) : null;
    if (!url || url.startsWith("/signin")) return signIn(req);
    // Binning an opening goes back to the Openings page with its sentence.
    const msg = new URL(url, "https://x").searchParams.get("msg");
    return answer(req, { ok: true, message: msg || "Saved." });
  }
}
