"use client";

// Opening access requests (20 Nov, step 3 of the placements plan), signed in only.
//
// A TA sees a quiet section under the lists, "Open to join": active openings they
// are not on, each with one "Request access" button that shows on hover (always on
// a touch screen). Once asked, the card says so. The TA Lead of the opening (or an
// admin) sees one "Requests N" chip beside the filters, only while some wait; it
// lifts a small panel with Approve and Decline (a reason is needed to decline).
// No new page and no button on the opening cards themselves.
import { useEffect, useRef, useState } from "react";
import { door, useDoorMutation, useDoorQuery, useLive, type Answer, type DoorDone } from "@/lib/backend";
import { DUR, gsap } from "@/lib/gsap";
import { useLiftMenu } from "./[id]/liftMenu";

type Joinable = { id: string; title: string; clientName: string; leadName: string; status: "pending" | "approved" | "rejected" | null };
type Available = Answer<{ canRequest: boolean; openings: Joinable[] }>;
type Waiting = { id: string; openingTitle: string; clientName: string; requesterName: string; requestReason: string | null; requestedAt: number };
type Pending = Answer<{ requests: Waiting[] }>;

/** "Open to join": for a TA, the openings they could ask to be put on. */
export function JoinSection({ tell }: { tell: (rest: string, bold?: string) => void }) {
  const live = useLive();
  const got = useDoorQuery(door.accessAvailable, live ? {} : "skip") as Available | undefined;
  const ask = useDoorMutation(door.accessRequest);
  const [busy, setBusy] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  if (!live || !got || !got.ok || !got.canRequest || got.openings.length === 0) return null;
  const rows = more ? got.openings : got.openings.slice(0, 4);
  const send = async (o: Joinable) => {
    setBusy(o.id);
    const d = (await ask({ openingId: o.id })) as DoorDone | undefined;
    setBusy(null);
    if (d) tell(d.message, o.title + " - ");
  };
  return (
    <section aria-label="Open to join" className="flex flex-col gap-[max(1.125rem,12px)]">
      <div className="flex items-center gap-3">
        <h2 className="text-h2 font-normal text-ink">Open to join</h2>
        <span className="tabular-nums text-body text-ink-3">{got.openings.length}</span>
        {got.openings.length > 4 && (
          <button type="button" onClick={() => setMore(!more)} className="ml-auto text-small text-ink-2 hover:text-ink">
            {more ? "Show fewer" : "See more"}
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-[max(1.5rem,12px)] max-lg:grid-cols-2 max-sm:grid-cols-1">
        {rows.map((o) => (
          <div key={o.id} className="group flex min-h-[max(8.5rem,120px)] flex-col gap-1 rounded-lg border border-border bg-white p-5">
            <span className="truncate text-caption text-ink-3">{o.clientName}</span>
            <span className="line-clamp-2 text-body font-medium text-ink">{o.title}</span>
            <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-small text-ink-3">
              <span className="truncate">TA Lead {o.leadName}</span>
              {o.status === "pending" ? (
                <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-caption text-ink-2">Asked · waiting</span>
              ) : (
                <button
                  type="button"
                  disabled={busy === o.id}
                  onClick={() => void send(o)}
                  className="shrink-0 rounded-full border border-border px-3 py-1 text-caption text-ink opacity-0 transition-opacity hover:bg-surface-2 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-60 [@media(hover:none)]:opacity-100"
                >
                  {o.status === "rejected" ? "Ask again" : "Request access"}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** "Requests N": for a TA Lead or admin, only while someone is waiting. */
export function RequestsChip({ tell }: { tell: (rest: string, bold?: string) => void }) {
  const live = useLive();
  const got = useDoorQuery(door.accessPending, live ? {} : "skip") as Pending | undefined;
  const decide = useDoorMutation(door.accessDecide);
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const [declining, setDeclining] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const n = got?.ok ? got.requests.length : 0;
  const last = useRef(n);
  // GSAP: the chip pops when a new request arrives.
  const chip = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (n > last.current && chip.current) gsap.fromTo(chip.current, { scale: 1.12 }, { scale: 1, duration: DUR.base, ease: "back.out(2)", clearProps: "transform" });
    last.current = n;
  }, [n]);
  if (!live || !got || !got.ok || n === 0) return null;
  const answer = async (r: Waiting, approve: boolean) => {
    if (!approve && !why.trim()) return;
    setBusy(true);
    const d = (await decide({ requestId: r.id, approve, reason: approve ? undefined : why.trim() })) as DoorDone | undefined;
    setBusy(false);
    if (d) tell(d.message, r.requesterName + " - ");
    if (d?.ok) {
      setDeclining(null);
      setWhy("");
    }
  };
  return (
    <div ref={root} className="relative">
      <button
        ref={chip}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-[max(3.25rem,40px)] items-center gap-2 rounded-full bg-warn-soft px-5 text-body font-medium text-ink transition-colors hover:bg-surface-2"
      >
        Requests <span className="tabular-nums">{n}</span>
      </button>
      {shown && (
        <div ref={panel} className="absolute right-0 top-full z-30 mt-2 w-[min(24rem,92vw)] rounded-md border border-border bg-surface p-3 shadow-float">
          <ul ref={list} className="grid gap-3">
            {got.requests.map((r) => (
              <li key={r.id} role="menuitem" className="grid gap-1.5">
                <p className="text-small text-ink">
                  <span className="font-medium">{r.requesterName}</span> wants to join <span className="font-medium">{r.openingTitle}</span>
                  <span className="text-ink-3"> · {r.clientName}</span>
                </p>
                {r.requestReason && <p className="text-caption text-ink-3">{r.requestReason}</p>}
                {declining === r.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={why}
                      onChange={(e) => setWhy(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void answer(r, false)}
                      placeholder="Why not? They will see this."
                      className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 py-1 text-small"
                    />
                    <button type="button" disabled={busy || !why.trim()} onClick={() => void answer(r, false)} className="rounded-full border border-border px-3 py-1 text-caption disabled:opacity-40">Decline</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => void answer(r, true)} className="rounded-full bg-brand px-3 py-1 text-caption font-medium text-white hover:bg-brand-strong disabled:opacity-60">Approve</button>
                    <button type="button" disabled={busy} onClick={() => { setDeclining(r.id); setWhy(""); }} className="rounded-full border border-border px-3 py-1 text-caption text-ink-2 hover:bg-surface-2">Decline</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
