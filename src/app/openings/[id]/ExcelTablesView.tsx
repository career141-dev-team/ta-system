"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { DUR, EASE, gsap, useExit, useTabGlide } from "@/lib/gsap";
import { useWorkdayGate } from "@/lib/workday";
import { BackButton, LinkedInIcon } from "./PipelineBoard";
import FindCvButton from "./FindCvButton";
import PillMenu, { type MenuOption } from "./PillMenu";
import Toast from "./Toast";
import { sendToPipeline } from "./pipelineInbox";
import WorkdayBlocked from "./WorkdayBlocked";
import { FIELD_PILL } from "./filters";
import { useFilters } from "@/lib/filters";
import { jobFromAddress, LIVE, useLive } from "@/lib/backend";
import { actionFor, addedBucket, sendLink, sheetDate, sheetsOf, useLiveLinks, VIA_FROM, type LiveLinks, type LiveRow } from "./excelLive";
import { useLiftMenu } from "./liftMenu";
import { useOpeningView } from "./view";

const CvPreview = dynamic(() => import("./CvPreview"), { ssr: false });
const FADE = { opacity: 0 };
import type { Profile } from "@/lib/linkedinProfile";
import { useSignedHeaders } from "@/lib/backend";

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
// Signed in, the rows and sheets are real (D8a, excelLive.ts); signed out, the sample.

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
  email?: string;
  via?: Via;
  interest: Interest;
  why?: string;
  eye: boolean;
  hasCv: boolean;
  addOn: boolean;
  pipeline?: string;
  addedBy: string;
  added: "today" | "yesterday" | "week" | "older";
  location?: string;
  notes: string[];
  matches?: { name: string; detail: string }[];
  /** Read from LinkedIn by "Extract with AI". */
  profile?: Profile;
  /** Another TA shortlisted this person first: nothing to send to the pipeline. */
  shortlistedBy?: string;
};
// own: false = a sheet only another TA's rows sit on (live) - not this person's to rename or delete.
type Sheet = { n: number; date: string; name?: string; own?: boolean };

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

/** A row from the TA System, in this screen's shape. */
function liveRow(l: LiveRow, where: Map<string, string>): Row {
  const slug = l.url.match(LI)?.[1] ?? "";
  return {
    id: l.id,
    sheet: l.sheet,
    name: l.name || nameFrom(slug),
    title: l.title ?? "",
    company: l.company ?? "",
    url: l.url,
    phone: l.phone ?? undefined,
    via: (VIA_FROM[l.phoneSource ?? ""] as Via | undefined) ?? undefined,
    interest: l.interest,
    why: l.why ?? undefined,
    eye: l.eye,
    hasCv: l.hasCv,
    addOn: l.addOn,
    pipeline: l.pipeline ?? undefined,
    addedBy: l.mine ? ME : l.addedBy,
    added: addedBucket(l.createdAt),
    location: l.workLocationId ? where.get(l.workLocationId) : undefined,
    notes: l.notes.map((n) => n.note),
    matches: l.cvMatch ? [{ name: l.cvMatch.name, detail: l.cvMatch.reasons.join(" · ") }] : undefined,
    shortlistedBy: l.shortlistedBy ?? undefined,
  };
}
const keyOf = (url: string) => (url.match(LI)?.[1] ?? url).toLowerCase();
const digits = (s: string) => s.replace(/[\s\-().+]/g, "");

// Redesigned 17 Nov 2026 on DESIGN.md (owner: "this section feels like it has a
// completely different design style"): one row of sheets, one toolbar, a quiet table.
const BTN =
  "flex h-[max(2.6rem,34px)] items-center whitespace-nowrap rounded-full px-[max(0.9rem,11px)] text-small font-medium transition-colors";
/** The small buttons inside a row: Yes, No, Add to pipeline. */
const ROW_BTN =
  "flex h-[max(2rem,28px)] shrink-0 items-center whitespace-nowrap rounded-full px-[max(0.8rem,10px)] text-small font-medium transition-colors disabled:opacity-40";
/** A sheet or interest tab inside its grey track. */
const TAB =
  "relative flex h-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-[max(0.9rem,10px)] text-small transition-colors";
const LIFT =
  "absolute z-40 rounded-md border border-border bg-surface p-[max(0.9rem,10px)] shadow-float";
/** Rows near the bottom of a long list open their panels upwards. */
const place = (up?: boolean) => (up ? " bottom-full mb-2" : " top-full mt-2");
const tabTone = (on: boolean) =>
  on ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink";
const TH =
  "sticky top-0 z-10 border-b border-border bg-surface py-[max(0.65rem,8px)] pr-4 text-caption font-medium text-ink-3";
const TD = "border-b border-border py-[max(0.7rem,8px)] pr-4 align-middle";
const INPUT =
  "w-full rounded-sm border border-border-strong bg-surface px-2.5 py-1.5 text-small outline-none focus:border-brand";

export default function ExcelTablesView() {
  const signed = useSignedHeaders();
  const gate = useWorkdayGate();
  // Signed in on a real opening: the old table's rows and this person's sheets.
  const live = useLive();
  const [job] = useState(jobFromAddress);
  const signedIn = live && !!job;
  const [rows, setRows] = useState<Row[]>(() => (LIVE && jobFromAddress() ? [] : START));
  const [sheets, setSheets] = useState<Sheet[]>(() => (LIVE && jobFromAddress() ? [] : SHEETS));
  const { data: liveData, error: liveError, reload } = useLiveLinks(job, signedIn);
  const liveById = useMemo(() => new Map((liveData?.rows ?? []).map((l) => [l.id, l])), [liveData]);
  // "all" shows every sheet at once.
  const [sheet, setSheet] = useState<number | null | "all">(3);
  // Interest tab, eye-marked / add-on ticks, search, who and when are kept per
  // opening for the visit; Reset puts them back (src/lib/filters.ts).
  const { f: kept, set: setKept, reset: resetFilters, active: nFilters } = useFilters(
    "excel2:" + (typeof window === "undefined" ? "" : (jobFromAddress() ?? "demo")),
    // Every sheet, everyone's rows (that this person may see), any time - old AURA's
    // own start (lib/linkViews: by "", day ""). "me" + "today" hid every row added
    // before today, so jobs with 95 LinkedIn rows showed an empty table (20 Nov).
    { interest: "all" as string, eyeOnly: false as boolean, addOnsOnly: false as boolean, q: "", by: "all" as string, added: "any" },
  );
  const { eyeOnly, addOnsOnly, q, by, added } = kept;
  const interest = kept.interest as Interest | "all";
  const setInterest = (v: Interest | "all") => setKept({ interest: v });
  const setEyeOnly = (v: boolean | ((x: boolean) => boolean)) => setKept({ eyeOnly: typeof v === "function" ? v(eyeOnly) : v });
  const setAddOnsOnly = (v: boolean | ((x: boolean) => boolean)) => setKept({ addOnsOnly: typeof v === "function" ? v(addOnsOnly) : v });
  const setQ = (v: string) => setKept({ q: v });
  const setBy = (v: string) => setKept({ by: v });
  const setAdded = (v: string) => setKept({ added: v });
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

  // Each new read replaces the table (React's pattern for state that follows a value).
  const [seenLive, setSeenLive] = useState<LiveLinks | null>(null);
  if (liveData && liveData !== seenLive) {
    const first = !seenLive;
    setSeenLive(liveData);
    const where = new Map(liveData.locations.map((l) => [l.id, l.name]));
    setRows(liveData.rows.map((l) => liveRow(l, where)));
    setSheets(sheetsOf(liveData.sheets, liveData.rows).map((x) => ({ n: x.n, date: sheetDate(x.at), name: x.name ?? undefined, own: x.own })));
    setUndo(liveData.undo ? { sheet: { n: liveData.undo.n, date: "", name: liveData.undo.name ?? undefined }, ids: [] } : null);
    if (first) setSheet("all");
  }
  const [seenError, setSeenError] = useState<string | null>(null);
  if (liveError !== seenError) {
    setSeenError(liveError);
    if (liveError) say(liveError, undefined, true);
  }
  // One old-table action; its sentence is said, then the table is read again.
  const send = async (body: Record<string, unknown>) => {
    const res = await sendLink(body);
    say(res.message, undefined, !res.ok);
    void reload();
    return res.ok;
  };

  const mine = (x: Row) => x.addedBy === ME;
  const edit = (id: string, patch: Partial<Row>) => {
    const lr = signedIn ? liveById.get(id) : undefined;
    if (lr && job) {
      // "Same person" on a match the TA System found: the old CV-match answer.
      if (patch.hasCv) {
        if (lr.cvMatch) void send({ do: "cvMatch", openingId: job, entryId: id, decision: "same" });
        else return say("Finding a CV in the database is not switched on here yet - do it in AURA for now.", undefined, true);
      } else {
        const body = actionFor(lr, patch as Record<string, unknown>, job, rows.find((x) => x.id === id)?.notes.length ?? 0, liveData?.locations ?? []);
        if (body) void send(body);
      }
    }
    setRows((all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

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
  // What pressing the chip shows (sheet + who added it). It counted only this
  // person's own rows, so a lead's chips read 0 over a TA's 51 rows (20 Nov).
  const byWho = (x: Row) => by === "all" || x.addedBy === by;
  const sheetCount = (n: number | null) =>
    rows.filter((x) => x.sheet === n && byWho(x)).length;
  const loose = sheetCount(null);

  // ---- Sheets ----
  const addSheet = () => {
    if (signedIn && job) return void send({ do: "addSheet", openingId: job });
    // The lowest number no live sheet uses, as the old system does.
    let n = 1;
    while (sheets.some((s) => s.n === n)) n++;
    setSheets((s) => [...s, { n, date: "Today" }].sort((a, b) => a.n - b.n));
    setSheet(n);
    setAdded("any");
    say(`L${n} started - new people you add go here`);
  };
  const renameSheet = (n: number, name: string) =>
    signedIn && job ? void send({ do: "renameSheet", openingId: job, level: String(n), name: name.trim().slice(0, 40) }) : setSheets((all) =>
      all.map((s) =>
        s.n === n ? { ...s, name: name.trim().slice(0, 40) || undefined } : s,
      ),
    );
  const deleteSheet = (s: Sheet) => {
    if (signedIn && job) {
      if (sheet === s.n) setSheet("all");
      return void send({ do: "deleteSheet", openingId: job, level: String(s.n) });
    }
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
    if (signedIn && job) {
      setSheet(undo.sheet.n);
      return void send({ do: "restoreSheet", openingId: job, level: String(undo.sheet.n) });
    }
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
  const addFromPaste = (text: string, p?: Profile) => {
    if (gate) return false;
    if (signedIn && job) {
      // The old table's own add: one link (read from LinkedIn when asked), or pasted
      // Excel rows; it picks the sheet, skips people already there and says so.
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const level = typeof sheet === "number" ? String(sheet) : "";
      if (lines.length > PASTE_MAX) {
        say(`That is ${lines.length} rows. Paste up to ${PASTE_MAX} at a time.`, undefined, true);
        return false;
      }
      const one = lines.length === 1 && !text.includes("\t");
      if (one && !LI.test(text)) {
        say("That is not a LinkedIn profile link. It should look like linkedin.com/in/their-name.", undefined, true);
        return false;
      }
      // The old add also looks for their CV and takes ~9 s live (20 Nov): say it
      // is working at once, so the cleared box does not read as "nothing happened".
      say(one ? (p ? "Reading the profile and adding it…" : "Adding the profile…") : `Adding ${lines.length} rows…`);
      void send(one ? { do: p ? "extract" : "add", openingId: job, url: text.trim(), level } : { do: "paste", openingId: job, rows: text, level });
      return true;
    }
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
        p?.name || nameFrom(slug),
        p?.title ?? "",
        p?.company ?? "",
        {
          profile: p,
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
        p
          ? ` added to L${target} - read from LinkedIn`
          : ` added to L${target} - name guessed from the link, check it`,
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
    if (signedIn && job) {
      // Interested is the old table's Yes (it shortlists and claims them too).
      void send(fromYes ? { do: "interest", openingId: job, entryId: x.id, interest: "interested" } : { do: "toPipeline", openingId: job, entryId: x.id });
      return true;
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
  const tabsRow = useRef<HTMLDivElement>(null);
  useTabGlide(tabsRow, interest);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col px-[max(1.5rem,14px)] pb-[max(1.4rem,12px)] pt-[max(1.4rem,14px)] max-md:pt-11 md:max-[1400px]:pt-[max(3.4rem,34px)]">
      {/* Sheets, capture, export: one row that never wraps on a laptop; the sheets
          slide sideways inside their track when there are many. */}
      <div className="flex items-center gap-[max(0.75rem,8px)] max-md:flex-wrap">
        <BackButton />
        <div
          role="tablist"
          aria-label="L-sheets"
          className="flex h-[max(2.6rem,34px)] min-w-0 items-center gap-0.5 overflow-x-auto rounded-full bg-surface-2 p-1 [scrollbar-width:none]"
        >
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
              onRename={s.own === false ? undefined : (name) => renameSheet(s.n, name)}
              onDelete={s.own === false ? undefined : () => deleteSheet(s)}
            />
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={sheet === "all"}
            onClick={() => {
              setSheet("all");
              setTicked([]);
              setAdded("any");
            }}
            className={TAB + " " + tabTone(sheet === "all")}
          >
            All sheets
            <span className="text-ink-3">{rows.filter(byWho).length}</span>
          </button>
          {loose > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={sheet === null}
              onClick={() => setSheet(null)}
              className={TAB + " " + tabTone(sheet === null)}
            >
              Not in a sheet
              <span className="text-ink-3">{loose}</span>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={addSheet}
          disabled={!!gate}
          title="Start a new L-sheet - new people you add go there"
          className={
            BTN +
            " shrink-0 gap-1.5 px-3 font-normal text-ink-2 hover:bg-surface-2 hover:text-brand disabled:opacity-40 disabled:hover:bg-transparent"
          }
        >
          <PlusIcon />
          L-sheet
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-2 max-md:ml-0">
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

      <PasteBar
        disabled={!!gate}
        onAdd={addFromPaste}
        onExtract={async (text) => {
          const link = text.trim();
          if (!LI.test(link) || link.includes("\n")) {
            say("Paste one LinkedIn profile link to extract it.", undefined, true);
            return false;
          }
          if (rows.some((x) => mine(x) && keyOf(x.url) === keyOf(link)))
            return addFromPaste(link); // already there: says so
          try {
            return addFromPaste(link, await fetchProfile(link, await signed()));
          } catch (e) {
            say(e instanceof Error ? e.message : "Extract failed", undefined, true);
            return false;
          }
        }}
      />

      {/* One toolbar: interest tabs, two toggles, then search and the two menus. */}
      <div className="mt-[max(0.9rem,10px)] flex flex-wrap items-center gap-2">
        <div
          ref={tabsRow}
          role="tablist"
          aria-label="Interest"
          className="relative flex h-[max(2.6rem,34px)] max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-full bg-surface-2 p-1 [scrollbar-width:none]"
        >
          <span
            data-tab-glide
            aria-hidden="true"
            style={{ opacity: 0 }}
            className="pointer-events-none absolute left-0 top-0 rounded-full bg-surface shadow-card"
          />
          {INTEREST_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={interest === t.key}
              onClick={() => setInterest(t.key)}
              className={
                TAB +
                " " +
                (interest === t.key ? "text-ink" : "text-ink-2 hover:text-ink")
              }
            >
              {t.label}
              <span className="text-ink-3">
                {t.key === "all"
                  ? base.length
                  : base.filter((x) => x.interest === t.key).length}
              </span>
            </button>
          ))}
        </div>
        <Toggle
          on={eyeOnly}
          onClick={() => setEyeOnly((v) => !v)}
          icon={<EyeIcon />}
          label="Eye-marked"
        />
        <Toggle
          on={addOnsOnly}
          onClick={() => setAddOnsOnly((v) => !v)}
          icon={<PlusIcon />}
          label="Add-ons"
        />
        <div className="ml-auto flex items-center gap-2 max-md:ml-0 max-md:w-full max-md:flex-wrap">
          <label
            className={
              FIELD_PILL +
              " w-[max(14rem,150px)] min-w-0 text-ink-3 focus-within:ring-2 focus-within:ring-brand/20 max-md:flex-1"
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
            pillClass={FIELD_PILL + " text-ink-2"}
          />
          <PillMenu
            key={`added-${added}`}
            options={ADDED}
            initial={added}
            onChange={setAdded}
            prefix="Added:"
            mark="tick"
            pillClass={FIELD_PILL + " text-ink-2"}
          />
          {nFilters > 0 && (
            <button type="button" onClick={resetFilters} className="h-[max(2.4rem,33px)] shrink-0 rounded-full px-3 text-small font-medium text-brand-strong hover:bg-surface-2">
              Reset{nFilters > 1 ? ` (${nFilters})` : ""}
            </button>
          )}
        </div>
      </div>

      {/* The table: a quiet sticky header, scrolls inside itself. */}
      <div
        className={
          "mt-[max(0.9rem,10px)] min-h-0 flex-1 overflow-auto rounded-md border border-border bg-surface [&::-webkit-scrollbar]:size-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border-strong [&::-webkit-scrollbar-track]:my-4 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-corner]:bg-transparent " +
          (ticked.length ? "pb-20" : "")
        }
      >
        <table className="w-full min-w-[max(64rem,1000px)] table-fixed border-separate border-spacing-0 text-left">
          <colgroup>
            <col className="w-[max(3rem,38px)]" />
            <col className="w-[34%]" />
            <col className="w-[max(10.5rem,128px)]" />
            <col className="w-[max(13rem,150px)]" />
            <col className="w-[max(5.5rem,68px)]" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th className={TH + " pl-4"}>
                <span className="sr-only">Pick</span>
              </th>
              <th className={TH}>Person</th>
              <th className={TH}>Phone</th>
              <th className={TH}>Interest</th>
              <th className={TH}>
                <span className="sr-only">Eye-mark and notes</span>
              </th>
              <th className={TH + " pr-4 text-right"}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((x, i) => (
              <TableRow
                key={x.id}
                x={x}
                mine={mine(x)}
                blocked={!!gate}
                up={shown.length > 4 && i >= shown.length - 3}
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
                  if (signedIn && job) void send({ do: "remove", openingId: job, entryId: x.id });
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
            if (signedIn && job) {
              for (const x of tickedRows.filter(mine)) void sendLink({ do: "note", openingId: job, entryId: x.id, note });
              say(`Note added to ${tickedRows.filter(mine).length}`);
              setTimeout(() => void reload(), 1500);
              return;
            }
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
            if (signedIn && job) {
              if (to === "approach") return say("Moving people back to To approach is not switched on here yet - do it in AURA for now.", undefined, true);
              const them = tickedRows.filter((x) => mine(x) && !x.pipeline && !x.shortlistedBy);
              for (const x of them)
                void sendLink({ do: "interest", openingId: job, entryId: x.id, interest: to === "yes" ? "interested" : "not_interested", ...(to === "no" ? { reason: why ?? "" } : {}) });
              say(`${them.length} sent to the TA System - the table shows each answer in a moment`);
              setTimeout(() => void reload(), 2000);
              return;
            }
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
            if (signedIn && job) {
              const id = liveData?.locations.find((l) => l.name === loc)?.id;
              if (!id) return say("That work location is not on this opening.", undefined, true);
              return void send({ do: "locationMany", openingId: job, targetWorkLocationId: id, entryId: tickedRows.filter(mine).map((x) => x.id) });
            }
            setRows((all) =>
              all.map((x) =>
                ticked.includes(x.id) && mine(x) ? { ...x, location: loc } : x,
              ),
            );
            say(`${ticked.length} set to ${loc}`);
          }}
          onPipeline={() => {
            if (signedIn && job) {
              void send({ do: "toPipelineMany", openingId: job, entryId: eligible.map((x) => x.id) });
              setTicked([]);
              return;
            }
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

/** One L-sheet: pick it; double-click (or F2) renames, blank brings the date back;
 *  the ✕ on the open sheet deletes it. */
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
  onRename?: (name: string) => void;
  onDelete?: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const rename = () => {
    if (!onRename) return;
    setDraft(s.name ?? "");
    setRenaming(true);
  };
  if (renaming)
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onRename?.(draft);
          setRenaming(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setRenaming(false);
        }}
        maxLength={40}
        placeholder={s.date}
        aria-label={`Rename L${s.n}`}
        className="h-full w-[max(10rem,120px)] shrink-0 rounded-full bg-surface px-3 text-small text-ink shadow-card outline-none ring-2 ring-brand/30"
      />
    );
  const label = s.name ?? s.date;
  return (
    <span
      className={
        "flex h-full shrink-0 items-center rounded-full transition-colors " +
        (on ? "bg-surface shadow-card" : "")
      }
    >
      <button
        type="button"
        role="tab"
        aria-selected={on}
        onClick={onPick}
        onDoubleClick={rename}
        onKeyDown={(e) => e.key === "F2" && rename()}
        title={`L${s.n} · ${label}${onRename ? " - double-click to rename" : ""}`}
        className={
          TAB + (on ? " pr-1.5 text-ink" : " text-ink-2 hover:text-ink")
        }
      >
        <b className="font-semibold">L{s.n}</b>
        <span className="max-w-[max(9rem,90px)] truncate">{label}</span>
        <span className="text-ink-3">{count}</span>
      </button>
      {on && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete L${s.n}`}
          title="Delete this sheet - its rows stay, under Not in a sheet"
          className="mr-1.5 flex size-[max(1.4rem,20px)] shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger"
        >
          <CloseIcon />
        </button>
      )}
    </span>
  );
}

/** "Paste a LinkedIn profile link — or paste many rows straight from Excel". */
function PasteBar({
  disabled,
  onAdd,
  onExtract,
}: {
  disabled: boolean;
  onAdd: (text: string) => boolean;
  onExtract: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // Always green, as drawn; an empty press puts the cursor in the box.
  const box = useRef<HTMLTextAreaElement>(null);
  const go = () => {
    if (!text.trim()) return box.current?.focus();
    if (onAdd(text)) setText("");
  };
  const extract = async () => {
    if (!text.trim()) return box.current?.focus();
    setBusy(true);
    if (await onExtract(text)) setText("");
    setBusy(false);
  };
  return (
    <div className="mt-[max(0.9rem,10px)] flex items-center gap-3 rounded-lg bg-surface-2 py-1 pl-[max(1.1rem,12px)] pr-1 transition-shadow focus-within:ring-2 focus-within:ring-brand/20">
      <LinkedInIcon className="size-[max(1.3rem,17px)]" />
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
        className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-small text-ink outline-none placeholder:text-ink-3 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={extract}
        disabled={disabled || busy}
        title="Read the profile from LinkedIn: name, title, company, skills, experience (about $0.004)"
        className={
          BTN +
          " shrink-0 border border-border bg-surface text-brand hover:bg-brand-tint disabled:opacity-40"
        }
      >
        {busy ? "Extracting…" : "Extract with AI"}
      </button>
      <button
        type="button"
        onClick={go}
        disabled={disabled || busy}
        className={
          BTN +
          " shrink-0 bg-brand text-white hover:bg-brand-strong disabled:opacity-40"
        }
      >
        Add to table
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
        "flex h-[max(2.6rem,34px)] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-[max(1rem,11px)] text-small transition-colors " +
        (on
          ? "border-brand/30 bg-brand-tint text-brand"
          : "border-border bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink")
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
  up,
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
  /** Near the bottom of the list: panels open upwards. */
  up: boolean;
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
  // The linked CV, read in a window over the table (the name opens it). The backend row
  // carries no candidate id yet, so until it does the viewer shows the sample layout.
  const [cvOpen, setCvOpen] = useState(false);
  const cvBox = useRef<HTMLDivElement>(null);
  const cvShown = useExit(cvOpen, cvBox, FADE);
  const sub = [x.title || "Title to check", x.company, x.location]
    .filter(Boolean)
    .join(" · ");
  // Find CV and ⋯ stay quiet until the row is pointed at, focused or picked -
  // except Find CV on an eye-marked person with no CV: the pipeline waits on it.
  const needsCv = x.eye && !x.hasCv;
  const quiet =
    ticked || needsCv
      ? ""
      : " opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 pointer-coarse:opacity-100";
  return (
    <>
    <tr
      className={
        "group text-small transition-colors " +
        (ticked ? "bg-brand-tint" : "hover:bg-canvas")
      }
    >
      <td className={TD + " pl-4"}>
        <input
          type="checkbox"
          checked={ticked}
          disabled={!mine}
          onChange={onTick}
          aria-label={`Pick ${x.name}`}
          className="size-[max(1.05rem,15px)] accent-[var(--color-brand)] disabled:opacity-40"
        />
      </td>
      <td className={TD}>
        <div className="flex min-w-0 items-center gap-3">
          <a
            href={x.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`${x.name} on LinkedIn`}
            className="shrink-0 hover:opacity-80"
          >
            <LinkedInIcon className="size-[max(1.3rem,17px)]" />
          </a>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              {x.hasCv ? (
                <button
                  type="button"
                  onClick={() => setCvOpen(true)}
                  title={`Read ${x.name}'s CV`}
                  className="truncate rounded-xs text-left font-medium text-brand hover:underline"
                >
                  {x.name}
                </button>
              ) : (
                <span className="truncate font-medium text-ink" title={x.name}>
                  {x.name}
                </span>
              )}
              {x.addOn && (
                <span className="shrink-0 rounded-full bg-violet-soft px-2 text-caption font-medium text-violet">
                  Add-on
                </span>
              )}
            </div>
            <p className="truncate text-caption text-ink-3" title={sub}>
              {sub}
            </p>
          </div>
        </div>
      </td>
      <td className={TD}>
        <Phone
          x={x}
          can={can}
          up={up}
          onSave={(phone, via) => edit({ phone, via })}
        />
      </td>
      <td className={TD}>
        <InterestChip x={x} />
      </td>
      <td className={TD}>
        <div className="flex items-center gap-0.5">
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
              "flex size-[max(2rem,28px)] items-center justify-center rounded-full transition-colors disabled:cursor-default " +
              (x.eye
                ? "bg-warn-soft text-warn"
                : "text-border-strong hover:bg-surface-2 hover:text-ink-3 disabled:hover:bg-transparent disabled:hover:text-border-strong")
            }
          >
            <EyeIcon />
          </button>
          {x.notes.length > 0 && (
            <NotesList
              x={x}
              can={can}
              up={up}
              onRemove={(i) => edit({ notes: x.notes.filter((_, j) => j !== i) })}
            />
          )}
        </div>
      </td>
      <td className={TD + " pr-4"}>
        <div className="flex items-center justify-end gap-2">
          {!mine ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap text-caption text-ink-3">
              <LockIcon />
              {x.addedBy}&apos;s row
            </span>
          ) : x.shortlistedBy ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap text-caption text-ink-3">
              <LockIcon />
              Shortlisted first by {x.shortlistedBy}
            </span>
          ) : x.pipeline ? (
            <>
              <button
                type="button"
                onClick={() => go("pipeline")}
                title="Open the Pipeline"
                className="flex h-[max(2rem,28px)] min-w-0 items-center gap-1 rounded-full bg-brand-soft px-3 text-caption font-medium text-brand transition-colors hover:bg-brand-tint"
              >
                <span className="truncate">In pipeline · {x.pipeline}</span>
                <span aria-hidden="true">→</span>
              </button>
              <NoButton
                name={x.name}
                blocked={blocked}
                up={up}
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
                ROW_BTN +
                " border border-border font-normal text-success hover:bg-success-soft"
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
                className={ROW_BTN + " bg-brand text-white hover:bg-brand-strong"}
              >
                Add to pipeline
              </button>
              <NoButton
                name={x.name}
                blocked={blocked}
                up={up}
                label="Not interested"
                onSave={onNo}
              />
            </>
          ) : x.interest === "approach" ? (
            <>
              <span className="whitespace-nowrap text-caption text-ink-3">
                Interested?
              </span>
              <button
                type="button"
                disabled={blocked}
                // Interested puts them in the pipeline at once, as the old
                // system does (owner, 13 Nov 2026); refused like Add to pipeline.
                onClick={onYes}
                aria-label={`${x.name} is interested`}
                className={
                  ROW_BTN +
                  " border border-border font-normal text-success hover:bg-success-soft"
                }
              >
                Yes
              </button>
              <NoButton
                name={x.name}
                blocked={blocked}
                up={up}
                onSave={(why) => {
                  edit({ interest: "no", why });
                  say(" marked not interested", x.name);
                }}
              />
            </>
          ) : null}
          {x.profile && <DetailsButton x={x} p={x.profile} edit={edit} />}
          {can && <NoteButton x={x} up={up} edit={edit} say={say} />}
          {mine && (
            <div className={"flex shrink-0 items-center gap-1.5 transition-opacity" + quiet}>
              {x.hasCv ? (
                <button
                  type="button"
                  onClick={() => setCvOpen(true)}
                  className="whitespace-nowrap text-caption font-medium text-brand hover:underline"
                >
                  View CV
                </button>
              ) : (
                <FindCvButton
                  name={x.name}
                  matches={x.matches}
                  onView={() => setCvOpen(true)}
                  up={up}
                  className="whitespace-nowrap"
                  onLinked={() => {
                    edit({ hasCv: true });
                    say(" - their CV is linked from the database", x.name);
                  }}
                />
              )}
              <RowMenu
                x={x}
                blocked={blocked}
                up={up}
                edit={edit}
                say={say}
                onRemove={onRemove}
              />
            </div>
          )}
        </div>
      </td>
    </tr>
    {cvShown && <CvPreview ref={cvBox} name={x.name} title={x.title} onClose={() => setCvOpen(false)} />}
    </>
  );
}

/** "See details": everything the extract read, as a profile card in a dialog (Esc or the
 *  backdrop closes). Header with the person and their LinkedIn link, then About, Skills,
 *  Experience as a timeline and Education, each in its own soft panel. */
/** Reads one LinkedIn profile through the extract route; throws a sentence a TA can read. */
async function fetchProfile(link: string, auth: Record<string, string> = {}): Promise<Profile> {
  const res = await fetch("/api/linkedin-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ url: link }),
  });
  const data = await res.json().catch(() => {
    throw new Error("Extract needs the server: a local copy with APIFY_TOKEN set, or the dev link once the key is in Cloudflare.");
  });
  if (!res.ok) throw new Error(data.error ?? "Extract failed");
  return data as Profile;
}

/** A long About cut at a sentence end near 500 characters: the gist, not the essay. */
function brief(t: string, max = 500) {
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  return (stop > max / 2 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, "") + "…").trim();
}

function DetailsButton({ x, p, edit }: { x: Row; p: Profile; edit: (patch: Partial<Row>) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<{ x: number; y: number }>();
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          const b = e.currentTarget.getBoundingClientRect();
          setFrom({ x: b.left + b.width / 2, y: b.top + b.height / 2 });
          setOpen(true);
        }}
        className={ROW_BTN + " border border-border font-normal text-ink-2 hover:bg-surface-2 hover:text-ink"}
      >
        See details
      </button>
      {open && <DetailsDialog x={x} p={p} edit={edit} from={from} onClose={() => setOpen(false)} />}
    </>
  );
}

function DetailsDialog({ x, p, edit, from, onClose }: { x: Row; p: Profile; edit: (patch: Partial<Row>) => void; from?: { x: number; y: number }; onClose: () => void }) {
  const signed = useSignedHeaders();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  // Lifts in like the other dialogs. fromTo, not from: development runs effects twice,
  // and a second from() would take the already-hidden state as its end.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    gsap.fromTo(el.querySelector("[data-veil]"), { opacity: 0 }, { opacity: 1, duration: DUR.fast });
    // Cute: the window grows out of the See details button with a little overshoot, then
    // its tiles and panels pop in one after another.
    const box = el.querySelector<HTMLElement>("[data-box]")!;
    const r = box.getBoundingClientRect();
    const origin = from ? `${from.x - r.left}px ${from.y - r.top}px` : "50% 50%";
    gsap.fromTo(box, { opacity: 0, scale: 0.55, transformOrigin: origin }, { opacity: 1, scale: 1, duration: DUR.base * 1.4, ease: EASE.bounce, clearProps: "transform,opacity,transformOrigin" });
    gsap.fromTo(box.querySelectorAll("[data-pop]"), { opacity: 0, y: 14, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: DUR.base, ease: EASE.pop, stagger: 0.045, delay: 0.14, clearProps: "transform,opacity" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [prof, setProf] = useState(p);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(x.email ?? "");
  const [phone, setPhone] = useState(x.phone ?? "");
  const role = [prof.title, prof.company].filter(Boolean).join(" at ") || prof.headline;
  const initials = prof.name.split(" ").map((w) => w[0]).join("").slice(0, 2);
  // Sizes from the Figma frame (1920 wide; 1rem = 16px there), each with a px floor.
  const t22 = "text-[max(1.375rem,16px)]";
  const t18 = "text-[max(1.125rem,14px)]";
  const t14 = "text-[max(0.9375rem,13px)]";
  const t13 = "text-[max(0.875rem,12px)]";
  const t12 = "text-[max(0.8125rem,12px)]";
  const label = "text-[max(0.75rem,11px)] font-medium tracking-[0.06em] text-ink-3";
  const tileBox = "flex min-w-0 flex-col gap-[3px] rounded-md bg-canvas px-4 py-3";
  const box = "flex flex-col gap-2 rounded-[1.25rem] bg-canvas px-[1.125rem] py-4 min-h-0 overflow-y-auto max-lg:max-h-80";
  const edu = prof.education[0];
  const lang = prof.languages?.join(" · ");
  const btn = "flex h-[2.7rem] shrink-0 items-center justify-center gap-2 rounded-full border border-border-strong bg-surface px-5 font-medium text-ink hover:bg-surface-2 disabled:opacity-40 " + t14;
  // The 16 things the extract can fill; the banner counts the ones it found.
  const fields = [prof.name, prof.headline, prof.about, prof.title, prof.company, prof.place, prof.total, lang, edu?.degree, prof.skills.length, prof.experience.length, prof.education.length, x.url, x.email, x.phone, prof.experience[0]?.period];
  const filled = fields.filter(Boolean).length;
  const missing = [!x.email && "Email", !x.phone && "Phone"].filter(Boolean).join(" and ");
  const slug = x.url.replace(/^https?:\/\/(www\.)?/, "").split("?")[0].replace(/\/$/, "");
  const reread = async () => {
    setBusy(true);
    setErr("");
    try {
      const fresh = await fetchProfile(x.url, await signed());
      setProf(fresh);
      edit({ profile: fresh });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Extract failed");
    }
    setBusy(false);
  };
  const save = () => {
    edit({ email: email.trim() || undefined, phone: phone.trim() || undefined, ...(phone.trim() && !x.phone ? { via: "other" as Via } : {}) });
    onClose();
  };
  const field = (name: string, val: string, set: (v: string) => void, saved?: string) => (
    <div data-pop className={tileBox}>
      <p className={label}>{name.toUpperCase()}</p>
      {editing ? (
        <input
          value={val}
          onChange={(e) => set(e.target.value)}
          aria-label={name}
          maxLength={120}
          className={"w-full rounded-xs border border-brand bg-surface px-2 py-0.5 text-ink outline-none focus:ring-2 focus:ring-brand/20 " + t14}
        />
      ) : saved ? (
        <p className={"truncate font-medium text-ink " + t14}>{saved}</p>
      ) : (
        <p className="flex items-center gap-2">
          <span className={"text-ink-3 " + t14}>Not on profile</span>
          <button type="button" onClick={() => setEditing(true)} className={"font-medium text-brand hover:text-brand-strong " + t13}>
            Add
          </button>
        </p>
      )}
    </div>
  );
  const tile = (name: string, v?: string) => (
    <div data-pop className={tileBox}>
      <p className={label}>{name.toUpperCase()}</p>
      <p className={"truncate font-medium " + t14 + (v ? " text-ink" : " text-ink-3")}>{v || "Not on profile"}</p>
    </div>
  );
  const count = (n: string | number) => <span className="text-brand tracking-normal">{n}</span>;
  return createPortal(
    <div ref={root} className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div data-veil className="absolute inset-0 bg-surface/20 backdrop-blur-[6px]" onClick={onClose} />
      <div
        data-box
        role="dialog"
        aria-modal="true"
        aria-label={`${prof.name} from LinkedIn`}
        className="relative flex h-[min(58rem,calc(100dvh-32px))] w-[min(95rem,100%)] flex-col overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-float"
      >
        <div className="flex shrink-0 items-center gap-4 border-b border-border px-7 py-6">
          <span className={"flex size-14 shrink-0 items-center justify-center rounded-full bg-sticky-sky font-medium text-brand " + t18}>{initials}</span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className={"truncate font-medium text-ink " + t22}>{prof.name}</h2>
            <p className={"truncate text-ink-2 " + t14}>{role}</p>
            {prof.place && (
              <p className={"flex items-center gap-1.5 text-ink-2 " + t13}>
                <svg viewBox="0 0 13 13" className="size-[13px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.08333" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.8333 5.41667C10.8333 8.66667 6.5 11.9167 6.5 11.9167C6.5 11.9167 2.16667 8.66667 2.16667 5.41667C2.16667 4.26739 2.62321 3.16519 3.43587 2.35254C4.24853 1.53988 5.35073 1.08333 6.5 1.08333C7.64927 1.08333 8.75147 1.53988 9.56413 2.35254C10.3768 3.16519 10.8333 4.26739 10.8333 5.41667Z" className="text-ink-3" />
                  <path d="M8.125 5.41667C8.125 6.31413 7.39746 7.04167 6.5 7.04167C5.60254 7.04167 4.875 6.31413 4.875 5.41667C4.875 4.5192 5.60254 3.79167 6.5 3.79167C7.39746 3.79167 8.125 4.5192 8.125 5.41667Z" className="text-ink-3" />
                </svg>
                <span className="truncate">{prof.place}</span>
              </p>
            )}
          </div>
          <div className="min-w-4 flex-1" />
          <span className={"flex shrink-0 items-center gap-2 rounded-full bg-violet/8 py-[7px] pl-3 pr-3.5 font-medium text-violet max-md:hidden " + t13}>
            <svg viewBox="0 0 13 13" className="size-[13px]" fill="currentColor" aria-hidden="true">
              <path d="M6.5 1.08333L7.8 5.2L11.9167 6.5L7.8 7.8L6.5 11.9167L5.2 7.8L1.08333 6.5L5.2 5.2L6.5 1.08333Z" />
            </svg>
            Extracted by AURA · just now
          </span>
          <a href={x.url} target="_blank" rel="noreferrer" className={btn + " pl-3.5 pr-[1.125rem] max-md:hidden"}>
            <LinkedInIcon className="size-[18px]" />
            LinkedIn
          </a>
          <button type="button" autoFocus onClick={onClose} aria-label="Close" className="flex size-[37px] shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink">
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4L4 12M4 4L12 12" />
            </svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-7 pb-6 pt-5 text-ink max-lg:overflow-y-auto">
          <div data-pop className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md bg-brand-tint px-4 py-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-[10px] bg-brand">
              <svg viewBox="0 0 11 11" className="size-[11px]" fill="none" stroke="white" strokeWidth="1.375" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9.16667 2.75L4.125 7.79167L1.83333 5.5" />
              </svg>
            </span>
            <span className={"font-medium text-ink " + t14}>AURA read the LinkedIn profile and filled {filled} of {fields.length} fields.</span>
            {missing && (
              <span className={"text-ink-2 " + t13}>
                {missing} {missing.includes("and") ? "are" : "is"} not on the profile. Add {missing.includes("and") ? "them" : "it"} if you know {missing.includes("and") ? "them" : "it"}.
              </span>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-3">
            <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
              {tile("Current position", prof.title)}
              {tile("Current company", prof.company)}
              {tile("Location", prof.place)}
              {tile("Total experience", prof.total)}
            </div>
            <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
              {field("Email", email, setEmail, x.email)}
              {field("Phone", phone, setPhone, x.phone)}
              {tile("Education", edu && (edu.degree || edu.school))}
              {tile("Languages", lang)}
            </div>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[640fr_464fr_360fr] grid-rows-[minmax(0,1fr)] gap-4 max-lg:flex-none max-lg:grid-cols-1 max-lg:grid-rows-none">
            <section data-pop className={box}>
              {prof.headline && (
                <>
                  <p className={label}>HEADLINE</p>
                  <p className={"font-medium leading-[1.375rem] text-ink " + t14}>{prof.headline}</p>
                </>
              )}
              {prof.about && (
                <>
                  <div className="h-1.5 shrink-0" />
                  <p className={label}>ABOUT</p>
                  <p className={"whitespace-pre-line leading-[1.3125rem] text-ink-2 " + t13}>{brief(prof.about)}</p>
                </>
              )}
            </section>
            <section data-pop className={box + " gap-3.5"}>
              <p className={"flex items-center gap-2 " + label}>
                EXPERIENCE {count(prof.experience.length + " roles")}
              </p>
              {prof.experience.map((e, i, all) => (
                <div key={i} className="flex shrink-0 gap-3">
                  <div className="flex w-2.5 shrink-0 flex-col items-center gap-1.5 pt-1.5">
                    <span aria-hidden="true" className={"size-2 shrink-0 rounded-[4px] " + (e.current ? "bg-brand" : "bg-border-strong")} />
                    {i < all.length - 1 && <span aria-hidden="true" className="min-h-1 w-[1.5px] flex-1 bg-border-strong" />}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-1">
                    <p className={"flex flex-wrap items-center gap-2 font-medium text-ink " + t14}>
                      {e.title || "Role not shown"}
                      {e.current && <span className={"rounded-[10px] bg-brand/10 px-2 py-0.5 font-medium text-brand " + "text-[max(0.75rem,11px)]"}>Current</span>}
                    </p>
                    <p className={"text-ink-2 " + t13}>{[e.company, e.kind].filter(Boolean).join(" · ")}</p>
                    <p className={"text-ink-2 " + t13}>{[e.period, e.length].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
              ))}
            </section>
            <div className="flex min-h-0 flex-col gap-4">
              {prof.skills.length > 0 && (
                <section data-pop className={box + " shrink"}>
                  <p className={"flex items-center gap-2 " + label}>SKILLS {count(prof.skills.length)}</p>
                  <div className="flex flex-wrap content-start gap-2">
                    {prof.skills.map((k) => (
                      <span key={k} className={"rounded-[14px] border border-border bg-surface px-[11px] py-1 text-ink " + t12}>
                        {k}
                      </span>
                    ))}
                  </div>
                </section>
              )}
              {edu && (
                <section data-pop className={box + " shrink-0 gap-[3px] overflow-visible"}>
                  <p className={label}>EDUCATION</p>
                  <p className={"font-medium text-ink " + t14}>{edu.degree || edu.school}</p>
                  {edu.degree && <p className={"text-ink-2 " + t13}>{edu.school}</p>}
                  {edu.years && <p className={"text-ink-2 " + t13}>{edu.years}</p>}
                </section>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-border px-7 py-4">
          <p className={"flex min-w-0 flex-1 items-center gap-2 " + t13 + (err ? " text-danger" : " text-ink-2")}>
            {err || (
              <>
                <svg viewBox="0 0 14 14" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.16667" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5.83333 7.58333C6.08385 7.91824 6.40346 8.19536 6.77049 8.39588C7.13752 8.59641 7.54338 8.71565 7.96055 8.74553C8.37771 8.7754 8.79643 8.71521 9.18828 8.56904C9.58014 8.42286 9.93598 8.19412 10.2317 7.89833L11.9817 6.14833C12.513 5.59824 12.8069 4.86149 12.8003 4.09675C12.7937 3.33201 12.4869 2.60047 11.9461 2.0597C11.4054 1.51892 10.6738 1.21218 9.90909 1.20553C9.14435 1.19889 8.40759 1.49287 7.8575 2.02417L6.85417 3.02167" className="text-ink-3" />
                  <path d="M8.16667 6.41667C7.91615 6.08176 7.59654 5.80464 7.22951 5.60412C6.86248 5.40359 6.45662 5.28435 6.03945 5.25447C5.62229 5.2246 5.20357 5.28479 4.81171 5.43096C4.41986 5.57714 4.06402 5.80588 3.76833 6.10167L2.01833 7.85167C1.48704 8.40176 1.19306 9.13851 1.1997 9.90325C1.20635 10.668 1.51309 11.3995 2.05386 11.9403C2.59464 12.4811 3.32617 12.7878 4.09091 12.7945C4.85565 12.8011 5.59241 12.5071 6.1425 11.9758L7.14 10.9783" className="text-ink-3" />
                </svg>
                <span className="truncate">Source: {slug} · saved to the L{x.sheet} sheet</span>
              </>
            )}
          </p>
          <button type="button" disabled={busy} onClick={reread} className={btn + " pl-[1.125rem] pr-5"}>
            <svg viewBox="0 0 16 16" className="size-4 text-ink-2" fill="none" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 8C2 6.4087 2.63214 4.88258 3.75736 3.75736C4.88258 2.63214 6.4087 2 8 2C9.67737 2.00631 11.2874 2.66082 12.4933 3.82667L14 5.33333" />
              <path d="M14 2V5.33333H10.6667" />
              <path d="M14 8C14 9.5913 13.3679 11.1174 12.2426 12.2426C11.1174 13.3679 9.5913 14 8 14C6.32263 13.9937 4.71265 13.3392 3.50667 12.1733L2 10.6667" />
              <path d="M5.33333 10.6667H2V14" />
            </svg>
            {busy ? "Reading…" : "Extract again"}
          </button>
          <button type="button" aria-pressed={editing} onClick={() => setEditing((v) => !v)} className={btn + " pl-[1.125rem] pr-5 aria-pressed:bg-surface-2"}>
            <svg viewBox="0 0 16 16" className="size-4 text-ink-2" fill="none" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11.3333 2C11.5031 1.79936 11.7131 1.63604 11.95 1.52045C12.1869 1.40487 12.4454 1.33956 12.7091 1.32868C12.9728 1.3178 13.2359 1.36159 13.4816 1.45726C13.7273 1.55293 13.9502 1.69838 14.1362 1.88435C14.3222 2.07031 14.4671 2.29271 14.5617 2.53736C14.6563 2.78201 14.6986 3.04356 14.6857 3.30532C14.6729 3.56708 14.6053 3.82332 14.4873 4.05771C14.3692 4.2921 14.2033 4.49949 14 4.66667L5 13.6667L1.33333 14.6667L2.33333 11L11.3333 2Z" />
              <path d="M10 3.33333L12.6667 6" />
            </svg>
            Edit details
          </button>
          <button type="button" onClick={save} className={"flex h-[2.7rem] shrink-0 items-center justify-center gap-2 rounded-full bg-brand pl-[1.125rem] pr-5 font-medium text-white hover:bg-brand-strong " + t14}>
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="white" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13.3333 4L6 11.3333L2.66667 8" />
            </svg>
            Save details
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** "Add note": a button on the row that opens an Add note section under it - a large
 *  field, Save note and Cancel. The note joins the row's notes. */
function NoteButton({ x, up, edit, say }: { x: Row; up?: boolean; edit: (patch: Partial<Row>) => void; say: (rest: string, bold?: string) => void }) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const [text, setText] = useState("");
  const close = () => {
    setOpen(false);
    setText("");
  };
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? close() : setOpen(true))}
        className={ROW_BTN + " border border-border font-normal text-ink-2 hover:bg-surface-2 hover:text-ink aria-expanded:bg-surface-2 aria-expanded:text-ink"}
      >
        Add note
      </button>
      {shown && (
        <div
          ref={panel}
          role="dialog"
          aria-label={`Add note for ${x.name}`}
          onKeyDown={(e) => e.key === "Escape" && close()}
          className={LIFT + place(up) + " right-0 w-[max(26rem,300px)] p-4"}
        >
          <p className="text-small font-medium text-ink">Add note</p>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="e.g. Requested to call back at 4, Not interested, Already interviewed"
            aria-label="Note"
            className="mt-2 w-full resize-none rounded-md border border-brand bg-surface p-3 text-small text-ink outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-brand/20"
          />
          <div className="mt-3 flex items-center gap-4">
            <button
              type="button"
              disabled={!text.trim()}
              onClick={() => {
                edit({ notes: [...x.notes, text.trim()] });
                say(" - note added", x.name);
                close();
              }}
              className="rounded-full bg-brand px-[max(1.3rem,14px)] py-[max(0.5rem,6px)] text-small font-medium text-white hover:bg-brand-strong disabled:opacity-40 disabled:hover:bg-brand"
            >
              Save note
            </button>
            <button type="button" onClick={close} className="text-small text-ink-2 hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
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
      title={text}
      className={`inline-block max-w-full truncate whitespace-nowrap rounded-full px-2.5 py-0.5 align-middle text-caption font-medium ${tone}`}
    >
      {text}
    </span>
  );
}

/** The phone and where it came from; "+ add number" when there is none. The
 *  editor lifts under the cell so the narrow column never overflows. */
function Phone({
  x,
  can,
  up,
  onSave,
}: {
  x: Row;
  can: boolean;
  up: boolean;
  onSave: (phone: string, via: Via) => void;
}) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const [num, setNum] = useState("");
  const [via, setVia] = useState<Via>("mutual");
  const ok = /^\d{9,15}$/.test(digits(num));
  const start = () => {
    if (open) return setOpen(false);
    setNum(x.phone ?? "");
    setVia(x.via ?? (x.phone ? "other" : "mutual"));
    setOpen(true);
  };
  const save = () => {
    if (!ok) return;
    onSave(num.trim(), via);
    setOpen(false);
  };
  return (
    <div ref={root} className="relative">
      {x.phone ? (
        <button
          type="button"
          disabled={!can}
          aria-expanded={open}
          onClick={start}
          title={can ? "Change the number" : x.phone}
          className="block max-w-full rounded-xs text-left"
        >
          <span className="block truncate font-mono text-mono text-ink">
            {x.phone}
          </span>
          <span className="block truncate text-caption text-ink-3">
            via {x.via}
          </span>
        </button>
      ) : (
        <button
          type="button"
          disabled={!can}
          aria-expanded={open}
          onClick={start}
          className="whitespace-nowrap text-ink-3 transition-colors hover:text-brand disabled:hover:text-ink-3"
        >
          + add number
        </button>
      )}
      {shown && (
        <div
          ref={panel}
          role="dialog"
          aria-label={`Phone for ${x.name}`}
          className={LIFT + place(up) + " left-0 w-[max(17rem,230px)]"}
        >
          <label className="block text-small text-ink">
            Phone number
            <input
              autoFocus
              value={num}
              onChange={(e) => setNum(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              inputMode="tel"
              placeholder="077 000 0000"
              className={INPUT + " mt-1.5 font-mono"}
            />
          </label>
          <label className="mt-2.5 block text-small text-ink">
            Where it came from
            <select
              value={via}
              onChange={(e) => setVia(e.target.value as Via)}
              className={INPUT + " mt-1.5"}
            >
              {VIA.map((v) => (
                <option key={v} value={v}>
                  via {v}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-caption text-ink-3">
              {num.trim() && !ok ? "9 to 15 digits" : ""}
            </span>
            <button
              type="button"
              disabled={!ok}
              onClick={save}
              className="rounded-full bg-brand px-3.5 py-1.5 text-small font-medium text-white hover:bg-brand-strong disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "No": the old system asks why before saving (300 characters). */
function NoButton({
  name,
  blocked,
  up,
  label = "No",
  onSave,
}: {
  name: string;
  blocked: boolean;
  up?: boolean;
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
          ROW_BTN +
          " border border-border font-normal text-danger hover:bg-danger-soft"
        }
      >
        {label}
      </button>
      {shown && (
        <div
          ref={panel}
          role="dialog"
          aria-label={`Why is ${name} not interested?`}
          className={LIFT + place(up) + " right-0 w-72"}
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
  up,
  edit,
  say,
  onRemove,
}: {
  x: Row;
  blocked: boolean;
  up?: boolean;
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
        className="flex size-[max(2rem,28px)] items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
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
          className={LIFT + place(up) + " right-0 w-64 p-1.5"}
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
          className={LIFT + " right-0 top-full mt-2 w-80 text-small text-ink-2"}
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
          className={LIFT + " right-0 top-full mt-2 w-60 p-1.5"}
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
const PlusIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    className="size-[max(1rem,13px)] shrink-0"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    className="size-[max(0.8rem,11px)]"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
const LockIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-[max(0.85rem,12px)] shrink-0"
    aria-hidden="true"
  >
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
const NoteIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-[max(1rem,14px)]"
    aria-hidden="true"
  >
    <path d="M5 4h14v12l-4 4H5z" />
    <path d="M9 9h6M9 13h4" />
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
  up,
  onRemove,
}: {
  x: Row;
  can: boolean;
  up?: boolean;
  onRemove: (i: number) => void;
}) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const label = `${x.notes.length} ${x.notes.length === 1 ? "note" : "notes"}`;
  return (
    <span ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${label} on ${x.name}`}
        title={label}
        onClick={() => setOpen((o) => !o)}
        className={
          "flex h-[max(2rem,28px)] items-center gap-1 rounded-full px-1.5 text-caption transition-colors hover:bg-surface-2 hover:text-ink " +
          (open ? "bg-surface-2 text-ink" : "text-ink-3")
        }
      >
        <NoteIcon />
        {x.notes.length}
      </button>
      {shown && (
        <div
          ref={panel}
          role="dialog"
          aria-label={`Notes on ${x.name}`}
          className={LIFT + place(up) + " right-0 w-[min(20rem,80vw)] font-normal"}
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
