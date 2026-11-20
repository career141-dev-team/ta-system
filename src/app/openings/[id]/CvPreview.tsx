"use client";

import { OLD_SERVER, cvHeaders, door, preparedCvUrl, saveLiveFile, useDoorAction, useLive } from "@/lib/backend";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { DUR, EASE, gsap, motionOK, useGSAP } from "@/lib/gsap";
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
  from,
  appId,
  openingId,
  onClose,
}: {
  /** Signed in: the application this CV is on, so the green box's place is saved (D6). */
  appId?: string;
  openingId?: string;
  /** The card this CV was opened from: the frame grows out of it and back into it. */
  from?: HTMLElement | null;
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
  // Signed in (D6): where the box sits is saved on the application, as the old
  // Prepared CV tab saves it (savePreparedCvBox through /api/ui/prepared-cv-box),
  // so the Prepared CV and the End of day email stamp it there. The page's size in
  // points comes from the Prepared CV's own layout (?layout=1).
  const live = useLive();
  // Signed in (D11 item 4): the box starts from what the candidate's record holds -
  // the same details the Prepared CV and the End of day email print - and what AURA
  // or the TA changes in it is saved back there (/api/ui/cv-box, the old save).
  const [held, setHeld] = useState<BoxContent | null>(null);
  const [saveNote, setSaveNote] = useState("");
  const savedText = useRef("");
  useEffect(() => {
    if (!live || !appId) return;
    const url = `${OLD_SERVER}/api/ui/cv-box?app=${encodeURIComponent(appId)}`;
    void (async () => {
      const got = (await fetch(url, { headers: await cvHeaders(url) }).then((res) => res.json()).catch(() => null)) as { ok?: boolean; content?: RecordBox } | null;
      if (!got?.ok || !got.content) return;
      const c = fromRecord(got.content);
      savedText.current = JSON.stringify(c);
      setHeld(c);
    })();
  }, [live, appId]);
  useEffect(() => {
    if (!live || !appId || !openingId || !held || !box) return;
    const now = JSON.stringify(box.content);
    if (now === savedText.current) return;
    const t = setTimeout(async () => {
      const c = box.content;
      const notesChanged = JSON.stringify(c.notes) !== JSON.stringify(JSON.parse(savedText.current).notes ?? []);
      const url = `${OLD_SERVER}/api/ui/cv-box`;
      const res = (await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await cvHeaders(url)) },
        body: JSON.stringify({
          appId, openingId,
          designation: c.designation ?? "", company: c.company ?? "", currentSalary: c.currentSalary ?? "",
          expectedSalary: c.expectedSalary ?? "", notice: c.notice ?? "",
          // Notes only when they changed, so the record's own marks are kept.
          ...(notesChanged ? { notes: c.notes } : {}),
        }),
      }).then((r) => r.json()).catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (res?.ok) savedText.current = now;
      setSaveNote(res?.message ?? "Could not save the box's details - check your connection.");
    }, 1200);
    return () => clearTimeout(t);
  }, [box, held, live, appId, openingId]);
  const page = useRef<{ width: number; height: number } | null>(null);
  const firstBox = useRef(true);
  useEffect(() => {
    if (firstBox.current) {
      firstBox.current = false;
      return;
    }
    if (!live || !appId || !openingId) return;
    const t = setTimeout(async () => {
      const layout = preparedCvUrl(appId, { layout: "1" });
      if (!page.current) {
        const got = await fetch(layout, { headers: await cvHeaders(layout) }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
        page.current = (got as { page?: { width: number; height: number } } | null)?.page ?? { width: 595, height: 842 };
      }
      const pg = page.current;
      const url = `${OLD_SERVER}/api/ui/prepared-cv-box`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await cvHeaders(url)) },
        body: JSON.stringify(
          box
            ? { appId, openingId, x: (box.x * pg.width) / 100, y: (box.y * pg.height) / 100, width: (box.w * pg.width) / 100 }
            : { appId, openingId, reset: "1" },
        ),
      }).catch(() => undefined);
    }, 900);
    return () => clearTimeout(t);
  }, [box, live, appId, openingId]);
  // The Prepared CV as the email will attach it: the CV with this box's details stamped.
  const downloadPrepared = () => {
    if (!appId || !box) return;
    const c = box.content;
    const details: Record<string, string> = { download: "1" };
    if (c.designation) details.designation = c.designation;
    if (c.company) details.company = c.company;
    if (c.currentSalary) details.current = c.currentSalary;
    if (c.expectedSalary) details.expected = c.expectedSalary;
    if (c.notice) details.notice = c.notice;
    details.notes = c.notes.join("\n");
    void saveLiveFile(preparedCvUrl(appId, details), `${name} - Prepared CV.pdf`);
  };
  // AURA's round button sits outside the CV's frame (owner, 16 Nov 2026); pressed, its
  // chat opens across the bottom of the CV, as wide as the CV.
  const [auraOpen, setAuraOpen] = useState(false);
  const own = useRef<HTMLDivElement>(null);
  const root = ref ?? own;
  // The full-view switch is gone with the corner buttons (owner, 18 Nov 2026); the
  // frame keeps its one size.
  const full = false;

  // Opened from a card (the Pipeline), the frame GROWS OUT OF THE CARD and shrinks
  // back into it on close, while the board behind zooms toward you, goes soft and
  // fades, and what is inside arrives blurred then sharp (owner, 17 Nov 2026: the
  // Interpreter video - a pill grows into a card, one camera with depth). Without a
  // card the frame rises from below, like a sheet, as before.
  //
  // Smoothness (owner, the same day: "not smooth, background not like the video"):
  // the frame is never stretched - a plain shape with no content grows from the
  // card's exact rectangle to the frame's (the card may sit outside the frame's box),
  // then the frame takes its place, so nothing squashes; the depth is a filter
  // on the board itself, not a backdrop-filter re-blurring the whole screen every
  // frame; and the PDF is not drawn until the frame has finished growing.
  const enter = useRef<gsap.core.Timeline | null>(null);
  const shownCard = () => (from && from.getClientRects().length ? from : null);
  /** The board the card sits on: it is the "camera" that zooms. */
  const boardOf = (card: HTMLElement) => card.closest<HTMLElement>("[data-panel]");
  /** A plain shape on the page with the place, size, corners and colour of `el` -
   *  the video's pill: it is what grows and shrinks, never the frame itself. */
  const shapeOf = (el: HTMLElement): gsap.TweenVars => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      backgroundColor: s.backgroundColor,
      borderTopLeftRadius: s.borderTopLeftRadius,
      borderTopRightRadius: s.borderTopRightRadius,
      borderBottomRightRadius: s.borderBottomRightRadius,
      borderBottomLeftRadius: s.borderBottomLeftRadius,
    };
  };
  /** The growing box is a copy of the card itself - its name and details showing - so
   *  the grow starts from the card the person pressed, not from a blank box (owner,
   *  17 Nov 2026). Ids and card markers are stripped so nothing finds the copy. */
  const newGhost = (card: HTMLElement) => {
    const g = card.cloneNode(true) as HTMLElement;
    for (const el of [g, ...g.querySelectorAll<HTMLElement>("*")]) {
      el.removeAttribute("id");
      el.removeAttribute("data-card-id");
      el.removeAttribute("data-panel");
      // No "…" cut-off marks: with the letters still to write in, they showed first.
      el.style.textOverflow = "clip";
      // The motion here is GSAP's alone: a CSS transition (the CV chip's colour fade)
      // let its word show for 150 ms before the chip background arrived.
      el.style.transition = "none";
    }
    // A copied canvas comes out blank: paint each drawn CV page onto its copy, so a
    // grow from a small CV (Scoops, Database CVs) starts from that CV, not white boxes.
    const drawn = card.querySelectorAll("canvas");
    g.querySelectorAll("canvas").forEach((c, i) => {
      if (drawn[i]?.width) c.getContext("2d")?.drawImage(drawn[i], 0, 0);
    });
    g.setAttribute("aria-hidden", "true");
    g.setAttribute("inert", "");
    g.style.cssText =
      "position:fixed;margin:0;box-sizing:border-box;overflow:hidden;pointer-events:none;transform:none;opacity:1;will-change:left,top,width,height";
    root.current!.appendChild(g);
    return g;
  };
  /** What fades inside the copy: its own details. */
  const detailsOf = (g: HTMLElement) => [...g.children];

  useGSAP(
    () => {
      const card = shownCard();
      if (!card) {
        gsap.from("[data-veil]", { opacity: 0, duration: DUR.fast });
        gsap.from("[data-frame]", { yPercent: 18, opacity: 0, duration: DUR.base });
        gsap.from("[data-doc] > *", { y: 14, opacity: 0, duration: DUR.base, stagger: 0.05, delay: 0.15 });
        return;
      }
      const frame = root.current!.querySelector<HTMLElement>("[data-frame]")!;
      const inside = [...frame.children, ...root.current!.querySelectorAll("[data-aura-button]")];
      const doc = root.current!.querySelectorAll("[data-doc] > *");
      const board = boardOf(card);
      const c = card.getBoundingClientRect();
      const ghost = newGhost(card);
      const details = detailsOf(ghost);
      // Start states first (a timeline's first tick comes a frame late).
      gsap.set(ghost, shapeOf(card));
      gsap.set(frame, { opacity: 0 });
      gsap.set([...inside, ...doc], { opacity: 0, filter: "blur(10px)" });
      gsap.set("[data-veil]", { opacity: 0, backdropFilter: "none" });
      gsap.set(card, { opacity: 0 });
      if (board) {
        const b = board.getBoundingClientRect();
        gsap.set(board, { willChange: "transform, filter, opacity", transformOrigin: `${c.left - b.left + c.width / 2}px ${c.top - b.top + c.height / 2}px` });
      }
      // Two stages (owner, 17 Nov 2026, from his recording; then "the pop-up must be the
      // same design as the card behind, with the same details"):
      // 1. the card itself - same white card, same details - lifts toward you and grows,
      //    its rows popping up one after another, the board zooming soft behind it;
      // 2. a moment later it expands into the full CV.
      const lift = liftOf(c);
      const parts = linesOf(ghost);
      const end = EXPAND + OPEN_GROW;
      // One flow, like a video (owner, 17 Nov 2026: "no break, go with the flow", "too
      // quick"): every move overlaps the next, nothing stops and nothing bounces. The
      // card keeps lifting slowly while its words type, and is still moving when it
      // starts to open into the CV; the board behind is one long camera move.
      enter.current = gsap
        .timeline()
        // The board zooms once, with the pop, and then holds still (owner, 17 Nov 2026:
        // "keep the zoom state" - no second move behind the typing or the opening).
        .to(board, { ...BOARD_AWAY, duration: ZOOM, ease: "power2.out" }, 0)
        .to("[data-veil]", { opacity: 1, duration: ZOOM, ease: "power2.out" }, 0)
        // 1. The same card lifts and grows, easing all the way to the moment it opens.
        .to(ghost, { ...lift, duration: EXPAND, ease: "power2.out" }, 0)
        // As in the reference video (owner, 18 Nov 2026): the chip backgrounds (CV,
        // Salary, Notice Period) arrive first, empty; then the text rises from below,
        // one line after another, the chips' words with their own line.
        .to(parts.chips, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.04, ease: "power2.out" }, 0.08);
      parts.lines.forEach((line, i) => {
        const at = LINES_AT + i * LINE_GAP;
        enter.current!.to(line.els, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.45, ease: "power3.out" }, at);
        if (line.chips.length) enter.current!.to(line.chips, { color: (_: number, el: HTMLElement) => el.dataset.ink!, duration: 0.35, ease: "sine.out" }, at);
      });
      enter.current
        // 2. Without a pause it opens into the CV: details soften away as it grows and
        //    darkens, and the frame with the CV fades in as it lands.
        .to(details, { opacity: 0, filter: "blur(6px)", duration: OPEN_GROW * 0.45, ease: "sine.in" }, EXPAND)
        .to(ghost, { ...shapeOf(frame), scale: 1, x: 0, y: 0, boxShadow: "none", duration: OPEN_GROW, ease: "power3.inOut" }, EXPAND)
        .to(frame, { opacity: 1, duration: OPEN_LAND, ease: "sine.inOut" }, end - OPEN_LAND)
        .set(ghost, { display: "none" }, end)
        .to(inside, { opacity: 1, filter: "blur(0px)", duration: 0.4, stagger: 0.06, ease: "sine.out", clearProps: "filter" }, end - OPEN_LAND)
        .to(doc, { opacity: 1, filter: "blur(0px)", duration: 0.4, stagger: 0.05, ease: "sine.out", clearProps: "filter" }, end - OPEN_LAND);
      return () => {
        ghost.remove();
        // The close hands over on a timer, which can beat the tween's last frame:
        // leave the board and the card exactly as they were, whatever ran last.
        gsap.killTweensOf(board ? [board, card] : [card]);
        if (board) gsap.set(board, { clearProps: "transform,transformOrigin,filter,opacity,willChange" });
        gsap.set(card, { clearProps: "opacity" });
      };
    },
    { scope: root },
  );

  // Closing shrinks the frame back into the card it came from, then hands over.
  const closing = useRef(false);
  // A plain handler (not contextSafe): its tweens must outlive this preview,
  // which unmounts the moment it hands over.
  const close = () => {
    const card = shownCard();
    const frame = root.current?.querySelector<HTMLElement>("[data-frame]");
    if (!card || !frame) return onClose();
    if (closing.current) return;
    closing.current = true;
    enter.current?.progress(1);
    gsap.getTweensOf(frame).forEach((t) => t.progress(1)); // a full-view glide still running
    const inside = [...frame.children, ...root.current!.querySelectorAll("[data-aura-button]")];
    const board = boardOf(card);
    const ghost = newGhost(card);
    const details = detailsOf(ghost);
    const out = 0.14;
    gsap.set(ghost, { ...shapeOf(frame), opacity: 0 });
    gsap.set(details, { opacity: 0, filter: "blur(6px)" });
    gsap
      .timeline()
      .to(inside, { opacity: 0, filter: "blur(8px)", duration: out, ease: EASE.in }, 0)
      // Emptied, the frame hands over to the shape, which shrinks into the card.
      .set(ghost, { opacity: 1 }, out)
      .set(frame, { opacity: 0 }, out)
      .to(ghost, { ...shapeOf(card), duration: GROW, ease: GROW_EASE }, out)
      // Nearly home, the card's details come back into focus on it.
      .to(details, { opacity: 1, filter: "blur(0px)", duration: GROW * 0.45, ease: EASE.out }, out + GROW * 0.55)
      .to("[data-veil]", { opacity: 0, duration: GROW, ease: GROW_EASE }, out)
      // One move out, straight from the zoom back to its place, as the shape shrinks.
      .to(board, { ...BOARD_HOME, duration: GROW, ease: GROW_EASE, clearProps: "transform,transformOrigin,filter,opacity,willChange" }, out)
      // The last moment: the shape fades into the real card under it.
      .to(ghost, { opacity: 0, duration: 0.1, ease: "none" }, out + GROW - 0.1)
      .to(card, { opacity: 1, duration: 0.1, ease: "none", clearProps: "opacity" }, out + GROW - 0.1);
    // A plain timer, not onComplete (gsap.ts: a busy tab can hold frames back).
    setTimeout(onClose, motionOK() ? (out + GROW) * 1000 : 30);
  };

  // Escape closes the same way; the listener reads the newest `close`.
  const closeNow = useRef(close);
  useEffect(() => {
    closeNow.current = close;
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && closeNow.current();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  return createPortal(
    <div ref={root} className="fixed inset-0 z-[85]">
      <div
        data-veil
        className={
          "absolute inset-0 " +
          (from
            ? // Opened from a card: the dotted canvas shows around the CV, over the
              // softened board (owner, 17 Nov 2026: "show the dotted screen").
              "bg-white/35 [background-image:radial-gradient(circle,var(--board-dot)_1px,transparent_1.5px)] [background-size:var(--board-gap)_var(--board-gap)]"
            : "bg-white/20 backdrop-blur-[6px]")
        }
        onClick={close}
      />
      <section
        data-frame
        role="dialog"
        aria-modal="true"
        aria-label={`CV of ${name}`}
        className={
          "absolute flex flex-col bg-ink shadow-[0_-20px_80px_rgba(0,0,0,0.25)] " +
          (full
            ? "inset-[max(1rem,8px)] rounded-lg px-[3%] pt-[max(3.25rem,24px)]"
            : "bottom-0 left-[17%] top-[5%] w-[66%] rounded-t-[3.75rem] px-[4%] pt-[max(3.75rem,26px)] " +
              // A phone: the sheet takes the whole width.
              "max-md:left-0 max-md:top-[7%] max-md:w-full max-md:rounded-t-lg max-md:px-2 max-md:pt-12")
        }
      >
        {/* No corner buttons (owner, 18 Nov 2026: the full view, open in a new tab and
            download buttons "no need"). */}
        {/* The CV scrolls inside the dark frame; the scrollbar sits in the frame's right gutter.
            AURA shares the CV's box, so its chat opens exactly as wide as the CV. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
        {src ? (
          <div className="min-h-0 flex-1 overflow-hidden rounded-t-[2.6rem] bg-ink max-md:rounded-t-md">
            {/* Drawn from the click (owner, 17 Nov 2026: no empty dark box first), so it
                is ready as the frame lands. */}
            <CvPages key={src} src={src} fit="width" calm={from ? (EXPAND + OPEN_GROW) * 1000 + 150 : 0} overlay={box && <GreenBox box={box} setBox={setBox} />} />
          </div>
        ) : (
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:#fff_transparent]">
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
        <CvAgent open={auraOpen} onClose={() => setAuraOpen(false)} src={src} start={held ?? start} box={box} setBox={setBox} sampleText={sampleText(name, title)} ai={live && !!appId} note={saveNote} />
        </div>
      </section>
      {live && appId && box && !auraOpen && (
        <button
          type="button"
          onClick={downloadPrepared}
          className={
            "absolute bottom-[max(7.5rem,82px)] z-10 rounded-full bg-white px-[max(1rem,12px)] py-[max(0.6rem,7px)] text-small font-medium text-ink shadow-float hover:bg-surface-2 " +
            (full ? "right-[max(2.5rem,20px)]" : "left-[calc(83%+max(1.25rem,10px))] max-md:left-auto max-md:right-3")
          }
        >
          Prepared CV
        </button>
      )}
      {!auraOpen && (
        <button
          data-aura-button
          type="button"
          onClick={() => setAuraOpen(true)}
          aria-label="Ask AURA - tell it what to do on this CV"
          title="Ask AURA"
          className={
            "absolute bottom-[max(2rem,16px)] z-10 flex size-[max(4.5rem,54px)] items-center justify-center overflow-hidden rounded-full bg-black shadow-float ring-2 ring-white/15 transition-transform hover:scale-105 " +
            // Beside the frame on its right; over it when the frame fills the window.
            (full ? "right-[max(2.5rem,20px)]" : "left-[calc(83%+max(1.25rem,10px))] max-md:left-auto max-md:right-3")
          }
        >
          <Image src="/aura-mark.png" alt="" width={56} height={56} className="size-full" />
        </button>
      )}
    </div>,
    document.body,
  );
}

const NO_DETAILS: BoxContent = { notes: [] };

/** The grow from a card (seconds), its curve, and where the board goes meanwhile:
 *  it zooms toward you, goes soft and fades back, as the video's diagram does. */
const GROW = 0.55;
/** The opening's timing, one flow from click to CV (owner, 17 Nov 2026: slower, so the
 *  motion reads like a video): the card lifts until EXPAND while its words type in over
 *  TYPE, then grows into the CV over OPEN_GROW, the frame fading in over OPEN_LAND. */
/** When the first line of the card's text rises, and the gap between lines. */
const LINES_AT = 0.3;
const LINE_GAP = 0.11;
/** The board's one zoom, with the pop. */
const ZOOM = 0.75;
const EXPAND = 1.45;
const OPEN_GROW = 0.85;
const OPEN_LAND = 0.3;

/** The copy's text in lines, top to bottom, hidden a little low and soft, for the
 *  timeline to raise one line at a time; and its chips (anything with a background
 *  around its words - CV, Salary, Notice Period, the initials), hidden so their
 *  backgrounds can arrive first, their words held clear until their line comes.
 *  Elements on the same row rise together. The copy is thrown away afterwards. */
function linesOf(ghost: HTMLElement) {
  const own = (el: Element) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
  const textEls = [...ghost.querySelectorAll<HTMLElement>("*")].filter(own);
  const filled = (el: HTMLElement) => {
    const bg = getComputedStyle(el).backgroundColor;
    return bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg);
  };
  const chips = textEls.filter(filled);
  const rows = new Map<number, { els: HTMLElement[]; chips: HTMLElement[] }>();
  for (const el of textEls) {
    const top = Math.round(el.getBoundingClientRect().top / 6);
    const row = rows.get(top) ?? { els: [], chips: [] };
    if (chips.includes(el)) row.chips.push(el);
    else row.els.push(el);
    rows.set(top, row);
  }
  for (const c of chips) {
    c.dataset.ink = getComputedStyle(c).color;
    c.style.color = "transparent";
  }
  gsap.set(chips, { opacity: 0, scale: 0.85 });
  const lines = [...rows.entries()].sort((x, y) => x[0] - y[0]).map(([, r]) => r);
  gsap.set(lines.flatMap((l) => l.els), { opacity: 0, y: 12, filter: "blur(4px)" });
  return { chips, lines };
}

/** How the clicked card lifts: about 1.4 times its size (less if the window is small),
 *  a little up, shifted only as far as needed to stay inside the window. Scaled evenly,
 *  so it stays exactly the card behind, only bigger. */
function liftOf(c: DOMRect): gsap.TweenVars {
  const pad = 16;
  const scale = Math.max(1, Math.min(1.4, (window.innerWidth - pad * 2) / c.width, (window.innerHeight - pad * 2) / c.height));
  const w = c.width * scale;
  const h = c.height * scale;
  const cx = c.left + c.width / 2;
  const cy = c.top + c.height / 2 - 24;
  const x = Math.min(Math.max(cx - w / 2, pad), window.innerWidth - w - pad) + w / 2 - (c.left + c.width / 2);
  const y = Math.min(Math.max(cy - h / 2, pad), window.innerHeight - h - pad) + h / 2 - (c.top + c.height / 2);
  return { scale, x, y, transformOrigin: "50% 50%", boxShadow: "0 24px 60px rgba(0,0,0,0.18)" };
}
const GROW_EASE = "power3.inOut";
// Owner, 17 Nov 2026: the board must zoom in and out more (1.06 was too little), stay
// zoomed while the CV is open, and stay visible beside it under the dotted veil.
// 18 Nov 2026: "the background zoom needs more, more expanded" - 1.18 -> 1.35, over a
// little longer so the bigger move still reads smooth.
const BOARD_AWAY = { scale: 1.35, filter: "blur(2px)", opacity: 0.6 };
const BOARD_HOME = { scale: 1, filter: "blur(0px)", opacity: 1 };

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
  open,
  onClose,
  src,
  start,
  box,
  setBox,
  sampleText,
  ai,
  note,
}: {
  open: boolean;
  onClose: () => void;
  src?: string;
  start: BoxContent;
  box: Box | null;
  setBox: (b: Box | null) => void;
  sampleText: string;
  /** Signed in on a real application: what the word rules cannot read goes to AURA (Haiku). */
  ai?: boolean;
  /** The last save of the box's details, as the TA System answered it. */
  note?: string;
}) {
  const ask = useDoorAction(door.cvAsk);
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
    if (!(r.asked && ai)) {
      setBox(r.box);
      setTalk((x) => [...x, { me: t, aura: r.reply }]);
      return;
    }
    // Not a command the rules know: AURA reads it - a change to the box in the TA's
    // own words, or a question answered from the CV's text (ui/cvAgent:ask).
    const n = talk.length;
    setTalk((x) => [...x, { me: t, aura: "…" }]);
    const say = (aura: string) => setTalk((x) => x.map((m, i) => (i === n ? { ...m, aura } : m)));
    const d = (await (ask({ said: t, box: box ? toText(box.content) : null, cvText: text.slice(0, 12000) }) as Promise<CvReply | undefined>).catch(() => undefined));
    if (!d) return say(r.reply);
    if (!d.ok) return say(d.message);
    if (d.kind === "answer") return say(d.say);
    const content = fromRecord(d.content);
    setBox(box ? { ...box, content } : runAgent("add the green box", null, content, "").box);
    say(d.reply);
  };
  const tries = box
    ? ["Move it to the top left", "Make it wider", "What are their skills?"]
    : ["Add the green box", "What are their skills?", "How many years of experience?"];
  if (!open) return null;
  // The same chat as the Database board (DESIGN.md: the AURA chat bar): AURA's lines
  // beside its mark, the person's in a soft bubble, one-tap chips, the rounded bar.
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[min(58%,460px)] flex-col rounded-t-lg bg-surface shadow-float">
      <div className="flex items-center gap-3 px-[max(1.5rem,14px)] pt-[max(1rem,10px)]">
        <Image src="/aura-mark.png" alt="AURA" width={40} height={40} className="size-[max(2.75rem,34px)] rounded-full bg-black" />
        <p className="text-body font-medium text-ink">Tell me what to do on this CV, or ask about it</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AURA"
          className="ml-auto flex size-[max(2.25rem,30px)] items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-1/2" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div ref={list} className="min-h-0 flex-1 space-y-[max(1rem,10px)] overflow-y-auto px-[max(1.5rem,14px)] py-[max(1rem,10px)] [scrollbar-width:thin]">
        {!talk.length && (
          <p className="text-body text-ink-2">I can add the green box with their details, move it, size it and change what it says - or answer anything from the CV.</p>
        )}
        {note && <p role="status" className="text-caption text-ink-3">{note}</p>}
        {talk.map((m, i) => (
          <div key={i} className="flex flex-col gap-[max(0.6rem,6px)]">
            <p className="max-w-[80%] self-end whitespace-pre-line rounded-lg rounded-br-xs bg-surface-2 px-[max(1.1rem,12px)] py-[max(0.6rem,7px)] text-body text-ink">{m.me}</p>
            <div className="flex items-start gap-[max(0.75rem,8px)]">
              <Image src="/aura-mark.png" alt="" width={40} height={40} className="size-[max(2.25rem,30px)] shrink-0 rounded-full bg-black" />
              <p className="whitespace-pre-line pt-1 text-body text-ink">{m.aura}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 px-[max(1.5rem,14px)] pb-[max(0.75rem,8px)]">
        {tries.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => send(t)}
            className="rounded-full border border-border px-3.5 py-1.5 text-small text-ink-2 hover:border-border-strong hover:bg-surface-2 hover:text-ink"
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
        className="mx-[max(1.5rem,14px)] mb-[max(1rem,10px)] flex items-center gap-[max(0.75rem,8px)] rounded-xl bg-surface p-2 shadow-float ring-1 ring-border/60 transition-shadow focus-within:ring-2 focus-within:ring-brand/30"
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. add the green box with expected salary 550k"
          aria-label="Tell AURA what to do on this CV"
          className="min-w-0 flex-1 bg-transparent px-3 text-body text-ink outline-none placeholder:text-ink-3"
        />
        <button
          disabled={!draft.trim()}
          aria-label="Send"
          className="flex size-[max(2.5rem,34px)] shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-strong disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-[45%]" aria-hidden="true">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}

/** The box as /api/ui/cv-box and ui/cvAgent:ask send it: every field, empty = none. */
type RecordBox = { designation: string; company: string; currentSalary: string; expectedSalary: string; notice: string; notes: string[] };
type CvReply = { ok: true; kind: "answer"; say: string } | { ok: true; kind: "box"; content: RecordBox; reply: string } | { ok: false; message: string };
const fromRecord = (c: RecordBox): BoxContent => ({
  ...(c.designation ? { designation: c.designation } : {}),
  ...(c.company ? { company: c.company } : {}),
  ...(c.currentSalary ? { currentSalary: c.currentSalary } : {}),
  ...(c.expectedSalary ? { expectedSalary: c.expectedSalary } : {}),
  ...(c.notice ? { notice: c.notice } : {}),
  notes: c.notes,
});
const toText = (c: BoxContent): RecordBox => ({
  designation: c.designation ?? "", company: c.company ?? "", currentSalary: c.currentSalary ?? "",
  expectedSalary: c.expectedSalary ?? "", notice: c.notice ?? "", notes: c.notes,
});

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
