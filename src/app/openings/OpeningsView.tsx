"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSwap, useTabGlide } from "@/lib/gsap";
import { SEES_WHOLE_JOB } from "@/lib/user";
import Count from "@/app/Count";
import Toast from "./[id]/Toast";
import { useLiftMenu } from "./[id]/liftMenu";
import { OPENINGS, ORDER, STATUS, TARGET, inList, type List, type Opening } from "./data";

// O1 · Openings by category (owner's design, 14 Nov 2026): tabs with counts, then one
// row of cards per list with "See more"; a filter popover (which lists show, client,
// TA, sort); "Find a role, client or person" opens the spotlight (also ⌘K on this
// page); "New opening" opens the sheet where AURA reads a brief. Rules in ./data.ts.

const Spotlight = dynamic(() => import("./Spotlight"));
const NewOpening = dynamic(() => import("./NewOpening"));

/** Placeholder for `opening.manage`: a lead or admin may send an opening to the Bin. */
const CAN_MANAGE = SEES_WHOLE_JOB;
type Tab = "all" | List;
// The design's tab order; the lists below keep Active, Unassigned, On hold first.
const TABS: Tab[] = ["all", "active", "hold", "placed", "lost", "unassigned"];
type Sort = "new" | "days" | "client";
const SORTS: [Sort, string][] = [
  ["new", "Newest first"],
  ["days", "Most of its time used"],
  ["client", "Client A–Z"],
];

export default function OpeningsView() {
  const [rows, setRows] = useState(OPENINGS);
  const [tab, setTab] = useState<Tab>("all");
  const [show, setShow] = useState<List[]>(ORDER);
  const [client, setClient] = useState("");
  const [ta, setTa] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [spot, setSpot] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  const [toast, setToast] = useState<{ bold?: string; rest: string; n: number } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const said = useRef(0);
  const tabsRow = useRef<HTMLDivElement>(null);
  useTabGlide(tabsRow, tab);
  useSwap(body, tab);

  // ⌘K / Ctrl+K opens the spotlight here (before the top bar's own box takes it).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        setSpot(true);
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, []);

  const filtered = useMemo(() => {
    const f = rows.filter((o) => (!client || o.client === client) && (!ta || o.team.includes(ta)));
    const by: Record<Sort, (a: Opening, b: Opening) => number> = {
      new: (a, b) => b.made - a.made,
      days: (a, b) => b.days / TARGET[b.priority] - a.days / TARGET[a.priority],
      client: (a, b) => a.client.localeCompare(b.client),
    };
    return [...f].sort(by[sort]);
  }, [rows, client, ta, sort]);
  const of = (l: List) => filtered.filter((o) => inList(o, l));
  const all = filtered.length;

  const bin = (o: Opening) => {
    setRows((r) => r.filter((x) => x.id !== o.id));
    setToast({ bold: o.title, rest: " is in the Bin for 7 days. A lead can put it back from there.", n: ++said.current });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-[max(3.5rem,14px)] pt-[clamp(14px,3.3dvh,36px)] max-md:pt-4">
      {/* Tabs and tools */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3">
        <div ref={tabsRow} role="tablist" aria-label="Lists" className="relative flex flex-wrap items-center gap-1">
          <span data-tab-glide aria-hidden="true" style={{ opacity: 0 }} className="pointer-events-none absolute left-0 top-0 rounded-full bg-surface-2" />
          {TABS.map((t) => {
            const n = t === "all" ? all : of(t).length;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={
                  "relative flex items-center gap-2 rounded-full px-[max(1.125rem,12px)] py-2.5 text-small transition-colors " +
                  (tab === t ? "text-ink" : "text-ink-2 hover:text-ink")
                }
              >
                {t === "all" ? "All" : STATUS[t].label}
                <Count n={n} className="text-ink-3" />
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setSpot(true)}
          className="flex h-[max(3.25rem,40px)] w-[max(26.25rem,220px)] items-center gap-3 rounded-full bg-surface-2 pl-5 pr-3 text-left text-body text-ink-3 transition-colors hover:bg-surface-3 max-sm:w-full"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-[max(1.1rem,15px)] shrink-0" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="flex-1 truncate">Find a role, client or person</span>
          <kbd className="rounded-xs bg-surface px-2 py-0.5 font-sans text-caption text-ink-3">⌘K</kbd>
        </button>
        <Filters
          show={show}
          setShow={setShow}
          client={client}
          setClient={setClient}
          ta={ta}
          setTa={setTa}
          sort={sort}
          setSort={setSort}
          clients={[...new Set(rows.map((o) => o.client))].sort()}
          tas={[...new Set(rows.flatMap((o) => o.team))].sort()}
        />
        <button
          type="button"
          onClick={() => setSheet("")}
          className="flex h-[max(3.25rem,40px)] items-center gap-2.5 rounded-full bg-brand pl-5 pr-6 text-body font-medium text-white transition-colors hover:bg-brand-strong"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-[max(1.1rem,15px)]" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New opening
        </button>
      </div>

      {/* The lists */}
      <div ref={body} className="-mx-2 mt-[clamp(14px,4dvh,44px)] min-h-0 flex-1 overflow-y-auto px-2 pb-10">
        <div className="flex flex-col gap-[clamp(18px,4dvh,44px)]">
          {(tab === "all" ? ORDER.filter((l) => show.includes(l)) : [tab]).map((l) => {
            const list = of(l);
            const shown = tab === "all" ? list.slice(0, 4) : list;
            return (
              <section key={l} aria-label={STATUS[l].label} className="flex flex-col gap-[max(1.125rem,12px)]">
                <div className="flex items-center gap-3">
                  <h2 className="text-h2 font-normal text-ink">{STATUS[l].label}</h2>
                  <Count n={list.length} className="text-body text-ink-3" />
                  {tab === "all" && list.length > 4 && (
                    <button type="button" onClick={() => setTab(l)} className="ml-auto flex items-center gap-1.5 text-small text-ink-2 hover:text-ink">
                      See more
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true" data-nudge>
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </button>
                  )}
                </div>
                {shown.length ? (
                  <div className="grid grid-cols-4 gap-[max(1.5rem,12px)] max-lg:grid-cols-2 max-sm:grid-cols-1">
                    {shown.map((o) => (
                      <Card key={o.id} o={o} canBin={CAN_MANAGE} onBin={() => bin(o)} />
                    ))}
                  </div>
                ) : (
                  <p className="text-small text-ink-3">
                    {client || ta ? "Nothing here with these filters." : `No ${STATUS[l].label.toLowerCase()} openings.`}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {spot && (
        <Spotlight
          openings={rows}
          onClose={() => setSpot(false)}
          onCreate={(text) => {
            setSpot(false);
            setSheet(text);
          }}
        />
      )}
      {sheet !== null && (
        <NewOpening
          start={sheet}
          onClose={() => setSheet(null)}
          onCreate={(o) => {
            setRows((r) => [{ ...o, made: Math.max(...r.map((x) => x.made)) + 1 }, ...r]);
            setSheet(null);
            setTab("all");
            setToast({
              bold: o.title,
              rest: o.team.length ? " created. AURA is drafting the JD - approve it before it goes live." : " created, unassigned. Put a TA on it when you can.",
              n: ++said.current,
            });
          }}
        />
      )}
      {toast && <Toast key={toast.n} bold={toast.bold} rest={toast.rest} />}
    </div>
  );
}

/** One opening: client, role, where it stands. A lead sees the Bin on hover. */
function Card({ o, canBin, onBin }: { o: Opening; canBin: boolean; onBin: () => void }) {
  const l: List = inList(o, "unassigned") ? "unassigned" : o.status;
  const over = o.status === "active" && o.team.length > 0 && o.days > TARGET[o.priority];
  const right =
    l === "unassigned" ? "Needs a TA" : o.status === "active" ? `Day ${o.days} of ${TARGET[o.priority]}` : (o.note ?? "");
  return (
    <Link
      // ponytail: every card opens the one opening built so far.
      href="/openings/demo"
      prefetch={false}
      className="group relative flex h-[clamp(116px,15.5dvh,168px)] flex-col gap-[clamp(5px,0.95dvh,10px)] rounded-lg border border-border bg-surface px-[max(1.625rem,16px)] py-[clamp(12px,2dvh,22px)] transition-colors hover:border-border-strong hover:shadow-card"
    >
      <div className="flex items-center gap-2 text-small text-ink-3">
        <span className="truncate">{o.client}</span>
        <span className="ml-auto shrink-0 text-caption">P{o.priority}</span>
      </div>
      <p className="line-clamp-2 text-h3 font-medium text-ink">{o.title}</p>
      <div className="mt-auto flex items-center gap-2 text-small text-ink-2">
        <span className={"size-2 shrink-0 rounded-full " + STATUS[l].dot} aria-hidden="true" />
        {STATUS[l].label}
        <span className={"ml-auto truncate " + (over ? "text-danger" : "text-ink-3")} title={over ? "Past its target" : undefined}>
          {right}
        </span>
      </div>
      {canBin && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBin();
          }}
          aria-label={`Move ${o.title} to the Bin`}
          title="Move to the Bin (7 days)"
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-danger-soft text-danger opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
          </svg>
        </button>
      )}
    </Link>
  );
}

/** "Show" which lists, then client, TA and sort (owner's popover). */
function Filters(p: {
  show: List[];
  setShow: (s: List[]) => void;
  client: string;
  setClient: (c: string) => void;
  ta: string;
  setTa: (t: string) => void;
  sort: Sort;
  setSort: (s: Sort) => void;
  clients: string[];
  tas: string[];
}) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const busy = p.show.length < ORDER.length || p.client || p.ta || p.sort !== "new";
  const pick = "max-w-[11rem] cursor-pointer appearance-none bg-transparent text-right text-small text-ink-3 outline-none hover:text-ink";
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Filters"
        title="Filters"
        className="relative flex size-[max(3.25rem,40px)] items-center justify-center rounded-full bg-surface-2 text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5" aria-hidden="true">
          <path d="M4 7h16M7 12h10M10 17h4" />
        </svg>
        {busy && <span className="absolute right-3 top-3 size-2 rounded-full bg-brand" />}
      </button>
      {shown && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Filters"
          className="absolute right-0 top-full z-30 mt-2 flex w-[max(20rem,280px)] flex-col gap-1.5 rounded-lg bg-surface px-3.5 py-4 shadow-float ring-1 ring-border/60"
        >
          <p className="px-2.5 text-caption font-medium text-ink-3">Show</p>
          {TABS.filter((t): t is List => t !== "all").map((l) => {
            const on = p.show.includes(l);
            return (
              <label key={l} className="flex cursor-pointer items-center gap-3 rounded-sm px-2.5 py-2 text-body text-ink hover:bg-surface-2">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => p.setShow(on ? p.show.filter((x) => x !== l) : ORDER.filter((x) => x === l || p.show.includes(x)))}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={
                    "flex size-5.5 shrink-0 items-center justify-center rounded-xs border-[1.5px] peer-focus-visible:ring-2 peer-focus-visible:ring-brand " +
                    (on ? "border-ink bg-ink text-white" : "border-border-strong")
                  }
                >
                  {on && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </span>
                {l === "unassigned" ? "Unassigned (leads)" : STATUS[l].label}
              </label>
            );
          })}
          <div className="my-1 h-px bg-border" />
          <label className="flex items-center px-2.5 py-2 text-body text-ink">
            Client
            <select value={p.client} onChange={(e) => p.setClient(e.target.value)} className={"ml-auto " + pick}>
              <option value="">All clients</option>
              {p.clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span aria-hidden="true" className="ml-1.5 text-caption text-ink-3">▾</span>
          </label>
          <label className="flex items-center px-2.5 py-2 text-body text-ink">
            TA
            <select value={p.ta} onChange={(e) => p.setTa(e.target.value)} className={"ml-auto " + pick}>
              <option value="">Anyone</option>
              {p.tas.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <span aria-hidden="true" className="ml-1.5 text-caption text-ink-3">▾</span>
          </label>
          <label className="flex items-center px-2.5 py-2 text-body text-ink">
            Sort
            <select value={p.sort} onChange={(e) => p.setSort(e.target.value as Sort)} className={"ml-auto " + pick}>
              {SORTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <span aria-hidden="true" className="ml-1.5 text-caption text-ink-3">▾</span>
          </label>
        </div>
      )}
    </div>
  );
}
