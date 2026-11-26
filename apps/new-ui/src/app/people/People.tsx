"use client";

import { useRef, useState, type ReactNode } from "react";
import Toast from "../openings/[id]/Toast";
import PillMenu, { type MenuOption } from "../openings/[id]/PillMenu";
import { useRole, useSignedInPerson } from "@/lib/role";
import { useFilters, matchesAll } from "@/lib/filters";
import { NoResults } from "@/app/FilterBits";
import { useLive } from "@/lib/backend";
import { sendPeople, usePeopleLive } from "./peopleLive";

// People and roles (owner 18 Nov 2026: "get the details from old AURA, with our design
// guidelines"). What the old /people page does for people (src/app/people/page.tsx and
// PeopleAdmin.tsx in the TA System): who is on the desk and what each can do; invite by
// email or add without one; edit; mark as left / bring back (nobody is ever deleted, and
// nobody marks themselves as left); invites waiting with Revoke; accounts the older app
// made, given access with a role. Only an admin changes anything (`user.manage`);
// everyone else reads it.
// Owner 19 Nov 2026: the desk settings are off this page, and the page is drawn the way
// TA Track is - a light H1 with white pill controls on the right, then big white cards:
// the desk on the left, the numbers, invites and older accounts on the right.
// Signed in (R1, 20 Nov), the desk, invites and older accounts are old AURA's own
// (/api/ui/people) and every button runs the old /people action; signed out, the sample.

type RoleKey = "ta" | "ta_support" | "ta_lead" | "director" | "ops" | "admin" | "viewer" | "client";
const ROLES: { value: RoleKey; label: string; note: string }[] = [
  { value: "ta", label: "Talent Acquisition", note: "Works openings. Sees their own desk." },
  { value: "ta_support", label: "TA Support", note: "Works openings as a TA does, and reads every TA's Excel Tables rows on them." },
  { value: "ta_lead", label: "TA Lead", note: "Assigns work and sees every desk." },
  { value: "director", label: "Director", note: "Reviews shortlists." },
  { value: "ops", label: "Operations", note: "Runs the process, not the roles." },
  { value: "admin", label: "Admin", note: "Everything, including this page." },
  { value: "viewer", label: "Viewer", note: "Read only." },
  { value: "client", label: "Client", note: "Sees their own openings only." },
];
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label])) as Record<RoleKey, string>;
/** The filter on the right of the title: roles grouped the way the desk talks about them. */
type Group = "all" | "tas" | "leads" | "director" | "ops";
const GROUPS: [Group, string][] = [
  ["all", "Everyone"],
  ["tas", "TAs"],
  ["leads", "Leads"],
  ["director", "Director"],
  ["ops", "Ops"],
];
const IN_GROUP: Record<Group, (r: RoleKey) => boolean> = {
  all: () => true,
  tas: (r) => r === "ta" || r === "ta_support",
  leads: (r) => r === "ta_lead" || r === "admin",
  director: (r) => r === "director",
  ops: (r) => r === "ops",
};
const COUNTRIES = ["Sri Lanka", "India", "Pakistan"] as const;
const COUNTRY_MENU: MenuOption[] = COUNTRIES.map((c) => ({ value: c, label: c }));

type Person = { id: string; name: string; email: string; phone: string; role: RoleKey; country: string; inbox: string; active: boolean };
const SAMPLE: Person[] = [
  { id: "u1", name: "Rashmi Jayawardena", email: "rashmi@example.com", phone: "+94 77 000 0001", role: "ta_lead", country: "Sri Lanka", inbox: "rashmi.jobs@example.com", active: true },
  { id: "u2", name: "Chathura Sampath", email: "chathura@example.com", phone: "+94 77 000 0002", role: "ta", country: "Sri Lanka", inbox: "chathura.jobs@example.com", active: true },
  { id: "u3", name: "Dilini Ranasinghe", email: "dilini@example.com", phone: "+94 77 000 0003", role: "ta", country: "Sri Lanka", inbox: "dilini.jobs@example.com", active: true },
  { id: "u4", name: "Hasini Fernando", email: "hasini@example.com", phone: "", role: "ta_support", country: "India", inbox: "", active: true },
  { id: "u5", name: "Nadeesha Perera", email: "nadeesha@example.com", phone: "", role: "director", country: "Sri Lanka", inbox: "", active: true },
  { id: "u6", name: "Kavindi Silva", email: "kavindi@example.com", phone: "+94 77 000 0006", role: "ops", country: "Sri Lanka", inbox: "", active: true },
  { id: "u7", name: "Ravindu Mendis", email: "ravindu@example.com", phone: "", role: "ta", country: "Sri Lanka", inbox: "ravindu.jobs@example.com", active: false },
];
type Invite = { id: string; email: string; role: RoleKey; sent: string };
const INVITES: Invite[] = [{ id: "i1", email: "nuha@example.com", role: "ta", sent: "16 Nov" }];
type Other = { email: string; name: string; oldRole: string; canSignIn: boolean; records: number };
const OTHERS: Other[] = [
  { email: "amal@example.com", name: "Amal Wickrama", oldRole: "recruiter", canSignIn: true, records: 1 },
  { email: "sachini@example.com", name: "Sachini Dias", oldRole: "viewer", canSignIn: false, records: 2 },
];

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const phoneOk = (s: string) => !s.trim() || /^\+?[\d\s-]{9,18}$/.test(s.trim());
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

const FIELD = "w-full rounded-sm border border-border bg-surface px-3 py-2 text-small text-ink outline-none placeholder:text-ink-3 focus:border-brand disabled:bg-surface-2 disabled:text-ink-3";
const PRIMARY = "flex items-center gap-2 rounded-full bg-brand px-[max(1.25rem,12px)] py-2.5 text-small font-medium text-white shadow-card transition-colors hover:bg-brand-strong";
const LIGHT = "rounded-full bg-surface px-[max(1.1rem,10px)] py-2.5 text-small text-ink-2 shadow-card transition-colors hover:text-ink";
const MENU = FIELD + " flex items-center justify-between gap-2 text-left";
const ROW_BTN = "rounded-full px-3 py-1.5 text-small text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink";

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={"flex flex-col gap-1.5 " + (wide ? "sm:col-span-2" : "")}>
      <span className="text-caption font-medium text-ink-3">{label}</span>
      {children}
    </label>
  );
}

/** TA Track's card: a big white board piece with an H3 title and a quiet line under it. */
function Card({ title, sub, aside, children }: { title: string; sub?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-lg bg-surface px-[max(1.75rem,16px)] py-[max(1.5rem,16px)] shadow-card">
      <header className="mb-[max(1.25rem,12px)] flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <h2 className="text-h3 font-medium text-ink">{title}</h2>
          {sub && <p className="text-small text-ink-3">{sub}</p>}
        </span>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** One number of the desk, as TA Track draws its numbers: a dot, a big figure, a caption. */
function Stat({ dot, big, small }: { dot: string; big: number; small: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={"mt-3 size-3 shrink-0 rounded-full " + dot} aria-hidden="true" />
      <span className="flex flex-col">
        <span className="text-h2 font-normal tabular-nums text-ink">{big}</span>
        <span className="text-caption text-ink-3">{small}</span>
      </span>
    </li>
  );
}

/** Every role on the page at once (26 Nov 2026): as a menu of eight it was taller than the
 *  card, so Admin and others were cut off at the top and could not be picked. */
function RolePick({ value, onChange }: { value: RoleKey; onChange: (r: RoleKey) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label="Role" className="flex flex-wrap gap-1.5">
        {ROLES.map((r) => (
          <button
            key={r.value}
            type="button"
            role="radio"
            aria-checked={value === r.value}
            title={r.note}
            onClick={() => onChange(r.value)}
            className={"rounded-full px-3 py-1.5 text-caption transition-colors " + (value === r.value ? "bg-ink text-white" : "border border-border bg-surface text-ink-2 hover:text-ink")}
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="text-caption text-ink-3">{ROLES.find((r) => r.value === value)?.note}</p>
    </div>
  );
}

const RoleChip = ({ role }: { role: RoleKey }) => (
  <span
    className={
      "inline-flex whitespace-nowrap rounded-full px-3 py-1 text-caption font-medium " +
      (role === "ta_lead" || role === "admin" ? "bg-brand-soft text-brand" : role === "director" ? "bg-violet-soft text-violet" : "bg-surface-2 text-ink-2")
    }
  >
    {ROLE_LABEL[role]}
  </span>
);

export default function People() {
  const role = useRole();
  const signed = useSignedInPerson();
  const live = useLive();
  const { data, error, reload } = usePeopleLive(live);
  // user.manage: an admin only. Live, the TA System says so; on the sample, the Lead view stands in.
  const canEdit = live ? !!data?.canEdit : signed ? signed.title === "Admin" : role === "Lead" || role === "Admin";
  const meId = live ? data?.me ?? "" : "u1";

  const [samplePeople, setPeople] = useState(SAMPLE);
  const [sampleInvites, setInvites] = useState(INVITES);
  const [sampleOthers, setOthers] = useState(OTHERS);
  const asRole = (r: string | null): RoleKey => (ROLES.some((x) => x.value === r) ? (r as RoleKey) : "viewer");
  const people: Person[] = live
    ? (data?.people ?? []).map((p) => ({ id: p.id, name: p.name, email: p.email, phone: p.phone, role: asRole(p.role), country: p.workCountry, inbox: p.routingEmail, active: p.active }))
    : samplePeople;
  const invites: Invite[] = live
    ? (data?.invites ?? []).map((i) => ({ id: i.id, email: i.email, role: asRole(i.role ?? "ta"), sent: new Date(i.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) }))
    : sampleInvites;
  const others: Other[] = live
    ? (data?.accounts ?? []).map((a) => ({ email: a.email, name: a.fullName, oldRole: a.oldAppRole, canSignIn: a.canSignInHere, records: a.duplicates }))
    : sampleOthers;
  // Search, role group and "who have left" are kept for the visit; Reset clears them
  // (src/lib/filters.ts, the one filter rule across screens).
  const { f, set: setF, reset, active: nFilters } = useFilters("people", { q: "", group: "all" as Group, showGone: false as boolean }, ["showGone"]);
  const { q, group, showGone } = f;
  const setQ = (v: string) => setF({ q: v });
  const setGroup = (v: Group) => setF({ group: v });
  const setShowGone = (fn: (v: boolean) => boolean) => setF({ showGone: fn(showGone) });
  const [panel, setPanel] = useState<"invite" | "add" | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const [draft, setDraft] = useState<Person>({ id: "", name: "", email: "", phone: "", role: "ta", country: "Sri Lanka", inbox: "", active: true });
  const [otherRole, setOtherRole] = useState<Record<string, RoleKey>>({});
  const [toast, setToast] = useState<{ key: number; bold?: string; rest: string; warn?: boolean } | null>(null);
  const seq = useRef(0);
  const say = (bold: string | undefined, rest: string, warn?: boolean) => setToast({ key: ++seq.current, bold, rest, warn });
  // Live: one old /people action, its own sentence said, then the desk read again.
  const run = async (body: Record<string, string>) => {
    const res = await sendPeople(body);
    say(undefined, res.message, !res.ok);
    void reload();
    return res.ok;
  };
  const personBody = (p: Person) => ({ name: p.name.trim(), email: p.email.trim(), phone: p.phone.trim(), routingEmail: p.inbox.trim(), role: p.role, workCountry: p.country });

  const onDesk = people.filter((p) => p.active);
  const matching = people.filter((p) => IN_GROUP[group](p.role) && matchesAll(q, p.name, p.email, p.phone, ROLE_LABEL[p.role]));
  const active = matching.filter((p) => p.active);
  const gone = matching.filter((p) => !p.active);
  const shown = showGone ? [...active, ...gone] : active;

  const check = (p: Person, needEmail: boolean): string | null => {
    if (!p.name.trim()) return "Add their name.";
    if ((needEmail || p.email.trim()) && !isEmail(p.email)) return "That email does not look right.";
    if (!phoneOk(p.phone)) return "That mobile does not look right. Use the number with its country code.";
    if (p.inbox.trim() && !isEmail(p.inbox)) return "The applications inbox must be an email address.";
    // Only a NEW person is refused for an email already on the desk. An edit saves as old
    // /people does (ta/users:adminSaveUser checks this only when adding): an older second
    // record with the same address blocked changing Binath's role (26 Nov 2026).
    if (!p.id && p.email.trim() && people.some((x) => x.email.toLowerCase() === p.email.trim().toLowerCase())) return "Someone on the desk already has that email.";
    return null;
  };

  const openPanel = (which: "invite" | "add") => {
    setPanel((p) => (p === which ? null : which));
    setDraft({ id: "", name: "", email: "", phone: "", role: "ta", country: "Sri Lanka", inbox: "", active: true });
  };
  const invite = () => {
    if (!isEmail(draft.email)) return say(undefined, "That email does not look right.", true);
    if (people.some((x) => x.email.toLowerCase() === draft.email.trim().toLowerCase()) || invites.some((i) => i.email === draft.email.trim()))
      return say(undefined, "That person is already on the desk or invited.", true);
    if (live) {
      void run({ do: "invite", email: draft.email.trim(), role: draft.role }).then((ok) => ok && setPanel(null));
      return;
    }
    setInvites((all) => [{ id: `i${Date.now()}`, email: draft.email.trim(), role: draft.role, sent: "today" }, ...all]);
    setPanel(null);
    say(draft.email.trim(), ` invited as ${ROLE_LABEL[draft.role]}. They get an email to set up their sign-in.`);
  };
  const add = () => {
    // The TA System signs people in by email, so live it needs one.
    const why = check(draft, live);
    if (why) return say(undefined, why, true);
    if (live) {
      void run({ do: "add", ...personBody(draft) }).then((ok) => ok && setPanel(null));
      return;
    }
    setPeople((all) => [{ ...draft, id: `u${Date.now()}`, name: draft.name.trim(), inbox: draft.inbox.trim() || `${draft.name.trim().split(" ")[0].toLowerCase()}.jobs@career141.com` }, ...all]);
    setPanel(null);
    say(draft.name.trim(), " added to the desk.");
  };
  const save = () => {
    if (!editing) return;
    const why = check(editing, live);
    if (why) return say(undefined, why, true);
    if (live) {
      void run({ do: "update", userId: editing.id, ...personBody(editing) }).then((ok) => ok && setEditing(null));
      return;
    }
    setPeople((all) => all.map((p) => (p.id === editing.id ? editing : p)));
    setEditing(null);
    say(editing.name, " saved.");
  };
  const setActive = (p: Person, on: boolean) => {
    if (live) return void run({ do: "active", userId: p.id, active: on ? "1" : "0" });
    setPeople((all) => all.map((x) => (x.id === p.id ? { ...x, active: on } : x)));
    say(p.name, on ? " is back on the desk." : " is marked as left. They come off every picker; their history stays.");
  };

  const form = (p: Person, set: (p: Person) => void, mode: "invite" | "add" | "edit") => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {mode !== "invite" && (
        <Field label="Name">
          <input autoFocus value={p.name} onChange={(e) => set({ ...p, name: e.target.value })} placeholder="Nuha Rizwan" className={FIELD} />
        </Field>
      )}
      <Field label="Email">
        <input autoFocus={mode === "invite"} type="email" value={p.email} onChange={(e) => set({ ...p, email: e.target.value })} placeholder="nuha@career141.com" className={FIELD} />
      </Field>
      {mode !== "invite" && (
        <Field label="Mobile">
          <input value={p.phone} onChange={(e) => set({ ...p, phone: e.target.value })} placeholder="+94 77 000 0000" className={FIELD} />
        </Field>
      )}
      <div className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-3">
        <span className="text-caption font-medium text-ink-3">Role</span>
        <RolePick value={p.role} onChange={(role) => set({ ...p, role })} />
        {mode === "edit" && p.id === meId && p.role !== "admin" && (
          <p role="alert" className="text-caption font-medium text-danger">Saving this takes your own Admin away: only another admin can give it back. To just see another role, use View as in your menu.</p>
        )}
      </div>
      {mode !== "invite" && (
        <>
          <Field label="Works in">
            <PillMenu options={COUNTRY_MENU} initial={p.country} title="Works in" pillClass={MENU} onChange={(v) => set({ ...p, country: v })} />
          </Field>
          <Field label="Applications inbox">
            <input type="email" value={p.inbox} onChange={(e) => set({ ...p, inbox: e.target.value })} placeholder={mode === "add" ? "Left blank, one is made" : "nuha.jobs@career141.com"} className={FIELD + " font-mono"} />
          </Field>
        </>
      )}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col px-[max(1rem,10px)] pb-[max(1rem,10px)] pt-[max(1rem,12px)] max-md:pt-6">
      {/* The title row, as TA Track's: a light H1, then white pill controls on the right. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-[max(0.25rem,4px)]">
        <h1 className="text-h1 font-light text-ink">People and roles</h1>
        <div className="flex-1" />
        <label className="relative w-[max(17rem,200px)] max-sm:w-full">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-3">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a person"
            aria-label="Find a person by name, email, mobile or role"
            className="w-full rounded-full bg-surface py-2.5 pl-10 pr-4 text-small text-ink shadow-card outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-brand/30"
          />
        </label>
        <div role="radiogroup" aria-label="Show" className="flex rounded-full bg-surface p-1 shadow-card">
          {GROUPS.map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={group === v}
              onClick={() => setGroup(v)}
              className={"rounded-full px-[max(1.1rem,10px)] py-2 text-small transition-colors " + (group === v ? "bg-ink text-white" : "text-ink-2 hover:text-ink")}
            >
              {l}
            </button>
          ))}
        </div>
        {canEdit && (
          <button type="button" onClick={() => openPanel("invite")} className={PRIMARY}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="size-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Invite someone
          </button>
        )}
      </div>

      <div className="mt-[max(1rem,10px)] min-h-0 flex-1 overflow-y-auto px-[max(0.25rem,4px)] pb-2">
        <div className="grid grid-cols-[1.98fr_1fr] items-start gap-[max(1.5rem,12px)] max-lg:grid-cols-1">
          {/* The main job: who is on the desk. */}
          <Card
            title="The desk"
            sub={canEdit ? "Who is on it and what each of them can do. Nobody is deleted; someone who leaves is marked as left." : "Who is on it and what each of them can do. Only an admin can change this."}
            aside={
              canEdit && (
                <button type="button" onClick={() => openPanel("add")} className={LIGHT}>
                  {panel === "add" ? "Cancel" : "Add without invite"}
                </button>
              )
            }
          >
            {panel && (
              <div className="mb-[max(1.25rem,12px)] rounded-md bg-canvas p-[max(1.25rem,12px)]">
                <p className="mb-3 text-small font-medium text-ink">{panel === "invite" ? "Invite someone" : "Add someone without an invite"}</p>
                {form(draft, setDraft, panel)}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={panel === "invite" ? invite : add} className={PRIMARY}>{panel === "invite" ? "Send invite" : "Add them"}</button>
                  <button type="button" onClick={() => setPanel(null)} className={ROW_BTN}>Cancel</button>
                  <p className="max-w-[60ch] text-caption text-ink-3">
                    {panel === "invite"
                      ? "They get an email to set up their sign-in. The role applies from their first sign-in."
                      : "The applications inbox goes into the LinkedIn job setup for every advert they run. Set it up in Microsoft 365 first."}
                  </p>
                </div>
              </div>
            )}

            {live && !data ? (
              <p className="py-6 text-small text-ink-3" role="status">{error ?? "Reading the desk…"}</p>
            ) : shown.length ? (
              <ul className="-mx-3 flex flex-col">
                {shown.map((p) =>
                  editing?.id === p.id ? (
                    <li key={p.id} className="rounded-md bg-brand-tint p-[max(1.25rem,12px)]">
                      {form(editing, setEditing, "edit")}
                      <div className="mt-4 flex gap-2">
                        <button type="button" onClick={save} className={PRIMARY}>Save</button>
                        <button type="button" onClick={() => setEditing(null)} className={ROW_BTN}>Cancel</button>
                      </div>
                    </li>
                  ) : (
                    <li key={p.id} className={"group flex flex-wrap items-center gap-x-[max(1.25rem,12px)] gap-y-2 rounded-md px-3 py-[max(0.875rem,9px)] transition-colors hover:bg-canvas " + (p.active ? "" : "opacity-55")}>
                      <span className="flex size-[max(2.75rem,36px)] shrink-0 items-center justify-center rounded-full bg-brand-soft text-small font-medium text-brand">{initials(p.name)}</span>
                      <span className="min-w-[14rem] flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-body font-medium text-ink">{p.name}</span>
                          {p.id === meId && <span className="text-caption text-ink-3">· you</span>}
                          {!p.active && <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-caption font-medium text-ink-2">Left</span>}
                        </span>
                        <span className="block truncate text-small text-ink-3">{[p.email, p.phone, p.country].filter(Boolean).join(" · ")}</span>
                      </span>
                      {p.inbox && <span className="hidden w-[max(15rem,180px)] truncate font-mono text-mono text-ink-3 xl:block" title="Applications inbox">{p.inbox}</span>}
                      {canEdit && (
                        <span className="flex shrink-0 items-center gap-1 transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
                          <button type="button" onClick={() => setEditing(p)} className={ROW_BTN}>Edit</button>
                          {/* Nobody marks themselves as left — that is how a desk locks itself out. */}
                          {p.id !== meId && (
                            <button type="button" onClick={() => setActive(p, !p.active)} className={ROW_BTN}>
                              {p.active ? "Mark as left" : "Bring back"}
                            </button>
                          )}
                        </span>
                      )}
                      <span className="flex w-[max(10rem,116px)] shrink-0 justify-end"><RoleChip role={p.role} /></span>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <NoResults noun="people" filtered={nFilters > 0} onReset={reset} />
            )}
            {gone.length > 0 && (
              <button type="button" onClick={() => setShowGone((v) => !v)} className="mt-3 self-start text-small text-ink-2 hover:text-ink">
                {showGone ? "Hide" : "Show"} {gone.length} who {gone.length === 1 ? "has" : "have"} left
              </button>
            )}
          </Card>

          <div className="flex min-w-0 flex-col gap-[max(1.5rem,12px)]">
            <Card title="The desk in numbers">
              <ul className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Stat dot="bg-brand" big={onDesk.length} small="on the desk" />
                <Stat dot="bg-brand-leaf" big={onDesk.filter((p) => IN_GROUP.tas(p.role)).length} small="TAs working openings" />
                <Stat dot="bg-warn" big={invites.length} small="invites waiting" />
                <Stat dot="bg-border-strong" big={people.length - onDesk.length} small="marked as left" />
              </ul>
            </Card>

            {canEdit && invites.length > 0 && (
              <Card title="Invites waiting" sub="Sent, not yet accepted.">
                <ul className="flex flex-col divide-y divide-border">
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-medium text-ink">{i.email}</span>
                        <span className="block text-caption text-ink-3">{ROLE_LABEL[i.role]} · sent {i.sent}</span>
                      </span>
                      <button type="button" onClick={() => {
                        if (live) return void run({ do: "revoke", invitationId: i.id });
                        setInvites((all) => all.filter((x) => x.id !== i.id));
                        say(i.email, " invite revoked.");
                      }} className={ROW_BTN + " hover:text-danger"}>
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {canEdit && others.length > 0 && (
              <Card title="Other accounts" sub="Made by the older app. No access here until you give them a role.">
                <ul className="flex flex-col divide-y divide-border">
                  {others.map((a) => (
                    <li key={a.email} className="flex flex-col gap-2.5 py-3.5 first:pt-0 last:pb-0">
                      <span className="flex items-start gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block text-small font-medium text-ink">{a.name}</span>
                          <span className="block truncate text-caption text-ink-3">{a.email} · older app: {a.oldRole}</span>
                        </span>
                        <span className={"shrink-0 rounded-full px-2.5 py-0.5 text-caption font-medium " + (a.canSignIn ? "bg-success-soft text-success" : "bg-surface-2 text-ink-3")}>{a.canSignIn ? "Can sign in" : "No login"}</span>
                      </span>
                      <span className="flex flex-col items-start gap-2.5">
                        <RolePick value={otherRole[a.email] ?? "ta"} onChange={(v) => setOtherRole((r) => ({ ...r, [a.email]: v }))} />
                        <button
                          type="button"
                          onClick={() => {
                            const r = otherRole[a.email] ?? "ta";
                            if (live) return void run({ do: "add", name: a.name, email: a.email, role: r });
                            setOthers((all) => all.filter((x) => x.email !== a.email));
                            setPeople((all) => [{ id: `u${Date.now()}`, name: a.name, email: a.email, phone: "", role: r, country: "Sri Lanka", inbox: "", active: true }, ...all]);
                            say(a.name, ` now has access as ${ROLE_LABEL[r]}.`);
                          }}
                          className="shrink-0 rounded-full bg-ink px-4 py-2 text-small font-medium text-white transition-colors hover:bg-marker"
                        >
                          Give access
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      </div>
      {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} warn={toast.warn} />}
    </div>
  );
}
