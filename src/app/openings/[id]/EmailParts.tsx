"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { gsap, useGSAP, PIN_IN } from "@/lib/gsap";

// The parts of a Midday / End of day email that hold the TA's work: the candidate
// table (Table 1), today's effort (Table 2) and the referee calls - each as the TA
// System sends it (eod-email skill, src/lib/eod-format.ts), drawn on the design
// guidelines (DESIGN.md). Placeholder data; nothing is saved or sent.

/* ---------- Table 1: the candidates for Director Review ---------- */

export type Cand = {
  id: string;
  name: string;
  age: string;
  notice: string;
  notes: string;
  company: string;
  designation: string;
  current: string;
  expected: string;
  /** The prepared CV: ready, being made, or not made yet. */
  cv: "ready" | "making" | "missing";
  /** Values for columns the TA added. */
  extra: Record<string, string>;
  /** Fields the TA changed here; they are saved to the candidate after the email goes. */
  edited: string[];
};

type Field = "name" | "age" | "notice" | "notes" | "company" | "designation" | "current" | "expected";

// The TA System's columns, in its order (SHORTLIST_COLUMNS). They always go in the
// email; the TA may add more after them.
const COLUMNS: { key: Field; label: string; width: string; required?: boolean; empty?: string }[] = [
  { key: "name", label: "Name", width: "min-w-[max(11rem,130px)]", required: true },
  { key: "age", label: "Age", width: "min-w-[max(3.5rem,44px)]" },
  { key: "notice", label: "Notice", width: "min-w-[max(6rem,72px)]", empty: "Immediate" },
  { key: "notes", label: "Notes", width: "min-w-[max(16rem,190px)]" },
  { key: "company", label: "Current company", width: "min-w-[max(9rem,110px)]", required: true },
  { key: "designation", label: "Current designation", width: "min-w-[max(10rem,120px)]", required: true },
  { key: "current", label: "Current remuneration", width: "min-w-[max(9rem,110px)]", empty: "Not disclosed" },
  { key: "expected", label: "Expected remuneration", width: "min-w-[max(9rem,110px)]", empty: "Open to discuss" },
];

/** What a cell shows: the TA System's words for an empty notice or salary. */
const shown = (c: Cand, key: Field) => c[key].trim() || COLUMNS.find((x) => x.key === key)?.empty || "";

export function CandidateTable({
  rows,
  cols,
  readOnly,
  noCvs,
  onEdit,
  onAddCol,
  onDropCol,
  onMakeCv,
  onRefused,
}: {
  rows: Cand[];
  cols: string[];
  readOnly: boolean;
  /** A midday email going without CVs: the Prepared CV column says so. */
  noCvs: boolean;
  onEdit: (id: string, key: string, value: string, extra: boolean) => void;
  onAddCol: (name: string) => void;
  onDropCol: (name: string) => void;
  onMakeCv: (id: string) => void;
  onRefused: (why: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="mt-[max(0.7rem,6px)] overflow-x-auto rounded-md border border-border [scrollbar-width:thin]">
      <table className="w-full border-separate border-spacing-0 text-left text-small">
        <thead>
          <tr className="text-caption font-medium uppercase text-ink-3 [&>th]:border-b [&>th]:border-border [&>th]:bg-surface-2 [&>th]:px-[max(0.8rem,8px)] [&>th]:py-[max(0.55rem,6px)] [&>th]:align-bottom [&>th]:font-medium">
            <th className="sticky left-0 z-10 w-[max(2.5rem,32px)]">No</th>
            {COLUMNS.map((c) => (
              <th key={c.key} className={c.key === "name" ? "sticky left-[max(2.5rem,32px)] z-10 " + c.width : c.width}>
                {c.label}
              </th>
            ))}
            {cols.map((name) => (
              <th key={name} className="group min-w-[max(8rem,100px)]">
                <span className="flex items-center gap-1">
                  {name}
                  {!readOnly && (
                    <button type="button" aria-label={`Take the ${name} column out`} onClick={() => onDropCol(name)} className="text-ink-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus-visible:opacity-100">
                      <Cross />
                    </button>
                  )}
                </span>
              </th>
            ))}
            {!readOnly && (
              <th className="w-[max(2.5rem,32px)]">
                {adding ? (
                  <NewColumn
                    onDone={(name) => {
                      setAdding(false);
                      const n = name.trim();
                      if (!n) return;
                      if ([...COLUMNS.map((c) => c.label.toLowerCase()), ...cols.map((c) => c.toLowerCase())].includes(n.toLowerCase())) onRefused(`There is already a "${n}" column.`);
                      else onAddCol(n);
                    }}
                  />
                ) : (
                  <button type="button" onClick={() => setAdding(true)} aria-label="Add a column" title="Add a column" className="flex size-[max(1.6rem,22px)] items-center justify-center rounded-full text-ink-2 hover:bg-surface-3 hover:text-ink">
                    <Plus />
                  </button>
                )}
              </th>
            )}
            <th className="min-w-[max(7rem,90px)]">Prepared CV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={c.id} className="align-top [&>td]:border-b [&>td]:border-border [&>td]:px-[max(0.8rem,8px)] [&>td]:py-[max(0.7rem,7px)] last:[&>td]:border-b-0">
              <td className="sticky left-0 z-10 bg-surface text-ink-3">{i + 1}</td>
              {COLUMNS.map((col) => (
                <td key={col.key} className={col.key === "name" ? "sticky left-[max(2.5rem,32px)] z-10 bg-surface font-medium text-ink" : "text-ink-2"}>
                  <Cell
                    value={c[col.key]}
                    display={col.key === "notes" ? <Notes text={c.notes} /> : shown(c, col.key)}
                    placeholder={col.empty}
                    multiline={col.key === "notes"}
                    edited={c.edited.includes(col.key)}
                    readOnly={readOnly}
                    onSave={(v) => {
                      if (col.required && !v.trim()) return onRefused(`${col.label} is needed in the email.`);
                      onEdit(c.id, col.key, v, false);
                    }}
                  />
                </td>
              ))}
              {cols.map((name) => (
                <td key={name} className="text-ink-2">
                  <Cell value={c.extra[name] ?? ""} display={c.extra[name] ?? ""} readOnly={readOnly} edited={false} onSave={(v) => onEdit(c.id, name, v, true)} />
                </td>
              ))}
              {!readOnly && <td />}
              <td>
                <CvState cv={c.cv} noCvs={noCvs} readOnly={readOnly} onMake={() => onMakeCv(c.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CvState({ cv, noCvs, readOnly, onMake }: { cv: Cand["cv"]; noCvs: boolean; readOnly: boolean; onMake: () => void }) {
  if (noCvs) return <span className="text-ink-3">Not attached</span>;
  if (cv === "ready")
    return (
      <span className={CHIP + " bg-success-soft text-success"}>
        <FileIcon /> Attached
      </span>
    );
  if (cv === "making")
    return (
      <span className={CHIP + " bg-surface-2 text-ink-2"}>
        <span className="size-[0.9em] animate-spin rounded-full border-2 border-ink-3 border-t-transparent" /> Making
      </span>
    );
  if (readOnly) return <span className="text-ink-3">Not attached</span>;
  // ponytail: "Make it" stands in for the prepared-CV box; with the backend it
  // builds the PDF from the candidate's record (what the email says, the PDF says).
  return (
    <button type="button" onClick={onMake} className={CHIP + " bg-warn-soft text-warn hover:bg-warn/20"}>
      <PenIcon /> Make it
    </button>
  );
}

/** A cell that reads as the email's own text and edits in place: click, type,
 *  Enter (or click away) keeps it, Escape puts it back. A changed cell carries a
 *  small dot: it is saved to the candidate after the email goes. */
function Cell({
  value,
  display,
  placeholder,
  multiline,
  edited,
  readOnly,
  onSave,
}: {
  value: string;
  display: ReactNode;
  placeholder?: string;
  multiline?: boolean;
  edited: boolean;
  readOnly: boolean;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const box = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  useEffect(() => {
    if (editing) box.current?.focus();
  }, [editing]);
  const keep = () => {
    setEditing(false);
    if (text !== value) onSave(text);
  };
  if (readOnly) return <span className="block whitespace-pre-line">{display}</span>;
  if (editing) {
    const common = {
      value: text,
      placeholder,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
          setText(value);
          setEditing(false);
        }
        if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          keep();
        }
      },
      className: "block w-full rounded-xs bg-surface px-1 py-0.5 text-ink outline-none ring-2 ring-brand/30",
    };
    return multiline ? (
      <div>
        <NoteTools box={box} onChange={setText} />
        <textarea ref={box} rows={4} {...common} onChange={(e) => setText(e.target.value)} onBlur={keep} className={common.className + " resize-y font-sans"} />
        <p className="mt-1 text-caption text-ink-3">Ctrl+Enter keeps it</p>
      </div>
    ) : (
      <input ref={box} {...common} onChange={(e) => setText(e.target.value)} onBlur={keep} />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setText(value);
        setEditing(true);
      }}
      title={edited ? "Changed here - saved to the candidate after the email goes" : "Click to change"}
      className="relative -mx-1 block w-[calc(100%+0.5rem)] whitespace-pre-line rounded-xs px-1 py-0.5 text-left hover:bg-surface-2"
    >
      {display || <span className="text-ink-3">—</span>}
      {edited && <span aria-label="Changed" className="absolute -right-1 top-0.5 size-1.5 rounded-full bg-brand" />}
    </button>
  );
}

/** The notes' own marks, as the TA System writes them: ==highlight==, **bold**,
 *  *italic*, a "- " bullet and a ">" arrow line. The buttons only wrap the
 *  selected words, so the text stays plain and the email reads it the same way. */
function NoteTools({ box, onChange }: { box: React.RefObject<HTMLTextAreaElement | null>; onChange: (v: string) => void }) {
  const wrap = (open: string, close = open) => {
    const t = box.current;
    if (!t) return;
    const { selectionStart: a, selectionEnd: b, value } = t;
    const next = value.slice(0, a) + open + value.slice(a, b) + close + value.slice(b);
    onChange(next);
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(a + open.length, b + open.length);
    });
  };
  const line = (mark: string) => {
    const t = box.current;
    if (!t) return;
    const start = t.value.lastIndexOf("\n", t.selectionStart - 1) + 1;
    onChange(t.value.slice(0, start) + mark + t.value.slice(start));
    requestAnimationFrame(() => t.focus());
  };
  const B = "flex h-[max(1.6rem,22px)] min-w-[max(1.6rem,22px)] items-center justify-center rounded-xs px-1 text-ink-2 hover:bg-surface-3 hover:text-ink";
  return (
    // onMouseDown keeps the box focused, so a mark lands on the words still selected.
    <div className="mb-1 flex items-center gap-0.5" onMouseDown={(e) => e.preventDefault()}>
      <button type="button" title="Highlight" onClick={() => wrap("==")} className={B}>
        <span className="rounded-xs bg-sticky-yellow px-0.5 text-caption font-medium text-ink">ab</span>
      </button>
      <button type="button" title="Bold" onClick={() => wrap("**")} className={B + " font-bold"}>B</button>
      <button type="button" title="Italic" onClick={() => wrap("*")} className={B + " italic"}>I</button>
      <button type="button" title="Bullet" onClick={() => line("- ")} className={B}>•</button>
      <button type="button" title="Arrow line" onClick={() => line(">")} className={B}>›</button>
    </div>
  );
}

/** Notes drawn with their marks (formatNoteHtml in the TA System). */
export function Notes({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <span className="block space-y-0.5">
      {text.split("\n").map((raw, i) => {
        const arrow = raw.startsWith(">");
        const bullet = raw.startsWith("- ");
        const body = raw.replace(/^>\s?/, "").replace(/^- /, "");
        return (
          <span key={i} className="flex gap-1.5">
            {arrow && <span className="text-brand">›</span>}
            {bullet && <span className="text-ink-3">•</span>}
            <span>{inline(body)}</span>
          </span>
        );
      })}
    </span>
  );
}

function inline(s: string): ReactNode[] {
  return s.split(/(==[^=]+==|\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (/^==.+==$/.test(part)) return <mark key={i} className="rounded-xs bg-sticky-yellow px-0.5 text-ink">{part.slice(2, -2)}</mark>;
    if (/^\*\*.+\*\*$/.test(part)) return <b key={i} className="font-semibold text-ink">{part.slice(2, -2)}</b>;
    if (/^\*.+\*$/.test(part)) return <i key={i}>{part.slice(1, -1)}</i>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function NewColumn({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <input
      autoFocus
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => onDone(name)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(name);
        if (e.key === "Escape") onDone("");
      }}
      placeholder="Column name"
      aria-label="New column name"
      className="w-[max(8rem,100px)] rounded-xs bg-surface px-1 py-0.5 normal-case text-ink outline-none ring-2 ring-brand/30"
    />
  );
}

/* ---------- Table 2: today's effort ---------- */

export type EffortKey = "lEffort" | "sets" | "da" | "scoop" | "l" | "post" | "addOns" | "backUp";
export type Effort = Record<EffortKey, number>;
export type Targets = Partial<Record<EffortKey, number>>;

// The TA System's effort columns (EFFORT_COLUMNS). The CV columns add up into the
// SETS cell ("2 · 14 CVs"), so each CV counts once.
const CV_COLUMNS: EffortKey[] = ["da", "scoop", "l", "post", "addOns", "backUp"];
const EFFORT_LABEL: Record<EffortKey, string> = {
  lEffort: "L effort",
  sets: "Sets",
  da: "DA",
  scoop: "Scoop",
  l: "L",
  post: "Post",
  addOns: "Add-ons",
  backUp: "Back-up",
};
const EFFORT_HINT: Partial<Record<EffortKey, string>> = { da: "Direct applicant", l: "LinkedIn", post: "Job post" };

export const cvTotal = (e: Effort) => CV_COLUMNS.reduce((n, k) => n + (e[k] || 0), 0);

export function EffortTiles({
  effort,
  targets,
  workType,
  date,
  assignee,
  readOnly,
  onChange,
  onTarget,
}: {
  effort: Effort;
  targets: Targets;
  workType: "100%" | "Follow-up" | "Add-on";
  date: string;
  assignee: string;
  readOnly: boolean;
  onChange: (k: EffortKey, n: number) => void;
  onTarget: (k: EffortKey, n: number | undefined) => void;
}) {
  const keys = Object.keys(EFFORT_LABEL) as EffortKey[];
  return (
    <>
      {/* DATE, ASSIGNEE and 100% / FOLLOW UP: the row's first three cells. The work
          type is the workday's, never typed here. */}
      <p className="mt-[max(0.4rem,4px)] text-small text-ink-2">
        {date} · {assignee} · <b className="font-medium text-ink">{workType}</b>
      </p>
      <div className="mt-[max(0.6rem,6px)] flex flex-wrap gap-[max(0.6rem,6px)]">
        {keys.map((k) => {
          const label = k === "lEffort" && workType === "Follow-up" ? "CVs" : EFFORT_LABEL[k];
          return (
            <div key={k} title={EFFORT_HINT[k]} className="min-w-[max(5.5rem,72px)] rounded-sm bg-surface-2 px-[max(0.9rem,9px)] py-[max(0.6rem,6px)] focus-within:ring-2 focus-within:ring-brand/30">
              <span className="flex items-baseline gap-1">
                <Num value={effort[k]} readOnly={readOnly} label={label} onChange={(n) => onChange(k, n ?? 0)} className="w-[3ch] text-h3 font-medium text-ink" />
                {k === "sets" && <span className="whitespace-nowrap text-small text-ink-2">· {cvTotal(effort)} CVs</span>}
              </span>
              <span className="block text-caption font-medium text-ink-3">{label}</span>
              {/* The TARGET row: shown in the email only when a target is set. */}
              {(!readOnly || targets[k] !== undefined) && (
                <span className="mt-0.5 flex items-center gap-1 text-caption text-ink-3">
                  target
                  <Num value={targets[k]} readOnly={readOnly} label={`${label} target`} onChange={(n) => onTarget(k, n)} className="w-[3ch] text-ink-2" placeholder="—" />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Num({ value, readOnly, label, onChange, className, placeholder }: { value: number | undefined; readOnly: boolean; label: string; onChange: (n: number | undefined) => void; className: string; placeholder?: string }) {
  if (readOnly) return <span className={className}>{value ?? placeholder ?? ""}</span>;
  return (
    <input
      inputMode="numeric"
      value={value ?? ""}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, "").slice(0, 3);
        onChange(d === "" ? undefined : Number(d));
      }}
      className={"bg-transparent outline-none placeholder:text-ink-3 " + className}
    />
  );
}

/* ---------- Referee calls ---------- */

export type Ref = { id: string; company: string; referral: string; phone: string; feedback: string; good: boolean };

/** The day's referee calls (from the Referee Calls view), in the TA System's two
 *  groups. A call can be moved to the other group, and the whole block left out. */
export function RefereeCalls({
  refs,
  include,
  readOnly,
  onInclude,
  onMove,
}: {
  refs: Ref[];
  include: boolean;
  readOnly: boolean;
  onInclude: (v: boolean) => void;
  onMove: (id: string) => void;
}) {
  const [moved, setMoved] = useState<string | null>(null);
  return (
    <>
      <div className="mt-[max(1.5rem,12px)] flex items-center gap-3">
        <h3 className={SECTION + " mt-0"}>Referee calls · {refs.length}</h3>
        {!readOnly && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-caption font-medium text-ink-2">
            Include in email
            <button
              type="button"
              role="switch"
              aria-checked={include}
              aria-label="Include the referee calls in the email"
              onClick={() => onInclude(!include)}
              className={"relative h-[max(1.25rem,18px)] w-[max(2.25rem,32px)] rounded-full transition-colors " + (include ? "bg-brand" : "bg-border-strong")}
            >
              <span className={"absolute left-[2px] top-[2px] size-[calc(100%-4px)] max-w-[max(1rem,14px)] rounded-full bg-surface shadow-card transition-transform " + (include ? "translate-x-[calc(max(2.25rem,32px)-max(1rem,14px)-4px)]" : "")} />
            </button>
          </label>
        )}
      </div>
      {include ? (
        // The TA System's two groups, side by side like the effort tiles; a call
        // crosses to the other group with the small arrows on its card.
        <div className="mt-[max(0.7rem,6px)] grid grid-cols-2 gap-[max(1rem,10px)] max-md:grid-cols-1">
          {[true, false].map((good) => {
            const group = refs.filter((r) => r.good === good);
            return (
              <div key={String(good)} className="min-w-0">
                <span className={CHIP + (good ? " bg-success-soft text-success" : " bg-surface-3 text-ink-2")}>
                  <span className={"size-1.5 rounded-full " + (good ? "bg-success" : "bg-ink-3")} />
                  {good ? "Positive · contacts available" : "Not successful"}
                  <span className="font-normal opacity-70">{group.length}</span>
                </span>
                <ul className="mt-[max(0.5rem,5px)] space-y-[max(0.5rem,5px)]">
                  {group.map((r) => (
                    <RefCard key={r.id + String(r.good)} r={r} readOnly={readOnly} moved={r.id === moved} onMove={() => (setMoved(r.id), onMove(r.id))} />
                  ))}
                  {!group.length && (
                    <li className="rounded-md border border-dashed border-border px-[max(0.9rem,9px)] py-[max(0.7rem,7px)] text-caption text-ink-3">No calls here</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-[max(0.7rem,6px)] rounded-md border border-dashed border-border px-[max(0.9rem,9px)] py-[max(0.7rem,7px)] text-small text-ink-3">
          {refs.length} call{refs.length === 1 ? "" : "s"} kept, but left out of this email.
        </p>
      )}
    </>
  );
}

/** One call as a soft card: who, how to reach them, what they said. */
function RefCard({ r, readOnly, onMove, moved }: { r: Ref; readOnly: boolean; onMove: () => void; moved: boolean }) {
  const el = useRef<HTMLLIElement>(null);
  // Only the card you just moved settles into its new group; nothing moves on a plain draw.
  useGSAP(() => {
    if (moved) gsap.from(el.current, { ...PIN_IN, stagger: 0 });
  });
  return (
    <li ref={el} className="group relative rounded-md bg-surface-2 px-[max(0.9rem,9px)] py-[max(0.7rem,7px)]">
      <p className="pr-7 text-small font-medium text-ink">{r.company}</p>
      <p className="text-caption text-ink-3">
        {r.referral} · <span className="font-mono">{r.phone}</span>
      </p>
      <p className="mt-1 text-small text-ink-2">{r.feedback}</p>
      {!readOnly && (
        <button
          type="button"
          onClick={onMove}
          title={`Move to ${r.good ? "Not successful" : "Positive"}`}
          aria-label={`Move ${r.company} to ${r.good ? "Not successful" : "Positive"}`}
          className="absolute right-[max(0.5rem,5px)] top-[max(0.5rem,5px)] flex size-[max(1.6rem,22px)] items-center justify-center rounded-full text-ink-3 opacity-0 transition-opacity hover:bg-surface-3 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
        >
          <svg {...svg} className="size-[0.95em]">
            <path d="M7 7h11l-3-3M17 17H6l3 3" />
          </svg>
        </button>
      )}
    </li>
  );
}

/* ---------- shared bits ---------- */

export const SECTION = "mt-[max(1.5rem,12px)] text-caption font-medium uppercase text-ink-3";
export const CHIP = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[max(0.7rem,8px)] py-[max(0.25rem,3px)] text-caption font-medium";

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
export const FileIcon = () => (
  <svg {...svg} className="size-[1.1em]">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
);
const PenIcon = () => (
  <svg {...svg} className="size-[1.1em]">
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </svg>
);
const Plus = () => (
  <svg {...svg} strokeWidth={2.4} className="size-[0.9em]">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const Cross = () => (
  <svg {...svg} strokeWidth={2.4} className="size-[0.9em]">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
