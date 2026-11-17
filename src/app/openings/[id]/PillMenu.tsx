"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DUR, HOVER_IN, HOVER_OUT, gsap, useExit, useGSAP, useGlide } from "@/lib/gsap";

export type MenuOption = {
  value: string;
  label: string;
  hint?: string;
  /** A coloured dot (Status, Stage). Filters have none. */
  dot?: string;
  /** What the pill shows when this option is picked, if not `label`
   *  (a filter's "All recruiters" shows as "Recruiter", as in the design). */
  pillLabel?: string;
};

const MENU_OUT = { opacity: 0, y: -6, scale: 0.97 };

/** A pill that opens a small menu on hover: an optional coloured dot per option, an
 *  optional grey hint, and a mark beside the one that is current. Used for the
 *  opening's Status and Stage ("now") and the pipeline's filters (a tick). */
export default function PillMenu({
  options,
  initial,
  prefix,
  title,
  pillClass,
  onChange,
  mark = "now",
}: {
  options: MenuOption[];
  initial: string;
  /** Text before the current label on the pill, e.g. "Stage:" */
  prefix?: string;
  /** Small grey heading at the top of the menu */
  title?: string;
  pillClass: string;
  /** Told the new value when an option is picked. */
  onChange?: (value: string) => void;
  /** Beside the current option: "now" (a state) or a tick (a filter). */
  mark?: "now" | "tick";
}) {
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Only one menu open at a time: opening this one tells the others to close at
  // once. Pointing from one pill to the next had both open together, the closing
  // one still on its grace delay (owner, 12 Nov 2026).
  const me = useId();
  const show = () => {
    window.dispatchEvent(new CustomEvent("pillmenu:open", { detail: me }));
    setOpen(true);
  };
  useEffect(() => {
    const other = (e: Event) => {
      if ((e as CustomEvent<string>).detail === me) return;
      clearTimeout(timer.current);
      setOpen(false);
    };
    window.addEventListener("pillmenu:open", other);
    return () => window.removeEventListener("pillmenu:open", other);
  }, [me]);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Closing, the menu lifts and fades the way it came instead of vanishing.
  const shown = useExit(open, panel, MENU_OUT);
  const current = options.find((o) => o.value === value) ?? options[0];

  // Opens after a short rest (a pointer crossing the toolbar opens nothing), and a
  // short grace so moving from the pill down to the menu does not close it.
  const hoverIn = () => {
    clearTimeout(timer.current);
    if (!open) timer.current = setTimeout(show, HOVER_IN);
  };
  const hoverOut = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), HOVER_OUT);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  // Close on an outside click or Escape.
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

  // One soft highlight that glides from row to row under the pointer (the idea from the
  // sliding-pill navigation), and fades when the pointer leaves the list.
  // The highlight is found from the row itself, so no ref is read while rendering.
  const glide = useGlide();
  const glowOf = (el: Element) => el.closest("[data-glide]")?.querySelector<HTMLElement>("[data-glow]");
  const glideTo = (el: HTMLElement) => glide.to(glowOf(el), { y: el.offsetTop, height: el.offsetHeight });

  // The menu eases in: opacity and a small lift/scale only (cheap, never blocks a frame).
  useGSAP(
    () => {
      if (!open || !panel.current) return;
      // On a narrow screen a menu near the right edge slides left to stay on it.
      const wrap = panel.current.parentElement!;
      wrap.style.left = "0px";
      const over = wrap.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
      if (over > 0) wrap.style.left = -over + "px";
      // No room below (the bottom of a scrolling box, or of the window): open upward
      // instead (owner, 17 Nov 2026: the Today work-type menu hid under the chat's
      // suggestions).
      Object.assign(wrap.style, { top: "", bottom: "", paddingTop: "", paddingBottom: "" });
      let clip: HTMLElement | null = wrap.parentElement;
      while (clip && !/(auto|scroll|hidden)/.test(getComputedStyle(clip).overflowY)) clip = clip.parentElement;
      const limit = Math.min(clip ? clip.getBoundingClientRect().bottom : innerHeight, innerHeight);
      const up = wrap.getBoundingClientRect().bottom > limit - 4;
      if (up) Object.assign(wrap.style, { top: "auto", bottom: "100%", paddingTop: "0", paddingBottom: "0.5rem" });
      gsap.fromTo(
        panel.current,
        { opacity: 0, y: up ? 6 : -6, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: DUR.fast, transformOrigin: up ? "bottom left" : "top left" },
      );
      gsap.from(panel.current.querySelectorAll("[role=menuitem]"), {
        opacity: 0,
        y: -4,
        duration: DUR.fast,
        stagger: 0.03,
      });
    },
    { dependencies: [open], scope: root },
  );

  return (
    // Opens when the pointer is on it and closes a moment after it leaves, like the sliding
    // navigation it follows; a click still toggles it (touch screens, keyboard).
    <div ref={root} className="relative" onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
      <button
        type="button"
        className={pillClass + " transition-colors hover:bg-surface-2" + (open ? " bg-surface-2" : "")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
      >
        {current.dot && <Dot colour={current.dot} />}
        <span>
          {prefix ? <>{prefix} </> : null}
          <b className={prefix ? "font-semibold" : "font-normal"}>{current.pillLabel ?? current.label}</b>
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={"size-[1em] transition-transform " + (open ? "rotate-180" : "")}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {shown && (
        <div className="absolute left-0 top-full z-20 pt-2">
        <div
          ref={panel}
          role="menu"
          className="w-[max(15rem,200px)] rounded-2xl border border-border bg-white py-2 shadow-float"
        >
          {title && <p className="px-4 pb-1 pt-1.5 text-pill font-semibold text-ink-2">{title}</p>}
          <div data-glide className="relative" onMouseLeave={(e) => glide.out(glowOf(e.currentTarget))}>
            <span
              data-glow
              aria-hidden="true"
              style={{ opacity: 0 }}
              className="pointer-events-none absolute inset-x-2 top-0 rounded-xl bg-surface-2"
            />
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitem"
                onMouseEnter={(e) => glideTo(e.currentTarget)}
                onFocus={(e) => glideTo(e.currentTarget)}
                onClick={() => {
                  setValue(o.value);
                  setOpen(false);
                  onChange?.(o.value);
                }}
                className="relative flex w-full items-center gap-3 px-4 py-2 text-left"
              >
                {o.dot && <Dot colour={o.dot} />}
                <span className="min-w-0 flex-1">
                  <span className="block text-nav font-semibold">{o.label}</span>
                  {o.hint && <span className="block text-pill text-ink-2">{o.hint}</span>}
                </span>
                {o.value === value &&
                  (mark === "now" ? (
                    <span className="text-pill font-semibold text-ink-2">now</span>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-[max(0.9rem,12px)] shrink-0 text-brand"
                      aria-label="Picked"
                    >
                      <path d="m5 12 5 5 9-10" />
                    </svg>
                  ))}
              </button>
            ))}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}

function Dot({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ background: colour }}
      className="size-[max(0.5rem,7px)] shrink-0 rounded-full"
    />
  );
}
