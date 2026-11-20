"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { useMe } from "@/lib/role";
import { jobFromAddress, useLive } from "@/lib/backend";
import { cellsOf, changesOf, dayLabel, readReferees, sendReferees, withIds, type LiveReferees } from "./refereeLive";
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
// Signed in, the sheet is the old page's and saves through its own Save a moment
// after typing stops (refereeLive.ts, D8c); signed out, the sample below.

type Cells = [string, string, string, string];
type Result = "positive" | "negative";
/** `result` is set only when a person flips it; otherwise it is read off the feedback. */
type Call = { cells: Cells; ta: string; result?: Result; id?: string; mine?: boolean };
const COLS = [
  { label: "Company", max: 200, width: "w-[22%]" },
  { label: "Referral", max: 200, width: "w-[19.5%]" },
  { label: "Contact number", max: 100, width: "w-[16%]" },
  { label: "Feedback", max: 2000, width: "" },
] as const;
const MAX_ROWS = 300;
const MIN_ROWS = 11;

const SAMPLE_DAYS: MenuOption[] = [
  { value: "today", label: "Today · Tue 12 Nov" },
  { value: "mon", label: "Mon 11 Nov" },
  { value: "fri", label: "Fri 8 Nov" },
];
const SAMPLE_LOCATIONS = [{ id: "Colombo", name: "Colombo" }, { id: "Kandy", name: "Kandy" }];

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

/** The old system's sorting of a call (src/lib/refereeCalls.ts classifyFeedback):
 *  pessimistic - until somebody has offered or given a contact, it has not worked. */
function classify(feedback: string): Result {
  const t = feedback.trim().toLowerCase();
  if (
    /can(?:not|'t)\s+give\b[\s\S]*\b(?:will\s+pass|will\s+call\s+back)\b/.test(
      t,
    )
  )
    return "positive";
  const negative = [
    /\bno\s+contacts?\b/,
    /\bno\s+(?:phone\s+)?number\b/,
    /\bno\s+answer\b/,
    /\bnot\s+respond(?:ing|ed)?\b/,
    /\bnot\s+answer(?:ing|ed)?\b/,
    /\bwrong\s+number\b/,
    /\b(?:overseas|abroad)\b/,
    /\bnot\s+available\b/,
    /\bnot\s+interested\b/,
    /\bno\s+interest\b/,
    /\bcan(?:not|'t)\s+give\b/,
    /\b(?:refused|declined)\b/,
    /\bswitched\s+off\b/,
    /\bnot\s+reachable\b/,
  ];
  if (negative.some((x) => x.test(t))) return "negative";
  const positive = [
    /\b(?:have|has)\s+(?:got\s+)?a\s+contact\b/,
    /\bwill\s+share\b/,
    /\bwill\s+send\b/,
    /\bwill\b[\s\S]*\bwhats\s*app\b/,
    /\bwill\s+call\s+back\b/,
    /\bwill\s+pass\b/,
    /\bnumber\s+(?:received|given|shared)\b/,
    /\binterested\b/,
  ];
  return positive.some((x) => x.test(t)) ? "positive" : "negative";
}
const resultOf = (x: Call): Result => x.result ?? classify(x.cells[3]);
const RESULT_LABEL: Record<Result, string> = {
  positive: "Positive",
  negative: "Not successful",
};

export default function RefereeCallsView() {
  const gate = useWorkdayGate();
  const me = useMe();
  const live = useLive();
  const [job] = useState(jobFromAddress);
  const signedIn = live && !!job;
  // Signed in: the TA System's sheet for the chosen day and location.
  const [data, setData] = useState<LiveReferees | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  // TA Support writes their own calls like a TA and sees every TA's rows like a lead.
  const SEES_WHOLE_JOB = data ? data.showTa : me.lead || me.role === "TA Support";
  const DAYS: MenuOption[] = data ? data.days.map((d) => ({ value: d, label: dayLabel(d, data.today) })) : SAMPLE_DAYS;
  const LOCATIONS = data ? data.locations : SAMPLE_LOCATIONS;
  const [day, setDay] = useState(signedIn ? "" : "today");
  const [loc, setLoc] = useState(signedIn ? "" : "Colombo");
  const [grids, setGrids] = useState<Record<string, Call[]>>(signedIn ? {} : START);
  const key = `${day}|${loc}`;
  const rows = grids[key] ?? [];
  const today = data ? day === data.today : day === "today";
  // Only a TA writes, only their own rows, only today - and after Start workday.
  // Signed in, the TA System says whether this sheet may be changed (old page rule).
  const canEdit = (data ? data.canEdit : today && !me.lead) && !gate;

  // When the last change was kept (shown as "Saved h:mm").
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // What the TA System last said it holds of this person's calls, for the next save.
  const saved = useRef(new Map<string, Cells>());
  const gridsNow = useRef(grids);
  useEffect(() => {
    gridsNow.current = grids;
  }, [grids]);
  const load = async (d: string, l: string) => {
    if (!job) return;
    const got = await readReferees(job, d, l);
    if (!got.ok) return setFault(got.message);
    const v = got.data;
    const k = `${v.day}|${v.workLocationId ?? ""}`;
    saved.current = new Map(v.calls.filter((x) => x.addedBy === v.me).map((x) => [x.id, cellsOf(x)]));
    setData(v);
    setFault(null);
    setDay(v.day);
    setLoc(v.workLocationId ?? "");
    setGrids({
      [k]: v.calls.map((x) => ({ id: x.id, mine: x.addedBy === v.me, cells: cellsOf(x), ta: x.addedBy === v.me ? "You" : x.by, result: x.result ?? undefined })),
    });
  };
  useEffect(() => {
    if (!signedIn) return;
    const t = setTimeout(() => void load("", ""), 0);
    return () => clearTimeout(t);
    // The first read only; later reads follow a day or location choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);
  // A moment after typing stops, today's changes go in one old Save.
  const saving = useRef(false);
  const save = async () => {
    if (!job || saving.current) return;
    const ch = changesOf(saved.current, gridsNow.current[key] ?? []);
    if (!ch.any) return;
    saving.current = true;
    const res = await sendReferees({
      do: "save", openingId: job, workLocationId: loc, day,
      changes: JSON.stringify({ add: ch.add, update: ch.update, remove: ch.remove }),
    });
    saving.current = false;
    if (!res.ok || !res.calls) return setFault(res.message);
    const before = new Set(saved.current.keys());
    saved.current = new Map(res.calls.map((x) => [x.id, cellsOf(x)]));
    setGrids((g) => ({ ...g, [key]: withIds(g[key] ?? [], res.calls!, before) }));
    setFault(null);
    setSavedAt(new Date());
  };
  useEffect(() => {
    if (!signedIn || !canEdit) return;
    const t = setTimeout(() => void save(), 1200);
    return () => clearTimeout(t);
    // Saves follow what is on the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grids, key, signedIn, canEdit]);
  const calls = rows.filter(isCall).length;
  // Always room to keep typing: the minimum, or one empty row past the last.
  const shownRows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, rows.length + 1));

  const [at, setAt] = useState<{ r: number; c: number }>({
    r: Math.min(3, rows.length),
    c: 1,
  });
  // What has been typed into the chosen cell since it was chosen; null = untouched.
  const [typed, setTyped] = useState<string | null>(null);
  // "nav": arrows move between cells and typing replaces the cell, as in Excel.
  // "edit" (F2, Enter on a cell, a double-click, a click in the chosen cell):
  // arrows move the caret inside the text.
  const [mode, setMode] = useState<"nav" | "edit">("nav");
  // The grid takes the keyboard only once a person has clicked or typed in it, so
  // opening the screen does not take the arrows from the bottom bar.
  const [active, setActive] = useState(false);
  // The row just deleted, with where it was, for Undo.
  const [removed, setRemoved] = useState<{
    key: string;
    at: number;
    row: Call;
  } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const cell = (r: number, col: number) => rows[r]?.cells[col] ?? "";
  const write = (changes: { r: number; c: number; v: string }[]) => {
    if (!signedIn) setSavedAt(new Date());
    setGrids((g) => {
      const next = [...(g[key] ?? [])];
      for (const { r, c: col, v } of changes) {
        if (r >= MAX_ROWS || next[r]?.mine === false) continue;
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
  };
  const setRows = (f: (rows: Call[]) => Call[]) => {
    if (!signedIn) setSavedAt(new Date());
    setGrids((g) => ({ ...g, [key]: f(g[key] ?? []) }));
  };
  const deleteRow = (r: number) => {
    const row = rows[r];
    if (!row || row.mine === false) return;
    setTyped(null);
    setRows((all) => all.filter((_, i) => i !== r));
    setRemoved({ key, at: r, row });
  };
  const undoDelete = () => {
    if (!removed) return;
    const { key: k, at: i, row } = removed;
    setGrids((g) => {
      const next = [...(g[k] ?? [])];
      // Saved again as a new call: the TA System already let the old one go.
      next.splice(Math.min(i, next.length), 0, signedIn ? { ...row, id: undefined } : row);
      return { ...g, [k]: next };
    });
    setRemoved(null);
  };
  // A person's own sort of the call, over the one read off the feedback.
  const flip = (r: number) => {
    const x = rows[r];
    if (signedIn && x) {
      if (!x.id || !job) return setFault("This call is still saving - try again in a moment.");
      const value = resultOf(x) === "positive" ? "negative" : "positive";
      void sendReferees({ do: "result", openingId: job, callId: x.id, field: "result", value }).then((res) => {
        if (!res.ok) return setFault(res.message);
        setFault(null);
        setGrids((g) => ({ ...g, [key]: (g[key] ?? []).map((y) => (y.id === x.id ? { ...y, result: value } : y)) }));
      });
      return;
    }
    setRows((all) =>
      all.map((x, i) =>
        i === r
          ? {
              ...x,
              result: resultOf(x) === "positive" ? "negative" : "positive",
            }
          : x,
      ),
    );
  };
  // The Undo is offered for a short while, as a toast would be.
  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => setRemoved(null), 15000);
    return () => clearTimeout(t);
  }, [removed]);

  const commit = () => {
    if (typed !== null && typed !== cell(at.r, at.c))
      write([{ r: at.r, c: at.c, v: typed }]);
    setTyped(null);
    setMode("nav");
  };
  const go = (r: number, c: number) => {
    commit();
    setAt({
      r: Math.max(0, Math.min(shownRows - 1, r)),
      c: Math.max(0, Math.min(3, c)),
    });
  };
  const move = (dr: number, dc: number) => go(at.r + dr, at.c + dc);

  // The chosen cell: in view, and (once the grid is in use) holding the keyboard
  // with its text selected, so the next key replaces it.
  useEffect(() => {
    const td = grid.current?.querySelector(`[data-cell="${at.r}-${at.c}"]`);
    td?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (!active) return;
    if (input.current) {
      input.current.focus({ preventScroll: true });
      input.current.select();
    } else grid.current?.focus({ preventScroll: true });
  }, [at, active, key]);

  const onCellKey = (
    e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const k = e.key;
    const caret = mode === "edit";
    // Enter keeps and moves down; Shift+Enter is a new line in a long Feedback.
    if (k === "Enter" && e.shiftKey && at.c === 3) return;
    if (k === "Enter") move(1, 0);
    else if (k === "Tab") {
      // At the grid's edge Tab leaves, as a page should.
      if ((at.c === 3 && !e.shiftKey) || (at.c === 0 && e.shiftKey))
        return commit();
      move(0, e.shiftKey ? -1 : 1);
    } else if (k === "Escape") {
      setTyped(null);
      setMode("nav");
      requestAnimationFrame(() => input.current?.select());
    } else if (k === "ArrowDown" && !caret) move(1, 0);
    else if (k === "ArrowUp" && !caret) move(-1, 0);
    else if ((k === "ArrowDown" || k === "ArrowUp") && caret && at.c !== 3)
      move(k === "ArrowDown" ? 1 : -1, 0);
    else if (k === "ArrowRight" && !caret) move(0, 1);
    else if (k === "ArrowLeft" && !caret) move(0, -1);
    else if (k === "F2") {
      setMode("edit");
      const t = e.currentTarget;
      t.setSelectionRange(t.value.length, t.value.length);
    } else return;
    e.preventDefault();
  };
  // Read only (a past day, a lead, before Start workday): the arrows still move.
  const onGridKey = (e: KeyboardEvent) => {
    if (canEdit) return;
    const k = e.key;
    if (k === "ArrowDown") move(1, 0);
    else if (k === "ArrowUp") move(-1, 0);
    else if (k === "ArrowRight") move(0, 1);
    else if (k === "ArrowLeft") move(0, -1);
    else return;
    e.preventDefault();
  };
  // A block from Excel fills across and down from the chosen cell; one value is
  // typed into the cell like any other text.
  const onPaste = (
    e: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (!canEdit) return;
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").replace(/\n$/, "").split("\n");
    write(
      lines.flatMap((line, i) =>
        line
          .split("\t")
          .slice(0, 4 - at.c)
          .map((v, j) => ({ r: at.r + i, c: at.c + j, v: v.trim() })),
      ),
    );
    setTyped(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-[max(1.5rem,14px)] pb-[max(1.4rem,12px)] pt-[max(1.4rem,14px)] max-md:pt-11">
      <div className="flex flex-wrap items-center gap-x-[max(0.9rem,8px)] gap-y-2">
        <BackButton />
        <PillMenu
          key={day}
          options={DAYS}
          initial={day}
          onChange={(d) => {
            commit();
            setDay(d);
            if (signedIn) void load(d, loc);
            setAt({ r: 0, c: 0 });
            setActive(false);
          }}
          mark="tick"
          title="Work day"
          pillClass={FIELD_PILL + " font-medium"}
        />
        <div role="tablist" aria-label="Work location" className="flex gap-1">
          {LOCATIONS.map(({ id: l, name }) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={loc === l}
              onClick={() => {
                commit();
                setLoc(l);
                if (signedIn) void load(day, l);
                setAt({ r: 0, c: 0 });
                setActive(false);
              }}
              className={
                "rounded-full px-[max(1rem,12px)] py-[max(0.45rem,6px)] text-small transition-colors " +
                (loc === l
                  ? "bg-ink text-white"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink")
              }
            >
              {name}
            </button>
          ))}
        </div>
        <p className="ml-auto text-small text-ink-3 max-md:ml-0">
          {!today
            ? "A past day - read only"
            : SEES_WHOLE_JOB
              ? "Every TA's calls - each TA writes their own"
              : "Type anywhere or paste a block from Excel · Shift+Enter for a new line in Feedback"}
        </p>
      </div>
      {gate && today && !SEES_WHOLE_JOB && (
        <WorkdayBlocked what="log referee calls" className="mt-3" />
      )}

      <div
        ref={grid}
        tabIndex={0}
        role="grid"
        aria-label={`Referee calls, ${LOCATIONS.find((x) => x.id === loc)?.name ?? ""}, ${DAYS.find((d) => d.value === day)?.label}`}
        aria-readonly={!canEdit}
        onKeyDown={onGridKey}
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
            {!today && !rows.some(isCall) && (
              <tr>
                <td
                  colSpan={COLS.length + 2}
                  className="px-4 py-10 text-center text-small text-ink-3"
                >
                  No referee calls were logged for this day
                </td>
              </tr>
            )}
            {(today || rows.some(isCall)) &&
              Array.from({ length: shownRows }, (_, r) => (
                <tr key={r} className="h-[max(3.125rem,40px)]">
                  <td className="group/num border-b border-r border-border bg-canvas text-center font-mono text-mono text-ink-3">
                    {canEdit && rows[r]?.cells.some((x) => x.trim()) ? (
                      <>
                        <span className="group-hover/num:hidden group-focus-within/num:hidden">
                          {r + 1}
                        </span>
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => deleteRow(r)}
                          aria-label={`Delete row ${r + 1}`}
                          title="Delete this row"
                          className="hidden w-full items-center justify-center text-ink-3 hover:text-danger group-hover/num:flex group-focus-within/num:flex focus-visible:flex"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="size-[max(1rem,13px)]"
                            aria-hidden="true"
                          >
                            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      r + 1
                    )}
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
                          setActive(true);
                          // A click in the chosen cell places the caret there.
                          if (on && canEdit) return setMode("edit");
                          e.preventDefault();
                          go(r, ci);
                        }}
                        onDoubleClick={() => setMode("edit")}
                        className={
                          "relative border-b border-r border-border px-[max(0.9rem,10px)] " +
                          (on
                            ? "outline outline-[1.5px] -outline-offset-1 outline-brand"
                            : "")
                        }
                      >
                        {on && canEdit && ci === 3 ? (
                          // Feedback runs to 2,000 characters: the box opens over the
                          // rows below and grows with the text, so all of it can be read.
                          <textarea
                            ref={input}
                            value={typed ?? cell(r, ci)}
                            onChange={(e) => setTyped(e.target.value)}
                            onKeyDown={onCellKey}
                            onPaste={onPaste}
                            onBlur={commit}
                            maxLength={col.max}
                            rows={Math.min(
                              8,
                              Math.max(
                                1,
                                Math.ceil((typed ?? cell(r, ci)).length / 55),
                              ),
                            )}
                            aria-label={`${col.label}, row ${r + 1}`}
                            className="absolute inset-x-0 top-0 z-20 min-h-full resize-none rounded-xs border-[1.5px] border-brand bg-surface px-[max(0.9rem,10px)] py-[max(0.85rem,9px)] text-small text-ink shadow-float outline-none"
                          />
                        ) : on && canEdit ? (
                          <input
                            ref={input}
                            value={typed ?? cell(r, ci)}
                            onChange={(e) => setTyped(e.target.value)}
                            onKeyDown={onCellKey}
                            onPaste={onPaste}
                            onBlur={commit}
                            maxLength={col.max}
                            aria-label={`${col.label}, row ${r + 1}`}
                            className="w-full bg-transparent text-small text-ink outline-none"
                          />
                        ) : (
                          <span className="flex items-center gap-2">
                            <span
                              className="block min-w-0 flex-1 truncate text-ink"
                              title={cell(r, ci) || undefined}
                            >
                              {cell(r, ci)}
                            </span>
                            {/* Feedback: how the call went, as the EOD email sorts it. */}
                            {ci === 3 && rows[r] && isCall(rows[r]) && (
                              <button
                                type="button"
                                disabled={!canEdit}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={() => flip(r)}
                                title={
                                  canEdit
                                    ? `${rows[r].result ? "Set by you" : "Read from the feedback"} - click to change`
                                    : undefined
                                }
                                className={
                                  "shrink-0 rounded-full px-2 py-0.5 text-caption font-medium transition-colors " +
                                  (resultOf(rows[r]) === "positive"
                                    ? "bg-success-soft text-success"
                                    : "bg-surface-2 text-ink-2") +
                                  (canEdit
                                    ? " hover:ring-1 hover:ring-border-strong"
                                    : "")
                                }
                              >
                                {RESULT_LABEL[resultOf(rows[r])]}
                              </button>
                            )}
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
          {calls > 0 &&
            ` · ${rows.filter((x) => isCall(x) && resultOf(x) === "positive").length} positive`}
        </span>
        {fault ? (
          <span role="status" className="ml-auto text-small text-danger max-md:ml-0">
            {fault}
          </span>
        ) : removed?.key === key ? (
          <span
            role="status"
            className="ml-auto flex items-center gap-2 text-small text-ink-2 max-md:ml-0"
          >
            Row {removed.at + 1} deleted.
            <button
              type="button"
              onClick={undoDelete}
              className="font-medium text-brand hover:underline"
            >
              Undo
            </button>
          </span>
        ) : (
          canEdit &&
          savedAt && (
            <span
              role="status"
              className="ml-auto text-small text-ink-3 max-md:ml-0"
            >
              Saved{" "}
              {savedAt.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )
        )}
      </div>
    </div>
  );
}
