"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { DUR, EASE, gsap, loadFlip, motionOK, type FlipPlugin } from "@/lib/gsap";
import { REVIEWS_FEEDBACK, USER } from "@/lib/user";
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

type Mode = "answer" | "decline" | "fix" | null;
const first = USER.name.split(" ")[0];

export default function FeedbackBoard() {
  const items = useItems();
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
    if (x.by === first) pushAlert({ icon: "chat", title, body, href: "/today", needs: false });
  };
  const close = (x?: Item) => {
    // Opened and left undecided: it is being looked at.
    if (x?.status === "new") glide(() => update(x.id, { status: "review" }));
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

  if (!REVIEWS_FEEDBACK)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-h3 font-medium text-ink">The board is for TA Leads</p>
        <p className="text-small text-ink-3">Your own feedback and where it is are under your name, Feedback &amp; support.</p>
      </div>
    );

  return (
    <div ref={board} className="grid min-h-0 flex-1 grid-cols-4 gap-[max(1.5rem,10px)] overflow-y-auto p-[max(2.5rem,12px)] pt-[max(2.5rem,16px)] max-lg:grid-cols-2 max-sm:grid-cols-1 max-md:pt-12">
      {COLUMNS.map((c) => {
        const list = items.filter((x) => x.status === c.status);
        return (
          <section key={c.status} aria-label={c.name} className="flex min-h-[max(20rem,160px)] flex-col rounded-lg bg-canvas p-[max(0.875rem,8px)]">
            <h2 className="flex items-center gap-2.5 px-2 pb-3 pt-2 text-[max(1.0625rem,14px)] text-ink">
              <span className={"size-2 rounded-full " + c.dot} />
              {c.name}
              <span className="ml-auto text-small text-ink-3">{list.length}</span>
            </h2>
            <ul className="flex min-h-0 flex-col gap-[max(0.875rem,8px)] overflow-y-auto [scrollbar-width:thin]">
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
                />
              ))}
              {!list.length && <li className="px-2 py-6 text-center text-small text-ink-3">{c.status === "new" ? "Nothing new" : "Empty"}</li>}
            </ul>
          </section>
        );
      })}
      {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} />}
    </div>
  );
}

const BTN = "rounded-full px-[max(0.875rem,10px)] py-[max(0.5rem,6px)] text-small font-medium transition-colors";

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
}) {
  const { x, open, mode } = p;
  const body = useRef<HTMLDivElement>(null);
  const [sure, setSure] = useState(false);
  // The detail unfolds under the title.
  useEffect(() => {
    if (open && body.current) gsap.fromTo(body.current, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: DUR.base, ease: EASE.out, clearProps: "height" });
  }, [open]);
  const deciding = x.status === "new" || x.status === "review";
  const showActions = open || (deciding && x.blocks);
  const need = mode === "answer" || mode === "decline";

  return (
    <li data-fb data-flip-id={x.id} className={"rounded-md bg-surface p-[max(1.125rem,10px)] transition-shadow " + (open ? "shadow-float" : "shadow-card hover:shadow-float")}>
      <button type="button" aria-expanded={open} onClick={p.onToggle} className="block w-full text-left">
        <span className="flex flex-wrap gap-1.5">
          <span className={"rounded-full px-2.5 py-0.5 text-caption font-medium " + KIND[x.kind].chip}>{KIND[x.kind].label}</span>
          {x.blocks && x.status !== "done" && <span className="rounded-full bg-danger px-2.5 py-0.5 text-caption font-medium text-white">Blocks work</span>}
        </span>
        <span className="mt-2.5 block text-[max(1.0625rem,14px)] leading-snug text-ink">{x.title}</span>
        <span className="mt-1.5 block text-small text-ink-3">{meta(x)}</span>
      </button>

      {open && (
        <div ref={body} className="overflow-hidden">
          <p className="mt-3 whitespace-pre-line rounded-sm bg-canvas px-3 py-2.5 text-small text-ink">{x.text || "Only a voice note."}</p>
          {x.screenshot && (
            <a href={x.screenshot} target="_blank" rel="noreferrer" className="mt-2.5 block" title="Open the screenshot full size">
              {/* eslint-disable-next-line @next/next/no-img-element -- the picture the sender attached */}
              <img src={x.screenshot} alt="Screenshot sent with it" className="max-h-40 w-full rounded-sm border border-border object-cover" />
            </a>
          )}
          {x.voice && <audio controls preload="none" src={x.voice} className="mt-2.5 h-9 w-full" />}
          {x.page && (
            <p className="mt-2.5 text-caption text-ink-3">
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
            <p className="mt-2.5 text-small text-ink-2">
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
                  className="rounded-sm border border-border px-3 py-2 text-small outline-none focus:border-brand"
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
                  className="resize-none rounded-sm border border-border px-3 py-2 text-small outline-none [field-sizing:content] focus:border-brand"
                />
              )}
              <div className="flex gap-2">
                <button type="button" disabled={need && !p.words.trim()} onClick={p.onFinish} className={BTN + " bg-ink text-white hover:bg-black disabled:opacity-40"}>
                  {mode === "answer" ? "Send answer" : mode === "fix" ? "Mark fixed" : "Close it"}
                </button>
                <button type="button" onClick={() => p.onMode(null)} className={BTN + " text-ink-3 hover:text-ink"}>
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
              <button type="button" onClick={p.onPass} className={BTN + " bg-ink text-white hover:bg-black"}>
                Pass to builders
              </button>
              <button type="button" onClick={() => p.onMode("answer")} className={BTN + " border border-border-strong text-ink hover:bg-surface-2"}>
                Answer myself
              </button>
            </>
          )}
          {x.status === "builders" && (
            <button type="button" onClick={() => p.onMode("fix")} className={BTN + " bg-ink text-white hover:bg-black"}>
              Mark fixed
            </button>
          )}
          {open && x.status !== "done" && (
            <button type="button" onClick={() => p.onMode("decline")} className={BTN + " text-ink-3 hover:text-ink"}>
              Not doing it
            </button>
          )}
          {open && (
            <button type="button" onClick={() => (sure ? p.onDelete() : setSure(true))} onBlur={() => setSure(false)} className={BTN + " ml-auto " + (sure ? "text-danger" : "text-ink-3 hover:text-danger")}>
              {sure ? "Press again to delete" : "Delete"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
