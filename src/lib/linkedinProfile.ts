// "Extract with AI" on Excel Tables: open ONE LinkedIn profile with harvestapi's profile
// scraper ($0.004, no email) and hand back the parts a TA reads. Shared by the local route
// (src/app/api/linkedin-profile/route.ts) and the dev link's Cloudflare function
// (functions/api/linkedin-profile.ts). The actor's output is only partly documented, so
// every field is read defensively (same as linkedinSearch.ts).
const PROFILE = "harvestapi~linkedin-profile-scraper";

export type Profile = {
  name: string;
  headline: string;
  place: string;
  title: string;
  company: string;
  about: string;
  skills: string[];
  experience: { title: string; company: string; period: string }[];
  education: { school: string; degree: string }[];
};

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown) => (Array.isArray(v) ? (v as Raw[]) : []);
const when = (d: unknown) => {
  const x = d as Raw | undefined;
  return [str(x?.month).slice(0, 3), x?.year ? String(x.year) : ""].filter(Boolean).join(" ");
};

function toProfile(p: Raw): Profile {
  const jobs = arr(p.experience);
  const now = jobs[0];
  return {
    name: [str(p.firstName), str(p.lastName)].filter(Boolean).join(" ") || str(p.name),
    headline: str(p.headline),
    place: typeof p.location === "string" ? p.location : str((p.location as Raw | undefined)?.linkedinText),
    title: str(now?.position),
    company: str(arr(p.currentPosition)[0]?.companyName) || str(now?.companyName),
    about: str(p.about).slice(0, 1500),
    skills: arr(p.skills).map((s) => (typeof s === "string" ? s : str(s.name))).filter(Boolean).slice(0, 30),
    experience: jobs.slice(0, 12).map((e) => ({
      title: str(e.position),
      company: str(e.companyName),
      period: [when(e.startDate), str((e.endDate as Raw | undefined)?.text) || when(e.endDate) || "Present"].filter(Boolean).join(" – "),
    })),
    education: arr(p.education).slice(0, 5).map((e) => ({ school: str(e.schoolName), degree: [str(e.degree), str(e.fieldOfStudy)].filter(Boolean).join(", ") })),
  };
}

/** Validates the link and opens the profile. Returns a Response for either host. */
export async function linkedinProfile(token: string | undefined, body: unknown): Promise<Response> {
  if (!token) return Response.json({ error: "Extract is not switched on yet: the Apify key is not set." }, { status: 500 });
  const url = str((body as Raw | null)?.url).trim();
  // Trust boundary: only a LinkedIn profile link is passed on to Apify.
  if (!/^https:\/\/([a-z]+\.)?linkedin\.com\/in\/[\w%-]+\/?(\?.*)?$/i.test(url))
    return Response.json({ error: "That is not a LinkedIn profile link." }, { status: 400 });
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/${PROFILE}/run-sync-get-dataset-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ profileScraperMode: "Profile details no email ($4 per 1k)", queries: [url] }),
    });
    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) throw new Error(str((data as { error?: { message?: string } } | null)?.error?.message) || `Apify said ${res.status}`);
    const first = arr(data)[0];
    if (!first) return Response.json({ error: "LinkedIn showed nothing for that profile (private, or the link is wrong)." }, { status: 404 });
    return Response.json(toProfile(first));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Apify failed" }, { status: 502 });
  }
}
