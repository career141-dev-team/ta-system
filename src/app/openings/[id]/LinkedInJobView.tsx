"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Image from "next/image";
import { DUR, EASE, gsap, useExit, useGSAP, useSwap } from "@/lib/gsap";
import { useMe } from "@/lib/role";
import { useWorkdayGate } from "@/lib/workday";
import { BackButton } from "./PipelineBoard";
import MoveForm from "./MoveForm";
import { STAGES } from "./pipelineRules";
import Toast from "./Toast";
import { sendToPipeline } from "./pipelineInbox";
import { useJdApproved } from "./jdState";
import PillMenu from "./PillMenu";
import { EXPERIENCE, FIELD_PILL, NOTICE, inRange } from "./filters";
import WorkdayBlocked from "./WorkdayBlocked";
import { useLiftMenu } from "./liftMenu";

const CvPreview = dynamic(() => import("./CvPreview"), { ssr: false });

// The LinkedIn Job view (Figma 713:1385, built by a teammate) with the TA System's
// own rules for posts and applicants added on the owner's go (13 Nov 2026; the old
// page is openings/[id]/linkedin-job + components/PostManager.tsx):
//   - a post is Draft, Live, Paused or Closed; it goes live only once the opening's
//     job description is approved;
//   - each post has a Recruiter link (files applications to it) and a Public link
//     (sent to candidates), and says so when one is missing;
//   - LinkedIn, Meta campaign or Email campaign posts; a campaign has a short code;
//   - "All posts" is the one pool of applicants across every post;
//   - Not a fit needs a reason; another TA's applicant is locked;
//   - Move CVs only from a paused post with applicants, into a live one.
// Placeholder data; with the backend each post reads its own first page of
// applicants for the open tab, and `more` is the stored count not on that page.

type Tab = "new" | "shortlisted" | "notfit";
type Status = "draft" | "live" | "paused" | "closed";
type Channel = "linkedin" | "facebook" | "email_campaign";
type Applicant = {
  id: string;
  name: string;
  title: string;
  location: string;
  company: string;
  applied: string;
  fit: number;
  years: number;
  /** Notice period in days; 0 = can start now. */
  notice: number;
  /** The CV file (a demo PDF; made-up people). */
  cv?: string;
  lockedBy?: string;
};
type Post = {
  id: string;
  title: string;
  aliases: string[];
  city: string;
  country: string;
  owner: string;
  channel: Channel;
  code?: string;
  recruiterLink: string;
  publicLink: string;
  status: Status;
  /** CVs that reached this post today. */
  today: number;
  more: Record<Tab, number>;
  applicants: Record<Tab, Applicant[]>;
};

// Placeholders: whether the opening's job description is approved (a post goes live
// only after), the TAs a post can be given to, and the open set a shortlist joins.
const TEAM = ["Chathura", "Dinuka", "Hasini", "Nimal"];
const OPEN_SET = 3;

const NEW: Applicant[] = [
  // Names match the demo CV files in public/cvs, so a row opens its own CV.
  { id: "a1", name: "Kasun Perera", title: "SAP S/4HANA Lead", location: "Colombo", company: "Virtusa", applied: "Applied 2 h ago", fit: 92, years: 9, notice: 30, cv: "/cvs/s2.pdf" },
  { id: "a2", name: "Ishara Fernando", title: "SAP Solution Architect", location: "Colombo", company: "Virtusa", applied: "Applied 5 h ago", fit: 88, years: 11, notice: 60, cv: "/cvs/s3.pdf" },
  { id: "a3", name: "Tharindu Silva", title: "SAP FICO Manager", location: "Katunayake", company: "Brandix", applied: "Applied yesterday", fit: 77, years: 4, notice: 0, cv: "/cvs/s4.pdf", lockedBy: "Hasini" },
  { id: "a4", name: "Ruwan Bandara", title: "SAP Project Manager", location: "Colombo", company: "Hemas", applied: "Applied yesterday", fit: 74, years: 6, notice: 90, cv: "/cvs/s6.pdf" },
];
const NONE = (): Record<Tab, Applicant[]> => ({ new: [], shortlisted: [], notfit: [] });
const ZERO = (): Record<Tab, number> => ({ new: 0, shortlisted: 0, notfit: 0 });

const POSTS: Post[] = [
  {
    id: "p1", title: "SAP Transformation Lead", aliases: ["SAP Lead", "S/4 Lead"], city: "Colombo", country: "Sri Lanka", owner: "Chathura",
    channel: "linkedin", recruiterLink: "linkedin.com/talent/hire/1528413625", publicLink: "linkedin.com/jobs/view/3812345678",
    status: "live", today: 14, more: { new: 10, shortlisted: 6, notfit: 21 }, applicants: { ...NONE(), new: NEW },
  },
  {
    id: "p2", title: "Senior Manager — SAP (hybrid)", aliases: ["SAP Senior Manager"], city: "Colombo", country: "Sri Lanka", owner: "Dinuka",
    channel: "linkedin", recruiterLink: "linkedin.com/talent/hire/1529917402", publicLink: "",
    status: "live", today: 4, more: ZERO(), applicants: { ...NONE(), new: NEW.slice(0, 2).map((a) => ({ ...a, id: "b" + a.id, lockedBy: undefined })) },
  },
  {
    id: "p3", title: "ERP Programme Manager", aliases: ["ERP PM"], city: "Kandy", country: "Sri Lanka", owner: "Chathura",
    channel: "linkedin", recruiterLink: "", publicLink: "linkedin.com/jobs/view/2912345678",
    status: "paused", today: 0, more: { new: 3, shortlisted: 0, notfit: 2 }, applicants: NONE(),
  },
];

const TABS: [Tab, string][] = [
  ["new", "New"],
  ["shortlisted", "Shortlisted"],
  ["notfit", "Not a fit"],
];
const STATUS_LABEL: Record<Status, string> = { draft: "Draft", live: "Live", paused: "Paused", closed: "Closed" };
const CHANNEL_LABEL: Record<Channel, string> = { linkedin: "LinkedIn job", facebook: "Meta campaign (WhatsApp)", email_campaign: "Email campaign" };
const ALL = "all";

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

// Sizes, colours, corners and shadows from DESIGN.md.
const BTN =
  "flex items-center gap-2 whitespace-nowrap rounded-full py-[max(0.625rem,7px)] pl-[max(1.25rem,14px)] pr-[max(1.375rem,15px)] text-small font-medium transition-colors";
const GHOST = BTN + " border border-border-strong bg-surface text-ink hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-surface";
const CAPTION = "text-caption font-medium";
const CHIP = CAPTION + " rounded-full px-[max(0.75rem,9px)] py-[max(0.25rem,3px)]";
const FIELD =
  "h-[max(2.375rem,40px)] w-full rounded-full border border-brand/50 bg-surface px-[max(1.375rem,14px)] text-body text-ink outline-none placeholder:text-ink-3 focus:border-brand focus:ring-2 focus:ring-brand/15";

const DOT: Record<Status, string> = { live: "bg-brand-leaf", paused: "bg-warn", draft: "bg-ink-3", closed: "bg-border-strong" };
const STATUS_CHIP: Record<Status, string> = {
  live: "bg-success-soft text-success",
  paused: "bg-warn-soft text-warn",
  draft: "bg-surface-2 text-ink-2",
  closed: "bg-surface-2 text-ink-3",
};
const FADE_OUT = { opacity: 0 };

const count = (p: Post, t: Tab) => p.applicants[t].length + p.more[t];

/** The LinkedIn Job view: the opening's posts on the left, the chosen post's (or all
 *  posts') applicants on the right, each to be shortlisted or marked not a fit. */
export default function LinkedInJobView() {
  // A post goes live only with the JD approved: the opening's one flag (jdState).
  const JD_APPROVED = useJdApproved();
  const me = useMe();
  const [allPosts, setPosts] = useState(POSTS);
  // The TA System's visibility: a lead sees every post, a TA only the posts they own
  // (plus the All posts pool of those). Other TAs' claimed people still show, locked.
  const posts = allPosts.filter((p) => me.lead || p.owner === me.first);
  const canEdit = (p: Post) => me.lead || p.owner === me.first;
  const [chosen, setChosen] = useState<string>(POSTS[0].id);
  // Eight rows a tab; "Show N more" opens the rest, until the post or tab changes.
  const [fullKey, setFullKey] = useState("");
  const [tab, setTab] = useState<Tab>("new");
  const [editing, setEditing] = useState<Post | "new" | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const dialogShown = useExit(dialogOpen, dialog, FADE_OUT);
  // Not a fit asks for a reason first, in the Pipeline's own reason window.
  const [ask, setAsk] = useState<{ a: Applicant; postId: string } | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const askBox = useRef<HTMLDivElement>(null);
  const askShown = useExit(askOpen, askBox, FADE_OUT);
  const gate = useWorkdayGate();
  const [notice, setNotice] = useState<{ bold: string; rest: string; n: number; warn?: boolean } | null>(null);
  const say = (bold: string, rest: string, warn?: boolean) => setNotice((n) => ({ bold, rest, warn, n: (n?.n ?? 0) + 1 }));
  const side = useRef<HTMLElement>(null);
  useSwap(side, `${chosen}-${tab}`);
  // The TA System's list tools, as in Scoops: search and filters on Apply (or Enter),
  // tick several by their initials and Shortlist selected, a click reads the CV.
  const [draft, setDraft] = useState({ q: "", exp: "", notice: "" });
  const [applied, setApplied] = useState(draft);
  const [picked, setPicked] = useState<string[]>([]);
  const [reading, setReading] = useState<Applicant | null>(null);
  const [readingOpen, setReadingOpen] = useState(false);
  const cvBox = useRef<HTMLDivElement>(null);
  const readingShown = useExit(readingOpen, cvBox, FADE_OUT);

  const all = chosen === ALL;
  const post = all ? undefined : (posts.find((p) => p.id === chosen) ?? posts[0]);
  const listKey = `${chosen}-${tab}`;
  const live = posts.filter((p) => p.status === "live");
  // The applicants on show: one post's, or every post's together (one pool).
  const rows: { a: Applicant; postId: string; postTitle: string }[] = (all ? posts : post ? [post] : []).flatMap((p) =>
    p.applicants[tab].map((a) => ({ a, postId: p.id, postTitle: p.title })),
  );
  const q = applied.q.trim().toLowerCase();
  const shown = rows.filter(
    ({ a }) =>
      (!q || [a.name, a.title, a.company].some((t) => t.toLowerCase().includes(q))) && inRange(a.years, applied.exp) && inRange(a.notice, applied.notice),
  );
  const keyOf = (postId: string, a: Applicant) => postId + ":" + a.id;
  const free = (a: Applicant) => tab === "new" && !a.lockedBy && !gate;
  const pickable = shown.filter(({ a, postId }) => free(a) && picked.includes(keyOf(postId, a)));
  const tabCount = (t: Tab) => (all ? posts.reduce((n, p) => n + count(p, t), 0) : post ? count(post, t) : 0);

  const patch = (id: string, fn: (p: Post) => Post) => setPosts((list) => list.map((p) => (p.id === id ? fn(p) : p)));
  const choose = (id: string) => {
    setChosen(id);
    setTab("new");
  };

  // An applicant leaves New for the tab it was sent to. A shortlist claims the
  // person for this TA, gives the set number and moves them to TA Follow-Up.
  // A shortlisted applicant shows on the Pipeline board, in TA Follow-Up.
  const toBoard = (a: Applicant) =>
    sendToPipeline({ name: a.name, title: a.title, company: a.company, location: a.location, years: a.years, notice: a.notice, cv: a.cv, channel: "L" });
  const send = (a: Applicant, postId: string, to: Tab, reason?: string) => {
    if (gate) return;
    patch(postId, (p) => ({
      ...p,
      applicants: { ...p.applicants, new: p.applicants.new.filter((x) => x.id !== a.id), [to]: [a, ...p.applicants[to]] },
    }));
    setPicked((p) => p.filter((k) => k !== keyOf(postId, a)));
    if (to === "shortlisted") {
      toBoard(a);
      say(a.name, ` shortlisted as set ${OPEN_SET} - moved to TA Follow-Up`);
    } else say(a.name, ` marked not a fit: ${reason}`);
  };

  const shortlistPicked = () => {
    if (gate || !pickable.length) return;
    for (const { a, postId } of pickable) {
      toBoard(a);
      patch(postId, (p) => ({
        ...p,
        applicants: { ...p.applicants, new: p.applicants.new.filter((x) => x.id !== a.id), shortlisted: [a, ...p.applicants.shortlisted] },
      }));
    }
    setPicked([]);
    say(`${pickable.length} candidate${pickable.length === 1 ? "" : "s"}`, ` shortlisted as set ${OPEN_SET} - moved to TA Follow-Up`);
  };

  const setStatus = (p: Post, status: Status) => {
    if (status === "live" && !JD_APPROVED) return;
    patch(p.id, (x) => ({ ...x, status }));
    say(p.title, ` is ${STATUS_LABEL[status].toLowerCase()} now`);
  };
  const remove = (p: Post) => {
    setPosts((list) => list.filter((x) => x.id !== p.id));
    setChosen(ALL);
    say(p.title, " deleted");
  };
  // Move CVs: a paused post's applicants join a live post (the TA System's rule).
  const moveCvs = (from: Post, to: Post) => {
    const moved = (["new", "shortlisted", "notfit"] as Tab[]).reduce((n, t) => n + count(from, t), 0);
    setPosts((list) =>
      list.map((p) =>
        p.id === from.id
          ? { ...p, applicants: NONE(), more: ZERO() }
          : p.id === to.id
            ? {
                ...p,
                applicants: { new: [...p.applicants.new, ...from.applicants.new], shortlisted: [...p.applicants.shortlisted, ...from.applicants.shortlisted], notfit: [...p.applicants.notfit, ...from.applicants.notfit] },
                more: { new: p.more.new + from.more.new, shortlisted: p.more.shortlisted + from.more.shortlisted, notfit: p.more.notfit + from.more.notfit },
              }
            : p,
      ),
    );
    say(`${moved} CV${moved === 1 ? "" : "s"}`, ` moved from ${from.title} to ${to.title}`);
  };

  const savePost = (p: Post, isNew: boolean) => {
    if (isNew) {
      setPosts((list) => [p, ...list]);
      choose(p.id);
    } else patch(p.id, () => p);
    setDialogOpen(false);
    say(p.title, isNew ? " added" : " saved");
  };
  const openDialog = (p: Post | "new") => {
    setEditing(p);
    setDialogOpen(true);
  };

  const waiting = posts.reduce((n, p) => n + count(p, "new"), 0);
  const todayAll = live.reduce((n, p) => n + p.today, 0);
  const rejected = STAGES.find((s) => s.name === "Rejected")!;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-[max(2.3rem,14px)] pb-[max(2.5rem,12px)] pt-[max(2.8rem,40px)] short:pt-[30px] max-md:overflow-y-auto max-md:pt-11">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,27.5rem)_minmax(0,1fr)] gap-x-[max(1.75rem,14px)] max-md:grid-cols-1 max-md:gap-y-6">
        {/* Posts */}
        <aside className="flex min-h-0 flex-col">
          <BackButton />
          <div className="mt-[max(1.3rem,12px)] flex items-center justify-between">
            <h3 className="text-h3 font-medium text-ink">Posts</h3>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => openDialog("new")} className="flex items-center gap-1.5 text-small font-medium text-brand hover:opacity-70">
                <PlusIcon /> Add a post
              </button>
              <SubjectTester posts={posts} />
            </span>
          </div>
          {/* The opening's numbers in one quiet line. */}
          {posts.length > 0 && (
            <p className="mt-1 text-caption text-ink-3">
              {live.length} live · {todayAll} CVs today · {waiting} waiting
            </p>
          )}
          <ul className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto [scrollbar-width:none]">
            {posts.length === 0 && (
              <li className="rounded-md border border-warn/30 bg-warn-soft px-[max(1.25rem,12px)] py-4">
                <p className="text-small font-medium text-warn">No post yet</p>
                <p className="mt-1 text-small text-ink-2">LinkedIn applications cannot reach this opening until it has a post with the title exactly as it reads on LinkedIn.</p>
                <button type="button" onClick={() => openDialog("new")} className={BTN + " mt-3 bg-brand text-white hover:bg-brand-strong"}>
                  <PlusIcon /> Add a post
                </button>
              </li>
            )}
            {posts.length > 1 && (
              <li>
                <PostCard on={all} onClick={() => choose(ALL)} dot="bg-ink" title="All posts" sub="Every applicant, one pool" chip={`${waiting} new applicants`} chipClass="bg-info-soft text-info" />
              </li>
            )}
            {posts.map((p) => (
              <li key={p.id}>
                <PostCard
                  on={!all && p.id === post?.id}
                  onClick={() => choose(p.id)}
                  dot={DOT[p.status]}
                  title={p.title}
                  sub={`${p.city ? `${p.city} · ` : ""}posted by ${p.owner}`}
                  chip={p.status === "live" ? `${count(p, "new")} new applicants` : STATUS_LABEL[p.status]}
                  chipClass={p.status === "live" ? "bg-info-soft text-info" : STATUS_CHIP[p.status]}
                  extra={
                    p.status === "live" && (
                      // Under ten CVs today on a live post is worth a look (the TA System's red).
                      <span className={CAPTION + (p.today < 10 ? " text-danger" : " text-ink-3")}>{p.today} today</span>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </aside>

        {/* The chosen post (or all posts). Its left border is the design's divider. */}
        <section ref={side} className="mt-[max(0.7rem,0px)] flex min-h-0 flex-col gap-[max(1.25rem,12px)] short:overflow-y-auto short:[scrollbar-width:thin] border-l border-border pl-[max(1.875rem,14px)] max-md:mt-0 max-md:border-l-0 max-md:pl-0">
          {gate && <WorkdayBlocked what="shortlist applicants" />}
          {post ? (
            <PostHeader
              post={post}
              live={live}
              canEdit={canEdit(post)}
              onStatus={(s) => setStatus(post, s)}
              onEdit={() => openDialog(post)}
              onDelete={() => remove(post)}
              onMove={(to) => moveCvs(post, to)}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-h2 text-ink">All posts</h3>
              <span className={CHIP + " bg-surface-2 text-ink-2"}>
                {live.length} live of {posts.length}
              </span>
            </div>
          )}

          <div role="tablist" className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-h3 font-medium text-ink">Applicants</span>
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={"rounded-full px-[max(0.875rem,11px)] py-[max(0.375rem,5px)] text-small transition-colors " + (tab === key ? "bg-ink text-white" : "text-ink-2 hover:text-ink")}
              >
                {label} · {tabCount(key)}
              </button>
            ))}
          </div>

          <div className="relative z-20 flex flex-wrap items-center gap-x-[max(0.9rem,8px)] gap-y-2">
            <label className={FIELD_PILL + " w-[max(16rem,160px)] text-ink-3 max-md:w-full has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand/30"}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-[1.1em] shrink-0" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={draft.q}
                onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && setApplied(draft)}
                placeholder="Search by name, title or company"
                aria-label="Search the applicants"
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
              />
            </label>
            <PillMenu options={EXPERIENCE} initial="" onChange={(exp) => setDraft((d) => ({ ...d, exp }))} mark="tick" pillClass={FIELD_PILL + " text-ink-2"} />
            <PillMenu options={NOTICE} initial="" onChange={(notice) => setDraft((d) => ({ ...d, notice }))} mark="tick" pillClass={FIELD_PILL + " text-ink-2"} />
            <button type="button" onClick={() => setApplied(draft)} className="h-[max(2.6rem,34px)] rounded-full border-[1.5px] border-brand px-[max(1.2rem,13px)] text-small font-medium text-brand transition-colors hover:bg-brand hover:text-white">
              Apply
            </button>
            <span className="text-small text-ink-3">{shown.length} shown</span>
            {tab === "new" && (
              <button
                type="button"
                disabled={!pickable.length}
                onClick={shortlistPicked}
                title={pickable.length ? undefined : "Tick people by their initials first"}
                className="ml-auto h-[max(2.6rem,34px)] rounded-full border border-border-strong bg-surface px-[max(1.2rem,13px)] text-small font-medium text-ink transition-colors hover:border-brand hover:bg-brand hover:text-white disabled:pointer-events-none disabled:opacity-50"
              >
                Shortlist selected{pickable.length ? ` (${pickable.length})` : ""}
              </button>
            )}
          </div>

          <ul className="min-h-0 flex-1 space-y-[max(1.25rem,10px)] overflow-y-auto pb-2 [scrollbar-width:none] short:flex-none short:overflow-visible">
            {(fullKey === listKey ? shown : shown.slice(0, 8)).map(({ a, postId, postTitle }) => (
              <li key={postId + a.id} className="flex flex-wrap items-center gap-x-[max(1.125rem,10px)] gap-y-3 rounded-md border border-border bg-surface px-[max(1.375rem,12px)] py-4 shadow-card">
                {/* The initials tick the row for Shortlist selected (as in Scoops). */}
                <button
                  type="button"
                  disabled={!free(a)}
                  aria-pressed={picked.includes(keyOf(postId, a))}
                  aria-label={`Select ${a.name}`}
                  onClick={() => setPicked((p) => (p.includes(keyOf(postId, a)) ? p.filter((k) => k !== keyOf(postId, a)) : [...p, keyOf(postId, a)]))}
                  className={
                    "flex size-[max(3rem,36px)] shrink-0 items-center justify-center rounded-full text-body font-medium transition-colors disabled:cursor-default " +
                    (picked.includes(keyOf(postId, a)) && free(a) ? "bg-brand text-white" : "bg-info-soft text-info enabled:hover:bg-info/20")
                  }
                >
                  {picked.includes(keyOf(postId, a)) && free(a) ? <Tick /> : initials(a.name)}
                </button>
                {/* The name opens the CV, with Download in its corner. */}
                <button
                  type="button"
                  onClick={() => {
                    setReading(a);
                    setReadingOpen(true);
                  }}
                  title="Read the CV"
                  className="flex min-w-0 flex-col gap-0.5 text-left max-md:flex-1 md:w-[max(16.25rem,170px)] md:shrink-0"
                >
                  <span className="block truncate text-h3 font-medium text-ink hover:text-brand">{a.name}</span>
                  <span className="block truncate text-small text-ink-2">{a.title}</span>
                </button>
                <div className="flex shrink-0 flex-col gap-1 text-small text-ink-2">
                  <p>L : {a.location}</p>
                  <p>C : {a.company}</p>
                </div>
                <div aria-hidden="true" className="min-w-px flex-1 max-md:hidden" />
                <span className={CAPTION + " text-ink-3"}>
                  {a.applied}
                  {all && <span className="block">via {postTitle}</span>}
                </span>
                <span className={"rounded-sm px-2.5 py-[3px] text-small font-medium " + (a.fit >= 80 ? "bg-brand-soft text-brand" : "bg-surface-2 text-ink-2")}>{a.fit} fit</span>
                {tab === "new" &&
                  (a.lockedBy ? (
                    // Another TA got there first: the TA System's collision lock.
                    <span className={CHIP + " bg-warn-soft text-warn"}>Shortlisted by {a.lockedBy}</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={!!gate}
                        onClick={() => {
                          setAsk({ a, postId });
                          setAskOpen(true);
                        }}
                        className={GHOST}
                      >
                        Not a fit
                      </button>
                      <button type="button" disabled={!!gate} onClick={() => send(a, postId, "shortlisted")} className={BTN + " bg-brand text-white hover:bg-brand-strong disabled:opacity-40"}>
                        Shortlist
                      </button>
                    </>
                  ))}
              </li>
            ))}
            {fullKey !== listKey && shown.length > 8 && (
              <li className="flex justify-center">
                <button type="button" onClick={() => setFullKey(listKey)} className={GHOST}>
                  Show {shown.length - 8} more
                </button>
              </li>
            )}
            {shown.length === 0 && <li className="pt-8 text-center text-small text-ink-3">{rows.length ? "No applicant matches these filters." : "No applicants here."}</li>}
          </ul>
        </section>
      </div>

      {notice && <Toast key={notice.n} bold={notice.bold} rest={notice.rest} warn={notice.warn} />}
      {readingShown && reading && <CvPreview ref={cvBox} name={reading.name} title={reading.title} src={reading.cv} onClose={() => setReadingOpen(false)} />}
      {dialogShown && editing && <PostDialog ref={dialog} post={editing === "new" ? null : editing} titles={allPosts.filter((p) => editing === "new" || p.id !== editing.id).map((p) => p.title.toLowerCase())} onClose={() => setDialogOpen(false)} onSave={savePost} />}
      {askShown && ask && (
        <MoveForm
          ref={askBox}
          ask={{ needs: "reason", name: ask.a.name, from: "New", to: rejected }}
          onCancel={() => setAskOpen(false)}
          onSave={(reason) => {
            setAskOpen(false);
            send(ask.a, ask.postId, "notfit", reason);
          }}
        />
      )}
    </div>
  );
}

/** One card in the Posts list (the design's card, with a status dot). */
function PostCard({ on, onClick, dot, title, sub, chip, chipClass, extra }: { on: boolean; onClick: () => void; dot: string; title: string; sub: string; chip: string; chipClass: string; extra?: ReactNode }) {
  return (
    <button
      type="button"
      aria-current={on ? "true" : undefined}
      onClick={onClick}
      className={"flex w-full flex-col items-start gap-2 rounded-md border-[1.5px] px-[max(1.25rem,12px)] py-4 text-left transition-colors " + (on ? "border-brand bg-surface" : "border-transparent bg-canvas hover:bg-surface-2")}
    >
      <span className="flex items-center gap-2.5 text-body font-medium text-ink">
        <span aria-hidden="true" className={"size-2.5 shrink-0 rounded-full " + dot} />
        {title}
      </span>
      <span className="text-small text-ink-3">{sub}</span>
      <span className="flex items-center gap-2">
        <span className={CHIP + " " + chipClass}>{chip}</span>
        {extra}
      </span>
    </button>
  );
}

/** The chosen post's header: name and status, the status button, Move CVs (with its
 *  rule), the ⋯ menu (Edit, Close, Delete), and the post's details below. */
function PostHeader({
  post,
  live,
  canEdit,
  onStatus,
  onEdit,
  onDelete,
  onMove,
}: {
  post: Post;
  live: Post[];
  canEdit: boolean;
  onStatus: (s: Status) => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (to: Post) => void;
}) {
  const applicants = (["new", "shortlisted", "notfit"] as Tab[]).reduce((n, t) => n + count(post, t), 0);
  const targets = live.filter((p) => p.id !== post.id);
  // The TA System's rule: CVs move only from a paused post that has them, into a live post.
  const noRights = canEdit ? "" : `Only ${post.owner} or a TA Lead can change this post`;
  const moveWhy =
    noRights ||
    (post.status !== "paused" ? "Pause this post first" : !applicants ? "This post has no CVs to move" : !targets.length ? "There is no live post to move them to" : "");
  const toLive = post.status !== "live";
  const JD_APPROVED = useJdApproved();
  const liveWhy = toLive && !JD_APPROVED ? "The job description is not approved yet" : "";
  const statusWhy = noRights || liveWhy;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        {post.channel === "linkedin" ? (
          <Image src="/li.svg" alt="LinkedIn" width={21} height={21} className="size-[max(1.3125rem,18px)] shrink-0 object-contain" />
        ) : (
          <span className={CHIP + " bg-violet-soft text-violet"}>{post.channel === "facebook" ? "Meta" : "Email"}</span>
        )}
        <h3 className="text-h2 text-ink">{post.title}</h3>
        <span className={CHIP + " " + STATUS_CHIP[post.status]}>{STATUS_LABEL[post.status]}</span>
        <div className="flex gap-3 sm:ml-auto">
          <button type="button" disabled={!!statusWhy} title={statusWhy || undefined} onClick={() => onStatus(toLive ? "live" : "paused")} className={GHOST}>
            {post.status === "live" ? "Pause" : post.status === "closed" ? "Reopen" : post.status === "draft" ? "Go live" : "Resume"}
          </button>
          <MoveCvs why={moveWhy} targets={targets} onMove={onMove} />
          {canEdit && <PostMenu post={post} onEdit={onEdit} onClose={() => onStatus("closed")} onDelete={onDelete} />}
        </div>
      </div>
      {noRights ? (
        <p className="-mt-1 text-small text-ink-3">{noRights}.</p>
      ) : (
        liveWhy && <p className="-mt-1 text-small text-warn">{liveWhy}, so this post cannot go live.</p>
      )}

      <dl className="flex flex-wrap gap-3.5">
        <Detail label="Recruiter link" value={post.recruiterLink} link wide missing={post.channel === "linkedin" ? "No recruiter link · CVs may go to the wrong job" : undefined} />
        {post.channel === "linkedin" && <Detail label="Public link" value={post.publicLink} link wide missing="No public link · candidates get no link on WhatsApp" />}
        {post.code && <Detail label={post.channel === "facebook" ? "Meta campaign code" : "Email campaign code"} value={post.code} />}
        <Detail label="Also known as" value={post.aliases.join(", ")} />
        <Detail label="City" value={[post.city, post.country].filter(Boolean).join(", ")} />
        <Detail label="Owner" value={post.owner} />
      </dl>
    </>
  );
}

/** One detail chip; a missing link that matters shows as an amber warning instead. */
function Detail({ label, value, wide, missing, link }: { label: string; value: string; wide?: boolean; missing?: string; link?: boolean }) {
  if (!value && !missing) return null;
  return (
    <div
      className={
        "flex flex-col gap-1 rounded-md px-[max(1.25rem,14px)] py-[max(0.75rem,9px)] " +
        (value ? "bg-canvas " : "bg-warn-soft ") +
        (wide ? "min-w-[max(13rem,180px)] flex-[2]" : "min-w-[max(7rem,90px)] flex-1")
      }
    >
      <dt className={CAPTION + (value ? " text-ink-3" : " text-warn")}>{label}</dt>
      <dd className={"truncate text-small font-medium " + (value ? "text-ink" : "text-warn")}>{value && link ? (
          <a href={/^https?:\/\//i.test(value) ? value : "https://" + value} target="_blank" rel="noreferrer" className="hover:text-brand hover:underline">
            {value}
          </a>
        ) : (
          value || missing
        )}
      </dd>
    </div>
  );
}

/** A small menu that lifts open under its button (the app's lift): outside press or
 *  Escape closes it. */

const MENU = "absolute right-0 top-full z-30 mt-2 min-w-[max(14rem,180px)] rounded-md border border-border bg-surface p-1.5 shadow-float";
const ITEM = "flex w-full items-center rounded-sm px-3 py-2 text-left text-small text-ink hover:bg-surface-2";

/** Move CVs to another post: the design's button, opening the live posts to move into. */
function MoveCvs({ why, targets, onMove }: { why: string; targets: Post[]; onMove: (to: Post) => void }) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  return (
    <div ref={root} className="relative">
      <button type="button" disabled={!!why} title={why || undefined} aria-expanded={open} onClick={() => setOpen((o) => !o)} className={GHOST}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[max(1rem,14px)]" aria-hidden="true">
          <path d="M17 3l4 4-4 4M21 7H8M7 21l-4-4 4-4M3 17h13" />
        </svg>
        Move CVs to another post
      </button>
      {shown && (
        <div ref={panel} role="menu" className={MENU}>
          <p className="px-3 pb-1 pt-1.5 text-caption font-medium uppercase text-ink-3">Move into</p>
          {targets.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onMove(t);
              }}
              className={ITEM}
            >
              {t.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The post's ⋯ menu: Edit, Close, Delete (Delete asks once more). */
function PostMenu({ post, onEdit, onClose, onDelete }: { post: Post; onEdit: () => void; onClose: () => void; onDelete: () => void }) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const [sure, setSure] = useState(false);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="More for this post"
        aria-expanded={open}
        onClick={() => {
          setSure(false);
          setOpen((o) => !o);
        }}
        className="flex size-[max(2.6rem,36px)] items-center justify-center rounded-full border border-border-strong bg-surface text-ink hover:bg-surface-2"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-[1.1em]" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {shown && (
        <div ref={panel} role="menu" className={MENU}>
          <button type="button" role="menuitem" onClick={pick(onEdit)} className={ITEM}>
            Edit post
          </button>
          {post.status !== "closed" && (
            <button type="button" role="menuitem" onClick={pick(onClose)} className={ITEM}>
              Close post
            </button>
          )}
          <button type="button" role="menuitem" onClick={sure ? pick(onDelete) : () => setSure(true)} className={ITEM + " text-danger"}>
            {sure ? "Click again to delete · candidates stay on the opening" : "Delete post"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Add a post (the design's popup, Figma 789:6080) and Edit post, one window: the
 *  title candidates see, where it is posted and whether it is live now (new posts),
 *  the two links, other names, city, country and the recruiter. */
function PostDialog({ ref: root, post, titles, onClose, onSave }: { ref: RefObject<HTMLDivElement | null>; post: Post | null; titles: string[]; onClose: () => void; onSave: (p: Post, isNew: boolean) => void }) {
  const isNew = !post;
  const me = useMe();
  const JD_APPROVED = useJdApproved();
  const [title, setTitle] = useState(post?.title ?? "");
  const [channel, setChannel] = useState<Channel>(post?.channel ?? "linkedin");
  const [liveNow, setLiveNow] = useState(JD_APPROVED);
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

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    if (!title.trim()) return;
    // The TA System's checks, said by the browser on the field itself.
    const form = e.currentTarget;
    const check = (name: string, why: string) => (form.elements.namedItem(name) as HTMLInputElement | null)?.setCustomValidity(why);
    const isUrl = (s: string) => {
      try {
        return new URL(/^https?:\/\//i.test(s) ? s : "https://" + s).hostname.includes(".");
      } catch {
        return false;
      }
    };
    check("title", titles.includes(title.trim().toLowerCase()) ? "This opening already has a post with this title" : "");
    check("recruiterLink", v("recruiterLink") && !isUrl(v("recruiterLink")) ? "That is not a link" : "");
    check("publicLink", v("publicLink") && !/^(https?:\/\/)?(www\.)?linkedin\.com\/jobs\/view\/\S+/i.test(v("publicLink")) ? "A public link looks like linkedin.com/jobs/view/…" : "");
    if (!form.reportValidity()) return;
    const base: Post = post ?? {
      id: `p${Date.now()}`, title: "", aliases: [], city: "", country: "", owner: me.first, channel, recruiterLink: "", publicLink: "",
      status: liveNow ? "live" : "draft", today: 0, more: ZERO(), applicants: NONE(),
      // A campaign post is found by its code (the TA System makes one when it is created).
      code: channel === "linkedin" ? undefined : "C141-" + Date.now().toString(36).slice(-4).toUpperCase(),
    };
    onSave(
      {
        ...base,
        title: title.trim(),
        recruiterLink: v("recruiterLink"),
        publicLink: v("publicLink"),
        // A renamed post keeps its old title as a matching name, as the TA System
        // does: applications still arrive under the title people saw.
        aliases: [
          ...new Set([
            ...v("aliases").split(",").map((s) => s.trim()).filter(Boolean),
            ...(post && post.title && post.title !== title.trim() ? [post.title] : []),
          ]),
        ],
        city: v("city"),
        country: v("country"),
        owner: (me.lead && v("owner")) || base.owner,
      },
      isNew,
    );
  };

  const field = (name: string, label: string, value = "", placeholder = label) => (
    <label className="block">
      <span className={CAPTION + " mb-1 block pl-3 text-ink-3"}>{label}</span>
      <input name={name} defaultValue={value} onInput={(e) => e.currentTarget.setCustomValidity("")} placeholder={placeholder} aria-label={label} className={FIELD} />
    </label>
  );

  return createPortal(
    <div ref={root} className="fixed inset-0 z-[80] flex items-center justify-center">
      <div data-veil className="absolute inset-0 bg-surface/20 backdrop-blur-[6px]" onClick={onClose} />
      <div
        data-box
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-title"
        className="relative max-h-[calc(100dvh-32px)] w-[max(32rem,340px)] max-w-[calc(100vw-32px)] overflow-y-auto rounded-xl bg-surface px-[max(2.25rem,22px)] pb-[max(2.25rem,22px)] pt-[max(2rem,20px)] shadow-float"
      >
        <h2 id="post-title" className="flex items-center gap-1.5 text-small font-medium text-brand">
          {isNew && <PlusIcon />}
          {isNew ? "Add a post" : "Edit post"}
        </h2>
        <form className="mt-[max(1.2rem,12px)] flex flex-col gap-3.5" onSubmit={submit}>
          <label className="block">
            <span className={CAPTION + " mb-1 block pl-3 text-ink-3"}>Title candidates will see</span>
            <input autoFocus name="title" value={title} onChange={(e) => (e.target.setCustomValidity(""), setTitle(e.target.value))} placeholder="Job Name" aria-label="Job Name" className={FIELD} />
          </label>
          {isNew && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block min-w-[12rem] flex-1">
                <span className={CAPTION + " mb-1 block pl-3 text-ink-3"}>Where it is posted</span>
                <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className={FIELD + " cursor-pointer"}>
                  {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => (
                    <option key={c} value={c}>
                      {CHANNEL_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={"flex h-[max(2.375rem,40px)] items-center gap-2 text-small " + (JD_APPROVED ? "text-ink" : "text-ink-3")} title={JD_APPROVED ? undefined : "The job description is not approved yet"}>
                <input type="checkbox" checked={liveNow} disabled={!JD_APPROVED} onChange={(e) => setLiveNow(e.target.checked)} className="size-4 accent-brand" />
                It is live now
              </label>
            </div>
          )}
          {channel === "linkedin" ? (
            <>
              {field("recruiterLink", "Recruiter link · files applications to this post", post?.recruiterLink, "linkedin.com/talent/hire/…")}
              {field("publicLink", "Public link · sent to candidates", post?.publicLink, "linkedin.com/jobs/view/…")}
            </>
          ) : (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-caption text-ink-2">
              {isNew ? "A short code is made when the post is created." : `Code ${post?.code}.`}{" "}
              {channel === "facebook" ? "Put it in the ad's pre-filled WhatsApp message." : "Ask applicants to put it in the email subject."}
            </p>
          )}
          {field("aliases", "Also known as · old or boosted titles, comma between", post?.aliases.join(", "), "SAP Lead, S/4 Lead")}
          <div className="grid grid-cols-2 gap-3">
            {field("city", "City", post?.city, "Colombo")}
            {field("country", "Country", post?.country, "Sri Lanka")}
          </div>
          <label className="block">
            <span className={CAPTION + " mb-1 block pl-3 text-ink-3"}>Recruiter</span>
            <select name="owner" defaultValue={post?.owner ?? me.first} disabled={!me.lead} title={me.lead ? undefined : "Only a TA Lead can give a post to another TA"} className={FIELD + " cursor-pointer"}>
              {TEAM.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <div className="mt-1 flex justify-end gap-3">
            <button type="button" onClick={onClose} className={GHOST}>
              Cancel
            </button>
            <button type="submit" disabled={!title.trim()} className={BTN + " bg-brand text-white hover:bg-brand-strong disabled:opacity-40 disabled:hover:bg-brand"}>
              {isNew ? "Add post" : "Save post"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

/** Which post would an application email go to? The TA System files it by the
 *  LinkedIn job's number, then the title, then the other names, then a campaign's
 *  code. A small check behind the Posts ⋯ button (the old "Test a subject"). */
function routeOf(subject: string, posts: Post[]) {
  const s = subject.toLowerCase();
  const live = posts.filter((p) => p.status === "live");
  const num = (link: string) => link.match(/\d{6,}/)?.[0];
  for (const p of live) {
    const n = num(p.recruiterLink);
    if (n && s.includes(n)) return { post: p, why: "its Recruiter link's number" };
  }
  for (const p of live) if (p.code && s.includes(p.code.toLowerCase())) return { post: p, why: "its campaign code" };
  for (const p of live) if (s.includes(p.title.toLowerCase())) return { post: p, why: "its title" };
  for (const p of live) {
    const alias = p.aliases.find((x) => s.includes(x.toLowerCase()));
    if (alias) return { post: p, why: `the other name "${alias}"` };
  }
  return null;
}

function SubjectTester({ posts }: { posts: Post[] }) {
  const { open, setOpen, root, panel, shown } = useLiftMenu();
  const [testing, setTesting] = useState(false);
  const [subject, setSubject] = useState("");
  const hit = subject.trim() ? routeOf(subject, posts) : undefined;
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="More for posts"
        aria-expanded={open}
        onClick={() => {
          setTesting(false);
          setOpen((o) => !o);
        }}
        className="flex size-[max(1.9rem,26px)] items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-[1em]" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {shown && (
        <div ref={panel} role="menu" className={MENU + (testing ? " w-[max(22rem,280px)]" : "")}>
          {!testing ? (
            <button type="button" role="menuitem" onClick={() => setTesting(true)} className={ITEM}>
              Test an application subject
            </button>
          ) : (
            <div className="p-2">
              <p className="text-caption font-medium text-ink-3">Paste an application email&rsquo;s subject</p>
              <input
                autoFocus
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="New application: Head of Finance from Nimal Perera"
                aria-label="An application email's subject"
                className="mt-1.5 h-[max(2.4rem,32px)] w-full rounded-full border border-border px-3 text-small text-ink outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-brand/30"
              />
              {hit !== undefined && (
                <p className={"mt-2 text-small " + (hit ? "text-success" : "text-warn")}>
                  {hit ? (
                    <>
                      Goes to <b className="font-medium">{hit.post.title}</b>, by {hit.why}.
                    </>
                  ) : (
                    "No live post matches - it would go to the database."
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const Tick = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="size-1/2" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="size-[max(1rem,14px)]" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
