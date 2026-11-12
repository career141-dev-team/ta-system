"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Flip, gsap, useGSAP } from "@/lib/gsap";
import CvPages from "./CvPages";

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
  name,
  title,
  src,
  onClose,
}: {
  name: string;
  title: string;
  /** The candidate's own CV file; without one the sample layout below is shown. */
  src?: string;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  // The frame's size and place before a full-view change, for Flip to animate from.
  const before = useRef<Flip.FlipState | null>(null);

  const toggleFull = () => {
    // Finish the frame's opening rise first: pressed during it, Flip took over
    // mid-way and the frame stayed half-faded and lowered.
    gsap.getTweensOf("[data-frame]").forEach((t) => t.progress(1));
    before.current = Flip.getState("[data-frame]");
    setFull((f) => !f);
  };

  // After the frame has its new size, glide it there from where it was.
  useLayoutEffect(() => {
    const state = before.current;
    if (!state) return;
    before.current = null;
    Flip.from(state, { duration: 0.5, ease: "power3.inOut" });
  }, [full]);

  // The veil fades in and the frame rises from below, like a sheet.
  useGSAP(
    () => {
      gsap.from("[data-veil]", { opacity: 0, duration: 0.3, ease: "power1.out" });
      gsap.from("[data-frame]", { yPercent: 18, opacity: 0, duration: 0.5, ease: "power3.out" });
      gsap.from("[data-doc] > *", { y: 14, opacity: 0, duration: 0.45, stagger: 0.05, delay: 0.15, ease: "power2.out" });
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
          "absolute flex flex-col bg-[#1c1c1c] pr-[2%] shadow-[0_-20px_80px_rgba(0,0,0,0.25)] " +
          (full
            ? "inset-[max(1rem,8px)] rounded-[2.5rem] pl-[3%] pt-[max(3.25rem,24px)]"
            : "bottom-0 left-[12.3%] top-[11%] w-[75.3%] rounded-t-[3.75rem] pl-[5%] pt-[max(4.75rem,28px)]")
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
        {/* The CV scrolls inside the dark frame; the scrollbar sits in the frame's right gutter. */}
        {src ? (
          <div className="min-h-0 flex-1 overflow-hidden rounded-t-[2.6rem] bg-[#2a2a2a]">
            <CvPages key={src} src={src} fit="width" />
          </div>
        ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-[3%] [scrollbar-color:#fff_transparent] [scrollbar-width:thin]">
          <article
            data-doc
            className="min-h-full rounded-t-[2.6rem] bg-white pb-[max(3rem,24px)] font-[Arial,Helvetica,sans-serif] text-[#2b2b2b]"
          >
            <header className="px-[max(3.6rem,22px)] pt-[max(2.8rem,20px)]">
              <h2 className="text-[max(3.3rem,26px)] font-extrabold uppercase leading-none tracking-tight text-[#1452b4]">
                {name}
              </h2>
              <p className="mt-[max(1.6rem,10px)] text-[max(2rem,17px)] font-bold uppercase text-[#222]">{title}</p>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="mt-[max(1rem,6px)] inline-flex items-center gap-2 text-[max(1.55rem,14px)] text-[#1452b4] underline underline-offset-4"
              >
                View Design Portfolio
                <svg viewBox="0 0 24 24" fill="none" stroke="#222" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[1em]" aria-hidden="true">
                  <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                </svg>
              </a>
            </header>

            <div className="mt-[max(1.6rem,12px)] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 bg-[#f3f7fd] px-[max(5rem,24px)] py-[max(1.4rem,12px)] text-[max(1.15rem,12px)] text-[#333]">
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
                  <p className="text-[max(1.5rem,14px)] font-bold text-[#1452b4]">{j.role}</p>
                  <p className="mt-1 font-bold text-[#1452b4]">{j.company}</p>
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
                  <p className="font-bold text-[#1452b4]">{e.degree}</p>
                  <p className="mt-1">{e.school}</p>
                  <p className="mt-1 text-[#444]">{e.dates}</p>
                </div>
              ))}
            </Section>
          </article>
        </div>
        )}
      </section>
    </div>,
    document.body,
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-[max(3.6rem,22px)] mt-[max(2.2rem,18px)] text-[max(1.3rem,13px)] leading-[1.6]">
      <h3 className="border-y-2 border-[#5b8fd6] px-[0.75rem] py-[max(0.45rem,4px)] text-[max(1.55rem,14px)] font-bold uppercase text-[#1452b4]">
        {title}
      </h3>
      <div className="px-[0.75rem] pt-[max(1.6rem,12px)]">{children}</div>
    </section>
  );
}

function Contact({ icon, children }: { icon: "phone" | "mail" | "in" | "web"; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-[max(0.9rem,8px)]">
      <span className="flex size-[max(2.2rem,22px)] shrink-0 items-center justify-center rounded-full bg-[#1c1c1c] text-white">
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
