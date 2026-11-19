"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { gsap, motionOK, swapIn, useGSAP } from "@/lib/gsap";
import type { Found, SearchResult } from "@/lib/linkedinSearch";
import { EMPTY, chipsOf, isEmpty, readAsk, type Ask } from "./read";
import { useSignedHeaders } from "@/lib/backend";

// LinkedIn Search as a chat with AURA (owner, 17 Nov 2026: "looks like a prompt chat
// box, not a form"). The TA says who they need; AURA shows what it read, searches one
// page of 25, opens the 10 most likely and shows them best first with what matched.
// A follow-up ("only Colombo", "now 6+ years") changes the last search. Nothing is saved.

type Turn =
  | { id: number; from: "me"; text: string }
  | { id: number; from: "aura"; text?: string; ask?: Ask; result?: SearchResult; error?: string };

const TRY = [
  "Software engineers at WSO2 in Colombo with 5 years experience",
  "HR managers in Kandy",
  "Java developers with Spring and React",
  "Finance directors at Hemas",
];
const NEXT = ["Now 6+ years", "Only Colombo", "New search"];

export default function LinkedInSearch() {
  const signed = useSignedHeaders();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [ask, setAsk] = useState<Ask>(EMPTY);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(0);
  const id = () => ++seq.current;

  // Each new turn arrives by the one switch, and the talk follows it down.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    const all = el.querySelectorAll("[data-turn]");
    if (all.length) swapIn(all[all.length - 1]);
  }, [turns.length]);

  // AURA's mark breathes while it looks (never spins).
  const orb = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!busy || !orb.current || !motionOK()) return;
      gsap.to(orb.current.querySelector("[data-glow]"), { scale: 1.35, opacity: 0.15, duration: 0.9, ease: "sine.inOut", repeat: -1, yoyo: true });
    },
    { dependencies: [busy], scope: orb },
  );

  async function send(raw: string) {
    const said = raw.trim();
    if (!said || busy) return;
    setText("");
    if (/^(?:new search|start over|clear)$/i.test(said)) {
      setTurns([]);
      setAsk(EMPTY);
      box.current?.focus();
      return;
    }
    const next = readAsk(said, ask);
    const me: Turn = { id: id(), from: "me", text: said };
    if (isEmpty(next)) {
      setTurns((t) => [...t, me, { id: id(), from: "aura", text: "Tell me a job title, a company, a place or a skill - for example “Java developers in Colombo with 5 years”." }]);
      return;
    }
    setAsk(next);
    setTurns((t) => [...t, me]);
    setBusy(true);
    try {
      const res = await fetch("/api/linkedin-search", { method: "POST", headers: { "Content-Type": "application/json", ...(await signed()) }, body: JSON.stringify(next) });
      const data = await res.json().catch(() => {
        throw new Error("LinkedIn search needs the server. It runs on a local copy with APIFY_TOKEN set, or on the dev link once the key is set in Cloudflare.");
      });
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setTurns((t) => [...t, { id: id(), from: "aura", ask: next, result: data as SearchResult }]);
    } catch (e) {
      setTurns((t) => [...t, { id: id(), from: "aura", ask: next, error: e instanceof Error ? e.message : "Search failed" }]);
    } finally {
      setBusy(false);
    }
  }

  const lastAura = [...turns].reverse().find((t) => t.from === "aura")?.id;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-[max(1.5rem,12px)] pb-6 pt-[max(2.25rem,20px)]">
        <div className="mx-auto flex w-full max-w-[52rem] flex-col gap-[max(1.75rem,16px)]">
          {!turns.length && <Welcome onTry={send} />}
          {turns.map((t) =>
            t.from === "me" ? (
              <div key={t.id} data-turn className="flex justify-end">
                <p className="max-w-[80%] whitespace-pre-line rounded-lg rounded-br-xs bg-surface-2 px-[max(1.25rem,14px)] py-[max(0.75rem,9px)] text-body text-ink">{t.text}</p>
              </div>
            ) : (
              <div key={t.id} data-turn className="flex gap-[max(0.9rem,10px)]">
                <Orb />
                <div className="flex min-w-0 flex-1 flex-col gap-3 pt-1.5">
                  {t.text && <p className="text-body text-ink">{t.text}</p>}
                  {t.ask && <Read ask={t.ask} />}
                  {t.error && <p className="rounded-sm bg-danger-soft px-4 py-3 text-small text-danger">{t.error}</p>}
                  {t.result && <Results r={t.result} />}
                  {t.id === lastAura && t.result && !busy && (
                    <div className="flex flex-wrap gap-2">
                      {NEXT.map((n) => (
                        <button key={n} type="button" onClick={() => send(n)} className="rounded-full border border-border px-3.5 py-1.5 text-small text-ink-2 hover:border-border-strong hover:bg-surface-2 hover:text-ink">
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
          {busy && (
            <div ref={orb} role="status" className="flex items-center gap-[max(0.9rem,10px)]">
              <Orb breathing />
              <p className="text-body text-ink-3">Reading 25 people on LinkedIn and opening the best 10… about a minute.</p>
            </div>
          )}
        </div>
      </div>

      {/* The prompt box: Enter sends, Shift+Enter is a new line. */}
      <div className="px-[max(1.5rem,12px)] pb-[max(2rem,14px)]">
        <div className="mx-auto flex w-full max-w-[52rem] items-end gap-[max(0.9rem,8px)] rounded-xl bg-surface p-2.5 shadow-float ring-1 ring-border/60 transition-shadow focus-within:ring-2 focus-within:ring-brand/30">
          <textarea
            ref={box}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            rows={1}
            maxLength={500}
            placeholder={turns.length ? "Change it - “only Colombo”, “now 6+ years” - or a new search" : "Who do you need? “Software engineers at WSO2 with 5 years”"}
            aria-label="Ask AURA to search LinkedIn"
            className="max-h-32 min-w-0 flex-1 resize-none self-center bg-transparent px-2 py-2 text-body text-ink outline-none placeholder:text-ink-3 [field-sizing:content]"
          />
          <button
            type="button"
            onClick={() => send(text)}
            disabled={!text.trim() || busy}
            aria-label="Send"
            className="flex size-[max(2.75rem,36px)] shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-strong disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-[max(1.25rem,16px)]" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-[52rem] text-center text-caption text-ink-3">Each search reads 25 people and opens the best 10 - about $0.14.</p>
      </div>
    </div>
  );
}

function Welcome({ onTry }: { onTry: (t: string) => void }) {
  return (
    <div className="mt-[max(3rem,16px)] flex flex-col items-center gap-[max(1rem,10px)] text-center">
      <Orb />
      <p className="text-h2 text-ink">Who do you need on LinkedIn?</p>
      <p className="max-w-[34rem] text-small text-ink-2">Say it the way you would to a colleague. I read 25 people, open the 10 most likely and show them best first, with what matched.</p>
      <div className="mt-2 flex max-w-[44rem] flex-wrap justify-center gap-2">
        {TRY.map((t) => (
          <button key={t} type="button" onClick={() => onTry(t)} className="rounded-full border border-border px-3.5 py-1.5 text-small text-ink-2 hover:border-border-strong hover:bg-surface-2 hover:text-ink">
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/** What AURA read from the prompt, so the TA can see it and say it again to change it. */
function Read({ ask }: { ask: Ask }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-small text-ink-2">Searching LinkedIn for</span>
      {chipsOf(ask).map((c) => (
        <span key={c} className="rounded-full bg-violet-soft px-2.5 py-0.5 text-caption text-violet">{c}</span>
      ))}
    </div>
  );
}

function Results({ r }: { r: SearchResult }) {
  if (!r.checked.length)
    return <p className="text-body text-ink">LinkedIn found nobody for this. Try fewer words, or a wider place.</p>;
  return (
    <>
      <p className="text-body text-ink">
        I read {r.checked.length + r.others.length} people and opened {r.opened ? `the ${r.opened} most likely` : "none"}. Best match first.
      </p>
      {r.note && <p className="rounded-sm bg-warn-soft px-4 py-3 text-small text-warn">{r.note}</p>}
      <ul className="flex flex-col gap-2.5">
        {r.checked.map((p, i) => (
          <Person key={p.url || i} p={p} rank={i + 1} />
        ))}
      </ul>
      {r.others.length > 0 && (
        <details className="rounded-lg bg-surface-2 px-4 py-3">
          <summary className="cursor-pointer text-small text-ink-2">{r.others.length} more, not opened - check them on LinkedIn for free</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {r.others.map((p, i) => (
              <li key={p.url || i} className="text-small">
                <a href={p.url} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-brand hover:underline">{p.name}</a>
                <span className="text-ink-3"> · {p.headline}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-caption text-ink-3">
        This search: 1 page + {r.opened} profiles = about ${r.cost.toFixed(2)}
      </p>
    </>
  );
}

function Person({ p, rank }: { p: Found; rank: number }) {
  const met = p.checks.filter((c) => c.ok).length;
  return (
    <li className="rounded-lg bg-surface p-[max(1rem,10px)] shadow-card ring-1 ring-border/60">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-body">
          <span className="mr-2 font-mono text-caption text-ink-3">{rank}</span>
          <span className="font-medium text-ink">{p.name}</span>
        </p>
        {p.url && (
          <a href={p.url} target="_blank" rel="noreferrer" className="shrink-0 text-small text-brand hover:underline">
            Open on LinkedIn ↗
          </a>
        )}
      </div>
      {p.headline && <p className="text-small text-ink-2">{p.headline}</p>}
      <p className="text-small text-ink-3">{[p.now, p.place, p.years !== undefined ? `${p.years} years in work` : ""].filter(Boolean).join(" · ")}</p>
      {p.checks.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-ink-3">
            Matches {met} of {p.checks.length}
          </span>
          {p.checks.map((c) => (
            <span key={c.text} className={"rounded-full px-2.5 py-0.5 text-caption " + (c.ok ? "bg-success-soft text-success" : "bg-surface-2 text-ink-3 line-through")}>
              {c.ok ? "✓ " : ""}
              {c.text}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

/** AURA's mark; breathing while it looks. */
function Orb({ breathing = false }: { breathing?: boolean }) {
  return (
    <span className="relative flex size-[max(2.5rem,32px)] shrink-0">
      {breathing && (
        <span
          data-glow
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,var(--color-aura-1),var(--color-aura-2),var(--color-aura-3),var(--color-aura-4),var(--color-aura-1))] opacity-40"
        />
      )}
      <Image src="/aura-mark.png" alt="AURA" width={40} height={40} className="relative size-full rounded-full" />
    </span>
  );
}
