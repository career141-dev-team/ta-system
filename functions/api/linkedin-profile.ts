// The live dev link's "Extract with AI" (Cloudflare Pages Function); the local twin is
// src/app/api/linkedin-profile/route.ts. APIFY_TOKEN is the same Secret as linkedin-search.
// ponytail: no sign-in yet, so anyone with the link can extract ($0.004 each). Gate it later.
import { linkedinProfile } from "../../src/lib/linkedinProfile";

export const onRequestPost = async ({ request, env }: { request: Request; env: { APIFY_TOKEN?: string } }) =>
  linkedinProfile(env.APIFY_TOKEN, await request.json().catch(() => null));
