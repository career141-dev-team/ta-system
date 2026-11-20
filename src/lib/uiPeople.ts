/**
 * The new UI's People and roles (R1, 20 Nov) - pure half.
 *
 * new.career141.com posts `{ do, ...fields }` to src/app/api/ui/people; this says
 * which old /people action each `do` runs and which of the old forms' own field
 * names it may carry. Every rule (admin only, never your own role, an invite
 * writes the roster first) stays inside those actions.
 */
import type { User } from "@/data/types";

const PERSON = ["name", "email", "phone", "routingEmail", "role", "workCountry"] as const;

export const PEOPLE_ACTIONS = {
  add: PERSON,
  update: ["userId", ...PERSON],
  invite: PERSON,
  revoke: ["invitationId"],
  active: ["userId", "active"],
} as const;
export type PeopleAction = keyof typeof PEOPLE_ACTIONS;

/** One person as the new screen shows them: what the old list shows, nothing more. */
export function personRow(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone ?? "",
    routingEmail: u.routingEmail ?? "",
    role: u.role,
    active: u.isActive,
    workCountry: u.workCountry ?? "Sri Lanka",
  };
}

/** The old page's order: people still on the desk first, then by name. */
export function rosterOrder(users: User[]): User[] {
  return users.slice().sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
}
