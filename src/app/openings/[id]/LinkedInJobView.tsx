"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { DUR, EASE, gsap, useExit, useGSAP, useSwap } from "@/lib/gsap";
import { USER } from "@/lib/user";
import { useWorkdayGate } from "@/lib/workday";
import { BackButton } from "./PipelineBoard";
import Toast from "./Toast";
import WorkdayBlocked from "./WorkdayBlocked";

// Placeholder: the posts and applicants from the design, until this view reads the
// backend. With it, each post reads its own first page of applicants for the open
// tab; `more` is the stored number of applicants not on that page (the design shows
// 14 new but four rows), never a count of rows.
type Tab = "new" | "shortlisted" | "notfit";
type Applicant = { id: string; name: string; title: string; location: string; company: string; applied: string; fit: number };
type Post = {
  id: string;
  title: string;
  also: string;
  city: string;
  owner: string;
  link: string;
  link2?: string;
  live: boolean;
  more: Record<Tab, number>;
  applicants: Record<Tab, Applicant[]>;
};

const NEW: Applicant[] = [
  { id: "a1", name: "Kasun Perera", title: "SAP S/4HANA Lead", location: "Colombo", company: "Virtusa", applied: "Applied 2 h ago", fit: 92 },
  { id: "a2", name: "Ishara Silva", title: "SAP Solution Architect", location: "Colombo", company: "Virtusa", applied: "Applied 5 h ago", fit: 88 },
  { id: "a3", name: "Tharindu Jay", title: "SAP FICO Manager", location: "Katunayake", company: "Brandix", applied: "Applied yesterday", fit: 77 },
  { id: "a4", name: "Amal Gunasekara", title: "SAP Project Manager", location: "Colombo", company: "Hemas", applied: "Applied yesterday", fit: 74 },
];
const NONE = { new: [], shortlisted: [], notfit: [] };

const POSTS: Post[] = [
  {
    id: "p1",
    title: "SAP Transformation Lead",
    also: "SAP Lead, S/4 Lead",
    city: "Colombo",
    owner: "Chathura",
    link: "linkedin.com/jobs/view/38…",
    link2: "linkedin.com/jobs/view/38…",
    live: true,
    more: { new: 10, shortlisted: 6, notfit: 21 },
    applicants: { ...NONE, new: NEW },
  },
  {
    id: "p2",
    title: "Senior Manager — SAP (hybrid)",
    also: "SAP Senior Manager",
    city: "Colombo",
    owner: "Dinuka",
    link: "linkedin.com/jobs/view/41…",
    link2: "linkedin.com/jobs/view/41…",
    live: true,
    more: { new: 0, shortlisted: 0, notfit: 0 },
    applicants: { ...NONE, new: NEW.slice(0, 3).map((a) => ({ ...a, id: "b" + a.id })) },
  },
  {
    id: "p3",
    title: "ERP Programme Manager",
    also: "ERP PM",
    city: "Kandy",
    owner: "Chathura",
    link: "linkedin.com/jobs/view/29…",
    link2: "linkedin.com/jobs/view/29…",
    live: false,
    more: { new: 0, shortlisted: 0, notfit: 0 },
    applicants: NONE,
  },
];

const TABS: [Tab, string][] = [
  ["new", "New"],
  ["shortlisted", "Shortlisted"],
  ["notfit", "Not a fit"],
];

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

// Sizes, colours, corners and shadows from DESIGN.md (the frame, Figma 713:1385, was
// drawn on the same guidelines).
const BTN =
  "flex items-center gap-2 whitespace-nowrap rounded-full py-[max(0.625rem,7px)] pl-[max(1.25rem,14px)] pr-[max(1.375rem,15px)] text-small font-medium transition-colors";
const GHOST = BTN + " border border-border-strong bg-surface text-ink hover:bg-surface-2";
// Caption: the 12px chips (status, applicant counts) and the small labels.
const CAPTION = "text-caption font-medium";
const CHIP = CAPTION + " rounded-full px-[max(0.75rem,9px)] py-[max(0.25rem,3px)]";

const FADE_OUT = { opacity: 0 };

/** The Add a post popup (Figma 789:6080): a white card in the middle of a blurred
 *  window, three fields. Escape, Cancel or a click outside closes it; Enter or Add post
 *  saves (the design has no buttons, so these two are not from it). A post needs a name;
 *  the links are optional. */
function AddPostDialog({
  ref: root,
  onClose,
  onAdd,
}: {
  ref: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onAdd: (name: string, link: string, link2: string) => void;
}) {
  const [name, setName] = useState("");
  useGSAP(
    () => {
      gsap.from("[data-veil]", { opacity: 0, duration: DUR.fast });
      gsap.from("[data-box]", { opacity: 0, y: 14, scale: 0.94, duration: DUR.base, ease: EASE.pop });
    },
    { scope: root },
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  // On <body>, like the other overlays, so it sits above the view's own layer.
  return createPortal(
    <div ref={root} className="fixed inset-0 z-[80] flex items-center justify-center">
      <div data-veil className="absolute inset-0 bg-surface/20 backdrop-blur-[6px]" onClick={onClose} />
      <div
        data-box
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-post-title"
        className="relative w-[max(29rem,340px)] max-w-[calc(100vw-32px)] rounded-xl bg-surface px-[max(2.25rem,22px)] pb-[max(2.25rem,22px)] pt-[max(2rem,20px)] shadow-float"
      >
        <h2 id="add-post-title" className="flex items-center gap-1.5 text-small font-medium text-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="size-[max(1rem,14px)]" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add a post
        </h2>
        <form
          className="mt-[max(1.45rem,14px)] flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const text = (k: string) => String(f.get(k) ?? "").trim();
            if (text("name")) onAdd(text("name"), text("link"), text("link2"));
          }}
        >
          {(
            [
              ["name", "Job Name"],
              ["link", "Link 1"],
              ["link2", "Link 2"],
            ] as const
          ).map(([key, label]) => (
            <input
              key={key}
              name={key}
              autoFocus={key === "name"}
              onChange={key === "name" ? (e) => setName(e.target.value) : undefined}
              placeholder={label}
              aria-label={label}
              className="h-[max(2.375rem,46px)] rounded-full border border-brand/50 bg-surface px-[max(1.375rem,14px)] text-body text-ink outline-none placeholder:text-ink-3 focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          ))}
          <div className="mt-1 flex justify-end gap-3">
            <button type="button" onClick={onClose} className={GHOST}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className={BTN + " bg-brand text-white hover:bg-brand-strong disabled:opacity-40 disabled:hover:bg-brand"}
            >
              Add post
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

/** The LinkedIn Job view: the opening's posts on the left, the chosen post's
 *  applicants on the right, each to be shortlisted or marked not a fit. */
export default function LinkedInJobView() {
  const [adding, setAdding] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const dialogShown = useExit(adding, dialog, FADE_OUT);
  const [posts, setPosts] = useState(POSTS);
  const [chosen, setChosen] = useState(POSTS[0].id);
  const [tab, setTab] = useState<Tab>("new");
  const post = posts.find((p) => p.id === chosen) ?? posts[0];
  // The app's flow (as in Pipeline and Scoops): a TA works an applicant only after
  // Start workday, and a shortlist says where the person went.
  const gate = useWorkdayGate();
  const [notice, setNotice] = useState<{ bold: string; rest: string; n: number } | null>(null);
  // Another post or another tab: the app's one switch on the post's side.
  const side = useRef<HTMLElement>(null);
  useSwap(side, `${chosen}-${tab}`);
  const count = (p: Post, t: Tab) => p.applicants[t].length + p.more[t];

  // shortcut: the new post is not saved anywhere and takes the signed-in person as owner,
  // no city; save it and pick the city with the backend.
  const addPost = (title: string, link: string, link2: string) => {
    const id = `p${Date.now()}`;
    setPosts((all) => [
      { id, title, link, link2, also: "", city: "", owner: USER.name.split(" ")[0], live: true, more: { new: 0, shortlisted: 0, notfit: 0 }, applicants: NONE },
      ...all,
    ]);
    setChosen(id);
    setTab("new");
    setAdding(false);
  };

  const edit = (fn: (p: Post) => Post) => setPosts((all) => all.map((p) => (p.id === post.id ? fn(p) : p)));
  // An applicant leaves the New list for the tab it was sent to.
  const send = (a: Applicant, to: Tab) => {
    if (gate) return;
    edit((p) => ({
      ...p,
      applicants: { ...p.applicants, new: p.applicants.new.filter((x) => x.id !== a.id), [to]: [a, ...p.applicants[to]] },
    }));
    // In the TA System's words: a shortlist claims the person for this TA, gives the
    // set number and moves them to TA Follow-Up. Placeholder set until the backend.
    setNotice((n) => ({
      bold: a.name,
      rest: to === "shortlisted" ? " shortlisted as set 3 - moved to TA Follow-Up" : " marked not a fit",
      n: (n?.n ?? 0) + 1,
    }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-[max(2.3rem,14px)] pb-[max(2.5rem,12px)] pt-[max(2.8rem,40px)] max-md:overflow-y-auto max-md:pt-11">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,27.5rem)_minmax(0,1fr)] gap-x-[max(1.75rem,14px)] max-md:grid-cols-1 max-md:gap-y-6">
        {/* Posts */}
        <aside className="flex min-h-0 flex-col">
          <BackButton />
          <div className="mt-[max(1.3rem,12px)] flex items-center justify-between">
            <h3 className="text-h3 font-medium text-ink">Posts</h3>
            <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-small font-medium text-brand hover:opacity-70">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="size-[max(1rem,14px)]" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add a post
            </button>
          </div>
          <ul className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto [scrollbar-width:none]">
            {posts.map((p) => {
              const on = p.id === post.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-current={on ? "true" : undefined}
                    onClick={() => {
                      setChosen(p.id);
                      setTab("new");
                    }}
                    className={
                      "flex w-full flex-col items-start gap-2 rounded-md border-[1.5px] px-[max(1.25rem,12px)] py-4 text-left transition-colors " +
                      (on ? "border-brand bg-surface" : "border-transparent bg-canvas hover:bg-surface-2")
                    }
                  >
                    <span className="flex items-center gap-2.5 text-body font-medium text-ink">
                      <span aria-hidden="true" className={"size-2.5 shrink-0 rounded-full " + (p.live ? "bg-brand-leaf" : "bg-ink-3")} />
                      {p.title}
                    </span>
                    <span className="text-small text-ink-3">
                      {p.city && `${p.city} · `}posted by {p.owner}
                    </span>
                    <span className={CHIP + (p.live ? " bg-info-soft text-info" : " bg-surface-2 text-ink-2")}>
                      {p.live ? `${count(p, "new")} new applicants` : "Paused"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* The chosen post. Its left border is the design divider: it starts a little
            below the back arrow and ends above the card bottom edge. */}
        <section ref={side} className="mt-[max(0.7rem,0px)] flex min-h-0 flex-col gap-[max(1.25rem,12px)] border-l border-border pl-[max(1.875rem,14px)] max-md:mt-0 max-md:border-l-0 max-md:pl-0">
          {gate && <WorkdayBlocked what="shortlist applicants" />}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
            {/* The design's exported LinkedIn mark (public/linkedin-icon.svg). */}
            <Image src="/linkedin-icon.svg" alt="LinkedIn" width={21} height={21} className="size-[max(1.3125rem,18px)] shrink-0 object-contain" />
            <h3 className="text-h2 text-ink">{post.title}</h3>
            <span className={CHIP + (post.live ? " bg-success-soft text-success" : " bg-surface-2 text-ink-2")}>
              {post.live ? "Live" : "Paused"}
            </span>
            <div className="flex gap-3 sm:ml-auto">
              <button type="button" onClick={() => edit((p) => ({ ...p, live: !p.live }))} className={GHOST}>
                {post.live ? "Pause" : "Resume"}
              </button>
              {/* shortcut: Move CVs has no dialog designed yet, so it does nothing; wire it with that design. */}
              <button type="button" className={GHOST}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[max(1rem,14px)]" aria-hidden="true">
                  <path d="M17 3l4 4-4 4M21 7H8M7 21l-4-4 4-4M3 17h13" />
                </svg>
                Move CVs to another post
              </button>
            </div>
          </div>

          <dl className="flex flex-wrap gap-3.5">
            {[
              { label: "Link", value: post.link, wide: true },
              ...(post.link2 ? [{ label: "Link", value: post.link2, wide: true }] : []),
              { label: "Also known as", value: post.also, wide: false },
              { label: "City", value: post.city, wide: false },
              { label: "Owner", value: post.owner, wide: false },
            ]
              .filter((c) => c.value)
              .map(({ label, value, wide }, i) => (
              <div
                key={`${label}-${i}`}
                className={
                  "flex flex-col gap-1 rounded-md bg-canvas px-[max(1.25rem,14px)] py-[max(0.75rem,9px)] " +
                  (wide
                    ? "min-w-[max(13rem,180px)] flex-[2]"
                    : "min-w-[max(7rem,90px)] flex-1")
                }
              >
                <dt className={CAPTION + " text-ink-3"}>{label}</dt>
                <dd className="truncate text-small font-medium text-ink">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <div role="tablist" className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-h3 font-medium text-ink">Applicants</span>
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={
                  "rounded-full px-[max(0.875rem,11px)] py-[max(0.375rem,5px)] text-small transition-colors " +
                  (tab === key ? "bg-ink text-white" : "text-ink-2 hover:text-ink")
                }
              >
                {label} · {count(post, key)}
              </button>
            ))}
          </div>

          <ul className="min-h-0 flex-1 space-y-[max(1.25rem,10px)] overflow-y-auto pb-2 [scrollbar-width:none]">
            {post.applicants[tab].map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-x-[max(1.125rem,10px)] gap-y-3 rounded-md border border-border bg-surface px-[max(1.375rem,12px)] py-4 shadow-card"
              >
                <span className="flex size-[max(3rem,36px)] shrink-0 items-center justify-center rounded-full bg-info-soft text-body font-medium text-info">
                  {initials(a.name)}
                </span>
                {/* Fixed width, as in the design, so the L / C lines line up in every row. */}
                <div className="flex min-w-0 flex-col gap-0.5 max-md:flex-1 md:w-[max(16.25rem,170px)] md:shrink-0">
                  <p className="truncate text-h3 font-medium text-ink">{a.name}</p>
                  <p className="truncate text-small text-ink-2">{a.title}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1 text-small text-ink-2">
                  <p>L : {a.location}</p>
                  <p>C : {a.company}</p>
                </div>
                <div aria-hidden="true" className="min-w-px flex-1 max-md:hidden" />
                <span className={CAPTION + " text-ink-3"}>{a.applied}</span>
                <span
                  className={
                    "rounded-sm px-2.5 py-[3px] text-small font-medium " +
                    (a.fit >= 80 ? "bg-brand-soft text-brand" : "bg-surface-2 text-ink-2")
                  }
                >
                  {a.fit} fit
                </span>
                {tab === "new" && (
                  <>
                    <button type="button" disabled={!!gate} onClick={() => send(a, "notfit")} className={GHOST + " disabled:opacity-40"}>
                      Not a fit
                    </button>
                    <button type="button" disabled={!!gate} onClick={() => send(a, "shortlisted")} className={BTN + " bg-brand text-white hover:bg-brand-strong disabled:opacity-40"}>
                      Shortlist
                    </button>
                  </>
                )}
              </li>
            ))}
            {post.applicants[tab].length === 0 && (
              <li className="pt-8 text-center text-small text-ink-3">No applicants here.</li>
            )}
          </ul>
        </section>
      </div>
      {notice && <Toast key={notice.n} bold={notice.bold} rest={notice.rest} />}
      {dialogShown && <AddPostDialog ref={dialog} onClose={() => setAdding(false)} onAdd={addPost} />}
    </div>
  );
}
