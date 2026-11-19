"use client";

import { useRef, useState } from "react";
import Toast from "../openings/[id]/Toast";
import { deskWide, useRole } from "@/lib/role";
import PillMenu from "../openings/[id]/PillMenu";
import { useFilters, matchesAll } from "@/lib/filters";
import { NoResults, ResultLine, SearchField } from "../FilterBits";

// The Bin (owner 14 Nov 2026: "Bin we can add"; old system /bin). Openings and clients
// deleted in the last 7 days, then gone for good. Restore puts one back exactly as it
// was (an opening whose client was deleted brings the client back too); candidates are
// never deleted. "Delete now" is for a lead, Director, Admin or Ops only, after a second
// press. No design: built in the board's own look.
// ponytail: sample rows; with the backend, the deleted openings and clients.

type Kind = "opening" | "client";
type Gone = { id: string; kind: Kind; name: string; client?: string; by: string; daysAgo: number };
const DAYS = 7;
const SAMPLE: Gone[] = [
  { id: "b1", kind: "opening", name: "Junior Accountant", client: "John Keells", by: "Rashmi", daysAgo: 1 },
  { id: "b2", kind: "opening", name: "Test job", client: "Career141", by: "Rashmi", daysAgo: 3 },
  { id: "b3", kind: "opening", name: "Warehouse Supervisor", client: "Cargills", by: "Dilini", daysAgo: 6 },
  { id: "b4", kind: "client", name: "Ceylon Tea Traders", by: "Rashmi", daysAgo: 2 },
  { id: "b5", kind: "opening", name: "Tea Taster", client: "Ceylon Tea Traders", by: "Rashmi", daysAgo: 2 },
];

const goesOn = (left: number) => {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(left, 0));
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const PILL = "flex h-[max(2.4rem,33px)] items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface px-[max(1rem,13px)] text-small text-ink-2";

export default function Bin() {
  const role = useRole();
  const [items, setItems] = useState(SAMPLE);
  const [sure, setSure] = useState<string | null>(null);
  // Search, what and who deleted it are kept for the visit; Reset clears them (src/lib/filters.ts).
  const { f, set, reset, active } = useFilters("bin", { q: "", what: "", by: "" });
  const people = [...new Set(items.map((x) => x.by))].sort();
  const match = (x: Gone) => matchesAll(f.q, x.name, x.client, x.by) && (!f.what || x.kind === f.what) && (!f.by || x.by === f.by);
  const shownCount = items.filter(match).length;
  const [toast, setToast] = useState<{ key: number; bold: string; rest: string } | null>(null);
  const seq = useRef(0);
  const gone = (x: Gone, rest: string) => {
    setItems((all) => all.filter((y) => y.id !== x.id));
    setSure(null);
    setToast({ key: ++seq.current, bold: x.name, rest });
  };

  const section = (kind: Kind, title: string) => {
    const list = items.filter((x) => x.kind === kind && match(x));
    return (
      <section>
        <h2 className="mb-3 text-h3 font-medium text-ink">
          {title} <span className="text-ink-3">{list.length}</span>
        </h2>
        {list.length ? (
          <ul className="flex flex-col gap-2">
            {list.map((x) => {
              const left = DAYS - x.daysAgo;
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-canvas px-[max(1.25rem,12px)] py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-medium text-ink">{x.name}</span>
                    <span className="block text-caption text-ink-3">
                      {x.client ? `${x.client} · ` : ""}deleted {x.daysAgo === 1 ? "yesterday" : `${x.daysAgo} days ago`} by {x.by}
                    </span>
                  </span>
                  <span className={"text-caption " + (left <= 1 ? "font-medium text-danger" : "text-ink-3")}>{left <= 0 ? "Gone for good today" : `${left} ${left === 1 ? "day" : "days"} left · Goes for good on ${goesOn(left)}`}</span>
                  <button type="button" onClick={() => gone(x, kind === "opening" ? " restored, with its pipeline" : " restored")} className="rounded-full bg-ink px-4 py-2 text-small font-medium text-white hover:bg-black">
                    Restore
                  </button>
                  {deskWide(role) && kind === "client" && items.some((y) => y.kind === "opening" && y.client === x.name) ? (
                    <span className="text-caption text-ink-3">Delete now waits: its openings are still in the Bin</span>
                  ) : deskWide(role) && (
                    <button
                      type="button"
                      onClick={() => (sure === x.id ? gone(x, " deleted for good") : setSure(x.id))}
                      onBlur={() => setSure(null)}
                      title={kind === "opening" ? "Its pipeline, calls and messages go and cannot be restored. Its candidates stay." : "It cannot be restored."}
                      className={"rounded-full px-3 py-2 text-small " + (sure === x.id ? "font-medium text-danger" : "text-ink-3 hover:text-danger")}
                    >
                      {sure === x.id ? "Press again — for good" : "Delete now"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <NoResults noun={kind === "opening" ? "openings in the Bin" : "clients in the Bin"} filtered={active > 0} onReset={reset} />
        )}
      </section>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[max(3.5rem,14px)] py-[max(2.25rem,16px)] max-md:pt-12">
      <div className="mx-auto flex w-full max-w-[60rem] flex-col gap-[max(1.75rem,14px)]">
        <p className="text-small text-ink-2">
          Things stay here for {DAYS} days, then are deleted for good. Restore puts one back exactly as it was. Candidates are never deleted.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <SearchField value={f.q} onChange={(q) => set({ q })} placeholder="Find by name, client or who deleted it" label="Search the Bin" />
          <PillMenu options={[{ value: "", label: "Openings and clients" }, { value: "opening", label: "Openings" }, { value: "client", label: "Clients" }]} initial={f.what} onChange={(what) => set({ what })} mark="tick" pillClass={PILL} />
          <PillMenu options={[{ value: "", label: "Anyone" }, ...people.map((p) => ({ value: p, label: p }))]} initial={f.by} onChange={(by) => set({ by })} prefix="Deleted by:" mark="tick" pillClass={PILL} />
          <ResultLine shown={shownCount} total={items.length} noun="in the Bin" active={active} onReset={reset} />
        </div>
        {section("opening", "Openings")}
        {section("client", "Clients")}
      </div>
      {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} />}
    </div>
  );
}
