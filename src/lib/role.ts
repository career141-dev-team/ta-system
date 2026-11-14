// Who is looking: until sign-in is wired, the person's menu has "View as" so each
// role's home and rights can be seen (owner 14 Nov 2026: homes for lead, Director, Ops).
// ponytail: kept in this browser; with sign-in it is the person's real role.
import { useSyncExternalStore } from "react";

export type Role = "TA" | "Lead" | "Director" | "Ops";
export const ROLES: Role[] = ["TA", "Lead", "Director", "Ops"];
const KEY = "ta-ui:role";
const subs = new Set<() => void>();
const read = (): Role => {
  try {
    const r = localStorage.getItem(KEY) as Role | null;
    return r && ROLES.includes(r) ? r : "TA";
  } catch {
    return "TA";
  }
};
export const useRole = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    read,
    () => "TA" as Role,
  );
export function setRole(r: Role) {
  try {
    localStorage.setItem(KEY, r);
  } catch {}
  subs.forEach((f) => f());
}
/** Desk-wide roles (old system): see every TA, delete from the Bin early. */
export const deskWide = (r: Role) => r !== "TA";

/** Who the top bar shows for each role, until sign-in (the names in the owner's designs). */
export const PERSON: Record<Role, { name: string; title: string }> = {
  TA: { name: "Chathura Sampath", title: "Talent Acquisition" },
  Lead: { name: "Rashmi Jayawardena", title: "TA Lead" },
  Director: { name: "Nadeesha Perera", title: "Director" },
  Ops: { name: "Kavindi Silva", title: "Ops" },
};
