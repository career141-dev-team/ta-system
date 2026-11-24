/**
 * The new UI's People and roles (R1, 20 Nov): the desk's people through the old
 * /people page's own reads and actions.
 *
 * GET gives what the old page shows this person: every person (on the desk
 * first), and - for someone who may change them - the invites waiting and the
 * older-app accounts that can be given a role. POST { do, ...fields } runs the
 * old action (src/lib/uiPeople.ts): add, update, invite, revoke, active. Each is
 * admin-only inside itself and answers in its own words through inline().
 * Invites go through Clerk on this server, as on the old page.
 *
 * Who is asking: the person's Clerk session token (Bearer), read by Clerk exactly
 * like the old page's cookie. Only new.career141.com may call it from a browser.
 */
import { NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { addUser, inviteUser, revokeUserInvite, setUserActive, updateUser } from "@/app/actions";
import { primeStore } from "@/data/prime";
import { repo } from "@/data/store";
import { allows } from "@/lib/auth";
import { inline } from "@/lib/inlineResult";
import { offDeskAccounts, pendingInvites } from "@/lib/invites";
import { currentUser } from "@/lib/session";
import { readUiBody } from "@/lib/uiLinks";
import { PEOPLE_ACTIONS, personRow, rosterOrder, type PeopleAction } from "@/lib/uiPeople";
import { uiCors } from "@/lib/uiCors";

export const dynamic = "force-dynamic";

const RUN: Record<PeopleAction, (form: FormData) => Promise<unknown>> = {
  add: addUser, update: updateUser, invite: inviteUser, revoke: revokeUserInvite, active: setUserActive,
};

const cors = (req: Request) => uiCors(req.headers.get("origin"), "GET, POST, OPTIONS");
const answer = (req: Request, body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors(req) });
const signIn = (req: Request) => answer(req, { ok: false, message: "Sign in to continue." }, 401);

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || !user.isActive) return signIn(req);
  await primeStore(); // only users are read here, so skip the all-applications load (23 Nov)
  // The old page: the same test the server makes on every change (the actions
  // themselves also refuse anyone who is not an admin).
  const canEdit = allows(user, "user.manage") && user.role === "admin";
  const [invites, accounts] = canEdit ? await Promise.all([pendingInvites(), offDeskAccounts(user.id)]) : [[], []];
  return answer(req, {
    ok: true,
    me: user.id,
    canEdit,
    people: rosterOrder(repo.users()).map(personRow),
    invites,
    accounts,
  });
}

export async function POST(req: Request) {
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return signIn(req);
  const read = readUiBody(PEOPLE_ACTIONS, await req.json().catch(() => null));
  if (!read.ok) return answer(req, read, 400);
  const form = new FormData();
  for (const [k, v] of read.fields) form.append(k, v);
  try {
    const r = await inline(() => RUN[read.action](form));
    return answer(req, { ok: r.ok, message: r.message, tone: r.tone });
  } catch (e) {
    if (isRedirectError(e)) return signIn(req);
    throw e;
  }
}
