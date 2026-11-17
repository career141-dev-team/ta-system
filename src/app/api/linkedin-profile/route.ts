// Server-side only: the Apify token never reaches the browser (APIFY_TOKEN in .env.local).
// ponytail: no sign-in check yet (the app has none); each call spends about $0.004 of Apify
// credit. Gate it when sign-in exists.
import { linkedinProfile } from "@/lib/linkedinProfile";

export async function POST(req: Request) {
  return linkedinProfile(process.env.APIFY_TOKEN, await req.json().catch(() => null));
}
