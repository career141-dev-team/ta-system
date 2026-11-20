"use client";

// The top bar's "Search or ask AURA" (owner 20 Nov 2026): it read nothing and sent every
// question to the Database page. Now it reads the question like the pet's box does
// (AskAura.tsx): a day question is answered in a panel under the bar, "open X" and
// searches go to their screen, anything else is asked of AURA. Under a 1520 window the
// bar is a round button that opens the same box under it.
import { useEffect, useRef, useState } from "react";
import { AskReply, useAsk } from "./AskAura";

function SearchIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export default function AskBar({ circle }: { circle: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false); // the round button's box, under 1520
  const root = useRef<HTMLDivElement>(null);
  // Leaving for another screen closes the box; useAsk already drops its answer.
  const { run, answer, clear } = useAsk(() => setOpen(false));
  const close = () => {
    setOpen(false);
    clear();
  };

  // Outside press or Escape puts the answer away.
  useEffect(() => {
    if (!answer && !open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && close();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("pointerdown", away);
    addEventListener("keydown", esc);
    return () => {
      removeEventListener("pointerdown", away);
      removeEventListener("keydown", esc);
    };
  });

  const field = (wide: boolean) => (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (!q.trim()) return;
        void run(q);
        setQ("");
      }}
      className={
        wide
          ? "hidden h-[max(2.875rem,36px)] w-[max(21.25rem,180px)] min-w-36 shrink items-center gap-[max(0.625rem,6px)] rounded-full bg-surface-2 pl-[max(1.125rem,12px)] pr-[max(0.625rem,6px)] has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand/30 min-[1520px]:flex"
          : "flex h-10 items-center gap-2 rounded-full bg-surface-2 pl-4 pr-2"
      }
    >
      <SearchIcon className="size-[max(0.9375rem,13px)] shrink-0 text-ink-2" />
      <input
        name={wide ? "q" : undefined}
        type="search"
        value={q}
        autoFocus={!wide}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search or ask AURA"
        aria-label="Search or ask AURA"
        className="min-w-0 flex-1 text-ellipsis bg-transparent text-nav text-ink outline-none placeholder:text-ink-2"
      />
      {wide && <kbd className="shrink-0 rounded-md bg-white px-[max(0.375rem,4px)] py-px font-sans text-[max(0.6875rem,10px)] text-ink-2">⌘K</kbd>}
    </form>
  );

  return (
    <div ref={root} className="relative ml-auto flex items-center">
      {field(true)}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Search or ask AURA" aria-expanded={open} className={circle + " bg-surface-2 text-ink min-[1520px]:hidden"}>
        <SearchIcon className="size-[45%]" />
      </button>
      {(open || answer) && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[max(24rem,280px)] rounded-md bg-surface p-3 shadow-float">
          <div className={open ? "" : "min-[1520px]:hidden"}>{(open || !answer) && field(false)}</div>
          {answer && <AskReply answer={answer} onLeave={close} />}
          <p className="mt-2 px-1 text-caption text-ink-3">Ask about your day, find people, or say “open Pipeline for …”.</p>
        </div>
      )}
    </div>
  );
}
