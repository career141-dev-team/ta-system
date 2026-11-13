"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { DUR, gsap, useExit, useGSAP } from "@/lib/gsap";
import { USER } from "@/lib/user";

// The bell's list and the person's menu (FLOW-CHECK 7.1, 7.3). In the TA System
// the bell opens the latest notifications, each a link to where the work is, with
// the unread count and "Mark all read"; the person's button is a menu with
// People and roles and Sign out. The design draws both as plain circles, so the
// circles stay as drawn and open these on a press.

const CIRCLE = "flex size-[max(2.5rem,34px)] shrink-0 items-center justify-center rounded-full";
const PANEL_OUT = { opacity: 0, y: -6, scale: 0.97 };
const PANEL =
  "rounded-2xl border border-border bg-white shadow-float max-w-[calc(100vw-24px)]";

/** A press opens the panel under its button; an outside press or Escape closes it. */
function usePop() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const shown = useExit(open, panel, PANEL_OUT);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  useGSAP(
    () => {
      if (open && panel.current)
        gsap.fromTo(panel.current, PANEL_OUT, { opacity: 1, y: 0, scale: 1, duration: DUR.fast, transformOrigin: "top right" });
    },
    { dependencies: [open], scope: root },
  );
  return { open, setOpen, root, panel, shown };
}

// Placeholder: sample notifications of the kinds the TA System sends (a reply, a
// strategy from the lead, the 17:30 EOD reminder, a new opening). With the
// backend this is the person's latest 30, one small read, checked again every
// few seconds; a workday one opens Today, the rest open their opening.
type Note = { id: string; title: string; body: string; when: string; href: string; unread: boolean };
const NOTES: Note[] = [
  { id: "n1", title: "Nadeeka Dilshan replied", body: "Senior Manager - Manufacturing · WhatsApp", when: "5 min", href: "/openings/demo", unread: true },
  { id: "n2", title: "A strategy was assigned to you", body: "Your TA Lead asked you to try a new search.", when: "1 h", href: "/openings/demo", unread: true },
  { id: "n3", title: "End-of-day email not sent yet", body: "It is past 17:30 and today's EOD has not gone.", when: "Yesterday", href: "/today", unread: true },
  { id: "n4", title: "Opening assigned to you", body: "You are the primary recruiter on Senior Manager - Manufacturing.", when: "2 days", href: "/openings/demo", unread: false },
];

export function Bell() {
  const { open, setOpen, root, panel, shown } = usePop();
  const [notes, setNotes] = useState(NOTES);
  const unread = notes.filter((n) => n.unread).length;
  const read = (id?: string) => setNotes((all) => all.map((n) => (!id || n.id === id ? { ...n, unread: false } : n)));

  return (
    <div ref={root} className="relative ml-[max(1.1875rem,10px)]">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => setOpen((o) => !o)}
        className={CIRCLE + " relative bg-surface-2 text-ink"}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-1/2" aria-hidden="true">
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        {/* The design's red dot, now only while something is unread. */}
        {unread > 0 && <span className="absolute right-[22%] top-[20%] size-[20%] rounded-full bg-danger" />}
      </button>

      {shown && (
        <div className="absolute right-0 top-full z-[60] pt-2 max-md:fixed max-md:inset-x-3 max-md:top-auto">
          <div ref={panel} className={PANEL + " w-[max(23rem,300px)] max-md:w-full"}>
            <div className="flex items-center px-4 pb-2 pt-3">
              <p className="text-nav font-semibold text-ink">
                Notifications
                {unread > 0 && <span className="ml-2 rounded-md bg-danger-soft px-1.5 py-0.5 text-pill font-semibold text-danger">{unread > 9 ? "9+" : unread} new</span>}
              </p>
              <button type="button" disabled={!unread} onClick={() => read()} className="ml-auto text-pill font-medium text-brand hover:underline disabled:text-ink-2/60 disabled:no-underline">
                Mark all read
              </button>
            </div>
            <ul className="max-h-[min(22rem,60dvh)] overflow-y-auto px-2 [scrollbar-width:thin]">
              {notes.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    prefetch={false}
                    onClick={() => {
                      read(n.id);
                      setOpen(false);
                    }}
                    className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-surface-2"
                  >
                    <span aria-hidden="true" className={"mt-[0.45em] size-[max(0.45rem,6px)] shrink-0 rounded-full " + (n.unread ? "bg-danger" : "bg-transparent")} />
                    <span className="min-w-0 flex-1">
                      <span className={"block text-nav text-ink " + (n.unread ? "font-semibold" : "font-normal")}>{n.title}</span>
                      <span className="block text-pill text-ink-2">{n.body}</span>
                    </span>
                    <span className="shrink-0 text-pill text-ink-2">{n.when}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-4 py-2.5 text-center">
              <Link href="/alerts" prefetch={false} onClick={() => setOpen(false)} className="text-pill font-medium text-brand hover:underline">
                See all alerts
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Item({ href, onPick, children }: { href: string; onPick: () => void; children: ReactNode }) {
  return (
    <Link href={href} prefetch={false} role="menuitem" onClick={onPick} className="block rounded-xl px-3 py-2 text-nav font-medium text-ink hover:bg-surface-2">
      {children}
    </Link>
  );
}

export function Person() {
  const { open, setOpen, root, panel, shown } = usePop();
  const initials = USER.name
    .split(" ")
    .map((w) => w[0])
    .join("");
  const close = () => setOpen(false);

  return (
    <div ref={root} className="relative ml-[max(1.125rem,10px)] shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${USER.name}, ${USER.role}: your menu`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-[max(0.9375rem,9px)] rounded-full text-left"
      >
        <span aria-hidden="true" className={CIRCLE + " bg-ink text-nav font-medium text-white"}>
          {initials}
        </span>
        <span className="hidden leading-tight min-[1200px]:block">
          <span className="block text-nav font-semibold">{USER.name}</span>
          <span className="block text-nav text-ink-2">{USER.role}</span>
        </span>
      </button>

      {shown && (
        <div className="absolute right-0 top-full z-[60] pt-2">
          <div ref={panel} role="menu" className={PANEL + " w-[max(14rem,200px)] p-2"}>
            {/* The name is hidden in the bar on a narrow window; it is always here. */}
            <p className="px-3 pb-2 pt-1.5 leading-tight">
              <span className="block text-nav font-semibold text-ink">{USER.name}</span>
              <span className="block text-pill text-ink-2">{USER.role}</span>
            </p>
            <div className="mx-2 mb-1.5 h-px bg-border" />
            <Item href="/people" onPick={close}>
              People and roles
            </Item>
            <Item href="/signin" onPick={close}>
              Sign out
            </Item>
          </div>
        </div>
      )}
    </div>
  );
}
