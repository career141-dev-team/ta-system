// "View as" a real person (21 Nov 2026): an admin looks at the screens exactly as one TA
// sees them - their day, openings, pipeline - to find why "it does not work".
// Read only by construction: the backend takes `as` on read queries only (ta-system
// convex/ui/me.ts) and every write is blocked here while someone is being viewed.
// Lives in this tab only, so a new tab always opens on the admin's own view.
import { useSyncExternalStore } from "react";
import { canViewAs, setRole, type Role } from "@/lib/role";

export type Viewed = { id: string; name: string; role: Role };
const KEY = "ta-ui:viewing";
const subs = new Set<() => void>();
let viewed: Viewed | null = null;
if (typeof window !== "undefined") {
  try {
    viewed = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  } catch {}
}
export const getViewed = () => viewed;
export function setViewed(p: Viewed | null) {
  if (p && !canViewAs()) return;
  viewed = p;
  try {
    if (p) sessionStorage.setItem(KEY, JSON.stringify(p));
    else sessionStorage.removeItem(KEY);
  } catch {}
  // The screens follow the person's own role (a TA's pages, a TA's menu).
  setRole(p ? p.role : "Admin");
  subs.forEach((f) => f());
}
export const useViewed = () =>
  useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => viewed, () => null);

/** The read queries that accept `as` - every other call is the admin's own. */
export const READS_AS = new Set(["ui/day:today", "ui/day:bell", "ui/plan:today", "ui/desk:desk", "ui/myDay:today", "ui/openings:list", "ui/pipeline:board", "ui/opening:summary", "ui/opening:scoops", "ui/opening:postApplicants", "ui/opening:matches", "ui/opening:strategies"]);
export const viewingNote = () => `You are viewing as ${viewed?.name}. This is read only - go back to your own view to change anything.`;
