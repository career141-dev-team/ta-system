"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { DUR, EASE, gsap, loadFlip, useGSAP, type FlipPlugin } from "@/lib/gsap";
import CvPages, { cvText } from "./CvPages";
import { boxLines, runAgent, type Box, type BoxContent } from "./cvAgent";

// Placeholder: one sample CV laid out as in the owner's design (12 Nov 2026),
// with the card's own name and title. With the backend this is the candidate's
// prepared CV, read only when the preview opens - never with the board.
// Contact details are fake on purpose: the dev link is public.
const SAMPLE = {
  phone: "+94 77 000 0000",
  email: "candidate@example.com",
  linkedin: "candidate",
  site: "www.example.com",
  summary:
    "UI/UX Designer with 2+ years of experience designing SaaS, enterprise, e-commerce, and mobile products. Skilled in UX research, prototyping, usability testing, design systems, and AI-assisted design workflows, delivering intuitive and scalable user experiences.",
  jobs: [
    {
      role: "UI/UX Designer",
      company: "Tiron Agency | Dubai",
      dates: "June 2025 - Present",
      points: [
        "Experienced in AI-driven creative production using Claude, ChatGPT, and Higgsfield AI, creating visual assets, marketing content, concept designs, and AI-assisted design solutions for international clients.",
        "Create end-to-end e-commerce experiences, including product discovery, checkout flows, and customer account management.",
        "Designed end-to-end UX for e-commerce platforms, corporate websites and mobile apps, from research to hand-off.",
      ],
    },
    {
      role: "Junior UI/UX Designer",
      company: "Pixel Studio | Colombo",
      dates: "January 2024 - May 2025",
      points: [
        "Designed dashboards and admin tools for SaaS products, working closely with developers on hand-off.",
        "Ran usability tests with real users and turned the findings into design changes.",
        "Built and kept a shared component library in Figma used across three products.",
      ],
    },
  ],
  skills: ["Figma", "Prototyping", "UX research", "Usability testing", "Design systems", "Wireframing", "HTML / CSS"],
  education: [{ degree: "BSc (Hons) in Interactive Media", school: "University of Colombo", dates: "2020 - 2024" }],
};

/** The CV of one candidate, in a dark frame that rises over the blurred board.
 *  The corner button grows it to full view - the whole window - and back (owner,
 *  12 Nov 2026: "a whole view, with a full view I need it"). Escape or a click on
 *  the blurred board closes it. */
export default function CvPreview({
  ref,
  name,
  title,
  src,
  start = NO_DETAILS,
  onClose,
}: {
  /** The opener's handle on the preview, so it can play the preview's exit (useExit). */
  ref?: RefObject<HTMLDivElement | null>;
  name: string;
  title: string;
  /** The candidate's own CV file; without one the sample layout below is shown. */
  src?: string;
  /** What the desk holds for the green box (the TA System's CAREER141 box). */
  start?: BoxContent;
  onClose: () => void;
}) {
  // The green box AURA puts on page 1 when asked; dragged by hand too.
  const [box, setBox] = useState<Box | null>(null);
  const own = useRef<HTMLDivElement>(null);
  const root = ref ?? own;
  const [full, setFull] = useState(false);
  // Flip arrives with the first preview (it is not in the board's download); the
  // corner button works before it lands, only without the glide.
  const flip = useRef<FlipPlugin | null>(null);
  useEffect(() => {
    loadFlip().then((f) => (flip.current = f));
  }, []);
  // The frame's size and place before a full-view change, for Flip to animate from.
  const before = useRef<ReturnType<FlipPlugin["getState"]> | null>(null);

  const toggleFull = () => {
    const F = flip.current;
    if (F) {
      // Finish the frame's opening rise first: pressed during it, Flip took over
      // mid-way and the frame stayed half-faded and lowered.
      gsap.getTweensOf("[data-frame]").forEach((t) => t.progress(1));
      before.current = F.getState("[data-frame]");
    }
    setFull((f) => !f);
  };

  // After the frame has its new size, glide it there from where it was.
  useLayoutEffect(() => {
    const state = before.current;
    const F = flip.current;
    if (!state || !F) return;
    before.current = null;
    F.from(state, { duration: DUR.slow, ease: EASE.inOut });
  }, [full]);

  // The veil fades in and the frame rises from below, like a sheet.
  useGSAP(
    () => {
      gsap.from("[data-veil]", { opacity: 0, duration: DUR.fast });
      gsap.from("[data-frame]", { yPercent: 18, opacity: 0, duration: DUR.base });
      gsap.from("[data-doc] > *", { y: 14, opacity: 0, duration: DUR.base, stagger: 0.05, delay: 0.15 });
    },
    { scope: root },
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  return createPortal(
    <div ref={root} className="fixed inset-0 z-[85]">
      <div data-veil className="absolute inset-0 bg-white/20 backdrop-blur-[6px]" onClick={onClose} />
      <section
        data-frame
        role="dialog"
        aria-modal="true"
        aria-label={`CV of ${name}`}
        className={
          "absolute flex flex-col bg-ink pr-[2%] shadow-[0_-20px_80px_rgba(0,0,0,0.25)] " +
          (full
            ? "inset-[max(1rem,8px)] rounded-lg pl-[3%] pt-[max(3.25rem,24px)]"
            : "bottom-0 left-[12.3%] top-[11%] w-[75.3%] rounded-t-[3.75rem] pl-[5%] pt-[max(4.75rem,28px)] " +
              // A phone: the sheet takes the whole width.
              "max-md:left-0 max-md:top-[7%] max-md:w-full max-md:rounded-t-lg max-md:px-2 max-md:pt-12")
        }
      >
        <button
          type="button"
          onClick={toggleFull}
          aria-pressed={full}
          aria-label={full ? "Back to the smaller view" : "Full view"}
          title={full ? "Back to the smaller view" : "Full view"}
          className="absolute right-[max(1.6rem,12px)] top-[max(1rem,8px)] flex size-[max(2.4rem,30px)] items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-1/2" aria-hidden="true">
            {full ? (
              <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            ) : (
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            )}
          </svg>
        </button>
        {/* The candidate's own file: download it, or open it in a new tab, as the TA
            System's CV view offers (FLOW-CHECK 5.1, 5.6). Plain links, no script. */}
        {src && (
          <div className="absolute right-[max(4.6rem,50px)] top-[max(1rem,8px)] flex gap-[max(0.6rem,8px)]">
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              aria-label="Open this CV in a new tab"
              title="Open in a new tab"
              className="flex size-[max(2.4rem,30px)] items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-1/2" aria-hidden="true">
                <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
              </svg>
            </a>
            <a
              href={src}
              download={name.replace(/\s+/g, "-") + "-CV.pdf"}
              aria-label="Download this CV"
              title="Download"
              className="flex size-[max(2.4rem,30px)] items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-1/2" aria-hidden="true">
                <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4 19h16" />
              </svg>
            </a>
          </div>
        )}
        {/* The CV scrolls inside the dark frame; the scrollbar sits in the frame's right gutter. */}
        {src ? (
          <div className="min-h-0 flex-1 overflow-hidden rounded-t-[2.6rem] bg-ink max-md:rounded-t-md">
            <CvPages key={src} src={src} fit="width" overlay={box && <GreenBox box={box} setBox={setBox} />} />
          </div>
        ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-[3%] [scrollbar-color:#fff_transparent]">
          <article
            data-doc
            className="min-h-full rounded-t-[2.6rem] bg-white pb-[max(3rem,24px)] font-[Arial,Helvetica,sans-serif] text-ink"
          >
            <header className="px-[max(3.6rem,22px)] pt-[max(2.8rem,20px)]">
              <h2 className="text-[max(3.3rem,26px)] font-extrabold uppercase leading-none tracking-tight text-info">
                {name}
              </h2>
              <p className="mt-[max(1.6rem,10px)] text-[max(2rem,17px)] font-bold uppercase text-[#222]">{title}</p>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="mt-[max(1rem,6px)] inline-flex items-center gap-2 text-[max(1.55rem,14px)] text-info underline underline-offset-4"
              >
                View Design Portfolio
                <svg viewBox="0 0 24 24" fill="none" stroke="#222" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[1em]" aria-hidden="true">
                  <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                </svg>
              </a>
            </header>

            <div className="mt-[max(1.6rem,12px)] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 bg-info-soft px-[max(5rem,24px)] py-[max(1.4rem,12px)] text-[max(1.15rem,12px)] text-[#333]">
              <Contact icon="phone">{SAMPLE.phone}</Contact>
              <Contact icon="mail">{SAMPLE.email}</Contact>
              <Contact icon="in">{SAMPLE.linkedin}</Contact>
              <Contact icon="web">{SAMPLE.site}</Contact>
            </div>

            <Section title="Professional Summary">
              <p className="text-justify">{SAMPLE.summary}</p>
            </Section>

            <Section title="Professional Experience">
              {SAMPLE.jobs.map((j) => (
                <div key={j.role + j.company} className="mb-[max(1.8rem,14px)] last:mb-0">
                  <p className="text-[max(1.5rem,14px)] font-bold text-info">{j.role}</p>
                  <p className="mt-1 font-bold text-info">{j.company}</p>
                  <p className="mt-1 text-[#444]">{j.dates}</p>
                  <ul className="mt-[max(1rem,8px)] list-disc space-y-1 pl-[max(1.8rem,16px)]">
                    {j.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </Section>

            <Section title="Skills">
              <p>{SAMPLE.skills.join("  •  ")}</p>
            </Section>

            <Section title="Education">
              {SAMPLE.education.map((e) => (
                <div key={e.degree}>
                  <p className="font-bold text-info">{e.degree}</p>
                  <p className="mt-1">{e.school}</p>
                  <p className="mt-1 text-[#444]">{e.dates}</p>
                </div>
              ))}
            </Section>
          </article>
        </div>
        )}
        <CvAgent src={src} start={start} box={box} setBox={setBox} sampleText={sampleText(name, title)} />
      </section>
    </div>,
    document.body,
  );
}

const NO_DETAILS: BoxContent = { notes: [] };

/** The sample CV's words, for asking when there is no file. */
const sampleText = (name: string, title: string) =>
  [
    name,
    title,
    SAMPLE.phone,
    SAMPLE.email,
    SAMPLE.summary,
    ...SAMPLE.jobs.flatMap((j) => [`${j.role}, ${j.company}, ${j.dates}.`, ...j.points]),
    `Skills: ${SAMPLE.skills.join(", ")}.`,
    ...SAMPLE.education.map((e) => `Education: ${e.degree}, ${e.school}, ${e.dates}.`),
  ].join(" ");

/** The CAREER141 box on page 1, sized with the page (its type is in % of the page
 *  width, as the TA System lays it out in points on a 595-point page). Drag it. */
function GreenBox({ box, setBox }: { box: Box; setBox: (b: Box) => void }) {
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    const page = e.currentTarget.parentElement!.getBoundingClientRect();
    const from = { px: e.clientX, py: e.clientY, x: box.x, y: box.y };
    const move = (m: PointerEvent) =>
      setBox({
        ...box,
        x: Math.min(98 - box.w, Math.max(2, from.x + ((m.clientX - from.px) / page.width) * 100)),
        y: Math.min(90, Math.max(1, from.y + ((m.clientY - from.py) / page.height) * 100)),
      });
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };
  return (
    <div className="pointer-events-none absolute inset-0 [container-type:inline-size]">
      <div
        onPointerDown={drag}
        title="Drag to move"
        style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%` }}
        className="pointer-events-auto absolute cursor-grab touch-none border-[0.25cqw] border-brand bg-white p-[1.35cqw] font-[Arial,Helvetica,sans-serif] text-brand shadow-card active:cursor-grabbing"
      >
        {boxLines(box.content).map((l, i) => (
          <p key={i} className={i === 0 || l === "NOTE:-" ? "text-[1.6cqw] font-bold leading-[2.1cqw]" : "text-[1.43cqw] leading-[2.1cqw]"}>
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

/** AURA on the CV: say what to do (the green box) or ask about the CV. */
function CvAgent({
  src,
  start,
  box,
  setBox,
  sampleText,
}: {
  src?: string;
  start: BoxContent;
  box: Box | null;
  setBox: (b: Box | null) => void;
  sampleText: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [talk, setTalk] = useState<{ me: string; aura: string }[]>([]);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [talk]);
  const send = async (words: string) => {
    const t = words.trim();
    if (!t) return;
    setDraft("");
    const text = src ? await cvText(src).catch(() => "") : sampleText;
    const r = runAgent(t, box, start, text);
    setBox(r.box);
    setTalk((x) => [...x, { me: t, aura: r.reply }]);
  };
  const tries = box
    ? ["Move it to the top left", "Make it wider", "What are their skills?"]
    : ["Add the green box", "What are their skills?", "How many years of experience?"];
  return (
    <div className="absolute bottom-[max(1.25rem,10px)] right-[max(1.6rem,10px)] z-10 flex w-[min(380px,calc(100%-20px))] flex-col items-end gap-2">
      {open && (
        <div className="flex max-h-[min(60dvh,420px)] w-full flex-col rounded-lg bg-surface shadow-float">
          <div ref={list} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 [scrollbar-width:thin]">
            {!talk.length && (
              <p className="text-[max(0.875rem,12px)] text-ink-2">
                Tell me what to do on this CV, or ask about it. I can add the green box with their details, move it, size it and change what it says.
              </p>
            )}
            {talk.map((m, i) => (
              <div key={i} className="space-y-1.5">
                <p className="ml-auto w-fit max-w-[85%] rounded-lg rounded-br-xs bg-surface-2 px-3 py-2 text-[max(0.875rem,12px)] text-ink">{m.me}</p>
                <p className="whitespace-pre-line text-[max(0.875rem,12px)] text-ink">{m.aura}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {tries.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => send(t)}
                className="rounded-full border border-border px-2.5 py-1 text-[max(0.75rem,11px)] text-ink-2 hover:border-border-strong hover:text-ink"
              >
                {t}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-center gap-2 border-t border-border p-2"
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. add the green box with expected salary 550k"
              aria-label="Tell AURA what to do on this CV"
              className="min-w-0 flex-1 bg-transparent px-2 text-[max(0.875rem,12px)] text-ink outline-none placeholder:text-ink-3"
            />
            <button disabled={!draft.trim()} className="rounded-full bg-brand px-3 py-1.5 text-[max(0.8125rem,11.5px)] font-medium text-white disabled:opacity-40">
              Send
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full bg-surface py-1.5 pl-1.5 pr-4 text-[max(0.875rem,12px)] font-medium text-ink shadow-float hover:bg-surface-2"
      >
        <span className="flex size-7 overflow-hidden rounded-full bg-black">
          <Image src="/aura-mark.png" alt="" width={56} height={56} className="size-full" />
        </span>
        {open ? "Close" : "Ask AURA"}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-[max(3.6rem,22px)] mt-[max(2.2rem,18px)] text-[max(1.3rem,13px)] leading-[1.6]">
      <h3 className="border-y-2 border-info px-[0.75rem] py-[max(0.45rem,4px)] text-[max(1.55rem,14px)] font-bold uppercase text-info">
        {title}
      </h3>
      <div className="px-[0.75rem] pt-[max(1.6rem,12px)]">{children}</div>
    </section>
  );
}

function Contact({ icon, children }: { icon: "phone" | "mail" | "in" | "web"; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-[max(0.9rem,8px)]">
      <span className="flex size-[max(2.2rem,22px)] shrink-0 items-center justify-center rounded-full bg-ink text-white">
        {icon === "in" ? (
          <span className="text-[0.7em] font-bold">in</span>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-1/2" aria-hidden="true">
            {icon === "phone" && (
              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
            )}
            {icon === "mail" && (
              <>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </>
            )}
            {icon === "web" && (
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
              </>
            )}
          </svg>
        )}
      </span>
      {children}
    </span>
  );
}
