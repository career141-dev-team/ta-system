"use client";

import { useRef, useState } from "react";
import { BackButton } from "./PipelineBoard";
import Toast from "./Toast";

// The Strategies view (Figma 713:1924): what a lead gave this TA to do on the
// opening. A new strategy is accepted first; once done it carries a note of what was
// done and proofs (screenshots pasted or dropped); the done ones go to the lead when
// the TA submits. Placeholder data - nothing is sent. With the backend the lead's
// strategies, the notes and the proof files are the server's.
const LEAD = "Rashmi";

type Status = "new" | "open" | "done";
/** `url` is an uploaded screenshot; without one the sample's grey placeholder shows. */
type Proof = { id: string; url?: string; tone?: "info" | "plain" };
type Strategy = {
  id: string;
  title: string;
  due: string;
  status: Status;
  /** "11 Nov" - set when it is marked done. */
  doneOn?: string;
  /** Already submitted to the lead. */
  sent?: boolean;
  note: string;
  proofs: Proof[];
};

const STRATEGIES: Strategy[] = [
  {
    id: "s1",
    title: "Direct headhunt",
    due: "Wed–Thu",
    status: "done",
    doneOn: "11 Nov",
    note: "Called 14 SAP leads at Virtusa, IFS and Hayleys. 5 interested, 2 sent CVs.",
    proofs: [
      { id: "p1", tone: "info" },
      { id: "p2", tone: "plain" },
    ],
  },
  { id: "s2", title: "Referral extraction", due: "Friday", status: "open", note: "", proofs: [] },
  { id: "s3", title: "LinkedIn groups", due: "Thursday", status: "new", note: "", proofs: [] },
];

// Sizes are the frame's px / 16 on the app's rem scale (a floor for small windows);
// colours, the type scale and the shadow are DESIGN.md's tokens. The card corners
// (22, 14, 30) are the frame's own, between the guideline sizes.
const BTN =
  "flex items-center gap-2 whitespace-nowrap rounded-full py-[max(0.625rem,7px)] pl-[max(1.25rem,14px)] pr-[max(1.375rem,15px)] text-small font-medium transition-colors";
const GHOST = BTN + " border border-border-strong bg-surface text-ink hover:bg-surface-2";
const CARD = "rounded-[1.375rem] border border-border bg-surface px-[max(1.625rem,16px)] py-5 shadow-card";
// 19px is between the scale's h3 (18) and body (16): the frame's own card title.
const TITLE = "text-[max(1.1875rem,15px)] font-medium leading-[1.3684] tracking-[-0.1px] text-ink";
const TILE = "h-[max(5rem,60px)] w-[max(6.875rem,84px)] shrink-0 rounded-[0.875rem]";

const CheckIcon = ({ className }: { className: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="m5 12 5 5 9-10" />
  </svg>
);

const today = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** The Strategies view: the lead's new strategies to accept, then each one to do,
 *  mark done with a note and proofs, and submit. */
export default function StrategiesView() {
  const [list, setList] = useState(STRATEGIES);
  const [toast, setToast] = useState<{ key: number; bold: string; rest: string } | null>(null);

  const fresh = list.filter((s) => s.status === "new");
  const ready = list.filter((s) => s.status === "done" && !s.sent);
  const patch = (id: string, p: Partial<Strategy>) => setList((l) => l.map((s) => (s.id === id ? { ...s, ...p } : s)));

  const accept = () => setList((l) => l.map((s) => (s.status === "new" ? { ...s, status: "open" } : s)));
  // shortcut: any done strategy can be submitted, even with no note or proof; add the
  // TA System's rule for what a done strategy needs when the backend is wired.
  const submit = () => {
    const n = ready.length;
    setList((l) => l.map((s) => (s.status === "done" ? { ...s, sent: true } : s)));
    setToast({ key: Date.now(), bold: `${n} ${n === 1 ? "strategy" : "strategies"}`, rest: ` sent to ${LEAD}` });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="absolute left-[max(2.3rem,14px)] top-[max(2.8rem,40px)] max-md:static max-md:px-[14px] max-md:pt-11">
        <BackButton />
      </div>

      {/* The column is 1200px (75rem) and centred, under the back arrow's row. It scrolls
          inside itself; the bottom padding keeps the last card clear of Submit. */}
      <div className="mt-[max(3.47rem,50px)] min-h-0 flex-1 overflow-y-auto px-[max(5rem,48px)] pb-[10.5rem] [scrollbar-width:none] max-md:mt-4 max-md:px-[14px]">
        <div className="mx-auto flex max-w-[75rem] flex-col gap-4">
          {fresh.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-[1.375rem] bg-warn-soft py-3.5 pl-[max(1.375rem,14px)] pr-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-warn">
                  {LEAD} gave you {fresh.length} new {fresh.length === 1 ? "strategy" : "strategies"}
                </p>
                <p className="text-small text-ink-2">
                  {fresh.map((s) => s.title).join(", ")} · accept {fresh.length === 1 ? "it" : "them"} to start
                </p>
              </div>
              <button type="button" onClick={accept} className={BTN + " bg-ink text-white hover:bg-marker"}>
                Accept
              </button>
            </div>
          )}

          {list.map((s) => (
            <StrategyCard key={s.id} s={s} patch={(p) => patch(s.id, p)} />
          ))}
        </div>
      </div>

      {ready.length > 0 && (
        <div className="absolute bottom-[max(6.5rem,20px)] left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-[1.875rem] bg-ink py-2 pl-6 pr-2 max-md:bottom-4">
          <p className="text-small text-white">
            {ready.length} ready — {LEAD} sees {ready.length === 1 ? "it" : "them"} when you submit
          </p>
          <button type="button" onClick={submit} className="rounded-full bg-surface px-5 py-[max(0.625rem,7px)] text-small font-medium text-ink transition-colors hover:bg-surface-2">
            Submit
          </button>
        </div>
      )}
      {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} />}
    </div>
  );
}

function StrategyCard({ s, patch }: { s: Strategy; patch: (p: Partial<Strategy>) => void }) {
  const done = s.status === "done";
  return (
    // A strategy not accepted yet is dimmed, as in the design.
    <article className={CARD + (s.status === "new" ? " opacity-55" : "") + (done ? " flex flex-col gap-3.5" : "")}>
      <div className="flex items-center gap-3.5">
        <div className="min-w-0">
          <h3 className={TITLE}>{s.title}</h3>
          <p className="text-small text-ink-3">
            Due {s.due} · from {LEAD}
          </p>
        </div>
        <div className="ml-auto">
          {s.status === "new" && <span className="text-small text-ink-3">Accept first</span>}
          {s.status === "open" && (
            <button type="button" onClick={() => patch({ status: "done", doneOn: today() })} className={GHOST}>
              <CheckIcon className="size-[max(1rem,14px)]" />
              Mark as done
            </button>
          )}
          {done && (
            // Pressing it takes the strategy back to open, until it is submitted.
            <button
              type="button"
              disabled={s.sent}
              onClick={() => patch({ status: "open", doneOn: undefined })}
              title={s.sent ? `Sent to ${LEAD}` : "Mark as not done"}
              className="flex items-center gap-2 whitespace-nowrap rounded-full bg-brand py-1.5 pl-1.5 pr-4 text-small font-medium text-white transition-colors enabled:hover:bg-brand-strong"
            >
              <span className="flex size-6.5 shrink-0 items-center justify-center rounded-full bg-surface text-brand">
                <CheckIcon className="size-[0.8125rem]" />
              </span>
              Done · {s.doneOn}
            </button>
          )}
        </div>
      </div>
      {done && <DoneBody s={s} patch={patch} />}
    </article>
  );
}

/** What was done: the note, then the proofs and the tile to paste or drop another. */
function DoneBody({ s, patch }: { s: Strategy; patch: (p: Partial<Strategy>) => void }) {
  const pick = useRef<HTMLInputElement>(null);
  // shortcut: a picked screenshot is only held in this browser (an object URL, kept
  // until the page closes); upload it with the backend.
  const add = (files: Iterable<File>) => {
    const urls = [...files].filter((f) => f.type.startsWith("image/")).map((f) => ({ id: `${Date.now()}-${f.name}`, url: URL.createObjectURL(f) }));
    if (urls.length) patch({ proofs: [...s.proofs, ...urls] });
  };

  return (
    <div className="flex flex-wrap gap-3.5">
      <label className="min-w-[16rem] flex-1 rounded-[0.875rem] bg-canvas px-4 py-3 focus-within:ring-2 focus-within:ring-brand/15">
        <textarea
          value={s.note}
          onChange={(e) => patch({ note: e.target.value })}
          rows={1}
          placeholder="What did you do? Numbers help."
          aria-label={`What you did for ${s.title}`}
          className="block min-h-[1.625em] w-full resize-none bg-transparent text-body text-ink outline-none [field-sizing:content] placeholder:text-ink-3"
        />
      </label>

      {s.proofs.map((p) =>
        p.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- an object URL from the person's own file, not a site image
          <img key={p.id} src={p.url} alt="Proof" className={TILE + " border border-border object-cover"} />
        ) : (
          <Placeholder key={p.id} tone={p.tone} />
        ),
      )}

      <input ref={pick} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && add(e.target.files)} />
      <button
        type="button"
        onClick={() => pick.current?.click()}
        onPaste={(e) => add(e.clipboardData.files)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(e.dataTransfer.files);
        }}
        className={TILE + " flex flex-col items-center justify-center gap-1 border border-dashed border-border-strong text-ink-3 hover:bg-surface-2"}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[max(1rem,14px)]" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
        <span className="text-caption font-medium">Paste / drop</span>
      </button>
    </div>
  );
}

/** The sample proof: a header bar and three grey lines, as drawn in the design. */
function Placeholder({ tone }: { tone?: "info" | "plain" }) {
  return (
    <div aria-hidden="true" className={TILE + " relative overflow-hidden border border-border bg-canvas"}>
      <div className={"absolute -left-px -top-px h-[1.125rem] w-[6.875rem] " + (tone === "info" ? "bg-info-soft" : "bg-surface-2")} />
      {["1.8125rem", "2.9375rem", "4.0625rem"].map((top) => (
        <div key={top} style={{ top }} className="absolute left-[0.6875rem] h-1.5 w-[4.125rem] rounded-[3px] bg-border-strong opacity-60" />
      ))}
    </div>
  );
}
