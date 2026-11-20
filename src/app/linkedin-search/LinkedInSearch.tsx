"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DUR, EASE, gsap, motionOK, popPanel, useSwap } from "@/lib/gsap";
import type { Found, SearchResult } from "@/lib/linkedinSearch";
import type { Profile } from "@/lib/linkedinProfile";
import { Glow } from "../AuraBarGlow";
import { SearchSteps, useSteps } from "../SearchSteps";
import { LinkedInIcon } from "../openings/[id]/PipelineBoard";
import { EMPTY, chipsOf, isEmpty, readAsk, type Ask } from "./read";
import { useSignedHeaders } from "@/lib/backend";

// LinkedIn Search as a chat with AURA, in the owner's five Figma frames (19 Nov 2026,
// "LinkedIn Job" in the design; the page keeps its name): 1 the welcome prompt, 2 AURA
// searching, 3 the people as rows, 4 a profile opened beside them (Space), 5 the chat.
// The TA says who they need; the search reads one page of 25, opens the 10 most likely
// and shows them best first with what matched. A follow-up ("only Colombo") changes the
// last search. Nothing is saved to the backend.

const TRY = [
  "Software engineers at WSO2 in Colombo with 5 years experience",
  "HR managers in Kandy",
  "Java developers with Spring and React",
  "Finance directors at Hemas",
];
const NEXT = ["Now 6+ years", "Only Colombo", "New search"];
const STEPS = ["Read your request", "Wrote the search plan", "Added the filters", "Scanning LinkedIn", "Ranking the closest people"];

type View = { ask: Ask; result: SearchResult; said: string };
type Msg = { me?: string; aura?: string; sub?: string; options?: boolean };
type Toast = { text: string; undo?: boolean; n: number };

const title = (a: Ask) => [a.titles.join(" / "), a.companies.length ? `at ${a.companies.join(" / ")}` : "", a.keywords.length ? `with ${a.keywords.join(", ")}` : "", a.locations.length ? `in ${a.locations.join(" / ")}` : ""].filter(Boolean).join(" ") || "People on LinkedIn";
/** The last three roles with their years ("2023 – Now"), from the profile the search opened. */
const career = (p: Found) =>
  p.profile?.experience.length
    ? p.profile.experience.slice(0, 3).map((e) => {
        const y = e.period.match(/\d{4}/g) ?? [];
        return { period: y.length ? `${y[0]} – ${e.current || y.length < 2 ? "Now" : y[1]}` : "Now", title: e.title || "Role not shown", company: e.company };
      })
    : [{ period: "Now", title: p.now || p.headline, company: "" }];
const initials = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const TINTS = ["bg-info-soft text-info", "bg-violet-soft text-violet", "bg-warn-soft text-warn", "bg-success-soft text-success"];
const GRAD =
  "border-[1.5px] border-transparent bg-[linear-gradient(white,white),linear-gradient(90deg,var(--color-aura-1),var(--color-aura-2),var(--color-aura-3),var(--color-aura-4))] [background-clip:padding-box,border-box] [background-origin:border-box]";
const CHIP = "rounded-full border border-border bg-surface px-4 py-2 text-small text-ink hover:border-border-strong hover:bg-surface-2";
const keyHint = "rounded-xs bg-white/15 px-1.5 py-0.5 text-caption font-medium text-white";

export default function LinkedInSearch() {
  const signed = useSignedHeaders();
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [prev, setPrev] = useState<View | null>(null);
  const [thread, setThread] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<Ask | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [chat, setChat] = useState(false);
  const [filters, setFilters] = useState(false);
  const [recent, setRecent] = useState<{ label: string; n: number }[]>([]);
  const [gone, setGone] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [pickedKey, setPickedKey] = useState("");
  const [panel, setPanel] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, Profile | string>>({});
  const stop = useRef<AbortController | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLFormElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const panelEl = useRef<HTMLElement>(null);
  const progress = useRef<HTMLSpanElement>(null);

  // A change asked of a search that is showing keeps the people on screen; the talk happens in the chat.
  const stage = view ? "results" : busy ? "searching" : "welcome";
  useSwap(body, stage);
  // The next candidate's profile fades up inside the open panel.
  const card = useRef<HTMLDivElement>(null);
  useSwap(card, pickedKey);

  const key = (p: Found) => p.url || p.name;
  const rows = (view?.result.checked ?? []).filter((p) => !gone.includes(key(p)));
  const picked = rows.find((p) => key(p) === pickedKey) ?? rows[0];
  const idx = picked ? rows.indexOf(picked) : -1;
  const say = (t: string, undo = false) => setToast({ text: t, undo, n: Date.now() });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  // The steps AURA shows while it searches. The real search is one call, so the first
  // three tick over by themselves and the bar creeps along; "Ranking" waits for the answer.
  const step = useSteps(!!busy, 3, 750);
  useEffect(() => {
    const el = progress.current;
    if (step !== 3 || !el) return;
    const tw = gsap.fromTo(el, { width: "2%" }, { width: "92%", duration: motionOK() ? 60 : 0.2, ease: "power1.out" });
    // The colours slide along the bar so it reads as working, not stuck.
    const sh = motionOK() ? gsap.fromTo(el, { backgroundPositionX: "0%" }, { backgroundPositionX: "100%", duration: 1.6, ease: "none", repeat: -1 }) : null;
    return () => {
      tw.kill();
      sh?.kill();
    };
  }, [step]);

  // The rows, ticks and breathing are SearchSteps'; the filter chips pop in here.
  const steps = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ol = steps.current;
    if (!ol || !filters || !motionOK()) return;
    const tw = gsap.fromTo(ol.querySelectorAll("[data-chip]"), { opacity: 0, y: 8, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "back.out(1.8)", stagger: 0.04, clearProps: "transform,opacity" });
    return () => void tw.kill();
  }, [filters]);

  async function send(raw: string) {
    const said = raw.trim();
    if (!said || busy) return;
    setText("");
    setError("");
    if (/^(?:new search|start over|clear)$/i.test(said)) return reset();
    const refine = !!view;
    const next = readAsk(said, view?.ask ?? EMPTY);
    if (isEmpty(next)) {
      const warn = "Tell me a job title, a company, a place or a skill - for example “Java developers in Colombo with 5 years”.";
      return view ? say(warn) : setError(warn);
    }
    const ctl = new AbortController();
    stop.current = ctl;
    setBusy(next);
    setThread((m) => [...m, { me: said }]);
    if (refine) setChat(true);
    try {
      const res = await fetch("/api/linkedin-search", { method: "POST", headers: { "Content-Type": "application/json", ...(await signed()) }, body: JSON.stringify(next), signal: ctl.signal });
      const data = await res.json().catch(() => {
        throw new Error("LinkedIn search needs the server. It runs on a local copy with APIFY_TOKEN set, or on the dev link once the key is set in Cloudflare.");
      });
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      const result = data as SearchResult;
      const n = result.checked.length + result.others.length;
      setPrev(view);
      setView({ ask: next, result, said });
      setGone([]);
      setPickedKey("");
      setPanel(false);
      setThread((m) => [
        ...m,
        n ? { aura: `${n} people. The closest are first.`, sub: `I read ${n} and opened ${result.opened}.`, options: true } : { aura: "LinkedIn found nobody for this.", sub: "Try fewer words, or a wider place.", options: true },
      ]);
      if (n) setRecent((r) => [{ label: title(next), n }, ...r.filter((x) => x.label !== title(next))].slice(0, 3));
      if (refine) say(`Done. ${n} people now.`, true);
    } catch (e) {
      setThread((m) => (refine ? m.slice(0, -1) : []));
      if ((e as Error).name === "AbortError") return;
      const msg = e instanceof Error ? e.message : "Search failed";
      return refine ? say(msg) : setError(msg);
    } finally {
      setBusy(null);
    }
  }
  const reset = () => {
    stop.current?.abort();
    setView(null);
    setPrev(null);
    setThread([]);
    setGone([]);
    setPanel(false);
    setChat(false);
    setToast(null);
  };
  const undo = () => {
    setView(prev);
    setPrev(null);
    setToast(null);
    setThread((m) => m.slice(0, -2));
  };

  const save = (p: Found) => {
    if (saved.includes(key(p))) return;
    setSaved((s) => [...s, key(p)]);
    say(`${p.name} saved to this search's shortlist.`);
  };
  const notFit = (p: Found) => {
    const i = rows.indexOf(p);
    setPickedKey(key(rows[i + 1] ?? rows[i - 1] ?? p));
    setGone((g) => [...g, key(p)]);
    say(`${p.name} taken off.`);
  };
  // The profile is read live from its link ($0.004) the first time it is opened.
  const open = async (p: Found) => {
    setPickedKey(key(p));
    setPanel(true);
    const k = key(p);
    if (p.profile || profiles[k] || !p.url) return;
    setProfiles((x) => ({ ...x, [k]: "" }));
    try {
      const res = await fetch("/api/linkedin-profile", { method: "POST", headers: { "Content-Type": "application/json", ...(await signed()) }, body: JSON.stringify({ url: p.url }) });
      const data = await res.json().catch(() => {
        throw new Error("Reading a profile needs the server (APIFY_TOKEN).");
      });
      if (!res.ok) throw new Error(data.error ?? "Could not read the profile");
      setProfiles((x) => ({ ...x, [k]: data as Profile }));
    } catch (e) {
      setProfiles((x) => ({ ...x, [k]: e instanceof Error ? e.message : "Could not read the profile" }));
    }
  };
  const step_ = (d: number) => {
    const n = rows[idx + d];
    if (n) void open(n);
  };

  // Up and down move, S saves, X takes off, Space opens the profile, Esc closes things.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!root.current?.offsetParent || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [role=menu]")) return;
      const k = e.key.toLowerCase();
      if (k === "escape" && (panel || chat)) {
        e.preventDefault();
        setPanel(false);
        setChat(false);
      }
      if (stage !== "results" || !picked) return;
      if (k === "arrowdown" || k === "arrowup") {
        const n = rows[idx + (k === "arrowdown" ? 1 : -1)];
        if (!n) return;
        e.preventDefault();
        if (panel) void open(n);
        else setPickedKey(key(n));
        root.current.querySelector(`[data-row="${CSS.escape(key(n))}"]`)?.scrollIntoView({ block: "nearest" });
      } else if (k === "s") save(picked);
      else if (k === "x") notFit(picked);
      else if (k === " " && !t.closest("button, a")) {
        e.preventDefault();
        if (panel) setPanel(false);
        else void open(picked);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // save, notFit and open are rebuilt every render and read the same state as these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, picked, panel, chat, rows.length, saved, profiles]);

  // The profile slides in from the right over the list; the chat rises over the bar.
  useLayoutEffect(() => {
    const el = panelEl.current;
    if (!panel || !el) return;
    popPanel(el);
  }, [panel]);
  useLayoutEffect(() => {
    const el = bubble.current;
    if (!chat || !el) return;
    gsap.fromTo(el, { opacity: 0, y: 18, scale: 0.97, transformOrigin: "50% 100%" }, { opacity: 1, y: 0, scale: 1, duration: DUR.base, ease: EASE.pop, clearProps: "transform,opacity,transformOrigin" });
    el.scrollTo({ top: el.scrollHeight });
  }, [chat]);

  const profile = picked ? (picked.profile ?? profiles[key(picked)]) : undefined;
  const refined = view && thread.length > 2 ? view.said.replace(/^(?:only|also|and|now|but)\s+/i, "") : "";

  // The AURA bar (frames 3-5): ask for a change in words; the chat button opens the talk.
  const auraBar = (placeholder: string) => (
    <form
      ref={bar}
      onSubmit={(e) => {
        e.preventDefault();
        void send(text);
      }}
      className={"relative flex h-[3.75rem] w-[min(40rem,100%)] items-center gap-3 rounded-full py-2 pl-2.5 pr-2 shadow-float " + GRAD}
    >
      <Image src="/aura-mark.png" alt="" width={40} height={40} className="size-10 shrink-0 rounded-full bg-black" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label="Tell AURA what to change"
        className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
      />
      <button
        type="button"
        onClick={() => setChat((v) => !v)}
        aria-label="Chat with AURA"
        aria-expanded={chat}
        className={"flex size-9 shrink-0 items-center justify-center rounded-full " + (chat ? "bg-ink text-white" : "bg-surface-2 text-ink-2 hover:bg-surface-3")}
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.33" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z" />
        </svg>
      </button>
      <button type="button" disabled title="Speaking to AURA is not switched on yet" aria-label="Speak" className="flex size-5 shrink-0 items-center justify-center text-ink-2 opacity-60">
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <rect x="7.5" y="2.5" width="5" height="10" rx="2.5" />
          <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
        </svg>
      </button>
      <button disabled={!text.trim() || !!busy} aria-label="Send" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-white hover:bg-ink/85 disabled:opacity-40">
        <svg viewBox="0 0 18 18" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 15V3M3.8 8.2 9 3l5.2 5.2" />
        </svg>
      </button>
    </form>
  );

  return (
    <div ref={root} className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden px-[max(1.5rem,14px)] pb-[max(1.25rem,12px)] pt-[max(1.4rem,14px)] max-md:pt-11">
      {/* The aurora glow of each frame (1515:1725, 1515:1781, 1515:1888): the owner's own SVG,
          the node's box in rem at 1920, centred on the board, the soft edge spilling past it. */}
      {stage === "welcome" && <Glow src="/aurora-start.svg" inset="-31.82% -14.29%" className="top-1/2 h-[27.5rem] w-[61.25rem] -translate-y-[calc(50%-4rem)]" />}
      {stage === "searching" && <Glow src="/aurora-searching.svg" inset="-63.64% -17.07%" className="bottom-[-1.8rem] h-[13.75rem] w-[51.25rem]" />}
      {stage === "results" && <Glow src="/aurora-results.svg" inset="-54.55% -14.63%" className="bottom-[-0.8rem] h-[13.75rem] w-[51.25rem]" />}
      <button
        type="button"
        onClick={() => (view || busy ? reset() : router.back())}
        aria-label={view || busy ? "New search" : "Back"}
        title={view || busy ? "New search" : "Back"}
        className="relative z-10 flex size-[max(2.4rem,32px)] shrink-0 items-center justify-center rounded-full border-[1.5px] border-brand text-brand hover:bg-brand-tint"
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m10 3-5 5 5 5" />
        </svg>
      </button>

      <div ref={body} className="relative -mt-[max(2.4rem,32px)] flex min-h-0 flex-1 flex-col">
        {stage === "welcome" && (
          <div className="mx-auto flex w-full max-w-[56rem] flex-1 flex-col items-center justify-center gap-[max(1rem,10px)] pb-[6%] text-center">
            <Image src="/aura-mark.png" alt="AURA" width={56} height={56} className="size-14 rounded-full bg-black" />
            <h1 className="mt-4 text-display font-light text-ink max-md:text-h1">Who do you need on LinkedIn?</h1>
            <p className="text-[max(1.125rem,14px)] text-ink-2">Say it like you would to a colleague. AURA builds the search, adds the filters and ranks the people.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(text);
              }}
              className={"mt-6 flex w-full flex-col gap-4 rounded-[1.75rem] bg-white p-[1.625rem] pb-4 text-left shadow-float " + GRAD}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
                autoFocus
                rows={2}
                maxLength={500}
                placeholder="Type or speak — Senior Java engineers in Colombo, 8+ years…"
                aria-label="Ask AURA to search LinkedIn"
                className="w-full resize-none bg-transparent text-[max(1.125rem,14px)] text-ink outline-none placeholder:text-ink-3"
              />
              <div className="flex items-center justify-end gap-3">
                <button type="button" disabled title="Speaking to AURA is not switched on yet" aria-label="Speak" className="text-ink-2 opacity-60">
                  <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <rect x="7.5" y="2.5" width="5" height="10" rx="2.5" />
                    <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
                  </svg>
                </button>
                <button disabled={!text.trim()} aria-label="Search" className="flex size-11 items-center justify-center rounded-full bg-ink text-white hover:bg-ink/85 disabled:opacity-40">
                  <svg viewBox="0 0 18 18" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 15V3M3.8 8.2 9 3l5.2 5.2" />
                  </svg>
                </button>
              </div>
            </form>
            {error && <p role="alert" className="w-full rounded-sm bg-danger-soft px-4 py-3 text-left text-small text-danger">{error}</p>}
            <div className="flex flex-wrap justify-center gap-3">
              {TRY.map((t) => (
                <button key={t} type="button" onClick={() => void send(t)} className={CHIP}>
                  {t}
                </button>
              ))}
            </div>
            {recent.length > 0 && (
              <p className="mt-10 flex flex-wrap items-baseline justify-center gap-x-6 gap-y-1 text-small text-ink-3">
                <span>Recent</span>
                {recent.map((r) => (
                  <button key={r.label} type="button" onClick={() => void send(r.label)} className="hover:text-ink">
                    <span className="mr-2 text-body text-ink">{r.n}</span>
                    {r.label}
                  </button>
                ))}
              </p>
            )}
          </div>
        )}

        {stage === "searching" && busy && (
          <div className="mx-auto flex w-full max-w-[56rem] flex-1 flex-col gap-6 pt-1">
            <div className="max-w-none self-start pl-[max(3.5rem,44px)] max-md:pl-14">
              <h1 className="text-[max(2rem,20px)] font-light text-ink">{title(busy)}</h1>
              <p className="text-small text-ink-2">AURA is searching LinkedIn now</p>
            </div>
            <div ref={steps} className="mt-4">
              <SearchSteps
                at={step}
                steps={STEPS.map((label, i) => ({
                  label,
                  detail:
                    i === 2 ? (
                      <button type="button" onClick={() => setFilters((v) => !v)} className="font-medium text-brand hover:underline">
                        {filters ? "Hide them" : "See them"}
                      </button>
                    ) : (
                      [chipsOf(busy).slice(0, 2).join(" · "), `${chipsOf(busy).length} things I read`, "", "reading 25 people", ""][i] || undefined
                    ),
                  extra:
                    i === 2 && filters ? (
                      <div className="flex flex-wrap gap-1.5 pl-10">
                        {chipsOf(busy).map((c) => (
                          <span key={c} data-chip className="rounded-full bg-violet-soft px-2.5 py-0.5 text-caption text-violet">{c}</span>
                        ))}
                      </div>
                    ) : i === 3 && i === step ? (
                      <span className="ml-10 block h-1 overflow-hidden rounded-full bg-surface-3">
                        <span ref={progress} className="block h-full w-[2%] rounded-full bg-[length:300%_100%] bg-[linear-gradient(90deg,var(--color-aura-1),var(--color-aura-2),var(--color-aura-3),var(--color-aura-4))]" />
                      </span>
                    ) : undefined,
                }))}
              />
            </div>
            <p className="pl-10 text-small text-ink-3">About a minute. The people appear here as soon as LinkedIn answers.</p>
            <div className="mt-auto flex shrink-0 flex-wrap items-center justify-center gap-5 pt-3">
              <div className="flex h-[3.75rem] w-[min(40rem,100%)] items-center gap-3 rounded-full py-2 pl-2.5 pr-2 shadow-float opacity-80 [background:white] ring-1 ring-border">
                <Image src="/aura-mark.png" alt="" width={40} height={40} className="size-10 shrink-0 rounded-full bg-black" />
                <p className="min-w-0 flex-1 truncate text-body text-ink-3">AURA is searching — I will show the people when it is done</p>
              </div>
              <button
                type="button"
                onClick={() => stop.current?.abort()}
                className="flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-small font-medium text-white hover:bg-ink/85"
              >
                <span aria-hidden="true" className="size-2.5 rounded-xs bg-white" />
                Stop search
              </button>
            </div>
          </div>
        )}

        {stage === "results" && view && (
          <>
            <div className="flex shrink-0 items-start gap-4 pl-[max(3.5rem,44px)]">
              <div className="min-w-0 flex-1">
                <h1 className="text-[max(2rem,20px)] font-light leading-tight text-ink">
                  {title(view.ask)}
                  {refined && <span className="text-violet">, {refined}</span>}
                </h1>
                <p className="text-small text-ink-2">
                  {view.result.checked.length + view.result.others.length} people on LinkedIn · closest first
                  <span className="text-ink-3"> · about ${view.result.cost.toFixed(2)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFilters((v) => !v)}
                aria-expanded={filters}
                className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-small font-medium text-ink hover:border-border-strong aria-expanded:bg-surface-2"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-3.5" aria-hidden="true">
                  <path d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                Filters
              </button>
            </div>
            {filters && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-[max(3.5rem,44px)]">
                <span className="text-small text-ink-2">What I searched for</span>
                {chipsOf(view.ask).map((c) => (
                  <span key={c} data-chip className="rounded-full bg-violet-soft px-2.5 py-0.5 text-caption text-violet">{c}</span>
                ))}
                <span className="text-caption text-ink-3">Say “only …” or “now …” to change them.</span>
              </div>
            )}
            {view.result.note && <p className="mt-3 rounded-sm bg-warn-soft px-4 py-3 text-small text-warn">{view.result.note}</p>}

            <div className="relative mt-[max(1.2rem,12px)] flex min-h-0 flex-1">
              <ul aria-label="People" className="flex min-w-0 flex-1 flex-col overflow-y-auto pb-24">
                {rows.length === 0 && <li className="rounded-md bg-surface-2 p-4 text-small text-ink-2">{view.result.checked.length ? "Everyone is taken off. Press Undo or start a new search." : "LinkedIn found nobody for this. Try fewer words, or a wider place."}</li>}
                {rows.map((p, n) => {
                  const on = picked && key(p) === key(picked);
                  const isSaved = saved.includes(key(p));
                  return (
                    <li key={key(p)} className="group relative border-b border-border last:border-0">
                      <button
                        type="button"
                        data-row={key(p)}
                        onClick={() => void open(p)}
                        aria-current={on ? "true" : undefined}
                        className={
                          "grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,0.3fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-[max(1rem,10px)] rounded-md py-4 pl-7 pr-[max(11rem,120px)] text-left transition-colors max-xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] max-xl:[&>:nth-child(2)]:hidden max-xl:[&>:nth-child(4)]:hidden max-md:grid-cols-1 " +
                          (on ? "bg-canvas" : "hover:bg-canvas/60")
                        }
                      >
                        <span className="flex min-w-0 items-center gap-4">
                          <span className={"flex size-[max(3.25rem,40px)] shrink-0 items-center justify-center rounded-full text-small font-medium " + TINTS[n % TINTS.length]}>{initials(p.name)}</span>
                          <span className="flex min-w-0 flex-col">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-h3 font-medium text-ink">{p.name}</span>
                              <LinkedInIcon className="size-4" />
                            </span>
                            <span className="truncate text-small text-ink-3">{[p.years !== undefined ? `${p.years} years` : "", p.place].filter(Boolean).join(" · ")}</span>
                          </span>
                        </span>
                        <span className="flex flex-col gap-1.5 text-small max-md:hidden">
                          {career(p).map((c, i) => (
                            <span key={i} className={"truncate " + (i === 0 ? "font-medium text-brand" : "text-ink-3")}>
                              {c.period}
                            </span>
                          ))}
                        </span>
                        <span className="flex min-w-0 flex-col gap-1.5 text-small max-md:mt-2">
                          {career(p).map((c, i) => (
                            <span key={i} className="truncate text-ink">
                              {c.title} <span className="ml-1 text-ink-3">{c.company}</span>
                            </span>
                          ))}
                        </span>
                        <span className="flex min-w-0 flex-col gap-1.5 text-small text-ink-2 max-md:hidden">
                          {p.checks.slice(0, 3).map((c) => (
                            <span key={c.text} className="flex items-center gap-2">
                              <span aria-hidden="true" className={"flex size-[1.05rem] shrink-0 items-center justify-center rounded-full " + (c.ok ? "bg-success-soft text-success" : "bg-warn-soft text-warn")}>
                                <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                  <path d={c.ok ? "m2.5 6.2 2.3 2.3 4.7-4.9" : "M3 6h6"} />
                                </svg>
                              </span>
                              <span className="truncate">{c.text}</span>
                            </span>
                          ))}
                        </span>
                      </button>
                      <div className={"absolute right-7 top-1/2 flex -translate-y-1/2 items-center gap-2 " + (on ? "" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100")}>
                        <button type="button" onClick={() => notFit(p)} aria-label="Not a fit" title="Not a fit (X)" className="flex size-[max(2.6rem,34px)] items-center justify-center rounded-full border border-border-strong bg-surface text-ink-2 hover:bg-surface-2">
                          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" aria-hidden="true">
                            <path d="M12 4 4 12M4 4l8 8" />
                          </svg>
                        </button>
                        <button type="button" onClick={() => save(p)} title="Save (S)" className={"flex h-[max(2.6rem,34px)] items-center rounded-full px-5 text-small font-medium " + (isSaved ? "bg-brand-soft text-brand" : "bg-brand text-white hover:bg-brand-strong")}>
                          {isSaved ? "Saved" : "Save"}
                        </button>
                      </div>
                    </li>
                  );
                })}
                {view.result.others.length > 0 && (
                  <li className="mt-3 rounded-lg bg-surface-2 px-4 py-3">
                    <details>
                      <summary className="cursor-pointer text-small text-ink-2">{view.result.others.length} more, not opened - check them on LinkedIn for free</summary>
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {view.result.others.map((p, i) => (
                          <li key={p.url || i} className="text-small">
                            <a href={p.url} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-brand hover:underline">{p.name}</a>
                            <span className="text-ink-3"> · {p.headline}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                )}
              </ul>

              {/* A profile opens beside the list, read live from its link (frame 4). */}
              {panel && picked && (
                <aside
                  ref={panelEl}
                  role="dialog"
                  aria-label={`${picked.name} on LinkedIn`}
                  className="absolute -top-[5.4rem] -bottom-2 right-0 z-20 flex w-[min(45.5rem,100%)] flex-col gap-3 rounded-[1.45rem] border border-border bg-surface p-4 shadow-float max-md:fixed max-md:inset-3 max-md:w-auto"
                >
                  <div className="flex shrink-0 items-center gap-2.5">
                    {([["Previous", -1, "m10 3-5 5 5 5"], ["Next", 1, "m6 3 5 5-5 5"]] as const).map(([l, d, path]) => (
                      <button key={l} type="button" disabled={!rows[idx + d]} onClick={() => step_(d)} aria-label={l} title={`${l} (${d < 0 ? "↑" : "↓"})`} className="flex size-[2.07rem] shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-ink-2 hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-surface">
                        <svg viewBox="0 0 16 16" className="size-[0.83rem]" fill="none" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d={path} />
                        </svg>
                      </button>
                    ))}
                    <span className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-canvas px-3.5 py-1.5 text-small text-ink-2">
                      <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
                        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                      </svg>
                      <span className="truncate">{picked.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                    </span>
                    <a href={picked.url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-strong px-3.5 py-1.5 text-small font-medium text-ink hover:bg-surface-2">
                      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" />
                      </svg>
                      Open on LinkedIn
                    </a>
                    <button type="button" autoFocus onClick={() => setPanel(false)} aria-label="Close profile" title="Close (Esc)" className="flex size-[2.07rem] shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-ink-2 hover:bg-surface-2">
                      <svg viewBox="0 0 16 16" className="size-[0.83rem]" fill="none" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" aria-hidden="true">
                        <path d="M12 4 4 12M4 4l8 8" />
                      </svg>
                    </button>
                  </div>
                  <p className="flex shrink-0 items-center gap-2.5 rounded-[0.93rem] bg-brand-tint px-3.5 py-2.5 text-[max(0.725rem,10px)] font-medium text-ink">
                    <Image src="/aura-mark.png" alt="" width={24} height={24} className="size-[1.45rem] shrink-0 rounded-full bg-black" />
                    <span className="min-w-0 flex-1">{picked.checks.filter((c) => c.ok).length ? `${picked.checks.filter((c) => c.ok).length >= picked.checks.length - 1 ? "Strong fit" : "Some of the fit"}. ${picked.checks.filter((c) => c.ok).map((c) => c.text).join(". ")}.` : picked.headline}</span>
                    <span className="shrink-0 font-normal text-ink-3">{idx + 1} of {rows.length}</span>
                  </p>
                  <div ref={card} className="min-h-0 flex-1 overflow-y-auto rounded-md bg-canvas p-3.5">
                    <ProfileCard found={picked} data={profile} />
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <p className="min-w-0 flex-1 truncate text-caption text-ink-3">{typeof profile === "object" ? `Read from the profile link · ${new Date().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "Reading the profile from its link…"}</p>
                    <button type="button" onClick={() => notFit(picked)} className="flex h-[2.23rem] shrink-0 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-[1.14rem] text-[max(0.777rem,10.5px)] font-medium text-ink hover:bg-surface-2">
                      <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                        <path d="M12 4 4 12M4 4l8 8" />
                      </svg>
                      Not a fit
                    </button>
                    <button type="button" onClick={() => save(picked)} className="flex h-[2.23rem] shrink-0 items-center gap-1.5 rounded-full bg-brand px-[1.14rem] text-[max(0.777rem,10.5px)] font-medium text-white hover:bg-brand-strong">
                      <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 2.5h8v11l-4-2.8-4 2.8z" />
                      </svg>
                      {saved.includes(key(picked)) ? "Saved to project" : "Save to project"}
                    </button>
                  </div>
                </aside>
              )}
            </div>

            <div className="relative mt-3 flex shrink-0 flex-wrap items-center justify-center gap-5">
              {toast && (
                <p key={toast.n} role="status" className="absolute -top-12 left-[max(0.5rem,0px)] rounded-full bg-surface px-[1.125rem] py-2.5 text-small text-ink shadow-float ring-1 ring-border/60 max-md:left-0">
                  {toast.text}
                  {toast.undo && prev && (
                    <button type="button" onClick={undo} className="ml-3 font-medium text-brand hover:underline">
                      Undo
                    </button>
                  )}
                </p>
              )}
              {/* The chat rises from the bar and is exactly as wide as it (frame 1515-2506). */}
              <div className="relative w-[min(40rem,100%)]">
              {chat && (
                <div ref={bubble} role="dialog" aria-label="Chat with AURA" className="absolute inset-x-0 bottom-[calc(100%+0.75rem)] z-30 flex max-h-[26rem] flex-col gap-4 overflow-y-auto rounded-[1.5rem] border border-border bg-surface p-6 shadow-float">
                  <div className="flex items-center gap-3">
                    <p className="text-h3 font-medium text-ink">Chat with AURA</p>
                    <span className="text-small text-ink-3">This search</span>
                    <button type="button" onClick={() => setChat(false)} aria-label="Close chat" className="ml-auto flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2 hover:bg-surface-3">
                      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                        <path d="M12 4 4 12M4 4l8 8" />
                      </svg>
                    </button>
                  </div>
                  {thread.map((m, i, all) =>
                    m.me ? (
                      <p key={i} className="max-w-[85%] self-end rounded-[1.1rem] bg-surface-2 px-5 py-3 text-body text-ink">{m.me}</p>
                    ) : (
                      <div key={i} className="flex flex-col gap-3">
                        <div className="flex items-start gap-3">
                          <Image src="/aura-mark.png" alt="" width={28} height={28} className="size-7 shrink-0 rounded-full bg-black" />
                          <div>
                            <p className="text-body font-medium text-ink">{m.aura}</p>
                            {m.sub && <p className="text-small text-ink-2">{m.sub}</p>}
                          </div>
                        </div>
                        {m.options && i === all.length - 1 && !busy && (
                          <div className="flex flex-wrap gap-2 pl-10">
                            {NEXT.map((o, n) => (
                              <button key={o} type="button" onClick={() => void send(o)} className={"rounded-full px-4 py-2 text-small font-medium " + (n === 0 ? "bg-ink text-white hover:bg-ink/85" : "border border-border bg-surface text-ink hover:bg-surface-2")}>
                                {o}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ),
                  )}
                  {busy && (
                    <div role="status" className="flex items-center gap-3">
                      <span className="relative flex size-7 shrink-0">
                        <span aria-hidden="true" className="absolute inset-0 animate-pulse rounded-full bg-[conic-gradient(from_0deg,var(--color-aura-1),var(--color-aura-2),var(--color-aura-3),var(--color-aura-4),var(--color-aura-1))] opacity-60" />
                        <Image src="/aura-mark.png" alt="" width={28} height={28} className="relative size-full rounded-full bg-black" />
                      </span>
                      <p className="text-small text-ink-2">Searching again… about a minute.</p>
                      <button type="button" onClick={() => stop.current?.abort()} className="ml-auto rounded-full bg-ink px-4 py-1.5 text-small font-medium text-white hover:bg-ink/85">
                        Stop
                      </button>
                    </div>
                  )}
                </div>
              )}
              {auraBar("Type or speak — tell AURA what to change")}
              </div>
              <p className="flex items-center gap-4 rounded-full bg-ink px-5 py-3 text-small text-white max-md:hidden">
                <span className="flex items-center gap-2"><kbd className={keyHint}>↑ ↓</kbd> move</span>
                <span className="flex items-center gap-2"><kbd className={keyHint}>S</kbd> save</span>
                <span className="flex items-center gap-2"><kbd className={keyHint}>X</kbd> not a fit</span>
                <span className="flex items-center gap-2"><kbd className={keyHint}>Space</kbd> open the profile</span>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The opened profile as a LinkedIn-style card: banner, avatar, name, experience, education. */
function ProfileCard({ found, data }: { found: Found; data?: Profile | string }) {
  const p = typeof data === "object" ? data : undefined;
  const box = "rounded-md bg-surface p-4";
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-md bg-surface">
        <div className="h-[4.75rem] bg-[linear-gradient(110deg,#9fb2b8,#d5e3e3)]" />
        <div className="px-4 pb-4">
          <span className="-mt-9 flex size-[4.5rem] items-center justify-center rounded-full border-4 border-surface bg-info-soft text-h3 font-medium text-info">{initials(found.name)}</span>
          <p className="mt-2 text-h3 font-medium text-ink">{found.name}</p>
          <p className="text-small text-ink">{p?.headline || found.headline}</p>
          <p className="mt-1 text-caption text-ink-3">{p?.place || found.place}</p>
        </div>
      </div>
      {typeof data === "string" && data && <p className="rounded-sm bg-danger-soft px-4 py-3 text-small text-danger">{data}</p>}
      {data === "" && <p className="rounded-md bg-surface p-4 text-small text-ink-3">Reading the profile…</p>}
      {p && p.about && (
        <section className={box}>
          <h3 className="text-h3 font-medium text-ink">About</h3>
          <p className="mt-1.5 line-clamp-5 whitespace-pre-line text-small text-ink-2">{p.about}</p>
        </section>
      )}
      {p && p.experience.length > 0 && (
        <section className={box}>
          <h3 className="text-h3 font-medium text-ink">Experience</h3>
          <ul className="mt-3 flex flex-col gap-3.5">
            {p.experience.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-info-soft text-small font-medium text-info">{(e.company || "?")[0]}</span>
                <div className="min-w-0">
                  <p className="text-small font-medium text-brand">{e.title || "Role not shown"}</p>
                  <p className="text-caption text-ink-2">{[e.company, e.kind].filter(Boolean).join(" · ")}</p>
                  <p className="text-caption text-ink-3">{[e.period, e.length].filter(Boolean).join(" · ")}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {p && p.education.length > 0 && (
        <section className={box}>
          <h3 className="text-h3 font-medium text-ink">Education</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {p.education.map((e, i) => (
              <li key={i}>
                <p className="text-small font-medium text-ink">{e.school}</p>
                <p className="text-caption text-ink-2">{[e.degree, e.years].filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
