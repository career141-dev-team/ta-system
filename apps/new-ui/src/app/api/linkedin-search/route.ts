// Server-side only: the Apify token never reaches the browser (APIFY_TOKEN in .env.local).
// The search itself is src/lib/linkedinSearch.ts, shared with the dev link's
// Cloudflare function. Signed-in AURA users only (src/lib/signedIn.ts), ~$0.14 a search.
import { linkedinSearch } from "@/lib/linkedinSearch";
import { refuseUnlessSignedIn } from "@/lib/signedIn";

export async function POST(req: Request) {
  return (await refuseUnlessSignedIn(req)) ?? linkedinSearch(process.env.APIFY_TOKEN, await req.json().catch(() => null));
}
