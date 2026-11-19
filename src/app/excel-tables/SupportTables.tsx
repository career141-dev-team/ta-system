"use client";

import { useMemo, useRef, useState } from "react";
import { useFilters } from "@/lib/filters";
import { useSwap } from "@/lib/gsap";
import { FIELD_PILL } from "../openings/[id]/filters";
import PillMenu, { type MenuOption } from "../openings/[id]/PillMenu";
import { BackButton } from "../openings/[id]/PipelineBoard";

// Excel Tables for TA Support (owner 14 Nov 2026: "Excel table for TA support we can
// add"; old system /support-tables "Position review"). Pick any position and read every
// TA's Excel Tables and EOD emails on it, with no access request; nothing here can be
// changed. Filters: who added, which L-sheet, a search over name, company and phone;
// "L counts by TA" shows how many profiles each TA has per sheet and how many today.
// No design: built in the board's own look.
// ponytail: sample rows; with the backend, the position's linkVault rows and EODs.

type Pos = { id: string; title: string; client: string };
type Row = { id: string; pos: string; name: string; title: string; company: string; ta: string; sheet: number | null; phone?: string; interest: "To approach" | "Interested" | "Not interested"; eye?: boolean; addOn?: boolean; today: boolean; note?: string };
type Eod = { id: string; pos: string; ta: string; date: string; subject: string; cvs: number };

const POSITIONS: Pos[] = [
  { id: "p1", title: "Senior Manager — SAP Business Transformation", client: "PGP Glass" },
  { id: "p2", title: "Finance Manager", client: "Hayleys Fabric" },
  { id: "p3", title: "HR Business Partner", client: "Dialog Axiata" },
  { id: "p4", title: "Plant Engineer", client: "Lanka Tiles" },
];
const TAS = ["Chathura", "Dinuka", "Dilini", "Sewwandi"];
const COMPANIES = ["Virtusa", "IFS", "Brandix", "MAS", "Hayleys", "John Keells", "Dialog"];
const FIRST = ["Nimal", "Kasun", "Dilini", "Ishara", "Ruwan", "Tharushi", "Sahan", "Nadeesha", "Pasindu", "Hiruni", "Chamara", "Sachini"];
const LAST = ["Perera", "Fernando", "Silva", "Jayasinghe", "Wickramasinghe", "Bandara"];
const ROWS: Row[] = POSITIONS.flatMap((p, pi) =>
  Array.from({ length: 18 - pi * 3 }, (_, i) => ({
    id: `${p.id}-${i}`,
    pos: p.id,
    name: `${FIRST[(i + pi) % FIRST.length]} ${LAST[(i * 2 + pi) % LAST.length]}`,
    title: ["Finance Manager", "SAP Lead", "HR Partner", "Engineer"][pi],
    company: COMPANIES[(i + pi * 2) % COMPANIES.length],
    ta: TAS[(i + pi) % TAS.length],
    sheet: i % 7 === 6 ? null : (i % 3) + 1,
    phone: i % 3 === 0 ? `+94 77 ${String(100 + i).padStart(3, "0")} ${String(4000 + i * 7).slice(0, 4)}` : undefined,
    interest: (["To approach", "Interested", "Not interested"] as const)[i % 3],
    eye: i % 5 === 0,
    addOn: i % 8 === 3,
    today: i % 4 === 0,
    note: i % 6 === 1 ? "Asked to call back next week." : undefined,
  })),
);
const EODS: Eod[] = POSITIONS.flatMap((p, pi) =>
  ["13 Nov", "12 Nov", "11 Nov"].map((d, i) => ({ id: `${p.id}-e${i}`, pos: p.id, ta: TAS[(pi + i) % TAS.length], date: d, subject: `SET ${3 - i} - ${p.client.toUpperCase()} - ${p.title.toUpperCase()} - ${i + 2} CVs`, cvs: i + 2 })),
);

// Redesigned 17 Nov 2026 on DESIGN.md, in the look of the opening's own Excel Tables
// (owner: "make sure it follows our existing UI design"): pill menus with chevrons, a
// quiet table with a sticky header, the L counts grouped by TA.
const INTEREST = {
  "To approach": "bg-surface-2 text-ink-2",
  Interested: "bg-success-soft text-success",
  "Not interested": "bg-danger-soft text-danger",
} as const;
const BY: MenuOption[] = [{ value: "all", label: "everyone" }, ...TAS.map((t) => ({ value: t, label: t }))];
const SHEETS: MenuOption[] = [
  { value: "all", label: "All sheets" },
  ...[1, 2, 3].map((n) => ({ value: String(n), label: `L${n}` })),
  { value: "none", label: "Not in a sheet" },
];
const TH = "sticky top-0 z-10 border-b border-border bg-surface py-[max(0.65rem,8px)] pr-4 text-caption font-medium text-ink-3";
const TD = "border-b border-border py-[max(0.7rem,8px)] pr-4 align-middle";
const sheetLabel = (s: number | null) => (s === null ? "Not in a sheet" : `L${s}`);

export default function SupportTables() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [tab, setTab] = useState<"tables" | "eod">("tables");
  // Who, sheet and search are kept for the visit; Reset clears them (src/lib/filters.ts).
  const { f, set, reset, active } = useFilters("support-tables", { by: "all", sheet: "all", q: "" });
  const { by, sheet, q } = f;
  const setBy = (v: string) => set({ by: v });
  const setSheet = (v: string) => set({ sheet: v });
  const setQ = (v: string) => set({ q: v });
  const stage = useRef<HTMLDivElement>(null);
  useSwap(stage, (pos?.id ?? "") + tab);

  const rows = useMemo(() => ROWS.filter((r) => r.pos === pos?.id), [pos]);
  const shown = rows.filter(
    (r) =>
      (by === "all" || r.ta === by) &&
      (sheet === "all" || (sheet === "none" ? r.sheet === null : r.sheet === +sheet)) &&
      (!q.trim() || q.toLowerCase().split(/\s+/).every((w) => `${r.name} ${r.company} ${r.phone ?? ""}`.toLowerCase().includes(w))),
  );
  // Profiles per TA per sheet, and how many were added today (ignores the search).
  const counts = TAS.map((t) => {
    const sheets = [1, 2, 3, null]
      .map((s) => {
        const list = rows.filter((r) => r.ta === t && r.sheet === s);
        return { s, total: list.length, today: list.filter((r) => r.today).length };
      })
      .filter((c) => c.total);
    return { t, sheets, total: sheets.reduce((a, c) => a + c.total, 0), today: sheets.reduce((a, c) => a + c.today, 0) };
  }).filter((c) => c.total);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-[max(3.5rem,14px)] py-[max(2rem,14px)] max-md:pt-12 short:py-[max(1.4rem,12px)]">
      {!pos ? (
        <>
          <p className="mb-4 text-small text-ink-2">Pick a position to read every TA&apos;s Excel Tables and EOD emails on it. Read only — no access request needed.</p>
          <div className="grid auto-rows-max grid-cols-4 gap-[max(1.25rem,10px)] overflow-y-auto max-xl:grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {POSITIONS.map((p) => (
              <button key={p.id} type="button" data-card onClick={() => setPos(p)} className="flex flex-col rounded-lg bg-canvas p-[max(1.25rem,12px)] text-left hover:bg-surface hover:shadow-float">
                <span className="text-caption text-ink-3">{p.client}</span>
                <span className="mt-1 line-clamp-2 text-body font-medium text-ink">{p.title}</span>
                <span className="mt-3 text-caption text-ink-3">
                  {ROWS.filter((r) => r.pos === p.id).length} profiles · Excel Tables / EOD · Read only
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-x-[max(0.75rem,8px)] gap-y-2 max-md:flex-wrap">
            <BackButton onClick={() => setPos(null)} label="Back to all positions" />
            <h2 className="min-w-0 flex-1 truncate text-h3 font-medium text-ink" title={`${pos.title} · ${pos.client}`}>
              {pos.title} <span className="font-normal text-ink-3">· {pos.client}</span>
            </h2>
            <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-caption text-ink-2">Read only</span>
            <div role="tablist" aria-label="Show" className="flex h-[max(2.6rem,34px)] shrink-0 items-center gap-0.5 rounded-full bg-surface-2 p-1">
              {(["tables", "eod"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={
                    "flex h-full items-center whitespace-nowrap rounded-full px-[max(0.9rem,10px)] text-small transition-colors " +
                    (tab === t ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")
                  }
                >
                  {t === "tables" ? "Excel Tables" : "EOD"}
                </button>
              ))}
            </div>
          </div>
          <div ref={stage} className="mt-[max(1rem,10px)] flex min-h-0 flex-1 flex-col">
            {tab === "eod" ? (
              <ul className="flex flex-col gap-2 overflow-y-auto">
                {EODS.filter((e) => e.pos === pos.id).map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-surface px-4 py-3">
                    <span className="w-16 shrink-0 font-mono text-mono text-ink-3">{e.date}</span>
                    <span className="min-w-0 flex-1 truncate text-small text-ink" title={e.subject}>
                      {e.subject}
                    </span>
                    <span className="whitespace-nowrap text-caption text-ink-3">
                      {e.ta} · {e.cvs} CVs attached
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {/* One toolbar: who added, which sheet, a search, the count. */}
                <div className="flex flex-wrap items-center gap-2">
                  <PillMenu key={`by-${by}`} options={BY} initial={by} onChange={setBy} prefix="Added by:" mark="tick" pillClass={FIELD_PILL + " text-ink-2"} />
                  <PillMenu key={`sheet-${sheet}`} options={SHEETS} initial={sheet} onChange={setSheet} prefix="Sheet:" mark="tick" pillClass={FIELD_PILL + " text-ink-2"} />
                  <label className={FIELD_PILL + " min-w-[max(14rem,160px)] flex-1 text-ink-3 focus-within:ring-2 focus-within:ring-brand/20"}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-[max(1rem,13px)] shrink-0" aria-hidden="true">
                      <circle cx="11" cy="11" r="6.5" />
                      <path d="m16 16 4 4" />
                    </svg>
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Name, company or phone"
                      aria-label="Search by name, company or phone"
                      className="min-w-0 flex-1 bg-transparent text-small text-ink outline-none placeholder:text-ink-3"
                    />
                  </label>
                  <span className="shrink-0 whitespace-nowrap px-1 text-small text-ink-3">
                    {shown.length} {shown.length === 1 ? "person" : "people"}
                  </span>
                  {active > 0 && (
                    <button type="button" onClick={reset} className="shrink-0 rounded-full px-3 py-1.5 text-small font-medium text-brand-strong hover:bg-surface-2">
                      Reset{active > 1 ? ` (${active})` : ""}
                    </button>
                  )}
                </div>
                <div className="mt-[max(0.9rem,10px)] flex min-h-0 flex-1 gap-[max(1.25rem,10px)] max-lg:flex-col">
                  <section aria-label="L counts by TA" className="flex min-h-0 w-[max(17rem,220px)] shrink-0 flex-col rounded-md bg-surface-2 p-[max(1rem,10px)] max-lg:max-h-[38%] max-lg:w-auto">
                    <h3 className="px-2 text-small font-medium text-ink">L counts by TA</h3>
                    <p className="px-2 text-caption text-ink-3">Profiles per sheet, and added today. Press one to show it.</p>
                    <ul className="mt-3 flex min-h-0 flex-col gap-3 overflow-y-auto">
                      {counts.map((c) => (
                        <li key={c.t}>
                          <p className="flex items-baseline justify-between gap-2 px-2">
                            <span className="truncate text-small font-medium text-ink">{c.t}</span>
                            <span className="whitespace-nowrap text-caption text-ink-3">
                              {c.total} · {c.today} today
                            </span>
                          </p>
                          <div className="mt-1 flex flex-col">
                            {c.sheets.map((x) => {
                              const value = x.s === null ? "none" : String(x.s);
                              const on = by === c.t && sheet === value;
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() => (on ? (setBy("all"), setSheet("all")) : (setBy(c.t), setSheet(value)))}
                                  title={`${c.t} · ${sheetLabel(x.s)}: ${x.total} profiles, ${x.today} added today`}
                                  className={
                                    "grid grid-cols-[1fr_auto_max(4rem,52px)] items-center gap-3 rounded-sm px-2 py-1 text-left text-caption transition-colors " +
                                    (on ? "bg-brand-tint text-brand" : "text-ink-2 hover:bg-surface hover:text-ink")
                                  }
                                >
                                  <span className="truncate">{sheetLabel(x.s)}</span>
                                  <span className="tabular-nums">{x.total}</span>
                                  <span className={"text-right tabular-nums " + (on ? "" : "text-ink-3")}>{x.today ? `${x.today} today` : "—"}</span>
                                </button>
                              );
                            })}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border border-border bg-surface">
                    <table className="w-full min-w-[max(60rem,820px)] table-fixed border-separate border-spacing-0 text-left text-small">
                      <colgroup>
                        <col className="w-[30%]" />
                        <col className="w-[max(8rem,90px)]" />
                        <col className="w-[max(12rem,140px)]" />
                        <col className="w-[max(11rem,140px)]" />
                        <col className="w-[max(9.5rem,116px)]" />
                        <col />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className={TH + " pl-4"}>Profile</th>
                          <th className={TH}>TA</th>
                          <th className={TH}>Sheet</th>
                          <th className={TH}>Contact</th>
                          <th className={TH}>Progress</th>
                          <th className={TH}>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((r) => (
                          <tr key={r.id} className="transition-colors hover:bg-canvas">
                            <td className={TD + " pl-4"}>
                              <span className="block truncate font-medium text-ink" title={r.name}>
                                {r.name}
                              </span>
                              <span className="block truncate text-caption text-ink-3" title={`${r.title} · ${r.company}`}>
                                {r.title} · {r.company}
                              </span>
                            </td>
                            <td className={TD + " truncate text-ink-2"}>{r.ta}</td>
                            <td className={TD}>
                              <span className="flex items-center gap-1.5 whitespace-nowrap text-ink-2">
                                {r.sheet ? `L${r.sheet}` : <span className="text-ink-3">—</span>}
                                {r.addOn && <span className="rounded-full bg-violet-soft px-2 text-caption font-medium text-violet">Add-on</span>}
                                {r.eye && <span className="rounded-full bg-warn-soft px-2 text-caption font-medium text-warn">Eye-marked</span>}
                              </span>
                            </td>
                            <td className={TD + " whitespace-nowrap font-mono text-mono " + (r.phone ? "text-ink" : "text-ink-3")}>{r.phone ?? "—"}</td>
                            <td className={TD}>
                              <span className={"inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-medium " + INTEREST[r.interest]}>{r.interest}</span>
                            </td>
                            <td className={TD + " text-caption text-ink-2"}>
                              <span className="line-clamp-2" title={r.note}>
                                {r.note ?? ""}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!shown.length && <p className="p-8 text-center text-small text-ink-3">No rows match this selection.</p>}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
