"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { convexActorForEmail, convexMutation } from "@/lib/convexServer";
import { safeErrorMessage } from "@/lib/userError";

const REVIEWERS = new Set(["admin", "director", "ta_lead", "ops"]);

/** These used to throw, so a refusal replaced the page with "could not load" (2 Nov). */
function back(message: string, tone: "ok" | "error" = "error"): never {
  redirect(`/shortlist-decisions?msg=${encodeURIComponent(message)}&tone=${tone}`);
}

async function attempt(done: string, run: () => Promise<unknown>): Promise<never> {
  try {
    await run();
  } catch (e) {
    unstable_rethrow(e);
    back(safeErrorMessage(e, "That could not be saved. Reload the page and try again."));
  }
  revalidatePath("/shortlist-decisions");
  back(done, "ok");
}

async function actor() {
  const user = await getCurrentUser();
  if (!REVIEWERS.has(user.role)) back("Only Admin, Director, TA Lead or Ops can review shortlist replies.");
  const backend = await convexActorForEmail(user.email);
  if (!backend) back("Your account is not connected to the backend. Ask an admin to check your account.");
  return backend;
}

export async function rematchShortlistReply(formData: FormData) {
  const user = await actor();
  return attempt("Reply matched again.", () =>
    convexMutation("mailIntake/decisions:rematch", {
    actorId: user._id,
    reviewId: String(formData.get("reviewId") ?? ""),
    roundId: String(formData.get("roundId") ?? ""),
    }),
  );
}

export async function confirmShortlistReply(formData: FormData) {
  const user = await actor();
  const decisions = [...formData.entries()].flatMap(([key, value]) => {
    if (!key.startsWith("decision:")) return [];
    const applicationId = key.slice("decision:".length);
    const outcome = String(value);
    if (!applicationId || !["shortlisted", "rejected", "hold"].includes(outcome)) return [];
    return [{ applicationId, outcome, evidence: String(formData.get(`evidence:${applicationId}`) ?? "Confirmed from the shortlist reply").slice(0, 240) }];
  });
  if (decisions.length === 0) back("Select at least one candidate decision (shortlist, reject or hold) before confirming.");
  return attempt("Decisions recorded.", () =>
    convexMutation("mailIntake/decisions:confirm", {
    actorId: user._id,
    reviewId: String(formData.get("reviewId") ?? ""),
    decisions,
    note: String(formData.get("note") ?? "").trim() || undefined,
    }),
  );
}

export async function ignoreShortlistReply(formData: FormData) {
  const user = await actor();
  return attempt("Reply ignored.", () =>
    convexMutation("mailIntake/decisions:ignore", {
    actorId: user._id,
    reviewId: String(formData.get("reviewId") ?? ""),
    note: String(formData.get("note") ?? "").trim(),
    }),
  );
}

export async function keepShortlistReplyForReview(formData: FormData) {
  const user = await actor();
  return attempt("Kept for review.", () =>
    convexMutation("mailIntake/decisions:keepForReview", {
    actorId: user._id,
    reviewId: String(formData.get("reviewId") ?? ""),
    note: String(formData.get("note") ?? "").trim() || undefined,
    }),
  );
}
