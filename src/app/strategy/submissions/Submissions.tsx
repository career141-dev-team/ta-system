"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSwap } from "@/lib/gsap";
import Toast from "../../openings/[id]/Toast";
import { job, minutesAgo, setRows, ta, useRows, type Row } from "../data";
import { CheckIcon, Initials } from "../ui";
import { usePlannerLive } from "../strategyLive";
import { useLive } from "@/lib/backend";
import { CardsSkeleton } from "../../Skeleton";

// S4, new submissions (owner's design, 14 Nov 2026): what TAs submitted, newest first,
// read one at a time - the TA's note, their proof pictures, what it brought into the
// pipeline - then "Mark as read · next", or reply to the TA. Old system: the lead sees
// a strategy only once the TA submits, with the pictures submitted with it.

const key = (x: Row) => x.job + "|" + x.name;

export default function Submissions() {
  // Signed in: the old planner is read first (strategyLive.ts, D10a); the sample otherwise.
  const on = useLive();
  const lv = usePlannerLive(on);
  if (on && !lv.ready)
    return lv.error ? (
      <main className="flex flex-1 items-center justify-center px-6 text-center text-small text-ink-2">{lv.error}</main>
    ) : (
      <main className="flex min-h-0 flex-1 flex-col px-11 py-10">
        <CardsSkeleton />
      </main>
    );
  return <List />;
}

function List() {
  const rows = useRows();
  // The list is the ones unread when the page opened; read ones stay until you leave.
  const [ids] = useState(() =>
    rows
      .filter((x) => x.state === "done" && x.read === false)
      .sort((a, b) => minutesAgo(a.ago) - minutesAgo(b.ago))
      .map(key),
  );
  const list = ids.map((k) => rows.find((x) => key(x) === k)).filter((x): x is Row => !!x);
  const [at, setAt] = useState<string | undefined>(ids[0]);
  const [reply, setReply] = useState<string | null>(null);
  const [toast, setToast] = useState<{ key: number; bold: string; rest: string } | null>(null);
  const cur = list.find((x) => key(x) === at);
  const pane = useRef<HTMLDivElement>(null);
  useSwap(pane, at);

  const pick = (k?: string) => {
    setAt(k);
    setReply(null);
  };
  const next = () => {
    if (!cur) return;
    setRows((rs) => rs.map((x) => (key(x) === at ? { ...x, read: true } : x)));
    const after = list.slice(list.indexOf(cur) + 1).concat(list.slice(0, list.indexOf(cur))).find((x) => x.read === false && key(x) !== at);
    pick(after ? key(after) : undefined);
  };

  // Up and down move through the list (not while typing a reply).
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (!["ArrowUp", "ArrowDown"].includes(e.key) || (e.target as HTMLElement).closest("textarea,input")) return;
      const i = list.findIndex((x) => key(x) === at);
      const n = list[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (n) {
        e.preventDefault();
        pick(key(n));
      }
    };
    addEventListener("keydown", keys);
    return () => removeEventListener("keydown", keys);
  });

  if (!list.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-h3 font-medium text-ink">Nothing new to read</p>
        <p className="text-small text-ink-3">When a TA submits a strategy it shows here.</p>
        <Link href="/strategy" className="mt-2 rounded-full bg-ink px-5 py-2.5 text-small font-medium text-white hover:bg-black">
          Back to the Strategy Planner
        </Link>
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 max-md:flex-col max-md:overflow-y-auto max-md:pt-10">
      <ul className="flex w-[max(28.75rem,250px)] shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-[max(1.75rem,12px)] max-md:w-full max-md:border-b max-md:border-r-0">
        {list.map((x) => {
          const j = job(x.job)!;
          const on = key(x) === at;
          return (
            <li key={key(x)}>
              <button
                type="button"
                aria-current={on}
                onClick={() => pick(key(x))}
                className={"flex w-full items-center gap-3.5 rounded-md px-[max(0.875rem,8px)] py-[max(0.875rem,8px)] text-left transition-colors " + (on ? "bg-surface-2" : "hover:bg-canvas")}
              >
                <Initials id={x.ta!} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-ink">{x.name}</span>
                  <span className="block truncate text-small text-ink-3">
                    {ta(x.ta!).first} · {j.title}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5 self-start pt-0.5">
                  <span className="text-caption text-ink-3">{x.ago}</span>
                  <span className={"size-2 rounded-full " + (x.read ? "bg-transparent" : "bg-brand")} aria-label={x.read ? "Read" : "Not read yet"} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div ref={pane} className="min-h-0 flex-1 overflow-y-auto px-[max(3.5rem,14px)] py-[max(2.5rem,16px)]">
        {!cur ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
              <CheckIcon className="size-6" />
            </span>
            <p className="text-h3 font-medium text-ink">All read</p>
            <Link href="/strategy" className="text-small font-medium text-brand hover:underline">
              Back to the Strategy Planner
            </Link>
          </div>
        ) : (
          <Detail
            x={cur}
            reply={reply}
            setReply={setReply}
            onNext={next}
            onSend={() => {
              setToast({ key: Date.now(), bold: `Sent to ${ta(cur.ta!).first}`, rest: " — it rings their bell" });
              setReply(null);
            }}
          />
        )}
      </div>
      {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} />}
    </div>
  );
}

function Detail({ x, reply, setReply, onNext, onSend }: { x: Row; reply: string | null; setReply: (v: string | null) => void; onNext: () => void; onSend: () => void }) {
  const j = job(x.job)!;
  const who = ta(x.ta!);
  const box = useRef<HTMLTextAreaElement>(null);
  const when = minutesAgo(x.ago) < 1440 ? "today" : x.ago!.toLowerCase();
  const steps = [x.assigned && `Assigned ${x.assigned}`, x.accepted && `Accepted ${x.accepted}`, x.done && `Done ${x.done}`, `Submitted ${when}`].filter(Boolean) as string[];
  return (
    <article className="flex flex-col gap-[max(1.75rem,14px)]">
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <Initials id={who.id} />
        <div className="min-w-0 flex-1">
          <h2 className="text-h2 text-ink">{x.name}</h2>
          <p className="text-small text-ink-3">
            {who.name} · {j.title} · {j.client}
          </p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {steps.map((s) => (
            <li key={s} className="flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-caption font-medium text-brand">
              <CheckIcon className="size-3" />
              {s}
            </li>
          ))}
        </ul>
      </header>

      <div className="rounded-lg bg-canvas px-[max(1.5rem,14px)] py-[max(1.25rem,12px)]">
        <p className="text-caption text-ink-3">{who.first}&apos;s note</p>
        <p className="mt-2 text-[max(1.125rem,14px)] leading-relaxed text-ink">{x.note || "No note — only pictures."}</p>
      </div>

      {!!x.proofs && (
        <div>
          <p className="mb-3 text-caption font-medium text-ink-3">
            Proof · {x.proofs} {x.proofs === 1 ? "picture" : "pictures"}
          </p>
          {/* ponytail: sample pictures drawn as placeholders; with the backend, the
              submitted files, opened full size on click. */}
          <div className="grid grid-cols-3 max-lg:grid-cols-2 gap-[max(1.125rem,10px)]">
            {Array.from({ length: x.proofs }, (_, i) => (
              <div key={i} aria-hidden="true" className="overflow-hidden rounded-md border border-border bg-canvas">
                <div className={"h-[max(1.75rem,16px)] " + (i === 1 ? "bg-info-soft" : "bg-surface-2")} />
                <div className="flex flex-col gap-[max(1rem,8px)] p-[max(1rem,10px)]">
                  {[0, 1, 2, 3, 4].map((k) => (
                    <span key={k} className="flex items-center gap-3">
                      <span className="size-[max(1.5rem,14px)] rounded-full bg-surface-2" />
                      <span className="flex flex-1 flex-col gap-1">
                        <span className="h-1.5 w-3/4 rounded-full bg-surface-3" />
                        <span className="h-1.5 w-1/3 rounded-full bg-surface-2" />
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!!x.cvs && (
        <p className="flex items-center gap-3 rounded-md bg-brand-soft px-[max(1.5rem,14px)] py-[max(1rem,10px)] text-body text-ink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0 text-brand" aria-hidden="true">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          This strategy brought {x.cvs} {x.cvs === 1 ? "CV" : "CVs"} into the pipeline — {x.cvs === 2 ? "both" : "all"} still active.
        </p>
      )}

      {reply !== null && (
        <div className="flex flex-col gap-3 rounded-md border border-border p-4 focus-within:ring-2 focus-within:ring-brand/15">
          <textarea
            ref={box}
            autoFocus
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim() && onSend()}
            rows={2}
            maxLength={500}
            placeholder={`Reply to ${who.first} about ${x.name}`}
            className="resize-none bg-transparent text-body text-ink outline-none [field-sizing:content] placeholder:text-ink-3"
          />
          <div className="flex items-center gap-3">
            <span className="text-caption text-ink-3">Ctrl+Enter sends</span>
            <button type="button" onClick={() => setReply(null)} className="ml-auto text-small text-ink-3 hover:text-ink">
              Cancel
            </button>
            <button type="button" disabled={!reply.trim()} onClick={onSend} className="rounded-full bg-ink px-5 py-2 text-small font-medium text-white hover:bg-black disabled:opacity-40">
              Send
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onNext} className="flex h-[max(3.125rem,38px)] items-center gap-2 rounded-full bg-ink px-[max(1.375rem,14px)] text-body font-medium text-white hover:bg-black">
          Mark as read <span aria-hidden="true">·</span> next
        </button>
        {reply === null && (
          <button type="button" onClick={() => setReply("")} className="flex h-[max(3.125rem,38px)] items-center rounded-full border border-border-strong px-[max(1.375rem,14px)] text-body font-medium text-ink hover:bg-surface-2">
            Reply to {who.first}
          </button>
        )}
      </div>
    </article>
  );
}
