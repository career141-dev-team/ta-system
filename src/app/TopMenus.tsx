"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { DUR, EASE, gsap } from "@/lib/gsap";
import { USER } from "@/lib/user";
import { markRead, useAlerts, type Alert, type Icon } from "./alerts/data";
import TellUs from "./feedback/TellUs";

// The bell's alerts and the person's menu (owner's design G1, 14 Nov 2026; old system
// FLOW-CHECK 7.1, 7.3). Each opens as a white panel under its button while the page
// behind softens out of focus; a press outside, Escape, or picking something closes it.
// The panels are drawn at the page's top level (a portal), so the softened page and the
// top bar sit under them.

const CIRCLE = "flex size-[max(2.5rem,34px)] shrink-0 items-center justify-center rounded-full";
const PANEL_OUT = { opacity: 0, y: -8, scale: 0.97 };

/** The page behind an open panel: softly out of focus. A press on it closes the panel. */
export function Veil({ onClose }: { onClose: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    gsap.fromTo(el.current, { opacity: 0 }, { opacity: 1, duration: DUR.base, ease: EASE.out });
  }, []);
  return <div ref={el} aria-hidden="true" onPointerDown={onClose} className="fixed inset-0 z-[70] bg-canvas/40 backdrop-blur-[6px]" />;
}

type Place = { top: number; right: number };
/** Under the top bar, right edges lined up with the button, kept inside the window. */
const placeUnder = (el: HTMLElement): Place => {
  const a = el.getBoundingClientRect();
  const bar = document.getElementById("topnav")?.getBoundingClientRect();
  return { top: (bar?.bottom ?? a.bottom) + 6, right: Math.max(12, innerWidth - a.right) };
};

/** A panel at `pos`, over the softened page. */
function Pop({ pos, onClose, children, label, className }: { pos: Place; onClose: () => void; children: ReactNode; label: string; className: string }) {
  const panel = useRef<HTMLDivElement>(null);
  // The latest close, read when Escape is pressed (so the opening runs once).
  const shut = useRef(onClose);
  useLayoutEffect(() => {
    shut.current = onClose;
  });
  useEffect(() => {
    if (!panel.current) return;
    gsap.fromTo(panel.current, PANEL_OUT, { opacity: 1, y: 0, scale: 1, duration: DUR.base, ease: EASE.out, transformOrigin: "top right" });
    const rows = panel.current.querySelectorAll("[data-row]");
    if (rows.length) gsap.from(rows, { opacity: 0, y: -4, duration: DUR.fast, stagger: 0.03, delay: 0.05 });
    const esc = (e: KeyboardEvent) => e.key === "Escape" && shut.current();
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, []);
  return createPortal(
    <>
      <Veil onClose={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-label={label}
        style={{ top: pos.top, right: pos.right, opacity: 0 }}
        className={"fixed z-[71] max-h-[calc(100dvh-7rem)] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl bg-surface shadow-float " + className}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

const ICON: Record<Icon, { path: ReactNode; tint: string }> = {
  task: { path: <path d="M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />, tint: "bg-violet-soft text-violet" },
  chat: { path: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />, tint: "bg-brand-soft text-brand" },
  person: { path: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0" />, tint: "bg-surface-2 text-ink-2" },
  bell: { path: <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9ZM10 19a2 2 0 0 0 4 0" />, tint: "bg-surface-2 text-ink-2" },
};

export function Bell() {
  const [open, setOpen] = useState<Place | null>(null);
  const alerts = useAlerts();
  const unread = alerts.filter((a) => a.unread).length;
  const close = () => setOpen(null);

  const row = (a: Alert) => (
    <li key={a.id} data-row>
      <Link
        href={a.href}
        prefetch={false}
        onClick={() => {
          markRead(a.id);
          close();
        }}
        className={"flex items-center gap-3.5 rounded-md px-3 py-[max(0.75rem,8px)] transition-colors hover:bg-surface-2 " + (a.unread ? "bg-canvas" : "")}
      >
        <span className={"flex size-[max(2.375rem,30px)] shrink-0 items-center justify-center rounded-full " + ICON[a.icon].tint}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[45%]" aria-hidden="true">
            {ICON[a.icon].path}
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small font-medium text-ink">{a.title}</span>
          <span className="block truncate text-caption text-ink-3">{a.body}</span>
        </span>
        {a.unread && <span aria-label="Not read yet" className="size-2 shrink-0 rounded-full bg-brand" />}
      </Link>
    </li>
  );
  const groups: [string, Alert[]][] = [
    ["Needs you", alerts.filter((a) => a.needs)],
    ["Updates", alerts.filter((a) => !a.needs)],
  ];

  return (
    <div className="relative ml-[max(1.1875rem,10px)]">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={!!open}
        aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"}
        onClick={(e) => setOpen(open ? null : placeUnder(e.currentTarget))}
        className={CIRCLE + " relative bg-surface-2 text-ink"}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-1/2" aria-hidden="true">
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && <span className="absolute right-[22%] top-[20%] size-[20%] rounded-full bg-danger" />}
      </button>

      {open && (
        <Pop pos={open} onClose={close} label="Alerts" className="w-[max(32rem,300px)] p-[max(1.125rem,10px)] pt-[max(1.5rem,14px)]">
          <div className="mb-1 flex items-baseline px-3">
            <h2 className="text-h2 text-ink">Alerts</h2>
            <button type="button" disabled={!unread} onClick={() => markRead()} className="ml-auto text-small text-ink-3 hover:text-ink disabled:opacity-50">
              Mark all read
            </button>
          </div>
          {groups.map(([name, list]) =>
            list.length ? (
              <section key={name} className="mb-1">
                <p className="mb-1.5 mt-3 px-3 text-caption font-medium uppercase text-ink-3">{name}</p>
                <ul className="flex flex-col gap-1.5">{list.map(row)}</ul>
              </section>
            ) : null,
          )}
          {!alerts.length && <p className="px-3 py-6 text-center text-small text-ink-3">Nothing new.</p>}
        </Pop>
      )}
    </div>
  );
}

const MENU_ICON: Record<string, ReactNode> = {
  feedback: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />,
  decisions: <path d="M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />,
  people: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0" />,
  tables: <path d="M3 5h18v14H3zM3 10h18M9 10v9" />,
  bin: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z" />,
  dark: <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z" />,
  out: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
};

/** One line of the person's menu: icon, words, and who it is for (as drawn). */
function MenuRow({ icon, label, hint, href, onClick }: { icon: string; label: string; hint?: string; href?: string; onClick?: () => void }) {
  const inner = (
    <>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-[max(1.25rem,16px)] shrink-0 text-ink-2" aria-hidden="true">
        {MENU_ICON[icon]}
      </svg>
      <span className="flex-1 text-small text-ink">{label}</span>
      {hint && <span className="text-caption text-ink-3">{hint}</span>}
    </>
  );
  const cls = "flex w-full items-center gap-3.5 rounded-md px-2.5 py-[max(0.6rem,7px)] text-left transition-colors hover:bg-surface-2";
  return (
    <li data-row role="none">
      {href ? (
        <Link href={href} prefetch={false} role="menuitem" onClick={onClick} className={cls}>
          {inner}
        </Link>
      ) : (
        <button type="button" role="menuitem" onClick={onClick} className={cls}>
          {inner}
        </button>
      )}
    </li>
  );
}

export function Person() {
  const [open, setOpen] = useState<Place | null>(null);
  const [tell, setTell] = useState(false);
  const [dark, setDark] = useState(false);
  const initials = USER.name
    .split(" ")
    .map((w) => w[0])
    .join("");
  const close = () => setOpen(null);

  return (
    <div className="relative ml-[max(1.125rem,10px)] shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!open}
        aria-label={`${USER.name}, ${USER.role}: your menu`}
        onClick={(e) => setOpen(open ? null : placeUnder(e.currentTarget))}
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

      {open && (
        <Pop pos={open} onClose={close} label="Your menu" className="w-[max(20rem,260px)] p-[max(0.875rem,8px)] pt-[max(1.375rem,12px)]">
          <p className="px-2.5 pb-3 leading-tight">
            <span className="block text-body font-medium text-ink">{USER.name}</span>
            <span className="block text-caption text-ink-3">{USER.role}</span>
          </p>
          <ul role="menu" className="flex flex-col">
            <MenuRow
              icon="feedback"
              label="Feedback & support"
              onClick={() => {
                close();
                setTell(true);
              }}
            />
            <MenuRow icon="decisions" label="Shortlist decisions" hint="leads" href="/decisions" onClick={close} />
            <MenuRow icon="people" label="People & roles" hint="admin" href="/people" onClick={close} />
            <MenuRow icon="tables" label="Excel Tables" hint="TA Support" href="/excel-tables" onClick={close} />
            <MenuRow icon="bin" label="Bin" hint="7 days" href="/bin" onClick={close} />
            <MenuRow icon="settings" label="Settings" hint="admin" href="/settings" onClick={close} />
            <li role="separator" className="mx-2.5 my-1.5 h-px bg-border" />
            <MenuRow icon="dark" label="Dark mode" hint={dark ? "not designed yet" : undefined} onClick={() => setDark(true)} />
            <MenuRow icon="out" label="Sign out" href="/signin" onClick={close} />
          </ul>
        </Pop>
      )}
      {tell && <TellUs onClose={() => setTell(false)} />}
    </div>
  );
}
