"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { DUR, EASE, gsap, useGSAP } from "@/lib/gsap";
import { POOL } from "../database/aura";
import { STATUS, TARGET, inList, type Opening } from "./data";

// The spotlight (owner's design, 14 Nov 2026): one box over a blurred page. Openings
// by role or client, people by name or title, then two actions - start a new opening
// with these words, or ask AURA (the Database chat). Up/Down move, Enter opens, Esc
// closes. ponytail: word matching over the sample; with the backend this is one
// small search query per pause in typing.

type Item = {
  key: string;
  group: "Openings" | "People" | "Actions";
  title: string;
  sub: string;
  tag: string;
  icon: "brief" | "person" | "plus" | "aura";
  go: () => void;
};

export default function Spotlight({
  openings,
  onClose,
  onCreate,
}: {
  openings: Opening[];
  onClose: () => void;
  onCreate: (text: string) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from("[data-veil]", { opacity: 0, duration: DUR.fast });
      gsap.from("[data-box]", { opacity: 0, y: -10, scale: 0.98, duration: DUR.base, ease: EASE.out });
    },
    { scope: root },
  );

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const has = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  const found = words.length ? openings.filter((o) => has(`${o.title} ${o.client}`)) : openings.slice(0, 4);
  const people = words.length ? POOL.filter((p) => has(`${p.name} ${p.title} ${p.company}`)) : [];
  const items: Item[] = [
    ...found.slice(0, 4).map((o): Item => {
      const l = inList(o, "unassigned") ? "unassigned" : o.status;
      return {
        key: o.id,
        group: "Openings",
        title: o.title,
        sub: `${o.client} · ${STATUS[l].label}${o.status === "active" && o.team.length ? ` · day ${o.days} of ${TARGET[o.priority]}` : ""}`,
        tag: "Opening",
        icon: "brief",
        // ponytail: the one opening built so far.
        go: () => router.push("/openings/demo"),
      };
    }),
    ...people.slice(0, 3).map(
      (p): Item => ({
        key: p.id,
        group: "People",
        title: p.name,
        sub: `${p.title} · ${p.company}`,
        tag: "Candidate",
        icon: "person",
        go: () => router.push(`/database?q=${encodeURIComponent(p.name)}`),
      }),
    ),
    {
      key: "create",
      group: "Actions",
      title: q.trim() ? `Create an opening called “${q.trim()}”` : "Create an opening",
      sub: "Opens the new opening sheet",
      tag: "Create",
      icon: "plus",
      go: () => onCreate(q.trim()),
    },
    ...(q.trim()
      ? [
          {
            key: "ask",
            group: "Actions",
            title: `Ask AURA: “${q.trim()}”`,
            sub: "AURA answers from the whole desk",
            tag: "Ask",
            icon: "aura",
            go: () => router.push(`/database?q=${encodeURIComponent(q.trim())}`),
          } satisfies Item,
        ]
      : []),
  ];
  const sel = Math.min(at, items.length - 1);

  useEffect(() => {
    list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setAt((sel + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[sel]?.go();
    } else if (e.key === "Escape") onClose();
  };

  let last = "";
  return createPortal(
    <div ref={root} className="fixed inset-0 z-[80] flex justify-center px-4 pt-[min(11.8rem,18dvh)]">
      <div data-veil className="absolute inset-0 bg-canvas/50 backdrop-blur-md" onClick={onClose} />
      <div
        data-box
        role="dialog"
        aria-modal="true"
        aria-label="Find a role, client or person"
        className="relative flex max-h-[calc(82dvh-24px)] w-[max(51.25rem,320px)] max-w-full flex-col self-start overflow-hidden rounded-xl bg-surface shadow-float"
      >
        <div className="flex items-center gap-4 border-b border-border px-[max(1.875rem,18px)] py-[max(1.5rem,14px)]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-6 shrink-0 text-ink-2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setAt(0);
            }}
            onKeyDown={key}
            role="combobox"
            aria-expanded="true"
            aria-controls="spot-list"
            aria-activedescendant={`spot-${sel}`}
            placeholder="Find a role, client or person"
            className="min-w-0 flex-1 bg-transparent text-h2 text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <div ref={list} id="spot-list" role="listbox" className="flex flex-col gap-0.5 overflow-y-auto p-3.5">
          {words.length > 0 && !found.length && !people.length && (
            <p className="px-4 pb-1 pt-2 text-small text-ink-3">No opening or person matches “{q.trim()}”.</p>
          )}
          {items.map((it, i) => {
            const head = it.group !== last ? it.group : "";
            last = it.group;
            const on = i === sel;
            return (
              <div key={it.key}>
                {head && <p className="px-4 pb-1.5 pt-2.5 text-caption font-medium uppercase text-ink-3">{head}</p>}
                <button
                  type="button"
                  id={`spot-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={on}
                  onMouseMove={() => setAt(i)}
                  onClick={it.go}
                  className={"flex w-full items-center gap-4 rounded-md px-4 py-3 text-left " + (on ? "bg-surface-2" : "")}
                >
                  <Icon kind={it.icon} on={on} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-medium text-ink">{it.title}</span>
                    <span className="truncate text-small text-ink-3">{it.sub}</span>
                  </span>
                  <span className="shrink-0 text-small text-ink-3">
                    {on ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-label="Enter">
                        <path d="M20 5v7a3 3 0 0 1-3 3H5M9 11l-4 4 4 4" />
                      </svg>
                    ) : (
                      it.tag
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Icon({ kind, on }: { kind: Item["icon"]; on: boolean }) {
  if (kind === "aura")
    return <Image src="/aura-mark.png" alt="" width={40} height={40} className="size-10 shrink-0 rounded-full" />;
  const d = {
    brief: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
    person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0",
    plus: "M12 5v14M5 12h14",
  }[kind];
  return (
    <span className={"flex size-10 shrink-0 items-center justify-center rounded-full text-ink-2 " + (on ? "bg-surface" : "bg-surface-2")}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4.5" aria-hidden="true">
        <path d={d} />
      </svg>
    </span>
  );
}
