"use client";

import { useMemo, useRef, useState } from "react";
import { useSwap } from "@/lib/gsap";

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

const FIELD = "h-[max(2.5rem,32px)] rounded-full bg-surface-2 px-4 text-small text-ink outline-none focus:ring-2 focus:ring-brand/20";
const INTEREST = { "To approach": "bg-surface-2 text-ink-2", Interested: "bg-brand-soft text-brand", "Not interested": "bg-danger-soft text-danger" } as const;

export default function SupportTables() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [tab, setTab] = useState<"tables" | "eod">("tables");
  const [by, setBy] = useState("all");
  const [sheet, setSheet] = useState<string>("all");
  const [q, setQ] = useState("");
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
  const counts = TAS.flatMap((t) =>
    [1, 2, 3, null].map((s) => {
      const list = rows.filter((r) => r.ta === t && r.sheet === s);
      return { t, s, total: list.length, today: list.filter((r) => r.today).length };
    }),
  ).filter((c) => c.total);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-[max(3.5rem,14px)] py-[max(2rem,14px)] max-md:pt-12">
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" onClick={() => setPos(null)} className="text-small text-ink-3 hover:text-ink">
              ← All positions
            </button>
            <h2 className="min-w-0 flex-1 truncate text-h3 font-medium text-ink">
              {pos.title} <span className="text-ink-3">· {pos.client} · Read only</span>
            </h2>
            <div className="flex rounded-full bg-surface-2 p-1">
              {(["tables", "eod"] as const).map((t) => (
                <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={"rounded-full px-4 py-1.5 text-small " + (tab === t ? "bg-surface font-medium text-ink shadow-card" : "text-ink-3 hover:text-ink")}>
                  {t === "tables" ? "Excel Tables" : "EOD"}
                </button>
              ))}
            </div>
          </div>
          <div ref={stage} className="mt-4 flex min-h-0 flex-1 flex-col">
            {tab === "eod" ? (
              <ul className="flex flex-col gap-2 overflow-y-auto">
                {EODS.filter((e) => e.pos === pos.id).map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-canvas px-4 py-3">
                    <span className="w-16 shrink-0 font-mono text-caption text-ink-3">{e.date}</span>
                    <span className="min-w-0 flex-1 truncate text-small text-ink">{e.subject}</span>
                    <span className="text-caption text-ink-3">
                      {e.ta} · {e.cvs} CVs attached
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <select value={by} onChange={(e) => setBy(e.target.value)} aria-label="Added by" className={FIELD}>
                    <option value="all">Added by everyone</option>
                    {TAS.map((t) => (
                      <option key={t} value={t}>
                        Added by {t}
                      </option>
                    ))}
                  </select>
                  <select value={sheet} onChange={(e) => setSheet(e.target.value)} aria-label="Sheet" className={FIELD}>
                    <option value="all">All sheets</option>
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        L{n}
                      </option>
                    ))}
                    <option value="none">Not in a sheet</option>
                  </select>
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, company or phone" aria-label="Search" className={FIELD + " min-w-48 flex-1"} />
                  <span className="self-center text-small text-ink-3">{shown.length} rows</span>
                </div>
                <div className="mt-4 grid min-h-0 flex-1 grid-cols-[minmax(14rem,18rem)_1fr] gap-[max(1.25rem,10px)] max-lg:grid-cols-1 max-lg:overflow-y-auto">
                  <section className="min-h-0 overflow-y-auto rounded-lg bg-canvas p-4">
                    <h3 className="mb-2 text-small font-medium text-ink">L counts by TA</h3>
                    <table className="w-full text-caption">
                      <thead className="text-ink-3">
                        <tr>
                          <th className="py-1 text-left font-normal">TA</th>
                          <th className="text-left font-normal">Sheet</th>
                          <th className="text-right font-normal">Profiles</th>
                          <th className="text-right font-normal">Today</th>
                        </tr>
                      </thead>
                      <tbody>
                        {counts.map((c) => (
                          <tr key={c.t + c.s} className="border-t border-border">
                            <td className="py-1.5 text-ink">{c.t}</td>
                            <td>
                              <button type="button" onClick={() => (setBy(c.t), setSheet(c.s === null ? "none" : String(c.s)))} className="text-brand hover:underline">
                                {c.s === null ? "None" : `L${c.s}`}
                              </button>
                            </td>
                            <td className="text-right text-ink">{c.total}</td>
                            <td className="text-right text-ink-2">{c.today}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                  <div className="min-h-0 overflow-auto rounded-lg border border-border">
                    <table className="w-full min-w-[46rem] text-small">
                      <thead className="sticky top-0 bg-surface text-left text-caption text-ink-3">
                        <tr>
                          {["Profile", "TA", "Sheet", "Contact", "Progress", "Notes"].map((h) => (
                            <th key={h} className="px-3 py-2 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((r) => (
                          <tr key={r.id} className="border-t border-border align-top">
                            <td className="px-3 py-2">
                              <span className="block font-medium text-ink">{r.name}</span>
                              <span className="block text-caption text-ink-3">
                                {r.title} · {r.company}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-ink-2">{r.ta}</td>
                            <td className="px-3 py-2 text-ink-2">
                              {r.sheet ? `L${r.sheet}` : "—"}
                              {r.addOn && <span className="ml-1.5 rounded-xs bg-info-soft px-1.5 text-caption text-info">Add-on</span>}
                              {r.eye && <span className="ml-1.5 rounded-xs bg-violet-soft px-1.5 text-caption text-violet">Eye-marked</span>}
                            </td>
                            <td className="px-3 py-2 font-mono text-caption text-ink-2">{r.phone ?? "—"}</td>
                            <td className="px-3 py-2">
                              <span className={"rounded-full px-2 py-0.5 text-caption " + INTEREST[r.interest]}>{r.interest}</span>
                            </td>
                            <td className="px-3 py-2 text-caption text-ink-2">{r.note ?? ""}</td>
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
