"use client";

import { useState } from "react";
import Image from "next/image";
// The document is set in Inter (the design's choice); the rest of the app is Poppins.
// Imported here, so it comes with this view's own download, not the first one.
import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import { BackButton } from "./PipelineBoard";

// Placeholder: the draft from the design, until this view reads the backend. A
// version is one stored text; the chat asks the backend for the next one.
const JD = {
  status: "Draft · version 3",
  title: "Senior Manager — SAP Business Transformation",
  meta: "PGP Glass · Colombo · Full-time · Reports to the Group CIO",
  // `p` = a paragraph, `lines` = lines that start with their own bullet character,
  // `list` = a real bulleted list. The design uses all three.
  sections: [
    {
      h: "About the role",
      p: "PGP Glass is moving its six plants to SAP S/4HANA. You will lead the programme end to end — from blueprint to hyper-care — and make sure the business, not just IT, comes out stronger.",
    },
    {
      h: "Responsibilities",
      lines: [
        "Own the S/4HANA roadmap, budget and partner relationships",
        "Lead a team of 12 across finance, supply chain and manufacturing streams",
        "Run cut-over and data migration for six plants",
        "Report progress to the executive committee every month",
      ],
    },
    {
      h: "Requirements",
      lines: [
        "10+ years in SAP, with at least one manufacturing rollout led end to end",
        "Strong FI/CO, MM and PP knowledge",
        "Experience managing system integrators",
      ],
    },
    {
      h: "Qualifications",
      list: [
        "MBBS or equivalent medical degree recognised in Sri Lanka.",
        "Current full registration with the Sri Lanka Medical Council.",
      ],
    },
    {
      h: "Skills",
      list: [
        "Clinical assessment, diagnostic reasoning and patient management.",
        "Clear written and verbal communication in English; Sinhala or Tamil an advantage.",
        "Good communication, interpersonal and teamwork abilities; working under senior supervision.",
      ],
    },
    {
      h: "Experience",
      list: [
        "6 months to 2 years of experience following SLMC registration.",
        "Previous hospital or clinical experience will be an added advantage.",
      ],
    },
    { h: "Package", p: "Around LKR 1.2M a month, plus performance bonus and medical cover" },
  ] as { h: string; p?: string; lines?: string[]; list?: string[] }[],
  asked: "Mention it’s hybrid, 3 days in office. Shorter intro.",
  reply:
    "Done — version 3 says “hybrid, 3 days a week at the Colombo office” and the intro is two lines shorter. Version 2 is in history if you want it back.",
  match: ["10+ years", "SAP S/4HANA", "Led a rollout", "FI/CO · MM · PP", "Manufacturing", "Colombo · hybrid", "~LKR 1.2M"],
};

const CAPTION = "text-[max(0.75rem,11px)] font-medium leading-[1.3333em] tracking-[0.3px]";
const CHIP = CAPTION + " rounded-[0.875rem] px-[max(0.75rem,9px)] py-[max(0.25rem,3px)]";
const SMALL = "text-[max(0.875rem,12px)] leading-[1.5em]";
const BODY_STRONG = "text-[max(1rem,14px)] font-medium leading-[1.625em]";
const INTER = "font-['Inter',ui-sans-serif,system-ui,sans-serif]";
const CARD_SHADOW = "shadow-[0_6px_18px_-4px_rgba(15,23,31,0.05),0_1px_2px_rgba(15,23,31,0.04)]";

/** The version-history icon, as exported from the design. */
function HistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.25 9C2.25 10.335 2.64588 11.6401 3.38758 12.7501C4.12928 13.8601 5.18349 14.7253 6.41689 15.2362C7.65029 15.7471 9.00749 15.8808 10.3169 15.6203C11.6262 15.3599 12.829 14.717 13.773 13.773C14.717 12.829 15.3599 11.6262 15.6203 10.3169C15.8808 9.00749 15.7471 7.65029 15.2362 6.41689C14.7253 5.18349 13.8601 4.12928 12.7501 3.38758C11.6401 2.64588 10.335 2.25 9 2.25C7.11296 2.2571 5.30173 2.99342 3.945 4.305L2.25 6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="#8A939C"/>
      <path d="M2.25 2.25V6H6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="#8A939C"/>
    </svg>

  );
}

/** The Job Description view: the draft on the left; on the right the approval bar,
 *  a chat to change the draft, and what candidates are matched on. */
export default function JobDescriptionView() {
  const [approved, setApproved] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-[max(2.3rem,14px)] pb-[max(2.19rem,12px)] pt-[max(2.8rem,40px)] max-md:overflow-y-auto max-md:pt-11">
      <div className="flex min-h-0 flex-1 items-start md:gap-x-[max(1.875rem,14px)] max-md:flex-col max-md:gap-y-6">
        <div className="md:-mr-[max(0.5625rem,0px)]">
          <BackButton />
        </div>

        {/* The document: fixed in height, scrolls inside itself if the text is longer. */}
        <article
          className={
            "flex min-w-0 flex-col gap-1.5 rounded-3xl border border-[#e7e9ed] bg-white px-[max(3rem,18px)] py-[max(2.5rem,18px)] md:mt-[max(1.03rem,0px)] md:flex-1 md:self-stretch md:overflow-y-auto max-md:w-full " +
            CARD_SHADOW +
            " [scrollbar-width:none] " +
            INTER
          }
        >
          <div className="flex items-center gap-3">
            <span className={CHIP + " bg-[#fcf5e3] text-[#a8791b]"}>{JD.status}</span>
            {/* shortcut: version history has no design yet, so this does nothing. */}
            <button type="button" aria-label="Version history" className="ml-auto text-[#8a939c] hover:text-[#16191d]">
              <HistoryIcon />
            </button>
          </div>
          <h3 className="text-[max(1.5rem,17px)] font-bold leading-[1.6em] text-[#165b42]">{JD.title}</h3>
          <p className="text-[max(0.8125rem,11px)] leading-[1.6em] text-[#666]">{JD.meta}</p>
          {JD.sections.map((s) => (
            <section key={s.h} className="contents">
              <h4 className="text-[max(0.9375rem,12.5px)] font-bold leading-[1.6em] text-[#165b42]">{s.h}</h4>
              {s.p && <p className="text-[max(0.8125rem,11px)] leading-[1.6em] text-[#404040]">{s.p}</p>}
              {s.lines && (
                <div className="text-[max(0.8125rem,11px)] leading-[1.6em] text-[#404040]">
                  {s.lines.map((l) => (
                    <p key={l}>• {l}</p>
                  ))}
                </div>
              )}
              {s.list && (
                <ul className="list-disc text-[max(0.8125rem,11px)] leading-[1.6em] text-[#404040]">
                  {s.list.map((l) => (
                    <li key={l} className="ms-[1.21875rem]">
                      {l}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>

        
        <aside className="flex min-w-0 flex-col gap-[max(1.125rem,10px)] md:mt-[max(0.7rem,0px)] md:flex-[0_1_40.5rem] max-md:w-full">
          {/* Approval */}
          <div
            className={
              "flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-[1.25rem] py-3.5 pl-5 pr-3.5 " +
              (approved ? "bg-[#e5f5ec]" : "bg-[#fcf5e3]")
            }
          >
            <div className="min-w-0 flex-1">
              <p className={BODY_STRONG + (approved ? " text-[#1e8a4c]" : " text-[#a8791b]")}>
                {approved ? "JD approved" : "Waiting for your approval"}
              </p>
              <p className={SMALL + " text-[#4e5862]"}>
                {approved ? "Research and Suggestions are starting." : "Research and Suggestions start once you approve."}
              </p>
            </div>
            {!approved && (
              <button
                type="button"
                onClick={() => setApproved(true)}
                className="flex items-center gap-2 whitespace-nowrap rounded-full bg-[#165b42] py-[max(0.625rem,7px)] pl-[max(1.25rem,14px)] pr-[max(1.375rem,15px)] text-[max(0.875rem,12px)] font-medium leading-[1.5em] text-white transition-colors hover:bg-[#104a35]"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13.3332 4L5.99984 11.3333L2.6665 8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="white"/>
                </svg>

                Approve JD
              </button>
            )}
          </div>

          {/* Chat */}
          <div className="flex flex-col gap-3.5 rounded-3xl bg-[#f6f7f9] px-5 pb-4 pt-[max(1.125rem,12px)]">
            <div className="flex items-center gap-2.5">
              <span className="flex size-[max(1.75rem,22px)] shrink-0 items-center justify-center overflow-hidden rounded-full bg-black">
                <Image src="/aura-mark.png" alt="" width={28} height={28} className="size-full" />
              </span>
              <p className={BODY_STRONG + " text-[#16191d]"}>Change it by chatting</p>
            </div>
            <div className="flex justify-end">
              <p className={SMALL + " rounded-[1.125rem] bg-white px-4 py-2.5 text-[#16191d]"}>{JD.asked}</p>
            </div>
            <p className={SMALL + " max-w-[37.5rem] text-[#4e5862]"}>{JD.reply}</p>
            {/* shortcut: no backend yet, so sending only clears the box; wire it to write the next version. */}
            <form
              className="flex items-center gap-2.5 rounded-[1.375rem] bg-white py-1.5 pl-4 pr-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                e.currentTarget.reset();
              }}
            >
              <input
                name="ask"
                aria-label="Ask for a change"
                placeholder="Ask for a change…"
                className={SMALL + " min-w-0 flex-1 bg-transparent text-[#16191d] outline-none placeholder:text-[#8a939c]"}
              />
              {/* shortcut: voice input needs speech-to-text from the backend, so this does nothing yet. */}
              <button
                type="button"
                aria-label="Speak your change"
                className="flex size-[max(2.125rem,28px)] shrink-0 items-center justify-center rounded-full text-[#8a939c] transition-colors hover:text-[#16191d] focus-visible:text-[#16191d] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#165b42]/40"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[max(1.125rem,15px)]" aria-hidden="true">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
                </svg>
              </button>
              <button
                type="submit"
                aria-label="Send"
                className="flex size-[max(2.125rem,28px)] shrink-0 items-center justify-center rounded-full bg-[#165b42] text-white transition-colors hover:bg-[#104a35]"
              >
                <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="34" height="34" rx="17" fill="#165B42"/>
                <path d="M12.625 17L17 12.625L21.375 17" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="white"/>
                <path d="M17 21.375V12.625" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="white"/>
                </svg>

              </button>
            </form>
          </div>

          {/* What candidates are matched on */}
          <div className="flex flex-col gap-3 rounded-3xl border border-[#e7e9ed] px-5 pb-[max(1.125rem,12px)] pt-4">
            <div className="flex items-center">
              <p className={BODY_STRONG + " text-[#16191d]"}>What we match candidates on</p>
              {/* shortcut: re-reading needs the backend, so this does nothing yet. */}
              <button type="button" className={SMALL + " ml-auto flex items-center gap-1.5 text-[#8a939c] hover:text-[#16191d]"}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1.75 7C1.75 5.60761 2.30312 4.27226 3.28769 3.28769C4.27226 2.30312 5.60761 1.75 7 1.75C8.46769 1.75552 9.87643 2.32821 10.9317 3.34833L12.25 4.66667" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="#8A939C"/>
                <path d="M12.2502 1.75V4.66667H9.3335" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="#8A939C"/>
                </svg>

                Re-read
              </button>
            </div>
            <ul className="flex flex-wrap gap-2">
              {JD.match.map((m) => (
                <li key={m} className={CHIP + " bg-[#f3f4f6] text-[#4e5862]"}>
                  {m}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
