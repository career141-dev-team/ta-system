"use client";

import { useRef, useState, type ReactNode } from "react";
import Toast from "../openings/[id]/Toast";
import PillMenu, { type MenuOption } from "../openings/[id]/PillMenu";
import { useRole, useSignedInPerson } from "@/lib/role";

// People and roles (owner 18 Nov 2026: "get the details from old AURA, with our design
// guidelines"). Everything the old /people page does (src/app/people/page.tsx and
// PeopleAdmin.tsx in the TA System): who is on the desk and what each can do; invite by
// email or add without one; edit; mark as left / bring back (nobody is ever deleted, and
// nobody marks themselves as left); invites waiting with Revoke; accounts the older app
// made, given access with a role; and the desk's own settings - the shortlist replies
// inbox, the pre-shortlist score, who may put jobs on the website, the end-of-day copy
// line and the standard follow-up questions. Only an admin changes anything
// (`user.manage`); everyone else reads it.
// ponytail: sample rows; with the backend, the desk's users, Clerk's invites and the
// settings table (a TA System pull request, like the other screens).

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
const ROLE_MENU: MenuOption[] = ROLES.map((r) => ({ value: r.value, label: r.label, hint: r.note }));
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
type Question = { id: string; label: string; on: boolean };
const STANDARD: Question[] = [
  { id: "cv", label: "Latest CV", on: true },
  { id: "current", label: "Current salary", on: true },
  { id: "expected", label: "Expected salary", on: true },
  { id: "notice", label: "Notice period", on: true },
];
const EOD_TO = "joborders@career141.com";
const EOD_CC = ["shamra@career141.com", "asma@career141.com", "opsteam@career141.com", "cv@career141.com", "shortlists@career141.com"];

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const phoneOk = (s: string) => !s.trim() || /^\+?[\d\s-]{9,18}$/.test(s.trim());
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

const FIELD = "w-full rounded-sm border border-border bg-surface px-3 py-2 text-small text-ink outline-none placeholder:text-ink-3 focus:border-brand disabled:bg-surface-2 disabled:text-ink-3";
const PRIMARY = "rounded-full bg-brand px-4 py-2 text-small font-medium text-white hover:bg-brand-strong disabled:opacity-50";
const QUIET = "rounded-full border border-border-strong px-4 py-2 text-small font-medium text-ink hover:bg-surface-2";

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={"flex flex-col gap-1.5 " + (wide ? "sm:col-span-2" : "")}>
      <span className="text-caption font-medium text-ink-3">{label}</span>
      {children}
    </label>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-md bg-canvas px-[max(1.5rem,14px)] py-[max(1.25rem,12px)]">
      <h3 className="text-small font-medium text-ink">{title}</h3>
      {note && <p className="mt-1 max-w-[70ch] text-caption text-ink-3">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function People() {
  const role = useRole();
  const signed = useSignedInPerson();
  // user.manage: an admin only. Signed in, the account says so; on the sample, the Lead view stands in.
  const canEdit = signed ? signed.title === "Admin" : role === "Lead";
  // ponytail: the sample's own row; with the backend, the signed-in person's id.
  const meId = "u1";

  const [people, setPeople] = useState(SAMPLE);
  const [invites, setInvites] = useState(INVITES);
  const [others, setOthers] = useState(OTHERS);
  const [q, setQ] = useState("");
  const [showGone, setShowGone] = useState(false);
  const [panel, setPanel] = useState<"invite" | "add" | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const [draft, setDraft] = useState<Person>({ id: "", name: "", email: "", phone: "", role: "ta", country: "Sri Lanka", inbox: "", active: true });
  const [otherRole, setOtherRole] = useState<Record<string, RoleKey>>({});
  const [inbox, setInbox] = useState("shortlists@career141.com");
  const [score, setScore] = useState(75);
  const [posters, setPosters] = useState({ ops: true, taLead: false });
  const [questions, setQuestions] = useState(STANDARD);
  const [toast, setToast] = useState<{ key: number; bold?: string; rest: string; warn?: boolean } | null>(null);
  const seq = useRef(0);
  const say = (bold: string | undefined, rest: string, warn?: boolean) => setToast({ key: ++seq.current, bold, rest, warn });

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matching = people.filter((p) => words.every((w) => [p.name, p.email, p.phone, ROLE_LABEL[p.role]].join(" ").toLowerCase().includes(w)));
  const active = matching.filter((p) => p.active);
  const gone = matching.filter((p) => !p.active);
  const shown = showGone ? [...active, ...gone] : active;

  const check = (p: Person, needEmail: boolean): string | null => {
    if (!p.name.trim()) return "Add their name.";
    if ((needEmail || p.email.trim()) && !isEmail(p.email)) return "That email does not look right.";
    if (!phoneOk(p.phone)) return "That mobile does not look right. Use the number with its country code.";
    if (p.inbox.trim() && !isEmail(p.inbox)) return "The applications inbox must be an email address.";
    if (p.email.trim() && people.some((x) => x.id !== p.id && x.email.toLowerCase() === p.email.trim().toLowerCase())) return "Someone on the desk already has that email.";
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
    setInvites((all) => [{ id: `i${Date.now()}`, email: draft.email.trim(), role: draft.role, sent: "today" }, ...all]);
    setPanel(null);
    say(draft.email.trim(), ` invited as ${ROLE_LABEL[draft.role]}. They get an email to set up their sign-in.`);
  };
  const add = () => {
    const why = check(draft, false);
    if (why) return say(undefined, why, true);
    setPeople((all) => [{ ...draft, id: `u${Date.now()}`, name: draft.name.trim(), inbox: draft.inbox.trim() || `${draft.name.trim().split(" ")[0].toLowerCase()}.jobs@career141.com` }, ...all]);
    setPanel(null);
    say(draft.name.trim(), " added to the desk.");
  };
  const save = () => {
    if (!editing) return;
    const why = check(editing, false);
    if (why) return say(undefined, why, true);
    setPeople((all) => all.map((p) => (p.id === editing.id ? editing : p)));
    setEditing(null);
    say(editing.name, " saved.");
  };
  const setActive = (p: Person, on: boolean) => {
    setPeople((all) => all.map((x) => (x.id === p.id ? { ...x, active: on } : x)));
    say(p.name, on ? " is back on the desk." : " is marked as left. They come off every picker; their history stays.");
  };

  const form = (p: Person, set: (p: Person) => void, mode: "invite" | "add" | "edit") => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      <Field label="Role">
        <PillMenu options={ROLE_MENU} initial={p.role} title="Role" pillClass={FIELD + " text-left"} onChange={(v) => set({ ...p, role: v as RoleKey })} />
      </Field>
      {mode !== "invite" && (
        <>
          <Field label="Works in">
            <PillMenu options={COUNTRY_MENU} initial={p.country} title="Works in" pillClass={FIELD + " text-left"} onChange={(v) => set({ ...p, country: v })} />
          </Field>
          <Field label="Applications inbox" wide>
            <input type="email" value={p.inbox} onChange={(e) => set({ ...p, inbox: e.target.value })} placeholder={mode === "add" ? "nuha.jobs@career141.com — left blank, one is made" : "nuha.jobs@career141.com"} className={FIELD + " font-mono"} />
          </Field>
        </>
      )}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[max(3.5rem,14px)] py-[max(2.25rem,16px)] max-md:pt-12">
      <div className="mx-auto flex w-full max-w-[64rem] flex-col gap-[max(1.75rem,14px)]">
        <p className="max-w-[70ch] text-small text-ink-2">
          Who is on the desk, and what each of them can do.
          {canEdit
            ? " Nobody is deleted — a name on a year of stage changes has to keep resolving, so someone who leaves is marked as left and comes off the pickers."
            : " Only an admin can change this."}
        </p>

        {/* The main job: the people. */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-h3 font-medium text-ink">
              People <span className="text-ink-3">{active.length}</span>
            </h2>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by name, email, mobile or role" aria-label="Find a person" className={FIELD + " ml-auto max-w-[18rem] rounded-full"} />
            {canEdit && (
              <>
                <button type="button" onClick={() => openPanel("invite")} className={PRIMARY}>{panel === "invite" ? "Cancel" : "Invite someone"}</button>
                <button type="button" onClick={() => openPanel("add")} className={QUIET}>{panel === "add" ? "Cancel" : "Add without invite"}</button>
              </>
            )}
          </div>

          {panel && (
            <div className="rounded-md border border-border bg-surface px-[max(1.5rem,14px)] py-[max(1.25rem,12px)] shadow-card">
              {form(draft, setDraft, panel)}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" onClick={panel === "invite" ? invite : add} className={PRIMARY}>{panel === "invite" ? "Send invite" : "Add them"}</button>
                <p className="max-w-[80ch] text-caption text-ink-3">
                  {panel === "invite"
                    ? "The role is saved now, so it applies from their first sign-in. They get an email with a link to set up their sign-in. The role can be changed later with Edit."
                    : "The mobile shows on every snippet they publish. The applications inbox is the address that goes into the LinkedIn job setup for every advert they run — set it up in Microsoft 365 first."}
                </p>
              </div>
            </div>
          )}

          {shown.length ? (
            <ul className="flex flex-col gap-2">
              {shown.map((p) =>
                editing?.id === p.id ? (
                  <li key={p.id} className="rounded-md border border-brand bg-surface px-[max(1.25rem,12px)] py-4 shadow-card">
                    {form(editing, setEditing, "edit")}
                    <div className="mt-4 flex gap-3">
                      <button type="button" onClick={save} className={PRIMARY}>Save</button>
                      <button type="button" onClick={() => setEditing(null)} className="px-2 text-small text-ink-2 hover:text-ink">Cancel</button>
                    </div>
                  </li>
                ) : (
                  <li key={p.id} className={"flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md px-[max(1.25rem,12px)] py-3 " + (p.active ? "bg-canvas" : "bg-surface-2")}>
                    <span className={"grid size-9 shrink-0 place-items-center rounded-full text-caption font-medium text-white " + (p.active ? "bg-brand" : "bg-border-strong")}>{initials(p.name)}</span>
                    <span className="min-w-[12rem] flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-small font-medium text-ink">{p.name}</span>
                        {!p.active && <span className="rounded-xs bg-surface-3 px-1.5 text-caption text-ink-2">Left</span>}
                      </span>
                      <span className="block truncate text-caption text-ink-3">{[p.email, p.phone, p.country].filter(Boolean).join(" · ")}</span>
                    </span>
                    {p.inbox && <span className="hidden truncate font-mono text-mono text-ink-3 lg:block lg:max-w-[16rem]" title="Applications inbox">{p.inbox}</span>}
                    <span className="w-[9.5rem] shrink-0 text-small text-ink-2">{ROLE_LABEL[p.role]}</span>
                    {canEdit && (
                      <span className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => setEditing(p)} className="rounded-full px-3 py-1.5 text-small text-ink-2 hover:bg-surface-2 hover:text-ink">Edit</button>
                        {/* Nobody marks themselves as left — that is how a desk locks itself out. */}
                        {p.id !== meId && (
                          <button type="button" onClick={() => setActive(p, !p.active)} className="rounded-full px-3 py-1.5 text-small text-ink-3 hover:bg-surface-2 hover:text-ink">
                            {p.active ? "Mark as left" : "Bring back"}
                          </button>
                        )}
                      </span>
                    )}
                  </li>
                ),
              )}
            </ul>
          ) : (
            <p className="rounded-md bg-canvas px-5 py-6 text-center text-small text-ink-3">{q ? "Nobody matches that search." : "Nobody on the desk yet."}</p>
          )}
          {gone.length > 0 && (
            <button type="button" onClick={() => setShowGone((v) => !v)} className="self-start text-small text-ink-2 hover:text-ink">
              {showGone ? "Hide" : "Show"} {gone.length} who {gone.length === 1 ? "has" : "have"} left
            </button>
          )}
        </section>

        {canEdit && invites.length > 0 && (
          <Card title={`Invites waiting to be accepted · ${invites.length}`}>
            <ul className="flex flex-col divide-y divide-border">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <span className="min-w-[12rem] flex-1 text-small text-ink">{i.email}</span>
                  <span className="w-[9.5rem] text-small text-ink-2">{ROLE_LABEL[i.role]}</span>
                  <span className="text-caption text-ink-3">sent {i.sent}</span>
                  <button type="button" onClick={() => { setInvites((all) => all.filter((x) => x.id !== i.id)); say(i.email, " invite revoked."); }} className="rounded-full px-3 py-1.5 text-small text-ink-3 hover:bg-surface hover:text-danger">
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {canEdit && others.length > 0 && (
          <Card title="Other accounts — not on the desk" note="Made by the older app. They have no access here until you give them a role. Only those marked “can sign in” have a login already; the others need an invite after you give them access.">
            <ul className="flex flex-col divide-y divide-border">
              {others.map((a) => (
                <li key={a.email} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                  <span className="min-w-[12rem] flex-1">
                    <span className="block text-small text-ink">{a.name}</span>
                    <span className="block text-caption text-ink-3">{a.email}{a.records > 1 && ` · ${a.records} records`}</span>
                  </span>
                  <span className="text-caption text-ink-3">older app: {a.oldRole}</span>
                  <span className={"text-caption " + (a.canSignIn ? "text-brand" : "text-ink-3")}>{a.canSignIn ? "can sign in" : "no login here"}</span>
                  <span className="w-[10rem]">
                    <PillMenu options={ROLE_MENU} initial="ta" title="Role" pillClass={FIELD + " text-left"} onChange={(v) => setOtherRole((r) => ({ ...r, [a.email]: v as RoleKey }))} />
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const r = otherRole[a.email] ?? "ta";
                      setOthers((all) => all.filter((x) => x.email !== a.email));
                      setPeople((all) => [{ id: `u${Date.now()}`, name: a.name, email: a.email, phone: "", role: r, country: "Sri Lanka", inbox: "", active: true }, ...all]);
                      say(a.name, ` now has access as ${ROLE_LABEL[r]}.`);
                    }}
                    className={QUIET}
                  >
                    Give access
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* The desk's own settings: quieter, below the people (rule 2: hide, don't remove). */}
        <section className="flex flex-col gap-3">
          <h2 className="text-h3 font-medium text-ink">Desk settings</h2>

          <Card title="Shortlist replies inbox — one for the whole desk" note="Copied on every shortlist email to a Director or a client, and named on the reply-to, so the reply is tracked whichever way they answer. The subject line already names the client, the role and the day.">
            <div className="flex flex-wrap items-center gap-3">
              <input type="email" value={inbox} disabled={!canEdit} onChange={(e) => setInbox(e.target.value)} aria-label="Shortlist replies inbox" className={FIELD + " max-w-[22rem] font-mono"} />
              {canEdit && <button type="button" onClick={() => (isEmail(inbox) ? say("Shortlist replies inbox", " saved.") : say(undefined, "That email does not look right.", true))} className={QUIET}>Save</button>}
            </div>
          </Card>

          <Card title="Pre-shortlist score" note="New CVs and database matches scoring this or more are pre-shortlisted, and wait for the TA to confirm. 85 and above is “strong”, 60 to 84 “worth a look”.">
            <div className="flex items-center gap-3">
              <input type="number" min={40} max={100} value={score} disabled={!canEdit} onChange={(e) => setScore(Number(e.target.value))} aria-label="Pre-shortlist score" className={FIELD + " w-24"} />
              {canEdit && (
                <button type="button" onClick={() => (score >= 40 && score <= 100 ? say("Pre-shortlist score", ` saved: ${score}.`) : say(undefined, "Use a score from 40 to 100.", true))} className={QUIET}>Save</button>
              )}
            </div>
          </Card>

          <Card title="Jobs on the website" note="The Website switch on a job lists it on career141.com, or takes it down. An admin can always use it. Tick who else can.">
            <div className="flex flex-wrap items-center gap-5">
              {(["ops", "taLead"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 text-small text-ink">
                  <input type="checkbox" checked={posters[k]} disabled={!canEdit} onChange={(e) => setPosters((p) => ({ ...p, [k]: e.target.checked }))} className="size-4 accent-brand" />
                  {k === "ops" ? "Ops" : "TA leads"}
                </label>
              ))}
              {canEdit && <button type="button" onClick={() => say("Who can put jobs on the website", " saved.")} className={QUIET}>Save</button>}
            </div>
          </Card>

          <Card title="End-of-day copy">
            <p className="max-w-[70ch] text-small text-ink-2">
              Every end-of-day email starts out to <span className="font-mono text-mono">{EOD_TO}</span>, copying {EOD_CC.map((c, i) => <span key={c}>{i ? ", " : ""}<span className="font-mono text-mono">{c}</span></span>)}. A TA can add or take off To and Cc addresses on the email itself.
            </p>
          </Card>

          <Card title="Standard follow-up questions" note="Asked on the AI call and chased on WhatsApp for every shortlisted candidate. Switch one off and it is no longer asked. A TA adds job-specific questions on the opening itself.">
            <ul className="flex flex-col gap-2">
              {questions.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={x.on}
                    aria-label={`Ask ${x.label}`}
                    disabled={!canEdit}
                    onClick={() => setQuestions((all) => all.map((y) => (y.id === x.id ? { ...y, on: !y.on } : y)))}
                    className={"relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50 " + (x.on ? "bg-brand" : "bg-border-strong")}
                  >
                    <span className={"absolute left-[3px] top-[3px] size-4.5 rounded-full bg-surface shadow-card transition-transform " + (x.on ? "translate-x-4" : "")} />
                  </button>
                  <input
                    value={x.label}
                    disabled={!canEdit}
                    onChange={(e) => setQuestions((all) => all.map((y) => (y.id === x.id ? { ...y, label: e.target.value } : y)))}
                    aria-label="Question"
                    className={FIELD + " max-w-[20rem]"}
                  />
                </li>
              ))}
            </ul>
            {canEdit && (
              <button
                type="button"
                onClick={() => (questions.some((x) => !x.label.trim()) ? say(undefined, "A question cannot be empty.", true) : say("Standard follow-up questions", " saved."))}
                className={QUIET + " mt-3"}
              >
                Save questions
              </button>
            )}
          </Card>
        </section>
      </div>
      {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} warn={toast.warn} />}
    </div>
  );
}
