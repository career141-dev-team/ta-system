"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DUR, EASE, gsap } from "@/lib/gsap";
import { CardsSkeleton } from "../../Skeleton";
import Toast from "../../openings/[id]/Toast";
import { BackButton } from "../../openings/[id]/PipelineBoard";
import { TAS, groupsOf, namesOf, useCatalogue, TODAY, WEEK, WORKED, auraPlan, busy, drafts, job, liveRows, setRows, ta, useRows, whenLabel, type Job, type Row, type TaId } from "../data";
import { AssignPanel, CalendarIcon, Initials, Toggle, type Assign } from "../ui";

// S3, planning one job (owner's design, 14 Nov 2026): what worked on roles like it,
// where the job stands, AURA's suggested plan; every strategy with a switch, who and
// which day; and the team's week, where a strategy is dragged onto a person and a day.
// Save draft keeps the plan unsent; Send gives each chosen strategy to its TA (their
// bell rings, they accept it on their Strategies tab). Old system's rules: a strategy
// with nobody on it can still be chosen (any TA may take it); one a TA has accepted or
// submitted cannot be switched off here; a strategy can be struck "not for this job".

const noSub = () => () => {};
const CARD = "flex min-h-0 flex-col overflow-y-auto rounded-lg bg-surface p-[max(1.75rem,16px)] shadow-card [scrollbar-width:thin]";
const BTN = "flex h-[max(3.5rem,38px)] items-center whitespace-nowrap rounded-full px-[max(1.5rem,14px)] text-[max(1rem,13px)] font-medium transition-colors";

export default function PlanJob() {
  // The job comes from the address (?job=); read in the browser only - the static
  // site has no server to read it.
  const id = useSyncExternalStore(noSub, () => new URLSearchParams(location.search).get("job"), () => undefined);
  const aura = useSyncExternalStore(noSub, () => new URLSearchParams(location.search).has("aura"), () => false);
  if (id === undefined)
    return (
      <main className="flex min-h-0 flex-1 flex-col px-11 py-10">
        <CardsSkeleton />
      </main>
    );
  const j = id ? job(id) : undefined;
  if (!j)
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-h3 font-medium text-ink">That job is not open for planning</p>
        <Link href="/strategy" className="text-small font-medium text-brand hover:underline">
          Back to the Strategy Planner
        </Link>
      </main>
    );
  return <Plan key={j.id} j={j} aura={aura} />;
}

const locked = (x?: Row) => x?.state === "working" || x?.state === "done";

function Plan({ j, aura }: { j: Job; aura: boolean }) {
  const rows = useRows();
  const router = useRouter();
  const stored = rows.filter((x) => x.job === j.id);
  const cat = useCatalogue();
  const [draft, setDraft] = useState<Row[]>(() => drafts.get(j.id) ?? stored);
  const [panel, setPanel] = useState<{ name: string; at: DOMRect } | null>(null);
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [used, setUsed] = useState(false);
  const [toast, setToast] = useState<{ key: number; bold: string; rest: string } | null>(null);
  const say = (bold: string, rest: string) => setToast({ key: Date.now(), bold, rest });

  const get = (n: string) => draft.find((x) => x.name === n);
  const put = (row: Row) => setDraft((d) => [...d.filter((x) => x.name !== row.name), row]);
  const drop = (n: string) => setDraft((d) => d.filter((x) => x.name !== n));
  const assign = (n: string, a: Assign) => {
    const cur = get(n);
    if (locked(cur)) return;
    // Same TA, new day: it stays with them. A new TA: it goes out again.
    put({ job: j.id, name: n, ta: a.ta, when: a.when, days: a.days, state: cur?.state === "waiting" && cur.ta === a.ta ? "waiting" : "open" });
  };

  const groups = groupsOf(cat, draft);
  const STRATEGIES = namesOf(groups);
  const same = (a?: Row, b?: Row) => JSON.stringify(a) === JSON.stringify(b);
  const changed = STRATEGIES.filter((n) => !same(get(n), stored.find((x) => x.name === n)));
  const toSend = draft.filter((x) => x.state === "open" && x.ta);
  const people = new Set(toSend.map((x) => x.ta)).size;
  const on = draft.filter((x) => x.state !== "na").length;
  const extra: Partial<Record<TaId, number>> = {};
  // What this plan adds to each TA's week: chosen now, or sent today.
  for (const x of draft) if (x.ta && (x.state === "open" || (x.state === "waiting" && x.assigned === "today"))) extra[x.ta] = (extra[x.ta] ?? 0) + 1;
  const ran = liveRows(stored, j.id).some((x) => x.state === "working" || x.state === "done");

  const send = () => {
    const next = draft.map((x) => (x.state === "open" && x.ta ? { ...x, state: "waiting" as const, assigned: "today" } : x));
    setRows((rs) => [...rs.filter((x) => x.job !== j.id), ...next]);
    setDraft(next);
    drafts.delete(j.id);
    if (toSend.length) say(`${toSend.length} ${toSend.length === 1 ? "strategy" : "strategies"} sent`, ` to ${people} ${people === 1 ? "TA" : "TAs"} — each gets a bell`);
    else say("Saved", " — the TAs see the change");
  };
  const saveDraft = () => {
    drafts.set(j.id, draft);
    say("Draft saved", " — nothing is sent until you press Send");
  };
  const usePlan = () => {
    const p = auraPlan(j);
    setDraft((d) => [...d.filter((x) => locked(x) || !p.rows.some((r) => r.name === x.name)), ...p.rows.filter((r) => !locked(d.find((x) => x.name === r.name)))]);
    setUsed(true);
  };

  // Dragging a strategy onto a person and a day: a copy of its name follows the
  // pointer; the cell under it lights up; letting go gives it to that TA on that day.
  const drag = useRef<{ name: string; x: number; y: number; ghost?: HTMLElement; over?: HTMLElement | null } | null>(null);
  const startDrag = (name: string, e: React.PointerEvent) => {
    if (locked(get(name)) || get(name)?.state === "na" || e.button !== 0) return;
    e.preventDefault();
    drag.current = { name, x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent) => {
      const d = drag.current!;
      if (!d.ghost) {
        if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 5) return;
        d.ghost = document.createElement("div");
        d.ghost.className = "pointer-events-none fixed left-0 top-0 z-[90] flex items-center gap-2 rounded-sm bg-surface px-4 py-2.5 text-small font-medium text-ink shadow-float";
        d.ghost.textContent = d.name;
        document.body.append(d.ghost);
        gsap.fromTo(d.ghost, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, rotation: -3, duration: DUR.fast, ease: EASE.pop });
      }
      gsap.set(d.ghost, { x: ev.clientX + 10, y: ev.clientY - 20 });
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-drop]") ?? null;
      if (over !== d.over) {
        d.over?.removeAttribute("data-over");
        over?.setAttribute("data-over", "");
        d.over = over;
      }
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      const d = drag.current!;
      drag.current = null;
      if (!d.ghost) return;
      const g = d.ghost;
      gsap.to(g, { opacity: 0, scale: 0.9, duration: DUR.fast, onComplete: () => g.remove() });
      setTimeout(() => g.remove(), 400);
      if (!d.over) return;
      d.over.removeAttribute("data-over");
      const [who, day] = d.over.dataset.drop!.split(":");
      assign(d.name, { ta: who as TaId, when: whenLabel(+day), days: [+day, +day] });
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };
  useEffect(() => () => drag.current?.ghost?.remove(), []);

  const sendLabel = toSend.length ? `Send ${toSend.length} ${toSend.length === 1 ? "strategy" : "strategies"} to ${people} ${people === 1 ? "TA" : "TAs"}` : changed.length ? "Save changes" : "Nothing to send";
  const names = j.tas.map((t) => ta(t).first).join(", ") || "no TA yet";

  return (
    <main className="flex min-h-0 flex-1 flex-col px-11 pb-[max(2.125rem,14px)] max-md:overflow-y-auto max-md:px-3">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3 py-[clamp(14px,3.2dvh,36px)] max-md:pt-12">
        <BackButton onClick={() => router.push("/strategy")} label="Back to the Strategy Planner" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[max(2rem,20px)] leading-tight text-ink">{j.title}</h1>
          <p className="truncate text-body text-ink-3">
            {j.client} · {j.industry} · P{j.p} · day {j.day} of {j.of} · {names}
          </p>
        </div>
        <button type="button" onClick={saveDraft} disabled={!changed.length} className={BTN + " border border-border-strong bg-surface text-ink hover:bg-surface-2 disabled:opacity-40"}>
          Save draft
        </button>
        <button type="button" onClick={send} disabled={!changed.length} className={BTN + " bg-ink text-white hover:bg-black disabled:opacity-40"}>
          {sendLabel}
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[44fr_66fr_69fr] gap-[max(1.25rem,10px)] max-lg:grid-cols-2 max-md:grid-cols-1 max-md:flex-none">
        {/* What worked before, where the job is, AURA's plan. */}
        <section className={CARD + " gap-[max(1.75rem,14px)] max-lg:col-span-2 max-md:col-span-1"}>
          <div className="flex items-center gap-3">
            <span className="flex size-[max(2.5rem,30px)] shrink-0 items-center justify-center overflow-hidden rounded-full bg-black">
              <Image src="/aura-mark.png" alt="" width={56} height={56} className="size-full" />
            </span>
            <div>
              <h2 className="text-h3 font-medium text-ink">What worked before</h2>
              <p className="text-caption text-ink-3">On 9 roles like this one</p>
            </div>
          </div>
          <ul className="flex flex-col gap-[max(1.25rem,10px)]">
            {WORKED.map(([n, hit, of]) => (
              <li key={n}>
                <p className="flex items-baseline gap-2 text-small text-ink [&>span]:shrink-0">
                  {n}
                  <span className="ml-auto whitespace-nowrap text-caption text-ink-3">
                    {hit} of {of} reached Director
                  </span>
                </p>
                <span className="mt-2 block h-1.5 rounded-full bg-surface-2">
                  <span style={{ width: `${Math.max(2, (hit / of) * 100)}%` }} className={"block h-full rounded-full " + (hit / of >= 0.5 ? "bg-brand" : hit ? "bg-success" : "bg-border-strong")} />
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-border pt-[max(1.25rem,10px)]">
            <p className="text-caption font-medium uppercase text-ink-3">This job right now</p>
            <div className="mt-3 flex gap-[max(2.5rem,16px)]">
              {[
                [j.pipeline, "in pipeline"],
                [j.shortlist, "Director shortlist"],
                [`${j.of - j.day} days`, `left of ${j.of}`],
              ].map(([n, t]) => (
                <p key={t}>
                  <span className="block whitespace-nowrap text-h2 font-light text-ink">{n}</span>
                  <span className="text-caption text-ink-3">{t}</span>
                </p>
              ))}
            </div>
            {!ran && <p className="mt-3 text-small text-danger">No strategy has been run on this job yet.</p>}
          </div>
          <div className={"mt-auto rounded-md bg-violet-soft p-[max(1.25rem,12px)] " + (aura && !used ? "ring-2 ring-violet" : "")}>
            <p className="text-small font-medium text-violet">AURA suggests</p>
            <p className="mt-2 text-small text-ink">{auraPlan(j).text}</p>
            <button type="button" onClick={usePlan} disabled={used} className="mt-4 rounded-full bg-ink px-5 py-2.5 text-small font-medium text-white hover:bg-black disabled:opacity-50">
              {used ? "Plan added — check and send" : "Use this plan"}
            </button>
          </div>
        </section>

        {/* Every strategy, by group, with its switch. */}
        <section className={CARD}>
          <div className="mb-[max(1rem,8px)] flex items-baseline">
            <h2 className="text-h3 font-medium text-ink">Strategies</h2>
            <span className="ml-auto text-small text-ink-3">
              {on} of {STRATEGIES.length} on
            </span>
          </div>
          {groups.map((g) => {
            const items = g.items.map((i) => i.name);
            // Those in use always show; the rest fill the group up to four, then "+ N more".
            const room = Math.max(0, 4 - items.filter((n) => get(n)).length);
            const spare = items.filter((n) => !get(n)).slice(0, room);
            const shown = more[g.name] ? items : items.filter((n) => get(n) || spare.includes(n));
            const hidden = items.length - shown.length;
            return (
              <div key={g.name} className="mt-[max(0.75rem,6px)]">
                <p className="mb-1.5 text-caption font-medium uppercase text-ink-3">{g.name}</p>
                {shown.map((n) => (
                  <StrategyRow
                    key={n}
                    name={n}
                    row={get(n)}
                    onToggle={(v) => (v ? put({ job: j.id, name: n, state: "open" }) : drop(n))}
                    onOpen={(at) => setPanel({ name: n, at })}
                    onDrag={(e) => startDrag(n, e)}
                    onUnstrike={() => drop(n)}
                  />
                ))}
                {hidden > 0 && (
                  <button type="button" onClick={() => setMore({ ...more, [g.name]: true })} className="ml-10 mt-1 text-small text-ink-3 hover:text-ink">
                    + {hidden} more {g.name} {hidden === 1 ? "strategy" : "strategies"}
                  </button>
                )}
              </div>
            );
          })}
        </section>

        {/* The team's week: drop a strategy on a person and a day. */}
        <section className={CARD}>
          <div className="mb-[max(1.25rem,10px)] flex flex-wrap items-baseline gap-x-4">
            <h2 className="text-h3 font-medium text-ink">Team this week</h2>
            <span className="ml-auto text-small text-ink-3 max-sm:hidden">Drag a strategy onto a person and day</span>
          </div>
          <div className="grid min-w-[30rem] grid-cols-[minmax(7.5rem,9.5rem)_repeat(5,minmax(0,1fr))] gap-x-[max(0.5rem,4px)] gap-y-[max(0.875rem,8px)]">
            <span />
            {WEEK.map((d, i) => (
              <span key={d} className={"pl-1 text-small " + (i === TODAY ? "font-medium text-brand" : "text-ink-3")}>
                {d}
              </span>
            ))}
            {TAS.map((t) => {
              const load = t.week + (extra[t.id] ?? 0);
              const full = busy({ ...t, week: load });
              return (
                <Week key={t.id} t={t} load={load} full={full} draft={draft} onDrag={startDrag} />
              );
            })}
          </div>
        </section>
      </div>

      {panel && (
        <AssignPanel
          key={panel.name}
          anchor={panel.at}
          name={panel.name}
          jobTitle={j.title}
          row={get(panel.name)}
          extra={extra}
          onClose={() => setPanel(null)}
          onAssign={(a) => {
            assign(panel.name, a);
            setPanel(null);
          }}
          onStrike={(na) => {
            if (na) put({ job: j.id, name: panel.name, state: "na" });
            else drop(panel.name);
            setPanel(null);
          }}
          onRemove={() => {
            drop(panel.name);
            setPanel(null);
          }}
        />
      )}
      {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} />}
    </main>
  );
}

const STATE_WORD = { waiting: "Waiting to accept", working: "Working on it", done: "Submitted" } as const;

/** One strategy: drag handle, name, who and when (when it is on), and the switch. */
function StrategyRow({ name, row, onToggle, onOpen, onDrag, onUnstrike }: { name: string; row?: Row; onToggle: (v: boolean) => void; onOpen: (at: DOMRect) => void; onDrag: (e: React.PointerEvent) => void; onUnstrike: () => void }) {
  const on = !!row && row.state !== "na";
  const lock = locked(row);
  const open = (e: React.MouseEvent<HTMLElement>) => onOpen(e.currentTarget.getBoundingClientRect());
  const CHIP = "flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 py-1 text-caption text-ink-2 hover:border-border-strong";
  return (
    <div className={"group flex min-h-[max(3.25rem,38px)] items-center gap-[max(0.75rem,6px)] rounded-md px-[max(0.75rem,6px)] " + (on ? "bg-canvas" : "")}>
      <span
        role="button"
        tabIndex={-1}
        aria-label={`Drag ${name} onto a person and day`}
        title="Drag onto a person and day"
        onPointerDown={onDrag}
        className={"flex w-4 shrink-0 cursor-grab touch-none select-none justify-center text-ink-3 " + (lock || row?.state === "na" ? "invisible" : "")}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden="true">
          {[6, 12, 18].map((y) => [9, 15].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" />))}
        </svg>
      </span>
      <button type="button" onClick={open} className={"min-w-0 flex-1 truncate text-left text-body " + (row?.state === "na" ? "text-ink-3 line-through" : on ? "font-medium text-ink" : "text-ink-2")}>
        {name}
      </button>
      {row?.state === "na" ? (
        <button type="button" onClick={onUnstrike} className="text-caption text-ink-3 hover:text-ink">
          Not for this job · Use again
        </button>
      ) : (
        on && (
          <>
            {lock || row.state === "waiting" ? <span className="whitespace-nowrap text-caption text-ink-3 max-xl:hidden">{STATE_WORD[row.state as keyof typeof STATE_WORD]}</span> : null}
            {row.ta ? (
              <button type="button" onClick={open} aria-label={`${ta(row.ta).name} - change who`} disabled={lock} className="rounded-full">
                <Initials id={row.ta} size="sm" ring={row.state === "waiting"} />
              </button>
            ) : (
              <button type="button" onClick={open} className="rounded-full border border-dashed border-border-strong px-2.5 py-1 text-caption text-ink-3 hover:border-ink-3">
                Drop a TA
              </button>
            )}
            {(!lock || row.when) && (
              <button type="button" onClick={open} disabled={lock} className={CHIP}>
                <CalendarIcon />
                {row.when ?? "Pick a day"}
              </button>
            )}
          </>
        )
      )}
      <Toggle on={on} disabled={lock || row?.state === "na"} title={lock ? "A TA has accepted it - it stays on" : undefined} label={`${name} on this job`} onChange={onToggle} />
    </div>
  );
}

/** One TA's week: their load, and a cell per day with the work already there (grey)
 *  and the strategies this plan puts on that day. */
function Week({ t, load, full, draft, onDrag }: { t: (typeof TAS)[number]; load: number; full: boolean; draft: Row[]; onDrag: (name: string, e: React.PointerEvent) => void }) {
  // ponytail: the grey bars are sample work; with the backend, each TA's real week.
  const bars = (d: number) => (t.week >= 8 ? 2 : t.week >= 4 ? 1 : d === 0 && t.week >= 2 ? 1 : 0);
  return (
    <>
      <div className="flex flex-col gap-1.5 py-1">
        <span className="flex items-center gap-2.5">
          <Initials id={t.id} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-small font-medium text-ink">{t.name}</span>
            <span className={"block text-caption " + (full ? "text-danger" : "text-ink-3")}>{load} this week</span>
          </span>
        </span>
        {full && <span className="self-start rounded-full bg-danger-soft px-2.5 py-1 text-caption text-danger">{t.first} is full most days</span>}
      </div>
      {WEEK.map((d, i) => {
        const here = draft.filter((x) => x.ta === t.id && x.state !== "na" && x.days && x.days[0] <= i && i <= x.days[1]);
        return (
          <div
            key={d}
            data-drop={`${t.id}:${i}`}
            className={
              "flex min-h-[max(5.5rem,60px)] flex-col gap-1.5 rounded-sm p-1.5 transition-colors data-[over]:bg-violet-soft data-[over]:outline-2 data-[over]:outline-dashed data-[over]:outline-violet " +
              (i === TODAY ? "bg-brand-tint" : "bg-surface-2")
            }
          >
            {Array.from({ length: bars(i) }, (_, k) => (
              <span key={k} className="h-1.5 w-4/5 rounded-full bg-border-strong opacity-70" />
            ))}
            {here.map((x) => (
              <span
                key={x.name}
                onPointerDown={(e) => onDrag(x.name, e)}
                title={`${x.name} · ${x.when}`}
                className={"cursor-grab touch-none select-none truncate rounded-sm border bg-surface px-1.5 py-1 text-caption font-medium " + ta(t.id).chip.split(" ").filter((c) => c.startsWith("text-")).join(" ") + (x.state === "open" ? " border-dashed border-current" : " border-current")}
              >
                {x.name}
              </span>
            ))}
          </div>
        );
      })}
    </>
  );
}
