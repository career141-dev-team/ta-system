// convex/lib/targetsAccess.ts
//
// Daily targets (3 Nov): who may set them and what a valid target is. Pure, so
// tests/targets can check it. Roles are read as the live database stores them
// (deskRole), so a lead stored as ta_manager / senior_ta still counts.

import { deskRole } from "./feedbackAccess";

/** Leads and admins set and see everyone's targets; a TA sees only their own. */
export function maySetTargets(actor: { role?: string; taRole?: string | null }): boolean {
  const role = deskRole(actor);
  return role === "ta_lead" || role === "admin";
}

/** A whole number from 0 to 1000, or null if it is not one. */
export function cleanTarget(n: unknown): number | null {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 1000 ? n : null;
}

/** Progress as a whole percent, capped at 100; a zero target counts as met. */
export function progressPct(done: number, target: number): number {
  return target <= 0 ? 100 : Math.min(100, Math.round((done / target) * 100));
}
