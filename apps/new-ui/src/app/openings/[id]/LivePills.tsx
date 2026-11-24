"use client";

// The opening's Status and Stage pills: the design's sample values in a preview;
// signed in (19 Nov, D4) the real ones from ui/opening:summary. The Stage pill is
// this person's own working stage on the opening and saves through
// ui/day:setWorkingStage (the backend's own rule). Changing the opening's status
// is not in the door yet, so signed in it shows the real status without a menu.
import { useState } from "react";
import { door, jobFromAddress, useDoorMutation, useDoorQuery, useLive, useSignedIn, type Answer, type DoorDone } from "@/lib/backend";
import PillMenu, { type MenuOption } from "./PillMenu";

type Summary = Answer<{ opening: { status: string | null; team: { id: string; workingStage: string | null }[] } }>;
const STATUS_WORD: Record<string, string> = { active: "Active", draft: "Draft", on_hold: "On hold", filled: "Placed", cancelled: "Closed / Lost" };

function useSummary() {
  const live = useLive();
  const job = live ? jobFromAddress() : null;
  return { live, job, got: useDoorQuery(door.summary, job ? { openingId: job } : "skip") as Summary | undefined };
}

export function StatusPill({ options, sample, pillClass }: { options: MenuOption[]; sample: string; pillClass: string }) {
  const { live, got } = useSummary();
  if (!live) return <PillMenu options={options} initial={sample} pillClass={pillClass} />;
  const word = got?.ok ? STATUS_WORD[got.opening.status ?? ""] ?? "" : "";
  const dot = options.find((o) => o.value === word)?.dot;
  return (
    <span className={pillClass}>
      {dot && <span aria-hidden="true" className="size-2 rounded-full" style={{ background: dot }} />}
      {word || (got ? "Not known" : <span className="shimmer inline-block h-[0.8em] w-[6ch] rounded-md" />)}
    </span>
  );
}

export function StagePill({ options, sample, pillClass }: { options: MenuOption[]; sample: string; pillClass: string }) {
  const { live, job, got } = useSummary();
  const me = useSignedIn();
  const save = useDoorMutation(door.setWorkingStage);
  const [why, setWhy] = useState("");
  // A refused change puts the pill back by drawing it afresh from the saved value.
  const [round, setRound] = useState(0);
  if (!live) return <PillMenu options={options} initial={sample} prefix="Stage:" title="Working Stage" pillClass={pillClass} />;
  const mine = got?.ok && me?.ok ? got.opening.team.find((t) => t.id === me.id) : undefined;
  if (!mine) return <span className={pillClass}>Stage: {got ? "not on this opening" : <span className="shimmer inline-block h-[0.8em] w-[5ch] rounded-md align-middle" />}</span>;
  const value = mine.workingStage ?? "100%";
  return (
    <>
      <PillMenu
        key={`${value}-${round}`}
        options={options}
        initial={value}
        prefix="Stage:"
        title="Working Stage"
        pillClass={pillClass}
        onChange={(stage) => {
          setWhy("");
          void (save({ openingId: job!, stage }) as Promise<DoorDone | undefined>).then((d) => {
            if (d && !d.ok) {
              setWhy(d.message);
              setRound((n) => n + 1);
            }
          });
        }}
      />
      {why && <span className="text-small text-danger">{why}</span>}
    </>
  );
}
