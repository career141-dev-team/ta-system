"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DUR, HOVER_IN, HOVER_OUT, gsap, useExit, useGSAP } from "@/lib/gsap";
import Toast from "./Toast";
import { LIVE, door, jobFromAddress, useDoorMutation, useDoorQuery, useLive, type Answer, type DoorDone } from "@/lib/backend";

// The opening's Automations (owner's design, 13 Nov 2026), as the TA System has them
// (follow-up skill, Flows F and I):
//   - "Automatic follow-up": the opening's own switch. On, the first message goes
//     the moment a candidate is shortlisted and a reminder follows every 24 hours;
//     off, nothing goes until a TA presses Send. It starts off on a new opening.
//   - The opening's own questions, asked after the standard four (CV, current
//     salary, expected salary, notice period). At most 12, each up to 200
//     characters, no repeats.
//   - Only someone who manages the opening (a TA Lead, Director, Ops, admin, or a
//     recruiter on it) may change them; everyone else reads them.
// Placeholder data; with the backend Save writes both and the server re-checks.

const STANDARD = ["CV", "Current salary", "Expected salary", "Notice period"];
const MAX_QUESTIONS = 12;
const MAX_CHARS = 200;
// Placeholders: the opening's saved settings, the person's right to change them,
// and the system's test mode (messages to candidates go to the test number only
// until the owner turns outreach live).
const SAVED = {
  on: true,
  questions: ["Have you led an S/4HANA rollout end to end?", "Are you open to a hybrid role, 3 days in Colombo?", "What is the earliest you could join?"],
};
const CAN_MANAGE = true;
const TEST_MODE = true;
const IN_FOLLOW_UP = 7; // sample: people in Follow-up on this opening

type Q = { id: number; text: string };
let seq = 0;
const toQs = (list: string[]): Q[] => list.map((text) => ({ id: ++seq, text }));

const LIFT_OUT = { opacity: 0, y: -6, scale: 0.97 };

/** The Automations pill on the Pipeline and the panel it lifts open under it. */
export default function Automations({ pillClass, icon }: { pillClass: string; icon: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Live, nothing is shown until the real settings arrive: opening the panel on the
  // sample and pressing Save would have written the sample questions onto a real
  // opening (19 Nov audit).
  const [saved, setSaved] = useState(() => (LIVE && jobFromAddress() ? { on: false, questions: [] as string[] } : SAVED));
  // Live: the opening's real switch and questions (ui/opening:summary); saving goes
  // through ui/opening:setFollowUp and ui/manage:setQuestions, which re-check the rules.
  const live = useLive();
  const job = live ? jobFromAddress() : null;
  const real = useDoorQuery(door.summary, job ? { openingId: job } : "skip") as
    | Answer<{ opening: { followUp: { on: boolean | null; questions: { label: string }[] } } }>
    | undefined;
  const [seenReal, setSeenReal] = useState<typeof real>(undefined);
  if (real !== seenReal) {
    setSeenReal(real);
    if (real?.ok) setSaved({ on: !!real.opening.followUp.on, questions: real.opening.followUp.questions.map((q) => q.label) });
  }
  const saveSwitch = useDoorMutation(door.setFollowUp);
  const saveQuestions = useDoorMutation(door.setQuestions);
  const [on, setOn] = useState(saved.on);
  const [qs, setQs] = useState(() => toQs(saved.questions));
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState(0);
  const [msg, setMsg] = useState({ bold: "", rest: "" });
  const say = (bold: string, rest: string) => {
    setMsg({ bold, rest });
    setNotice((n) => n + 1);
  };
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const shown = useExit(open, panel, LIFT_OUT);

  // Opening starts from what is saved; closing without Save leaves it as it was.
  // It opens like every dropdown in the app: on hover after a short rest, or on a
  // press. Once you press inside it or type, it stays open while the pointer is
  // away - it only closes on x, Escape, a press outside, or Save - so a pointer
  // slipping off the panel never throws away your edits.
  const me = useId();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const held = useRef(false);
  const show = () => {
    // Only one dropdown open at a time (the filters' menus listen for this too).
    window.dispatchEvent(new CustomEvent("pillmenu:open", { detail: me }));
    held.current = false;
    if (job && !real?.ok) return say("", real ? real.message : "Still reading this opening's settings. Try again in a moment.");
    setOn(saved.on);
    setQs(toQs(saved.questions));
    setProblem(null);
    setOpen(true);
  };
  const close = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  const hoverIn = () => {
    clearTimeout(timer.current);
    if (!open) timer.current = setTimeout(show, HOVER_IN);
  };
  const hoverOut = () => {
    clearTimeout(timer.current);
    if (!held.current) timer.current = setTimeout(() => setOpen(false), HOVER_OUT);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const other = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== me && !held.current) close();
    };
    window.addEventListener("pillmenu:open", other);
    return () => window.removeEventListener("pillmenu:open", other);
  }, [me]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  // The lift every dropdown in the app uses (PillMenu): the panel eases down from
  // the pill, and its rows follow a beat apart.
  useGSAP(
    () => {
      if (!open || !panel.current) return;
      gsap.fromTo(panel.current, LIFT_OUT, { opacity: 1, y: 0, scale: 1, duration: DUR.fast, transformOrigin: "top right" });
      gsap.from(panel.current.querySelectorAll("[data-lift]"), { opacity: 0, y: -4, duration: DUR.fast, stagger: 0.03 });
    },
    { dependencies: [open], scope: root },
  );

  const texts = qs.map((q) => q.text.trim()).filter(Boolean);
  const dirty = on !== saved.on || texts.join("\n") !== saved.questions.join("\n");

  const add = () => {
    if (qs.length >= MAX_QUESTIONS) return;
    setQs((all) => [...all, { id: ++seq, text: "" }]);
    requestAnimationFrame(() => panel.current?.querySelector<HTMLInputElement>("[data-q]:last-of-type input")?.focus());
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= qs.length || from === to) return;
    setQs((all) => {
      const next = [...all];
      const [q] = next.splice(from, 1);
      next.splice(to, 0, q);
      return next;
    });
  };

  const save = async () => {
    const seen = new Set<string>();
    for (const t of texts) {
      const k = t.toLowerCase();
      if (seen.has(k)) return setProblem(`"${t}" is asked twice.`);
      seen.add(k);
    }
    const added = texts.filter((t) => !saved.questions.includes(t)).length;
    if (job) {
      const done = (await saveQuestions({ openingId: job, questions: texts })) as DoorDone | undefined;
      if (done && !done.ok) return setProblem(done.message);
    }
    setSaved((s) => ({ ...s, questions: texts }));
    setQs(toQs(texts));
    setProblem(null);
    setOpen(false);
    say("Questions saved", added && !job ? ` - asked of the ${IN_FOLLOW_UP} people in Follow-up.` : ".");
  };

  return (
    <div ref={root} className="relative" onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        // A press on a panel the hover just opened keeps it open rather than shutting it.
        onClick={() => {
          clearTimeout(timer.current);
          if (!open) show();
          else if (held.current) close();
          held.current = true;
        }}
        className={pillClass + " transition-colors hover:bg-surface-2" + (open ? " bg-surface-2" : "")}
      >
        {icon}
        Automations
        {saved.on && <span aria-label="Automatic follow-up is on" className="size-1.5 rounded-full bg-brand" />}
      </button>

      {shown && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Automations"
          onPointerDown={() => (held.current = true)}
          onFocus={() => (held.current = true)}
          // The ::before bridges the gap to the pill, so moving down onto the panel never leaves it.
          className="absolute right-0 top-full z-40 mt-2 before:absolute before:inset-x-0 before:-top-2 before:h-2 before:content-[''] w-[max(38rem,340px)] rounded-xl bg-surface p-[max(2rem,18px)] shadow-float max-md:fixed max-md:inset-x-3 max-md:top-24 max-md:w-auto"
        >
          <div data-lift className="flex items-center">
            <h2 className="text-h2 text-ink">Automations</h2>
            <button type="button" aria-label="Close" onClick={close} className="ml-auto flex size-[max(2rem,28px)] items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink">
              <Cross />
            </button>
          </div>

          {/* The opening's own switch. */}
          <div data-lift className="mt-[max(1.4rem,12px)] rounded-lg bg-surface-2 p-[max(1.3rem,12px)]">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-ink">Automatic follow-up</p>
                <p className="text-small text-ink-3">AI asks for CV, salary and notice; reminds every 24 h</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label="Automatic follow-up"
                disabled={!CAN_MANAGE}
                // The switch saves at once, as in the old system; the questions wait for Save.
                onClick={async () => {
                  const v = !on;
                  setOn(v);
                  setSaved((s) => ({ ...s, on: v }));
                  if (job) {
                    const done = (await saveSwitch({ openingId: job, on: v })) as DoorDone | undefined;
                    if (done && !done.ok) {
                      setOn(!v);
                      setSaved((s) => ({ ...s, on: !v }));
                      return say("Not saved", ` - ${done.message}`);
                    }
                  }
                  say("Automatic follow-up", v ? " is on." : " is off.");
                }}
                className={"relative h-[max(2rem,26px)] w-[max(3.5rem,46px)] shrink-0 rounded-full transition-colors disabled:opacity-50 " + (on ? "bg-brand" : "bg-border-strong")}
              >
                <span className={"absolute left-[3px] top-[3px] size-[calc(max(2rem,26px)-6px)] rounded-full bg-surface shadow-card transition-transform " + (on ? "translate-x-[calc(max(3.5rem,46px)-max(2rem,26px))]" : "")} />
              </button>
            </div>
            {on && TEST_MODE && <p className="mt-[max(0.9rem,8px)] rounded-sm bg-warn-soft px-[max(0.9rem,9px)] py-[max(0.55rem,6px)] text-small text-warn">Test mode: messages go to the test number only</p>}
          </div>

          {/* The opening's own questions, after the standard four. */}
          <div data-lift className="mt-[max(1.6rem,14px)] flex items-baseline">
            <h3 className="text-h3 font-medium text-ink">Questions for this job</h3>
            <span title={"Always asked: " + STANDARD.join(", ")} className="ml-auto cursor-help text-caption font-medium text-ink-3">
              Standard 4 always asked
            </span>
          </div>
          <ul className="mt-[max(0.8rem,8px)] max-h-[min(22rem,40vh)] space-y-[max(0.7rem,7px)] overflow-y-auto">
            {qs.map((q, i) => (
              <li
                key={q.id}
                data-q
                data-lift
                draggable={CAN_MANAGE}
                onDragStart={() => (drag.current = i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (drag.current !== null && drag.current !== i) {
                    move(drag.current, i);
                    drag.current = i;
                  }
                }}
                onDragEnd={() => (drag.current = null)}
                className="flex items-center gap-[max(0.7rem,7px)] rounded-md border border-border bg-surface px-[max(0.9rem,9px)] py-[max(0.6rem,6px)] focus-within:border-brand/40 focus-within:ring-2 focus-within:ring-brand/20"
              >
                {CAN_MANAGE && (
                  <span aria-hidden="true" title="Drag to change the order" className="cursor-grab text-ink-3 active:cursor-grabbing">
                    <Grip />
                  </span>
                )}
                <input
                  value={q.text}
                  readOnly={!CAN_MANAGE}
                  maxLength={MAX_CHARS}
                  placeholder="Type a question for the candidate"
                  aria-label={`Question ${i + 1}`}
                  onChange={(e) => {
                    setProblem(null);
                    setQs((all) => all.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x)));
                  }}
                  onKeyDown={(e) => {
                    // Alt + up / down moves a question without a mouse.
                    const to = e.altKey && e.key === "ArrowUp" ? i - 1 : e.altKey && e.key === "ArrowDown" ? i + 1 : null;
                    if (to !== null) {
                      e.preventDefault();
                      move(i, to);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      add();
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-small text-ink outline-none placeholder:text-ink-3"
                />
                {q.text.length > MAX_CHARS - 30 && <span className="text-caption text-ink-3">{MAX_CHARS - q.text.length}</span>}
                {CAN_MANAGE && (
                  <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => setQs((all) => all.filter((x) => x.id !== q.id))} className="flex size-[max(1.6rem,22px)] shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink">
                    <Cross />
                  </button>
                )}
              </li>
            ))}
            {!qs.length && <li className="rounded-md border border-dashed border-border px-[max(0.9rem,9px)] py-[max(0.6rem,6px)] text-small text-ink-3">Only the standard four are asked.</li>}
          </ul>

          {problem && <p className="mt-2 text-caption text-danger">{problem}</p>}

          {CAN_MANAGE ? (
            <div data-lift className="mt-[max(1rem,9px)] flex items-center">
              {qs.length < MAX_QUESTIONS ? (
                <button type="button" onClick={add} className="flex items-center gap-2 rounded-full px-2 py-1 text-small font-medium text-brand hover:bg-brand-tint">
                  <PlusIcon /> Add a question
                </button>
              ) : (
                <span className="text-caption text-ink-3">{MAX_QUESTIONS} questions at most</span>
              )}
              <button type="button" disabled={!dirty} onClick={save} className="ml-auto h-[max(2.6rem,34px)] rounded-full bg-brand px-[max(1.5rem,16px)] text-small font-medium text-white hover:bg-brand-strong disabled:bg-surface-3 disabled:text-ink-3">
                Save
              </button>
            </div>
          ) : (
            <p className="mt-[max(1rem,9px)] text-caption text-ink-3">Only the TA Lead or a recruiter on this opening can change these.</p>
          )}
        </div>
      )}
      {notice > 0 && <Toast key={notice} bold={msg.bold} rest={msg.rest} />}
    </div>
  );
}

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const Cross = () => (
  <svg {...svg} strokeWidth={2.2} className="size-[1em]">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
const PlusIcon = () => (
  <svg {...svg} strokeWidth={2.4} className="size-[1em]">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Grip = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-[1em]">
    {[6, 12, 18].map((y) => (
      <g key={y}>
        <circle cx="9" cy={y} r="1.5" />
        <circle cx="15" cy={y} r="1.5" />
      </g>
    ))}
  </svg>
);
