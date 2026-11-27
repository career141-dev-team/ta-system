"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { DUR, EASE, gsap, useExit, useSwap, useTabGlide } from "@/lib/gsap";
import { useMe } from "@/lib/role";
import { door, prewarmOpening, useDoorQuery, useLive, type DoorOpenings } from "@/lib/backend";
import { clientOf, createFields, readOpeningForm, sendOpenings, type OpeningForm } from "./openingsLive";
import { useFilters } from "@/lib/filters";
import { NoResults, ResultLine } from "@/app/FilterBits";
import Toast from "./[id]/Toast";
import { LIFT_OUT, useLiftMenu } from "./[id]/liftMenu";
import { OPENINGS, ORDER, STATUS, TARGET, inList, type List, type Opening } from "./data";

// O1 · Openings by category (owner's design, 14 Nov 2026): tabs with counts, then one
// row of cards per list with "See more"; a filter popover (which lists show, client,
// TA, sort); "Find a role, client or person" opens the spotlight (also ⌘K on this
// page); "New opening" opens the sheet where AURA reads a brief. Rules in ./data.ts.

import { JoinSection, RequestOpening, RequestsChip } from "./AccessPanels";
const Spotlight = dynamic(() => import("./Spotlight"));
const NewOpening = dynamic(() => import("./NewOpening"));

/** Placeholder for `opening.manage`: a lead or admin may send an opening to the Bin. */
type Tab = "all" | List;
// The design's tab order; the lists below keep Active, Unassigned, On hold first.
const TABS: Tab[] = ["all", "today", "active", "hold", "placed", "lost", "unassigned"];
type Sort = "new" | "days" | "client";
const SORTS: [Sort, string][] = [
  ["new", "Newest first"],
  ["days", "Most of its time used"],
  ["client", "Client A–Z"],
];

export default function OpeningsView() {
  // opening.manage: who may send an opening to the Bin.
  // A lead may bin any opening; a TA only one they recruit on.
  const me = useMe();
  const canBin = (o: Opening) => me.lead || o.team.includes(me.first);
  const [arming, setArming] = useState<string | null>(null);
  const live = useLive();
  const [rows, setRows] = useState<Opening[]>(live ? [] : OPENINGS);
  // Live: the openings this person may see, from the backend (ui/openings:list).
  // Each new answer replaces the rows (adjusted while rendering).
  const real = useDoorQuery(door.openings, live ? {} : "skip") as DoorOpenings | undefined;
  const [seen, setSeen] = useState<DoorOpenings | undefined>(undefined);
  const [refusal, setRefusal] = useState<string | null>(null);
  const loadingList = live && !real;
  if (real !== seen) {
    setSeen(real);
    if (real?.ok) setRows(real.openings as Opening[]);
    setRefusal(real && !real.ok ? real.message : null);
  }
  // Tab, lists shown, client, TA and sort are kept for the visit (Back and reload find
  // them) and Reset clears them - src/lib/filters.ts. The sort is not counted as a filter.
  const { f, set, reset, active } = useFilters("openings", { tab: "all" as Tab, show: ORDER as string[], client: "", ta: "", sort: "new" as Sort }, ["tab", "sort"]);
  const { tab, client, ta, sort } = f;
  const show = f.show as List[];
  const setTab = (v: Tab) => set({ tab: v });
  const setShow = (v: List[]) => set({ show: v });
  const setClient = (v: string) => set({ client: v });
  const setTa = (v: string) => set({ ta: v });
  const setSort = (v: Sort) => set({ sort: v });
  const [spot, setSpot] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  const [toast, setToast] = useState<{ bold?: string; rest: string; n: number } | null>(null);
  // Signed in: the old TA System answers each press in its own words (openingsLive.ts, D9).
  const tell = (rest: string, bold?: string) => setToast({ bold, rest, n: Date.now() });
  // Signed in: the old New opening page's clients and TAs, read when the sheet opens.
  const [form, setForm] = useState<OpeningForm | null>(null);
  useEffect(() => {
    if (!live || sheet === null || form) return;
    void readOpeningForm().then((got) => (got.ok ? setForm(got) : tell(got.message)));
  }, [live, sheet, form]);
  const create = async (read: Parameters<typeof createFields>[0], brief: string) => {
    if (!form) return tell("Still reading the desk's clients - try again in a moment.");
    let clientId = clientOf(read.client, form.clients)?.id;
    if (!clientId) {
      if (!form.canAddClient) return tell(" is not a client yet. Ask a lead to add it first.", read.client.trim());
      const made = await sendOpenings({ do: "client", name: read.client.trim() });
      if (!made.ok || !made.client) return tell(made.message);
      const added = { ...made.client, industry: "" };
      clientId = added.id;
      setForm((f) => (f ? { ...f, clients: [...f.clients, added] } : f));
    }
    const res = await sendOpenings({ do: "create", ...createFields(read, brief, clientId, form.tas) });
    tell(res.message);
    if (!res.ok) return;
    setSheet(null);
    setTab("all");
  };
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

  // The Bin button asks first (a box over the card); "Move to Bin" there bins it.
  const bin = (o: Opening) => {
    setArming(null);
    // The list is the backend's own, so the opening leaves it by itself.
    if (live) return void sendOpenings({ do: "bin", openingId: o.id }).then((res) => tell(res.message));
    setRows((r) => r.filter((x) => x.id !== o.id));
    setToast({ bold: o.title, rest: " is in the Bin for 7 days. Anyone on the desk can put it back from the Bin.", n: ++said.current });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-[max(3.5rem,14px)] pt-[clamp(14px,3.3dvh,36px)] max-md:pt-12">
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
                {/* Plain numbers: counting up on every visit read as still loading (owner, 20 Nov). */}
                <span className="tabular-nums text-ink-3">{n}</span>
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
        <RequestsChip tell={tell} />
        <RequestOpening rows={rows} tell={tell} />
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
        {refusal && <p className="mb-4 text-small text-danger">{refusal}</p>}
        {!loadingList && <ResultLine shown={all} total={rows.length} noun="openings" active={active} onReset={reset} className="mb-4" />}
        {!refusal && (live ? !!real : true) && all === 0 && <NoResults noun="openings" filtered={active > 0} onReset={reset} />}
        <div className="flex flex-col gap-[clamp(18px,4dvh,44px)]">
          {(tab === "all" ? ORDER.filter((l) => show.includes(l)) : [tab]).map((l) => {
            const list = of(l);
            const shown = tab === "all" ? list.slice(0, 4) : list;
            return (
              <section key={l} aria-label={STATUS[l].label} className="flex flex-col gap-[max(1.125rem,12px)]">
                <div className="flex items-center gap-3">
                  <h2 className="text-h2 font-normal text-ink">{STATUS[l].label}</h2>
                  {loadingList ? <span className="shimmer h-4 w-6 rounded-sm" /> : <span className="tabular-nums text-body text-ink-3">{list.length}</span>}
                  {tab === "all" && list.length > 4 && (
                    <button type="button" onClick={() => setTab(l)} className="ml-auto flex items-center gap-1.5 text-small text-ink-2 hover:text-ink">
                      See more
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true" data-nudge>
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </button>
                  )}
                </div>
                {loadingList ? (
                  // Card-shaped shimmers while the list is read (owner, 19 Nov 2026: "No active
                  // openings" while loading looked final).
                  <div role="status" aria-label="Loading" className="grid grid-cols-4 gap-[max(1.5rem,12px)] max-lg:grid-cols-2 max-sm:grid-cols-1">
                    {[0, 1, 2, 3].map((k) => (
                      <div key={k} className="flex h-[max(10.5rem,140px)] flex-col gap-3 rounded-lg border border-border bg-white p-5">
                        <span className="shimmer h-3 w-2/5 rounded-sm" />
                        <span className="shimmer h-4 w-4/5 rounded-sm" />
                        <span className="shimmer h-4 w-3/5 rounded-sm" />
                        <span className="shimmer mt-auto h-3 w-1/3 rounded-sm" />
                      </div>
                    ))}
                  </div>
                ) : shown.length ? (
                  <div className="grid grid-cols-4 gap-[max(1.5rem,12px)] max-lg:grid-cols-2 max-sm:grid-cols-1">
                    {shown.map((o) => (
                      <Card
                        key={o.id}
                        o={o}
                        canBin={canBin(o)}
                        canWeb={me.lead}
                        armed={arming === o.id}
                        onArm={() => setArming(o.id)}
                        onBin={() => bin(o)}
                        onWeb={() => live ? void sendOpenings({ do: "website", openingId: o.id, listed: o.website ? "off" : "on" }).then((res) => tell(res.message)) : setRows((r) => r.map((x) => (x.id === o.id ? { ...x, website: !x.website } : x)))}
                        onDisarm={() => setArming(null)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-small text-ink-3">
                    {client || ta ? "Nothing here with these filters." : l === "today" ? "Nothing opened today." : `No ${STATUS[l].label.toLowerCase()} openings.`}
                  </p>
                )}
              </section>
            );
          })}
          {tab === "all" && <JoinSection tell={tell} />}
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
          clients={live ? (form?.clients ?? []).map((c) => c.name) : undefined}
          team={live ? (form?.tas ?? []).map((t) => t.name) : undefined}
          lead={live && form ? form.isLead : undefined}
          onCreate={(o, read, brief) => {
            if (live) return void create(read, brief);
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
// ponytail: sample candidate count per opening, the backend sends the real one.
const kept = (o: Opening) => 6 + ((o.id.length * 7 + o.days * 3) % 30);

function Card({
  o,
  canBin,
  canWeb,
  armed,
  onArm,
  onBin,
  onWeb,
  onDisarm,
}: {
  o: Opening;
  canBin: boolean;
  /** Old TA System (website jobs): admin, TA lead and ops put a job on career141.com. */
  canWeb: boolean;
  armed: boolean;
  onArm: () => void;
  onBin: () => void;
  onWeb: () => void;
  onDisarm: () => void;
}) {
  const live = useLive();
  const l: List = inList(o, "unassigned") ? "unassigned" : o.status;
  const over = o.status === "active" && o.team.length > 0 && o.days > TARGET[o.priority];
  const right =
    l === "unassigned" ? "Needs a TA" : o.status === "active" ? `Day ${o.days} of ${TARGET[o.priority]}` : (o.note ?? "");
  const ask = useRef<HTMLDivElement>(null);
  const binBtn = useRef<HTMLButtonElement>(null);
  const asking = useExit(armed, ask, LIFT_OUT);
  // In the sample build the opening page has no store to read the flag from, so the
  // card carries it in the address (the same way the Referee badge is carried).
  const marks = [o.referee ? "referee=1" : "", o.confidential ? "confidential=1" : ""].filter(Boolean);
  const sampleHref = "/openings/demo" + (marks.length ? `?${marks.join("&")}` : "");
  // The box lifts in over the card (lift, like a menu), and the safe choice takes focus.
  useEffect(() => {
    if (!armed || !ask.current) return;
    gsap.set(ask.current, LIFT_OUT);
    gsap.to(ask.current, { opacity: 1, y: 0, scale: 1, duration: DUR.fast, ease: EASE.out, overwrite: true });
    ask.current.querySelector<HTMLButtonElement>("[data-cancel]")?.focus({ preventScroll: true });
  }, [armed]);
  const cancel = () => {
    onDisarm();
    // Back to the Bin button once it shows again (next frame).
    requestAnimationFrame(() => binBtn.current?.focus({ preventScroll: true }));
  };
  // Buttons sit inside the card's link: they must never open the opening.
  const hold = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <Link
      // ponytail: every card opens the one opening built so far.
      href={live ? `/openings/demo?job=${o.id}` : sampleHref}
      // The page's files come ahead by themselves; pointing at a card also starts the
      // opening's first reads, so it opens on answers already here (25 Nov 2026).
      onPointerEnter={live ? () => prewarmOpening(o.id) : undefined}
      onFocus={live ? () => prewarmOpening(o.id) : undefined}
      onMouseLeave={armed ? onDisarm : undefined}
      className="group relative flex h-[clamp(116px,15.5dvh,168px)] flex-col gap-[clamp(5px,0.95dvh,10px)] rounded-lg border border-border bg-surface px-[max(1.625rem,16px)] py-[clamp(12px,2dvh,22px)] transition-colors hover:border-border-strong hover:shadow-card"
    >
      <div className="flex items-center gap-2 text-small text-ink-3">
        <span className="truncate">{o.client}</span>
        {o.referee && <span className="shrink-0 rounded-full bg-violet-soft px-2.5 py-0.5 text-caption font-medium text-violet">Referee</span>}
        {o.confidential && <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-caption font-medium text-ink-2">Confidential</span>}
        <span className="ml-auto shrink-0 text-caption">P{o.priority}</span>
      </div>
      <p className="line-clamp-2 text-h3 font-medium text-ink">{o.title}</p>
      <div className="mt-auto flex items-center gap-2 text-small text-ink-2">
        <span className={"size-2 shrink-0 rounded-full " + STATUS[l].dot} aria-hidden="true" />
        {STATUS[l].label}
        <span className={"ml-auto truncate " + (over ? "text-danger" : "text-ink-3")} title={over ? "Past its target" : undefined}>
          {right}
        </span>
        {/* On career141.com: only an active job is listed (a held or closed one drops
            off by itself, as in the old system); only a lead, Director or Ops switches
            it, others just see that it is on. A globe, not the word, so the row fits. */}
        {o.status === "active" &&
          (canWeb ? (
            <button
              type="button"
              role="switch"
              aria-checked={!!o.website}
              aria-label={`List ${o.title} on career141.com`}
              title={o.website ? "On career141.com - press to take it off" : "Not on career141.com - press to list it"}
              onClick={(e) => {
                hold(e);
                onWeb();
              }}
              className={"flex shrink-0 items-center gap-1 rounded-full py-0.5 pl-1.5 pr-0.5 transition-colors " + (o.website ? "text-brand" : "text-ink-3 hover:text-ink")}
            >
              <GlobeIcon />
              <span className={"relative h-4 w-7 rounded-full transition-colors " + (o.website ? "bg-brand" : "bg-border-strong")}>
                <span className={"absolute top-0.5 size-3 rounded-full bg-white transition-[left] " + (o.website ? "left-3.5" : "left-0.5")} />
              </span>
            </button>
          ) : (
            o.website && (
              <span className="flex shrink-0 text-brand" title="On career141.com">
                <GlobeIcon />
              </span>
            )
          ))}
      </div>
      {canBin && (
        <button
          ref={binBtn}
          type="button"
          onClick={(e) => {
            hold(e);
            onArm();
          }}
          aria-label={`Move ${o.title} to the Bin`}
          title="Move to the Bin (7 days)"
          className={
            "absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-danger-soft text-danger opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100 " +
            (armed ? "invisible" : "")
          }
        >
          <BinIcon />
        </button>
      )}
      {/* The question sits over the card (absolute), so nothing around it moves. */}
      {canBin && asking && (
        <div
          ref={ask}
          role="alertdialog"
          aria-label={`Move ${o.title} to the Bin?`}
          onClick={hold}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              hold(e);
              cancel();
            }
          }}
          className="absolute inset-[max(0.375rem,4px)] z-10 flex cursor-default flex-col justify-between gap-1 rounded-md border-[1.5px] border-danger/40 bg-danger-soft px-[max(1rem,10px)] py-[max(0.75rem,8px)] shadow-float"
        >
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-small font-medium text-danger">
              <BinIcon />
              Move to the Bin?
            </p>
            <p className="truncate text-caption text-ink-2" title={`${kept(o)} candidates stay in the database. Anyone can restore it within 7 days.`}>
              {kept(o)} candidates stay · restore within 7 days
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              data-cancel
              onClick={(e) => {
                hold(e);
                cancel();
              }}
              className="h-[max(2rem,28px)] rounded-full border border-border-strong bg-surface px-[max(0.875rem,10px)] text-caption font-medium text-ink hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => {
                hold(e);
                onBin();
              }}
              className="h-[max(2rem,28px)] rounded-full bg-danger px-[max(0.875rem,10px)] text-caption font-medium text-white transition-opacity hover:opacity-90"
            >
              Move to Bin
            </button>
          </div>
        </div>
      )}
    </Link>
  );
}

const BinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0" aria-hidden="true">
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 shrink-0" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
);

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
