// The bell's alerts (owner's design G1, 14 Nov 2026): "Needs you" (something to do)
// above "Updates" (good to know). Old system: the person's latest notifications, each a
// link to where the work is, unread ones marked, "Mark all read".
// ponytail: sample alerts in memory; with the backend, the notifications table.

import { useSyncExternalStore } from "react";

export type Icon = "task" | "chat" | "person" | "bell";
export type Alert = { id: string; icon: Icon; title: string; body: string; href: string; needs: boolean; unread: boolean };

let alerts: Alert[] = [
  { id: "a1", icon: "task", title: "Rashmi gave you strategies", body: "Finance Manager · accept to start", href: "/openings/demo", needs: true, unread: true },
  { id: "a2", icon: "chat", title: "Director replied on the SAP set", body: "2 shortlisted — book interviews", href: "/openings/demo", needs: true, unread: true },
  { id: "a3", icon: "person", title: "You were added to HR Business Partner", body: "Dialog Axiata · by Rashmi", href: "/openings/demo", needs: false, unread: false },
  { id: "a4", icon: "bell", title: "Kasun Perera replied on WhatsApp", body: "Salary and notice read by AI", href: "/openings/demo", needs: false, unread: false },
];

const listeners = new Set<() => void>();
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
export const useAlerts = () => useSyncExternalStore(subscribe, () => alerts, () => alerts);
function set(next: Alert[]) {
  alerts = next;
  listeners.forEach((f) => f());
}
export const markRead = (id?: string) => set(alerts.map((a) => (!id || a.id === id ? { ...a, unread: false } : a)));
/** A new update rings the bell (newest first). */
export const pushAlert = (a: Omit<Alert, "id" | "unread">) => set([{ ...a, id: `a${Date.now()}`, unread: true }, ...alerts]);
