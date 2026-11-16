"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { useWorkdayGate } from "@/lib/workday";
import { BackButton } from "./PipelineBoard";
import FindCvButton from "./FindCvButton";
import PillMenu, { type MenuOption } from "./PillMenu";
import Toast from "./Toast";
import { sendToPipeline } from "./pipelineInbox";
import WorkdayBlocked from "./WorkdayBlocked";
import { FIELD_PILL } from "./filters";
import { useLiftMenu } from "./liftMenu";
import { useOpeningView } from "./view";

// Headhunting > Excel Tables: the LinkedIn people a TA is working, sheet by sheet
// (owner's design "Excel Tables", 13 Nov 2026). The rules are the old TA System's
// (excel-tables skill, flows 2-9):
// - each TA numbers their own L-sheets; "+ L-sheet" takes the lowest free number;
//   a sheet is renamed in place (blank brings the date back) and a delete is soft -
//   its rows go to "Not in a sheet" with an Undo;
// - one link or up to 100 pasted Excel rows (the phone and the rest of a row come
//   with it); a person already in YOUR table is not added twice;
// - Not interested needs a reason; an eye-marked person needs their CV before the
//   pipeline; the bulk bar never changes eye-marks;
// - another TA's row is theirs to work.
// Sample data until the backend.

type Interest = "approach" | "yes" | "no";
const VIA = ["mutual", "reception", "profile", "internal db", "other"] as const;
type Via = (typeof VIA)[number];
type Row = {
  id: string;
  sheet: number | null;
  name: string;
  title: string;
  company: string;
  url: string;
  phone?: string;
  via?: Via;
  interest: Interest;
  why?: string;
  eye: boolean;
  hasCv: boolean;
  addOn: boolean;
  pipeline?: string;
  addedBy: string;
  added: "today" | "yesterday" | "week";
  location?: string;
  notes: string[];
  matches?: { name: string; detail: string }[];
  /** Another TA shortlisted this person first: nothing to send to the pipeline. */
  shortlistedBy?: string;
};
type Sheet = { n: number; date: string; name?: string };

const ME = "me";
const LOCATIONS = ["Colombo office", "Horana plant"];
const PASTE_MAX = 100;

const r = (
  id: string,
  sheet: number,
  name: string,
  title: string,
  company: string,
  more: Partial<Row> = {},
): Row => ({
  id,
  sheet,
  name,
  title,
  company,
  url: `https://www.linkedin.com/in/${name.toLowerCase().replace(/\s+/g, "-")}`,
  interest: "approach",
  eye: false,
  hasCv: false,
  addOn: false,
  addedBy: ME,
  added: "today",
  notes: [],
  ...more,
});

const filler = (sheet: number, count: number, added: Row["added"]) =>
  Array.from({ length: count }, (_, i) =>
    r(
      `l${sheet}-${i}`,
      sheet,
      `Profile ${sheet}.${i + 1}`,
      ["SAP Consultant", "ERP Analyst", "IT Manager"][i % 3],
      ["Rocell", "Macksons", "Swisstek", "Lanka Walltiles"][i % 4],
      {
        added,
        interest: (["approach", "yes", "no"] as const)[i % 3],
        why: i % 3 === 2 ? "not looking now" : undefined,
        phone: i % 2 ? `07${i} 555 01${String(i).padStart(2, "0")}` : undefined,
        via: i % 2 ? "profile" : undefined,
      },
    ),
  );

const START: Row[] = [
  ...filler(1, 18, "week"),
  ...filler(2, 22, "yesterday"),
  r("a1", 3, "Ruwan Gunawardena", "Head of SAP", "Lanka Tiles", {
    phone: "077 551 2093",
    via: "mutual",
    interest: "yes",
    eye: true,
    matches: [
      {
        name: "Ruwan Gunawardena",
        detail: "Head of SAP · Lanka Tiles · CV from 2024",
      },
    ],
  }),
  r("a2", 3, "Shalini Perera", "ERP Programme Manager", "Rocell", {
    phone: "071 903 4410",
    via: "reception",
    interest: "yes",
  }),
  r("a3", 3, "Dilan Fonseka", "SAP Delivery Manager", "Dipped Products"),
  r("a4", 3, "Hasini Wickrama", "Transformation Lead", "Royal Ceramics", {
    phone: "076 220 1187",
    via: "profile",
    interest: "no",
    why: "happy where he is",
  }),
  r("a5", 3, "Sameera Dias", "SAP Lead", "Hayleys Fibre", { eye: true }),
  r("a6", 3, "Arjuna Silva", "Digital Transformation Lead", "Ansell Lanka", {
    phone: "070 118 3321",
    via: "internal db",
    interest: "yes",
  }),
  r("a7", 3, "Kasun Jayawardena", "SAP Basis Lead", "Swisstek", {
    addOn: true,
  }),
  r("a8", 3, "Nadeesha Fernando", "ERP Lead", "Macksons", {
    interest: "no",
    why: "salary too low",
  }),
  r("a9", 3, "Chamara Rajapaksha", "SAP Programme Lead", "Hayleys Fibre", {
    interest: "yes",
    shortlistedBy: "Hasini",
  }),
  // Another TA's rows on this job: theirs to work, seen under "Added by: everyone".
  r("h1", 3, "Tharindu Perera", "S/4HANA Architect", "Lanka Walltiles", {
    addedBy: "Hasini",
    interest: "yes",
  }),
  r("h2", 3, "Ishara Gamage", "Head of IT", "Lanka Tiles", {
    addedBy: "Hasini",
  }),
];
const SHEETS: Sheet[] = [
  { n: 1, date: "Mon 11" },
  { n: 2, date: "Tue 12" },
  { n: 3, date: "Today" },
];

const INTEREST_TABS: { key: Interest | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "approach", label: "To approach" },
  { key: "yes", label: "Interested" },
  { key: "no", label: "Not interested" },
];
const BY: MenuOption[] = [
  { value: ME, label: "me" },
  { value: "all", label: "everyone" },
];
const ADDED: MenuOption[] = [
  { value: "today", label: "today" },
  { value: "yesterday", label: "yesterday" },
  { value: "week", label: "this week" },
  { value: "any", label: "any time" },
];

const LI = /linkedin\.com\/in\/([\w%-]+)/i;
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
/** A name guessed from the profile address ("check them", as the old system says). */
const nameFrom = (slug: string) =>
  decodeURIComponent(slug)
    .replace(/-[0-9a-f]{5,}$/i, "")
    .split("-")
    .filter((w) => w && !/^\d+$/.test(w))
    .map(cap)
    .join(" ") || "Name to check";
const keyOf = (url: string) => (url.match(LI)?.[1] ?? url).toLowerCase();
const digits = (s: string) => s.replace(/[\s\-().+]/g, "");

const BTN =
  "flex h-[max(2.2rem,30px)] items-center rounded-full px-[max(0.9rem,11px)] text-small font-medium transition-colors";
const LIFT =
  "absolute z-40 mt-2 rounded-md border border-border bg-surface p-[max(0.9rem,10px)] shadow-float";
const INPUT =
  "w-full rounded-sm border border-border-strong bg-surface px-2.5 py-1.5 text-small outline-none focus:border-brand";

export default function ExcelTablesView() {
  const gate = useWorkdayGate();
  const [rows, setRows] = useState(START);
  const [sheets, setSheets] = useState<Sheet[]>(SHEETS);
  // "all" shows every sheet at once.
  const [sheet, setSheet] = useState<number | null | "all">(3);
  const [interest, setInterest] = useState<Interest | "all">("all");
  const [eyeOnly, setEyeOnly] = useState(false);
  const [addOnsOnly, setAddOnsOnly] = useState(false);
  const [q, setQ] = useState("");
  const [by, setBy] = useState(ME);
  const [added, setAdded] = useState("today");
  const [ticked, setTicked] = useState<string[]>([]);
  const [undo, setUndo] = useState<{ sheet: Sheet; ids: string[] } | null>(
    null,
  );
  const [notice, setNotice] = useState<{
    bold?: string;
    rest: string;
    warn?: boolean;
    n: number;
  } | null>(null);
  const say = (rest: string, bold?: string, warn?: boolean) =>
    setNotice((n) => ({ bold, rest, warn, n: (n?.n ?? 0) + 1 }));

  const mine = (x: Row) => x.addedBy === ME;
  const edit = (id: string, patch: Partial<Row>) =>
    setRows((all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  // Every filter but the interest tab, so each tab's count is what pressing it shows.
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const base = rows.filter(
    (x) =>
      (sheet === "all" || x.sheet === sheet) &&
      (by === "all" || x.addedBy === by) &&
      (added === "any" ||
        x.added === added ||
        (added === "week" && x.added !== "week" ? true : false)) &&
      (!eyeOnly || x.eye) &&
      (!addOnsOnly || x.addOn) &&
      words.every((w) =>
        `${x.name} ${x.title} ${x.company} ${x.phone ?? ""}`
          .toLowerCase()
          .includes(w),
      ),
  );
  const shown = base.filter(
    (x) => interest === "all" || x.interest === interest,
  );
  const inSheet = rows.filter(
    (x) =>
      (sheet === "all" || x.sheet === sheet) &&
      (by === "all" || x.addedBy === by),
  ).length;
  const sheetCount = (n: number | null) =>
    rows.filter((x) => x.sheet === n && mine(x)).length;
  const loose = sheetCount(null);

  // ---- Sheets ----
  const addSheet = () => {
    // The lowest number no live sheet uses, as the old system does.
    let n = 1;
    while (sheets.some((s) => s.n === n)) n++;
    setSheets((s) => [...s, { n, date: "Today" }].sort((a, b) => a.n - b.n));
    setSheet(n);
    setAdded("any");
    say(`L${n} started - new people you add go here`);
  };
  const renameSheet = (n: number, name: string) =>
    setSheets((all) =>
      all.map((s) =>
        s.n === n ? { ...s, name: name.trim().slice(0, 40) || undefined } : s,
      ),
    );
  const deleteSheet = (s: Sheet) => {
    const ids = rows.filter((x) => x.sheet === s.n && mine(x)).map((x) => x.id);
    setRows((all) =>
      all.map((x) => (ids.includes(x.id) ? { ...x, sheet: null } : x)),
    );
    setSheets((all) => all.filter((y) => y.n !== s.n));
    setUndo({ sheet: s, ids });
    if (sheet === s.n) setSheet(sheets.find((y) => y.n !== s.n)?.n ?? null);
  };
  const restoreSheet = () => {
    if (!undo) return;
    setSheets((all) => [...all, undo.sheet].sort((a, b) => a.n - b.n));
    setRows((all) =>
      all.map((x) =>
        undo.ids.includes(x.id) ? { ...x, sheet: undo.sheet.n } : x,
      ),
    );
    setSheet(undo.sheet.n);
    setUndo(null);
  };
  // The old system keeps the Undo for ten minutes.
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 10 * 60 * 1000);
    return () => clearTimeout(t);
  }, [undo]);

  // ---- Adding people ----
  const addFromPaste = (text: string) => {
    if (gate) return false;
    // Not in a sheet or All: the link goes to your latest L-sheet, or starts L1.
    let target = typeof sheet === "number" ? sheet : (sheets.at(-1)?.n ?? 0);
    if (!target) {
      target = 1;
      setSheets([{ n: 1, date: "Today" }]);
    }
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const many = lines.length > 1 || text.includes("\t");
    if (many && lines.length > PASTE_MAX) {
      say(
        `That is ${lines.length} rows. Paste up to ${PASTE_MAX} at a time.`,
        undefined,
        true,
      );
      return false;
    }
    const held = new Map(rows.filter(mine).map((x) => [keyOf(x.url), x]));
    const fresh: Row[] = [];
    let there = 0;
    let noLink = 0;
    for (const line of lines) {
      const cells = line.split("\t").map((c) => c.trim());
      const cell = cells.find((c) => LI.test(c));
      const slug = cell?.match(LI)?.[1];
      if (!cell || !slug) {
        noLink++;
        continue;
      }
      if (held.has(slug.toLowerCase())) {
        there++;
        if (!many)
          say(
            ` is already in your table`,
            held.get(slug.toLowerCase())!.name,
            true,
          );
        continue;
      }
      const phone = cells.find((c) => /^\d{9,15}$/.test(digits(c)));
      const rest = cells.filter(
        (c) => c !== cell && c !== phone && !/^\d{1,4}$/.test(c),
      );
      const row = r(
        `n${Date.now()}${fresh.length}`,
        target,
        nameFrom(slug),
        "",
        "",
        {
          url: `https://www.linkedin.com/in/${slug}`,
          phone,
          via: phone ? "other" : undefined,
          notes: rest.length ? [rest.join(" · ").slice(0, 1000)] : [],
        },
      );
      held.set(slug.toLowerCase(), row);
      fresh.push(row);
    }
    if (!many && noLink) {
      say(
        "That is not a LinkedIn profile link. It should look like linkedin.com/in/their-name.",
        undefined,
        true,
      );
      return false;
    }
    if (many && fresh.length === 0 && there === 0) {
      say("No LinkedIn profile links in what was pasted.", undefined, true);
      return false;
    }
    if (fresh.length) {
      setRows((all) => [...fresh, ...all]);
      setInterest("all");
      if (sheet !== "all") setSheet(target);
      if (added !== "any" && added !== "today") setAdded("today");
    }
    if (many)
      say(
        `Added ${fresh.length}` +
          (there ? `, ${there} already there` : "") +
          (noLink
            ? `, ${noLink} line${noLink === 1 ? "" : "s"} with no link`
            : "") +
          " - names are guessed from the links, check them",
      );
    else if (fresh.length)
      say(
        ` added to L${target} - name guessed from the link, check it`,
        fresh[0].name,
      );
    return fresh.length > 0 || there > 0;
  };

  // ---- Row actions ----
  const toPipeline = (x: Row, quiet = false, fromYes = false) => {
    if (x.shortlistedBy) {
      if (!quiet) say(` was shortlisted first by ${x.shortlistedBy}`, x.name, true);
      return false;
    }
    if (x.eye && !x.hasCv) {
      if (!quiet)
        say(
          ": receive and link their CV before adding this eye-marked profile to the pipeline",
          x.name,
          true,
        );
      return false;
    }
    edit(x.id, { pipeline: "TA Follow-up", interest: "yes", why: undefined });
    // They show on the Pipeline board, in TA Follow-Up (source: headhunted).
    sendToPipeline({ name: x.name, title: x.title, company: x.company, channel: "HH" });
    if (!quiet)
      say(
        fromYes
          ? " is interested - added to the pipeline, TA Follow-up"
          : " added to the pipeline - TA Follow-up",
        x.name,
      );
    return true;
  };
  const canGo = (x: Row) =>
    mine(x) &&
    !x.shortlistedBy &&
    x.interest === "yes" &&
    !x.pipeline &&
    !(x.eye && !x.hasCv);

  const tickedRows = rows.filter((x) => ticked.includes(x.id));
  const eligible = tickedRows.filter(canGo);

  // ---- Export: the old layout - Interested, then Pending, then Not interested ----
  const exportRows = () => {
    const order: Interest[] = ["yes", "approach", "no"];
    const label = {
      yes: "Interested",
      approach: "Pending",
      no: "Not interested",
    } as const;
    const lines = [["Candidate Name", "Links", "Status", "Notes"]];
    for (const k of order)
      for (const x of shown.filter((y) => y.interest === k))
        lines.push([
          x.name,
          x.url,
          label[k] + (x.why ? ` - ${x.why}` : ""),
          x.notes.at(-1) ?? "",
        ]);
    return lines;
  };
  const sheetName = sheets.find((s) => s.n === sheet);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col px-[max(2.3rem,14px)] pb-[max(1.4rem,12px)] pt-[max(2rem,48px)] short:pt-[30px] max-md:pt-14">
      {/* Sheets, capture, export */}
      <div className="flex flex-wrap items-center gap-x-[max(0.6rem,6px)] gap-y-2">
        <BackButton />
        <div className="ml-[max(0.6rem,4px)] flex flex-wrap items-center gap-[max(0.5rem,6px)]">
          {sheets.map((s) => (
            <SheetChip
              key={s.n}
              s={s}
              count={sheetCount(s.n)}
              on={sheet === s.n}
              onPick={() => {
                setSheet(s.n);
                setTicked([]);
                // A sheet is already a day: an older one shows all of its rows.
                setAdded(s.date === "Today" ? "today" : "any");
              }}
              onRename={(name) => renameSheet(s.n, name)}
              onDelete={() => deleteSheet(s)}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              setSheet("all");
              setTicked([]);
              setAdded("any");
            }}
            className={
              BTN +
              " " +
              (sheet === "all"
                ? "bg-ink text-white"
                : "bg-surface-2 font-normal text-ink-2 hover:text-ink")
            }
          >
            All · {rows.filter(mine).length}
          </button>
          {loose > 0 && (
            <button
              type="button"
              onClick={() => setSheet(null)}
              className={
                BTN +
                " " +
                (sheet === null
                  ? "bg-ink text-white"
                  : "bg-surface-2 font-normal text-ink-2 hover:text-ink")
              }
            >
              Not in a sheet · {loose}
            </button>
          )}
          <button
            type="button"
            onClick={addSheet}
            disabled={!!gate}
            className={
              BTN +
              " border border-dashed border-border-strong font-normal text-ink-2 hover:border-brand hover:text-brand disabled:opacity-40"
            }
          >
            + L-sheet
          </button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 max-md:ml-0">
          <CaptureChip />
          <ExportMenu
            rows={exportRows}
            file={`PGP Glass - Head of SAP - ${sheetName ? `L${sheetName.n}` : sheet === "all" ? "All sheets" : "Not in a sheet"}.csv`}
            onCopied={() => say("Copied - paste it into Excel")}
          />
        </div>
      </div>

      {undo && (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-surface-2 px-4 py-2 text-small text-ink-2"
        >
          L{undo.sheet.n} deleted - its {undo.ids.length}{" "}
          {undo.ids.length === 1 ? "row is" : "rows are"} under Not in a sheet.
          <button
            type="button"
            onClick={restoreSheet}
            className="font-medium text-brand hover:underline"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => setUndo(null)}
            aria-label="Dismiss"
            className="ml-auto text-ink-3 hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}
      {gate && (
        <WorkdayBlocked what="add or work LinkedIn profiles" className="mt-3" />
      )}

      <PasteBar disabled={!!gate} onAdd={addFromPaste} />

      {/* Filters */}
      <div className="mt-[max(1rem,10px)] flex flex-wrap items-center gap-[max(0.5rem,6px)]">
        {INTEREST_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={interest === t.key}
            onClick={() => setInterest(t.key)}
            className={
              BTN +
              " font-normal " +
              (interest === t.key
                ? "bg-surface-2 text-ink"
                : "text-ink-2 hover:text-ink")
            }
          >
            {t.label} ·{" "}
            {t.key === "all"
              ? base.length
              : base.filter((x) => x.interest === t.key).length}
          </button>
        ))}
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
        <Toggle
          on={eyeOnly}
          onClick={() => setEyeOnly((v) => !v)}
          icon={<EyeIcon />}
          label="Eye-marked"
        />
        <Toggle
          on={addOnsOnly}
          onClick={() => setAddOnsOnly((v) => !v)}
          icon={<span aria-hidden="true">+</span>}
          label="Add-ons"
        />
        <div className="ml-auto flex items-center gap-2 max-md:ml-0 max-md:flex-wrap">
          <label
            className={
              FIELD_PILL + " w-[min(15rem,100%)] min-w-0 shrink text-ink-3"
            }
          >
            <SearchIcon />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={sheet === "all" ? "Search every sheet" : "Search this sheet"}
              aria-label={sheet === "all" ? "Search every sheet" : "Search this sheet"}
              className="min-w-0 flex-1 bg-transparent text-small text-ink outline-none placeholder:text-ink-3"
            />
          </label>
          <PillMenu
            key={`by-${by}`}
            options={BY}
            initial={by}
            onChange={setBy}
            prefix="Added by:"
            mark="tick"
            pillClass={FIELD_PILL}
          />
          <PillMenu
            key={`added-${added}`}
            options={ADDED}
            initial={added}
            onChange={setAdded}
            prefix="Added:"
            mark="tick"
            pillClass={FIELD_PILL}
          />
        </div>
      </div>

      {/* The table */}
      <div
        className={
          "mt-[max(1rem,10px)] min-h-0 flex-1 overflow-auto rounded-lg border border-border " +
          (ticked.length ? "pb-20" : "")
        }
      >
        <table className="w-full min-w-[60rem] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-surface-2 text-caption text-ink-3">
            <tr>
              <th className="w-12 py-3 pl-4">
                <span className="sr-only">Pick</span>
              </th>
              <th className="py-3 font-normal">Person</th>
              <th className="py-3 font-normal">Company</th>
              <th className="py-3 font-normal">Phone</th>
              <th className="py-3 font-normal">Interest</th>
              <th className="w-10 py-3">
                <span className="sr-only">Eye-mark</span>
              </th>
              <th className="py-3 pr-4">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((x) => (
              <TableRow
                key={x.id}
                x={x}
                mine={mine(x)}
                blocked={!!gate}
                ticked={ticked.includes(x.id)}
                onTick={() =>
                  setTicked((t) =>
                    t.includes(x.id)
                      ? t.filter((i) => i !== x.id)
                      : [...t, x.id],
                  )
                }
                edit={(patch) => edit(x.id, patch)}
                say={say}
                onPipeline={() => toPipeline(x)}
                onYes={() => toPipeline(x, false, true)}
                onNo={(why) => {
                  const was = x.pipeline;
                  edit(x.id, { interest: "no", why, pipeline: undefined });
                  say(
                    was
                      ? " marked not interested - moved to Rejected on the pipeline"
                      : " marked not interested",
                    x.name,
                  );
                }}
                onRemove={() => {
                  setRows((all) => all.filter((y) => y.id !== x.id));
                  setTicked((t) => t.filter((i) => i !== x.id));
                  say(" removed from the table", x.name);
                }}
              />
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-14 text-center text-small text-ink-3">
            {inSheet > 0 && base.length === 0 && added !== "any" ? (
              <>
                Nothing added {ADDED.find((a) => a.value === added)?.label} in
                this sheet.
                <button
                  type="button"
                  onClick={() => setAdded("any")}
                  className="font-medium text-brand hover:underline"
                >
                  Show any time
                </button>
              </>
            ) : inSheet === 0 ? (
              "No one here yet. Paste a LinkedIn link above, or use the Chrome capture on a profile."
            ) : (
              "Nobody here matches."
            )}
          </div>
        )}
      </div>

      {ticked.length > 0 && (
        <BulkBar
          count={ticked.length}
          eligible={eligible.length}
          blocked={!!gate}
          onClear={() => setTicked([])}
          onNote={(note) => {
            setRows((all) =>
              all.map((x) =>
                ticked.includes(x.id) && mine(x)
                  ? { ...x, notes: [...x.notes, note] }
                  : x,
              ),
            );
            say(`Note added to ${ticked.length}`);
          }}
          onOutcome={(to, why) => {
            if (to === "yes") {
              const go = tickedRows.filter(
                (x) =>
                  mine(x) &&
                  !x.pipeline &&
                  !x.shortlistedBy &&
                  !(x.eye && !x.hasCv),
              );
              go.forEach((x) => toPipeline(x, true));
              const left =
                tickedRows.filter(
                  (x) => mine(x) && !x.pipeline && !x.shortlistedBy,
                ).length -
                go.length;
              say(
                `${go.length} interested - added to the pipeline, TA Follow-up` +
                  (left
                    ? `. ${left} stayed as they were (eye-marked without a CV, or shortlisted first by another TA)`
                    : ""),
                undefined,
                left > 0,
              );
              return;
            }
            // Never the eye-marks, and never a row already in the pipeline.
            setRows((all) =>
              all.map((x) =>
                ticked.includes(x.id) && mine(x) && !x.pipeline
                  ? { ...x, interest: to, why: to === "no" ? why : undefined }
                  : x,
              ),
            );
            say(
              `${ticked.length} changed to ${to === "no" ? "Not interested" : "To approach"}`,
            );
          }}
          onLocation={(loc) => {
            setRows((all) =>
              all.map((x) =>
                ticked.includes(x.id) && mine(x) ? { ...x, location: loc } : x,
              ),
            );
            say(`${ticked.length} set to ${loc}`);
          }}
          onPipeline={() => {
            eligible.forEach((x) => toPipeline(x, true));
            const left = ticked.length - eligible.length;
            say(
              `${eligible.length} added to the pipeline - TA Follow-up` +
                (left
                  ? `. ${left} left: they need Interested first, or a CV if eye-marked`
                  : ""),
              undefined,
              left > 0,
            );
            setTicked([]);
          }}
        />
      )}

      {notice && (
        <Toast
          key={notice.n}
          bold={notice.bold}
          rest={notice.rest}
          warn={notice.warn}
        />
      )}
    </div>
  );
}

/** One L-sheet: pick it; double-click renames (blank brings the date back); ✕ deletes. */
function SheetChip({
  s,
  count,
  on,
  onPick,
  onRename,
  onDelete,
}: {
  s: Sheet;
  count: number;
  on: boolean;
  onPick: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  if (renaming)
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onRename(draft);
          setRenaming(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setRenaming(false);
        }}
        maxLength={40}
        placeholder={s.date}
        aria-label={`Rename L${s.n}`}
        className="h-[max(2.2rem,30px)] w-36 rounded-full border border-brand bg-surface px-3 text-small outline-none"
      />
    );
  return (
    <span className="group relative">
      <button
        type="button"
        onClick={onPick}
        onDoubleClick={() => {
          setDraft(s.name ?? "");
          setRenaming(true);
        }}
        title="Double-click to rename"
        className={
          BTN +
          " gap-2 " +
          (on
            ? "bg-ink text-white"
            : "bg-surface-2 font-normal text-ink hover:bg-surface-3")
        }
      >
        <b className="font-medium">L{s.n}</b>
        <span className={on ? "text-white" : "text-ink-3"}>
          {s.name ?? s.date} · {count}
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete L${s.n}`}
        title="Delete this sheet - its rows stay, under Not in a sheet"
        className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-ink-2 text-[10px] leading-none text-white group-hover:flex focus-visible:flex"
      >
        ✕
      </button>
    </span>
  );
}

/** "Paste a LinkedIn profile link — or paste many rows straight from Excel". */
function PasteBar({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (text: string) => boolean;
}) {
  const [text, setText] = useState("");
  // Always green, as drawn; an empty press puts the cursor in the box.
  const box = useRef<HTMLTextAreaElement>(null);
  const go = () => {
    if (!text.trim()) return box.current?.focus();
    if (onAdd(text)) setText("");
  };
  return (
    <div className="mt-[max(1.1rem,10px)] flex items-center gap-3 rounded-[max(1.5rem,18px)] bg-canvas py-2 pl-[max(1.1rem,12px)] pr-2">
      <Image
        src="/li.svg"
        alt=""
        width={20}
        height={20}
        className="size-[max(1.25rem,16px)] shrink-0"
      />
      <textarea
        ref={box}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !text.includes("\n")) {
            e.preventDefault();
            go();
          }
        }}
        disabled={disabled}
        rows={text.includes("\n") ? 3 : 1}
        placeholder="Paste a LinkedIn profile link — or paste many rows straight from Excel"
        aria-label="Paste a LinkedIn profile link or Excel rows"
        className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-body outline-none placeholder:text-ink-3 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={go}
        disabled={disabled}
        className={
          BTN +
          " h-[max(2.6rem,34px)] bg-brand text-white hover:bg-brand-strong disabled:opacity-40"
        }
      >
        Add to Table
      </button>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  icon,
  label,
}: {
  on: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={
        BTN +
        " gap-1.5 border font-normal " +
        (on
          ? "border-brand bg-brand-soft text-brand"
          : "border-border text-ink hover:bg-surface-2")
      }
    >
      {icon}
      {label}
    </button>
  );
}

/** One person. */
function TableRow({
  x,
  mine,
  blocked,
  ticked,
  onTick,
  edit,
  say,
  onPipeline,
  onYes,
  onNo,
  onRemove,
}: {
  x: Row;
  mine: boolean;
  blocked: boolean;
  ticked: boolean;
  onTick: () => void;
  edit: (patch: Partial<Row>) => void;
  say: (rest: string, bold?: string, warn?: boolean) => void;
  onPipeline: () => void;
  onYes: () => void;
  onNo: (why: string) => void;
  onRemove: () => void;
}) {
  const can = mine && !blocked;
  const { go } = useOpeningView();
  return (
    <tr
      className={
        "border-t border-border text-small " +
        (ticked ? "bg-brand-tint" : "hover:bg-canvas")
      }
    >
      <td className="py-3 pl-4">
        <input
          type="checkbox"
          checked={ticked}
          disabled={!mine}
          onChange={onTick}
          aria-label={`Pick ${x.name}`}
          className="size-[max(1.1rem,15px)] accent-[var(--color-brand)]"
        />
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2.5">
          <a
            href={x.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`${x.name} on LinkedIn`}
            className="shrink-0 hover:opacity-80"
          >
            <Image
              src="/li.svg"
              alt=""
              width={18}
              height={18}
              className="size-[max(1.1rem,15px)]"
            />
          </a>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium text-ink">
              <span className="truncate">{x.name}</span>
              {x.addOn && (
                <span className="rounded-full bg-violet-soft px-1.5 text-caption font-medium text-violet">
                  Add-on
                </span>
              )}
              {x.notes.length > 0 && (
                <NotesList
                  x={x}
                  can={can}
                  onRemove={(i) =>
                    edit({ notes: x.notes.filter((_, j) => j !== i) })
                  }
                />
              )}
            </div>
            <p className="truncate text-caption text-ink-3">
              {x.title || "Title to check"}
              {x.location ? ` · ${x.location}` : ""}
            </p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4 text-ink">
        {x.company || <span className="text-ink-3">-</span>}
      </td>
      <td className="py-3 pr-4">
        <Phone x={x} can={can} onSave={(phone, via) => edit({ phone, via })} />
      </td>
      <td className="py-3 pr-2">
        <InterestChip x={x} />
      </td>
      <td className="py-3">
        <button
          type="button"
          disabled={!can}
          aria-pressed={x.eye}
          aria-label={
            x.eye ? `Remove the eye-mark on ${x.name}` : `Eye-mark ${x.name}`
          }
          title="Eye-mark: one of the few that strictly match the brief"
          onClick={() => {
            edit({ eye: !x.eye });
            say(
              x.eye ? " - eye-mark removed" : " eye-marked - aim for 3 a day",
              x.name,
            );
          }}
          className={
            "rounded-full p-1 transition-colors " +
            (x.eye ? "text-warn" : "text-border-strong hover:text-ink-3") +
            " disabled:cursor-default"
          }
        >
          <EyeIcon />
        </button>
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center justify-end gap-2.5">
          {!mine ? (
            <span className="text-caption text-ink-3">
              {x.addedBy}&apos;s row
            </span>
          ) : x.shortlistedBy ? (
            <span className="text-caption text-ink-3">
              Shortlisted first by {x.shortlistedBy}
            </span>
          ) : x.pipeline ? (
            <>
              <button
                type="button"
                onClick={() => go("pipeline")}
                title="Open the Pipeline"
                className="rounded-full bg-brand-soft px-3 py-1 text-caption font-medium text-brand hover:bg-brand-tint"
              >
                In pipeline · {x.pipeline} →
              </button>
              <NoButton
                name={x.name}
                blocked={blocked}
                label="Not interested"
                onSave={onNo}
              />
            </>
          ) : x.interest === "no" ? (
            <button
              type="button"
              disabled={blocked}
              // Way back: the same rules as Yes - into the pipeline, eye-marked needs a CV.
              onClick={onYes}
              className={
                BTN +
                " border border-border font-normal text-success hover:bg-success-soft disabled:opacity-40"
              }
            >
              Interested after all
            </button>
          ) : x.interest === "yes" ? (
            <>
              <button
                type="button"
                disabled={blocked}
                onClick={onPipeline}
                className={
                  BTN +
                  " bg-brand text-white hover:bg-brand-strong disabled:opacity-40"
                }
              >
                Add to pipeline
              </button>
              <NoButton
                name={x.name}
                blocked={blocked}
                label="Not interested"
                onSave={onNo}
              />
            </>
          ) : x.interest === "approach" ? (
            <>
              <span className="text-ink-3">Interested?</span>
              <button
                type="button"
                disabled={blocked}
                // Interested puts them in the pipeline at once, as the old
                // system does (owner, 13 Nov 2026); refused like Add to pipeline.
                onClick={onYes}
                className={
                  BTN +
                  " border border-border font-normal text-success hover:bg-success-soft disabled:opacity-40"
                }
              >
                Yes
              </button>
              <NoButton
                name={x.name}
                blocked={blocked}
                onSave={(why) => {
                  edit({ interest: "no", why });
                  say(" marked not interested", x.name);
                }}
              />
            </>
          ) : null}
          {mine && !x.hasCv && (
            <FindCvButton
              name={x.name}
              matches={x.matches}
              onLinked={() => {
                edit({ hasCv: true });
                say(" - their CV is linked from the database", x.name);
              }}
            />
          )}
          {mine && x.hasCv && (
            <span className="text-caption text-brand">CV linked</span>
          )}
          {mine && (
            <RowMenu
              x={x}
              blocked={blocked}
              edit={edit}
              say={say}
              onRemove={onRemove}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

function InterestChip({ x }: { x: Row }) {
  const [tone, text] =
    x.interest === "yes"
      ? ["bg-success-soft text-success", "Interested"]
      : x.interest === "no"
        ? [
            "bg-danger-soft text-danger",
            `Not interested${x.why ? ` · ${x.why}` : ""}`,
          ]
        : ["bg-surface-2 text-ink-2", "To approach"];
  return (
    <span
      className={`inline-block max-w-[16rem] truncate rounded-full px-2.5 py-0.5 text-caption font-medium ${tone}`}
    >
      {text}
    </span>
  );
}

/** The phone and where it came from; "+ add number" when there is none. */
function Phone({
  x,
  can,
  onSave,
}: {
  x: Row;
  can: boolean;
  onSave: (phone: string, via: Via) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState("");
  const [via, setVia] = useState<Via>("mutual");
  const ok = /^\d{9,15}$/.test(digits(num));
  if (editing)
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={num}
          onChange={(e) => setNum(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter" && ok) {
              onSave(num.trim(), via);
              setEditing(false);
            }
          }}
          inputMode="tel"
          placeholder="077 123 4567"
          aria-label={`Phone for ${x.name}`}
          className="w-28 rounded-sm border border-border-strong px-2 py-1 text-small outline-none focus:border-brand"
        />
        <select
          value={via}
          onChange={(e) => setVia(e.target.value as Via)}
          aria-label="Where the number came from"
          className="rounded-sm border border-border-strong bg-surface px-1 py-1 text-caption"
        >
          {VIA.map((v) => (
            <option key={v} value={v}>
              via {v}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!ok}
          onClick={() => {
            onSave(num.trim(), via);
            setEditing(false);
          }}
          className="rounded-full bg-brand px-2.5 py-1 text-caption font-medium text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>
    );
  if (!x.phone)
    return (
      <button
        type="button"
        disabled={!can}
        onClick={() => {
          setNum("");
          setEditing(true);
        }}
        className="text-ink-3 hover:text-brand disabled:hover:text-ink-3"
      >
        + add number
      </button>
    );
  return (
    <button
      type="button"
      disabled={!can}
      onClick={() => {
        setNum(x.phone ?? "");
        setVia(x.via ?? "other");
        setEditing(true);
      }}
      title={can ? "Change the number" : undefined}
      className="text-left"
    >
      <span className="block text-ink">{x.phone}</span>
      <span className="block text-caption text-ink-3">via {x.via}</span>
    </button>
  );
}

/** "No": the old system asks why before saving (300 characters). */
function NoButton({
  name,
  blocked,
  label = "No",
  onSave,
}: {
  name: string;
  blocked: boolean;
  label?: string;
  onSave: (why: string) => void;
}) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const [why, setWhy] = useState("");
  // "Not interested - happy where he is" keeps only the reason.
  const clean = why.trim().replace(/^not interested[\s:.\-–—]*/i, "");
  const save = () => {
    if (!clean) return;
    onSave(clean.slice(0, 300));
    setOpen(false);
    setWhy("");
  };
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        disabled={blocked}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={
          BTN +
          " border border-border font-normal text-danger hover:bg-danger-soft disabled:opacity-40"
        }
      >
        {label}
      </button>
      {shown && (
        <div
          ref={panel}
          role="dialog"
          aria-label={`Why is ${name} not interested?`}
          className={LIFT + " right-0 top-full w-72"}
        >
          <label className="block text-small text-ink">
            Why not?
            <input
              autoFocus
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              maxLength={300}
              placeholder="For example: happy where he is"
              className={INPUT + " mt-1.5"}
            />
          </label>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={!clean}
              onClick={save}
              className="rounded-full bg-brand px-3.5 py-1.5 text-small font-medium text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The row's ⋯: what the old row panel holds - an approach, a note, add-on, details, remove. */
function RowMenu({
  x,
  blocked,
  edit,
  say,
  onRemove,
}: {
  x: Row;
  blocked: boolean;
  edit: (patch: Partial<Row>) => void;
  say: (rest: string, bold?: string) => void;
  onRemove: () => void;
}) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const [mode, setMode] = useState<"menu" | "approach" | "note" | "details">(
    "menu",
  );
  const [text, setText] = useState("");
  const [name, setName] = useState(x.name);
  const [company, setCompany] = useState(x.company);
  const [sure, setSure] = useState(false);
  const close = () => {
    setOpen(false);
    setMode("menu");
    setText("");
    setSure(false);
  };
  const item =
    "flex w-full rounded-sm px-3 py-2 text-left text-small text-ink hover:bg-surface-2 disabled:opacity-40";
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={`More for ${x.name}`}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="rounded-full p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="size-[max(1.1rem,15px)]"
          aria-hidden="true"
        >
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {shown && (
        <div
          ref={panel}
          role="menu"
          className={LIFT + " right-0 top-full w-64 p-1.5"}
        >
          {mode === "menu" ? (
            <>
              <button
                role="menuitem"
                type="button"
                disabled={blocked}
                className={item}
                onClick={() => setMode("approach")}
              >
                Log an approach
              </button>
              <button
                role="menuitem"
                type="button"
                disabled={blocked}
                className={item}
                onClick={() => setMode("note")}
              >
                Add a note
              </button>
              <button
                role="menuitem"
                type="button"
                disabled={blocked}
                className={item}
                onClick={() => {
                  edit({ addOn: !x.addOn });
                  say(
                    x.addOn
                      ? " is no longer an add-on"
                      : " marked as an add-on",
                    x.name,
                  );
                  close();
                }}
              >
                {x.addOn ? "Not an add-on" : "Mark as add-on"}
              </button>
              <button
                role="menuitem"
                type="button"
                disabled={blocked}
                className={item}
                onClick={() => setMode("details")}
              >
                Edit name and company
              </button>
              <button
                role="menuitem"
                type="button"
                disabled={blocked || !!x.pipeline}
                title={
                  x.pipeline
                    ? "They are in the pipeline - move them back there first"
                    : undefined
                }
                className={item + " text-danger"}
                onClick={() => (sure ? (onRemove(), close()) : setSure(true))}
              >
                {sure ? "Click again to remove for good" : "Remove from table"}
              </button>
            </>
          ) : mode === "details" ? (
            <div className="flex flex-col gap-2 p-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Name"
                maxLength={120}
                className={INPUT}
              />
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                aria-label="Company"
                placeholder="Company"
                maxLength={120}
                className={INPUT}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="px-2 text-small text-ink-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!name.trim()}
                  onClick={() => {
                    edit({ name: name.trim(), company: company.trim() });
                    say(" saved", name.trim());
                    close();
                  }}
                  className="rounded-full bg-brand px-3 py-1 text-small font-medium text-white disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-2">
              <p className="text-caption text-ink-3">
                {mode === "approach"
                  ? "How did you reach them? (LinkedIn message, call…)"
                  : "A note for this row"}
              </p>
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                maxLength={2000}
                className={INPUT + " resize-none"}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="px-2 text-small text-ink-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!text.trim()}
                  onClick={() => {
                    edit({
                      notes: [
                        ...x.notes,
                        (mode === "approach" ? "Approached: " : "") +
                          text.trim(),
                      ],
                    });
                    say(
                      mode === "approach"
                        ? " - approach logged"
                        : " - note added",
                      x.name,
                    );
                    close();
                  }}
                  className="rounded-full bg-brand px-3 py-1 text-small font-medium text-white disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The dark bar when rows are ticked: note, outcome, location, pipeline. */
function BulkBar({
  count,
  eligible,
  blocked,
  onClear,
  onNote,
  onOutcome,
  onLocation,
  onPipeline,
}: {
  count: number;
  eligible: number;
  blocked: boolean;
  onClear: () => void;
  onNote: (note: string) => void;
  onOutcome: (to: Interest, why?: string) => void;
  onLocation: (loc: string) => void;
  onPipeline: () => void;
}) {
  const [mode, setMode] = useState<"" | "note" | "outcome" | "location">("");
  const [text, setText] = useState("");
  const [to, setTo] = useState<Interest>("yes");
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mode) return;
    const away = (e: PointerEvent) =>
      !bar.current?.contains(e.target as Node) && setMode("");
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMode("");
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [mode]);
  const done = () => {
    setMode("");
    setText("");
  };
  const item = (on: boolean) =>
    "rounded-full px-3 py-1.5 text-small transition-colors " +
    (on ? "bg-white/15 text-white" : "text-white/90 hover:bg-white/10");
  return (
    <div
      ref={bar}
      className="absolute bottom-[max(2.4rem,24px)] left-1/2 z-30 w-max max-w-[calc(100%-24px)] -translate-x-1/2"
    >
      {mode && (
        <div className="mb-2 rounded-md border border-border bg-surface p-3 shadow-float">
          {mode === "note" ? (
            <div className="flex w-80 max-w-full flex-col gap-2">
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder={`A note on all ${count}`}
                className={INPUT + " resize-none"}
              />
              <button
                type="button"
                disabled={!text.trim()}
                onClick={() => (onNote(text.trim()), done())}
                className="self-end rounded-full bg-brand px-3 py-1 text-small font-medium text-white disabled:opacity-40"
              >
                Add note
              </button>
            </div>
          ) : mode === "outcome" ? (
            <div className="flex w-80 max-w-full flex-col gap-2">
              <p className="text-small font-medium text-ink">Mark {count} as</p>
              <div className="flex gap-1">
                {(
                  [
                    ["approach", "To approach"],
                    ["yes", "Interested"],
                    ["no", "Not interested"],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTo(k)}
                    className={
                      "flex-1 rounded-full px-2 py-1.5 text-small " +
                      (to === k
                        ? "bg-ink text-white"
                        : "bg-surface-2 text-ink-2")
                    }
                  >
                    {l}
                  </button>
                ))}
              </div>
              {to === "no" && (
                <input
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={300}
                  placeholder="Why not? (needed)"
                  className={INPUT}
                />
              )}
              <p className="text-caption text-ink-3">
                {to === "yes"
                  ? "They go straight into the pipeline (TA Follow-up). An eye-marked person needs their CV first."
                  : to === "no"
                    ? "They stay in the table as not interested, with your reason."
                    : "They go back to To approach."}{" "}
                People already in the pipeline are left alone.
              </p>
              <button
                type="button"
                disabled={to === "no" && !text.trim()}
                onClick={() => (onOutcome(to, text.trim()), done())}
                className="self-end rounded-full bg-brand px-3 py-1 text-small font-medium text-white disabled:opacity-40"
              >
                Mark {count}
              </button>
            </div>
          ) : (
            <div className="flex w-60 flex-col">
              <p className="px-3 pb-1 pt-1 text-small font-medium text-ink">
                Work location for {count}
              </p>
              {LOCATIONS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => (onLocation(l), done())}
                  className="rounded-sm px-3 py-2 text-left text-small hover:bg-surface-2"
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div
        role="toolbar"
        aria-label={`${count} picked`}
        className="flex items-center gap-1 rounded-full bg-ink p-1.5 pl-4 shadow-float"
      >
        <span className="mr-2 text-small text-white/60">{count} picked</span>
        <button
          type="button"
          disabled={blocked}
          onClick={() => setMode(mode === "note" ? "" : "note")}
          className={item(mode === "note")}
        >
          Add a note
        </button>
        <button
          type="button"
          disabled={blocked}
          onClick={() => setMode(mode === "outcome" ? "" : "outcome")}
          className={item(mode === "outcome")}
        >
          Mark as…
        </button>
        <button
          type="button"
          disabled={blocked}
          onClick={() => setMode(mode === "location" ? "" : "location")}
          className={item(mode === "location")}
        >
          Work location…
        </button>
        {/* Only when some of the picked are Interested and not in the pipeline
            yet - "Add 0 to pipeline" said nothing (owner, 14 Nov 2026). Marking
            people Interested puts them in the pipeline by itself. */}
        {eligible > 0 && (
          <button
            type="button"
            disabled={blocked}
            title={
              eligible < count
                ? `${count - eligible} of the picked are not Interested yet, or are eye-marked without a CV`
                : undefined
            }
            onClick={onPipeline}
            className="ml-1 rounded-full bg-white px-4 py-1.5 text-small font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
          >
            {eligible === count
              ? "Add to pipeline"
              : `Add ${eligible} of ${count} to pipeline`}
          </button>
        )}
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear the picks"
          className="ml-1 rounded-full px-2 py-1.5 text-small text-white/70 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** The Chrome capture extension: connected or not, and what it does. */
function CaptureChip() {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={
          BTN +
          " gap-2 bg-success-soft font-normal text-success hover:bg-brand-soft"
        }
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
          <rect x="4" y="4" width="16" height="13" rx="3" />
          <path d="m9 10.5 2 2 4-4" />
        </svg>
        Chrome capture connected
      </button>
      {shown && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Chrome capture"
          className={LIFT + " right-0 top-full w-80 text-small text-ink-2"}
        >
          On a LinkedIn profile, press the capture button and the person lands
          in your sheet for today, with what the page shows. It reads only the
          page you have open, when you press it.
        </div>
      )}
    </div>
  );
}

/** Export: copy for Excel, or download the sheet. */
function ExportMenu({
  rows,
  file,
  onCopied,
}: {
  rows: () => string[][];
  file: string;
  onCopied: () => void;
}) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const csv = (r: string[][]) =>
    r
      .map((l) =>
        l
          .map((c) => `"${c.replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`)
          .join(","),
      )
      .join("\r\n");
  const item =
    "flex w-full rounded-sm px-3 py-2 text-left text-small text-ink hover:bg-surface-2";
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={
          BTN + " gap-2 border border-border text-ink hover:bg-surface-2"
        }
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
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
        Export
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="size-3"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {shown && (
        <div
          ref={panel}
          role="menu"
          className={LIFT + " right-0 top-full w-60 p-1.5"}
        >
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              void navigator.clipboard?.writeText(
                rows()
                  .map((l) => l.join("\t"))
                  .join("\n"),
              );
              setOpen(false);
              onCopied();
            }}
          >
            Copy for Excel
          </button>
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([csv(rows())], { type: "text/csv" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = file;
              a.click();
              URL.revokeObjectURL(url);
              setOpen(false);
            }}
          >
            Download this sheet
          </button>
        </div>
      )}
    </div>
  );
}

const EyeIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-[max(1.1rem,15px)]"
    aria-hidden="true"
  >
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const SearchIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    className="size-[max(1rem,13px)] shrink-0"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
);

/** "· 2 notes": a press opens them (readable on touch), each with a remove ✕. */
function NotesList({
  x,
  can,
  onRemove,
}: {
  x: Row;
  can: boolean;
  onRemove: (i: number) => void;
}) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  return (
    <span ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="text-caption font-normal text-ink-3 hover:text-ink"
      >
        · {x.notes.length} {x.notes.length === 1 ? "note" : "notes"}
      </button>
      {shown && (
        <div
          ref={panel}
          role="dialog"
          aria-label={`Notes on ${x.name}`}
          className={LIFT + " left-0 top-full w-[min(20rem,80vw)] font-normal"}
        >
          <ul className="flex flex-col gap-2">
            {x.notes.map((n, i) => (
              <li key={i} className="flex items-start gap-2 text-small text-ink">
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{n}</span>
                {can && (
                  <button
                    type="button"
                    onClick={() => {
                      onRemove(i);
                      if (x.notes.length === 1) setOpen(false);
                    }}
                    aria-label="Remove this note"
                    className="shrink-0 text-ink-3 hover:text-danger"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
