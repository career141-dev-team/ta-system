"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DUR, EASE, gsap } from "@/lib/gsap";
import { REVIEWS_FEEDBACK } from "@/lib/user";
import { useMe, worksADay } from "@/lib/role";
import Toast from "../openings/[id]/Toast";
import { Veil } from "../TopMenus";
import { KIND, setItems, titleOf, useItems, whereIs, type Kind } from "./data";
import { useLive } from "@/lib/backend";
import { sendFeedback, uploadFeedbackFile, useFeedbackLive, useRights } from "./feedbackLive";

// F1 "Tell us" (owner's design, 14 Nov 2026), opened from the person's menu on any
// page: something broke, an idea, or a question, in your own words (or a voice note);
// a screenshot and the page you were on go with it; "It blocks my work" marks it urgent.
// Old system's rules (FeedbackWidget): words or a voice note are needed; the screenshot
// is an image under 3 MB and may be pasted; the voice note is 3 minutes / 10 MB at
// most; a TA's goes to their lead first, a lead's straight to the builders. Your recent
// ones show where each is now.

const SHOT_MAX = 3 * 1024 * 1024;
const VOICE_MAX_S = 180;
const VOICE_MAX_B = 10 * 1024 * 1024;

/** The page in words, as drawn ("Today · AURA chat"). */
function pageName(path: string) {
  if (path.startsWith("/openings/")) return "Opening · Senior Manager — SAP";
  const names: Record<string, string> = {
    "/today": "Today · AURA chat",
    "/openings": "Openings",
    "/strategy": "Strategy Planner",
    "/strategy/plan": "Strategy Planner · plan a job",
    "/strategy/submissions": "Strategy Planner · submissions",
    "/database": "Database · AURA chat",
    "/ta-track": "TA Track",
    "/feedback": "Feedback & support",
  };
  return names[path] ?? path;
}

const KINDS: { kind: Kind; label: string; icon: React.ReactNode }[] = [
  { kind: "broke", label: "Something broke", icon: <path d="M8 2l1.5 2M16 2l-1.5 2M9 8a3 3 0 1 1 6 0v1H9zM6 13h12M7 9h10v5a5 5 0 0 1-10 0zM12 14v6M4 12H2M22 12h-2M5 19l-2 2M19 19l2 2" /> },
  { kind: "idea", label: "An idea", icon: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3Z" /> },
  { kind: "question", label: "A question", icon: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" /> },
];

export default function TellUs({ onClose }: { onClose: () => void }) {
  const path = usePathname();
  const items = useItems();
  // A TA's feedback goes to their lead first; anyone else's straight to the builders.
  const me = useMe();
  const first = me.first;
  const ta = worksADay(me.role);
  // Live (R2, 20 Nov): sent through the old desk's own submit; "Your recent" is your own rows.
  const live = useLive();
  useFeedbackLive(live);
  const rights = useRights();
  const [busy, setBusy] = useState(false);
  const shotFile = useRef<File | null>(null);
  const voiceBlob = useRef<Blob | null>(null);
  const [kind, setKind] = useState<Kind>("broke");
  const [text, setText] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [withPage, setWithPage] = useState(true);
  const [blocks, setBlocks] = useState(false);
  const [voice, setVoice] = useState<string | null>(null);
  const [rec, setRec] = useState(0);
  const [recording, setRecording] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState<{ key: number; bold: string; rest: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const mic = useRef<MediaRecorder | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const shut = useRef(onClose);
  useLayoutEffect(() => {
    shut.current = onClose;
  });

  // Rises in from the right; Escape closes; the microphone is let go when it closes.
  useEffect(() => {
    gsap.fromTo(panel.current, { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: DUR.base, ease: EASE.out });
    box.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && shut.current();
    addEventListener("keydown", esc);
    return () => {
      removeEventListener("keydown", esc);
      if (tick.current) clearInterval(tick.current);
      mic.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const addShot = (f?: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setErr("A screenshot must be a picture (PNG, JPG, WebP or GIF).");
    if (f.size > SHOT_MAX) return setErr("That screenshot is over 3 MB. Choose a smaller one.");
    setErr("");
    shotFile.current = f;
    setShot((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  };

  const stop = () => {
    if (tick.current) clearInterval(tick.current);
    if (mic.current?.state === "recording") mic.current.stop();
    setRecording(false);
  };
  const record = async () => {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(stream);
      const parts: Blob[] = [];
      m.ondataavailable = (e) => e.data.size && parts.push(e.data);
      m.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(parts, { type: m.mimeType || "audio/webm" });
        if (blob.size > VOICE_MAX_B) return setErr("That voice note is over 10 MB. Record a shorter one.");
        voiceBlob.current = blob;
        setVoice(URL.createObjectURL(blob));
      };
      m.start();
      mic.current = m;
      setRec(0);
      setRecording(true);
      tick.current = setInterval(() => setRec((n) => (n + 1 >= VOICE_MAX_S ? (stop(), n + 1) : n + 1)), 1000);
    } catch {
      setErr("The microphone is blocked. Allow it in the browser, or type instead.");
    }
  };

  const ready = !!text.trim() || !!voice;
  const sendLive = async () => {
    setBusy(true);
    setErr("");
    let screenshot: string | undefined;
    let voiceNote: string | undefined;
    if (shot && shotFile.current) {
      const r = await uploadFeedbackFile("shot", shotFile.current);
      if (!r.ok) return setBusy(false), setErr(r.message);
      screenshot = r.id;
    }
    if (voice && voiceBlob.current) {
      const r = await uploadFeedbackFile("voice", voiceBlob.current);
      if (!r.ok) return setBusy(false), setErr(r.message);
      voiceNote = r.id;
    }
    const r = await sendFeedback({ do: "send", kind, text: text.trim(), blocks, page: withPage && path !== "/feedback" ? pageName(path) : "", screenshot, voiceNote });
    setBusy(false);
    if (!r.ok) return setErr(r.message ?? "It could not be sent. Try again.");
    setText("");
    setShot(null);
    setVoice(null);
    shotFile.current = null;
    voiceBlob.current = null;
    setBlocks(false);
    setToast({ key: Date.now(), bold: "Sent", rest: ta ? " — your lead sees it first" : " — it is with the builders" });
  };
  const send = () => {
    if (!ready || recording || busy) return;
    if (live) return void sendLive();
    const title = titleOf(text, !!voice);
    setItems((all) => [
      {
        id: `f${Date.now()}`,
        kind,
        title,
        text: text.trim(),
        by: first,
        ago: "just now",
        blocks,
        page: withPage && path !== "/feedback" ? pageName(path) : undefined,
        href: withPage && path !== "/feedback" ? path : undefined,
        screenshot: shot ?? undefined,
        voice: voice ?? undefined,
        // A lead's goes straight to the builders, as in the old system.
        status: REVIEWS_FEEDBACK && !ta ? "builders" : "new",
      },
      ...all,
    ]);
    setText("");
    setShot(null);
    setVoice(null);
    setBlocks(false);
    setToast({ key: Date.now(), bold: "Sent", rest: ta ? " — your lead sees it first" : " — it is with the builders" });
  };

  const mine = items.filter((x) => (live ? !!rights && x.byId === rights.me : x.by === first)).slice(0, 3);
  const waiting = items.filter((x) => x.status === "new").length;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return createPortal(
    <>
      <Veil onClose={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-label="Tell us"
        onPaste={(e) => {
          const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
          if (f) {
            e.preventDefault();
            addShot(f);
          }
        }}
        className="fixed right-[max(3rem,12px)] top-[max(10rem,64px)] z-[71] flex max-h-[calc(100dvh-max(11rem,72px))] w-[max(37.5rem,300px)] max-w-[calc(100vw-24px)] flex-col overflow-y-auto rounded-xl bg-surface p-[max(2rem,16px)] shadow-float max-md:right-3 max-md:top-3 max-md:max-h-[calc(100dvh-24px)]"
      >
        <div className="flex items-start">
          <h2 className="text-h1 font-light text-ink">Tell us</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <p className="mt-3 text-small text-ink-3">
          {ta ? "Your lead sees it first, then the people who build the system." : "It goes straight to the people who build the system."} The bell tells you when it moves.
        </p>

        <div role="radiogroup" aria-label="What is it?" className="mt-5 grid grid-cols-3 gap-[max(0.75rem,6px)]">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={kind === k.kind}
              onClick={() => setKind(k.kind)}
              className={"flex flex-col items-start gap-2.5 rounded-lg px-4 py-[max(1rem,10px)] text-left text-small font-medium transition-colors " + (kind === k.kind ? "bg-ink text-white" : "bg-canvas text-ink hover:bg-surface-2")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
                {k.icon}
              </svg>
              {k.label}
            </button>
          ))}
        </div>

        <div className="relative mt-[max(1.25rem,10px)] rounded-lg bg-canvas focus-within:ring-2 focus-within:ring-brand/15">
          <textarea
            ref={box}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && send()}
            rows={4}
            maxLength={4000}
            placeholder={KIND[kind].ask}
            aria-label="Tell us in your own words"
            className="block min-h-[max(10.5rem,110px)] w-full resize-none bg-transparent px-5 pb-12 pt-[max(1.25rem,12px)] text-body text-ink outline-none placeholder:text-ink-3"
          />
          {/* Voice note: a mic in the corner (the old system's voice note). */}
          <div className="absolute bottom-3 left-4 right-4 flex items-center gap-2">
            {recording ? (
              <>
                <span className="size-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />
                <span className="font-mono text-caption text-ink-2">
                  {mmss(rec)} / 3:00
                </span>
                <button type="button" onClick={stop} className="ml-auto rounded-full bg-danger px-3 py-1 text-caption font-medium text-white">
                  Stop
                </button>
              </>
            ) : voice ? (
              <>
                <audio controls src={voice} className="h-8 min-w-0 flex-1" />
                <button type="button" onClick={() => setVoice(null)} className="text-caption text-ink-3 hover:text-danger">
                  Remove
                </button>
              </>
            ) : (
              <button type="button" onClick={record} aria-label="Record a voice note" title="Record a voice note (up to 3 minutes)" className="ml-auto flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-[1.1rem]" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="mt-[max(1.25rem,10px)] grid grid-cols-2 gap-[max(0.75rem,6px)] max-sm:grid-cols-1">
          <input ref={pick} type="file" accept="image/*" hidden onChange={(e) => addShot(e.target.files?.[0])} />
          <button type="button" onClick={() => (shot ? setShot(null) : pick.current?.click())} title={shot ? "Remove the screenshot" : "Pick a picture, or paste one with Ctrl+V"} className="flex items-center gap-3 rounded-md border border-border p-2.5 text-left hover:bg-canvas">
            {shot ? (
              // eslint-disable-next-line @next/next/no-img-element -- the person's own pasted picture
              <img src={shot} alt="" className="h-9 w-[3.25rem] shrink-0 rounded-xs object-cover" />
            ) : (
              <span className="h-9 w-[3.25rem] shrink-0 rounded-xs bg-surface-2" />
            )}
            <span>
              <span className="block text-small font-medium text-ink">Screenshot</span>
              <span className="block text-caption text-ink-3">{shot ? "attached · press to remove" : "paste or pick one"}</span>
            </span>
          </button>
          <button type="button" onClick={() => setWithPage(!withPage)} aria-pressed={withPage} title={withPage ? "Leave the page out" : "Send the page with it"} className="flex items-center gap-3 rounded-md border border-border p-2.5 pl-4 text-left hover:bg-canvas">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={"size-[1.1rem] shrink-0 " + (withPage ? "text-ink-2" : "text-ink-3")} aria-hidden="true">
              <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
            </svg>
            <span className="min-w-0">
              <span className={"block text-small font-medium " + (withPage ? "text-ink" : "text-ink-3 line-through")}>This page</span>
              <span className="block truncate text-caption text-ink-3">{withPage ? pageName(path) : "left out"}</span>
            </span>
          </button>
        </div>
        {err && <p className="mt-3 text-small text-danger">{err}</p>}

        <div className="mt-[max(1.25rem,10px)] flex items-center gap-3">
          <button type="button" role="switch" aria-checked={blocks} onClick={() => setBlocks(!blocks)} className="flex items-center gap-3 text-small text-ink-2">
            <span className={"relative flex h-[max(1.75rem,22px)] w-[max(2.875rem,38px)] items-center rounded-full p-[3px] transition-colors " + (blocks ? "bg-danger" : "bg-surface-3")}>
              <span className={"block aspect-square h-full rounded-full bg-surface shadow-card transition-transform " + (blocks ? "translate-x-full" : "")} />
            </span>
            It blocks my work
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!ready || recording || busy}
            title={ready ? "Send (Ctrl+Enter)" : "Write what happened, or record a voice note"}
            className="ml-auto rounded-full bg-ink px-[max(1.75rem,18px)] py-[max(0.875rem,9px)] text-body font-medium text-white hover:bg-black disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </div>

        {(mine.length > 0 || REVIEWS_FEEDBACK) && <div className="mt-[max(1.5rem,12px)] h-px shrink-0 bg-border" />}
        {mine.length > 0 && (
          <>
            <p className="mt-[max(1.25rem,10px)] text-caption font-medium uppercase text-ink-3">Your recent</p>
            <ul className="mt-2 flex flex-col">
              {mine.map((x) => {
                const w = whereIs(x);
                return (
                  <li key={x.id} className="py-2">
                    <p className="flex items-center gap-3 text-small text-ink">
                      <span className="min-w-0 flex-1 truncate">{x.title}</span>
                      <span className="flex shrink-0 items-center gap-2 text-caption text-ink-3">
                        <span className={"size-1.5 rounded-full " + w.dot} />
                        {w.text}
                      </span>
                    </p>
                    {x.answer && <p className="mt-1 text-caption text-ink-2">{x.answer}</p>}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {REVIEWS_FEEDBACK && (
          <Link href="/feedback" onClick={onClose} className="mt-3 flex items-center gap-2 text-small font-medium text-brand hover:underline">
            {waiting ? `${waiting} new for you to look at` : "Everyone's feedback"} — open the board
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
      {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} />}
    </>,
    document.body,
  );
}
