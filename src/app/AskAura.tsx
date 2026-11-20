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
import { door, useDoorAction, useDoorQuery, type AuraReply } from "@/lib/backend";
import { useSignedInPerson } from "@/lib/role";
import { petSay } from "@/lib/pet";
import { dayAnswer, readAsk, SAMPLE_DAY, type MyDay, type Row } from "@/lib/askAura";

export type Asked = { asked: string; busy?: boolean; say?: string; rows?: Row[] };
type DayRead = ({ ok: true } & MyDay) | { ok: false; message: string } | undefined;

const WAIT_MS = 22_000;

export function useAsk(onLeave?: () => void) {
  const signed = useSignedInPerson() !== null;
  const read = useDoorQuery(door.myDay, signed ? {} : "skip") as DayRead;
  const day: MyDay | null = !signed ? SAMPLE_DAY : read && read.ok ? read : null;
  const ask = useDoorAction(door.askToday);
  const router = useRouter();
  const [answer, setAnswer] = useState<Asked | null>(null);

  const run = async (text: string) => {
    const t = text.trim();
    if (!t) return;
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
                    {r.href ? (
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
