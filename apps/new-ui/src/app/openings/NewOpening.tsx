"use client";

import { SearchSteps, useSteps } from "../SearchSteps";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { DUR, EASE, gsap, motionOK, swapIn, useGSAP, useSwap, useTabGlide } from "@/lib/gsap";
import { useMe } from "@/lib/role";
import { useSpeech } from "@/lib/useSpeech";
import { door, useDoorAction } from "@/lib/backend";
import { useLiftMenu } from "./[id]/liftMenu";
import { CITIES, CLIENTS, EMPTY, TARGET_WORDS, TEAM, readBrief, type Loc, type Opening, type Priority, type Read } from "./data";

// New opening (owner's design, 14 Nov 2026): first the words - paste a JD, drop a
// file, record or type a brief - and "Read it"; then "Here's what I understood" with
// every field open to change, and Create. "Fill it in myself" goes straight to the
// fields. Old rules kept (openings skill §2): a client and a role are needed; a lead
// may put any TAs on it and none is allowed (Unassigned); a TA is put on it themself
// and a lead adds others; the JD is drafted after it is made.

// ponytail: the sample stand-in, long enough to show the reading steps.
const READ_MS = 2200;

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
  clients,
  team,
  lead,
}: {
  start: string;
  onClose: () => void;
  /** The opening as the list shows it, what was read from the brief, and the brief. */
  onCreate: (o: Opening, read: Read, brief: string) => void;
  /** Signed in (D9): the desk's real clients and TAs, and whether this person leads. */
  clients?: string[];
  team?: string[];
  lead?: boolean;
}) {
  const me = useMe();
  const ME = me.first;
  const LEAD = lead ?? me.lead;
  const CLIENT_LIST = clients ?? CLIENTS;
  const TEAM_LIST = team ?? TEAM;
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
  // Signed in (the sheet is handed the desk's real lists): Claude Haiku reads the
  // brief and every correction (ui/brief:read, D11 item 1). It only fills the fields;
  // Create still runs the old save. Signed out, the word rules in data.ts.
  const live = clients !== undefined;
  const ask = useDoorAction(door.briefRead);
  const [said, setSaid] = useState("");
  const [talking, setTalking] = useState(false);
  // AURA's chat on the sheet (owner 28 Nov 2026: "show the AURA logo on top; they click it and
  // chat under the whole options"): every reply and correction, kept for the sheet's life.
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<{ id: number; me?: string; aura?: string }[]>([]);
  const chatSeq = useRef(0);
  // Fields the sheet keeps aside until used or added (owner, 28 Nov 2026: the form adapts to the words).
  const [opt, setOpt] = useState<string[]>([]);
  const aura = (text: string) => setChat((c) => [...c, { id: ++chatSeq.current, aura: text }]);
  const askAura = async (extra: { current: BriefFields; said: string } | null) => {
    const res = (await (ask({ text, clients: CLIENT_LIST, team: TEAM_LIST, ...(extra ?? {}) }) as Promise<BriefReply | undefined>).catch(() => undefined)) ?? {
      ok: false as const,
      message: "AURA is not connected here.",
    };
    return res;
  };

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
    if (live) {
      void askAura(null).then((res) => {
        setReading(false);
        if (res.ok) {
          setR(withMe(fromFields(res.fields, { ...EMPTY, read: [] }, res.read)));
          setSaid(res.reply);
          aura(res.reply);
        } else {
          // The model could not answer: the word rules fill what they can, and say so.
          setR(withMe(readBrief(text, { clients: CLIENT_LIST, team: TEAM_LIST })));
          setSaid(`${res.message} I filled what I could - check every field.`);
          aura(`${res.message} I filled what I could - check every field.`);
        }
        setDone([]);
        setStep("check");
      });
      return;
    }
    // Signed out: a stand-in wait, then the word rules.
    timer.current = setTimeout(() => {
      setReading(false);
      const got = readBrief(text, { clients: CLIENT_LIST, team: TEAM_LIST });
      // Known = one of the desk's clients (the real list when signed in).
      setR(withMe({ ...got, clientKnown: CLIENT_LIST.some((c) => c.toLowerCase() === got.client.trim().toLowerCase()) }));
      setDone([]);
      setStep("check");
    }, READ_MS);
  };
  const showNice = !!r.nice.trim() || opt.includes("nice");
  const showSalary = !!r.salary.trim() || opt.includes("salary");
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
      referee: r.referee,
      website: r.website,
    }, r, text);
  };
  const set = (p: Partial<Read>) => setR((x) => ({ ...x, ...p }));
  // A correction in the person's own words, applied by AURA to the fields so far.
  const tell = (words: string) => {
    const w = words.trim();
    if (!w || talking) return;
    setChat((c) => [...c, { id: ++chatSeq.current, me: w }]);
    if (!live) return aura("Sign in and AURA changes the fields for you as you talk.");
    setTalking(true);
    void askAura({ current: toFields(r), said: w }).then((res) => {
      setTalking(false);
      if (!res.ok) {
        setSaid(res.message);
        return aura(res.message);
      }
      setR((x) => withMe(fromFields(res.fields, x, res.read)));
      setSaid(res.reply);
      aura(res.reply);
    });
  };

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
      chips: CLIENT_LIST.slice(0, 3).map((c) => ({ label: c, go: () => set({ client: c, clientKnown: true }) })),
      box: { hint: "Or type the client", go: (v) => set({ client: v, clientKnown: CLIENT_LIST.includes(v) }) },
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
        ...["Colombo", "Kandy", "Galle"].map((c) => ({ label: c, go: () => set({ locations: [{ city: c, people: r.headcount }] }) })),
        { label: "Not sure yet", go: () => skip("where") },
      ],
      box: { hint: "Another city", go: (v) => set({ locations: [{ city: v, people: r.headcount }] }) },
    });
  if (LEAD && !r.team.length && !done.includes("team"))
    asks.push({
      key: "team",
      say: "Who works on it?",
      chips: [
        ...TEAM_LIST.slice(0, 3).map((n) => ({ label: n, go: () => set({ team: [n] }) })),
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
          "relative max-h-[calc(100dvh-32px)] max-w-full rounded-xl bg-surface shadow-float transition-[width] duration-300 " +
          (step === "write"
            ? "w-[max(62.5rem,320px)] overflow-y-auto"
            : // The sheet widens as fields are added, so they still fit in one view.
              (r.extra.length + (showNice ? 1 : 0) + (showSalary ? 1 : 0) > 3 ? "w-[max(92rem,320px)]" : "w-[max(80rem,320px)]") + " flex flex-col overflow-hidden")
        }
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
          className={"absolute right-[max(2.5rem,14px)] z-10 flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink " + (step === "write" ? "top-[max(2.75rem,16px)]" : "top-[max(1.875rem,14px)]")}
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
              {reading && <BriefSteps />}
              <div className={"-mt-3 flex flex-wrap items-center gap-2 " + (reading ? "hidden" : text.trim() ? "invisible" : "")} aria-hidden={!!text.trim()}>
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
            // One glance (owner, 28 Nov 2026: "no need to scroll... the pop can expand if they add more"):
            // a fixed head, the fields in a compact grid that grows, AURA's chat docked at the foot at
            // the popup's own width, then Back / Create. Only a very long opening scrolls the fields.
            <div className="flex max-h-[calc(100dvh-32px)] flex-col">
              <div className="flex flex-wrap items-center gap-3.5 px-[max(2.75rem,16px)] pb-3 pr-[max(6rem,56px)] pt-[max(2rem,16px)]">
                <h2 id="new-opening-title" className="text-h3 font-medium text-ink">
                  {r.read.length ? "Here’s what I understood. Change anything." : "Tell me about the opening."}
                </h2>
                {/* AURA's mark at the top opens its chat, docked at the foot (owner, 28 Nov 2026). */}
                <button
                  type="button"
                  onClick={() => setChatOpen((v) => !v)}
                  aria-expanded={chatOpen}
                  title={chatOpen ? "Hide the chat" : "Change anything by telling AURA"}
                  className="ml-auto flex items-center gap-2.5 rounded-full bg-ink py-1.5 pl-1.5 pr-4 text-small font-medium text-white shadow-aura transition-colors hover:bg-marker"
                >
                  <AuraMark size="size-8" breathing={talking} />
                  {chatOpen ? "Hide chat" : "Chat with AURA"}
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-[max(2.75rem,16px)] pb-3 [scrollbar-width:thin]">
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-6">
                  <Field label="Role" ai={r.read.includes("role")} span="md:col-span-4">
                    <input value={r.role} onChange={(e) => set({ role: e.target.value })} aria-label="Role" placeholder="e.g. Finance Manager" className={INPUT} />
                  </Field>
                  <Field label="Client" ai={r.read.includes("client")} span="md:col-span-2">
                    <ClientPick value={r.client} clients={CLIENT_LIST} onChange={(client) => set({ client, clientKnown: CLIENT_LIST.includes(client) })} />
                    {r.client.trim() && (
                      <p className={"text-caption " + (r.clientKnown ? "text-success" : "text-ink-3")}>
                        {r.clientKnown ? "✓ One of your clients" : LEAD ? "New client - added with the opening" : "Not one of your clients - only a lead adds one"}
                      </p>
                    )}
                  </Field>
                  <Field label="Where · how many" ai={r.read.includes("where")} span="md:col-span-2">
                    <Places locs={r.locations} onChange={(locations) => set({ locations })} />
                  </Field>
                  <Field label="Priority" ai={r.read.includes("priority")} span="md:col-span-2">
                    <div role="radiogroup" aria-label="Priority" className="flex flex-wrap gap-1">
                      {([1, 2, 3, 4, 5] as Priority[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          role="radio"
                          aria-checked={r.priority === p}
                          title={TARGET_WORDS[p]}
                          onClick={() => set({ priority: p })}
                          className={
                            "flex min-w-[max(3rem,40px)] flex-col items-center rounded-sm px-1.5 py-1 transition-colors " +
                            (r.priority === p ? "bg-ink text-white" : "bg-surface text-ink hover:bg-surface-3")
                          }
                        >
                          <span className="text-small font-medium">P{p}</span>
                          <span className={"text-caption max-[1400px]:hidden " + (r.priority === p ? "text-white/80" : "text-ink-3")}>{TARGET_WORDS[p]}</span>
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Team" ai={r.read.includes("team")} span="md:col-span-2">
                    <Team team={r.team} all={TEAM_LIST} lead={LEAD} onChange={(team) => set({ team })} />
                  </Field>
                  <Field label="Must-haves" ai={r.read.includes("musts")} span="md:col-span-3">
                    <textarea
                      value={r.musts}
                      onChange={(e) => set({ musts: e.target.value })}
                      rows={1}
                      aria-label="Must-haves"
                      placeholder="e.g. 10+ years · led a rollout · CIMA"
                      className={INPUT + " resize-none [field-sizing:content]"}
                    />
                  </Field>
                  <Field label="Hiring for · Gender" span="md:col-span-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      <Choice label="Hiring" options={["Local", "Expat", "Any nationality"]} value={r.hiringFor} onChange={(hiringFor) => set({ hiringFor })} />
                      <Choice label="Gender" options={["Any", "Female", "Male"]} value={r.gender} onChange={(gender) => set({ gender })} />
                    </div>
                  </Field>
                  {showNice && (
                    <Field label="Nice-to-haves" ai={r.read.includes("nice")} span="md:col-span-3" onRemove={() => (set({ nice: "" }), setOpt((o) => o.filter((x) => x !== "nice")))}>
                      <textarea
                        autoFocus={opt.at(-1) === "nice" && !r.nice}
                        value={r.nice}
                        onChange={(e) => set({ nice: e.target.value })}
                        rows={1}
                        aria-label="Nice-to-haves"
                        placeholder="e.g. SAP · Tamil · Big 4 audit"
                        className={INPUT + " resize-none [field-sizing:content]"}
                      />
                    </Field>
                  )}
                  {showSalary && (
                    <Field label="Salary / package" ai={r.read.includes("salary")} span="md:col-span-3" onRemove={() => (set({ salary: "" }), setOpt((o) => o.filter((x) => x !== "salary")))}>
                      <input
                        autoFocus={opt.at(-1) === "salary" && !r.salary}
                        value={r.salary}
                        onChange={(e) => set({ salary: e.target.value })}
                        aria-label="Salary or package"
                        placeholder="e.g. LKR 300,000 – 400,000 + vehicle"
                        className={INPUT}
                      />
                    </Field>
                  )}
                  {/* The opening's own fields (owner, 28 Nov 2026: "not fixed; if they need they add a new
                      column"): AURA adds what the words state, anyone adds, renames, changes or takes one off. */}
                  {r.extra.map((e, i) => (
                    <ExtraField
                      key={i}
                      row={e}
                      ai={r.read.includes("extra")}
                      fresh={i === r.extra.length - 1 && !e.value}
                      onChange={(row) => set({ extra: r.extra.map((x, j) => (j === i ? row : x)) })}
                      onRemove={() => set({ extra: r.extra.filter((_, j) => j !== i) })}
                    />
                  ))}
                  <AddField
                    offer={[...(showNice ? [] : ["Nice-to-haves"]), ...(showSalary ? [] : ["Salary / package"])]}
                    taken={r.extra.map((e) => e.label.trim().toLowerCase())}
                    onAdd={(label) => {
                      if (label === "Nice-to-haves") return setOpt((o) => [...o, "nice"]);
                      if (label === "Salary / package") return setOpt((o) => [...o, "salary"]);
                      if (r.extra.length < 12) set({ extra: [...r.extra, { label, value: "" }] });
                    }}
                  />
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Switch on={r.autoFollowUp} onChange={(autoFollowUp) => set({ autoFollowUp })} label="Auto follow-up" title={r.autoFollowUp ? "AURA chases for CV, salary and notice" : "A TA sends each message"} />
                  <Switch on={r.referee} onChange={(referee) => set({ referee })} label="Referee opening" title={r.referee ? "Hire a referee for this role" : "Find candidates as usual"} />
                  {/* Old TA System: only a lead, Director or Ops lists a job on career141.com,
                      and only an open job with an approved JD shows there. */}
                  {LEAD && <Switch on={r.website} onChange={(website) => set({ website })} label="On career141.com" title="Listed once the JD is approved" />}
                </div>
                {(() => {
                  const q: Ask | undefined = asks[0];
                  if (!q) return null;
                  const typed = live && q.box ? { ...q, box: { ...q.box, go: (v: string) => tell(`${q.say} ${v}`) } } : q;
                  return <AuraAsks q={typed} more={Math.max(0, asks.length - 1)} />;
                })()}
              </div>

              {chatOpen && <AuraChat msgs={chat} busy={talking} onSend={tell} />}

              <div className="flex flex-wrap items-center gap-3 border-t border-border px-[max(2.75rem,16px)] py-3">
                <p className="mr-auto flex min-w-0 items-start gap-2 text-small text-ink-3">
                  {said && !chatOpen && (
                    <span aria-hidden="true" className="text-violet">
                      ✦
                    </span>
                  )}
                  {missing
                    ? `Add ${missing} to create it.`
                    : said && !chatOpen
                      ? talking
                        ? "AURA is reading…"
                        : said
                      : "AURA drafts the JD next — you approve it before it goes live."}
                </p>
                <button type="button" onClick={() => setStep("write")} className="h-[max(2.75rem,36px)] rounded-full border border-border-strong px-5 text-body font-medium text-ink hover:bg-surface-2">
                  Back
                </button>
                <button
                  type="button"
                  onClick={create}
                  disabled={!!missing}
                  className="h-[max(2.75rem,36px)] rounded-full bg-brand px-5 text-body font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
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

/** A field's box; ✦ when AURA filled it from the words; x takes an added field off. */
function Field({ label, ai = false, span = "", onRemove, children }: { label: string; ai?: boolean; span?: string; onRemove?: () => void; children: ReactNode }) {
  return (
    <div className={"group flex min-w-0 flex-col gap-1 rounded-md bg-canvas px-[max(1.125rem,12px)] py-[max(0.75rem,8px)] focus-within:ring-2 focus-within:ring-brand/30 " + span}>
      <p className="flex items-center gap-1.5 text-caption text-ink-3">
        {label}
        {ai && (
          <span className="text-violet" title="AURA read this from your words">
            ✦
          </span>
        )}
        {onRemove && <RemoveX label={label} onClick={onRemove} />}
      </p>
      {children}
    </div>
  );
}

const RemoveX = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={`Take ${label || "this field"} off`}
    title="Take this field off"
    className="ml-auto rounded-full p-0.5 text-ink-3 opacity-0 transition-opacity hover:bg-surface-2 hover:text-ink focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="size-3" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  </button>
);

/** One of the opening's own fields, in the same card as the rest: its name and its value both
 *  change in place; it pops in when added. */
function ExtraField({ row, ai, fresh, onChange, onRemove }: { row: { label: string; value: string }; ai: boolean; fresh: boolean; onChange: (r: { label: string; value: string }) => void; onRemove: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (el.current && motionOK()) gsap.from(el.current, { opacity: 0, scale: 0.94, duration: DUR.base, ease: "back.out(1.6)" });
  });
  return (
    <div ref={el} className="group flex min-w-0 flex-col gap-1 rounded-md bg-canvas px-[max(1.125rem,12px)] py-[max(0.75rem,8px)] focus-within:ring-2 focus-within:ring-brand/30 md:col-span-2">
      <p className="flex items-center gap-1.5 text-caption text-ink-3">
        <input
          autoFocus={fresh && !row.label}
          value={row.label}
          onChange={(e) => onChange({ ...row, label: e.target.value })}
          aria-label="Field name"
          placeholder="Field name"
          maxLength={40}
          className="min-w-0 flex-1 bg-transparent text-caption text-ink-3 outline-none placeholder:text-ink-3/60 focus:text-ink-2"
        />
        {ai && (
          <span className="text-violet" title="AURA read this from your words">
            ✦
          </span>
        )}
        <RemoveX label={row.label} onClick={onRemove} />
      </p>
      <textarea
        autoFocus={fresh && !!row.label}
        value={row.value}
        onChange={(e) => onChange({ ...row, value: e.target.value })}
        rows={1}
        aria-label={row.label || "Value"}
        placeholder="Add a value"
        maxLength={200}
        className={INPUT + " resize-none [field-sizing:content]"}
      />
    </div>
  );
}

const FIELD_IDEAS = ["Reports to", "Working days", "Languages", "Education", "Start date", "Benefits", "Travel", "Industry"];

/** + Add a field: the fields the sheet keeps aside, a few common ones, or one of your own. */
function AddField({ offer, taken, onAdd }: { offer: string[]; taken: string[]; onAdd: (label: string) => void }) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const ideas = FIELD_IDEAS.filter((f) => !taken.includes(f.toLowerCase()));
  const pick = (l: string) => {
    onAdd(l);
    setOpen(false);
  };
  return (
    <div ref={root} className="relative md:col-span-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-full min-h-[max(3.75rem,48px)] w-full items-center justify-center gap-2 rounded-md border border-dashed border-border-strong text-small font-medium text-ink-2 transition-colors hover:border-brand hover:bg-brand-tint hover:text-brand"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add a field
      </button>
      {shown && (
        <div ref={panel} role="menu" className="absolute bottom-full left-0 z-30 mb-2 flex max-h-80 w-64 flex-col overflow-y-auto rounded-md border border-border bg-surface p-1.5 shadow-float">
          {offer.map((l) => (
            <button key={l} type="button" role="menuitem" onClick={() => pick(l)} className="rounded-sm px-3 py-1.5 text-left text-small font-medium text-ink hover:bg-surface-2">
              {l}
            </button>
          ))}
          {offer.length > 0 && <span className="mx-2 my-1 h-px bg-border" aria-hidden="true" />}
          {ideas.map((l) => (
            <button key={l} type="button" role="menuitem" onClick={() => pick(l)} className="rounded-sm px-3 py-1.5 text-left text-small text-ink-2 hover:bg-surface-2 hover:text-ink">
              {l}
            </button>
          ))}
          <span className="mx-2 my-1 h-px bg-border" aria-hidden="true" />
          <button type="button" role="menuitem" onClick={() => pick("")} className="rounded-sm px-3 py-1.5 text-left text-small font-medium text-brand hover:bg-surface-2">
            Your own field…
          </button>
        </div>
      )}
    </div>
  );
}

/** A small on/off pill: the switch and its name; what it means in the tooltip. */
function Switch({ on, onChange, label, title }: { on: boolean; onChange: (v: boolean) => void; label: string; title: string }) {
  return (
    <label title={title} className="flex cursor-pointer items-center gap-2 rounded-full bg-canvas py-1.5 pl-1.5 pr-3.5 text-small text-ink">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={"relative h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 " + (on ? "bg-brand" : "bg-border-strong")}
      >
        <span className={"absolute top-0.5 size-4 rounded-full bg-white transition-[left] " + (on ? "left-[1.125rem]" : "left-0.5")} />
      </span>
      {label}
    </label>
  );
}

/** Two letters from a name: "Chathura Sampath" -> "CS", "Asma" -> "AS". */
const initialsOf = (n: string) => {
  const w = n.trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? "?").slice(0, 2)).toUpperCase();
};
const TONES = ["bg-brand-soft text-brand", "bg-info-soft text-info", "bg-violet-soft text-violet", "bg-warn-soft text-warn"];
const toneOf = (n: string) => TONES[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];

/** A person's round mark: their initials on their own soft colour. */
function Avatar({ name, size = "size-8" }: { name: string; size?: string }) {
  return (
    <span aria-hidden="true" className={"flex shrink-0 items-center justify-center rounded-full text-caption font-semibold ring-2 ring-surface " + size + " " + toneOf(name)}>
      {initialsOf(name)}
    </span>
  );
}

/** One TA on the opening; pops in when added (owner, 28 Nov 2026: "no animation after assigning"). */
function Member({ name, onRemove }: { name: string; onRemove?: () => void }) {
  const el = useRef<HTMLSpanElement>(null);
  useGSAP(() => {
    if (!el.current || !motionOK()) return;
    gsap.from(el.current, { scale: 0.6, opacity: 0, duration: DUR.base, ease: "back.out(2)" });
  });
  return (
    <span ref={el} className="flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-2 text-small font-medium text-ink shadow-card">
      <Avatar name={name} />
      {name}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Take ${name} off`} className="rounded-full p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="size-3" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </span>
  );
}

const PersonIcon = ({ className = "size-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

/** Who works it: each TA as a round mark that pops in, x to take one off, and + to add.
 *  A TA is on their own opening and only a lead adds others. */
function Team({ team, all, lead: LEAD, onChange }: { team: string[]; all: string[]; lead: boolean; onChange: (t: string[]) => void }) {
  const { first: ME } = useMe();
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const left = all.filter((n) => !team.includes(n));
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {!team.length && (
        <span className="flex items-center gap-2.5 text-small text-ink-3">
          <span className="flex size-8 items-center justify-center rounded-full border border-dashed border-border-strong text-ink-3">
            <PersonIcon />
          </span>
          {LEAD ? "Nobody yet — it goes to Unassigned" : "Only you"}
        </span>
      )}
      {team.map((n) => (
        <Member key={n} name={n} onRemove={LEAD || n !== ME ? () => onChange(team.filter((x) => x !== n)) : undefined} />
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
              className="flex h-9 items-center gap-1.5 rounded-full border border-border-strong bg-surface pl-2.5 pr-3.5 text-small font-medium text-ink-2 transition-colors hover:border-brand hover:text-brand"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add
            </button>
            {shown && (
              <div ref={panel} role="menu" className="absolute left-0 top-full z-30 mt-2 flex max-h-72 min-w-56 flex-col overflow-y-auto rounded-md border border-border bg-surface p-1.5 shadow-float">
                <p className="px-3 pb-1 pt-1.5 text-caption text-ink-3">Put a TA on it</p>
                {left.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onChange([...team, n]);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-small text-ink hover:bg-surface-2"
                  >
                    <Avatar name={n} size="size-7" />
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
    </div>
  );
}

/** The client: type to narrow the desk's clients in a lifted list; a name not on it is a new client. */
function ClientPick({ value, clients, onChange }: { value: string; clients: string[]; onChange: (c: string) => void }) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const q = value.trim().toLowerCase();
  const hits = (q ? clients.filter((c) => c.toLowerCase().includes(q)) : clients).slice(0, 8);
  return (
    <div ref={root} className="relative">
      <div className="flex items-center gap-2.5">
        {value.trim() ? <Avatar name={value} size="size-7" /> : null}
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          role="combobox"
          aria-expanded={open}
          aria-controls="client-list"
          aria-label="Client"
          placeholder="Choose or type a client"
          className={INPUT}
        />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={"size-4 shrink-0 text-ink-3 transition-transform " + (open ? "rotate-180" : "")} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      {shown && hits.length > 0 && (
        <div ref={panel} id="client-list" role="listbox" className="absolute inset-x-0 top-full z-30 mt-2 flex max-h-72 flex-col overflow-y-auto rounded-md border border-border bg-surface p-1.5 shadow-float">
          {hits.map((c) => (
            <button
              key={c}
              type="button"
              role="option"
              aria-selected={c === value}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={"flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-small hover:bg-surface-2 " + (c === value ? "font-medium text-brand" : "text-ink")}
            >
              <Avatar name={c} size="size-7" />
              <span className="min-w-0 flex-1 truncate">{c}</span>
              {c === value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A small row of choices with a pill that glides to the chosen one. */
function Choice({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  const row = useRef<HTMLDivElement>(null);
  useTabGlide(row, value);
  return (
    <div className="flex items-center gap-3">
      <span className="w-[max(5.5rem,72px)] shrink-0 text-caption text-ink-3">{label}</span>
      <div ref={row} role="tablist" aria-label={label} className="relative flex flex-nowrap gap-1 rounded-full bg-surface p-1">
        <span data-tab-glide aria-hidden="true" className="absolute left-0 top-0 rounded-full bg-ink opacity-0" />
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="tab"
            aria-selected={o === value}
            onClick={() => onChange(o)}
            className={"relative z-[1] whitespace-nowrap rounded-full px-3 py-1 text-small font-medium transition-colors " + (o === value ? "text-white" : "text-ink-2 hover:text-ink")}
          >
            {o === "Any nationality" ? "Any" : o}
          </button>
        ))}
      </div>
    </div>
  );
}

const CHAT_TRY = ["Make it P1", "Salary is LKR 250k – 300k", "Add a field: Reports to the CFO", "Nice to have: Tamil", "Take off the Travel field"];

/** AURA's chat, docked at the popup's foot at its own width (owner, 28 Nov 2026): what it read
 *  and changed, and a box to tell it anything - change, add or take off any field. */
function AuraChat({ msgs, busy, onSend }: { msgs: { id: number; me?: string; aura?: string }[]; busy: boolean; onSend: (t: string) => void }) {
  const [v, setV] = useState("");
  const el = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useGSAP(() => {
    input.current?.focus();
    if (el.current && motionOK()) gsap.from(el.current, { opacity: 0, y: 16, duration: DUR.base, ease: EASE.out });
  });
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length, busy]);
  const send = (t: string) => {
    if (!t.trim() || busy) return;
    onSend(t);
    setV("");
  };
  return (
    <div ref={el} className="flex shrink-0 flex-col gap-2.5 border-t border-border bg-brand-tint/60 px-[max(2.75rem,16px)] py-3">
      <div ref={list} className="flex max-h-[min(30dvh,max(14rem,140px))] flex-col gap-2.5 overflow-y-auto [scrollbar-width:thin]">
        {!msgs.length && <p className="text-small text-ink-3">Tell AURA anything — change a field, add a new one, or take one off. The fields above update as you talk.</p>}
        {msgs.map((m) =>
          m.me ? (
            <p key={m.id} className="max-w-[80%] self-end rounded-md rounded-br-xs bg-surface px-3.5 py-2 text-small text-ink shadow-card">
              {m.me}
            </p>
          ) : (
            <div key={m.id} className="flex items-start gap-2.5">
              <AuraMark size="size-7" />
              <p className="pt-1 text-small text-ink-2">{m.aura}</p>
            </div>
          ),
        )}
        {busy && (
          <div className="flex items-center gap-2.5" role="status">
            <AuraMark size="size-7" breathing />
            <p className="text-small text-ink-3">AURA is updating the fields…</p>
          </div>
        )}
      </div>
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {CHAT_TRY.map((t) => (
          <button key={t} type="button" onClick={() => send(t)} disabled={busy} className="shrink-0 whitespace-nowrap rounded-full border border-border bg-surface px-3 py-1 text-small text-ink-2 transition-colors hover:border-brand hover:text-brand disabled:opacity-40">
            {t}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(v);
        }}
        className="flex items-center gap-2 rounded-full bg-surface py-1.5 pl-1.5 pr-1.5 shadow-float ring-1 ring-border focus-within:ring-2 focus-within:ring-brand/30"
      >
        <AuraMark size="size-8" />
        <input ref={input} value={v} onChange={(e) => setV(e.target.value)} aria-label="Tell AURA" placeholder="e.g. the client is Hayleys, make it P2, add a field for working days" maxLength={500} className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3" />
        <button type="submit" disabled={!v.trim() || busy} aria-label="Send" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-opacity disabled:opacity-40">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
            <path d="M12 19V5m0 0-6 6m6-6 6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}

/** AURA's mark; breathing while it reads. */
function AuraMark({ breathing = false, size = "size-10" }: { breathing?: boolean; size?: string }) {
  const glow = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      if (!breathing || !glow.current || !motionOK()) return;
      gsap.to(glow.current, { scale: 1.35, opacity: 0.15, duration: 0.9, ease: "sine.inOut", repeat: -1, yoyo: true });
    },
    { dependencies: [breathing] },
  );
  return (
    <span className={"relative flex shrink-0 " + size}>
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

/** "Record a brief": the browser's own speech, put into the box as text. It listens until
 *  the person presses stop (26 Nov 2026, owner: a brief cut off in the middle - this used
 *  its own one-phrase recorder that ended at the first pause and was rebuilt on every
 *  render; now the shared useSpeech, as the other chat boxes). */
function Speak({ onText }: { onText: (t: string) => void }) {
  const { ok, on, toggle } = useSpeech(onText);
  return (
    <button
      type="button"
      disabled={!ok}
      aria-pressed={on}
      title={ok ? (on ? "Stop" : "Record a brief") : "Recording is not available in this browser"}
      onClick={toggle}
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

/** ui/brief:read's fields (convex/ui/briefRules.ts BriefFields). */
type BriefFields = {
  role: string; client: string; clientKnown: boolean; locations: Loc[]; priority: number | null;
  team: string[]; musts: string; hiringFor: "Local" | "Expat"; gender: "Any" | "Female" | "Male";
  nice?: string; salary?: string; extra?: { label: string; value: string }[];
};
type BriefReply = { ok: true; fields: BriefFields; read: string[]; reply: string } | { ok: false; message: string };

const toFields = (x: Read): BriefFields => ({
  role: x.role, client: x.client, clientKnown: x.clientKnown, locations: x.locations, priority: x.priority, team: x.team, musts: x.musts,
  hiringFor: x.hiringFor === "Expat" ? "Expat" : "Local", gender: x.gender === "Female" || x.gender === "Male" ? x.gender : "Any",
  nice: x.nice, salary: x.salary, extra: x.extra.filter((e) => e.label.trim() && e.value.trim()),
});
/** AURA's fields laid over the sheet's; switches the brief does not hold are kept. */
const fromFields = (f: BriefFields, x: Read, read: string[]): Read => ({
  ...x,
  role: f.role, client: f.client, clientKnown: f.clientKnown, locations: f.locations,
  priority: f.priority && f.priority >= 1 && f.priority <= 5 ? (f.priority as Priority) : x.priority,
  team: f.team, musts: f.musts, hiringFor: f.hiringFor, gender: f.gender,
  nice: f.nice ?? x.nice, salary: f.salary ?? x.salary, extra: f.extra ?? x.extra,
  read: [...new Set([...x.read, ...read])],
});

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

/** What AURA does while it reads the brief, as one line of steps (20 Nov 2026). */
const BRIEF_STEPS = ["Reading the brief", "Matching the client to your list", "Role, places, years and salary", "Filling the sheet"];
function BriefSteps() {
  const at = useSteps(true, BRIEF_STEPS.length - 1, 650);
  return <SearchSteps compact className="-mt-3" at={at} steps={BRIEF_STEPS.map((label) => ({ label }))} />;
}
