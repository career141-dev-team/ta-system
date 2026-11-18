// convex/ui/me.ts
//
// Who is asking, for the new UI's door (18 Nov).
//
// These are the ONLY public functions in the TA backend, and that is the
// whole reason this file is strict. Everything under convex/ta is internal on
// purpose (convex/ta/guard.ts): it trusts an `actorId` because only the old
// app's server, holding the admin key, can call it. A public function can be
// called by anyone who knows the deployment address, so here:
//
//   - there is no `actorId` argument anywhere. The person is the verified
//     Clerk identity on the request, or nobody.
//   - the Clerk account is joined to the desk the same way the live app joins
//     it (src/lib/session.ts): the token, then the Clerk user id, then the
//     verified email - never an unverified one.
//   - an inactive or not-yet-onboarded account is refused exactly as
//     resolveActor refuses it (convex/lib/auth.ts).
//
// Once the person is known, the door calls the same internal rules the old
// app calls, passing that person's own id. No rule is copied or rewritten.

import { query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { mapUser } from "../../src/data/convex/map";
import { assertJobAccess, isDeskWideUser, WORKS_THE_DESK } from "../ta/guard";
import { matchableEmail } from "./rules";

export class NotSignedIn extends Error {}

/** The signed-in person on the desk, or a sentence saying why not. */
export async function uiUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new NotSignedIn("Sign in to continue.");

  let user =
    (await ctx.db.query("users").withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier)).first()) ??
    (await ctx.db.query("users").withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject)).first());
  const email = matchableEmail(identity);
  if (!user && email) {
    user =
      (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).first()) ??
      (identity.email && identity.email !== email
        ? await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", identity.email!)).first()
        : null);
  }
  if (!user) throw new NotSignedIn("This sign-in is not on the TA desk. Ask an admin to add you.");
  if (!user.isActive) throw new NotSignedIn("This account is deactivated.");
  if (!user.isOnboarded) throw new NotSignedIn("Your account is waiting for a role. Ask an admin.");
  return user;
}

/** Whether this person may read an opening: desk-wide roles, or anyone on its team. */
export async function mayReadOpening(ctx: QueryCtx | MutationCtx, user: Doc<"users">, jobId: Id<"jobs">): Promise<boolean> {
  if (isDeskWideUser(user)) return true;
  try {
    await assertJobAccess(ctx, user, jobId, [...WORKS_THE_DESK, "primary_recruiter", "supporting_recruiter"]);
    return true;
  } catch {
    return false;
  }
}

/** The signed-in person, as the UI draws them. Null when signed out or not on the desk. */
export const whoAmI = query({
  args: {},
  handler: async (ctx) => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return { ok: false as const, message: error instanceof NotSignedIn ? error.message : "Could not check who you are." };
    }
    const mapped = mapUser(user as never);
    return {
      ok: true as const,
      id: mapped.id as string,
      name: mapped.name,
      initials: mapped.initials,
      email: mapped.email,
      role: mapped.role,
    };
  },
});
