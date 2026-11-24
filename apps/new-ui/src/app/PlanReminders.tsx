"use client";

// AURA's day-plan reminders on screen, phase 2 (owner 19 Nov 2026, docs/AURA-DAY-AGENT.md
// section 6). The backend decides when a reminder is due (ui/planRemind) and writes it
// to the bell and to `lastReminder` on the TA's plan. This watcher, on every page, turns
// each new one into the pet's words - and, when the AURA tab is in the background and
// the TA allowed it, a browser pop-up (owner's Decision 3: app + browser, no WhatsApp).
// A reminder already older than two minutes when the page opens is not repeated.

import { useEffect, useRef } from "react";
import { door, useDoorQuery } from "@/lib/backend";
import { useSignedInPerson } from "@/lib/role";
import { petSay, type PetMood } from "@/lib/pet";

type Reminder = { at: number; text: string; key?: string; moment: string };
type Read = { ok: true; plan: { lastReminder: Reminder | null } | null } | { ok: false } | undefined;

const MOOD: Record<string, PetMood> = { start: "working", near: "waiting", over: "failed", still: "waiting", approve: "waiting", done: "done" };
const SEEN = "ta-ui:aura-reminder-seen";

/** Ask once, from a press (browsers only allow it then): may AURA pop up when the tab is hidden? */
export function askForPopups() {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
  } catch {
    // Some browsers have no Notification at all: the pet and the bell still work.
  }
}

export default function PlanReminders() {
  const signed = useSignedInPerson() !== null;
  const read = useDoorQuery(door.planToday, signed ? {} : "skip") as Read;
  const last = read && read.ok ? read.plan?.lastReminder ?? null : null;
  const first = useRef(true);

  useEffect(() => {
    if (!last) return;
    let seen = 0;
    try {
      seen = Number(localStorage.getItem(SEEN) ?? 0);
    } catch {}
    if (last.at <= seen) return;
    try {
      localStorage.setItem(SEEN, String(last.at));
    } catch {}
    // On opening a page, an older reminder is history, not news.
    const stale = first.current && Date.now() - last.at > 2 * 60_000;
    first.current = false;
    if (stale) return;
    petSay(MOOD[last.moment] ?? "waiting", last.text);
    try {
      if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        const n = new Notification("AURA", { body: last.text, tag: `aura-${last.key ?? last.moment}`, icon: "/aura-mark.png" });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      }
    } catch {
      // A pop-up that cannot be shown is not a failure: the bell keeps it.
    }
  }, [last]);

  useEffect(() => {
    if (read && read.ok && !read.plan?.lastReminder) first.current = false;
  }, [read]);

  return null;
}
