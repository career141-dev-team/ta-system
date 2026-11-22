"use client";

// A candidate's follow-up chat (22 Nov 2026; ta-system convex/ui/followUp.ts): what the
// WhatsApp and email assistant sent and heard, what it has collected, and the old
// candidate page's buttons - Send next, Take over, Hand back, Stop. Signed in only;
// the backend decides who may press them and keeps test mode.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { door, useDoorMutation, useDoorQuery } from "@/lib/backend";

type Msg = { id: string; direction: string; channel: string; subject: string | null; body: string; status: string; at: number; error: string | null };
type State = {
  attemptCount: number;
  maxAttempts: number | null;
  autoFollowUp: boolean;
  nextScheduledAt: number | null;
  takenOver?: { at: number; by: string | null } | null;
  collected: { cv: boolean | null; currentSalary: boolean | null; expectedSalary: boolean | null; noticePeriod: boolean | null };
  customQuestions: string[];
  customAnswers: Record<string, string>;
} | null;
type Read = { ok: true; state: State; live: boolean; messages: Msg[] } | { ok: false; message: string };

const WANTS = [
  ["cv", "CV"],
  ["currentSalary", "Current salary"],
  ["expectedSalary", "Expected salary"],
  ["noticePeriod", "Notice period"],
] as const;
const when = (t: number) => new Date(t).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function FollowUpChat({ appId, name, onClose }: { appId: string; name: string; onClose: () => void }) {
  const got = useDoorQuery(door.followUpChat, { applicationId: appId }) as Read | undefined;
  const act = useDoorMutation(door.followUpAct);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [stopSure, setStopSure] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  const count = got?.ok ? got.messages.length : 0;
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [count]);

  const press = async (what: "send" | "takeOver" | "handBack" | "stop") => {
    setBusy(true);
    const r = (await act({ applicationId: appId, do: what })) as { ok: boolean; message: string };
    setBusy(false);
    setStopSure(false);
    setSaid({ ok: r.ok, text: r.message });
  };

  const s = got?.ok ? got.state : null;
  const max = s?.maxAttempts ?? 3;
  const mine = !!s?.takenOver;
  const BTN = "rounded-pill border border-border px-3.5 py-1.5 text-small text-ink hover:bg-surface-2 disabled:opacity-50";

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end bg-ink/20" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside aria-label={`Follow-up with ${name}`} className="flex h-full w-[min(32rem,100%)] flex-col border-l border-border bg-surface shadow-float">
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-h3 text-ink">{name}</h2>
            <p className="text-small text-ink-2">
              {!got ? "Reading the conversation…" : !got.ok ? got.message : !s ? "No follow-up on record yet." : mine ? "You have this conversation - the assistant is quiet." : `The assistant has it · follow-up ${s.attemptCount} of ${max}${s.nextScheduledAt ? ` · next ${when(s.nextScheduledAt)}` : ""}`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-pill px-2 py-1 text-ink-2 hover:bg-surface-2">✕</button>
        </header>

        {got?.ok && s && (
          <div className="flex flex-wrap gap-1.5 border-b border-border px-5 py-3">
            {WANTS.map(([k, label]) => (
              <span key={k} className={"rounded-pill px-2.5 py-1 text-caption " + (s.collected[k] ? "bg-brand-soft text-brand-strong" : "bg-surface-2 text-ink-3")}>
                {s.collected[k] ? "✓ " : ""}{label}
              </span>
            ))}
            {s.customQuestions.map((q) => (
              <span key={q} title={s.customAnswers[q] ?? "Not answered yet"} className={"rounded-pill px-2.5 py-1 text-caption " + (s.customAnswers[q] ? "bg-brand-soft text-brand-strong" : "bg-surface-2 text-ink-3")}>
                {s.customAnswers[q] ? "✓ " : ""}{q}
              </span>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {got?.ok && !got.live && <p className="mb-3 rounded-sm bg-warn-soft px-3 py-2 text-caption text-warn">Test mode: messages go only to the test number and address.</p>}
          {got?.ok && got.messages.length === 0 && <p className="text-small text-ink-3">Nothing sent yet.</p>}
          <div className="flex flex-col gap-2.5">
            {got?.ok && got.messages.map((m) => {
              const out = m.direction !== "inbound";
              return (
                <div key={m.id} className={"max-w-[85%] " + (out ? "self-end" : "self-start")}>
                  <p className={"whitespace-pre-wrap rounded-md px-3.5 py-2.5 text-small " + (out ? "bg-surface-2 text-ink" : "border border-border text-ink")}>
                    {m.subject && <span className="mb-1 block font-medium">{m.subject}</span>}
                    {m.body}
                  </p>
                  <p className={"mt-0.5 text-caption " + (m.error ? "text-warn" : "text-ink-3") + (out ? " text-right" : "")}>
                    {m.channel === "email" ? "Email" : "WhatsApp"} · {when(m.at)}{out ? ` · ${m.error ?? m.status}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
          <div ref={end} />
        </div>

        {got?.ok && (
          <footer className="flex flex-col gap-2 border-t border-border px-5 py-3">
            {said && <p className={"text-small " + (said.ok ? "text-ink-2" : "text-warn")}>{said.text}</p>}
            <div className="flex flex-wrap gap-2">
              {!mine && <button type="button" disabled={busy} onClick={() => void press("send")} className={BTN}>Send next</button>}
              <button type="button" disabled={busy} onClick={() => void press(mine ? "handBack" : "takeOver")} className={BTN}>{mine ? "Hand back" : "Take over"}</button>
              <button type="button" disabled={busy} onClick={() => (stopSure ? void press("stop") : setStopSure(true))} className={BTN + (stopSure ? " border-danger text-danger" : "")}>
                {stopSure ? "Press again to stop" : "Stop follow-up"}
              </button>
            </div>
          </footer>
        )}
      </aside>
    </div>,
    document.body,
  );
}
