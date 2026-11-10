// src/lib/websiteJobs.ts
//
// Jobs on career141.com (10 Nov). The ops people post the jobs to the website,
// not the TAs, so each opening carries one switch: on, it is listed on the
// website; off, it is gone. One switch per opening, shown on the Openings list
// and on the job's own bar, so a job already posted shows as on wherever you
// look and is never posted twice.
//
// Shared by the screens, the server action and the backend
// (convex/ta/website.ts), so all three answer "who may press it" and "what
// the website sees" the same way.

import type { Role } from "@/data/types";

/** The house setting holding who besides an admin may press the switch. */
export const WEBSITE_POSTERS_KEY = "websitePosters";

export interface WebsitePosters {
  taLead: boolean;
  ops: boolean;
}

/** Ops post the jobs, so they have it from the start; a TA lead only when an admin ticks it. */
export const DEFAULT_WEBSITE_POSTERS: WebsitePosters = { taLead: false, ops: true };

export function parseWebsitePosters(raw: string | null | undefined): WebsitePosters {
  try {
    const v = JSON.parse(raw ?? "");
    return {
      taLead: typeof v?.taLead === "boolean" ? v.taLead : DEFAULT_WEBSITE_POSTERS.taLead,
      ops: typeof v?.ops === "boolean" ? v.ops : DEFAULT_WEBSITE_POSTERS.ops,
    };
  } catch {
    return { ...DEFAULT_WEBSITE_POSTERS };
  }
}

/** An admin always; a TA lead or ops person when the admin has ticked them. */
export function canPostToWebsite(role: Role | string, posters: WebsitePosters): boolean {
  if (role === "admin") return true;
  if (role === "ta_lead") return posters.taLead;
  if (role === "ops") return posters.ops;
  return false;
}

/** Why the switch cannot go on, or null when it can. Status is the app's (open/on_hold/closed/filled). */
export function websiteRefusal(job: { status: string; jdStatus: string | null | undefined }): string | null {
  if (job.status !== "open") return "Only an open job can go on the website.";
  if (job.jdStatus !== "approved") return "Approve the JD first. The website shows the approved JD.";
  return null;
}

/** The mailbox website applicants write to; the TA System already reads it and files a CV by its subject. */
export const WEBSITE_APPLY_EMAIL = "cv@career141.com";

export interface WebsiteJob {
  id: string;
  title: string;
  locations: string[];
  description: string;
  skills: string[];
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  postedAt: number;
  applyEmail: string;
  applySubject: string;
}

/**
 * What the website may show, or null when the job is not on it. Only listed,
 * open jobs with an approved JD. Never the client's name, the salary or the
 * people on it: those are the desk's, not the public's. A job that goes on hold
 * or closes drops off by itself, and comes back if it is reopened with the
 * switch still on.
 */
export function websiteJob(job: {
  _id: string;
  title: string;
  status: string;
  jdStatus?: string | null;
  websiteListedAt?: number | null;
  jobDescription?: string;
  location?: string;
  taLocations?: string[];
  requiredSkills?: string[];
  experienceMinYears?: number | null;
  experienceMaxYears?: number | null;
  binnedAt?: number | null;
  deletingAt?: number | null;
}): WebsiteJob | null {
  if (!job.websiteListedAt || job.binnedAt || job.deletingAt) return null;
  // The backend's "draft" and "active" are both an open job (src/data/convex/map.ts).
  if (job.status !== "active" && job.status !== "draft") return null;
  if (job.jdStatus !== "approved") return null;
  const title = job.title.trim();
  return {
    id: String(job._id),
    title,
    locations: job.taLocations?.length ? job.taLocations : job.location ? [job.location] : [],
    description: job.jobDescription ?? "",
    skills: job.requiredSkills ?? [],
    experienceMinYears: job.experienceMinYears ?? null,
    experienceMaxYears: job.experienceMaxYears ?? null,
    postedAt: job.websiteListedAt,
    applyEmail: WEBSITE_APPLY_EMAIL,
    applySubject: `Application: ${title}`,
  };
}
