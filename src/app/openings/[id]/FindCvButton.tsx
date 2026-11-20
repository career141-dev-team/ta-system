"use client";

import { useEffect, useRef, useState } from "react";
import { useLiftMenu } from "./liftMenu";

// Shared by Suggestions and Excel Tables, as the old system's FindCvButton is.
/** Find CV: is this person already in our database? Look before adding them again. */
export default function FindCvButton({
  name,
  matches,
  onLinked,
  live,
  up = false,
  className = "",
}: {
  name: string;
  /** People in our database who may be this person; sample until the backend. */
  matches?: { name: string; detail: string }[];
  onLinked: () => void;
  /** Live (D8b): ask the TA System who this may be, and link the one picked. */
  live?: {
    find: () => Promise<{ ok: true; hits: { id: string; name: string; detail: string }[] } | { ok: false; message: string }>;
    choose: (id: string) => Promise<boolean>;
  };
  /** Open the panel above the button (cards low on the screen). */
  up?: boolean;
  className?: string;
}) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const [looking, setLooking] = useState(false);
  const [linked, setLinked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const [found, setFound] = useState<{ id: string; name: string; detail: string }[] | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  const hits = live ? found ?? [] : (matches ?? []).map((m) => ({ id: m.detail, ...m }));

  if (linked)
    return (
      <span className={"text-small text-brand " + className}>CV linked</span>
    );
  return (
    <div ref={root} className={"relative " + className}>
      <button
        type="button"
        aria-expanded={open}
        disabled={looking}
        onClick={() => {
          if (open) return setOpen(false);
          setLooking(true);
          if (live) {
            void live.find().then((res) => {
              setLooking(false);
              setFound(res.ok ? res.hits : []);
              setFault(res.ok ? null : res.message);
              setOpen(true);
            });
            return;
          }
          timer.current = setTimeout(() => {
            setLooking(false);
            setOpen(true);
          }, 700);
        }}
        title="Search our database for this person before adding them again"
        className="text-small font-medium text-brand hover:underline disabled:opacity-60"
      >
        {looking ? "Looking…" : "Find CV"}
      </button>
      {shown && (
        <div
          ref={panel}
          role="dialog"
          aria-label={`CVs for ${name}`}
          className={
            (up ? "bottom-full mb-2" : "top-full mt-2") +
            " absolute right-0 z-30 w-[min(20rem,calc(100vw-32px))] rounded-md border border-border bg-surface p-[max(0.9rem,10px)] shadow-float"
          }
        >
          {fault ? (
            <p className="text-small text-ink-2">{fault}</p>
          ) : hits.length === 0 ? (
            <p className="text-small text-ink-2">
              Nobody in our database matches {name} - a new person. Select them
              to approach on LinkedIn.
            </p>
          ) : (
            <>
              <p className="text-small font-medium text-ink">
                Found in our database
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {hits.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center gap-2 rounded-sm bg-surface-2 px-2.5 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-small text-ink">{h.name}</p>
                      <p className="truncate text-caption text-ink-3">
                        {h.detail}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        if (live) return void live.choose(h.id).then((ok) => ok && setLinked(true));
                        setLinked(true);
                        onLinked();
                      }}
                      className="shrink-0 rounded-full bg-brand px-3 py-1 text-caption font-medium text-white hover:bg-brand-strong"
                    >
                      Same person
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-2 text-caption text-ink-3 hover:text-ink"
              >
                None of these
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
