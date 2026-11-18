/**
 * "Extract with AI" on Excel Tables: one LinkedIn profile, read by Apify's
 * harvestapi/linkedin-profile-scraper because a TA pressed the button on it.
 * One address per press - no list, no queue, no timer. The answer is stored as
 * the same `capture` the Chrome extension writes, so the row, the matcher and
 * the details window read one shape.
 */

import type { ProfileCapture } from "@/data/types";
import { normaliseCapture } from "@/lib/extension";

const ACTOR = "harvestapi~linkedin-profile-scraper";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const text = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  const t = obj(v).text ?? obj(v).linkedinText;
  return typeof t === "string" && t.trim() ? t.trim() : null;
};
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);

/** Apify's profile item -> our capture (pure; tests/apifyprofile.test.ts). */
export function captureFromApify(item: unknown, sourceUrl: string, by: string): ProfileCapture | null {
  const p = obj(item);
  const experience = arr(p.experience).map((x) => ({
    title: text(x.position) ?? text(x.title) ?? "",
    company: text(x.companyName) ?? "",
    dates: [text(x.startDate), text(x.endDate)].filter(Boolean).join(" - ") || text(x.duration),
  }));
  const current = arr(p.currentPosition)[0] ?? {};
  const fullName = [p.firstName, p.lastName].filter((s) => typeof s === "string" && s).join(" ") || null;
  return normaliseCapture(
    {
      sourceUrl,
      fullName,
      headline: p.headline,
      currentTitle: experience[0]?.title,
      currentCompany: text(current.companyName) ?? experience[0]?.company,
      location: text(p.location) ?? text(obj(p.location).parsed),
      about: p.about,
      openToWork: p.openToWork === true,
      experience,
      education: arr(p.education).map((x) => ({
        school: text(x.schoolName),
        detail: [text(x.degree), text(x.fieldOfStudy)].filter(Boolean).join(", ") || null,
      })),
      skills: arr(p.skills).map((s) => text(s.name)).filter(Boolean),
      email: p.email,
    },
    by,
  );
}

/** Runs the actor and waits for the answer. Throws a plain sentence on any failure. */
export async function scrapeLinkedinProfile(url: string, by: string): Promise<ProfileCapture> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("Extract with AI is not set up on this system yet (APIFY_API_TOKEN).");
  let res: Response;
  try {
    res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=90`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ urls: [url], profileScraperMode: "Profile details no email ($4 per 1k)" }),
      signal: AbortSignal.timeout(100_000),
    });
  } catch {
    throw new Error("The profile reader did not answer in time. Try again in a minute.");
  }
  if (!res.ok) throw new Error(`The profile reader refused (${res.status}). Try again, or fill the row by hand.`);
  const items = (await res.json().catch(() => [])) as unknown;
  const capture = Array.isArray(items) ? captureFromApify(items[0], url, by) : null;
  if (!capture || !capture.fullName) throw new Error("No profile came back for that link. Check it is public and try again.");
  return capture;
}
