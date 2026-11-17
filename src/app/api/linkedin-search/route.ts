// Server-side only: the Apify token never reaches the browser (APIFY_TOKEN in .env.local).
// The search itself is src/lib/linkedinSearch.ts, shared with the dev link's
// Cloudflare function.
// ponytail: no sign-in check yet (the app has none); anyone who reaches this route
// spends Apify credit, about $0.14 a search. Gate it when sign-in exists.
import { linkedinSearch } from "@/lib/linkedinSearch";

export async function POST(req: Request) {
  return linkedinSearch(process.env.APIFY_TOKEN, await req.json().catch(() => null));
}
