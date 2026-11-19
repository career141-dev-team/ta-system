// Server-side only: the Apify token never reaches the browser (APIFY_TOKEN in .env.local).
// Signed-in AURA users only (src/lib/signedIn.ts), about $0.004 each.
import { linkedinProfile } from "@/lib/linkedinProfile";
import { refuseUnlessSignedIn } from "@/lib/signedIn";

export async function POST(req: Request) {
  return (await refuseUnlessSignedIn(req)) ?? linkedinProfile(process.env.APIFY_TOKEN, await req.json().catch(() => null));
}
