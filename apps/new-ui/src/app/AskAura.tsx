"use client";

// One "Ask AURA" for the pet's box and the top bar (owner 20 Nov 2026: both sent every
// question to the Database page). The question is read first (src/lib/askAura.ts):
// a day question is answered here at once from the person's own day (ui/myDay:today),
// "open X" opens that screen, a search goes to the Database page with the words in its
// box, and anything else goes to AURA's Today chat (Claude Haiku on the person's desk)
// and is answered here, never longer than the 20 s the backend allows.
import { SearchSteps, useSteps } from "./SearchSteps";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { door, ROLE_OF, useDoorAction, useDoorClient, useDoorQuery, type AuraReply } from "@/lib/backend";
import { setViewed, useViewed } from "@/lib/viewAs";
import { canViewAs, useSignedInPerson } from "@/lib/role";
import { petSay } from "@/lib/pet";
import { dayAnswer, readAdminAsk, readAsk, SAMPLE_DAY, type MyDay, type Row } from "@/lib/askAura";

export type Asked = { asked: string; busy?: boolean; say?: string; rows?: Row[] };
type DayRead = ({ ok: true } & MyDay) | { ok: false; message: string } | undefined;

const WAIT_MS = 22_000;

type HomeReply = { ok: true; reply: { say: string; rows: { main: string; meta?: string }[] } } | { ok: false; message: string };
// A desk-wide person asks about the whole desk (20 Nov audit: a lead's "how many
// openings are active" was answered from her own empty TA desk).
const DESK_ROLE: Partial<Record<string, "Lead" | "Director" | "Ops">> = { Lead: "Lead", Admin: "Lead", Director: "Director", Ops: "Ops" };

type Report =
  | { ok: false; message: string }
  | { ok: true; several: { id: string; name: string }[] }
  | {
      ok: true;
      person: { id: string; name: string; role: string; active: boolean };
      positions?: { jobId: string; title: string; workType: string }[];
      workday: { date: string; startedAt: number; finishedAt: number | null; positions: number; closure: string | null } | null;
      unticked: { position: string; label: string }[];
      actions: { at: string; action: string; what: string }[];
    };
type Who = { id: string; name: string; role: string };
type AdminReply = { ok: true; say: string; rows: { main: string; meta?: string }[]; person: Who & { positions: { jobId: string; title: string }[] } } | { ok: false; message: string; code?: "no_person" };
const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit" });

export function useAsk(onLeave?: () => void) {
  const client = useDoorClient();
  const viewing = useViewed();
  const askAdmin = useDoorAction(door.adminAsk);
  const person = useSignedInPerson();
  const signed = person !== null;
  const deskRole = person ? DESK_ROLE[person.role] : undefined;
  const askHome = useDoorAction(door.homeAsk);
  const read = useDoorQuery(door.myDay, signed ? {} : "skip") as DayRead;
  const day: MyDay | null = !signed ? SAMPLE_DAY : read && read.ok ? read : null;
  const ask = useDoorAction(door.askToday);
  const router = useRouter();
  const [answer, setAnswer] = useState<Asked | null>(null);

  // Open a person's screens read only: Today, or the pipeline of one of their positions.
  const goAs = (p: Who, path: string) => {
    setViewed({ id: p.id, name: p.name, role: ROLE_OF[p.role] ?? "TA" });
    onLeave?.();
    router.push(path);
  };
  const openRows = (p: Who, positions: { jobId: string; title: string }[] = []): Row[] => !canViewAs() ? [] : [
    { main: `Open ${p.name}'s Today`, meta: "Read only", go: () => goAs(p, "/today") },
    ...positions.slice(0, 4).map((x) => ({ main: `Open pipeline: ${x.title}`, meta: "Read only", go: () => goAs(p, `/openings/demo?job=${x.jobId}&view=pipeline`) })),
  ];

  const run = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    // An admin's own questions about a person (21 Nov): what they did, or open their screens read only.
    const adm = person?.role === "Admin" ? readAdminAsk(t) : null;
    if (adm) {
      if (adm.kind === "stop") {
        setViewed(null);
        setAnswer({ asked: t, say: "Back on your own view." });
        return;
      }
      if (adm.kind === "view" && !canViewAs()) {
        setAnswer({ asked: t, say: "Viewing as another person is not open to this account." });
        return;
      }
      setAnswer({ asked: t, busy: true });
      try {
        const r = (await client?.query(door.report, { name: adm.name })) as Report | undefined;
        if (!r) throw new Error("no answer");
        if (!r.ok) setAnswer({ asked: t, say: r.message });
        else if ("several" in r) setAnswer({ asked: t, say: "Which one do you mean?", rows: r.several.map((p) => ({ main: p.name, meta: `Say "${adm.kind === "view" ? "log in as" : "check"} ${p.name}"` })) });
        else if (adm.kind === "view") {
          setViewed({ id: r.person.id, name: r.person.name, role: ROLE_OF[r.person.role] ?? "TA" });
          setAnswer({ asked: t, say: `Now viewing as ${r.person.name}. It is read only - say "back to me" to leave.` });
          onLeave?.();
          router.push("/today");
        } else {
          const w = r.workday;
          const say = !w
            ? `${r.person.name} has no workday on record.`
            : `${r.person.name}: workday ${w.date} ${w.finishedAt ? `finished ${clock(w.finishedAt)}${w.closure === "expired" ? " (expired, not ended by them)" : ""}` : `started ${clock(w.startedAt)}, not finished`}, ${w.positions} position${w.positions === 1 ? "" : "s"}.${r.person.active ? "" : " This account is deactivated."}`;
          setAnswer({
            asked: t,
            say: `${say} Say "log in as ${r.person.name}" to see their screens.`,
            rows: [
              ...openRows(r.person, r.positions),
              ...r.unticked.map((u) => ({ main: `Not done: ${u.label}`, meta: u.position })),
              ...r.actions.map((a) => ({ main: `${a.action} - ${a.what}`, meta: a.at.slice(0, 16).replace("T", " ") })),
            ],
          });
        }
      } catch {
        setAnswer({ asked: t, say: "I could not read that just now. Try again." });
      }
      return;
    }
    const route = readAsk(t, day?.positions ?? []);
    if (route.kind === "open" || route.kind === "search") {
      const href = route.kind === "open" ? route.path : `/database?q=${encodeURIComponent(route.q)}`;
      petSay("working", route.kind === "open" ? `Opening ${route.label}.` : "Searching the database…");
      setAnswer(null);
      onLeave?.();
      router.push(href);
      return;
    }
    if (route.kind === "day") {
      if (!day) {
        setAnswer({ asked: t, say: read && !read.ok ? read.message : "Still reading your day. Ask again in a moment." });
        return;
      }
      const a = dayAnswer(day, route.topic);
      setAnswer({ asked: t, ...a });
      petSay("done", a.say);
      return;
    }
    if (!signed) {
      setAnswer({ asked: t, say: "Sign in and I can answer that from your own desk." });
      return;
    }
    setAnswer({ asked: t, busy: true });
    petSay("working", "Thinking…");
    const late = new Promise<undefined>((r) => setTimeout(() => r(undefined), WAIT_MS));
    try {
      if (person?.role === "Admin") {
        // The admin's free questions about a TA (21 Nov): answered from that person's facts only.
        const a = (await Promise.race([askAdmin({ text: t, ...(viewing ? { personId: viewing.id } : {}) }), late])) as AdminReply | undefined;
        if (a?.ok) {
          setAnswer({ asked: t, say: a.say, rows: [...openRows(a.person, a.person.positions), ...a.rows] });
          petSay("done", a.say);
          return;
        }
        if (a && a.code !== "no_person") {
          setAnswer({ asked: t, say: a.message });
          petSay("failed", a.message);
          return;
        }
        // No TA named: it is a question about the whole desk, answered below.
      }
      if (deskRole) {
        const h = (await Promise.race([askHome({ role: deskRole, text: t }), late])) as HomeReply | undefined;
        if (!h) throw new Error("late");
        const out = h.ok ? { say: h.reply.say, rows: h.reply.rows.map((x) => ({ main: x.main, meta: x.meta })) } : { say: h.message };
        setAnswer({ asked: t, ...out });
        petSay(h.ok ? "done" : "failed", out.say);
        return;
      }
      const d = (await Promise.race([ask({ text: t, history: [], today: [] }), late])) as { ok: true; reply: AuraReply } | { ok: false; message: string } | undefined;
      if (!d) throw new Error("late");
      if (!d.ok) {
        setAnswer({ asked: t, say: d.message });
        petSay("failed", d.message);
        return;
      }
      const r = d.reply;
      const href = (where?: string) => (where ? `/openings/demo?job=${where}` : undefined);
      const out =
        r.kind === "plan"
          ? { say: r.headline, rows: r.steps.map((s) => ({ main: s.what, meta: s.at, href: href(s.where) })) }
          : { say: r.say, rows: r.rows.map((x) => ({ main: x.main, meta: x.meta, href: href(x.where) })) };
      setAnswer({ asked: t, ...out });
      petSay("done", out.say);
    } catch {
      const say = "AURA took too long. Try again, or ask something shorter.";
      setAnswer({ asked: t, say });
      petSay("failed", say);
    }
  };
  return { run, answer, clear: () => setAnswer(null) };
}

/** The answer under the box: one line, then a few rows (a row with a link opens it). */
export function AskReply({ answer, onLeave }: { answer: Asked; onLeave?: () => void }) {
  return (
    <div className="mt-2 rounded-md bg-surface-2 px-3 py-2.5 text-small text-ink">
      {answer.busy ? (
        <AskSteps />
      ) : (
        <>
          <p>{answer.say}</p>
          {!!answer.rows?.length && (
            <ul className="mt-2 flex max-h-56 flex-col gap-1 overflow-x-hidden overflow-y-auto">
              {answer.rows.slice(0, 8).map((r, i) => {
                const body = (
                  <>
                    {/* AURA's lines wrap, the detail under them (20 Nov: a long detail beside
                        the line cut the line to "…" and pushed the box sideways). */}
                    <span className="min-w-0 break-words">{r.main}</span>
                    {r.meta && <span className="min-w-0 break-words text-caption text-ink-3">{r.meta}</span>}
                  </>
                );
                return (
                  <li key={i}>
                    {r.go ? (
                      <button type="button" onClick={r.go} className="flex w-full flex-col rounded-sm px-1.5 py-1 text-left hover:bg-surface">
                        {body}
                      </button>
                    ) : r.href ? (
                      <Link href={r.href} onClick={onLeave} className="flex flex-col rounded-sm px-1.5 py-1 hover:bg-surface">
                        {body}
                      </Link>
                    ) : (
                      <span className="flex flex-col px-1.5 py-1">{body}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** What AURA does while it answers, as one line of steps (20 Nov 2026); the last waits. */
const ASK_STEPS = ["Read your question", "Looking at your desk", "Writing the answer"];
function AskSteps() {
  const at = useSteps(true, ASK_STEPS.length - 1, 700);
  return <SearchSteps compact at={at} steps={ASK_STEPS.map((label) => ({ label }))} />;
}
