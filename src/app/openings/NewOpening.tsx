"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { DUR, EASE, gsap, motionOK, swapIn, useGSAP, useSwap } from "@/lib/gsap";
import { useMe } from "@/lib/role";
import { useLiftMenu } from "./[id]/liftMenu";
import { CITIES, CLIENTS, EMPTY, TARGET_WORDS, TEAM, readBrief, type Loc, type Opening, type Priority, type Read } from "./data";

// New opening (owner's design, 14 Nov 2026): first the words - paste a JD, drop a
// file, record or type a brief - and "Read it"; then "Here's what I understood" with
// every field open to change, and Create. "Fill it in myself" goes straight to the
// fields. Old rules kept (openings skill §2): a client and a role are needed; a lead
// may put any TAs on it and none is allowed (Unassigned); a TA is put on it themself
// and a lead adds others; the JD is drafted after it is made.

const READ_MS = 900;

// One-tap starts under the box (owner, 17 Nov 2026: "Add Chat suggestions"): the short
// label is the chip, the whole brief goes into the box to edit, then Read it.
const STARTS: [string, string][] = [
  ["Senior accountant for John Keells, Colombo, P2", "John Keells want a Senior Accountant in Colombo - 5+ years, CIMA qualified. Treat it as P2."],
  ["Two sales executives in Kandy and Galle", "Cargills need a Sales Executive for Kandy and Galle - 1 in Kandy and 1 in Galle, 2+ years in FMCG sales."],
  ["HR business partner for Dialog, urgent", "Dialog Axiata need an HR Business Partner in Colombo, 8+ years in HR. Urgent - treat it as P1."],
];

export default function NewOpening({
  start,
  onClose,
  onCreate,
}: {
  start: string;
  onClose: () => void;
  onCreate: (o: Opening) => void;
}) {
  const { first: ME, lead: LEAD } = useMe();
  const [step, setStep] = useState<"write" | "check">("write");
  const [text, setText] = useState(start);
  const [file, setFile] = useState("");
  const [reading, setReading] = useState(false);
  const [r, setR] = useState<Read>(EMPTY);
  const root = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const brief = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  useGSAP(
    () => {
      gsap.from("[data-veil]", { opacity: 0, duration: DUR.fast });
      gsap.from("[data-box]", { opacity: 0, y: 14, scale: 0.97, duration: DUR.base, ease: EASE.out });
    },
    { scope: root },
  );
  // Each step arrives by the one switch.
  const first = useRef(true);
  useGSAP(
    () => {
      if (first.current) {
        first.current = false;
        return;
      }
      if (box.current) swapIn(box.current);
    },
    { dependencies: [step] },
  );
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  // A TA is on their own opening and nobody else, whatever the brief names: only a
  // lead puts other TAs on it.
  const withMe = (x: Read) => (LEAD ? x : { ...x, team: [ME] });
  const read = () => {
    if (!text.trim() || reading) return;
    setReading(true);
    // ponytail: a stand-in wait; with the backend this is one model call.
    timer.current = setTimeout(() => {
      setReading(false);
      setR(withMe(readBrief(text)));
      setDone([]);
      setStep("check");
    }, READ_MS);
  };
  const missing = !r.role.trim() ? "the role" : !r.client.trim() ? "the client" : !LEAD && !r.clientKnown ? "one of your clients" : "";
  const create = () => {
    if (missing) return;
    onCreate({
      id: `new${Date.now()}`,
      client: r.client.trim(),
      title: r.role.trim(),
      status: "active",
      priority: r.priority,
      days: 0,
      team: r.team,
      made: 0,
    });
  };
  const set = (p: Partial<Read>) => setR((x) => ({ ...x, ...p }));

  // What AURA still needs, asked one at a time with one-tap answers or a small box
  // (owner, 14 Nov: "do not restrict the users... AURA can help them with one or two
  // buttons or a small input"). Only the role and the client stop Create; the rest
  // can be skipped and keeps the old system's default (Sri Lanka, P3, nobody yet).
  const [done, setDone] = useState<string[]>([]);
  const skip = (k: string) => setDone((d) => [...d, k]);
  const asks: Ask[] = [];
  if (!r.role.trim())
    asks.push({ key: "role", say: "What's the role?", box: { hint: "e.g. Finance Manager", go: (v) => set({ role: v }) } });
  if (!r.client.trim())
    asks.push({
      key: "client",
      say: "Which client is it for?",
      chips: CLIENTS.slice(0, 3).map((c) => ({ label: c, go: () => set({ client: c, clientKnown: true }) })),
      box: { hint: "Or type the client", go: (v) => set({ client: v, clientKnown: CLIENTS.includes(v) }) },
    });
  else if (!r.clientKnown && !done.includes("newClient"))
    asks.push({
      key: "newClient",
      // Only a TA Lead, the Director or Ops adds a client (client.manage).
      say: LEAD
        ? `“${r.client.trim()}” isn't one of your clients yet. Add it as a new client?`
        : `“${r.client.trim()}” isn't one of your clients. Only a TA Lead, the Director or Ops adds a new client - pick one of yours, or ask your lead.`,
      chips: [
        ...(LEAD ? [{ label: "Yes, add it", go: () => skip("newClient") }] : []),
        { label: "Pick another", go: () => set({ client: "", clientKnown: false }) },
      ],
    });
  if (!r.locations.length && !done.includes("where"))
    asks.push({
      key: "where",
      say: "Where is the job?",
      chips: [
        ...["Colombo", "Kandy", "Galle"].map((c) => ({ label: c, go: () => set({ locations: [{ city: c, people: 1 }] }) })),
        { label: "Not sure yet", go: () => skip("where") },
      ],
      box: { hint: "Another city", go: (v) => set({ locations: [{ city: v, people: 1 }] }) },
    });
  if (LEAD && !r.team.length && !done.includes("team"))
    asks.push({
      key: "team",
      say: "Who works on it?",
      chips: [
        ...TEAM.slice(0, 3).map((n) => ({ label: n, go: () => set({ team: [n] }) })),
        { label: "Leave unassigned", go: () => skip("team") },
      ],
    });
  if (!r.read.includes("priority") && !done.includes("priority"))
    asks.push({
      key: "priority",
      say: `I set it to P${r.priority} — ${TARGET_WORDS[r.priority]}. Right?`,
      chips: [
        { label: `Keep P${r.priority}`, go: () => skip("priority") },
        ...([1, 2] as Priority[])
          .filter((p) => p !== r.priority)
          .map((p) => ({ label: `P${p} · ${TARGET_WORDS[p]}`, go: () => (set({ priority: p }), skip("priority")) })),
      ],
    });
  if (!r.musts.trim() && !done.includes("musts"))
    asks.push({
      key: "musts",
      say: "Anything they must have?",
      chips: [{ label: "Skip", go: () => skip("musts") }],
      box: { hint: "e.g. 5+ years, CIMA", go: (v) => set({ musts: v }) },
    });

  return createPortal(
    <div ref={root} className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div data-veil className="absolute inset-0 bg-canvas/50 backdrop-blur-md" />
      <div
        data-box
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-opening-title"
        className={
          "relative max-h-[calc(100dvh-32px)] max-w-full overflow-y-auto rounded-xl bg-surface shadow-float " +
          (step === "write" ? "w-[max(62.5rem,320px)]" : "w-[max(77.5rem,320px)]")
        }
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
          className="absolute right-[max(2.5rem,14px)] top-[max(2.75rem,16px)] z-10 flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <div ref={box}>
          {step === "write" ? (
            <div className="flex flex-col gap-7 px-[max(3.5rem,20px)] py-[max(3rem,24px)]">
              <h2 id="new-opening-title" className="text-h1 font-light text-ink">
                New opening
              </h2>
              <p className="-mt-2 text-body text-ink-2">
                Paste the job description, drop a file, or just tell AURA about the role. It fills the rest in for you.
              </p>
              <div
                className="flex flex-col gap-3 rounded-lg border border-border bg-canvas px-[max(1.75rem,14px)] pb-[max(1.375rem,12px)] pt-[max(1.625rem,14px)] focus-within:ring-2 focus-within:ring-brand/30"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) attach(f, setFile, setText);
                }}
              >
                <textarea
                  ref={brief}
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) read();
                  }}
                  rows={4}
                  maxLength={8000}
                  aria-label="The brief or the job description"
                  placeholder="e.g. PGP want a Senior Manager for their SAP S/4HANA move — Colombo, 10+ years. Treat it as P1. Put Chathura on it."
                  className="min-h-[max(7rem,90px)] w-full resize-none bg-transparent text-h3 font-medium text-ink outline-none [field-sizing:content] placeholder:font-normal placeholder:text-ink-3"
                />
                <div className="flex flex-wrap items-center gap-2.5">
                  <Speak onText={(t) => setText((x) => (x ? x + " " : "") + t)} />
                  <label className="flex cursor-pointer items-center gap-2 rounded-full bg-surface py-2 pl-3.5 pr-4 text-small font-medium text-ink-2 hover:text-ink">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                      <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" />
                    </svg>
                    {file || "Attach JD"}
                    <input type="file" accept=".pdf,.doc,.docx,.txt" className="sr-only" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0], setFile, setText)} />
                  </label>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={read}
                    disabled={!text.trim() || reading}
                    title="Ctrl+Enter"
                    className="flex items-center gap-2.5 rounded-full bg-ink py-2 pl-2 pr-[max(1.375rem,16px)] text-body font-medium text-white transition-colors hover:bg-marker disabled:opacity-40"
                  >
                    <AuraMark breathing={reading} />
                    {reading ? "Reading…" : "Read it"}
                  </button>
                </div>
              </div>
              {/* Hidden, not removed, once there are words: the line under it stays put. */}
              <div className={"-mt-3 flex flex-wrap items-center gap-2 " + (text.trim() ? "invisible" : "")} aria-hidden={!!text.trim()}>
                <span className="text-small text-ink-3">Try</span>
                {STARTS.map(([label, full]) => (
                  <button
                    key={label}
                    type="button"
                    title={full}
                    onClick={() => {
                      setText(full);
                      // Into the box with the caret at the end, ready to change.
                      requestAnimationFrame(() => {
                        brief.current?.focus();
                        brief.current?.setSelectionRange(full.length, full.length);
                      });
                    }}
                    className="max-w-full truncate rounded-full border border-border bg-surface px-3.5 py-1.5 text-small text-ink-2 transition-colors hover:border-brand hover:text-brand"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-small text-ink-3">
                Prefer a form?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setR(withMe(EMPTY));
                    setDone([]);
                    setStep("check");
                  }}
                  className="font-medium text-ink hover:underline"
                >
                  Fill it in myself
                </button>
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 px-[max(3.5rem,18px)] py-[max(3rem,22px)]">
              <div className="mb-1 flex items-center gap-3.5 pr-10">
                <AuraMark />
                <h2 id="new-opening-title" className="text-h2 text-ink">
                  {r.read.length ? "Here’s what I understood. Change anything." : "Tell me about the opening."}
                </h2>
              </div>
              <Field label="Role" ai={r.read.includes("role")}>
                <input value={r.role} onChange={(e) => set({ role: e.target.value })} aria-label="Role" placeholder="e.g. Finance Manager" className={INPUT} />
              </Field>
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field label="Client" ai={r.read.includes("client")}>
                  <input
                    value={r.client}
                    list="clients"
                    onChange={(e) => set({ client: e.target.value, clientKnown: CLIENTS.includes(e.target.value) })}
                    aria-label="Client"
                    placeholder="Choose or type a client"
                    className={INPUT}
                  />
                  <datalist id="clients">
                    {CLIENTS.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  {r.client.trim() && (
                    <p className={"mt-1 text-small " + (r.clientKnown ? "text-success" : "text-ink-3")}>
                      {r.clientKnown ? "✓ Matched your existing client" : LEAD ? "A new client - it is added with the opening" : "Not one of your clients - only a lead adds a new one"}
                    </p>
                  )}
                </Field>
                <Field label="Where · how many" ai={r.read.includes("where")}>
                  <Places locs={r.locations} onChange={(locations) => set({ locations })} />
                </Field>
                <Field label="Priority" ai={r.read.includes("priority")}>
                  <div role="radiogroup" aria-label="Priority" className="mt-1 flex flex-wrap gap-1.5">
                    {([1, 2, 3, 4, 5] as Priority[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        role="radio"
                        aria-checked={r.priority === p}
                        onClick={() => set({ priority: p })}
                        className={
                          "flex w-[max(4.2rem,52px)] flex-col items-center rounded-md py-1.5 transition-colors " +
                          (r.priority === p ? "bg-ink text-white" : "bg-surface text-ink hover:bg-surface-3")
                        }
                      >
                        <span className="text-small font-medium">P{p}</span>
                        <span className={"text-caption " + (r.priority === p ? "text-white/80" : "text-ink-3")}>{TARGET_WORDS[p]}</span>
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Team" ai={r.read.includes("team")}>
                  <Team team={r.team} onChange={(team) => set({ team })} />
                </Field>
                <Field label="Must-haves" ai={r.read.includes("musts")}>
                  <textarea
                    value={r.musts}
                    onChange={(e) => set({ musts: e.target.value })}
                    rows={1}
                    aria-label="Must-haves"
                    placeholder="e.g. 10+ years · led a rollout · ~LKR 1.2M"
                    className={INPUT + " resize-none [field-sizing:content]"}
                  />
                </Field>
                <Field label="Hiring for · Gender">
                  <div className="flex flex-wrap items-center gap-x-2 text-body font-medium text-ink">
                    <select value={r.hiringFor} onChange={(e) => set({ hiringFor: e.target.value })} aria-label="Hiring for" className={SELECT}>
                      {["Any nationality", "Local", "Expat"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    ·
                    <select value={r.gender} onChange={(e) => set({ gender: e.target.value })} aria-label="Gender" className={SELECT}>
                      {["Any", "Female", "Male"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  {r.hiringFor === "Any nationality" && r.gender === "Any" && <p className="mt-1 text-small text-ink-3">Not mentioned — left open</p>}
                </Field>
                <Field label="Auto follow-up">
                  <label className="mt-1 flex cursor-pointer items-center gap-3 text-body text-ink">
                    <input type="checkbox" checked={r.autoFollowUp} onChange={(e) => set({ autoFollowUp: e.target.checked })} className="peer sr-only" />
                    <span
                      aria-hidden="true"
                      className={
                        "relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 " +
                        (r.autoFollowUp ? "bg-brand" : "bg-border-strong")
                      }
                    >
                      <span className={"absolute top-1 size-5 rounded-full bg-white transition-[left] " + (r.autoFollowUp ? "left-6" : "left-1")} />
                    </span>
                    {r.autoFollowUp ? "On — AURA chases for CV, salary and notice" : "Off — a TA sends each message"}
                  </label>
                </Field>
              </div>
              {asks.length > 0 && <AuraAsks q={asks[0]} more={asks.length - 1} />}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="mr-auto text-small text-ink-3">
                  {missing
                    ? `Add ${missing} to create it.`
                    : asks.length
                      ? "You can create it now — anything left keeps the usual default."
                      : "AURA will draft the JD next — you approve it before it goes live."}
                </p>
                <button type="button" onClick={() => setStep("write")} className="h-[max(3.25rem,40px)] rounded-full border border-border-strong px-6 text-body font-medium text-ink hover:bg-surface-2">
                  Back
                </button>
                <button
                  type="button"
                  onClick={create}
                  disabled={!!missing}
                  className="h-[max(3.25rem,40px)] rounded-full bg-brand px-6 text-body font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
                >
                  Create opening
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const INPUT = "w-full bg-transparent text-body font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-3";
const SELECT = "cursor-pointer appearance-none bg-transparent outline-none hover:text-brand";

/** A field's box; ✦ when AURA filled it from the words. */
function Field({ label, ai = false, children }: { label: string; ai?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-canvas px-[max(1.375rem,14px)] py-[max(1rem,10px)] focus-within:ring-2 focus-within:ring-brand/30">
      <p className="flex items-center gap-1.5 text-small text-ink-3">
        {label}
        {ai && (
          <span className="text-violet" title="AURA read this from your words">
            ✦
          </span>
        )}
      </p>
      {children}
    </div>
  );
}

/** Who works it: chips with an x, and + to add. A TA is on their own opening and only
 *  a lead adds others. */
function Team({ team, onChange }: { team: string[]; onChange: (t: string[]) => void }) {
  const { first: ME, lead: LEAD } = useMe();
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const left = TEAM.filter((n) => !team.includes(n));
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {team.map((n, i) => (
        <span key={n} className="flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-2 text-small font-medium text-ink">
          <span className={"flex size-7 items-center justify-center rounded-full text-caption font-medium " + (i % 2 ? "bg-info-soft text-info" : "bg-brand-soft text-brand")}>
            {n.slice(0, 2).toUpperCase()}
          </span>
          {n}
          {(LEAD || n !== ME) && (
            <button type="button" onClick={() => onChange(team.filter((x) => x !== n))} aria-label={`Take ${n} off`} className="rounded-full p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="size-3" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </span>
      ))}
      {LEAD ? (
        left.length > 0 && (
          <div ref={root} className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-haspopup="menu"
              aria-label="Add a TA"
              title="Add a TA"
              className="flex size-9 items-center justify-center rounded-full border border-border-strong text-ink-2 hover:bg-surface hover:text-ink"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            {shown && (
              <div ref={panel} role="menu" className="absolute left-0 top-full z-30 mt-2 flex min-w-40 flex-col rounded-md bg-surface p-1.5 shadow-float ring-1 ring-border/60">
                {left.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onChange([...team, n]);
                      setOpen(false);
                    }}
                    className="rounded-sm px-3 py-2 text-left text-small text-ink hover:bg-surface-2"
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      ) : (
        <span className="text-small text-ink-3">A lead adds others.</span>
      )}
      {LEAD && !team.length && <span className="text-small text-ink-3">Nobody yet — it goes to Unassigned</span>}
    </div>
  );
}

/** AURA's mark; breathing while it reads. */
function AuraMark({ breathing = false }: { breathing?: boolean }) {
  const glow = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      if (!breathing || !glow.current || !motionOK()) return;
      gsap.to(glow.current, { scale: 1.35, opacity: 0.15, duration: 0.9, ease: "sine.inOut", repeat: -1, yoyo: true });
    },
    { dependencies: [breathing] },
  );
  return (
    <span className="relative flex size-10 shrink-0">
      {breathing && (
        <span
          ref={glow}
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,var(--color-aura-1),var(--color-aura-2),var(--color-aura-3),var(--color-aura-4),var(--color-aura-1))] opacity-40"
        />
      )}
      <Image src="/aura-mark.png" alt="" width={40} height={40} className="relative size-full rounded-full" />
    </span>
  );
}

/** "Record a brief": the browser's own speech, put into the box as text. */
function Speak({ onText }: { onText: (t: string) => void }) {
  type Rec = { lang: string; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void; stop: () => void };
  const rec = useRef<Rec | null>(null);
  const [ok, setOk] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const R = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!R) return;
    const r = new R();
    r.lang = "en-GB";
    r.onresult = (e) => onText(e.results[0][0].transcript);
    r.onend = () => setOn(false);
    rec.current = r;
    queueMicrotask(() => setOk(true));
  }, [onText]);
  return (
    <button
      type="button"
      disabled={!ok}
      aria-pressed={on}
      title={ok ? (on ? "Stop" : "Record a brief") : "Recording is not available in this browser"}
      onClick={() => {
        if (!rec.current) return;
        if (on) rec.current.stop();
        else {
          rec.current.start();
          setOn(true);
        }
      }}
      className={"flex items-center gap-2 rounded-full py-2 pl-3.5 pr-4 text-small font-medium disabled:opacity-40 " + (on ? "bg-danger-soft text-danger" : "bg-surface text-ink-2 hover:text-ink")}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
      </svg>
      {on ? "Listening… press to stop" : "Record a brief"}
    </button>
  );
}

/** A dropped or picked JD: a text file is read into the box; a PDF or Word file is
 *  named, and AURA reads it once the backend is wired. */
function attach(f: File, setFile: (n: string) => void, setText: (fn: (x: string) => string) => void) {
  setFile(f.name);
  if (f.type === "text/plain" || f.name.endsWith(".txt")) void f.text().then((t) => setText(() => t.slice(0, 8000)));
  else setText((x) => x || `JD attached: ${f.name.replace(/\.[^.]+$/, "")}`);
}

type Ask = {
  key: string;
  say: string;
  chips?: { label: string; go: () => void }[];
  box?: { hint: string; go: (v: string) => void };
};

/** AURA's one question about what is still missing: a line, one-tap answers, and a
 *  small box when a tap cannot answer it. Each new question arrives by the one switch. */
function AuraAsks({ q, more }: { q: Ask; more: number }) {
  const [v, setV] = useState("");
  const el = useRef<HTMLDivElement>(null);
  useSwap(el, q.key);
  const send = () => {
    if (!v.trim() || !q.box) return;
    q.box.go(v.trim());
    setV("");
  };
  return (
    <div ref={el} className="mt-2 flex items-start gap-3.5 rounded-md bg-canvas px-[max(1.375rem,14px)] py-[max(1rem,10px)]">
      <Image src="/aura-mark.png" alt="" width={32} height={32} className="mt-0.5 size-8 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <p className="text-body font-medium text-ink">
          {q.say}
          {more > 0 && <span className="ml-2 text-small font-normal text-ink-3">then {more} more</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {q.chips?.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={c.go}
              className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-small text-ink-2 transition-colors hover:border-brand hover:text-brand"
            >
              {c.label}
            </button>
          ))}
          {q.box && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex min-w-[max(14rem,180px)] flex-1 items-center gap-1 rounded-full bg-surface py-1 pl-3.5 pr-1 ring-1 ring-border focus-within:ring-2 focus-within:ring-brand/30"
            >
              <input
                value={v}
                onChange={(e) => setV(e.target.value)}
                aria-label={q.say}
                placeholder={q.box.hint}
                maxLength={120}
                className="min-w-0 flex-1 bg-transparent text-small text-ink outline-none placeholder:text-ink-3"
              />
              <button type="submit" disabled={!v.trim()} aria-label="Answer" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-40">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** Work locations: each city with how many people (− / +, 1 to 50), x to take one
 *  off, and a box to add another. None = Sri Lanka, city not set. */
function Places({ locs, onChange }: { locs: Loc[]; onChange: (l: Loc[]) => void }) {
  const [add, setAdd] = useState("");
  const put = (i: number, people: number) => onChange(locs.map((l, j) => (j === i ? { ...l, people: Math.min(50, Math.max(1, people)) } : l)));
  const plus = () => {
    const c = add.trim();
    if (!c) return;
    if (!locs.some((l) => l.city.toLowerCase() === c.toLowerCase())) onChange([...locs, { city: c, people: 1 }]);
    setAdd("");
  };
  const step = "flex size-6 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-30";
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {locs.map((l, i) => (
        <span key={l.city} className="flex items-center gap-1 rounded-full bg-surface py-1 pl-3 pr-1 text-small font-medium text-ink">
          {l.city}
          <span className="ml-1 flex items-center gap-0.5 text-ink-2">
            <button type="button" onClick={() => put(i, l.people - 1)} disabled={l.people <= 1} aria-label={`One fewer in ${l.city}`} className={step}>
              −
            </button>
            <span className="min-w-4 text-center" aria-label={`${l.people} in ${l.city}`}>
              {l.people}
            </span>
            <button type="button" onClick={() => put(i, l.people + 1)} disabled={l.people >= 50} aria-label={`One more in ${l.city}`} className={step}>
              +
            </button>
          </span>
          <button type="button" onClick={() => onChange(locs.filter((_, j) => j !== i))} aria-label={`Take ${l.city} off`} className={step}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="size-3" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </span>
      ))}
      {!locs.length && <span className="text-body font-medium text-ink-3">Sri Lanka — no city yet</span>}
      {locs.length < 50 && (
        <input
          value={add}
          list="cities"
          onChange={(e) => setAdd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              plus();
            }
          }}
          onBlur={plus}
          aria-label="Add a city"
          placeholder="+ Add a city"
          className="w-28 bg-transparent text-small text-ink outline-none placeholder:text-ink-3"
        />
      )}
      <datalist id="cities">
        {CITIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {locs.length > 1 && <span className="w-full text-caption text-ink-3">{locs.reduce((n, l) => n + l.people, 0)} people in all</span>}
    </div>
  );
}
