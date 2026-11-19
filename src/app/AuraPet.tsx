"use client";

// A Petdex pet (the person picks which, or hides it: src/lib/pet.ts) keeps AURA company
// on every board (19 Nov 2026). The sheet is the Petdex atlas: 8 columns of 192x208
// frames, 9 or 11 rows; rows 0-8 are the states below.
// It works like an agent (owner 19 Nov: "reacts and talks"): petSay() anywhere in the app
// makes it run while AURA works, jump when something went through, droop when it was
// refused and wait when something needs the person, with one line in a bubble. Every
// Toast says it too, so every action already in the app reaches it.
// Drag it anywhere; it runs the way you pull it and stays where you leave it (per person).
// A click (not a drag) opens a small "Ask AURA" box that goes to the AURA chat.
// "Change" under it, or "My pet" in the name menu, opens the picker.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { DUR, EASE, gsap } from "@/lib/gsap";
import { PETS, useMyPet, type PetMood } from "@/lib/pet";
import { useAlerts } from "./alerts/data";
import { Veil } from "./TopMenus";
import { Toggle } from "./strategy/ui";

const W = 120; // shown frame size = 0.625 of 192x208 (owner 19 Nov: slightly bigger)
const H = 130;
/** loops 0 = keeps going until something else happens; otherwise back to idle after. */
const STATES = {
  idle: { row: 0, frames: 6, ms: 180, loops: 0 },
  right: { row: 1, frames: 8, ms: 90, loops: 0 },
  left: { row: 2, frames: 8, ms: 90, loops: 0 },
  waving: { row: 3, frames: 4, ms: 120, loops: 2 },
  jumping: { row: 4, frames: 5, ms: 110, loops: 2 },
  failed: { row: 5, frames: 8, ms: 130, loops: 1 },
  waiting: { row: 6, frames: 6, ms: 160, loops: 0 },
  running: { row: 7, frames: 6, ms: 100, loops: 0 },
} as const;
type State = keyof typeof STATES;
const MOOD: Record<PetMood, { state: State; ms: number }> = {
  working: { state: "running", ms: 15000 },
  done: { state: "jumping", ms: 4500 },
  failed: { state: "failed", ms: 6000 },
  waiting: { state: "waiting", ms: 7000 },
};

/** One frame of a sheet as a picture; the height follows the sheet's own row count. */
const frameStyle = (id: string, w: number, h: number, col = 0, row = 0) => ({
  width: w,
  height: h,
  backgroundImage: `url(/pets/${id}.webp)`,
  backgroundSize: `${8 * w}px auto`,
  backgroundPosition: `-${col * w}px -${row * h}px`,
});

const PILL = "rounded-full bg-surface px-3 py-1 text-caption font-medium text-ink-2 shadow-float transition-colors hover:text-ink";
const DOT: Record<PetMood, string> = { working: "bg-info", done: "bg-success", failed: "bg-danger", waiting: "bg-warn" };

/** Kept inside the window, so a smaller window never loses the pet. */
/** clientWidth, not innerWidth: innerWidth counts the scroll bar, which hid part of the pet. */
const noop = () => () => {};

// Never below 0: in a window narrower than the pet, it stays at the edge rather than off screen.
const clamp = (r: number, b: number) =>
  typeof window === "undefined"
    ? { right: r, bottom: b }
    : {
        right: Math.max(0, Math.min(r, document.documentElement.clientWidth - W)),
        bottom: Math.max(0, Math.min(b, document.documentElement.clientHeight - H - 34)),
      };

export default function AuraPet() {
  const [state, setState] = useState<State>("idle");
  const [frame, setFrame] = useState(0);
  const [picking, setPicking] = useState(false);
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState<{ mood: PetMood; text: string } | null>(null);
  const [live, setLive] = useState<{ right: number; bottom: number } | null>(null);
  const { pet, hidden, at, moveTo } = useMyPet();
  const alerts = useAlerts();
  const quiet = useRef<ReturnType<typeof setTimeout>>(undefined);
  const drag = useRef<{ x: number; y: number; r: number; b: number; moved: boolean } | null>(null);

  // the frames of the state it is in
  useEffect(() => {
    if (hidden) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const { frames, ms, loops } = STATES[state];
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      if (loops && n >= frames * loops) return setState("idle");
      setFrame(n % frames);
    }, ms);
    return () => clearInterval(id);
  }, [state, hidden]);

  // what AURA is doing (petSay), and the picker opened from the name menu
  useEffect(() => {
    const hear = (e: Event) => {
      const { mood, text } = (e as CustomEvent<{ mood: PetMood; text: string }>).detail;
      setState(MOOD[mood].state);
      setSaid({ mood, text });
      clearTimeout(quiet.current);
      quiet.current = setTimeout(() => {
        setSaid(null);
        setState((s) => (s === "running" || s === "waiting" ? "idle" : s));
      }, MOOD[mood].ms);
    };
    const pick = () => setPicking(true);
    addEventListener("aura:pet", hear);
    addEventListener("aura:pet-picker", pick);
    return () => {
      removeEventListener("aura:pet", hear);
      removeEventListener("aura:pet-picker", pick);
      clearTimeout(quiet.current);
    };
  }, []);

  // once a visit: what is waiting for the person
  const unread = alerts.filter((a) => a.unread).length;
  const told = useRef(false);
  useEffect(() => {
    if (told.current || hidden || !unread) return;
    told.current = true;
    const t = setTimeout(() => window.dispatchEvent(new CustomEvent("aura:pet", { detail: { mood: "waiting", text: `${unread} ${unread === 1 ? "alert needs" : "alerts need"} you. Open the bell.` } })), 1500);
    return () => clearTimeout(t);
  }, [unread, hidden]);

  // The first render matches the server's (no window yet); the window's size is read after.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const place = mounted ? clamp(live?.right ?? at.right, live?.bottom ?? at.bottom) : { right: 12, bottom: 12 };

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, r: place.right, b: place.bottom, moved: false };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return; // a click, not a drag
    if (!d.moved) setAsking(false);
    d.moved = true;
    setLive(clamp(d.r - dx, d.b - dy));
    setState(e.movementX > 0 ? "right" : e.movementX < 0 ? "left" : (s) => s);
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      if (live) moveTo(live.right, live.bottom);
      setLive(null);
      setState("idle");
    } else {
      setAsking((v) => !v);
      setState("waving");
    }
  };

  return (
    <>
      <div className="fixed z-30 hidden flex-col items-center md:flex" style={place}>
        {hidden ? (
          <button type="button" onClick={() => setPicking(true)} className={PILL}>
            Show my pet
          </button>
        ) : (
          <div className="group relative flex flex-col items-center gap-1">
            {asking ? (
              <Ask onClose={() => setAsking(false)} />
            ) : (
              said && (
                <p role="status" className="absolute bottom-full right-0 mb-1 flex w-max max-w-[max(17rem,220px)] items-start gap-2 rounded-md bg-surface px-3.5 py-2.5 text-small text-ink shadow-float">
                  <span className={"mt-[0.45em] size-2 shrink-0 rounded-full " + DOT[said.mood]} aria-hidden="true" />
                  <span className="line-clamp-3">{said.text}</span>
                </p>
              )
            )}
            <button
              type="button"
              aria-label={`${pet.name}, your AURA companion. Press to ask AURA, drag to move.`}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onKeyDown={(e) => e.key === "Enter" && setAsking((v) => !v)}
              className={"touch-none select-none " + (live ? "cursor-grabbing" : "cursor-grab")}
              style={frameStyle(pet.id, W, H, frame % STATES[state].frames, STATES[state].row)}
            />
            <button type="button" onClick={() => setPicking(true)} className={PILL + " opacity-0 focus-visible:opacity-100 group-hover:opacity-100"}>
              Change
            </button>
          </div>
        )}
      </div>
      {picking && <Picker onClose={() => setPicking(false)} />}
    </>
  );
}

/** A click on the pet: one line to AURA, answered in the AURA chat. */
function Ask({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const box = useRef<HTMLFormElement>(null);
  // The latest close, read on Escape: the effect must run once. With onClose as a
  // dependency it re-ran on every sprite frame (a new function each render), restarting
  // the fade-in every 0.2 s - the box flickered half-seen (owner 19 Nov: "glitching").
  const shut = useRef(onClose);
  useLayoutEffect(() => {
    shut.current = onClose;
  });
  useEffect(() => {
    const t = gsap.fromTo(box.current, { opacity: 0, y: 6, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: DUR.base, ease: EASE.out, transformOrigin: "bottom right" });
    const esc = (e: KeyboardEvent) => e.key === "Escape" && shut.current();
    addEventListener("keydown", esc);
    return () => {
      t.kill();
      removeEventListener("keydown", esc);
    };
  }, []);
  return (
    <form
      ref={box}
      onSubmit={(e) => {
        e.preventDefault();
        if (!q.trim()) return;
        onClose();
        router.push(`/database?q=${encodeURIComponent(q.trim())}`);
      }}
      className="absolute bottom-full right-0 mb-1 w-[max(20rem,260px)] rounded-md bg-surface p-3 shadow-float"
    >
      <p className="mb-2 px-1 text-caption font-medium text-ink-3">Ask AURA</p>
      <span className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-4 pr-1 focus-within:ring-2 focus-within:ring-brand/30">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find, plan or open anything" aria-label="Ask AURA" className="min-w-0 flex-1 bg-transparent py-1.5 text-small text-ink outline-none placeholder:text-ink-3" />
        <button type="submit" aria-label="Ask" disabled={!q.trim()} className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-opacity disabled:opacity-30">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4">
            <path d="M12 19V5m0 0-6 6m6-6 6 6" />
          </svg>
        </button>
      </span>
    </form>
  );
}

/** The picker: lifts out of the bottom-right corner over the softened page. */
function Picker({ onClose }: { onClose: () => void }) {
  const { pet, hidden, choose, setHidden } = useMyPet();
  const panel = useRef<HTMLDivElement>(null);
  const shut = useRef(onClose);
  useLayoutEffect(() => {
    shut.current = onClose;
  });
  useEffect(() => {
    const t = gsap.fromTo(
      panel.current,
      { opacity: 0, y: 8, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: DUR.base, ease: EASE.out, transformOrigin: "bottom right" },
    );
    const esc = (e: KeyboardEvent) => e.key === "Escape" && shut.current();
    addEventListener("keydown", esc);
    return () => {
      t.kill();
      removeEventListener("keydown", esc);
    };
  }, []);

  return createPortal(
    <>
      <Veil onClose={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-label="Your pet"
        style={{ opacity: 0 }}
        className="fixed bottom-[max(11rem,176px)] right-3 z-[71] w-[max(24rem,320px)] max-w-[calc(100vw-24px)] rounded-xl bg-surface p-[max(1.25rem,14px)] shadow-float"
      >
        <div className="flex items-start justify-between gap-3 px-1">
          <div className="leading-tight">
            <p className="text-body font-medium text-ink">Your pet</p>
            <p className="mt-0.5 text-caption text-ink-3">Keeps you company on every board. Only you see it.</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="size-4">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div role="radiogroup" aria-label="Pick a pet" className="mt-4 grid grid-cols-4 gap-2">
          {PETS.map((p) => {
            const on = p.id === pet.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(p.id)}
                className={
                  "relative flex flex-col items-center gap-1.5 rounded-md px-1 pb-2 pt-2.5 transition-colors " +
                  (on ? "bg-brand-tint ring-1 ring-brand" : "bg-canvas hover:bg-surface-2")
                }
              >
                {on && (
                  <span aria-hidden="true" className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-brand text-white">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-2.5">
                      <path d="m5 12 5 5 9-10" />
                    </svg>
                  </span>
                )}
                <span aria-hidden="true" className={"block shrink-0 " + (hidden && on ? "opacity-40" : "")} style={frameStyle(p.id, 52, 56)} />
                <span className={"line-clamp-2 text-center text-caption font-medium leading-tight " + (on ? "text-brand" : "text-ink-2")}>{p.name}</span>
              </button>
            );
          })}
        </div>

        <div className="my-4 h-px bg-border" />
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="leading-tight">
            <p className="text-small font-medium text-ink">Show on my boards</p>
            <p className="mt-0.5 text-caption text-ink-3">{hidden ? "Hidden. Pick a pet or switch it on." : "Bottom right corner. Press it to wave."}</p>
          </div>
          <Toggle on={!hidden} onChange={(v) => setHidden(!v)} label="Show my pet" />
        </div>
      </div>
    </>,
    document.body,
  );
}
