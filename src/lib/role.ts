// Who is looking: until sign-in is wired, the person's menu has "View as" so each
// role's home and rights can be seen (owner 14 Nov 2026: homes for lead, Director, Ops).
// ponytail: kept in this browser; with sign-in it is the person's real role.
import { useSyncExternalStore } from "react";

export type Role = "TA" | "TA Support" | "Lead" | "Director" | "Ops";
export const ROLES: Role[] = ["TA", "TA Support", "Lead", "Director", "Ops"];
const KEY = "ta-ui:role";
const subs = new Set<() => void>();
/** The signed-in person (src/lib/backend.tsx), who wins over "View as" (18 Nov). */
type Signed = { role: Role; name: string; title: string };
let signed: Signed | null = null;
export function setSignedIn(p: Signed | null) {
  if (JSON.stringify(p) === JSON.stringify(signed)) return;
  signed = p;
  subs.forEach((f) => f());
}
/** True once a real sign-in decides who is looking; "View as" steps aside then. */
export const useSignedInPerson = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => signed,
    () => null,
  );
const read = (): Role => {
  if (signed) return signed.role;
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
export const deskWide = (r: Role) => r !== "TA" && r !== "TA Support";
/** A TA or TA Support works a day of their own (Today's workday), the others have a home. */
export const worksADay = (r: Role) => r === "TA" || r === "TA Support";

/** Who the top bar shows for each role, until sign-in (the names in the owner's designs). */
export const PERSON: Record<Role, { name: string; title: string }> = {
  TA: { name: "Chathura Sampath", title: "Talent Acquisition" },
  "TA Support": { name: "Hasini Fernando", title: "TA Support" },
  Lead: { name: "Rashmi Jayawardena", title: "TA Lead" },
  Director: { name: "Nadeesha Perera", title: "Director" },
  Ops: { name: "Kavindi Silva", title: "Ops" },
};

/** Who is looking, and what the old system lets them do, in one place - so every
 *  screen follows "View as" (16 Nov 2026: the top bar and the homes followed it,
 *  while the Pipeline's rules, the workday gate and the whole-job views still read
 *  a fixed sample TA). `lead` is the old `opening.manage` / whole-job view: TA Lead,
 *  Director, Ops (and admin). */
/** Who the top bar names: the signed-in person, else the sample one for the role. */
export const personOf = (role: Role): { name: string; title: string } =>
  signed && signed.role === role ? { name: signed.name, title: signed.title } : PERSON[role];

export function useMe() {
  const role = useRole();
  useSignedInPerson();
  const { name, title } = personOf(role);
  return { role, name, first: name.split(" ")[0], title, lead: deskWide(role) };
}
