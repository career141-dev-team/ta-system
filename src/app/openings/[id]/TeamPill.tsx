"use client";

// Who is on this opening (20 Nov, step 1 of the placements plan). One chip in the
// title row; a click lifts a small panel. A lead or admin adds and removes TAs and
// makes one primary; each TA's work mode (100% / Follow-up / Add-on) is here too,
// and a TA can change only their own. Signed in only: a preview has no team.
// Every change saves at once through ui/team and the list follows by itself.
import { useState } from "react";
import { door, jobFromAddress, useDoorMutation, useDoorQuery, useLive, type Answer, type DoorDone } from "@/lib/backend";
import { useLiftMenu } from "./liftMenu";

type Member = { userId: string; name: string; role: "primary_recruiter" | "supporting_recruiter"; stage: string };
type Team = Answer<{ members: Member[]; canEdit: boolean; mine: string; choices: { id: string; name: string }[] }>;
const STAGES = ["100%", "Follow-up", "Add-on"];
const letters = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const SELECT = "rounded-sm border border-border bg-surface px-2 py-1 text-small disabled:opacity-60";

export function TeamPill({ pillClass }: { pillClass: string }) {
  const live = useLive();
  const job = live ? jobFromAddress() : null;
  const got = useDoorQuery(door.team, job ? { openingId: job } : "skip") as Team | undefined;
  const setTeam = useDoorMutation(door.setTeam);
  const setStage = useDoorMutation(door.setTeamStage);
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  if (!live || !job) return null;
  if (!got) return <span className={pillClass}><span className="shimmer inline-block h-[0.8em] w-[8ch] rounded-md" /></span>;
  if (!got.ok) return null;
  const { members, canEdit, mine, choices } = got;

  const run = async (call: () => Promise<unknown>) => {
    setWhy("");
    setBusy(true);
    const d = (await call()) as DoorDone | undefined;
    setBusy(false);
    if (d && !d.ok) setWhy(d.message);
  };
  const save = (ids: string[], primaryId: string) => run(() => setTeam({ openingId: job, userIds: ids, primaryId }));
  const ids = members.map((m) => m.userId);
  const primary = members.find((m) => m.role === "primary_recruiter")?.userId ?? ids[0] ?? "";
  const free = choices.filter((c) => !ids.includes(c.id));

  return (
    <div ref={root} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={pillClass + " transition-colors hover:bg-surface-2" + (open ? " bg-surface-2" : "")}>
        <span className="flex -space-x-1.5" aria-hidden="true">
          {members.slice(0, 3).map((m) => (
            <span key={m.userId} className="grid size-5 place-items-center rounded-full border border-surface bg-surface-3 text-caption font-medium">{letters(m.name)}</span>
          ))}
        </span>
        Team · {members.length}
      </button>
      {shown && (
        <div ref={panel} className="absolute left-0 top-full z-30 mt-2 w-[min(22rem,90vw)] rounded-md border border-border bg-surface p-3 shadow-float">
          <ul className="grid gap-1.5">
            {members.map((m) => {
              const isPrimary = m.userId === primary;
              const mayStage = canEdit || m.userId === mine;
              return (
                <li key={m.userId} role="menuitem" className="flex items-center gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 text-caption font-medium">{letters(m.name)}</span>
                  <span className="min-w-0 flex-1 truncate text-small">{m.name}</span>
                  {isPrimary ? (
                    <span className="text-caption text-ink-3">Primary</span>
                  ) : (
                    canEdit && <button type="button" disabled={busy} onClick={() => void save(ids, m.userId)} className="text-caption text-ink-3 hover:text-ink">Make primary</button>
                  )}
                  <select aria-label={`Work mode for ${m.name}`} disabled={busy || !mayStage} value={m.stage} className={SELECT}
                    onChange={(e) => void run(() => setStage({ openingId: job, userId: m.userId, stage: e.target.value }))}>
                    {STAGES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  {canEdit && (
                    <button type="button" aria-label={`Take ${m.name} off`} disabled={busy || members.length < 2}
                      onClick={() => { const rest = ids.filter((i) => i !== m.userId); void save(rest, isPrimary ? rest[0]! : primary); }}
                      className="text-ink-3 hover:text-danger disabled:opacity-30">×</button>
                  )}
                </li>
              );
            })}
          </ul>
          {canEdit && (
            <select aria-label="Add a TA" disabled={busy || free.length === 0} value="" className={SELECT + " mt-3 w-full"}
              onChange={(e) => e.target.value && void save([...ids, e.target.value], primary)}>
              <option value="">{free.length ? "+ Add a TA" : "Every TA is on it"}</option>
              {free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {why && <p className="mt-2 text-small text-danger">{why}</p>}
        </div>
      )}
    </div>
  );
}
