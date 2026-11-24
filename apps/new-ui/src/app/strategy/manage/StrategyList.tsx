"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Toast from "../../openings/[id]/Toast";
import { BackButton } from "../../openings/[id]/PipelineBoard";
import { band, setRows, useCatalogue, useRows, type Entry } from "../data";
import { putEntry, usePlannerLive } from "../strategyLive";
import { useLive } from "@/lib/backend";
import { CardsSkeleton } from "../../Skeleton";

// The strategy list (owner 14 Nov 2026: "add, rename or retire strategies"; old system
// /strategy/manage). Add one under a heading; rename, describe or move it in place;
// retire it (it leaves the planner's choices, jobs already using it keep it) and bring
// it back. Rules kept: a name is needed, 120 characters at most (description 600,
// heading 60); no two on the list share a name (any case); "Given N times" counts jobs.
// No design: built in the planner's own look.

const FIELD = "rounded-sm border border-border bg-surface px-3 py-2 text-small text-ink outline-none focus:border-brand";

export default function StrategyList() {
  // Signed in: the old planner is read first (strategyLive.ts, D10a); the sample otherwise.
  const on = useLive();
  const lv = usePlannerLive(on);
  if (on && !lv.ready)
    return lv.error ? (
      <main className="flex flex-1 items-center justify-center px-6 text-center text-small text-ink-2">{lv.error}</main>
    ) : (
      <main className="flex min-h-0 flex-1 flex-col px-11 py-10">
        <CardsSkeleton />
      </main>
    );
  return <Manage />;
}

function Manage() {
  const cat = useCatalogue();
  const rows = useRows();
  const router = useRouter();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [group, setGroup] = useState("");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState<{ key: number; bold: string; rest: string } | null>(null);
  const seq = useRef(0);
  const say = (bold: string, rest: string) => setToast({ key: ++seq.current, bold, rest });

  const headings = [...new Set(cat.map((e) => e.group))];
  const given = (n: string) => new Set(rows.filter((r) => r.name === n && r.state !== "na").map((r) => r.job)).size;
  const clash = (n: string, except?: string) => cat.some((e) => e.active && e.name !== except && e.name.toLowerCase() === n.trim().toLowerCase());
  const active = cat.filter((e) => e.active);
  const retired = cat.filter((e) => !e.active);

  const add = () => {
    const n = name.trim();
    if (!n) return setErr("Give the strategy a name.");
    if (n.length > 120) return setErr("Keep the name under 120 characters.");
    if (clash(n)) return setErr("That name is already on the list.");
    void putEntry(undefined, { name: n, group: group.trim() || "Other", description: desc.trim(), active: true });
    setName("");
    setDesc("");
    setErr("");
    say(n, " added to the list");
  };
  const save = (was: Entry, next: Entry) => {
    void putEntry(was, next);
    // ponytail: rows follow the new name; with the backend they point at the strategy's id.
    if (next.name !== was.name) setRows((rs) => rs.map((r) => (r.name === was.name ? { ...r, name: next.name } : r)));
    say(next.name, " saved");
  };
  const retire = (e: Entry, on: boolean) => {
    if (on && clash(e.name)) return say(e.name, " — a strategy with that name is already on the list");
    void putEntry(e, { ...e, active: on });
    say(e.name, on ? " is back on the list" : " retired — jobs already using it keep it");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[max(3.5rem,14px)] py-[max(2.25rem,16px)] max-md:pt-12">
      <div className="mx-auto flex w-full max-w-[60rem] flex-col gap-[max(1.75rem,14px)]">
        <header className="flex items-center gap-4">
          <BackButton onClick={() => router.push("/strategy")} label="Back to the Strategy Planner" />
          <div>
            <h1 className="text-h2 text-ink">Strategy list</h1>
            <p className="text-small text-ink-3">Retiring one takes it out of the planner&apos;s choices. Jobs already using it keep it.</p>
          </div>
        </header>

        <section className="rounded-lg bg-canvas p-[max(1.5rem,14px)]">
          <h2 className="text-h3 font-medium text-ink">Add a strategy</h2>
          <div className="mt-3 grid grid-cols-[2fr_1fr] gap-3 max-sm:grid-cols-1">
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} maxLength={120} placeholder="Name, e.g. Alumni groups" aria-label="Name" className={FIELD} />
            <input value={group} onChange={(e) => setGroup(e.target.value)} list="headings" maxLength={60} placeholder="Heading (LinkedIn, Headhunting…)" aria-label="Heading" className={FIELD} />
            <datalist id="headings">
              {headings.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={600} rows={2} placeholder="What it means (optional) — TAs see this" aria-label="Description" className={FIELD + " col-span-full resize-none"} />
          </div>
          {err && <p className="mt-2 text-small text-danger">{err}</p>}
          <button type="button" onClick={add} className="mt-3 rounded-full bg-ink px-5 py-2.5 text-small font-medium text-white hover:bg-black">
            Add to the list
          </button>
        </section>

        <section>
          <h2 className="mb-3 text-h3 font-medium text-ink">On the list · {active.length}</h2>
          {active.length ? (
            <ul className="flex flex-col gap-2">
              {active.map((e) => (
                <Line key={e.name} e={e} given={given(e.name)} headings={headings} clash={(n) => clash(n, e.name)} onSave={(n) => save(e, n)} onRetire={() => retire(e, false)} />
              ))}
            </ul>
          ) : (
            <p className="text-small text-ink-3">Nothing on the list yet. Add the first one above.</p>
          )}
        </section>

        {retired.length > 0 && (
          <section>
            <h2 className="mb-3 text-h3 font-medium text-ink">Retired · {retired.length}</h2>
            <ul className="flex flex-col gap-2">
              {retired.map((e) => (
                <li key={e.name} className="flex items-center gap-3 rounded-md border border-border px-4 py-3">
                  <span className="flex-1 text-small text-ink-3">
                    {e.name} · given {given(e.name)} {given(e.name) === 1 ? "time" : "times"}
                  </span>
                  <button type="button" onClick={() => retire(e, true)} className="text-small font-medium text-brand hover:underline">
                    Bring back
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} />}
    </div>
  );
}

/** One strategy: its heading chip, name and description, edited in place. */
function Line({ e, given, headings, clash, onSave, onRetire }: { e: Entry; given: number; headings: string[]; clash: (n: string) => boolean; onSave: (n: Entry) => void; onRetire: () => void }) {
  const [edit, setEdit] = useState(false);
  const [d, setD] = useState(e);
  const [err, setErr] = useState("");
  const ok = () => {
    const n = d.name.trim();
    if (!n) return setErr("Give the strategy a name.");
    if (clash(n)) return setErr("That name is already on the list.");
    onSave({ ...d, name: n, group: d.group.trim() || "Other", description: d.description.trim() });
    setEdit(false);
    setErr("");
  };
  if (edit)
    return (
      <li className="flex flex-col gap-2 rounded-md bg-surface p-4 shadow-card">
        <div className="grid grid-cols-[2fr_1fr] gap-2 max-sm:grid-cols-1">
          <input autoFocus value={d.name} maxLength={120} onChange={(x) => setD({ ...d, name: x.target.value })} onKeyDown={(x) => (x.key === "Enter" ? ok() : x.key === "Escape" && setEdit(false))} aria-label="Name" className={FIELD} />
          <select value={d.group} onChange={(x) => setD({ ...d, group: x.target.value })} aria-label="Heading" className={FIELD}>
            {headings.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
          <textarea value={d.description} maxLength={600} rows={2} onChange={(x) => setD({ ...d, description: x.target.value })} placeholder="What it means (optional)" aria-label="Description" className={FIELD + " col-span-full resize-none"} />
        </div>
        {err && <p className="text-small text-danger">{err}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={ok} className="rounded-full bg-ink px-4 py-2 text-small font-medium text-white hover:bg-black">
            Save
          </button>
          <button type="button" onClick={() => (setEdit(false), setD(e), setErr(""))} className="rounded-full px-4 py-2 text-small text-ink-3 hover:text-ink">
            Cancel
          </button>
        </div>
      </li>
    );
  return (
    <li className="group flex items-center gap-3 rounded-md bg-canvas px-4 py-3">
      <span className={"shrink-0 rounded-sm px-2 py-0.5 text-caption font-medium " + band(e.group)}>{e.group}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-small font-medium text-ink">{e.name}</span>
        {e.description && <span className="block truncate text-caption text-ink-3">{e.description}</span>}
      </span>
      <span className="shrink-0 text-caption text-ink-3">
        Given {given} {given === 1 ? "time" : "times"}
      </span>
      <button type="button" onClick={() => setEdit(true)} className="text-small text-ink-2 hover:text-ink">
        Rename
      </button>
      <button type="button" onClick={onRetire} className="text-small text-ink-3 hover:text-danger">
        Retire
      </button>
    </li>
  );
}
