"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { DUR, EASE, gsap, loadFlip, motionOK, type FlipPlugin } from "@/lib/gsap";
import { personOf, useRole, useSignedInPerson } from "@/lib/role";
import Toast from "../openings/[id]/Toast";
import { pushAlert } from "../alerts/data";
import { COLUMNS, KIND, meta, setItems, update, useItems, type Item } from "./data";

// F2, the Feedback & support board (owner's design, 14 Nov 2026) for a TA Lead,
// Director or Admin (old system's FeedbackDesk). New → Lead review → With the
// builders → Done. A card opens in place to show everything sent with it; the lead
// passes it to the builders, answers it, or says it will not be done (with why); the
// builders mark it fixed (and in which version) or not doing it. A card the lead opened
// and left undecided moves to Lead review. The sender's bell rings at every move.
// Cards glide to their new column (GSAP Flip).
// Layout (owner's Figma comment, 17 Nov 2026: "Kanban chart Layout follow"): the
// Pipeline board is the app's Kanban, so the columns, headers, cards and the empty
// column look like its own (PipelineBoard.tsx, TickList.tsx).

// An empty column: a quiet dashed box where cards would sit.
const EMPTY: Record<string, string> = {
  new: "Nothing new",
  review: "Nothing waiting for review",
  builders: "Nothing with the builders",
  done: "Nothing done yet",
};

type Mode = "answer" | "decline" | "fix" | null;

export default function FeedbackBoard() {
  // A TA sees only what they sent, and where each one is (old desk: "My submissions");
  // a lead, Director or Ops person sees everyone's and moves them on.
  const role = useRole();
  useSignedInPerson(); // the signed-in name, when it arrives
  const lead = role === "Lead" || role === "Director";
  const me = personOf(role).name.split(" ")[0];
  const all = useItems();
  const items = lead ? all : all.filter((x) => x.by === me);
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [words, setWords] = useState("");
  const [toast, setToast] = useState<{ key: number; bold: string; rest: string } | null>(null);
  const flip = useRef<FlipPlugin | null>(null);
  const pending = useRef<ReturnType<FlipPlugin["getState"]> | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    void loadFlip().then((F) => (flip.current = F));
  }, []);
  // After a move: every card glides from where it was to where it is now.
  useLayoutEffect(() => {
    if (!pending.current || !flip.current) return;
    flip.current.from(pending.current, { duration: DUR.slow, ease: EASE.inOut, absolute: true, nested: true, simple: true });
    pending.current = null;
  });
  const glide = (fn: () => void) => {
    if (flip.current && motionOK() && board.current) pending.current = flip.current.getState(board.current.querySelectorAll("[data-fb]"));
    fn();
  };

  const tell = (x: Item, title: string, body: string) => {
    if (x.by === me) pushAlert({ icon: "chat", title, body, href: "/today", needs: false });
  };
  const close = (x?: Item) => {
    // Opened and left undecided: it is being looked at.
    if (lead && x?.status === "new") glide(() => update(x.id, { status: "review" }));
    setOpen(null);
    setMode(null);
    setWords("");
  };
  const act = (x: Item, p: Partial<Item>, say: string) => {
    glide(() => update(x.id, p));
    setOpen(null);
    setMode(null);
    setWords("");
    setToast({ key: ++seq.current, bold: x.title, rest: ` — ${say}` });
  };
  const pass = (x: Item) => {
    act(x, { status: "builders" }, "passed to the builders");
    tell(x, "Your feedback is with the builders", x.title);
  };
  const finish = (x: Item) => {
    if (mode === "fix") {
      act(x, { status: "done", outcome: "fixed", version: words.trim() || x.version }, "marked fixed");
      tell(x, "Fixed: " + x.title, words.trim() ? `In ${words.trim()}` : "It is fixed");
    } else if (mode === "answer") {
      act(x, { status: "done", outcome: "answered", answer: words.trim() }, "answered");
      tell(x, "Your question was answered", words.trim());
    } else {
      act(x, { status: "done", outcome: "declined", answer: words.trim() }, "closed — not doing it");
      tell(x, "Not doing it: " + x.title, words.trim());
    }
  };
  const remove = (x: Item) => {
    glide(() => setItems((all) => all.filter((y) => y.id !== x.id)));
    setOpen(null);
    setToast({ key: ++seq.current, bold: x.title, rest: " — deleted" });
  };

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && open && close(items.find((x) => x.id === open));
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  });


  return (
    // As on the Pipeline: columns side by side, each scrolling itself with no bar; on
    // a narrow screen the row slides sideways inside the board.
    <div ref={board} className="flex min-h-0 flex-1 gap-[max(1.75rem,18px)] overflow-x-auto px-[max(1.5rem,14px)] pt-[max(2.5rem,16px)] [scrollbar-width:none] max-md:pt-12">
      {COLUMNS.map((c) => {
        const list = items.filter((x) => x.status === c.status);
        return (
          <section key={c.status} aria-label={c.name} className="flex min-h-0 min-w-[max(15rem,250px)] flex-1 basis-0 flex-col rounded-t-md border-[1.8px] border-b-0 border-surface-2 bg-surface">
            <header className="flex items-center gap-2 px-[max(1rem,11px)] pb-[max(0.8rem,9px)] pt-[max(1rem,11px)]">
              <span aria-hidden="true" className={"size-2 shrink-0 rounded-full " + c.dot} />
              <h2 className="min-w-0 flex-1 truncate text-col font-semibold text-ink">{c.name}</h2>
              <span className="rounded-md bg-surface-3 px-2 py-0.5 text-chip font-medium text-ink-2">{list.length}</span>
            </header>
            <ul className="flex min-h-0 flex-1 flex-col gap-[max(1rem,10px)] overflow-y-auto overscroll-contain px-[max(1.25rem,14px)] pb-[max(1rem,10px)] pt-1.5 [scrollbar-width:none]">
              {list.map((x) => (
                <Card
                  key={x.id}
                  x={x}
                  open={open === x.id}
                  mode={open === x.id ? mode : null}
                  words={words}
                  setWords={setWords}
                  onToggle={() => (open === x.id ? close(x) : (close(items.find((y) => y.id === open)), setOpen(x.id)))}
                  onPass={() => pass(x)}
                  onMode={(m) => {
                    setOpen(x.id);
                    setMode(m);
                    setWords(m === "fix" ? (x.version ?? "") : "");
                  }}
                  onFinish={() => finish(x)}
                  onDelete={() => remove(x)}
                  canAct={lead}
                />
              ))}
              {!list.length && (
                <li className="flex h-[max(5.5rem,64px)] shrink-0 items-center justify-center rounded-md border-[1.5px] border-dashed border-border-strong px-3 text-center text-small text-ink-3">
                  {EMPTY[c.status]}
                </li>
              )}
            </ul>
          </section>
        );
      })}
      {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} />}
    </div>
  );
}

// The app's buttons: green for the main step, outlined for the other, quiet text for the rest.
const BTN = "rounded-full px-[max(0.875rem,10px)] py-[max(0.45rem,6px)] text-small font-medium transition-colors";
const MAIN = BTN + " bg-brand text-white hover:bg-brand-strong";
const OTHER = BTN + " border border-border-strong bg-surface text-ink hover:bg-surface-2";
const QUIET = BTN + " text-ink-2 hover:text-ink";

function Card(p: {
  x: Item;
  open: boolean;
  mode: Mode;
  words: string;
  setWords: (v: string) => void;
  onToggle: () => void;
  onPass: () => void;
  onMode: (m: Mode) => void;
  onFinish: () => void;
  onDelete: () => void;
  canAct: boolean;
}) {
  const { x, open, mode } = p;
  const body = useRef<HTMLDivElement>(null);
  const [sure, setSure] = useState(false);
  // The detail unfolds under the title.
  useEffect(() => {
    if (open && body.current) gsap.fromTo(body.current, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: DUR.base, ease: EASE.out, clearProps: "height" });
  }, [open]);
  const deciding = x.status === "new" || x.status === "review";
  const showActions = p.canAct && (open || (deciding && x.blocks));
  const need = mode === "answer" || mode === "decline";

  return (
    <li
      data-fb
      data-flip-id={x.id}
      className={"shrink-0 rounded-md border bg-surface p-[max(1rem,12px)] transition-colors " + (open ? "border-brand/40" : "border-border hover:border-border-strong")}
    >
      <button type="button" aria-expanded={open} onClick={p.onToggle} className="block w-full text-left">
        <span className="flex flex-wrap gap-[max(0.35rem,4px)]">
          <span className={"rounded-md px-1.5 py-0.5 text-chip font-medium " + KIND[x.kind].chip}>{KIND[x.kind].label}</span>
          {x.blocks && x.status !== "done" && <span className="rounded-md bg-danger px-1.5 py-0.5 text-chip font-medium text-white">Blocks work</span>}
        </span>
        <span title={x.title} className="mt-[max(0.6rem,7px)] line-clamp-2 text-card-name font-medium leading-snug text-ink">
          {x.title}
        </span>
        <span title={meta(x)} className="mt-1 block truncate text-card-sub text-ink-2">
          {meta(x)}
        </span>
      </button>

      {open && (
        <div ref={body} className="overflow-hidden">
          <p className="mt-3 whitespace-pre-line break-words rounded-sm bg-surface-2 px-3 py-2.5 text-small text-ink">{x.text || "Only a voice note."}</p>
          {x.screenshot && (
            <a href={x.screenshot} target="_blank" rel="noreferrer" className="mt-2.5 block" title="Open the screenshot full size">
              {/* eslint-disable-next-line @next/next/no-img-element -- the picture the sender attached */}
              <img src={x.screenshot} alt="Screenshot sent with it" className="max-h-40 w-full rounded-sm border border-border object-cover" />
            </a>
          )}
          {x.voice && <audio controls preload="none" src={x.voice} className="mt-2.5 h-9 w-full" />}
          {x.page && (
            <p className="mt-2.5 truncate text-caption text-ink-3" title={x.page}>
              Sent from{" "}
              {x.href ? (
                <Link href={x.href} className="font-medium text-brand hover:underline">
                  {x.page}
                </Link>
              ) : (
                x.page
              )}
            </p>
          )}
          {x.answer && (
            <p className="mt-2.5 break-words text-small text-ink-2">
              <span className="font-medium text-ink">{x.outcome === "declined" ? "Why not: " : "Answer: "}</span>
              {x.answer}
            </p>
          )}
          {mode && (
            <div className="mt-3 flex flex-col gap-2">
              {mode === "fix" ? (
                <input
                  autoFocus
                  value={p.words}
                  onChange={(e) => p.setWords(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && p.onFinish()}
                  placeholder="Which version? (e.g. v4.14) - optional"
                  maxLength={20}
                  className="rounded-sm border border-border bg-surface px-3 py-2 text-small text-ink outline-none focus:border-brand"
                />
              ) : (
                <textarea
                  autoFocus
                  value={p.words}
                  onChange={(e) => p.setWords(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && p.words.trim() && p.onFinish()}
                  rows={2}
                  maxLength={1000}
                  placeholder={mode === "answer" ? `Your answer to ${x.by}` : `Why not? ${x.by} reads this`}
                  className="max-h-40 resize-none rounded-sm border border-border bg-surface px-3 py-2 text-small text-ink outline-none [field-sizing:content] focus:border-brand"
                />
              )}
              <div className="flex gap-2">
                <button type="button" disabled={need && !p.words.trim()} onClick={p.onFinish} className={MAIN + " disabled:pointer-events-none disabled:opacity-40"}>
                  {mode === "answer" ? "Send answer" : mode === "fix" ? "Mark fixed" : "Close it"}
                </button>
                <button type="button" onClick={() => p.onMode(null)} className={QUIET}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showActions && !mode && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {deciding && (
            <>
              <button type="button" onClick={p.onPass} className={MAIN}>
                Pass to builders
              </button>
              <button type="button" onClick={() => p.onMode("answer")} className={OTHER}>
                Answer myself
              </button>
            </>
          )}
          {x.status === "builders" && (
            <button type="button" onClick={() => p.onMode("fix")} className={MAIN}>
              Mark fixed
            </button>
          )}
          {open && x.status !== "done" && (
            <button type="button" onClick={() => p.onMode("decline")} className={QUIET}>
              Not doing it
            </button>
          )}
          {open && (
            <button type="button" onClick={() => (sure ? p.onDelete() : setSure(true))} onBlur={() => setSure(false)} className={BTN + " ml-auto " + (sure ? "bg-danger-soft text-danger" : "text-ink-2 hover:text-danger")}>
              {sure ? "Press again to delete" : "Delete"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
