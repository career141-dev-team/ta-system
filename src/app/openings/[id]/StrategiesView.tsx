"use client";

import { ViewSkeleton } from "@/app/Skeleton";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { door, jobFromAddress, useDoorMutation, useDoorQuery, useLive, type Answer, type DoorDone } from "@/lib/backend";
import { useSwap } from "@/lib/gsap";
import { useMe, type Role } from "@/lib/role";
import { useWorkdayGate } from "@/lib/workday";
import { setRows, useRows, type Row as PlannerRow } from "@/app/strategy/data";
import { BackButton } from "./PipelineBoard";
import { sendToPipeline } from "./pipelineInbox";
import Toast from "./Toast";
import {
  catalogOf,
  demoItemsForRole,
  resolveStrategyKey,
  shortDate,
  tagForStatus,
  todayIso,
  type StrategyItem,
  type StrategyKey,
  type StrategyStatus,
} from "./strategies/catalog";
import { ChevronRightSvg, StatusGlyph } from "./strategies/icons";
import LogBar from "./strategies/LogBar";
import {
  AllStrategiesGrid,
  DailyPlanWorkspace,
  NewStrategyAcceptView,
  StrategyWorkspaceSwitch,
  type CvTarget,
  type PipelineAdd,
} from "./strategies/Workspaces";

// Dynamic Strategies workspace (Figma frames 1:930 .. 1:2621):
// Left rail shows ONLY the strategies assigned to this TA on this position
// (grouped into TO DO, NEW FROM <LEAD>, and DONE) with progress bar, plus
// Daily Plan and All 15 Strategies views. Selecting any strategy adapts the
// right workspace to that specific strategy's workflow, actions, and floating
// "Log what you did" pill.

const CvPreview = dynamic(() => import("./CvPreview"), { ssr: false });

const SAMPLE_LEAD = "Rashmi";
const DEMO_JOB_TITLE = "Senior Manager — SAP Business Transformation";
const DEMO_PLANNER_JOB = "j1";

type DoorRows = Answer<{
  rows: {
    id: string;
    name: string;
    doneAt: number | null;
    submittedAt: number | null;
    note: string | null;
    proofs: number;
    mine: boolean;
    waiting: boolean;
  }[];
}>;

const isoOf = (t: number | null) => (t ? new Date(t).toISOString().slice(0, 10) : undefined);

function statusFromPlanner(r: PlannerRow): StrategyStatus {
  if (r.state === "waiting") return "new";
  if (r.state === "done") return "done";
  if (r.state === "working") return "in_progress";
  return "open";
}

function mergePlannerRows(base: StrategyItem[], plannerRows: PlannerRow[], role: Role, lead: string): StrategyItem[] {
  const jobRows = plannerRows.filter((r) => r.job === DEMO_PLANNER_JOB);
  const struckKeys = new Set(jobRows.filter((r) => r.state === "na").map((r) => resolveStrategyKey(r.name)));
  // Keep base items unless struck in the Strategy Planner.
  const out = base.filter((item) => !struckKeys.has(item.key));
  const existingKeys = new Set(out.map((i) => i.key));

  // If the Lead assigned additional strategies for this TA (or anyone, for Lead view)
  // in the Strategy Planner during this visit, surface them dynamically here.
  const myTaId = role === "TA" ? "CS" : role === "TA Support" ? "DR" : null;
  for (const r of jobRows) {
    if (r.state === "na") continue;
    if (myTaId && r.ta && r.ta !== myTaId) continue;
    if (myTaId && !r.ta) continue;
    const key = resolveStrategyKey(r.name);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    const status = statusFromPlanner(r);
    const whenLabel = status === "new" ? "new" : status === "done" ? r.done ?? "Today" : (r.when ?? "today").toLowerCase();
    const cat = catalogOf(key);
    out.push({
      id: `planner-${key}-${r.name}`,
      key,
      title: cat?.title ?? r.name,
      status,
      whenLabel,
      tagLabel: tagForStatus(status, whenLabel, undefined, lead),
      sent: status === "done",
      used: status === "done",
      note: r.note ?? "",
      proofs: Array.from({ length: r.proofs ?? 0 }, (_, i) => ({ id: `pr-${key}-${i}`, tone: "plain" as const })),
      taId: r.ta,
    });
  }
  return out;
}

export default function StrategiesView() {
  const me = useMe();
  const gate = useWorkdayGate();
  const live = useLive();
  const job = live ? jobFromAddress() : null;
  const lead = live ? "your TA Lead" : SAMPLE_LEAD;

  const plannerRows = useRows();
  const [roleSeed, setRoleSeed] = useState<Role>(me.role);
  const [items, setItems] = useState<StrategyItem[]>(() =>
    live ? [] : mergePlannerRows(demoItemsForRole(me.role), plannerRows, me.role, lead),
  );

  // Sync when the user switches "View as" role in sample mode so each TA sees their own strategies.
  if (!live && roleSeed !== me.role) {
    setRoleSeed(me.role);
    setItems(mergePlannerRows(demoItemsForRole(me.role), plannerRows, me.role, lead));
  }

  // Sync new planner assignments added in /strategy during this visit (sample mode).
  const plannerSig = useMemo(
    () =>
      plannerRows
        .filter((r) => r.job === DEMO_PLANNER_JOB)
        .map((r) => `${r.name}:${r.state}:${r.ta ?? ""}`)
        .join("|"),
    [plannerRows],
  );
  const lastPlannerSig = useRef(plannerSig);
  useEffect(() => {
    if (live || lastPlannerSig.current === plannerSig) return;
    lastPlannerSig.current = plannerSig;
    setItems((prev) => mergePlannerRows(prev, plannerRows, me.role, lead));
  }, [live, plannerSig, plannerRows, me.role, lead]);

  // Live Convex backend query (door.strategies) when signed in.
  const real = useDoorQuery(door.strategies, job ? { openingId: job } : "skip") as DoorRows | undefined;
  const [seenReal, setSeenReal] = useState<DoorRows | undefined>(undefined);
  if (real !== seenReal) {
    setSeenReal(real);
    if (real?.ok) {
      const visibleRows = me.lead ? real.rows : real.rows.filter((r) => r.mine);
      setItems(
        visibleRows.map((r) => {
          const key = resolveStrategyKey(r.name);
          const cat = catalogOf(key);
          const doneOn = isoOf(r.doneAt);
          const status: StrategyStatus = r.waiting ? "new" : r.doneAt || r.submittedAt ? "done" : "open";
          const whenLabel = status === "new" ? "new" : status === "done" ? shortDate(doneOn) || "Done" : "today";
          return {
            id: r.id,
            key,
            title: cat?.title ?? r.name,
            status,
            whenLabel,
            tagLabel: tagForStatus(status, whenLabel, doneOn, lead),
            doneOn,
            sent: Boolean(r.submittedAt),
            used: Boolean(r.doneAt || r.submittedAt),
            note: r.note ?? "",
            proofs: Array.from({ length: r.proofs }, (_, i) => ({ id: `${r.id}-${i}`, tone: "plain" as const })),
          };
        }),
      );
    }
  }

  const acceptAllDoor = useDoorMutation(door.acceptStrategies);
  const submitAllDoor = useDoorMutation(door.submitStrategies);

  // Lead TA filter (when a Lead / Director / Ops views the whole job).
  const [taFilter, setTaFilter] = useState<string>("all");
  const visibleItems = useMemo(() => {
    if (!me.lead || taFilter === "all") return items;
    return items.filter((i) => i.taName === taFilter);
  }, [items, me.lead, taFilter]);

  const taNames = useMemo(
    () => Array.from(new Set(items.map((i) => i.taName).filter(Boolean) as string[])),
    [items],
  );

  // View state: active strategy workspace, Daily plan, or All 15 grid.
  const [mode, setMode] = useState<"workspace" | "daily-plan" | "all-15">("workspace");
  const [selectedId, setSelectedId] = useState<string>("st-previous-post");
  const [previewItem, setPreviewItem] = useState<StrategyItem | null>(null);
  const [cv, setCv] = useState<CvTarget | null>(null);
  const [toast, setToast] = useState<{ key: number; bold: string; rest: string; warn?: boolean } | null>(null);

  const notify = (bold: string, rest: string, warn = false) => setToast({ key: Date.now(), bold, rest, warn });

  // Groups for the left rail (exact Figma order: TO DO, NEW FROM <LEAD>, DONE).
  const todoItems = visibleItems.filter((s) => s.status === "open" || s.status === "in_progress" || s.status === "running");
  const freshItems = visibleItems.filter((s) => s.status === "new");
  const doneItems = visibleItems.filter((s) => s.status === "done");

  // Progress bar matches Figma ("3 of 8 done" = done / (to do + done), excluding unaccepted new items).
  const activeTotal = todoItems.length + doneItems.length;
  const doneCount = doneItems.length;
  const progressPct = activeTotal > 0 ? Math.round((doneCount / activeTotal) * 100) : 0;

  // Ensure selected item always resolves to an assigned item (or a previewed unassigned one).
  const activeItem =
    previewItem ??
    visibleItems.find((s) => s.id === selectedId) ??
    todoItems[0] ??
    freshItems[0] ??
    doneItems[0] ??
    null;

  // One switch motion on the right workspace when changing strategy or mode (DESIGN.md).
  const paneRef = useRef<HTMLDivElement>(null);
  const swapKey = `${mode}:${activeItem?.id ?? "empty"}:${activeItem?.status ?? ""}`;
  useSwap(paneRef, swapKey);

  const patchItem = (id: string, patch: Partial<StrategyItem>) => {
    setItems((list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        return {
          ...next,
          tagLabel: tagForStatus(next.status, next.whenLabel, next.doneOn, lead),
        };
      }),
    );
  };

  const acceptIds = async (ids: string[]) => {
    if (!ids.length) return;
    if (job) {
      const res = (await acceptAllDoor({ openingId: job })) as DoorDone | undefined;
      if (res && !res.ok) return notify("Could not accept", ` — ${res.message}`, true);
    }
    const idSet = new Set(ids);
    setItems((list) =>
      list.map((s) => {
        if (!idSet.has(s.id) || s.status !== "new") return s;
        const whenLabel = "today";
        return {
          ...s,
          status: "open",
          whenLabel,
          tagLabel: tagForStatus("open", whenLabel, s.doneOn, lead),
        };
      }),
    );
    if (!live) {
      const acceptedKeys = new Set(items.filter((s) => idSet.has(s.id)).map((s) => s.key));
      setRows((rs) =>
        rs.map((r) =>
          r.job === DEMO_PLANNER_JOB && r.state === "waiting" && acceptedKeys.has(resolveStrategyKey(r.name))
            ? { ...r, state: "working", accepted: "Today" }
            : r,
        ),
      );
    }
    notify(
      ids.length === 1 ? items.find((x) => x.id === ids[0])?.title ?? "Strategy" : `${ids.length} strategies`,
      " accepted — ready to start",
    );
  };

  const submitItem = async (item: StrategyItem) => {
    const doneOn = item.doneOn ?? todayIso();
    if (job) {
      const res = (await submitAllDoor({
        openingId: job,
        rows: [{ rowId: item.id, used: true, date: doneOn, note: item.note }],
      })) as DoorDone | undefined;
      if (res && !res.ok) return notify("Not sent", ` — ${res.message}`, true);
    }
    const whenLabel = shortDate(doneOn);
    setItems((list) =>
      list.map((s) =>
        s.id === item.id
          ? {
              ...s,
              status: "done",
              used: true,
              sent: true,
              doneOn,
              whenLabel,
              tagLabel: `Done · ${whenLabel}`,
            }
          : s,
      ),
    );
    if (!live) {
      setRows((rs) =>
        rs.map((r) =>
          r.job === DEMO_PLANNER_JOB && resolveStrategyKey(r.name) === item.key
            ? { ...r, state: "done", done: whenLabel, note: item.note || r.note, proofs: item.proofs.length, ago: "Just now", read: false }
            : r,
        ),
      );
    }
    notify(item.title, ` submitted to ${lead}`);
  };

  const handleAddToPipeline = (p: PipelineAdd): boolean => {
    if (gate) {
      notify("Workday not started", ` — ${gate}`, true);
      return false;
    }
    sendToPipeline({
      name: p.name,
      title: p.title,
      company: p.company,
      channel: p.channel,
      cv: p.cv,
    });
    notify(p.name, " added to TA Follow-up in Pipeline");
    return true;
  };

  const openStrategyByKey = (key: StrategyKey) => {
    const found = visibleItems.find((s) => s.key === key) ?? items.find((s) => s.key === key);
    if (found) {
      if (me.lead && taFilter !== "all" && found.taName && found.taName !== taFilter) setTaFilter("all");
      setPreviewItem(null);
      setSelectedId(found.id);
      setMode("workspace");
      return;
    }
    const cat = catalogOf(key);
    if (cat) {
      setPreviewItem({
        id: `preview-${cat.key}`,
        key: cat.key,
        title: cat.title,
        status: "open",
        whenLabel: "",
        tagLabel: "Not on this position",
        sent: false,
        used: false,
        note: "",
        proofs: [],
        unassigned: true,
      });
      setMode("workspace");
    }
  };

  const selectStrategy = (item: StrategyItem) => {
    setPreviewItem(null);
    setSelectedId(item.id);
    setMode("workspace");
  };

  // Full-board All 15 Strategies view (Figma 1:1788)
  if (mode === "all-15") {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <AllStrategiesGrid
          items={visibleItems}
          jobSampleTitle={DEMO_JOB_TITLE}
          onBack={() => setMode("workspace")}
          onPickStrategy={openStrategyByKey}
        />
        {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} warn={toast.warn} />}
      </div>
    );
  }

  // Still reading this opening: a skeleton of the view, never an empty list that looks final (19 Nov).
  if (job && real === undefined) return <ViewSkeleton />;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Main two-column layout matching Figma board padding (top ~42px, sides ~37px, gap 40px) */}
      <div className="flex min-h-0 flex-1 gap-[max(2.5rem,20px)] px-[max(2.3125rem,14px)] pb-[max(1.5rem,12px)] pt-[max(2.625rem,16px)] max-md:flex-col max-md:gap-3 max-md:pt-11">
        {/* ================= LEFT RAIL (Figma 360px rounded-[28px] bg-canvas) ================= */}
        <aside
          aria-label="Strategies for this position"
          className="flex w-[max(22.5rem,252px)] shrink-0 flex-col rounded-[1.75rem] bg-canvas p-[max(1.25rem,12px)] max-md:w-full max-md:rounded-lg max-md:p-3"
        >
          {/* Rail header: BackButton + Strategies + N of M done */}
          <div className="flex items-center gap-3">
            <BackButton />
            <button
              type="button"
              onClick={() => {
                setPreviewItem(null);
                setMode("daily-plan");
              }}
              title="Open Daily plan"
              className="text-[max(1.25rem,16px)] font-medium text-ink transition-colors hover:text-brand"
            >
              Strategies
            </button>
            <span className="ml-auto whitespace-nowrap text-[max(0.875rem,13px)] text-ink-2">
              {doneCount} of {activeTotal} done
            </span>
          </div>

          {/* Progress bar */}
          <div className="pb-1.5 pt-2.5">
            <div className="h-[5px] w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Lead role switcher + Strategy Planner link (shown only to Lead/Director/Ops) */}
          {me.lead && (
            <div className="mb-1 mt-1 flex flex-wrap items-center gap-1.5 px-1">
              <button
                type="button"
                onClick={() => setTaFilter("all")}
                className={
                  "rounded-full px-2.5 py-0.5 text-caption transition-colors " +
                  (taFilter === "all" ? "bg-ink font-medium text-white" : "bg-surface text-ink-2 hover:bg-surface-2")
                }
              >
                All TAs
              </button>
              {taNames.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTaFilter(n)}
                  className={
                    "rounded-full px-2.5 py-0.5 text-caption transition-colors " +
                    (taFilter === n ? "bg-ink font-medium text-white" : "bg-surface text-ink-2 hover:bg-surface-2")
                  }
                >
                  {n}
                </button>
              ))}
              <Link href="/strategy" className="ml-auto text-caption font-medium text-brand hover:underline">
                Planner
              </Link>
            </div>
          )}

          {/* Mobile compact strategy strip (< md) */}
          <div className="mt-2 hidden gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] max-md:flex">
            <button
              type="button"
              onClick={() => {
                setPreviewItem(null);
                setMode("daily-plan");
              }}
              className={
                "shrink-0 rounded-full px-3 py-1.5 text-caption font-medium " +
                (mode === "daily-plan" ? "bg-ink text-white" : "bg-surface text-ink-2")
              }
            >
              Daily plan
            </button>
            {visibleItems.map((s) => {
              const selected = mode === "workspace" && activeItem?.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selectStrategy(s)}
                  className={
                    "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-caption " +
                    (selected ? "bg-surface font-medium text-ink shadow-xs" : "bg-surface/60 text-ink-2")
                  }
                >
                  <StatusGlyph status={s.status} />
                  <span className="whitespace-nowrap">{s.title}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setMode("all-15")}
              className="shrink-0 rounded-full bg-brand-soft px-3 py-1.5 text-caption font-medium text-brand"
            >
              All 15 →
            </button>
          </div>

          {/* Desktop scrollable strategy groups */}
          <nav aria-label="Assigned strategies" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pt-1 [scrollbar-width:thin] max-md:hidden">
            {/* TO DO */}
            {todoItems.length > 0 && (
              <>
                <div className="flex items-center px-3 pb-1.5 pt-3">
                  <span className="text-[max(0.75rem,11.5px)] font-medium uppercase tracking-[0.06em] text-ink-3">
                    TO DO
                  </span>
                </div>
                {todoItems.map((s) => {
                  const selected = mode === "workspace" && !previewItem && activeItem?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectStrategy(s)}
                      className={
                        "flex w-full items-center gap-3 rounded-[0.875rem] px-3 py-[max(0.6875rem,8px)] text-left transition-colors " +
                        (selected
                          ? "bg-surface font-medium text-ink shadow-card"
                          : "text-ink hover:bg-surface/65")
                      }
                    >
                      <StatusGlyph status={s.status} />
                      <span className="min-w-0 flex-1 truncate text-small">{s.title}</span>
                      <span className="shrink-0 text-caption font-normal text-ink-3">{s.whenLabel}</span>
                    </button>
                  );
                })}
              </>
            )}

            {/* NEW FROM <LEAD> */}
            {freshItems.length > 0 && (
              <>
                <div className="flex items-center px-3 pb-1.5 pt-3.5">
                  <span className="text-[max(0.75rem,11.5px)] font-medium uppercase tracking-[0.06em] text-ink-3">
                    NEW FROM {lead.toUpperCase()}
                  </span>
                  <button
                    type="button"
                    onClick={() => acceptIds(freshItems.map((f) => f.id))}
                    className="ml-auto text-caption font-medium text-brand hover:underline"
                  >
                    Accept all
                  </button>
                </div>
                {freshItems.map((s) => {
                  const selected = mode === "workspace" && !previewItem && activeItem?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectStrategy(s)}
                      className={
                        "flex w-full items-center gap-3 rounded-[0.875rem] px-3 py-[max(0.6875rem,8px)] text-left transition-colors " +
                        (selected
                          ? "bg-surface font-medium text-ink shadow-card"
                          : "text-ink hover:bg-surface/65")
                      }
                    >
                      <StatusGlyph status="new" />
                      <span className="min-w-0 flex-1 truncate text-small">{s.title}</span>
                      <span className="shrink-0 text-caption font-normal text-violet">new</span>
                    </button>
                  );
                })}
              </>
            )}

            {/* DONE */}
            {doneItems.length > 0 && (
              <>
                <div className="flex items-center px-3 pb-1.5 pt-3.5">
                  <span className="text-[max(0.75rem,11.5px)] font-medium uppercase tracking-[0.06em] text-ink-3">
                    DONE
                  </span>
                </div>
                {doneItems.map((s) => {
                  const selected = mode === "workspace" && !previewItem && activeItem?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectStrategy(s)}
                      className={
                        "flex w-full items-center gap-3 rounded-[0.875rem] px-3 py-[max(0.6875rem,8px)] text-left transition-colors " +
                        (selected
                          ? "bg-surface font-medium text-ink shadow-card"
                          : "text-ink hover:bg-surface/65")
                      }
                    >
                      <StatusGlyph status="done" />
                      <span className="min-w-0 flex-1 truncate text-small">{s.title}</span>
                      <span className="shrink-0 text-caption font-normal text-ink-3">{s.whenLabel}</span>
                    </button>
                  );
                })}
              </>
            )}

            {visibleItems.length === 0 && (
              <p className="px-3 py-6 text-small text-ink-3">
                No strategies assigned to you on this opening yet.
              </p>
            )}
          </nav>

          {/* Left rail footer: See all 15 strategies >  +  Daily plan */}
          <div className="mt-auto flex items-center justify-between gap-2 px-3 pb-1 pt-3 max-md:hidden">
            <button
              type="button"
              onClick={() => setMode("all-15")}
              className="flex items-center gap-1.5 text-[max(0.875rem,13px)] font-medium text-brand transition-colors hover:text-brand-strong"
            >
              <span>See all 15 strategies</span>
              <ChevronRightSvg className="size-3.25" />
            </button>
            <button
              type="button"
              onClick={() => {
                setPreviewItem(null);
                setMode("daily-plan");
              }}
              className={
                "rounded-full px-2.5 py-1 text-caption font-medium transition-colors " +
                (mode === "daily-plan"
                  ? "bg-surface text-ink shadow-xs"
                  : "text-ink-2 hover:bg-surface/70 hover:text-ink")
              }
            >
              Daily plan
            </button>
          </div>
        </aside>

        {/* ================= RIGHT WORKSPACE PANE ================= */}
        <section
          ref={paneRef}
          aria-label="Strategy workspace"
          className="flex min-h-0 min-w-0 flex-1 flex-col pt-[max(0.5rem,4px)]"
        >
          {mode === "daily-plan" ? (
            <DailyPlanWorkspace
              lead={lead}
              onOpenStrategy={openStrategyByKey}
              onNotify={(bold, rest) => notify(bold, rest)}
            />
          ) : !activeItem ? (
            <div className="m-auto flex max-w-md flex-col items-center gap-3 text-center">
              <p className="text-h3 font-medium text-ink">No strategies assigned yet</p>
              <p className="text-small text-ink-2">
                Once {lead} assigns strategies for this opening in the Strategy Planner, each one will appear here with its own workspace.
              </p>
              <button
                type="button"
                onClick={() => setMode("all-15")}
                className="h-10 rounded-full bg-ink px-5 text-small font-medium text-white hover:bg-black"
              >
                See all 15 strategies
              </button>
            </div>
          ) : activeItem.status === "new" ? (
            <NewStrategyAcceptView
              item={activeItem}
              freshItems={freshItems}
              lead={lead}
              onAcceptOne={() => acceptIds([activeItem.id])}
              onAcceptAll={() => acceptIds(freshItems.map((f) => f.id))}
              onAskLead={() => notify(`Message sent`, ` — asked ${lead} about ${activeItem.title}`)}
            />
          ) : (
            <>
              {activeItem.unassigned && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[1rem] bg-surface-2 px-4 py-2.5 text-small text-ink-2">
                  <span>
                    <strong className="font-medium text-ink">{activeItem.title}</strong> is not assigned on this position yet.
                  </span>
                  {me.lead ? (
                    <Link href="/strategy" className="font-medium text-brand hover:underline">
                      Assign in Strategy Planner →
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => notify("Requested", ` — asked ${lead} to add ${activeItem.title}`)}
                      className="font-medium text-brand hover:underline"
                    >
                      Ask {lead} to add it
                    </button>
                  )}
                </div>
              )}

              <StrategyWorkspaceSwitch
                item={activeItem}
                cb={{
                  lead,
                  jobSampleTitle: DEMO_JOB_TITLE,
                  onAddToPipeline: handleAddToPipeline,
                  onOpenCv: (target) => setCv(target),
                  onNotify: (bold, rest) => notify(bold, rest),
                  onOpenStrategyByKey: openStrategyByKey,
                }}
              />

              {!activeItem.unassigned && (
                <LogBar
                  item={activeItem}
                  lead={lead}
                  onPatch={(p) => patchItem(activeItem.id, p)}
                  onSubmit={() => submitItem(activeItem)}
                />
              )}
            </>
          )}
        </section>
      </div>

      {/* Real CV Preview modal for "Open CV" / "See the 2 CVs" */}
      {cv && <CvPreview name={cv.name} title={cv.title} src={cv.src} onClose={() => setCv(null)} />}
      {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} warn={toast.warn} />}
    </div>
  );
}
