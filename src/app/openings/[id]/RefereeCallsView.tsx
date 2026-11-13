"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { SEES_WHOLE_JOB } from "@/lib/user";
import { useWorkdayGate } from "@/lib/workday";
import { BackButton } from "./PipelineBoard";
import PillMenu, { type MenuOption } from "./PillMenu";
import WorkdayBlocked from "./WorkdayBlocked";
import { FIELD_PILL } from "./filters";

// Headhunting > Referee Calls: the day's calls to referees, typed like Excel (owner's
// design "Referee Calls", 13 Nov 2026). The old TA System's rules (excel-tables
// skill, flow 14; src/lib/refereeGrid.ts):
// - one grid per work day (Colombo) and per work location;
// - type anywhere, paste a block from Excel; the four columns and their limits are
//   Company 200, Referral 200, Contact number 100, Feedback 2000, 300 rows at most;
// - a TA writes only their own calls and only today's; past days are read only;
// - a TA Lead sees every TA's calls, with the TA column filled;
// - the day's calls go into tonight's End of day email by themselves.
// Sample data until the backend; a cell is saved when you leave it.

type Cells = [string, string, string, string];
type Call = { cells: Cells; ta: string };
const COLS = [
  { label: "Company", max: 200, width: "w-[22%]" },
  { label: "Referral", max: 200, width: "w-[19.5%]" },
  { label: "Contact number", max: 100, width: "w-[16%]" },
  { label: "Feedback", max: 2000, width: "" },
] as const;
const MAX_ROWS = 300;
const MIN_ROWS = 11;

const DAYS: MenuOption[] = [
  { value: "today", label: "Today · Tue 12 Nov" },
  { value: "mon", label: "Mon 11 Nov" },
  { value: "fri", label: "Fri 8 Nov" },
];
const LOCATIONS = ["Colombo", "Kandy"];

const c = (a: string, b = "", d = "", e = "", ta = "You"): Call => ({
  cells: [a, b, d, e],
  ta,
});
const START: Record<string, Call[]> = {
  "today|Colombo": [
    c(
      "Virtusa",
      "Kasun Perera — ex-manager",
      "077 412 9981",
      "Strong on cut-over planning; would rehire.",
    ),
    c(
      "IFS",
      "Nimali A. — peer",
      "071 220 6634",
      "Calm under pressure, owns the client.",
    ),
    c(
      "Hayleys",
      "Chamara W. — director",
      "076 888 1203",
      "Ran 9-plant ERP; left for growth.",
    ),
    c("Brandix"),
  ],
  "mon|Colombo": [
    c(
      "MAS Holdings",
      "Dilini R. — ex-manager",
      "077 300 1122",
      "Would hire again; strong on vendors.",
    ),
    c(
      "Dialog",
      "Ruwan K. — peer",
      "070 455 9031",
      "Not interested in giving a reference.",
    ),
  ],
};
/** A call is a row with somebody to call: a referee or a number. A company on its
 *  own (Brandix in the design) is a call still being written - not counted. */
const isCall = (x: Call) => !!(x.cells[1].trim() || x.cells[2].trim());

export default function RefereeCallsView() {
  const gate = useWorkdayGate();
  const [day, setDay] = useState("today");
  const [loc, setLoc] = useState("Colombo");
  const [grids, setGrids] = useState(START);
  const key = `${day}|${loc}`;
  const rows = grids[key] ?? [];
  const today = day === "today";
  // Only a TA writes, only their own rows, only today - and after Start workday.
  const canEdit = today && !SEES_WHOLE_JOB && !gate;
  const calls = rows.filter(isCall).length;
  // Always room to keep typing: the minimum, or one empty row past the last.
  const shownRows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, rows.length + 1));

  const [at, setAt] = useState<{ r: number; c: number }>({
    r: Math.min(3, rows.length),
    c: 1,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const grid = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const cell = (r: number, col: number) => rows[r]?.cells[col] ?? "";
  const write = (changes: { r: number; c: number; v: string }[]) =>
    setGrids((g) => {
      const next = [...(g[key] ?? [])];
      for (const { r, c: col, v } of changes) {
        if (r >= MAX_ROWS) continue;
        while (next.length <= r)
          next.push({ cells: ["", "", "", ""], ta: "You" });
        const cells = [...next[r].cells] as Cells;
        cells[col] = v.slice(0, COLS[col].max);
        next[r] = { ...next[r], cells };
      }
      // Trailing empty rows are not kept.
      while (next.length && !next[next.length - 1].cells.some((x) => x.trim()))
        next.pop();
      return { ...g, [key]: next };
    });

  const move = (dr: number, dc: number) =>
    setAt((p) => ({
      r: Math.max(0, Math.min(shownRows - 1, p.r + dr)),
      c: Math.max(0, Math.min(3, p.c + dc)),
    }));
  const startEdit = (seed?: string) => {
    if (!canEdit) return;
    setDraft(seed ?? cell(at.r, at.c));
    setEditing(true);
  };
  const commit = () => {
    if (!editing) return;
    if (draft !== cell(at.r, at.c)) write([{ r: at.r, c: at.c, v: draft }]);
    setEditing(false);
  };

  useEffect(() => {
    if (editing) input.current?.focus();
    else grid.current?.focus({ preventScroll: true });
  }, [editing]);
  // The cell in view as it moves.
  useEffect(() => {
    grid.current
      ?.querySelector(`[data-cell="${at.r}-${at.c}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [at]);

  const onGridKey = (e: KeyboardEvent) => {
    if (editing) return;
    const k = e.key;
    if (k === "ArrowDown") move(1, 0);
    else if (k === "ArrowUp") move(-1, 0);
    else if (k === "ArrowRight" || (k === "Tab" && !e.shiftKey)) move(0, 1);
    else if (k === "ArrowLeft" || (k === "Tab" && e.shiftKey)) move(0, -1);
    else if (k === "Enter" || k === "F2") startEdit();
    else if ((k === "Delete" || k === "Backspace") && canEdit)
      write([{ r: at.r, c: at.c, v: "" }]);
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)
      startEdit(k);
    else return;
    // Tab moves inside the grid; at its edge it leaves, as a page should.
    if (
      k === "Tab" &&
      ((at.c === 3 && !e.shiftKey) || (at.c === 0 && e.shiftKey))
    )
      return;
    e.preventDefault();
  };
  const onCellKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      move(1, 0);
    } else if (e.key === "Tab") {
      e.preventDefault();
      commit();
      move(0, e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
  };
  // A block from Excel fills across and down from the chosen cell.
  const onPaste = (e: ClipboardEvent) => {
    if (!canEdit) return;
    const text = e.clipboardData.getData("text/plain");
    if (editing && !/[\t\n]/.test(text.trim())) return; // one value: the box takes it
    e.preventDefault();
    const lines = text.replace(/\r/g, "").replace(/\n$/, "").split("\n");
    const changes = lines.flatMap((line, i) =>
      line
        .split("\t")
        .slice(0, 4 - at.c)
        .map((v, j) => ({ r: at.r + i, c: at.c + j, v: v.trim() })),
    );
    setEditing(false);
    write(changes);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-[max(2.3rem,14px)] pb-[max(1.4rem,12px)] pt-[max(2rem,48px)] max-md:pt-14">
      <div className="flex flex-wrap items-center gap-x-[max(0.9rem,8px)] gap-y-2">
        <BackButton />
        <PillMenu
          key={day}
          options={DAYS}
          initial={day}
          onChange={(d) => {
            commit();
            setDay(d);
            setAt({ r: 0, c: 0 });
          }}
          mark="tick"
          title="Work day"
          pillClass={FIELD_PILL + " font-medium"}
        />
        <div role="tablist" aria-label="Work location" className="flex gap-1">
          {LOCATIONS.map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={loc === l}
              onClick={() => {
                commit();
                setLoc(l);
                setAt({ r: 0, c: 0 });
              }}
              className={
                "rounded-full px-[max(1rem,12px)] py-[max(0.45rem,6px)] text-small transition-colors " +
                (loc === l
                  ? "bg-ink text-white"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink")
              }
            >
              {l}
            </button>
          ))}
        </div>
        <p className="ml-auto text-small text-ink-3 max-md:ml-0">
          {!today
            ? "A past day - read only"
            : SEES_WHOLE_JOB
              ? "Every TA's calls - each TA writes their own"
              : "Type anywhere or paste a block from Excel"}
        </p>
      </div>
      {gate && today && !SEES_WHOLE_JOB && (
        <WorkdayBlocked what="log referee calls" className="mt-3" />
      )}

      <div
        ref={grid}
        tabIndex={0}
        role="grid"
        aria-label={`Referee calls, ${loc}, ${DAYS.find((d) => d.value === day)?.label}`}
        aria-readonly={!canEdit}
        onKeyDown={onGridKey}
        onPaste={onPaste}
        className="mt-[max(1.4rem,12px)] min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-surface outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        <table className="w-full min-w-[52rem] table-fixed border-collapse text-left text-small">
          <thead className="sticky top-0 z-10 bg-canvas text-small font-medium text-ink-2">
            <tr>
              <th className="w-[max(3.75rem,40px)] border-b border-r border-border" />
              {COLS.map((col) => (
                <th
                  key={col.label}
                  className={
                    "border-b border-r border-border px-[max(0.9rem,10px)] py-[max(0.9rem,10px)] font-medium " +
                    col.width
                  }
                >
                  {col.label}
                </th>
              ))}
              <th className="w-[10.5%] border-b border-border px-[max(0.9rem,10px)] font-medium">
                TA
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: shownRows }, (_, r) => (
              <tr key={r} className="h-[max(3.125rem,40px)]">
                <td className="border-b border-r border-border bg-canvas text-center font-mono text-mono text-ink-3">
                  {r + 1}
                </td>
                {COLS.map((col, ci) => {
                  const on = at.r === r && at.c === ci;
                  return (
                    <td
                      key={col.label}
                      data-cell={`${r}-${ci}`}
                      role="gridcell"
                      aria-selected={on}
                      onMouseDown={(e) => {
                        if (editing && on) return;
                        e.preventDefault();
                        commit();
                        setAt({ r, c: ci });
                        grid.current?.focus({ preventScroll: true });
                      }}
                      onDoubleClick={() => startEdit()}
                      className={
                        "relative border-b border-r border-border px-[max(0.9rem,10px)] " +
                        (on
                          ? "outline outline-[1.5px] -outline-offset-1 outline-brand"
                          : "")
                      }
                    >
                      {on && editing ? (
                        <input
                          ref={input}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={onCellKey}
                          onBlur={commit}
                          maxLength={col.max}
                          aria-label={`${col.label}, row ${r + 1}`}
                          className="w-full bg-transparent text-small text-ink outline-none"
                        />
                      ) : (
                        <span
                          className="block truncate text-ink"
                          title={cell(r, ci) || undefined}
                        >
                          {cell(r, ci)}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="border-b border-border px-[max(0.9rem,10px)] text-ink-3">
                  {/* Filled when a lead sees every TA's calls. */}
                  {SEES_WHOLE_JOB && rows[r] && isCall(rows[r])
                    ? rows[r].ta
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-[max(1.1rem,10px)] flex flex-wrap items-center gap-3 pl-[max(3.75rem,0px)] max-md:pl-0">
        <span className="rounded-full bg-brand-soft px-[max(0.6rem,8px)] py-0.5 text-caption font-medium text-brand">
          {calls} {calls === 1 ? "call" : "calls"}{" "}
          {today ? "today" : "that day"}
        </span>
        <span className="text-small text-ink-3">
          {today
            ? "Goes into tonight’s EOD automatically"
            : "Went into that day’s EOD"}
        </span>
      </div>
    </div>
  );
}
