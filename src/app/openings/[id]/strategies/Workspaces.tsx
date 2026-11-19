"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import LiveName from "../LiveName";
import { BackButton } from "../PipelineBoard";
import { useOpeningView } from "../view";
import {
  AI_COMPANY_LIST,
  AI_SEARCH_WORDS,
  AVATAR_STYLE,
  INITIAL_AD_APPLICANTS,
  INITIAL_COMPANIES,
  INITIAL_COMPANY_PEOPLE,
  INITIAL_DAILY_PLAN,
  INITIAL_HEADHUNT_EVENTS,
  INITIAL_HEADHUNT_TARGETS,
  INITIAL_INMAIL_PEOPLE,
  INITIAL_LI_SEARCHES,
  INITIAL_OLD_POSTS,
  INITIAL_OLD_POST_APPLICANTS,
  STRATEGY_CATALOG,
  catalogOf,
  type AvatarTone,
  type DailyPlanDay,
  type StrategyItem,
  type StrategyKey,
} from "./catalog";
import { ArrowRightSvg, ArrowUpSvg, AuraMark, CheckSvg, FileSvg, MicSvg, PlusSvg } from "./icons";

export type CvTarget = { name: string; title: string; src: string };
export type PipelineAdd = { name: string; title: string; company?: string; channel: string; cv?: string };

export type WorkspaceCallbacks = {
  lead: string;
  jobSampleTitle: string;
  onAddToPipeline: (p: PipelineAdd) => boolean;
  onOpenCv: (cv: CvTarget) => void;
  onNotify: (bold: string, rest: string) => void;
  onOpenStrategyByKey: (key: StrategyKey) => void;
};

// Shared tag badge styling matching the Figma pills (rounded-sm = 10px, px-2 py-0.5, text-caption).
export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "brand" | "warn" | "violet" | "neutral" | "white";
}) {
  const cls =
    tone === "brand"
      ? "bg-brand-soft text-brand"
      : tone === "warn"
        ? "bg-warn-soft text-warn"
        : tone === "violet"
          ? "bg-violet-soft text-violet"
          : tone === "white"
            ? "bg-surface text-ink-3"
            : "bg-surface-2 text-ink-2";
  return (
    <span className={"inline-flex shrink-0 items-center whitespace-nowrap rounded-sm px-2 py-0.5 text-caption " + cls}>
      {children}
    </span>
  );
}

export function tagToneFor(item: StrategyItem): "brand" | "warn" | "violet" | "neutral" | "white" {
  if (item.unassigned) return "white";
  if (item.status === "new") return "violet";
  if (item.status === "in_progress" || item.status === "running" || item.status === "done") return "brand";
  const t = item.tagLabel.toLowerCase();
  if (t.includes("today") || t.includes("friday")) return "warn";
  return "neutral";
}

function Avatar({ initials, tone }: { initials: string; tone: AvatarTone }) {
  return (
    <span
      className={"flex size-10 shrink-0 items-center justify-center rounded-full text-small font-medium " + AVATAR_STYLE[tone]}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function SectionHeading({ step, title, meta }: { step?: number; title: string; meta: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 pb-2.5">
      <p className="text-[max(0.9375rem,13.5px)] font-medium text-ink">
        {step !== undefined ? `${step}  ${title}` : title}
      </p>
      <p className="text-[max(0.8125rem,12px)] text-ink-3">{meta}</p>
    </div>
  );
}

/** Shared top header of every strategy workspace (Title + Tag + Strategy N of 15 + description + AURA row). */
export function StrategyHeader({
  item,
  auraText,
  auraActionLabel,
  onAuraAction,
  customMeta,
}: {
  item: StrategyItem;
  auraText: string;
  auraActionLabel?: string;
  onAuraAction?: () => void;
  customMeta?: string;
}) {
  const cat = catalogOf(item.key);
  const meta = customMeta ?? (cat ? cat.headerMeta ?? `Strategy ${cat.number} of 15` : "Custom strategy");
  const description = cat?.description ?? "Assigned strategy for this opening.";
  return (
    <header className="flex shrink-0 flex-col gap-[max(0.875rem,8px)]">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        <h1 className="text-[max(1.875rem,21px)] font-normal leading-tight text-ink">{item.title}</h1>
        <Tag tone={tagToneFor(item)}>{item.tagLabel}</Tag>
        {item.taName && <span className="text-caption text-ink-3">Assigned to {item.taName}</span>}
        <span className="ml-auto whitespace-nowrap text-small text-ink-3">{meta}</span>
      </div>
      <p className="text-body text-ink-2">{description}</p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <AuraMark />
        <p className="text-body font-medium text-ink">{auraText}</p>
        {auraActionLabel && onAuraAction && (
          <button
            type="button"
            onClick={onAuraAction}
            className="flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-ink px-4 text-[max(0.8125rem,12px)] font-medium text-white transition-colors hover:bg-black"
          >
            {auraActionLabel}
          </button>
        )}
      </div>
    </header>
  );
}

// ============================================================================
// 1. PREVIOUS POST SCREENING (Figma 1:930)
// ============================================================================
function PreviousPostScreeningWorkspace({ item, cb }: { item: StrategyItem; cb: WorkspaceCallbacks }) {
  const [posts, setPosts] = useState(INITIAL_OLD_POSTS);
  const [applicants, setApplicants] = useState(INITIAL_OLD_POST_APPLICANTS);
  const [onlyFit, setOnlyFit] = useState(false);
  const [selectedId, setSelectedId] = useState("opa1");

  const pickedIds = new Set(posts.filter((p) => p.picked).map((p) => p.id));
  const pickedCount = pickedIds.size;
  const totalApplied = posts.filter((p) => p.picked).reduce((s, p) => s + p.applied, 0);
  const totalFit = posts.filter((p) => p.picked).reduce((s, p) => s + p.fit, 0);

  const visible = applicants.filter((a) => pickedIds.has(a.postId) && (!onlyFit || a.fit));

  const togglePost = (id: string) =>
    setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, picked: !p.picked } : p)));

  const addPerson = (a: (typeof applicants)[number]) => {
    if (!cb.onAddToPipeline({ name: a.name, title: a.role, channel: "L", cv: a.cv })) return;
    setApplicants((list) =>
      list.map((x) => (x.id === a.id ? { ...x, inPipeline: true, tag: "In your pipeline", tagTone: "neutral" } : x)),
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[max(1.375rem,14px)]">
      <StrategyHeader
        item={item}
        auraText={`I found 3 old posts like this job. 41 people applied. 12 look right.`}
        auraActionLabel={onlyFit ? "Show all 41" : "Show the 12"}
        onAuraAction={() => setOnlyFit((v) => !v)}
      />

      <div className="min-h-0 flex-1 space-y-[max(1.375rem,14px)] overflow-y-auto pr-1 [scrollbar-width:thin]">
        <section>
          <SectionHeading step={1} title="Old posts like this job" meta={`${pickedCount} picked`} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {posts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePost(p.id)}
                className={
                  "flex flex-col gap-1.5 rounded-[1.25rem] bg-canvas p-4 text-left transition-colors hover:bg-surface-2 " +
                  (p.picked ? "" : "opacity-65")
                }
              >
                <div className="flex w-full items-center gap-2">
                  <span className="truncate text-[max(0.9375rem,13.5px)] font-medium text-ink">{p.title}</span>
                  <span
                    className={
                      "ml-auto flex size-5 shrink-0 items-center justify-center rounded-full " +
                      (p.picked ? "bg-brand text-white" : "border-[1.5px] border-border-strong bg-surface")
                    }
                  >
                    {p.picked && <CheckSvg />}
                  </span>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2">
                  <span className="text-[max(0.8125rem,12px)] text-ink-3">
                    {p.company} · posted {p.posted}
                  </span>
                  <span className="ml-auto text-[max(0.8125rem,12px)] text-ink-2">{p.applied} applied</span>
                  <Tag tone="brand">{p.fit} fit</Tag>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading
            step={2}
            title="People who applied"
            meta={`${totalApplied} people · ${totalFit} look right${onlyFit ? " · showing fits" : ""}`}
          />
          <div className="flex flex-col">
            {visible.length === 0 ? (
              <p className="rounded-[1.25rem] bg-canvas px-5 py-6 text-small text-ink-3">
                Pick at least one old post above to see its applicants.
              </p>
            ) : (
              visible.map((a, idx) => {
                const selected = selectedId === a.id;
                const prevSelected = idx > 0 && visible[idx - 1].id === selectedId;
                return (
                  <div key={a.id}>
                    {idx > 0 && !selected && !prevSelected && (
                      <div className="px-5">
                        <div className="h-px bg-border" />
                      </div>
                    )}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(a.id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedId(a.id)}
                      className={
                        "flex flex-wrap items-center gap-4 rounded-[1.25rem] px-5 py-4 transition-colors " +
                        (selected ? "bg-canvas" : "hover:bg-canvas/60")
                      }
                    >
                      <Avatar initials={a.initials} tone={a.tone} />
                      <div className="min-w-[12rem] shrink-0 md:w-[18.125rem]">
                        <p className="truncate text-[max(0.9375rem,14px)] font-medium text-ink">{a.name}</p>
                        <p className="truncate text-caption text-ink-3">{a.appliedTo}</p>
                      </div>
                      <div className="min-w-[14rem] flex-1">
                        <p className="truncate text-small font-medium text-ink">{a.role}</p>
                        <p className="truncate text-[max(0.8125rem,12px)] text-ink-2">{a.before}</p>
                      </div>
                      <Tag tone={a.tagTone}>{a.tag}</Tag>
                      {selected && !a.inPipeline && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addPerson(a);
                          }}
                          className="flex h-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface px-4 text-[max(0.8125rem,12px)] font-medium text-ink hover:bg-surface-2"
                        >
                          Add to pipeline
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ============================================================================
// 2. LINKEDIN SEARCH (Figma 1:1173)
// ============================================================================
function LinkedInSearchWorkspace({ item, cb }: { item: StrategyItem; cb: WorkspaceCallbacks }) {
  const [prompt, setPrompt] = useState("");
  const [searches, setSearches] = useState(INITIAL_LI_SEARCHES);
  const [openSearchId, setOpenSearchId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const runSearch = (queryText?: string) => {
    const q = (queryText ?? prompt).trim();
    if (!q) return;
    const created = {
      id: `ls-${Date.now()}`,
      query: q,
      found: "164 found",
      progress: "Not screened yet",
      action: "Start" as const,
      matches: [
        { id: `m-${Date.now()}-1`, initials: "KP", tone: "info" as const, name: "Kasun Perera", role: "SAP S/4HANA Lead · Virtusa", location: "Colombo", cv: "/cvs/p1.pdf" },
        { id: `m-${Date.now()}-2`, initials: "CW", tone: "brand" as const, name: "Chamara Weerasinghe", role: "ERP Programme Director · Hayleys", location: "Colombo", cv: "/cvs/s1.pdf" },
      ],
    };
    setSearches((s) => [created, ...s]);
    setPrompt("");
    setOpenSearchId(created.id);
    cb.onNotify("Search ready", ` — AURA built filters for “${q}”`);
  };

  const useJd = () => {
    const jdPrompt = "SAP S/4HANA transformation leads in Sri Lanka · manufacturing rollout · 10+ yrs";
    setPrompt(jdPrompt);
    cb.onNotify("JD loaded", " — press send to run the search");
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-[max(1.375rem,14px)]">
      {/* Subtle pastel Aurora glow behind the AI composer (AI-only tokens from DESIGN.md) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[8%] right-[6%] top-[6.5rem] h-[22rem] rounded-full opacity-22 blur-[68px]"
        style={{
          background:
            "radial-gradient(ellipse at 22% 45%, var(--color-aura-1), transparent 55%), radial-gradient(ellipse at 52% 42%, var(--color-aura-2), transparent 55%), radial-gradient(ellipse at 74% 48%, var(--color-aura-3), transparent 55%), radial-gradient(ellipse at 88% 58%, var(--color-aura-4), transparent 52%)",
        }}
      />

      <div className="relative z-10">
        <StrategyHeader
          item={item}
          auraText="Tell me who you need. I build the filters and rank the people."
          auraActionLabel="Use the JD"
          onAuraAction={useJd}
        />
      </div>

      <div className="relative z-10 min-h-0 flex-1 space-y-[max(1.375rem,14px)] overflow-y-auto pr-1 [scrollbar-width:thin]">
        {/* AI Composer card matching Figma 1:1285 (rounded-[30px], border-[1.5px] border-aura-1, shadow-float) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
          className="flex flex-col gap-5 rounded-[1.875rem] border-[1.5px] border-aura-1 bg-surface pb-4.5 pl-6.5 pr-5.5 pt-5.5 shadow-float"
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                runSearch();
              }
            }}
            rows={1}
            placeholder="SAP programme leads in Colombo who ran an S/4HANA rollout…"
            aria-label="Describe who you need on LinkedIn"
            className="w-full resize-none bg-transparent text-[max(1.125rem,15px)] leading-snug text-ink outline-none [field-sizing:content] placeholder:text-ink-3"
          />

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 max-w-full items-center gap-2 rounded-full bg-brand-soft pl-3 pr-3.5 text-[max(0.8125rem,12px)] font-medium text-brand">
              <FileSvg className="size-3.5 shrink-0" />
              <span className="truncate">
                <LiveName field="title" sample={cb.jobSampleTitle} /> · JD attached
              </span>
            </span>

            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setListening((l) => !l);
                  cb.onNotify(listening ? "Voice off" : "Listening", listening ? "" : " — say who you are looking for");
                }}
                aria-label="Voice input"
                className={
                  "flex size-9 items-center justify-center rounded-full transition-colors " +
                  (listening ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink")
                }
              >
                <MicSvg className="size-5" />
              </button>
              <button
                type="submit"
                aria-label="Run LinkedIn search"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-colors hover:bg-black"
              >
                <ArrowUpSvg className="size-4.5" />
              </button>
            </div>
          </div>
        </form>

        {/* Your searches for this position */}
        <section>
          <div className="flex items-center gap-2.5 pb-2.5">
            <p className="text-[max(0.9375rem,13.5px)] font-medium text-ink">Your searches for this position</p>
            <p className="text-[max(0.8125rem,12px)] text-ink-3">
              {searches.length} {searches.length === 1 ? "search" : "searches"}
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            {searches.map((s) => {
              const expanded = openSearchId === s.id;
              return (
                <div key={s.id} className="overflow-hidden rounded-[1.125rem] bg-canvas">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3.5 pl-5 pr-4">
                    <p className="min-w-[14rem] flex-1 text-[max(0.9375rem,13.5px)] font-medium text-ink">{s.query}</p>
                    <span className="w-[8.125rem] shrink-0 text-small text-ink">{s.found}</span>
                    <span className="w-[12.5rem] shrink-0 text-small text-ink-3">{s.progress}</span>
                    <button
                      type="button"
                      onClick={() => setOpenSearchId(expanded ? null : s.id)}
                      className={
                        "flex h-9 shrink-0 items-center justify-center rounded-full px-4 text-[max(0.8125rem,12px)] font-medium transition-colors " +
                        (s.action === "Start" && !expanded
                          ? "bg-ink text-white hover:bg-black"
                          : "border border-border-strong bg-surface text-ink hover:bg-surface-2")
                      }
                    >
                      {expanded ? "Hide" : s.action}
                    </button>
                  </div>

                  {expanded && (
                    <div className="border-t border-border bg-surface/70 px-5 py-3">
                      <div className="flex flex-col divide-y divide-border">
                        {s.matches.map((m) => (
                          <div key={m.id} className="flex flex-wrap items-center gap-3 py-2.5">
                            <Avatar initials={m.initials} tone={m.tone} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-small font-medium text-ink">{m.name}</p>
                              <p className="truncate text-caption text-ink-2">
                                {m.role} · {m.location}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => cb.onOpenCv({ name: m.name, title: m.role, src: m.cv })}
                              className="h-8 rounded-full border border-border-strong bg-surface px-3.5 text-caption font-medium text-ink hover:bg-surface-2"
                            >
                              Open CV
                            </button>
                            <button
                              type="button"
                              onClick={() => cb.onAddToPipeline({ name: m.name, title: m.role, channel: "L", cv: m.cv })}
                              className="h-8 rounded-full bg-ink px-3.5 text-caption font-medium text-white hover:bg-black"
                            >
                              Add to pipeline
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

// ============================================================================
// 3. INMAIL (Figma 1:1349)
// ============================================================================
function InMailWorkspace({ item, cb }: { item: StrategyItem; cb: WorkspaceCallbacks }) {
  const [people, setPeople] = useState(INITIAL_INMAIL_PEOPLE);
  const [selectedId, setSelectedId] = useState("im1");
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState(
    "Hi — following up briefly on the Senior Manager (SAP Business Transformation) role with PGP Glass. Happy to share the JD or jump on a 5-minute call this week.",
  );

  const openedCount = people.filter((p) => p.status === "Opened").length;

  const sendFollowUp = () => {
    setPeople((list) =>
      list.map((p) =>
        p.status === "Opened"
          ? { ...p, message: "Short follow-up sent via InMail.", when: "Sent just now", status: "Sent" }
          : p,
      ),
    );
    setDraftOpen(false);
    cb.onNotify(`Follow-up sent`, ` to ${openedCount} ${openedCount === 1 ? "person" : "people"} who opened your InMail`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[max(1.125rem,12px)]">
      <StrategyHeader
        item={item}
        auraText={
          openedCount > 0
            ? `${openedCount} people opened your InMail and did not reply. Send a short follow-up?`
            : "All opened InMails have been followed up. Keep an eye on new replies."
        }
        auraActionLabel={openedCount > 0 ? (draftOpen ? "Close draft" : "Write follow-up") : undefined}
        onAuraAction={() => setDraftOpen((o) => !o)}
      />

      <div className="min-h-0 flex-1 space-y-[max(1.125rem,12px)] overflow-y-auto pr-1 [scrollbar-width:thin]">
        {draftOpen && (
          <div className="flex flex-col gap-3 rounded-[1.25rem] border border-border bg-canvas p-4">
            <p className="text-small font-medium text-ink">
              Follow-up for Ruwan Gunawardena & Shalini Perera
            </p>
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-surface px-3.5 py-2.5 text-small text-ink outline-none focus:border-brand"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDraftOpen(false)}
                className="h-9 rounded-full border border-border-strong bg-surface px-4 text-[max(0.8125rem,12px)] font-medium text-ink hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={sendFollowUp}
                className="h-9 rounded-full bg-ink px-4 text-[max(0.8125rem,12px)] font-medium text-white hover:bg-black"
              >
                Send follow-up
              </button>
            </div>
          </div>
        )}

        {/* 4 metric cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { n: "24", label: "InMails sent", brand: false },
            { n: "15", label: "Opened", brand: false },
            { n: "7", label: "Replied", brand: false },
            { n: "3", label: "Interested", brand: true },
          ].map((m) => (
            <div key={m.label} className="flex items-center gap-3 rounded-[1.25rem] bg-canvas px-5 py-3.5">
              <span className={"text-[max(1.75rem,22px)] font-light leading-none " + (m.brand ? "text-brand" : "text-ink")}>
                {m.n}
              </span>
              <span className="text-small text-ink-2">{m.label}</span>
            </div>
          ))}
        </div>

        {/* People you messaged */}
        <section>
          <SectionHeading title="People you messaged" meta="newest reply first" />
          <div className="flex flex-col">
            {people.map((p, idx) => {
              const selected = selectedId === p.id;
              const prevSelected = idx > 0 && people[idx - 1].id === selectedId;
              const added = addedIds.includes(p.id);
              return (
                <div key={p.id}>
                  {idx > 0 && !selected && !prevSelected && (
                    <div className="px-5">
                      <div className="h-px bg-border" />
                    </div>
                  )}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(p.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedId(p.id)}
                    className={
                      "flex flex-wrap items-center gap-4 rounded-[1.25rem] px-5 py-4 transition-colors " +
                      (selected ? "bg-canvas" : "hover:bg-canvas/60")
                    }
                  >
                    <Avatar initials={p.initials} tone={p.tone} />
                    <div className="min-w-[12rem] shrink-0 md:w-[18.125rem]">
                      <p className="truncate text-[max(0.9375rem,14px)] font-medium text-ink">{p.name}</p>
                      <p className="truncate text-caption text-ink-3">{p.role}</p>
                    </div>
                    <div className="min-w-[14rem] flex-1">
                      <p className="truncate text-small font-medium text-ink">{p.message}</p>
                      <p className="truncate text-[max(0.8125rem,12px)] text-ink-2">{p.when}</p>
                    </div>
                    <Tag tone={p.status === "Interested" ? "brand" : "neutral"}>{added ? "In pipeline" : p.status}</Tag>
                    {selected && !added && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (cb.onAddToPipeline({ name: p.name, title: p.role, channel: "IM", cv: p.cv })) {
                            setAddedIds((ids) => [...ids, p.id]);
                          }
                        }}
                        className="flex h-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface px-4 text-[max(0.8125rem,12px)] font-medium text-ink hover:bg-surface-2"
                      >
                        Add to pipeline
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

// ============================================================================
// 4. SMART AD (Figma 1:1561)
// ============================================================================
function SmartAdWorkspace({ item, cb }: { item: StrategyItem; cb: WorkspaceCallbacks }) {
  const [channelFilter, setChannelFilter] = useState<"all" | "whatsapp" | "facebook">("all");
  const [onlyWhatsappFit, setOnlyWhatsappFit] = useState(false);
  const [selectedId, setSelectedId] = useState("ad1");
  const [addedIds, setAddedIds] = useState<string[]>([]);

  const visible = INITIAL_AD_APPLICANTS.filter((a) => {
    if (onlyWhatsappFit) return a.channel === "whatsapp" && a.fit === "Fit";
    if (channelFilter !== "all") return a.channel === channelFilter;
    return true;
  });

  const toggleChannel = (ch: "whatsapp" | "facebook") => {
    setOnlyWhatsappFit(false);
    setChannelFilter((cur) => (cur === ch ? "all" : ch));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[max(1.125rem,12px)]">
      <StrategyHeader
        item={item}
        auraText="The WhatsApp ad brings better people. 9 of its 14 applicants fit."
        auraActionLabel={onlyWhatsappFit ? "Show all 25" : "See the 9"}
        onAuraAction={() => {
          setChannelFilter("all");
          setOnlyWhatsappFit((v) => !v);
        }}
      />

      <div className="min-h-0 flex-1 space-y-[max(1.125rem,12px)] overflow-y-auto pr-1 [scrollbar-width:thin]">
        {/* 2 Ad performance cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => toggleChannel("whatsapp")}
            className={
              "flex flex-col gap-4 rounded-[1.5rem] bg-canvas p-5 text-left transition-colors hover:bg-surface-2 " +
              (channelFilter === "whatsapp" || onlyWhatsappFit ? "ring-2 ring-brand/30" : "")
            }
          >
            <div className="flex w-full flex-wrap items-center gap-2.5">
              <span className="text-h3 font-medium text-ink">WhatsApp ad</span>
              <Tag tone="brand">Running · day 3 of 7</Tag>
              <span className="ml-auto">
                <Tag tone="violet">Better people</Tag>
              </span>
            </div>
            <div className="flex flex-wrap gap-7">
              {[
                { n: "4,210", l: "saw it", brand: false },
                { n: "312", l: "clicked", brand: false },
                { n: "14", l: "applied", brand: false },
                { n: "9", l: "fit", brand: true },
              ].map((m) => (
                <div key={m.l} className="flex flex-col">
                  <span className={"text-[max(1.5rem,20px)] font-light leading-tight " + (m.brand ? "text-brand" : "text-ink")}>
                    {m.n}
                  </span>
                  <span className="text-[max(0.8125rem,12px)] text-ink-3">{m.l}</span>
                </div>
              ))}
            </div>
          </button>

          <button
            type="button"
            onClick={() => toggleChannel("facebook")}
            className={
              "flex flex-col gap-4 rounded-[1.5rem] bg-canvas p-5 text-left transition-colors hover:bg-surface-2 " +
              (channelFilter === "facebook" ? "ring-2 ring-brand/30" : "")
            }
          >
            <div className="flex w-full flex-wrap items-center gap-2.5">
              <span className="text-h3 font-medium text-ink">Facebook ad</span>
              <Tag tone="brand">Running · day 3 of 7</Tag>
            </div>
            <div className="flex flex-wrap gap-7">
              {[
                { n: "9,880", l: "saw it", brand: false },
                { n: "401", l: "clicked", brand: false },
                { n: "11", l: "applied", brand: false },
                { n: "2", l: "fit", brand: true },
              ].map((m) => (
                <div key={m.l} className="flex flex-col">
                  <span className={"text-[max(1.5rem,20px)] font-light leading-tight " + (m.brand ? "text-brand" : "text-ink")}>
                    {m.n}
                  </span>
                  <span className="text-[max(0.8125rem,12px)] text-ink-3">{m.l}</span>
                </div>
              ))}
            </div>
          </button>
        </div>

        {/* Applicants list */}
        <section>
          <SectionHeading
            title="People who applied from the ads"
            meta={
              onlyWhatsappFit
                ? "WhatsApp fits · showing top matches"
                : channelFilter === "all"
                  ? "25 people · 11 fit"
                  : `Filtered by ${channelFilter === "whatsapp" ? "WhatsApp ad" : "Facebook ad"}`
            }
          />
          <div className="flex flex-col">
            {visible.map((a, idx) => {
              const selected = selectedId === a.id;
              const prevSelected = idx > 0 && visible[idx - 1].id === selectedId;
              const added = addedIds.includes(a.id);
              return (
                <div key={a.id}>
                  {idx > 0 && !selected && !prevSelected && (
                    <div className="px-5">
                      <div className="h-px bg-border" />
                    </div>
                  )}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(a.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedId(a.id)}
                    className={
                      "flex flex-wrap items-center gap-4 rounded-[1.25rem] px-5 py-4 transition-colors " +
                      (selected ? "bg-canvas" : "hover:bg-canvas/60")
                    }
                  >
                    <Avatar initials={a.initials} tone={a.tone} />
                    <div className="min-w-[11rem] shrink-0 md:w-[15.625rem]">
                      <p className="truncate text-[max(0.9375rem,14px)] font-medium text-ink">{a.name}</p>
                      <p className="truncate text-caption text-ink-3">{a.sourceLabel}</p>
                    </div>
                    <div className="min-w-[14rem] flex-1">
                      <p className="truncate text-small font-medium text-ink">{a.role}</p>
                      <p className="truncate text-[max(0.8125rem,12px)] text-ink-2">{a.before}</p>
                    </div>
                    <Tag tone={a.fit === "Fit" ? "brand" : "neutral"}>{added ? "In pipeline" : a.fit}</Tag>
                    {selected && !added && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (cb.onAddToPipeline({ name: a.name, title: a.role, channel: a.channel === "whatsapp" ? "DA" : "FB", cv: a.cv })) {
                            setAddedIds((ids) => [...ids, a.id]);
                          }
                        }}
                        className="flex h-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface px-4 text-[max(0.8125rem,12px)] font-medium text-ink hover:bg-surface-2"
                      >
                        Add to pipeline
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

// ============================================================================
// 5. COMPANY EXTRACTION (Figma 1:2167)
// ============================================================================
function CompanyExtractionWorkspace({ item, cb }: { item: StrategyItem; cb: WorkspaceCallbacks }) {
  const [companies, setCompanies] = useState(INITIAL_COMPANIES);
  const [adding, setAdding] = useState(false);
  const [newCompany, setNewCompany] = useState("");
  const [selectedId, setSelectedId] = useState("cp1");
  const [addedIds, setAddedIds] = useState<string[]>([]);

  const pickedNames = new Set(companies.filter((c) => c.picked).map((c) => c.name));
  const people = INITIAL_COMPANY_PEOPLE.filter((p) => pickedNames.has(p.company));

  const toggleCompany = (id: string) =>
    setCompanies((list) => list.map((c) => (c.id === id ? { ...c, picked: !c.picked } : c)));

  const selectAllFive = () => {
    setCompanies((list) => list.map((c) => ({ ...c, picked: true })));
    cb.onNotify("All 5 companies picked", " — showing people across every SAP team");
  };

  const addCompany = () => {
    const trimmed = newCompany.trim();
    if (!trimmed) return;
    setCompanies((list) => [
      ...list,
      {
        id: `c-${Date.now()}`,
        letter: trimmed[0].toUpperCase(),
        name: trimmed,
        meta: "Added · Colombo",
        countText: "Scanning SAP roles",
        picked: true,
      },
    ]);
    setNewCompany("");
    setAdding(false);
    cb.onNotify(trimmed, " added to your competitor list");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[max(1.375rem,14px)]">
      <StrategyHeader
        item={item}
        auraText="I listed 8 competitor companies from the JD and your shortlist. 5 have SAP teams."
        auraActionLabel="Search all 5"
        onAuraAction={selectAllFive}
      />

      <div className="min-h-0 flex-1 space-y-[max(1.375rem,14px)] overflow-y-auto pr-1 [scrollbar-width:thin]">
        <section>
          <SectionHeading step={1} title="Competitor companies" meta={`${pickedNames.size} picked of 8 found`} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_9.375rem]">
            {companies.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCompany(c.id)}
                className={
                  "flex flex-col gap-1.5 rounded-[1.25rem] bg-canvas p-4 text-left transition-colors hover:bg-surface-2 " +
                  (c.picked ? "" : "opacity-75")
                }
              >
                <div className="flex w-full items-center gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface text-[max(0.9375rem,14px)] font-medium text-brand">
                    {c.letter}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[max(0.9375rem,13.5px)] font-medium text-ink">
                    {c.name}
                  </span>
                  <span
                    className={
                      "flex size-5 shrink-0 items-center justify-center rounded-full " +
                      (c.picked ? "bg-brand text-white" : "border-[1.5px] border-border-strong bg-surface")
                    }
                  >
                    {c.picked && <CheckSvg />}
                  </span>
                </div>
                <p className="truncate text-[max(0.8125rem,12px)] text-ink-3">{c.meta}</p>
                <p className="truncate text-[max(0.8125rem,12px)] text-ink-2">{c.countText}</p>
              </button>
            ))}

            {adding ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addCompany();
                }}
                className="flex flex-col justify-center gap-2 rounded-[1.25rem] border border-dashed border-brand bg-surface p-3"
              >
                <input
                  type="text"
                  autoFocus
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  placeholder="Company name"
                  className="w-full rounded-xs border border-border bg-canvas px-2 py-1 text-caption text-ink outline-none focus:border-brand"
                />
                <div className="flex gap-1.5">
                  <button type="submit" className="flex-1 rounded-full bg-ink py-1 text-caption font-medium text-white">
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdding(false)}
                    className="rounded-full bg-surface-2 px-2 py-1 text-caption text-ink-2"
                  >
                    ×
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex min-h-[6.5rem] flex-col items-center justify-center gap-1.5 rounded-[1.25rem] border border-dashed border-border-strong text-ink-3 transition-colors hover:border-brand hover:bg-canvas hover:text-ink"
              >
                <PlusSvg className="size-4" />
                <span className="text-[max(0.8125rem,12px)]">Add a company</span>
              </button>
            )}
          </div>
        </section>

        <section>
          <SectionHeading step={2} title="People inside these companies" meta="61 people · 14 look right" />
          <div className="flex flex-col">
            {people.length === 0 ? (
              <p className="rounded-[1.25rem] bg-canvas px-5 py-6 text-small text-ink-3">
                Pick at least one company above to see people inside it.
              </p>
            ) : (
              people.map((p, idx) => {
                const selected = selectedId === p.id;
                const prevSelected = idx > 0 && people[idx - 1].id === selectedId;
                const added = addedIds.includes(p.id);
                return (
                  <div key={p.id}>
                    {idx > 0 && !selected && !prevSelected && (
                      <div className="px-5">
                        <div className="h-px bg-border" />
                      </div>
                    )}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(p.id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedId(p.id)}
                      className={
                        "flex flex-wrap items-center gap-4 rounded-[1.25rem] px-5 py-4 transition-colors " +
                        (selected ? "bg-canvas" : "hover:bg-canvas/60")
                      }
                    >
                      <Avatar initials={p.initials} tone={p.tone} />
                      <div className="min-w-[11rem] shrink-0 md:w-[16.25rem]">
                        <p className="truncate text-[max(0.9375rem,14px)] font-medium text-ink">{p.name}</p>
                        <p className="truncate text-caption text-ink-3">{p.location}</p>
                      </div>
                      <div className="min-w-[14rem] flex-1">
                        <p className="truncate text-small font-medium text-ink">{p.role}</p>
                        <p className="truncate text-[max(0.8125rem,12px)] text-ink-2">{p.before}</p>
                      </div>
                      <Tag tone={p.hasCv ? "brand" : "neutral"}>{p.hasCv ? "CV on file" : "Not in the database"}</Tag>
                      {selected && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (p.hasCv && p.cv) {
                              cb.onOpenCv({ name: p.name, title: `${p.role} · ${p.company}`, src: p.cv });
                            } else if (!added && cb.onAddToPipeline({ name: p.name, title: p.role, company: p.company, channel: "HH" })) {
                              setAddedIds((ids) => [...ids, p.id]);
                            }
                          }}
                          className="flex h-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface px-4 text-[max(0.8125rem,12px)] font-medium text-ink hover:bg-surface-2"
                        >
                          {p.hasCv ? "Open CV" : added ? "In pipeline" : "Add to pipeline"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ============================================================================
// 6. DIRECT HEADHUNT (Figma 1:2410 — done and submitted)
// ============================================================================
function DirectHeadhuntWorkspace({ item, cb }: { item: StrategyItem; cb: WorkspaceCallbacks }) {
  const [targets] = useState(INITIAL_HEADHUNT_TARGETS);
  const [events] = useState(INITIAL_HEADHUNT_EVENTS);

  const openFirstCv = () => {
    const first = targets.find((t) => t.cv);
    if (first?.cv) cb.onOpenCv({ name: first.name, title: first.role, src: first.cv });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[max(1.375rem,14px)]">
      <StrategyHeader
        item={item}
        auraText="Done. 2 of your 3 people sent a CV. 63% of CVs from this strategy reach the director shortlist."
        auraActionLabel="See the 2 CVs"
        onAuraAction={openFirstCv}
      />

      <div className="min-h-0 flex-1 space-y-[max(1.375rem,14px)] overflow-y-auto pr-1 [scrollbar-width:thin]">
        <section>
          <SectionHeading title="The people you went after" meta="3 people · 2 sent a CV" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {targets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  t.cv
                    ? cb.onOpenCv({ name: t.name, title: t.role, src: t.cv })
                    : cb.onNotify(t.name, " — waiting on CV (asked for a week to think)")
                }
                className="flex flex-col gap-2.5 rounded-[1.25rem] bg-canvas p-4 text-left transition-colors hover:bg-surface-2"
              >
                <div className="flex w-full items-center gap-3">
                  <Avatar initials={t.initials} tone={t.tone} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[max(0.9375rem,14px)] font-medium text-ink">{t.name}</p>
                    <p className="truncate text-[max(0.8125rem,12px)] text-ink-3">{t.role}</p>
                  </div>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2">
                  <Tag tone={t.status === "CV received" ? "brand" : "warn"}>{t.status}</Tag>
                  <span className="ml-auto text-caption text-ink-3">{t.lastContact}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading title="What happened" meta="newest first" />
          <div className="rounded-[1.5rem] border border-border bg-surface px-5.5 py-1.5">
            {events.map((ev, idx) => (
              <div key={ev.id}>
                {idx > 0 && <div className="h-px bg-border" />}
                <div className="flex items-center gap-4.5 py-3.5">
                  <span className="w-14 shrink-0 text-small text-ink-3">{ev.date}</span>
                  <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                  <p className="min-w-0 flex-1 text-[max(0.9375rem,13.5px)] text-ink">{ev.text}</p>
                  <Tag tone="neutral">{ev.channel}</Tag>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ============================================================================
// 7. NEW STRATEGY — ACCEPT FIRST (Figma 1:2621 — AI Search & any unaccepted strategy)
// ============================================================================
export function NewStrategyAcceptView({
  item,
  freshItems,
  lead,
  onAcceptOne,
  onAcceptAll,
  onAskLead,
}: {
  item: StrategyItem;
  freshItems: StrategyItem[];
  lead: string;
  onAcceptOne: () => void;
  onAcceptAll: () => void;
  onAskLead: () => void;
}) {
  const cat = catalogOf(item.key);
  const steps = cat?.steps ?? [
    "Review the job description and target brief.",
    "Run this strategy with AURA's help.",
    "Log what you did and submit to your TA Lead.",
  ];
  const auraLine = cat?.auraWhenNew ?? "Accept this strategy first so AURA can prepare it for you.";
  const otherNames = freshItems.map((s) => s.title);
  const bothText =
    otherNames.length === 2
      ? `You can accept ${otherNames[0]} and ${otherNames[1]} together.`
      : otherNames.length > 2
        ? `You can accept all ${otherNames.length} new strategies together.`
        : "Accept it to unlock the workspace and start logging updates.";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[max(1.375rem,14px)]">
      <StrategyHeader item={item} auraText={auraLine} />

      <div className="min-h-0 flex-1 space-y-[max(1.375rem,14px)] overflow-y-auto pr-1 [scrollbar-width:thin]">
        {/* Warm accept banner (Figma 1:2730) */}
        <div className="flex flex-wrap items-center gap-4 rounded-[1.5rem] bg-warn-soft py-4.5 pl-6 pr-4.5">
          <div className="min-w-[16rem] flex-1">
            <p className="text-[max(1.0625rem,15px)] font-medium text-ink">
              {lead} gave you this strategy today.
            </p>
            <p className="text-small text-ink-2">Accept it to start. {bothText}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onAskLead}
              className="flex h-11 items-center justify-center whitespace-nowrap rounded-full border border-border-strong bg-surface px-5.5 text-[max(0.9375rem,13px)] font-medium text-ink transition-colors hover:bg-surface-2"
            >
              Ask {lead}
            </button>
            {freshItems.length > 1 && (
              <button
                type="button"
                onClick={onAcceptAll}
                className="flex h-11 items-center justify-center whitespace-nowrap rounded-full border border-border-strong bg-surface px-5.5 text-[max(0.9375rem,13px)] font-medium text-ink transition-colors hover:bg-surface-2"
              >
                {freshItems.length === 2 ? "Accept both" : `Accept all ${freshItems.length}`}
              </button>
            )}
            <button
              type="button"
              onClick={onAcceptOne}
              className="flex h-11 items-center justify-center whitespace-nowrap rounded-full bg-ink px-5.5 text-[max(0.9375rem,13px)] font-medium text-white transition-colors hover:bg-black"
            >
              Accept
            </button>
          </div>
        </div>

        {/* 3-step How it works strip (Figma 1:2740) */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {steps.map((text, idx) => (
            <div key={idx} className="flex items-center gap-3 rounded-[1.25rem] bg-canvas px-4.5 py-3.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-[max(0.8125rem,12px)] font-medium text-ink">
                {idx + 1}
              </span>
              <p className="text-small text-ink">{text}</p>
            </div>
          ))}
        </div>

        {/* Dimmed preview of what AURA will make (Figma 1:2753, opacity-55) */}
        {item.key === "ai-search" ? (
          <div className="grid grid-cols-1 gap-4 opacity-55 md:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-[1.5rem] bg-canvas p-5">
              <div className="flex items-center gap-2.5">
                <p className="text-[max(0.9375rem,13.5px)] font-medium text-ink">Search words from the JD</p>
                <p className="text-[max(0.8125rem,12px)] text-ink-3">ready when you accept</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {AI_SEARCH_WORDS.map((w) => (
                  <span key={w} className="rounded-full bg-surface px-3 py-1.5 text-[max(0.8125rem,12px)] text-ink-2">
                    {w}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3 rounded-[1.5rem] bg-canvas p-5">
              <div className="flex items-center gap-2.5">
                <p className="text-[max(0.9375rem,13.5px)] font-medium text-ink">Company lists</p>
                <p className="text-[max(0.8125rem,12px)] text-ink-3">ready when you accept</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {AI_COMPANY_LIST.map((co) => (
                  <span key={co} className="rounded-full bg-surface px-3 py-1.5 text-[max(0.8125rem,12px)] text-ink-2">
                    {co}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 opacity-55 md:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-[1.5rem] bg-canvas p-5">
              <div className="flex items-center gap-2.5">
                <p className="text-[max(0.9375rem,13.5px)] font-medium text-ink">Warm contacts to ask</p>
                <p className="text-[max(0.8125rem,12px)] text-ink-3">ready when you accept</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {["Rohan Wijesekara · CIO, Hayleys", "Anushka Fernando · VP IT, MAS", "Dilshan Perera · SAP Director, IFS", "Manoj Silva · Ex-PGP Glass"].map(
                  (c) => (
                    <span key={c} className="rounded-full bg-surface px-3 py-1.5 text-[max(0.8125rem,12px)] text-ink-2">
                      {c}
                    </span>
                  ),
                )}
              </div>
            </div>
            <div className="flex flex-col gap-3 rounded-[1.5rem] bg-canvas p-5">
              <div className="flex items-center gap-2.5">
                <p className="text-[max(0.9375rem,13.5px)] font-medium text-ink">Suggested ask</p>
                <p className="text-[max(0.8125rem,12px)] text-ink-3">ready when you accept</p>
              </div>
              <p className="rounded-[1rem] bg-surface px-4 py-3 text-small text-ink-2">
                “Hi — we’re hiring a Senior Manager for SAP Business Transformation at PGP Glass. Would anyone strong from your network come to mind?”
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 8. UNLOCKED WORKSPACES FOR THE REMAINING 9 STRATEGIES (ALL 15 COVERED!)
// ============================================================================
function AiSearchActiveWorkspace({ item, cb }: { item: StrategyItem; cb: WorkspaceCallbacks }) {
  const [words, setWords] = useState(AI_SEARCH_WORDS);
  const [pickedCompanies, setPickedCompanies] = useState<string[]>(AI_COMPANY_LIST.slice(0, 5));

  const copyWord = (w: string) => {
    void navigator.clipboard?.writeText(w);
    cb.onNotify("Copied", ` — ${w}`);
  };

  const generateMore = () => {
    const extra = ['"SAP S/4HANA" AND "Sri Lanka" AND "Plant"', "SAP FICO OR MM Lead"];
    setWords((ws) => [...ws, ...extra.filter((x) => !ws.includes(x))]);
    cb.onNotify("Added 2 search strings", " from the JD");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[max(1.375rem,14px)]">
      <StrategyHeader
        item={item}
        auraText="I pulled 7 Boolean search strings and 10 target companies from the JD. Click any chip to copy."
        auraActionLabel="Generate more"
        onAuraAction={generateMore}
      />
      <div className="min-h-0 flex-1 space-y-[max(1.375rem,14px)] overflow-y-auto pr-1 [scrollbar-width:thin]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-[1.5rem] bg-canvas p-5">
            <div className="flex items-center gap-2.5">
              <p className="text-[max(0.9375rem,13.5px)] font-medium text-ink">Search words from the JD</p>
              <p className="text-[max(0.8125rem,12px)] text-ink-3">click to copy</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {words.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => copyWord(w)}
                  className="rounded-full bg-surface px-3 py-1.5 text-[max(0.8125rem,12px)] text-ink transition-colors hover:bg-brand-soft hover:text-brand"
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-[1.5rem] bg-canvas p-5">
            <div className="flex items-center gap-2.5">
              <p className="text-[max(0.9375rem,13.5px)] font-medium text-ink">Company lists</p>
              <p className="text-[max(0.8125rem,12px)] text-ink-3">{pickedCompanies.length} picked</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {AI_COMPANY_LIST.map((co) => {
                const on = pickedCompanies.includes(co);
                return (
                  <button
                    key={co}
                    type="button"
                    onClick={() =>
                      setPickedCompanies((list) => (on ? list.filter((x) => x !== co) : [...list, co]))
                    }
                    className={
                      "rounded-full px-3 py-1.5 text-[max(0.8125rem,12px)] transition-colors " +
                      (on ? "bg-brand-soft font-medium text-brand" : "bg-surface text-ink-2 hover:bg-surface-2")
                    }
                  >
                    {co}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] bg-canvas px-5 py-4">
          <p className="text-small text-ink-2">Ready to run these strings directly in LinkedIn Search?</p>
          <button
            type="button"
            onClick={() => cb.onOpenStrategyByKey("linkedin-search")}
            className="h-9 rounded-full border border-border-strong bg-surface px-4 text-[max(0.8125rem,12px)] font-medium text-ink hover:bg-surface-2"
          >
            Open LinkedIn Search
          </button>
        </div>
      </div>
    </div>
  );
}

function ReferralExtractionWorkspace({ item, cb }: { item: StrategyItem; cb: WorkspaceCallbacks }) {
  const [asked, setAsked] = useState<string[]>(["rf1"]);
  const [added, setAdded] = useState<string[]>([]);
  const contacts = [
    { id: "rf1", initials: "RW", tone: "info" as const, name: "Rohan Wijesekara", role: "Group CIO · Hayleys", note: "Referred 2 SAP leads last quarter", suggestion: "Chamara Weerasinghe" },
    { id: "rf2", initials: "AF", tone: "violet" as const, name: "Anushka Fernando", role: "VP Enterprise Systems · MAS", note: "Worked with PGP Glass transformation team", suggestion: "Ask for 1–2 names" },
    { id: "rf3", initials: "DP", tone: "brand" as const, name: "Dilshan Perera", role: "SAP Delivery Director · IFS", note: "Strong S/4HANA delivery network in Colombo", suggestion: "Ask for 1–2 names" },
    { id: "rf4", initials: "MS", tone: "warn" as const, name: "Manoj Silva", role: "Former ERP Head · Brandix", note: "Referee on 3 shortlisted CVs", suggestion: "Ask for 1–2 names" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[max(1.375rem,14px)]">
      <StrategyHeader
        item={item}
        auraText="4 referees in your network have led SAP teams in Colombo. Start with Rohan and Anushka."
        auraActionLabel="Search referees"
        onAuraAction={() => cb.onNotify("Referees", " — open Referral Search in Database for full history")}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 [scrollbar-width:thin]">
        <div className="flex items-center justify-between">
          <SectionHeading title="Contacts & referees to ask" meta={`${asked.length} of ${contacts.length} contacted`} />
          <Link href="/database?mode=referees" className="text-small font-medium text-brand hover:underline">
            Open full referee search →
          </Link>
        </div>
        <div className="flex flex-col">
          {contacts.map((c, idx) => {
            const isAsked = asked.includes(c.id);
            const isAdded = added.includes(c.id);
            return (
              <div key={c.id}>
                {idx > 0 && <div className="px-5"><div className="h-px bg-border" /></div>}
                <div className={"flex flex-wrap items-center gap-4 rounded-[1.25rem] px-5 py-4 " + (idx === 0 ? "bg-canvas" : "")}>
                  <Avatar initials={c.initials} tone={c.tone} />
                  <div className="min-w-[12rem] shrink-0 md:w-[17rem]">
                    <p className="truncate text-[max(0.9375rem,14px)] font-medium text-ink">{c.name}</p>
                    <p className="truncate text-caption text-ink-3">{c.role}</p>
                  </div>
                  <div className="min-w-[12rem] flex-1">
                    <p className="truncate text-small font-medium text-ink">{c.note}</p>
                    <p className="truncate text-caption text-ink-2">{c.suggestion}</p>
                  </div>
                  <Tag tone={isAsked ? "brand" : "neutral"}>{isAsked ? "Asked" : "Not asked"}</Tag>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isAsked) {
                        setAsked((a) => [...a, c.id]);
                        cb.onNotify("Marked asked", ` — ${c.name}`);
                      } else if (!isAdded && cb.onAddToPipeline({ name: c.name, title: c.role, channel: "HH" })) {
                        setAdded((a) => [...a, c.id]);
                      }
                    }}
                    className="flex h-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface px-4 text-[max(0.8125rem,12px)] font-medium text-ink hover:bg-surface-2"
                  >
                    {!isAsked ? "Log outreach" : isAdded ? "In pipeline" : "Add referral"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LinkedViewStrategyWorkspace({
  item,
  cb,
  auraText,
  jumpLabel,
  jumpView,
  metrics,
  rows,
}: {
  item: StrategyItem;
  cb: WorkspaceCallbacks;
  auraText: string;
  jumpLabel?: string;
  jumpView?: "scoops" | "database" | "linkedin-job";
  metrics: { n: string; label: string; brand?: boolean }[];
  rows: { id: string; initials: string; tone: AvatarTone; name: string; sub: string; role: string; before: string; tag: string; tagTone: "brand" | "neutral"; cv: string; channel: string }[];
}) {
  const { go } = useOpeningView();
  const [selectedId, setSelectedId] = useState(rows[0]?.id ?? "");
  const [addedIds, setAddedIds] = useState<string[]>([]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[max(1.125rem,12px)]">
      <StrategyHeader
        item={item}
        auraText={auraText}
        auraActionLabel={jumpLabel}
        onAuraAction={jumpView ? () => go(jumpView) : undefined}
      />

      <div className="min-h-0 flex-1 space-y-[max(1.125rem,12px)] overflow-y-auto pr-1 [scrollbar-width:thin]">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="flex items-center gap-3 rounded-[1.25rem] bg-canvas px-5 py-3.5">
              <span className={"text-[max(1.75rem,22px)] font-light leading-none " + (m.brand ? "text-brand" : "text-ink")}>
                {m.n}
              </span>
              <span className="text-small text-ink-2">{m.label}</span>
            </div>
          ))}
        </div>

        <section>
          <SectionHeading title="Matched candidates" meta={`${rows.length} shown`} />
          <div className="flex flex-col">
            {rows.map((r, idx) => {
              const selected = selectedId === r.id;
              const prevSelected = idx > 0 && rows[idx - 1].id === selectedId;
              const added = addedIds.includes(r.id);
              return (
                <div key={r.id}>
                  {idx > 0 && !selected && !prevSelected && (
                    <div className="px-5"><div className="h-px bg-border" /></div>
                  )}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(r.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedId(r.id)}
                    className={
                      "flex flex-wrap items-center gap-4 rounded-[1.25rem] px-5 py-4 transition-colors " +
                      (selected ? "bg-canvas" : "hover:bg-canvas/60")
                    }
                  >
                    <Avatar initials={r.initials} tone={r.tone} />
                    <div className="min-w-[12rem] shrink-0 md:w-[17rem]">
                      <p className="truncate text-[max(0.9375rem,14px)] font-medium text-ink">{r.name}</p>
                      <p className="truncate text-caption text-ink-3">{r.sub}</p>
                    </div>
                    <div className="min-w-[14rem] flex-1">
                      <p className="truncate text-small font-medium text-ink">{r.role}</p>
                      <p className="truncate text-[max(0.8125rem,12px)] text-ink-2">{r.before}</p>
                    </div>
                    <Tag tone={added ? "neutral" : r.tagTone}>{added ? "In pipeline" : r.tag}</Tag>
                    {selected && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            cb.onOpenCv({ name: r.name, title: r.role, src: r.cv });
                          }}
                          className="h-9 rounded-full border border-border-strong bg-surface px-3.5 text-[max(0.8125rem,12px)] font-medium text-ink hover:bg-surface-2"
                        >
                          Open CV
                        </button>
                        {!added && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (cb.onAddToPipeline({ name: r.name, title: r.role, channel: r.channel, cv: r.cv })) {
                                setAddedIds((ids) => [...ids, r.id]);
                              }
                            }}
                            className="h-9 rounded-full bg-ink px-4 text-[max(0.8125rem,12px)] font-medium text-white hover:bg-black"
                          >
                            Add to pipeline
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function SelectableChipsStrategyWorkspace({
  item,
  cb,
  auraText,
  chipHeading,
  initialChips,
  candidates,
}: {
  item: StrategyItem;
  cb: WorkspaceCallbacks;
  auraText: string;
  chipHeading: string;
  initialChips: { label: string; meta: string; picked: boolean }[];
  candidates: { id: string; initials: string; tone: AvatarTone; name: string; sub: string; role: string; before: string; tag: string; cv: string }[];
}) {
  const [chips, setChips] = useState(initialChips);
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? "");
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const pickedCount = chips.filter((c) => c.picked).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[max(1.375rem,14px)]">
      <StrategyHeader
        item={item}
        auraText={auraText}
        auraActionLabel="Select all"
        onAuraAction={() => setChips((cs) => cs.map((c) => ({ ...c, picked: true })))}
      />
      <div className="min-h-0 flex-1 space-y-[max(1.375rem,14px)] overflow-y-auto pr-1 [scrollbar-width:thin]">
        <section>
          <SectionHeading step={1} title={chipHeading} meta={`${pickedCount} of ${chips.length} picked`} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => setChips((list) => list.map((x) => (x.label === c.label ? { ...x, picked: !x.picked } : x)))}
                className={
                  "flex flex-col gap-1.5 rounded-[1.25rem] bg-canvas p-4 text-left transition-colors hover:bg-surface-2 " +
                  (c.picked ? "" : "opacity-65")
                }
              >
                <div className="flex w-full items-center gap-2">
                  <span className="truncate text-[max(0.9375rem,13.5px)] font-medium text-ink">{c.label}</span>
                  <span
                    className={
                      "ml-auto flex size-5 shrink-0 items-center justify-center rounded-full " +
                      (c.picked ? "bg-brand text-white" : "border-[1.5px] border-border-strong bg-surface")
                    }
                  >
                    {c.picked && <CheckSvg />}
                  </span>
                </div>
                <span className="text-[max(0.8125rem,12px)] text-ink-3">{c.meta}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading step={2} title="People found" meta={`${candidates.length} strong fits`} />
          <div className="flex flex-col">
            {candidates.map((p, idx) => {
              const selected = selectedId === p.id;
              const prevSelected = idx > 0 && candidates[idx - 1].id === selectedId;
              const added = addedIds.includes(p.id);
              return (
                <div key={p.id}>
                  {idx > 0 && !selected && !prevSelected && <div className="px-5"><div className="h-px bg-border" /></div>}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(p.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedId(p.id)}
                    className={
                      "flex flex-wrap items-center gap-4 rounded-[1.25rem] px-5 py-4 transition-colors " +
                      (selected ? "bg-canvas" : "hover:bg-canvas/60")
                    }
                  >
                    <Avatar initials={p.initials} tone={p.tone} />
                    <div className="min-w-[12rem] shrink-0 md:w-[17rem]">
                      <p className="truncate text-[max(0.9375rem,14px)] font-medium text-ink">{p.name}</p>
                      <p className="truncate text-caption text-ink-3">{p.sub}</p>
                    </div>
                    <div className="min-w-[14rem] flex-1">
                      <p className="truncate text-small font-medium text-ink">{p.role}</p>
                      <p className="truncate text-[max(0.8125rem,12px)] text-ink-2">{p.before}</p>
                    </div>
                    <Tag tone="brand">{added ? "In pipeline" : p.tag}</Tag>
                    {selected && !added && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (cb.onAddToPipeline({ name: p.name, title: p.role, channel: "L", cv: p.cv })) {
                            setAddedIds((ids) => [...ids, p.id]);
                          }
                        }}
                        className="flex h-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface px-4 text-[max(0.8125rem,12px)] font-medium text-ink hover:bg-surface-2"
                      >
                        Add to pipeline
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Dispatches any of the 15 strategies (or a custom one) to its exact dedicated UI. */
export function StrategyWorkspaceSwitch({ item, cb }: { item: StrategyItem; cb: WorkspaceCallbacks }) {
  switch (item.key) {
    case "previous-post-screening":
      return <PreviousPostScreeningWorkspace item={item} cb={cb} />;
    case "linkedin-search":
      return <LinkedInSearchWorkspace item={item} cb={cb} />;
    case "inmail":
      return <InMailWorkspace item={item} cb={cb} />;
    case "smart-ad":
      return <SmartAdWorkspace item={item} cb={cb} />;
    case "company-extraction":
      return <CompanyExtractionWorkspace item={item} cb={cb} />;
    case "direct-headhunt":
      return <DirectHeadhuntWorkspace item={item} cb={cb} />;
    case "ai-search":
      return <AiSearchActiveWorkspace item={item} cb={cb} />;
    case "referral-extraction":
      return <ReferralExtractionWorkspace item={item} cb={cb} />;
    case "scoop":
      return (
        <LinkedViewStrategyWorkspace
          item={item}
          cb={cb}
          auraText="8 Director and Lead scoops arrived for this role. 2 are already shortlisted into TA Follow-up."
          jumpLabel="Open Scoops"
          jumpView="scoops"
          metrics={[
            { n: "8", label: "Scoops shared" },
            { n: "6", label: "Screened" },
            { n: "3", label: "Strong fit" },
            { n: "2", label: "Shortlisted", brand: true },
          ]}
          rows={[
            { id: "sc1", initials: "KP", tone: "info", name: "Kasun Perera", sub: "Sent by Director · 10 Nov", role: "SAP S/4HANA Lead · Virtusa", before: "Before: Senior SAP Consultant · IFS · 4 yrs", tag: "Strong fit", tagTone: "brand", cv: "/cvs/p1.pdf", channel: "SCOOP" },
            { id: "sc2", initials: "IS", tone: "violet", name: "Ishara Silva", sub: "Sent by TA Lead · 10 Nov", role: "SAP Solution Architect · Virtusa", before: "Before: SAP PP Consultant · Brandix · 3 yrs", tag: "CV on file", tagTone: "brand", cv: "/cvs/p2.pdf", channel: "SCOOP" },
            { id: "sc3", initials: "DF", tone: "warn", name: "Dilan Fonseka", sub: "Sent by Ops · 9 Nov", role: "SAP Delivery Manager · Dipped Products", before: "Before: SAP PP Lead · Ansell Lanka · 5 yrs", tag: "Unclaimed", tagTone: "neutral", cv: "/cvs/s1.pdf", channel: "SCOOP" },
          ]}
        />
      );
    case "repository":
      return (
        <LinkedViewStrategyWorkspace
          item={item}
          cb={cb}
          auraText="I scanned AURA's repository and matched 19 past candidates against this JD. 4 are ready to shortlist."
          jumpLabel="Open Database CVs"
          jumpView="database"
          metrics={[
            { n: "19", label: "Matched in AURA" },
            { n: "11", label: "With recent CV" },
            { n: "7", label: "Notice ≤ 30d" },
            { n: "4", label: "Ready to shortlist", brand: true },
          ]}
          rows={[
            { id: "rp1", initials: "CW", tone: "info", name: "Chamara Weerasinghe", sub: "In repository · updated Oct 2026", role: "ERP Programme Director · Hayleys", before: "Before: SAP Delivery Manager · MAS Holdings · 5 yrs", tag: "94% match", tagTone: "brand", cv: "/cvs/p1.pdf", channel: "SCOOP" },
            { id: "rp2", initials: "NA", tone: "violet", name: "Nimali Abeysekara", sub: "In repository · updated Sep 2026", role: "SAP MM Lead · IFS", before: "Before: SAP MM Consultant · Dialog Axiata · 4 yrs", tag: "89% match", tagTone: "brand", cv: "/cvs/p2.pdf", channel: "SCOOP" },
            { id: "rp3", initials: "TJ", tone: "brand", name: "Tharindu Jay", sub: "In repository · updated Aug 2026", role: "SAP FICO Manager · Brandix", before: "Before: SAP FICO Consultant · Hirdaramani · 5 yrs", tag: "84% match", tagTone: "neutral", cv: "/cvs/s2.pdf", channel: "SCOOP" },
          ]}
        />
      );
    case "recruiter-search":
      return (
        <LinkedViewStrategyWorkspace
          item={item}
          cb={cb}
          auraText="Your LinkedIn Recruiter post is live with 34 applicants. 6 match S/4HANA manufacturing experience."
          jumpLabel="Open LinkedIn Job"
          jumpView="linkedin-job"
          metrics={[
            { n: "2", label: "Active posts" },
            { n: "34", label: "Applicants" },
            { n: "12", label: "Screened" },
            { n: "6", label: "Strong fit", brand: true },
          ]}
          rows={[
            { id: "rc1", initials: "AS", tone: "info", name: "Arjuna Silva", sub: "Applied on LinkedIn · today", role: "Digital Transformation Lead · Ansell Lanka", before: "Before: ERP Manager · Hayleys · 5 yrs", tag: "Strong fit", tagTone: "brand", cv: "/cvs/s5.pdf", channel: "L" },
            { id: "rc2", initials: "NP", tone: "brand", name: "Nadeesha Peiris", sub: "Workable search · yesterday", role: "SAP PP Consultant · MAS Holdings", before: "Before: Production Planner · Brandix · 4 yrs", tag: "Fit", tagTone: "brand", cv: "/cvs/s4.pdf", channel: "L" },
          ]}
        />
      );
    case "email-campaign":
      return (
        <LinkedViewStrategyWorkspace
          item={item}
          cb={cb}
          auraText="42 targeted emails sent to SAP leads in Colombo. 18 opened and 5 replied."
          metrics={[
            { n: "42", label: "Emails sent" },
            { n: "18", label: "Opened" },
            { n: "5", label: "Replied" },
            { n: "3", label: "Interested", brand: true },
          ]}
          rows={[
            { id: "em1", initials: "IS", tone: "info", name: "Ishara Silva", sub: "Replied today · 9:15 AM", role: "SAP Solution Architect · Virtusa", before: "“Interested — happy to review the full JD.”", tag: "Interested", tagTone: "brand", cv: "/cvs/p2.pdf", channel: "E" },
            { id: "em2", initials: "RG", tone: "warn", name: "Ruwan Gunawardena", sub: "Opened twice · 14 Nov", role: "Head of SAP · Lanka Tiles", before: "Opened email 2 times. No reply yet.", tag: "Opened", tagTone: "neutral", cv: "/cvs/s2.pdf", channel: "E" },
          ]}
        />
      );
    case "designation-search":
      return (
        <SelectableChipsStrategyWorkspace
          item={item}
          cb={cb}
          auraText="These 4 job titles produced 78% of past Director shortlists on SAP transformation roles."
          chipHeading="Job titles that worked on past positions"
          initialChips={[
            { label: "SAP Programme Manager", meta: "14 matches · Colombo", picked: true },
            { label: "ERP Transformation Lead", meta: "11 matches · Sri Lanka", picked: true },
            { label: "S/4HANA Delivery Manager", meta: "9 matches · Colombo", picked: true },
            { label: "Head of Business Systems", meta: "16 matches · Colombo", picked: false },
          ]}
          candidates={[
            { id: "ds1", initials: "CW", tone: "info", name: "Chamara Weerasinghe", sub: "Matches: SAP Programme Manager", role: "ERP Programme Director · Hayleys", before: "Before: SAP Delivery Manager · MAS Holdings · 5 yrs", tag: "Title match", cv: "/cvs/p1.pdf" },
            { id: "ds2", initials: "HW", tone: "violet", name: "Hasini Wickrama", sub: "Matches: ERP Transformation Lead", role: "Transformation Lead · Royal Ceramics", before: "Before: Finance Systems Manager · Lanka Tiles · 5 yrs", tag: "Title match", cv: "/cvs/s3.pdf" },
          ]}
        />
      );
    case "l-search-extraction":
      return (
        <SelectableChipsStrategyWorkspace
          item={item}
          cb={cb}
          auraText="I extracted 2 common companies and 2 universities from your top 5 profiles."
          chipHeading="Companies & schools from good profiles"
          initialChips={[
            { label: "Virtusa · SAP Practice", meta: "Company · 12 peers", picked: true },
            { label: "IFS · ERP Consulting", meta: "Company · 9 peers", picked: true },
            { label: "University of Moratuwa", meta: "School · 15 alumni in SAP", picked: true },
            { label: "University of Colombo", meta: "School · 8 alumni in SAP", picked: false },
          ]}
          candidates={[
            { id: "lx1", initials: "KP", tone: "info", name: "Kasun Perera", sub: "Virtusa · UoM alumnus", role: "SAP S/4HANA Lead · Virtusa", before: "Before: Senior SAP Consultant · IFS · 3.5 yrs", tag: "Exact match", cv: "/cvs/p1.pdf" },
            { id: "lx2", initials: "SP", tone: "brand", name: "Shalini Perera", sub: "MAS Holdings · UoM alumnus", role: "ERP Programme Manager · MAS Holdings", before: "Before: SAP MM Lead · Rocell · 4 yrs", tag: "Alumni match", cv: "/cvs/s3.pdf" },
          ]}
        />
      );
    case "shortlist-company":
      return (
        <SelectableChipsStrategyWorkspace
          item={item}
          cb={cb}
          auraText="Your shortlisted candidates came from Hayleys, IFS, and MAS Holdings. 6 similar peers work alongside them."
          chipHeading="Companies of shortlisted candidates"
          initialChips={[
            { label: "Hayleys Group", meta: "From Chamara W. · 4 peers", picked: true },
            { label: "IFS Sri Lanka", meta: "From Ruwan G. · 5 peers", picked: true },
            { label: "MAS Holdings", meta: "From Shalini P. · 3 peers", picked: true },
            { label: "Dipped Products", meta: "From Dilan F. · 2 peers", picked: false },
          ]}
          candidates={[
            { id: "sc-1", initials: "SD", tone: "violet", name: "Sameera Dias", sub: "Hayleys Fibre · Colombo", role: "SAP Lead · Hayleys Fibre", before: "Peer of shortlisted candidate Chamara W.", tag: "Same team", cv: "/cvs/s4.pdf" },
            { id: "sc-2", initials: "NA", tone: "info", name: "Nimali Abeysekara", sub: "IFS · Colombo", role: "SAP MM Lead · IFS", before: "Peer of shortlisted candidate Ruwan G.", tag: "Same team", cv: "/cvs/p2.pdf" },
          ]}
        />
      );
    default:
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-[max(1.375rem,14px)]">
          <StrategyHeader
            item={item}
            auraText={`Custom strategy assigned for this position. Work through your targets and log results below.`}
          />
          <div className="rounded-[1.5rem] bg-canvas p-6 text-small text-ink-2">
            Use the log bar below to record what you did, attach up to 5 proof screenshots, and submit your update to {cb.lead}.
          </div>
        </div>
      );
  }
}

// ============================================================================
// 9. DAILY PLAN (Figma 1:1986)
// ============================================================================
export function DailyPlanWorkspace({
  lead,
  onOpenStrategy,
  onNotify,
}: {
  lead: string;
  onOpenStrategy: (key: StrategyKey) => void;
  onNotify: (bold: string, rest: string) => void;
}) {
  const [days, setDays] = useState<DailyPlanDay[]>(INITIAL_DAILY_PLAN);
  const [dayId, setDayId] = useState("wed");
  const [editing, setEditing] = useState(false);
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskTime, setNewTaskTime] = useState("3:30");

  const activeDay = days.find((d) => d.id === dayId) ?? days[2];
  const doneCount = activeDay.tasks.filter((t) => t.state === "done").length;
  const nextTask = activeDay.tasks.find((t) => t.state !== "done");

  const toggleTask = (taskId: string) => {
    setDays((all) =>
      all.map((d) =>
        d.id !== activeDay.id
          ? d
          : {
              ...d,
              tasks: d.tasks.map((t) =>
                t.id === taskId ? { ...t, state: t.state === "done" ? "todo" : "done" } : t,
              ),
            },
      ),
    );
  };

  const addTask = () => {
    const text = newTaskText.trim();
    if (!text) return;
    setDays((all) =>
      all.map((d) =>
        d.id !== activeDay.id
          ? d
          : {
              ...d,
              tasks: [
                ...d.tasks,
                {
                  id: `task-${Date.now()}`,
                  time: newTaskTime || "3:30",
                  text,
                  strategyKey: "all",
                  strategyLabel: "All strategies",
                  state: "todo",
                },
              ],
            },
      ),
    );
    setNewTaskText("");
    setEditing(false);
    onNotify("Plan updated", ` — added “${text}”`);
  };

  const startPrimary = () => {
    if (!nextTask) return onNotify("All done", ` for ${activeDay.fullLabel}`);
    if (nextTask.strategyKey === "all") {
      onOpenStrategy("previous-post-screening");
    } else {
      onOpenStrategy(nextTask.strategyKey);
    }
  };

  const primaryLabel =
    nextTask?.strategyKey === "previous-post-screening"
      ? "Start the old posts"
      : nextTask
        ? `Start ${nextTask.strategyLabel}`
        : "All done for today";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[max(1.25rem,12px)]">
      {/* Daily plan header (Figma 1:2083) */}
      <header className="flex shrink-0 flex-col gap-[max(0.875rem,8px)]">
        <div className="flex flex-wrap items-center gap-3.5">
          <h1 className="text-[max(1.875rem,21px)] font-normal leading-tight text-ink">Daily plan</h1>
          <Tag tone="neutral">{activeDay.fullLabel}</Tag>
          <span className="ml-auto text-small text-ink-3">
            {doneCount} of {activeDay.tasks.length} done today
          </span>
        </div>
        <p className="text-body text-ink-2">AURA makes this plan from the strategies on this position.</p>

        {/* Week selector pills (Mon 16 .. Fri 20) */}
        <div className="flex flex-wrap items-center gap-2">
          {days.map((d) => {
            const active = d.id === activeDay.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDayId(d.id)}
                className={
                  "flex h-9.5 items-center gap-2 rounded-full px-4 text-small transition-colors " +
                  (active
                    ? "bg-ink font-medium text-white"
                    : "bg-canvas text-ink-2 hover:bg-surface-2 hover:text-ink")
                }
              >
                {d.past && !active && <CheckSvg className="size-3 text-brand" />}
                <span>{d.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <AuraMark />
          <p className="text-body font-medium text-ink">{activeDay.auraLine}</p>
        </div>
      </header>

      {/* Plan for today bordered card (Figma 1:2109) */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
        <div className="rounded-[1.75rem] border border-border bg-surface px-6.5 pb-5.5 pt-2.5">
          {activeDay.tasks.map((t, idx) => {
            const isDone = t.state === "done";
            const isActive = t.state === "active";
            return (
              <div key={t.id}>
                {idx > 0 && <div className="h-px bg-border" />}
                <div className="flex flex-wrap items-center gap-4.5 py-4">
                  <span className="w-14 shrink-0 text-small text-ink-3">{t.time}</span>
                  <button
                    type="button"
                    onClick={() => toggleTask(t.id)}
                    aria-label={isDone ? `Mark "${t.text}" not done` : `Mark "${t.text}" done`}
                    className="shrink-0"
                  >
                    {isDone ? (
                      <span className="flex size-5 items-center justify-center rounded-full bg-brand text-white">
                        <CheckSvg />
                      </span>
                    ) : isActive ? (
                      <span className="flex size-5 items-center justify-center rounded-full border-2 border-brand bg-surface">
                        <span className="size-[7px] rounded-full bg-brand" />
                      </span>
                    ) : (
                      <span className="block size-5 rounded-full border-[1.5px] border-border-strong bg-surface hover:border-brand" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      t.strategyKey === "all"
                        ? onNotify("Daily log", ` — submit your updates to ${lead} from each strategy`)
                        : onOpenStrategy(t.strategyKey)
                    }
                    className={
                      "min-w-[12rem] flex-1 text-left text-body transition-colors " +
                      (isDone ? "text-ink-3 line-through" : "font-medium text-ink hover:text-brand")
                    }
                  >
                    {t.text.replace("Rashmi", lead)}
                  </button>
                  <Tag tone="neutral">{t.strategyLabel}</Tag>
                  <button
                    type="button"
                    aria-label={`Open ${t.strategyLabel}`}
                    onClick={() =>
                      t.strategyKey === "all"
                        ? onOpenStrategy("linkedin-search")
                        : onOpenStrategy(t.strategyKey)
                    }
                    className="text-ink-3 transition-colors hover:text-ink"
                  >
                    <ArrowRightSvg className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addTask();
              }}
              className="mt-2 flex flex-wrap items-center gap-2 rounded-[1rem] bg-canvas p-3"
            >
              <input
                type="text"
                value={newTaskTime}
                onChange={(e) => setNewTaskTime(e.target.value)}
                aria-label="Time"
                className="w-16 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-small text-ink outline-none focus:border-brand"
              />
              <input
                type="text"
                autoFocus
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                placeholder="Add a step to today's plan…"
                className="min-w-[12rem] flex-1 rounded-sm border border-border bg-surface px-3 py-1.5 text-small text-ink outline-none focus:border-brand"
              />
              <button type="submit" className="h-9 rounded-full bg-ink px-4 text-small font-medium text-white">
                Add
              </button>
            </form>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={startPrimary}
              className="flex h-11 items-center justify-center rounded-full bg-ink px-5.5 text-[max(0.9375rem,13px)] font-medium text-white transition-colors hover:bg-black"
            >
              {primaryLabel}
            </button>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="flex h-11 items-center justify-center rounded-full border border-border-strong bg-surface px-5.5 text-[max(0.9375rem,13px)] font-medium text-ink transition-colors hover:bg-surface-2"
            >
              {editing ? "Done editing" : "Change something"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 10. ALL 15 STRATEGIES FULL-BOARD GRID (Figma 1:1788)
// ============================================================================
export function AllStrategiesGrid({
  items,
  jobSampleTitle,
  onBack,
  onPickStrategy,
}: {
  items: StrategyItem[];
  jobSampleTitle: string;
  onBack: () => void;
  onPickStrategy: (key: StrategyKey) => void;
}) {
  const [filter, setFilter] = useState<"all" | "assigned" | "done">("all");

  const assignedByKey = new Map(items.map((i) => [i.key, i]));
  const onPositionCount = STRATEGY_CATALOG.filter((c) => assignedByKey.has(c.key)).length;
  const doneCount = STRATEGY_CATALOG.filter((c) => assignedByKey.get(c.key)?.status === "done").length;

  const cards = STRATEGY_CATALOG.filter((c) => {
    const a = assignedByKey.get(c.key);
    if (filter === "assigned") return Boolean(a);
    if (filter === "done") return a?.status === "done";
    return true;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[max(1.25rem,12px)] px-[max(2.3125rem,16px)] pb-[max(1.75rem,14px)] pt-[max(2.5rem,18px)]">
      {/* Header row (Figma 1:1799) */}
      <header className="flex shrink-0 flex-wrap items-center gap-3">
        <BackButton onClick={onBack} label="Back to your strategies" />
        <div className="flex items-baseline gap-2 pl-2">
          <span className="text-h2 font-normal text-ink">15</span>
          <span className="text-small text-ink-2">strategies in the planner</span>
        </div>

        <div className="ml-2 flex flex-wrap items-center gap-1" role="tablist" aria-label="Filter strategies">
          {[
            { id: "all" as const, label: `All · 15` },
            { id: "assigned" as const, label: `On this position · ${onPositionCount}` },
            { id: "done" as const, label: `Done · ${doneCount}` },
          ].map((tab) => {
            const on = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(tab.id)}
                className={
                  "flex h-9.5 items-center rounded-full px-3.75 text-small transition-colors " +
                  (on ? "bg-ink font-medium text-white" : "text-ink-2 hover:bg-surface-2 hover:text-ink")
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <span className="ml-auto hidden h-9.5 max-w-[26rem] items-center truncate rounded-full bg-surface-2 px-4 text-[max(0.8125rem,12px)] text-ink-2 lg:inline-flex">
          <LiveName field="title" sample={jobSampleTitle} />
        </span>
      </header>

      {/* AURA recommendation row (Figma 1:1814) */}
      <div className="flex shrink-0 items-center gap-3">
        <AuraMark />
        <p className="text-body font-medium text-ink">
          For roles like this, LinkedIn Search and Direct Headhunt work best. Start there.
        </p>
      </div>

      {/* 5-column × 3-row grid (Figma 1:1817) */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cards.map((c) => {
            const assigned = assignedByKey.get(c.key);
            const tagText = assigned ? assigned.tagLabel : "Not on this position";
            const tagTone = assigned
              ? assigned.status === "done"
                ? "neutral"
                : tagToneFor(assigned)
              : "white";
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onPickStrategy(c.key)}
                className={
                  "flex min-h-[11.625rem] flex-col gap-2 rounded-[1.5rem] bg-canvas p-4.5 text-left transition-colors hover:bg-surface-2 " +
                  (assigned ? "" : "opacity-72")
                }
              >
                <div className="flex w-full items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-[max(0.8125rem,12px)] font-medium text-ink">
                    {c.number}
                  </span>
                  <span className="ml-auto">
                    <Tag tone={tagTone}>{tagText}</Tag>
                  </span>
                </div>
                <p className="text-body font-medium leading-snug text-ink">{c.title}</p>
                <p className="text-[max(0.8125rem,12px)] leading-[1.45] text-ink-2">{c.description}</p>
                <p
                  className={
                    "mt-auto pt-2 text-caption " +
                    (c.highlightFooter ? "font-medium text-brand" : "text-ink-3")
                  }
                >
                  {c.footer}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
