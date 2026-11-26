// Who is looking: until sign-in is wired, the person's menu has "View as" so each
// role's home and rights can be seen (owner 14 Nov 2026: homes for lead, Director, Ops).
// Signed out: kept in this browser. Signed in: the real role, View as for this tab only.
import { useSyncExternalStore } from "react";

export type Role = "TA" | "TA Support" | "Lead" | "Admin" | "Director" | "Ops";
// Admin is its own view (owner 19 Nov 2026): an admin keeps the team dashboard, a TA
// Lead starts on the AURA chat. Rights stay the lead's (deskWide).
export const ROLES: Role[] = ["TA", "TA Support", "Lead", "Admin", "Director", "Ops"];
const KEY = "ta-ui:role";
const subs = new Set<() => void>();
/** The signed-in person (src/lib/backend.tsx), who wins over "View as" (18 Nov). */
type Signed = { role: Role; name: string; title: string; email: string };
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
/** TEMPORARY (owner 19 Nov 2026, while the new UI is built): "View as" any role, to check
 *  each role's screens on the live site - for these two admin accounts only (owner 26 Nov:
 *  every admin account was offered it). It only changes what is drawn; the backend still
 *  judges every call by the real account. Remove before the switch-over (Track E step E9). */
const VIEWERS = ["sanjeev@career141.com", "binath@career141.com"];
export const canViewAs = () => !signed || (signed.role === "Admin" && VIEWERS.includes(signed.email.toLowerCase()));
/** The admin tools (People & roles, quick access) are for admin accounts only (25 Nov); the sample, signed out, shows them as before. */
export const useIsAdmin = () => {
  const me = useSignedInPerson();
  return !me || me.role === "Admin";
};
// Signed in, "View as" lives only in this tab (sessionStorage, 20 Nov 2026): kept in
// localStorage it outlived the session, so the real admin came back as "TA" with the
// Strategy Planner gone. A fresh tab always opens on the real role. The preview
// (signed out) keeps its pick in localStorage as before.
const VIEW_KEY = "ta-ui:view-as";
const store = () => (signed ? sessionStorage : localStorage);
const stored = (): Role | null => {
  try {
    const r = store().getItem(signed ? VIEW_KEY : KEY) as Role | null;
    return r && ROLES.includes(r) ? r : null;
  } catch {
    return null;
  }
};
const read = (): Role => {
  if (signed && !canViewAs()) return signed.role;
  return stored() ?? (signed ? "Admin" : "TA");
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
    store().setItem(signed ? VIEW_KEY : KEY, r);
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
  Admin: { name: "Desk Admin", title: "Admin" },
  Director: { name: "Nadeesha Perera", title: "Director" },
  Ops: { name: "Kavindi Silva", title: "Ops" },
};

/** Who is looking, and what the old system lets them do, in one place - so every
 *  screen follows "View as" (16 Nov 2026: the top bar and the homes followed it,
 *  while the Pipeline's rules, the workday gate and the whole-job views still read
 *  a fixed sample TA). `lead` is the old `opening.manage` / whole-job view: TA Lead,
 *  Director, Ops (and admin). */
/** Who the top bar names: the signed-in person, else the sample one for the role. */
// A live build only draws its screens signed in, so until whoAmI answers there is no
// name yet - never the sample person's (20 Nov 2026: "Good evening, Rashmi" for the admin).
const LIVE_BUILD = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
export const personOf = (role: Role): { name: string; title: string } =>
  !signed
    ? LIVE_BUILD ? { name: "", title: "" } : PERSON[role]
    : signed.role === role ? { name: signed.name, title: signed.title } : { name: signed.name, title: `Viewing as ${role}` };

export function useMe() {
  const role = useRole();
  useSignedInPerson();
  const { name, title } = personOf(role);
  return { role, name, first: name.split(" ")[0], title, lead: deskWide(role) };
}
