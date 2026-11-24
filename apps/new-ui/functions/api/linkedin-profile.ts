// The live dev link's "Extract with AI" (Cloudflare Pages Function); the local twin is
// src/app/api/linkedin-profile/route.ts. APIFY_TOKEN is the same Secret as linkedin-search.
// Signed-in AURA users only (src/lib/signedIn.ts), about $0.004 each.
import { linkedinProfile } from "../../src/lib/linkedinProfile";
import { refuseUnlessSignedIn } from "../../src/lib/signedIn";

export const onRequestPost = async ({ request, env }: { request: Request; env: { APIFY_TOKEN?: string } }) =>
  (await refuseUnlessSignedIn(request)) ?? linkedinProfile(env.APIFY_TOKEN, await request.json().catch(() => null));
