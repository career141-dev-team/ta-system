"use client";

// How many places this opening has and how many are filled (20 Nov, step 2 of the
// placements plan). A chip in the title row, "1 of 4 placed", only when there is
// more than one place - a lead or admin also sees "1 place" so they can raise it.
// Click: a small panel with the places per city; leads, admins and the primary TA
// change them with - and +, each press saves through ui/placements. The opening
// moves to Placed by itself when the last place is filled (the backend decides).
import { useEffect, useRef, useState } from "react";
import { door, jobFromAddress, useDoorMutation, useDoorQuery, useLive, type Answer, type DoorDone } from "@/lib/backend";
import { DUR, gsap } from "@/lib/gsap";
import { useLiftMenu } from "./liftMenu";

type Place = { id: string; name: string; vacancies: number; placed: number };
type Status = Answer<{ target: number; placed: number; state: string; locations: Place[]; canEdit: boolean }>;
const STEP = "grid size-6 place-items-center rounded-sm border border-border text-small hover:bg-surface-2 disabled:opacity-30";

export function PlacedChip({ pillClass }: { pillClass: string }) {
  const live = useLive();
  const job = live ? jobFromAddress() : null;
  const got = useDoorQuery(door.placements, job ? { openingId: job } : "skip") as Status | undefined;
  const save = useDoorMutation(door.setTarget);
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  const last = useRef<number | null>(null);
  const placed = got?.ok ? got.placed : null;
  // GSAP: the chip gives one small pop when the number filled changes.
  useEffect(() => {
    if (placed === null) return;
    if (last.current !== null && last.current !== placed && chip.current) {
      gsap.fromTo(chip.current, { scale: 1.1 }, { scale: 1, duration: DUR.base, ease: "back.out(2)", clearProps: "transform" });
    }
    last.current = placed;
  }, [placed]);
  if (!live || !job || !got || !got.ok) return null;
  const { target, locations, canEdit } = got;
  if (target < 2 && !canEdit) return null;
  const full = got.placed >= target;

  const change = async (rows: { id: string; vacancies: number }[] | null, total: number) => {
    setNote(null);
    setBusy(true);
    const d = (await save(rows ? { openingId: job, vacancies: rows } : { openingId: job, total })) as DoorDone | undefined;
    setBusy(false);
    if (d) setNote({ text: d.message, bad: !d.ok });
  };
  const nudge = (id: string, by: number) =>
    change(locations.map((l) => ({ id: l.id, vacancies: l.id === id ? l.vacancies + by : l.vacancies })), 0);

  return (
    <div ref={root} className="relative">
      <button ref={chip} type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className={pillClass + " transition-colors hover:bg-surface-2" + (open ? " bg-surface-2" : "") + (full ? " text-brand-strong" : "")}>
        {target < 2 ? "1 place" : `${got.placed} of ${target} placed`}
      </button>
      {shown && (
        <div ref={panel} className="absolute left-0 top-full z-30 mt-2 w-[min(20rem,90vw)] rounded-md border border-border bg-surface p-3 shadow-float">
          <p role="menuitem" className="text-small text-ink-3">Places to fill · {got.placed} of {target} filled</p>
          <ul className="mt-2 grid gap-1.5">
            {(locations.length ? locations : [{ id: "", name: "This opening", vacancies: target, placed: got.placed }]).map((l) => (
              <li key={l.id || "all"} role="menuitem" className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-small">{l.name}</span>
                <span className="text-small text-ink-3">{l.placed} of {l.vacancies}</span>
                {canEdit && (
                  <>
                    <button type="button" aria-label={`One fewer place in ${l.name}`} className={STEP} disabled={busy || l.vacancies <= 1}
                      onClick={() => void (l.id ? nudge(l.id, -1) : change(null, l.vacancies - 1))}>−</button>
                    <button type="button" aria-label={`One more place in ${l.name}`} className={STEP} disabled={busy}
                      onClick={() => void (l.id ? nudge(l.id, 1) : change(null, l.vacancies + 1))}>+</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {!canEdit && <p className="mt-2 text-caption text-ink-3">A TA Lead, an admin or the primary TA changes this.</p>}
          {note && <p className={"mt-2 text-small " + (note.bad ? "text-danger" : "text-ink-2")}>{note.text}</p>}
        </div>
      )}
    </div>
  );
}
