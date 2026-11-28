"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { gsap, motionOK, swapIn, useGSAP, useSwap } from "@/lib/gsap";
import { useWorkdayGate } from "@/lib/workday";
import { useLiftMenu } from "../openings/[id]/liftMenu";
import { jdText } from "../openings/[id]/jdState";
import AuraBarGlow from "../AuraBarGlow";
import { SearchSteps, useSteps } from "../SearchSteps";
import { refereeReply, toCsv, type Referee } from "./referees";
import {
  JOBS,
  reply,
  titleOf,
  type Chip,
  type Panel,
  type Person,
  type Reply,
} from "./aura";
import { POOL, filterReply, panelOf } from "./aura";
import FilterBar, { PILL } from "./FilterBar";
import { petSay } from "@/lib/pet";
import { candidateCall, cvHeaders, cvUrl, door, OLD_SERVER, queryOnce, saveLiveFile, useDoorMutation, useDoorQuery, useLive } from "@/lib/backend";
import { useSignedInPerson } from "@/lib/role";
import { useSpeech } from "@/lib/useSpeech";
import type { MyDay } from "@/lib/askAura";
import { chipsOf, jobIn, parseSavedTurns, pastChats, personOf, readLive, serializeTurns, whoIn, type LiveAnswer } from "./live";

// D1 · Database - search by chatting with AURA (owner's design, 14 Nov 2026).
// Left: the chats (Today / Earlier) and New search - the history IS the chats, so
// nothing is "saved" (owner: "they will start a new chat... or continue with the
// old chat"). Right: one talk that does everything (owner: "everything comes to the
// chat... minimising the many buttons of the old system"): any kind of search,
// filtering and taking a filter off, Referral Search, people like someone, adding
// to a job and downloading CVs - each reply ending in one-tap suggestions. The rules
// live in ./aura.ts.
// D2 (owner's design, 14 Nov): a person opens in a panel beside the talk - their
// CV, "Add to <job>" and "Shortlist" - and the chats fold away behind one icon.
// Both buttons speak through the chat, so what was done stays in the thread.
// Motion (DESIGN.md): each new turn and the panel arrive by the one switch; AURA's
// mark breathes while it looks (never spins).

const CvPages = dynamic(() => import("../openings/[id]/CvPages"));

// Candidates (who we hold, and any word inside their CVs - one search, owner 14 Nov
// 2026) or Referees (the references named on those CVs).
type Mode = "people" | "referees";

type Turn =
  | { id: string; from: "me"; text: string }
  | ({ id: string; from: "aura"; ran?: string } & Reply);
type Thread = {
  id: string;
  title: string;
  when: "today" | "earlier";
  turns: Turn[];
  /** A past search (signed in): run again when the chat is opened. */
  q?: string;
  /** Its conversation is saved in the backend and is read when the chat is opened (27 Nov 2026). */
  saved?: boolean;
  /** Which history list it sits in (owner 28 Nov 2026: Candidates and Referees keep separate lists). */
  mode?: Mode;
  /** The project it sits in (owner 28 Nov 2026, like ChatGPT Projects). */
  projectId?: string;
};
/** A folder of chats for one position, with guidelines every search in it keeps. */
type Project = { id: string; name: string; guide: string };

// Signed in, the chat searches the real database through old AURA's own search
// (ta-system #42, /api/ui/database): the engine and the desk rules.
const DB_URL = `${OLD_SERVER}/api/ui/database`;
const NO_LINE = "Could not reach the TA System. Check your connection and try again.";
async function searchLive(body: { q: string; mode: "natural" | "boolean"; full?: boolean; currentIds?: string[]; guide?: string }): Promise<LiveAnswer | { ok: false; message: string }> {
  const res = await fetch(DB_URL, { method: "POST", headers: { "Content-Type": "application/json", ...(await cvHeaders(DB_URL)) }, body: JSON.stringify(body) }).catch(() => null);
  const got = (await res?.json().catch(() => null)) as (LiveAnswer | { ok: false; message: string }) | null;
  return got ?? { ok: false, message: NO_LINE };
}
const cardsOf = (a: LiveAnswer, skip = "") => a.rows.filter((r) => r.id !== skip).map((r) => personOf(r, r.hasCv ? cvUrl({ candidate: r.id }) : undefined));
const liveNext = (people: Person[]) =>
  people.length
    ? [
        { label: `People like ${people[0].name.split(" ")[0]}`, prompt: `Find people like ${people[0].name}` },
        { label: people.length > 1 ? `Add the top ${Math.min(3, people.length)} to a job` : `Add ${people[0].name.split(" ")[0]} to a job`, prompt: people.length > 1 ? `Add the top ${Math.min(3, people.length)} to a job` : `Add ${people[0].name} to a job` },
        { label: "Download their CVs", prompt: "Download their CVs" },
      ]
    : [{ label: "Start over", prompt: "Start over" }];
// The line counts the people listed, never a bigger "matches" figure the list does not hold
// (owner 28 Nov 2026: "843 match" over 45 rows confused the TAs).
const foundLine = (a: LiveAnswer, what = "", shown = a.rows.length) =>
  a.reply?.trim()
    ? a.reply.trim()
    : shown
      ? `${shown} ${shown === 1 ? "person" : "people"} found${what}${a.read ? ` - ${a.read}` : ""}.${a.problem ? ` ${a.problem}` : ""}`
      : (a.problem ?? "Nothing in the database matched that search.");

/** A past chat with no saved turns: its words and a button to run it again. */
const olderChat = (id: string, query: string): Turn[] => [
  { id: `${id}-m`, from: "me", text: query.split("\n").join(" · ") },
  {
    id: `${id}-a`,
    from: "aura",
    text: "This older chat was saved before full results were cached. Run it again if you want fresh matches.",
    ran: query,
    actions: [{ label: "Run search again", prompt: query }],
  },
];

// Turn ids must never repeat across page loads (28 Nov 2026): they restarted at "t1", so a
// reopened saved chat (turns t1..t6) got its new answer as "t3" - `put` replaced the old middle
// answer with it and React dropped the duplicate keys: only the first and last answers showed.
let seq = 0;
const nid = () => `t${Date.now().toString(36)}${(++seq).toString(36)}`;
// The chat id carries its mode, so a saved chat comes back into the right history list.
const newChatId = (mode: Mode = "people") => `${mode === "referees" ? "r" : "c"}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const modeOf = (t: Thread): Mode => t.mode ?? (t.id.startsWith("r_") ? "referees" : "people");
/** Saved turns get fresh ids when a chat is opened: older saves may hold repeated ids. */
const freshIds = (turns: Turn[]): Turn[] => turns.map((t) => ({ ...t, id: nid() }));

/** The chips and the people of the last answer that had them: what a new message refines. */
function contextOf(turns: Turn[]) {
  let chips: Chip[] = [];
  let last: Person[] = [];
  for (const t of turns)
    if (t.from === "aura") {
      if (t.chips) chips = t.chips;
      if (t.people?.length) last = t.people;
    }
  return { chips, last };
}

/** A chat played through: the TA's lines and AURA's answers. */
function play(lines: string[]): Turn[] {
  const turns: Turn[] = [];
  for (const line of lines) {
    const { chips, last } = contextOf(turns);
    turns.push(
      { id: nid(), from: "me", text: line },
      {
        id: nid(),
        from: "aura",
        ...reply(line, { chips, last, cvsOnly: false, locked: "" }),
      },
    );
  }
  return turns;
}

const START: Thread[] = [
  {
    id: "sap",
    title: "SAP leads, manufacturing, Colombo",
    when: "today",
    turns: play([
      "SAP leads who’ve done a manufacturing rollout — Colombo, 8+ years",
      "Only people who actually led the rollout, notice one month or less",
    ]),
  },
  {
    id: "cima",
    title: "Finance managers with CIMA",
    when: "today",
    turns: play(["Finance managers with CIMA"]),
  },
  {
    id: "look",
    title: "Lookalikes: Nadeeka Dilshan",
    when: "earlier",
    turns: play(["Find people like Nadeeka Dilshan"]),
  },
  {
    id: "plant",
    title: "Plant engineers near Horana",
    when: "earlier",
    turns: play(["Plant engineers near Horana"]),
  },
  {
    id: "ref",
    title: "Referral: “do we have Ruwan Silva?”",
    when: "earlier",
    turns: play(["Do we have Ruwan Silva?"]),
  },
];

const initials = (n: string) =>
  n
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
// ponytail: the sample's stand-in wait, long enough to show the steps it stands in for.
const LOOK_MS = 2000;

// What AURA is doing while it looks, step by step (owner 20 Nov 2026: the same steps as
// LinkedIn Search on every search). `wait` is the step that waits for the backend: live,
// the quick answer moves "people" on to the full search for real.
const LOOKS = {
  people: { wait: 2, steps: ["Read your words", "Picked the filters", "Quick list from the people we hold", "Full search: reading every CV and ranking"] },
  boolean: { wait: 2, steps: ["Read your search", "Checked AND, OR and NOT", "Reading every CV with those words", "Counting the matches"] },
  referees: { wait: 2, steps: ["Read your words", "Picked title, company and industry", "Looking through referees named on CVs", "Grouping them by person"] },
  names: { wait: 1, steps: ["Read the names", "Checking each name in our database", "Counting who we have"] },
  add: { wait: 1, steps: ["Found them on screen", "Adding them to the job"] },
  download: { wait: 1, steps: ["Found them on screen", "Fetching their CVs"] },
};
type Look = { id: string; kind: keyof typeof LOOKS; real: number; detail?: string };

function Looking({ look, compact }: { look: Look; compact: boolean }) {
  const { wait, steps } = LOOKS[look.kind];
  const at = useSteps(true, wait, 650, look.real);
  return <SearchSteps compact={compact} className="min-w-0 flex-1 pt-[0.15rem]" at={at} steps={steps.map((label, i) => ({ label, detail: i === at ? look.detail : undefined }))} />;
}

export default function DatabaseView() {
  const gate = useWorkdayGate();
  const person = useSignedInPerson();
  const live = person !== null;
  // The history is the signed-in person's own: when someone else signs in (same browser tab), start from theirs.
  const personKey = person ? person.name + "|" + person.role : "";
  // The live site never shows the sample chats, even for the moment before the
  // signed-in person is known (25 Nov: a ?q= link searched the sample pool and
  // the sample chats stayed in the list).
  const liveSite = useLive();
  const [threads, setThreads] = useState<typeof START>(liveSite ? [] : START);
  const [openId, setOpenId] = useState(liveSite ? "" : "sap");
  const recent = useDoorQuery(door.searchRecent, live ? {} : "skip") as
    | { ok: true; searches: { id: string; chatId?: string | null; title?: string | null; query: string; count: number; at: number; saved?: boolean; projectId?: string | null }[] }
    | { ok: false }
    | undefined;
  const day = useDoorQuery(door.myDay, live ? {} : "skip") as ({ ok: true } & MyDay) | { ok: false } | undefined;
  const positions = day?.ok ? day.positions : [];
  const record = useDoorMutation(door.searchRecord);
  // Signed in: the chats are this person's own past searches, never the samples.
  // Reopening a past chat loads its persisted turns & cached results instantly (27 Nov 2026).
  const loaded = useRef<string | false>(false);
  useEffect(() => {
    if (!live) return;
    if (loaded.current && loaded.current !== personKey) {
      loaded.current = false;
      queueMicrotask(() => {
        setThreads([]);
        setOpenId("");
      });
      return;
    }
    if (loaded.current) return;
    if (!recent?.ok) {
      queueMicrotask(() => setThreads((all) => (all === START ? [] : all)));
      return;
    }
    loaded.current = personKey;
    const today = new Date().toDateString();
    queueMicrotask(() => {
      setThreads((all) => {
        const existing = all === START ? [] : all;
        const existingIds = new Set(existing.map((x) => x.id));
        const restored = pastChats(recent.searches)
          .map((r) => {
            const id = r.chatId || `s${r.id}`;
            // A saved chat's turns are read when it is opened (27 Nov 2026: the list no longer carries them).
            // Older rows saved before persistent turns show the original prompt with a manual re-run button — never auto-searching on click.
            const turns: Turn[] = r.saved ? [] : olderChat(id, r.query);
            return {
              id,
              title: r.title || titleOf(r.query.split("\n")[0]),
              when: (new Date(r.at).toDateString() === today ? "today" : "earlier") as Thread["when"],
              turns,
              q: r.query,
              ...(r.saved ? { saved: true } : {}),
              ...(r.projectId ? { projectId: r.projectId } : {}),
            };
          })
          .filter((t) => !existingIds.has(t.id));
        return [...existing, ...restored];
      });
      setOpenId((o) => (o === "sap" ? "" : o));
    });
  }, [live, recent, personKey]);
  const removeChat = useDoorMutation(door.searchRemove);
  // Projects (owner 28 Nov 2026, like ChatGPT Projects): signed in they are the person's own, kept in
  // the backend; signed out a few made-up ones live only on this screen.
  const liveProjects = useDoorQuery(door.searchProjects, live ? {} : "skip") as { ok: true; projects: Project[] } | { ok: false } | undefined;
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const projects = live ? (liveProjects?.ok ? liveProjects.projects : []) : localProjects;
  const saveProjectDoor = useDoorMutation(door.searchSaveProject);
  const removeProjectDoor = useDoorMutation(door.searchRemoveProject);
  const moveChatDoor = useDoorMutation(door.searchMoveChat);
  // The project page is open (no chat): its guidelines and its chats.
  const [projectId, setProjectId] = useState("");
  const saveProject = async (p: { id?: string; name: string; guide?: string }): Promise<string | null> => {
    if (!live) {
      const id = p.id ?? `p_${Date.now().toString(36)}`;
      setLocalProjects((all) => (p.id ? all.map((x) => (x.id === p.id ? { ...x, name: p.name, guide: p.guide ?? x.guide } : x)) : [{ id, name: p.name, guide: p.guide ?? "" }, ...all]));
      return id;
    }
    const r = (await saveProjectDoor(p)) as { ok: boolean; id?: string; message?: string };
    if (!r?.ok) {
      petSay("failed", r?.message ?? "Could not save the project.");
      return null;
    }
    return r.id ?? null;
  };
  const removeProject = async (id: string) => {
    setThreads((all) => all.map((x) => (x.projectId === id ? { ...x, projectId: undefined } : x)));
    setProjectId("");
    if (!live) setLocalProjects((all) => all.filter((x) => x.id !== id));
    else await removeProjectDoor({ id });
  };
  const moveChat = async (chatId: string, to: string | null) => {
    setThreads((all) => all.map((x) => (x.id === chatId ? { ...x, projectId: to ?? undefined } : x)));
    if (!live) return;
    const r = (await moveChatDoor({ chatId, ...(to ? { projectId: to } : {}) })) as { ok: boolean; message?: string };
    if (!r?.ok) petSay("failed", r?.message ?? "Could not move the chat.");
  };
  const [mode, setMode] = useState<Mode>("people");
  const [thinking, setThinking] = useState(false);
  const [look, setLook] = useState<Look | null>(null);
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [picked, setPicked] = useState<Person | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // The chats fold away while a person is open; the icon brings them back.
  const [chatsOpen, setChatsOpen] = useState(true);
  const pick = (p: Person) => {
    setPicked(p);
    setChatsOpen(false);
  };
  const chats = !picked || chatsOpen;
  const thread = threads.find((t) => t.id === openId) ?? null;
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // A chat opened from the list arrives by the one switch.
  useGSAP(
    () => {
      if (scroller.current) swapIn(scroller.current);
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    },
    { dependencies: [openId] },
  );

  // AURA's mark breathes while it looks (never spins).
  const orb = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!thinking || !orb.current || !motionOK()) return;
      gsap.to(orb.current.querySelector("[data-glow]"), {
        scale: 1.35,
        opacity: 0.15,
        duration: 0.9,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
    },
    { dependencies: [thinking], scope: orb },
  );

  // `fresh` starts a new chat whatever is open; `as` searches in that mode (both for a
  // search arriving in the address, before the screen has caught up).
  const send = (raw: string, opts: { fresh?: boolean; as?: Mode; panel?: Panel } = {}) => {
    const t = raw.trim();
    if (!t || thinking) return;
    const mode_ = opts.as ?? mode;
    const cur = opts.fresh ? undefined : thread;
    setText("");
    let id = openId;
    let turns = cur?.turns ?? [];
    // No chat open: this message starts one, named by its first words.
    if (!cur) {
      id = newChatId(mode_);
      turns = [];
      setThreads((all) => [
        { id, title: titleOf(t), when: "today", turns: [], q: t, mode: mode_, ...(projectId ? { projectId } : {}) },
        ...all,
      ]);
      setOpenId(id);
    }
    const inProject = cur ? cur.projectId : projectId || undefined;
    if (live && mode_ === "people") {
      setThreads((all) => all.map((x) => (x.id === id ? { ...x, turns: [...x.turns, { id: nid(), from: "me", text: t }] } : x)));
      void answerLive(id, t, turns, projects.find((p) => p.id === inProject)?.guide ?? "");
      return;
    }
    const { chips, last } = contextOf(turns);
    // Referees mode reads the sentence into titles and companies; a pasted list of
    // names is still the people check ("do we have ...").
    const parts = t.split(/\n|,|;/).filter((x) => x.trim());
    const names = /do we have/i.test(t) || (parts.length >= 2 && parts.every((x) => /^\s*[A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,3}\s*$/.test(x)));
    const answer = opts.panel
      ? filterReply(chips, opts.panel)
      : mode_ === "referees" && !names
        ? refereeReply(t, chips)
        : reply(t, {
            chips,
            last,
            cvsOnly: false,
            locked: gate,
          });
    setThreads((all) =>
      all.map((x) =>
        x.id === id
          ? { ...x, turns: [...x.turns, { id: nid(), from: "me", text: t }] }
          : x,
      ),
    );
    setThinking(true);
    setLook({ id: nid(), real: 0, kind: names ? "names" : mode_ === "referees" ? "referees" : /\b(AND|OR|NOT)\b/.test(t) ? "boolean" : "people" });
    petSay("working", "Looking through the database…");
    // ponytail: a stand-in wait; with the backend this is the database search.
    timer.current = setTimeout(() => {
      setThreads((all) =>
        all.map((x) =>
          x.id === id
            ? {
                ...x,
                turns: [...x.turns, { id: nid(), from: "aura", ...answer }],
              }
            : x,
        ),
      );
      setThinking(false);
      setLook(null);
    }, LOOK_MS);
  };

  // One message on the real database. Searches go to old AURA's own search; adding to
  // a job is the Database shortlist (shortlistMatch, ta-system #30); CVs come with the
  // person's session. Each search is kept (ui/searches:record) for "searches today".
  const answerLive = async (id: string, t: string, turns: Turn[], guide = "") => {
    const lastRan = [...turns].reverse().find((x) => x.from === "aura") as Extract<Turn, { from: "aura" }> | undefined;
    const { last } = contextOf(turns);
    const ask = readLive(t, lastRan?.ran ?? "");
    const turnId = nid();
    const put = (r: Reply & { ran?: string }, persist?: { query: string; count: number }) =>
      setThreads((all) =>
        all.map((x) => {
          if (x.id !== id) return x;
          const turn = { id: turnId, from: "aura" as const, ...r };
          const nextTurns = x.turns.some((y) => y.id === turnId) ? x.turns.map((y) => (y.id === turnId ? turn : y)) : [...x.turns, turn];
          const nextQ = persist?.query ?? r.ran ?? x.q ?? t;
          if (live && persist) {
            void record({
              chatId: id,
              title: x.title,
              query: nextQ,
              count: persist.count,
              turnsJson: serializeTurns(nextTurns),
              ...(x.projectId ? { projectId: x.projectId } : {}),
            });
          }
          return { ...x, q: nextQ, turns: nextTurns };
        }),
      );
    const keep = lastRan?.ran;
    setThinking(true);
    const kind: Look["kind"] | null =
      ask.kind === "names" || ask.kind === "add" || ask.kind === "download" ? ask.kind : ask.kind === "search" ? (ask.mode === "boolean" ? "boolean" : "people") : ask.kind === "like" ? "people" : null;
    if (kind) setLook({ id: nid(), kind, real: 0 });
    petSay("working", "Looking through the database…");
    const search = async (q: string, mode: "natural" | "boolean", what = "", skip = "") => {
      const currentIds = last.length ? last.map((p) => p.id) : undefined;
      const a = await searchLive({ q, mode, ...(currentIds ? { currentIds } : {}), ...(guide ? { guide } : {}) });
      if (!a.ok) return put({ text: a.message, warn: true, ran: keep });
      const ran = mode === "natural" ? q : undefined;
      const show = (x: LiveAnswer) => {
        const people = cardsOf(x, skip);
        put(
          { text: foundLine(x, what, people.length), chips: chipsOf(x.chips), people, actions: liveNext(people), warn: !people.length && !x.reply, ran, ...(mode === "boolean" ? { boolean: q } : {}) },
          { query: q, count: people.length },
        );
      };
      show(a);
      if (!a.refining) return;
      // The quick answer is on screen; the full engine (models read and re-rank) replaces it,
      // and the steps (one line now, under the quick list) say so.
      setThinking(false);
      setLook((l) => l && { ...l, real: 3 });
      const full = await searchLive({ q, mode, full: true, ...(currentIds ? { currentIds } : {}), ...(guide ? { guide } : {}) });
      if (full.ok) show(full);
    };
    try {
      if (ask.kind === "startOver") put({ text: "Cleared. Who are you looking for?", chips: [] });
      else if (ask.kind === "remove")
        put({ text: "A live search is the words you said, so a filter cannot be taken off here. Say it the new way, or start over.", warn: true, ran: keep, actions: [{ label: "Start over", prompt: "Start over" }] });
      else if (ask.kind === "takeOut") put({ text: "Take them out on the opening's Pipeline. Nothing changed here.", warn: true, ran: keep });
      else if (ask.kind === "download") {
        // Buttons, not an automatic download (owner 28 Nov 2026): one per person, and "Download all".
        const who = whoIn(t, last);
        const files = filesOf(who);
        const none = who.length - files.length;
        put({
          text: !last.length
            ? "There is nobody on screen yet. Search first."
            : files.length
              ? `${files.length === 1 ? "Here is 1 CV" : `Here are ${files.length} CVs`}. Press to download.${none ? ` ${none} ${none === 1 ? "has" : "have"} no CV file on record.` : ""}`
              : "None of them has a CV file to download.",
          files,
          warn: !files.length,
          ran: keep,
        });
      } else if (ask.kind === "add") {
        const who = whoIn(ask.who, last);
        const job = jobIn(ask.job, positions);
        if (!who.length) put({ text: "Who should go in? Search first, or name them.", warn: true, ran: keep });
        else if (gate) put({ text: `${gate} Adding people to a job waits until then.`, warn: true, ran: keep });
        else if (!job)
          put({
            text: positions.length ? `Which job should ${who.length === 1 ? who[0].name : `these ${who.length}`} go into?` : "You have no open positions to add them to.",
            actions: positions.slice(0, 8).map((j) => ({ label: `${j.title} · ${j.client}`, prompt: `Add ${who.map((p) => p.name).join(", ")} to ${j.title} · ${j.client}` })),
            warn: !positions.length,
            ran: keep,
          });
        else {
          const done: Person[] = [];
          const refused: string[] = [];
          for (const p of who) {
            const r = await candidateCall({ do: "shortlistMatch", candidateId: p.id, openingId: job.id });
            if (r.ok) done.push(p);
            else refused.push(`${p.name}: ${r.message}`);
          }
          const names = done.map((p) => p.name).join(", ");
          put({ text: [done.length ? `${names} ${done.length === 1 ? "is" : "are"} now in ${job.title}, and yours to work.` : "", ...refused].filter(Boolean).join(" "), warn: !done.length, people: done, ran: keep });
        }
      } else if (ask.kind === "names") {
        const refs: { asked: string; found?: Person }[] = [];
        const asked = ask.names.slice(0, 10);
        for (const name of asked) {
          setLook((l) => l && { ...l, real: 1, detail: `${refs.length + 1} of ${asked.length}` });
          const a = await searchLive({ q: `"${name}"`, mode: "boolean" });
          const words = name.toLowerCase().split(/\s+/);
          const hit = a.ok ? a.rows.find((r) => words.every((w) => r.name.toLowerCase().includes(w))) : undefined;
          refs.push({ asked: name, found: hit ? personOf(hit, hit.hasCv ? cvUrl({ candidate: hit.id }) : undefined) : undefined });
        }
        const n = refs.filter((r) => r.found).length;
        put({
          text: n === refs.length ? (n === 1 ? "Yes - we have them." : `We have all ${n}.`) : n ? `We have ${n} of ${refs.length}.` : refs.length === 1 ? "No - not in our database." : "None of them is in our database.",
          refs,
          actions: n ? [{ label: n === 1 ? "Add to a job" : `Add the ${n} to a job`, prompt: `Add ${refs.flatMap((r) => (r.found ? [r.found.name] : [])).join(", ")} to a job` }] : undefined,
        });
      } else if (ask.kind === "like") {
        const who = last.find((p) => p.name.toLowerCase().includes(ask.name.toLowerCase()));
        if (!who) put({ text: `I could not find "${ask.name}" among the people on screen.`, warn: true, ran: keep });
        else await search(`${who.title}${who.years ? ` with about ${who.years} years` : ""}${who.city ? ` in ${who.city}` : ""}`, "natural", ` like ${who.name}`, who.id);
      } else await search(ask.q, ask.mode);
    } finally {
      setThinking(false);
      setLook(null);
    }
  };

  // Each new turn: the one switch for the words, pin & settle for the people, and
  // the talk scrolls to it.
  const lastLen = useRef(0);
  useGSAP(
    () => {
      const turns = scroller.current?.querySelectorAll("[data-turn]");
      if (!turns || turns.length <= lastLen.current) {
        lastLen.current = turns?.length ?? 0;
        return;
      }
      const fresh = turns[turns.length - 1] as HTMLElement;
      if (lastLen.current > 0) swapIn(fresh);
      lastLen.current = turns.length;
      scroller.current?.scrollTo({
        top: scroller.current.scrollHeight,
        behavior: "smooth",
      });
    },
    { dependencies: [thread?.turns.length, thinking], revertOnUpdate: false },
  );

  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  // "Search the whole database" on an opening's Database CVs arrives with ?q= and
  // starts a new chat with those words (the old /database/results?for=&q=).
  const asked = useRef(false);
  useEffect(() => {
    // On the live site the search waits for the signed-in person, or it runs on the samples.
    if (liveSite && !live) return;
    const sp = new URLSearchParams(location.search);
    // From an opening: the job title, then the whole JD, sent as the search.
    const forJob = sp.get("for");
    const q = forJob ? `Find people for this job: ${forJob}\n\n${jdText()}` : sp.get("q");
    // An opening's Referral Search tab arrives in Referees mode.
    const as: Mode | undefined = sp.get("mode") === "referees" ? "referees" : undefined;
    if (as) queueMicrotask(() => setMode(as));
    if (asked.current) return;
    asked.current = true;
    history.replaceState(null, "", location.pathname);
    if (as && !q) queueMicrotask(() => setOpenId(""));
    if (!q) return;
    queueMicrotask(() => sendRef.current(q, { fresh: true, as }));
  }, [live, liveSite]);
  // One file after another (a browser drops a burst of downloads); signed in with the session.
  // ponytail: separate PDFs, no zip - add a zip library if the team asks for one file.
  const downloadCvs = async (files: CvFile[]) => {
    if (!files.length) return;
    petSay("working", `Downloading ${files.length} CV${files.length === 1 ? "" : "s"}…`);
    let saved = 0;
    for (const f of files) {
      if (live) {
        if (await saveLiveFile(f.url, f.name)) saved++;
      } else {
        const a = document.createElement("a");
        a.href = f.url;
        a.download = f.name;
        a.click();
        saved++;
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    petSay(saved ? "done" : "failed", saved === files.length ? `Downloaded ${saved} CV${saved === 1 ? "" : "s"}.` : `Downloaded ${saved} of ${files.length}. The rest could not be fetched.`);
  };
  const newSearch = () => {
    setOpenId("");
    setProjectId("");
    setText("");
    setShowHistory(false);
    requestAnimationFrame(() => box.current?.focus());
  };
  // One chat row, the same in the history list and inside a project.
  const chatItem = (t: Thread) => (
    <ChatItem
      key={t.id}
      title={t.title}
      on={openId === t.id}
      projects={projects}
      inProject={t.projectId}
      onMove={(to) => void moveChat(t.id, to)}
      onOpen={() => {
        // Reopening a past chat loads its persisted turns & cached results instantly (never re-runs a search).
        setOpenId(t.id);
        setShowHistory(false);
        if (live && t.saved && !t.turns.length) {
          void queryOnce(door.searchTurns, { chatId: t.id }).then((got) => {
            const saved = parseSavedTurns<Turn>((got as { turnsJson?: string | null } | undefined)?.turnsJson);
            const turns = saved.length ? freshIds(saved) : olderChat(t.id, t.q ?? t.title);
            setThreads((all) => all.map((x) => (x.id === t.id && !x.turns.length ? { ...x, turns, saved: false } : x)));
          });
        }
      }}
      onRename={(title) => {
        setThreads((all) =>
          all.map((x) => (x.id === t.id ? { ...x, title } : x)),
        );
        if (live) {
          void record({
            chatId: t.id,
            title,
            query: t.q ?? title,
            count: contextOf(t.turns).last.length,
            turnsJson: serializeTurns(t.turns),
          });
        }
      }}
      onDelete={() => {
        // Signed in the past search is deleted from the person's own history too.
        if (live) void removeChat({ query: t.q ?? "", chatId: t.id });
        setThreads((all) => all.filter((x) => x.id !== t.id));
        if (openId === t.id) setOpenId("");
      }}
    />
  );
  const lastAura = thread
    ? [...thread.turns].reverse().find((t) => t.from === "aura")?.id
    : undefined;

  return (
    <div className="relative flex min-h-0 flex-1 max-md:flex-col">
      {picked && (
        <button
          type="button"
          onClick={() => setChatsOpen((v) => !v)}
          aria-expanded={chatsOpen}
          aria-label={chatsOpen ? "Hide the chats" : "Show the chats"}
          title={chatsOpen ? "Hide the chats" : "Show the chats"}
          className="absolute left-[max(1.75rem,14px)] top-[max(1.4rem,12px)] z-20 flex size-[max(2.5rem,34px)] items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink max-md:hidden"
        >
          <SidebarIcon />
        </button>
      )}

      {/* The chats */}
      <aside className={(chats ? "flex" : "hidden") + " w-[23.4%] min-w-[max(15rem,200px)] shrink-0 flex-col gap-[max(0.6rem,6px)] border-r border-border px-[max(1.75rem,14px)] pb-6 max-md:w-auto max-md:border-b max-md:border-r-0 max-md:pb-3 max-md:pt-4 " + (picked ? "pt-[max(4.7rem,52px)]" : "pt-[max(2.25rem,20px)]")}>
        <div className="flex items-center gap-[max(2rem,24px)]">
          <button
            type="button"
            onClick={newSearch}
            className="flex h-[max(3.1rem,40px)] min-w-0 items-center gap-2 whitespace-nowrap rounded-full bg-brand px-[max(1rem,12px)] text-body font-medium text-white hover:bg-brand-strong"
          >
            <PlusIcon />
            New search
          </button>

          {/* What to search (owner 14 Nov 2026: not inside the typing bar; 20 Nov: "right in
              front of the New search button, like a toggle, only icons"). Two icons in one
              soft pill; the one in use is lifted white. The words live in the tooltip and the
              screen-reader label. Picking one starts a fresh search in that mode. */}
          <ModeSwitch
            mode={mode}
            onPick={(k) => {
              setMode(k);
              newSearch();
            }}
          />

          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className="ml-auto text-small text-brand md:hidden"
          >
            {showHistory ? "Hide chats" : "Chats"}
          </button>
        </div>
        <nav
          aria-label="Chats"
          className={
            "mt-[max(1.6rem,12px)] flex flex-col gap-1 overflow-y-auto " +
            (showHistory ? "" : "max-md:hidden")
          }
        >
          <ProjectList
            projects={projects}
            open={!openId ? projectId : (thread?.projectId ?? "")}
            onOpen={(id) => {
              setOpenId("");
              setProjectId(id);
              setShowHistory(false);
            }}
            onMake={async (name) => {
              const id = await saveProject({ name });
              if (id) {
                setOpenId("");
                setProjectId(id);
              }
            }}
          />
          {!threads.some((t) => modeOf(t) === mode && !t.projectId) && (
            <p className="px-[max(0.9rem,10px)] text-small text-ink-3">{mode === "referees" ? "No referee searches yet." : "No candidate searches yet."}</p>
          )}
          {(["today", "earlier"] as const).filter((when) => threads.some((t) => t.when === when && modeOf(t) === mode && !t.projectId)).map((when) => (
            <div key={when} className="mb-2 flex flex-col gap-1">
              <p className="mb-1 px-[max(0.9rem,10px)] text-[max(0.8125rem,11.5px)] font-medium uppercase tracking-wide text-ink-3">
                {when}
              </p>
              {threads
                .filter((t) => t.when === when && modeOf(t) === mode && !t.projectId)
                .map((t) => chatItem(t))}
            </div>
          ))}
        </nav>
      </aside>

      {/* The talk */}
      {/* overflow-hidden: the glow behind the typing bar hangs below it and made the whole page scroll (owner, 20 Nov 2026: "the whole tab is moving"). */}
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[max(7.5rem,60px)] bg-gradient-to-b from-surface to-transparent"
        />
        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-y-auto px-[max(1.5rem,12px)] pb-6 pt-[max(2.25rem,20px)]"
        >
          <div className={(picked ? "max-w-[56rem]" : "max-w-[70rem]") + " mx-auto flex w-full flex-col gap-[max(2.1rem,18px)]"}>
            {thread?.projectId && projects.some((p) => p.id === thread.projectId) && (
              <button
                type="button"
                onClick={() => {
                  setProjectId(thread.projectId!);
                  setOpenId("");
                }}
                title="Open the project and its guidelines"
                className="flex items-center gap-2 self-start rounded-full bg-surface-2 px-3 py-1.5 text-small text-ink-2 transition-colors hover:text-ink"
              >
                <FolderIcon />
                {projects.find((p) => p.id === thread.projectId)!.name}
                {projects.find((p) => p.id === thread.projectId)!.guide && <span className="text-ink-3">· guidelines on</span>}
              </button>
            )}
            {!thread && projects.some((p) => p.id === projectId) ? (
              <ProjectHome
                key={projectId}
                project={projects.find((p) => p.id === projectId)!}
                chats={threads.filter((t) => t.projectId === projectId)}
                chatItem={chatItem}
                onSave={(name, guide) => saveProject({ id: projectId, name, guide })}
                onDelete={() => void removeProject(projectId)}
              />
            ) : !thread ? (
              <Welcome mode={mode} live={live} onTry={send} />
            ) : (
              thread.turns.map((t) =>
                t.from === "me" ? (
                  <div key={t.id} data-turn className="flex justify-end">
                    <p className="max-w-[80%] whitespace-pre-line rounded-lg rounded-br-xs bg-surface-2 px-[max(1.25rem,14px)] py-[max(0.75rem,9px)] text-body text-ink">
                      {t.text}
                    </p>
                  </div>
                ) : (
                  <Answer
                    key={t.id}
                    t={t}
                    latest={t.id === lastAura}
                    open={expanded.includes(t.id)}
                    picked={picked?.id}
                    onAll={() =>
                      setExpanded((e) =>
                        e.includes(t.id)
                          ? e.filter((x) => x !== t.id)
                          : [...e, t.id],
                      )
                    }
                    onPick={pick}
                    onSend={send}
                    busy={thinking}
                    onDownload={(f) => void downloadCvs(f)}
                  />
                ),
              )
            )}
            {look && (
              <div ref={orb} className="flex items-start gap-[max(0.9rem,10px)]">
                <Orb breathing={thinking} />
                <Looking key={look.id} look={look} compact={!thinking} />
              </div>
            )}
          </div>
        </div>

        <Composer
          value={text}
          onChange={setText}
          onSend={() => send(text)}
          busy={thinking}
          box={box}
          mode={mode}
          onFile={(name) => send(`Find people for this JD: ${name}`)}
          suggestions={thinking ? undefined : thread?.turns.find((t) => t.id === lastAura && t.from === "aura" && t.actions?.length) ? (thread.turns.find((t) => t.id === lastAura) as Extract<Turn, { from: "aura" }>).actions : undefined}
          onSuggest={send}
          panel={panelOf(contextOf(thread?.turns ?? []).chips)}
          hasPeople={mode === "people"}
          onPanel={(p, said) => send(said, { panel: p })}
        />
      </section>

      {picked && (
        <PersonPanel
          p={picked}
          jobs={live ? positions.map((j) => `${j.title} · ${j.client}`) : JOBS}
          busy={thinking}
          onSend={send}
          onClose={() => {
            setPicked(null);
            setChatsOpen(true);
          }}
        />
      )}
    </div>
  );
}

/** One chat in the list: a click opens it; double-click or the pencil renames it
 *  in place (Enter keeps, Escape or a blank name undoes). */
function ChatItem({
  title,
  on,
  projects,
  inProject,
  onMove,
  onOpen,
  onRename,
  onDelete,
}: {
  title: string;
  on: boolean;
  projects: Project[];
  inProject?: string;
  onMove: (to: string | null) => void;
  onOpen: () => void;
  onRename: (t: string) => void;
  onDelete: () => void;
}) {
  const { open: moving, setOpen: setMoving, root: moveRoot, panel: movePanel, shown: moveShown } = useLiftMenu();
  const [editing, setEditing] = useState(false);
  // Delete needs a second press (a deleted chat is gone for good).
  const [sure, setSure] = useState(false);
  const [draft, setDraft] = useState(title);
  const keep = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== title) onRename(t.slice(0, 80));
  };
  if (editing)
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={keep}
        onKeyDown={(e) => {
          if (e.key === "Enter") keep();
          if (e.key === "Escape") setEditing(false);
        }}
        maxLength={80}
        aria-label="Chat name"
        className="rounded-md bg-surface px-[max(0.9rem,10px)] py-[max(0.7rem,8px)] text-body text-ink outline-none ring-2 ring-brand/30"
      />
    );
  return (
    <div
      className={
        "group flex items-center rounded-md transition-colors " +
        (on ? "bg-surface-2" : "hover:bg-surface-2/60")
      }
    >
      <button
        type="button"
        onClick={onOpen}
        onDoubleClick={() => {
          setDraft(title);
          setEditing(true);
        }}
        aria-current={on ? "true" : undefined}
        title={title}
        className={
          "min-w-0 flex-1 truncate px-[max(0.9rem,10px)] py-[max(0.7rem,8px)] text-left text-body " +
          (on ? "text-ink" : "text-ink-2 group-hover:text-ink")
        }
      >
        {title}
      </button>
      <button
        type="button"
        onClick={() => {
          setDraft(title);
          setEditing(true);
        }}
        aria-label={`Rename "${title}"`}
        title="Rename"
        className="mr-1.5 shrink-0 rounded-full p-1.5 text-ink-3 opacity-0 transition-opacity hover:bg-surface hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
      >
        <PencilIcon />
      </button>
      {(projects.length > 0 || inProject) && (
        <div ref={moveRoot} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMoving(!moving)}
            aria-expanded={moving}
            aria-haspopup="menu"
            aria-label={`Move "${title}" to a project`}
            title="Move to a project"
            className={"mr-0.5 flex rounded-full p-1.5 text-ink-3 transition-opacity hover:bg-surface hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100 " + (moving ? "opacity-100" : "opacity-0")}
          >
            <FolderIcon />
          </button>
          {moveShown && (
            <div ref={movePanel} role="menu" className="absolute right-0 top-full z-30 mt-1 flex min-w-[12rem] flex-col rounded-md border border-border bg-surface p-1.5 shadow-float">
              <p className="px-3 pb-1 pt-1.5 text-caption font-medium uppercase text-ink-3">Move to</p>
              {projects
                .filter((p) => p.id !== inProject)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoving(false);
                      onMove(p.id);
                    }}
                    className="flex items-center gap-2 rounded-sm px-3 py-2 text-left text-small text-ink-2 hover:bg-surface-2 hover:text-ink"
                  >
                    <FolderIcon />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              {inProject && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoving(false);
                    onMove(null);
                  }}
                  className="rounded-sm px-3 py-2 text-left text-small text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  Take out of the project
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => (sure ? onDelete() : setSure(true))}
        onBlur={() => setSure(false)}
        aria-label={sure ? `Press again to delete "${title}"` : `Delete "${title}"`}
        title={sure ? "Press again to delete" : "Delete this chat"}
        className={"mr-1.5 flex shrink-0 items-center rounded-full p-1.5 text-caption transition-opacity hover:bg-surface focus-visible:opacity-100 max-md:opacity-100 " + (sure ? "font-medium text-danger opacity-100" : "text-ink-3 opacity-0 hover:text-ink group-hover:opacity-100")}
      >
        {sure ? "Delete?" : <XIcon />}
      </button>
    </div>
  );
}

/** Projects in the chat list (owner 28 Nov 2026, like ChatGPT Projects): a folder per
 *  position; "New" asks only for a name, the guidelines are written on its page. */
function ProjectList({
  projects,
  open,
  onOpen,
  onMake,
}: {
  projects: Project[];
  open: string;
  onOpen: (id: string) => void;
  onMake: (name: string) => void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const make = () => {
    const n = name.trim();
    setNaming(false);
    setName("");
    if (n) onMake(n.slice(0, 80));
  };
  return (
    <div className="mb-3 flex flex-col gap-1">
      <div className="mb-1 flex items-center justify-between px-[max(0.9rem,10px)]">
        <p className="text-[max(0.8125rem,11.5px)] font-medium uppercase tracking-wide text-ink-3">Projects</p>
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-small text-brand transition-colors hover:bg-surface-2"
        >
          <PlusIcon />
          New
        </button>
      </div>
      {naming && (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={make}
          onKeyDown={(e) => {
            if (e.key === "Enter") make();
            if (e.key === "Escape") {
              setNaming(false);
              setName("");
            }
          }}
          maxLength={80}
          placeholder="e.g. Senior Accountant - Hemas"
          aria-label="Project name"
          className="rounded-md bg-surface px-[max(0.9rem,10px)] py-[max(0.7rem,8px)] text-body text-ink outline-none ring-2 ring-brand/30 placeholder:text-ink-3"
        />
      )}
      {projects.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onOpen(p.id)}
          aria-current={open === p.id ? "true" : undefined}
          title={p.name}
          className={
            "flex items-center gap-2.5 rounded-md px-[max(0.9rem,10px)] py-[max(0.7rem,8px)] text-left text-body transition-colors " +
            (open === p.id ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2/60 hover:text-ink")
          }
        >
          <FolderIcon />
          <span className="truncate">{p.name}</span>
        </button>
      ))}
      {!projects.length && !naming && (
        <p className="px-[max(0.9rem,10px)] text-small text-ink-3">Keep the searches for one position together.</p>
      )}
    </div>
  );
}

/** One project's page: its name, the guidelines every search in it keeps, and its chats.
 *  A message typed here starts a new chat inside the project. */
function ProjectHome({
  project,
  chats,
  chatItem,
  onSave,
  onDelete,
}: {
  project: Project;
  chats: Thread[];
  chatItem: (t: Thread) => ReactNode;
  onSave: (name: string, guide: string) => Promise<string | null>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [guide, setGuide] = useState(project.guide);
  const [saved, setSaved] = useState("");
  const [sure, setSure] = useState(false);
  const changed = name.trim() !== project.name || guide.trim() !== project.guide;
  const save = async () => {
    if (!name.trim() || !changed) return;
    const ok = await onSave(name.trim(), guide.trim());
    setSaved(ok ? "Saved. Every search in this project keeps these now." : "");
  };
  return (
    <div className="flex flex-col gap-[max(1.4rem,14px)] pt-[4vh]">
      <div className="flex items-center gap-3">
        <span className="flex size-[max(2.75rem,36px)] shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <FolderIcon />
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          maxLength={80}
          aria-label="Project name"
          className="min-w-0 flex-1 rounded-sm bg-transparent px-1 text-h2 text-ink outline-none focus:bg-surface-2"
        />
        <button
          type="button"
          onClick={() => (sure ? onDelete() : setSure(true))}
          onBlur={() => setSure(false)}
          title="Delete the project. Its chats go back to your history."
          className={"shrink-0 rounded-full px-3 py-1.5 text-small transition-colors hover:bg-surface-2 " + (sure ? "font-medium text-danger" : "text-ink-3 hover:text-ink")}
        >
          {sure ? "Press again to delete" : "Delete project"}
        </button>
      </div>
      <section className="flex flex-col gap-2 rounded-md border border-border bg-surface p-[max(1.1rem,12px)]">
        <label htmlFor="project-guide" className="text-small font-medium text-ink">
          Guidelines for this project
        </label>
        <p className="text-small text-ink-3">AURA keeps these in every search here: the job, the client, the place, years, must-haves, who to leave out.</p>
        <textarea
          id="project-guide"
          value={guide}
          onChange={(e) => {
            setGuide(e.target.value);
            setSaved("");
          }}
          rows={4}
          maxLength={2000}
          placeholder="Senior accountant for Hemas. Colombo or Gampaha. 5-8 years. CIMA or ACCA a must. Not from audit firms."
          className="resize-y rounded-sm bg-surface-2 px-3 py-2.5 text-body text-ink outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-brand/30"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!changed || !name.trim()}
            onClick={() => void save()}
            className="flex h-[max(2.4rem,33px)] items-center rounded-full bg-brand px-4 text-small font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
          >
            Save guidelines
          </button>
          {saved && <span className="text-small text-success">{saved}</span>}
        </div>
      </section>
      <section className="flex flex-col gap-1">
        <p className="mb-1 text-[max(0.8125rem,11.5px)] font-medium uppercase tracking-wide text-ink-3">Chats in this project</p>
        {chats.length ? (
          chats.map((t) => chatItem(t))
        ) : (
          <p className="text-small text-ink-3">None yet. Type below to start the first search here, or move a chat in with its folder button.</p>
        )}
      </section>
    </div>
  );
}

/** A new chat: what AURA can do, as things to tap - no manual to read. */
function Welcome({
  mode,
  live,
  onTry,
}: {
  mode: Mode;
  live: boolean;
  onTry: (t: string) => void;
}) {
  const tries =
    mode === "referees"
      ? ["HR Managers at Dialog", "General Managers in retail", "Finance Directors at Hemas", "Referees from Cargills"]
      : mode === "people"
      ? [
          "SAP leads in Colombo, 8+ years",
          "“S/4HANA” AND manufacturing",
          // Signed in, no made-up people (20 Nov 2026): the sample names are not in the real database.
          ...(live ? ["Accountants in Colombo with 5+ years"] : ["Do we have Ruwan Silva and Priya Nair?", "Find people like Kasun Perera"]),
          "(SAP OR ERP) AND Colombo NOT Accenture",
        ]
      : ["CIMA finance managers", '"S/4HANA" AND manufacturing'];
  // Candidates <-> Referees: the welcome changes by the one switch.
  const me = useRef<HTMLDivElement>(null);
  useSwap(me, mode);
  return (
    <div ref={me} className="flex flex-col items-center gap-3 pt-[10vh] text-center">
      <Image
        src="/aura-mark.png"
        alt=""
        width={48}
        height={48}
        className="size-[max(3rem,40px)] rounded-full"
      />
      <p className="text-h3 text-ink">{mode === "referees" ? "Which referees are you after?" : "Who are you looking for?"}</p>
      <p className="max-w-[36rem] text-small text-ink-3">
        {mode === "referees"
          ? "The people candidates named as references on their CVs. Ask by title, company or both — or paste names to see who we hold."
          : "Ask in plain words, paste a Boolean or a JD, or a list of names to check. Then keep talking to narrow it down."}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {tries.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTry(t)}
            className={PILL}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One answer: the line, the filters (x takes one off), the Boolean as run, the
 *  people or the names checked, and the one-tap next steps (on the latest only). */
function Answer({
  t,
  latest,
  open,
  picked,
  onAll,
  onPick,
  onSend,
  busy,
  onDownload,
}: {
  t: Extract<Turn, { from: "aura" }>;
  latest: boolean;
  open: boolean;
  picked?: string;
  onAll: () => void;
  onPick: (p: Person) => void;
  onSend: (text: string) => void;
  busy: boolean;
  onDownload: (files: CvFile[]) => void;
}) {
  return (
    <div data-turn className="flex flex-col gap-[max(0.55rem,6px)]">
      <div className="flex items-center gap-[max(0.9rem,10px)]">
        <Orb />
        <p
          className={
            "text-h3 font-medium " + (t.warn ? "text-ink-2" : "text-ink")
          }
        >
          {t.text}
        </p>
      </div>
      <div className="flex flex-col gap-[max(0.55rem,6px)] pl-[max(3.4rem,46px)] max-md:pl-0">
        {t.boolean && (
          <code className="self-start rounded-sm bg-surface-2 px-2.5 py-1 font-mono text-mono text-ink-2">
            {t.boolean}
          </code>
        )}
        {t.chips && t.chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {t.chips.map((c) => (
              <span
                key={c.label}
                className={
                  "group flex items-center gap-1 rounded-full py-1 pl-3 text-small " +
                  (latest ? "pr-1.5 " : "pr-3 ") +
                  (c.added
                    ? "bg-violet-soft text-violet"
                    : "bg-surface-2 text-ink-2")
                }
              >
                {c.added ? "+ " : ""}
                {c.label}
                {latest && c.test !== "live" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSend(`Remove ${c.label}`)}
                    aria-label={`Remove ${c.label}`}
                    title={`Remove ${c.label}`}
                    className="flex size-[1.15rem] items-center justify-center rounded-full opacity-50 hover:bg-surface hover:opacity-100"
                  >
                    <XIcon />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {t.refs && (
          <ul className="flex max-w-[40rem] flex-col divide-y divide-border rounded-md border border-border">
            {t.refs.map((r) => (
              <li
                key={r.asked}
                className="flex items-center gap-3 px-3.5 py-2.5 text-small"
              >
                <span
                  className={
                    "flex size-5 shrink-0 items-center justify-center rounded-full " +
                    (r.found
                      ? "bg-brand text-white"
                      : "bg-surface-3 text-ink-3")
                  }
                >
                  {r.found ? <TickIcon /> : <XIcon />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{r.asked}</span>
                  <span className="text-ink-3">
                    {" "}
                    ·{" "}
                    {r.found
                      ? `${r.found.title} · ${r.found.company} · ${r.found.city}`
                      : "not in our database"}
                  </span>
                </span>
                {r.found && (
                  <button
                    type="button"
                    onClick={() => onPick(r.found!)}
                    className="shrink-0 font-medium text-brand hover:underline"
                  >
                    Open CV
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {t.referees && t.referees.length > 0 && <RefereeList list={t.referees} onPick={onPick} />}
        {t.files && t.files.length > 0 && <CvFiles files={t.files} onDownload={onDownload} />}
        {t.people && t.people.length > 0 && (
          <Results
            onDownload={(ps) => onDownload(filesOf(ps))}
            people={t.people}
            open={open}
            picked={picked}
            busy={busy}
            onAll={onAll}
            onPick={onPick}
            onShortlist={(p) => onSend(`Add ${p.name} to a job`)}
          />
        )}
      </div>
    </div>
  );
}

type CvFile = { name: string; url: string };
/** The CV files of these people (those with a CV on record). */
const filesOf = (ps: Person[]): CvFile[] => ps.filter((p) => p.cv).map((p) => ({ name: `${p.name} - CV.pdf`, url: p.cv! }));

/** The CVs asked for in the chat: a button per person and "Download all" (owner 28 Nov 2026). */
function CvFiles({ files, onDownload }: { files: CvFile[]; onDownload: (f: CvFile[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {files.length > 1 && (
        <button
          type="button"
          onClick={() => onDownload(files)}
          className="flex h-[max(2.4rem,33px)] items-center gap-2 rounded-full bg-brand px-4 text-small font-medium text-white transition-colors hover:bg-brand-strong"
        >
          <DownloadIcon />
          Download all {files.length}
        </button>
      )}
      {files.map((f) => (
        <button key={f.url} type="button" onClick={() => onDownload([f])} className={PILL}>
          <DownloadIcon />
          {f.name.replace(/ - CV\.pdf$/, "")}
        </button>
      ))}
    </div>
  );
}

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4 shrink-0">
    <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
  </svg>
);

/** Circular fit-score ring matching the Opening's Database CVs rows. */
function ScoreRing({ score }: { score: number }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative flex size-[max(3.25rem,40px)] shrink-0 items-center justify-center text-small font-medium text-ink" title={`${score} match`}>
      <svg viewBox="0 0 52 52" fill="none" strokeWidth="4" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="26" cy="26" r={r} className="stroke-surface-2" />
        <circle cx="26" cy="26" r={r} strokeDasharray={`${(c * score) / 100} ${c}`} className={score >= 85 ? "stroke-brand" : "stroke-brand-leaf"} />
      </svg>
      {score}
    </span>
  );
}

/** The closest four, then "see all" opens every match under them. Uses the same
 *  horizontal layout as Database CVs: score ring, name + years/city, 3 recent roles
 *  with date ranges, green-tick highlights, and a Shortlist action on hover/selection. */
function Results({
  people,
  open,
  picked,
  busy,
  onAll,
  onPick,
  onShortlist,
  onDownload,
}: {
  onDownload: (people: Person[]) => void;
  people: Person[];
  open: boolean;
  picked?: string;
  busy: boolean;
  onAll: () => void;
  onPick: (p: Person) => void;
  onShortlist: (p: Person) => void;
}) {
  const shown = open ? people : people.slice(0, 4);
  const compact = !!picked;
  // Tick people, then download their CVs together (owner 28 Nov 2026).
  const [ticked, setTicked] = useState<string[]>([]);
  const withCv = people.filter((p) => p.cv);
  const all = withCv.length > 0 && withCv.every((p) => ticked.includes(p.id));
  const toggle = (id: string) => setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  // "See all" / "Show fewer" changes the list in place: the one switch, not a jump.
  const list = useRef<HTMLUListElement>(null);
  useSwap(list, open);
  const tick = (ok: boolean) => (
    <span aria-hidden="true" className={"flex size-[1.05rem] shrink-0 items-center justify-center rounded-full " + (ok ? "bg-success-soft text-success" : "bg-warn-soft text-warn")}>
      <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={ok ? "m2.5 6.2 2.3 2.3 4.7-4.9" : "M3 6h6"} />
      </svg>
    </span>
  );
  return (
    <div className="flex flex-col gap-[max(0.6rem,6px)]">
      {withCv.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-small">
          <label className="flex items-center gap-2 text-ink-2">
            <input type="checkbox" checked={all} onChange={() => setTicked(all ? [] : withCv.map((p) => p.id))} className="size-4 accent-[var(--color-brand)]" />
            {all ? "Untick all" : `Tick all ${withCv.length}`}
          </label>
          <button
            type="button"
            disabled={!ticked.length || busy}
            onClick={() => onDownload(people.filter((p) => ticked.includes(p.id)))}
            className="ml-auto flex h-[max(2.4rem,33px)] items-center gap-2 rounded-full bg-brand px-4 text-small font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
          >
            <DownloadIcon />
            {ticked.length ? `Download ${ticked.length} CV${ticked.length === 1 ? "" : "s"}` : "Tick people to download CVs"}
          </button>
        </div>
      )}
      <ul ref={list} className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface" aria-label="People found">
        {shown.map((p) => {
          const on = picked === p.id;
          const career = p.career?.length
            ? p.career.slice(0, 3)
            : p.title || p.company
              ? [{ period: "Now", title: p.title, company: p.company }]
              : [];
          const rawReason = (p.why ?? "").split(" · ").filter((s) => s && !/^\d+(\.\d+)?\s*yrs?$/i.test(s) && !/^notice\s+/i.test(s));
          const highlights: { ok: boolean; t: string }[] = [];
          if (p.years > 0) highlights.push({ ok: true, t: `${p.years} years of experience` });
          if (p.notice === 0) highlights.push({ ok: true, t: "can start now" });
          else if (p.notice > 0 && p.notice < 99) highlights.push({ ok: p.notice <= 1, t: `${p.notice} month${p.notice === 1 ? "" : "s"} notice` });
          if (rawReason[0] && highlights.length < 3) highlights.push({ ok: !/^not\b|missing|unclear/i.test(rawReason[0]), t: rawReason[0] });
          if (!highlights.length && p.tags.length) highlights.push({ ok: true, t: p.tags.slice(0, 3).join(", ") });

          return (
            <li key={p.id} className="group relative">
              <input
                type="checkbox"
                checked={ticked.includes(p.id)}
                disabled={!p.cv}
                onChange={() => toggle(p.id)}
                aria-label={p.cv ? `Tick ${p.name}` : `${p.name} has no CV file on record`}
                title={p.cv ? `Tick ${p.name} to download the CV` : "No CV file on record"}
                className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 accent-[var(--color-brand)] disabled:opacity-30"
              />
              <button
                type="button"
                data-card
                onClick={() => onPick(p)}
                aria-current={on ? "true" : undefined}
                title={p.cv ? "Open the CV" : "No CV file on record"}
                className={
                  "grid w-full items-center gap-x-[max(1rem,10px)] py-3.5 pl-10 pr-[max(8.5rem,104px)] text-left transition-colors " +
                  (compact
                    ? "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] max-md:grid-cols-1"
                    : "grid-cols-[minmax(0,1.25fr)_minmax(0,0.38fr)_minmax(0,1.1fr)_minmax(0,0.95fr)] max-xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] max-xl:[&>:nth-child(2)]:hidden max-xl:[&>:nth-child(4)]:hidden max-md:grid-cols-1") +
                  " " +
                  (on ? "bg-brand-tint" : "bg-surface hover:bg-canvas/60")
                }
              >
                <span className="flex min-w-0 items-center gap-3.5">
                  <ScoreRing score={p.score} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[max(1.05rem,14px)] font-medium text-ink">{p.name}</span>
                    <span className="truncate text-small text-ink-3">
                      {[p.years > 0 ? `${p.years} years` : "", p.city].filter(Boolean).join(" · ") || p.title}
                    </span>
                  </span>
                </span>

                {!compact && (
                  <span className="flex flex-col gap-1 text-small max-md:hidden">
                    {career.map((c, idx) => (
                      <span key={idx} className={"truncate " + (idx === 0 ? "font-medium text-brand" : "text-ink-3")}>
                        {c.period}
                      </span>
                    ))}
                  </span>
                )}

                <span className="flex min-w-0 flex-col gap-1 text-small max-md:mt-2">
                  {career.map((c, idx) => (
                    <span key={idx} className="truncate text-ink">
                      {c.title}
                      {c.company && <span className="ml-1.5 text-ink-3">{c.company}</span>}
                    </span>
                  ))}
                </span>

                {!compact && (
                  <span className="flex min-w-0 flex-col gap-1 text-small text-ink-2 max-md:hidden">
                    {highlights.slice(0, 3).map((x, idx) => (
                      <span key={idx} className="flex items-center gap-2" title={x.t}>
                        {tick(x.ok)}
                        <span className="truncate">{x.t}</span>
                      </span>
                    ))}
                  </span>
                )}
              </button>

              <div className={"absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-2 transition-opacity duration-150 " + (on ? "" : "pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100")}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    onShortlist(p);
                  }}
                  title={`Add ${p.name} to a job`}
                  className="flex h-[max(2.35rem,32px)] items-center rounded-full bg-brand px-4 text-small font-medium text-white hover:bg-brand-strong disabled:opacity-40"
                >
                  Shortlist
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {people.length > 4 && (
        <button
          type="button"
          onClick={onAll}
          aria-expanded={open}
          className="self-start rounded-full px-3 py-1.5 text-small font-medium text-brand-strong hover:bg-surface-2"
        >
          {open ? "Show fewer" : `See all ${people.length}`}
        </button>
      )}
    </div>
  );
}

/** D2: one person beside the talk - who they are, their CV, and the two things a
 *  TA does from here. The job menu picks which job both buttons use; each button
 *  sends its words to the chat, so AURA answers (and refuses) as everywhere else. */
function PersonPanel({
  p,
  jobs,
  busy,
  onSend,
  onClose,
}: {
  p: Person;
  jobs: string[];
  busy: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const [job, setJob] = useState(jobs[0] ?? "a job");
  const { open: menuOpen, setOpen: setMenu, root: menuRoot, panel: menuPanel, shown: menuShown } = useLiftMenu();
  const el = useRef<HTMLElement>(null);
  const short = (j: string) => j.split(" · ")[0];
  // On a phone the panel covers the talk: step aside so AURA's answer is seen.
  const act = (t: string) => {
    onSend(t);
    if (matchMedia("(max-width: 767px)").matches) onClose();
  };
  useGSAP(
    () => {
      if (el.current) swapIn(el.current);
    },
    { dependencies: [p.id] },
  );
  useEffect(() => {
    if (menuOpen) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose, menuOpen]);
  return (
    <aside
      ref={el}
      aria-label={p.name}
      className="relative flex w-[44%] min-w-[max(26rem,340px)] shrink-0 flex-col border-l border-border bg-surface max-md:absolute max-md:inset-0 max-md:z-30 max-md:w-auto max-md:min-w-0 max-md:border-l-0"
    >
      <header className="flex items-center gap-3 border-b border-border px-[max(1.5rem,14px)] py-[max(1rem,10px)]">
        <span className="flex size-[max(2.75rem,36px)] shrink-0 items-center justify-center rounded-full bg-brand-soft text-small font-medium text-brand">
          {initials(p.name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-h3 font-medium text-ink">{p.name}</span>
          <span className="truncate text-small text-ink-3">
            {p.title} · {p.company} · {p.city} · {p.years} yrs
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
          className="flex size-[max(2.25rem,32px)] shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <svg {...ico} className="size-[max(1.1rem,15px)]">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-[max(1.25rem,12px)] pb-[max(6rem,76px)] pt-[max(1.25rem,12px)]">
        {p.cv ? (
          <CvPages key={p.cv} src={p.cv} fit="width" />
        ) : (
          <p className="pt-[20vh] text-center text-body text-ink-3">
            No CV file on record for {p.name.split(" ")[0]}.
          </p>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-[max(1.25rem,12px)] flex justify-center gap-2 px-3">
        <div
          ref={menuRoot}
          className="relative flex rounded-full bg-surface shadow-float ring-1 ring-border/60"
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => act(`Add ${p.name} to ${job}`)}
            className="flex h-[max(2.75rem,36px)] items-center rounded-l-full pl-[max(1.2rem,14px)] pr-2 text-body font-medium text-ink hover:bg-surface-2 disabled:opacity-40"
          >
            Add to {short(job)}
          </button>
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Choose the job"
            title="Choose the job"
            className="flex items-center rounded-r-full border-l border-border pl-2 pr-[max(0.9rem,10px)] text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <svg {...ico} className="size-[max(1rem,14px)]">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {menuShown && (
            <div
              ref={menuPanel}
              role="menu"
              className="absolute bottom-full left-0 mb-2 flex min-w-full flex-col rounded-md bg-surface p-1.5 shadow-float ring-1 ring-border/60"
            >
              <p className="px-3 pb-1 pt-1.5 text-caption font-medium uppercase text-ink-3">
                Which job
              </p>
              {jobs.map((j) => (
                <button
                  key={j}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setJob(j);
                    setMenu(false);
                  }}
                  className={
                    "flex items-center gap-2 whitespace-nowrap rounded-sm px-3 py-2 text-left text-small hover:bg-surface-2 " +
                    (j === job ? "font-medium text-ink" : "text-ink-2")
                  }
                >
                  <span className="w-3">{j === job && <TickIcon />}</span>
                  {j}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => act(`Shortlist ${p.name} for ${job}`)}
          title={`Shortlist for ${job} and claim them`}
          className="flex h-[max(2.75rem,36px)] items-center rounded-full bg-brand px-[max(1.4rem,16px)] text-body font-medium text-white shadow-float hover:bg-brand-strong disabled:opacity-40"
        >
          Shortlist
        </button>
      </div>
    </aside>
  );
}

/** AURA's mark; breathing while it looks. */
function Orb({ breathing = false }: { breathing?: boolean }) {
  return (
    <span className="relative flex size-[max(2.5rem,32px)] shrink-0">
      {breathing && (
        <span
          data-glow
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,var(--color-aura-1),var(--color-aura-2),var(--color-aura-3),var(--color-aura-4),var(--color-aura-1))] opacity-40"
        />
      )}
      <Image
        src="/aura-mark.png"
        alt="AURA"
        width={40}
        height={40}
        className="relative size-full rounded-full"
      />
    </span>
  );
}

/** "Refine — …": attach a JD, speak, or type; Enter sends, Shift+Enter is a new line. */
function Composer({
  suggestions,
  onSuggest,
  value,
  onChange,
  onSend,
  busy,
  box,
  mode,
  onFile,
  panel,
  hasPeople,
  onPanel,
}: {
  panel: Panel;
  hasPeople: boolean;
  onPanel: (p: Panel, said: string) => void;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  box: React.RefObject<HTMLTextAreaElement | null>;
  mode: Mode;
  onFile: (name: string) => void;
  suggestions?: { label: string; prompt: string }[];
  onSuggest: (text: string) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  // The shared recorder (26 Nov 2026): this one ended at the first pause and kept one
  // phrase, so a spoken JD was cut off in the middle. Now it listens until stop.
  const mic = useSpeech((t) => onChange((box.current?.value ? box.current.value + " " : "") + t));
  const { ok: speech, on: listening } = mic;
  // AURA's next steps change with each answer: the one switch, not a blink.
  const next = useRef<HTMLDivElement>(null);
  useSwap(next, suggestions?.map((a) => a.label).join("|"));
  const press = () => {
    if (!value.trim() || busy) return;
    onSend();
  };
  return (
    <div className="relative isolate px-[max(1.5rem,12px)] pb-[max(2.4rem,14px)]">
      <AuraBarGlow className="bottom-[max(1.2rem,8px)]" />
      {/* One row above the typing bar: the filters at the left, AURA's next steps at the right. */}
      {(hasPeople || (suggestions && suggestions.length > 0)) && (
        <div className="mx-auto mb-3 flex w-full max-w-[56rem] items-center gap-4">
          {hasPeople && <FilterBar panel={panel} busy={busy} className="shrink-0" onApply={onPanel} />}
          {/* One row at every width (28 Nov 2026: on a laptop the next steps fell to a second line
              and pushed the talk up): they slide sideways when there is no room. */}
          {suggestions && suggestions.length > 0 && (
            <div ref={next} className="ml-auto flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none]">
              {suggestions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  disabled={busy}
                  onClick={() => onSuggest(a.prompt)}
                  className={PILL}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mx-auto flex w-full max-w-[56rem] items-end gap-[max(0.9rem,8px)] rounded-xl bg-surface p-2.5 shadow-float ring-1 ring-border/60 transition-shadow focus-within:ring-2 focus-within:ring-brand/30">
        <button
          type="button"
          onClick={() => file.current?.click()}
          hidden={mode === "referees"}
          aria-label="Attach a JD to find people for it"
          title="Attach a JD to find people for it"
          className="flex size-[max(2.75rem,36px)] shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink"
        >
          <ClipIcon />
        </button>
        <input
          ref={file}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f.name);
            e.target.value = "";
          }}
        />
        <textarea
          ref={box}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              press();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder={
            mode === "people"
              ? "Skills, a title, a place — or paste a JD"
              : "Title or company — “HR Managers at Dialog”"
          }
          aria-label="Ask AURA"
          className="max-h-32 min-w-0 flex-1 resize-none self-center bg-transparent py-2 pl-[max(0.75rem,8px)] text-body text-ink outline-none placeholder:text-ink-3 [field-sizing:content]"
        />
        <button
          type="button"
          disabled={!speech}
          onClick={mic.toggle}
          aria-pressed={listening}
          aria-label={
            speech
              ? listening
                ? "Stop listening"
                : "Speak"
              : "Speaking is not available in this browser"
          }
          title={
            speech
              ? listening
                ? "Stop listening"
                : "Speak"
              : "Speaking is not available in this browser"
          }
          className={
            "flex size-[max(2.75rem,36px)] shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 " +
            (listening
              ? "bg-danger-soft text-danger"
              : "text-ink-3 hover:text-ink")
          }
        >
          <MicIcon />
        </button>
        <button
          type="button"
          onClick={press}
          disabled={!value.trim() || busy}
          aria-label="Send"
          className="flex size-[max(2.75rem,36px)] shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-strong disabled:opacity-40"
        >
          <ArrowUp />
        </button>
      </div>
    </div>
  );
}

const ico = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;
const FolderIcon = () => (
  <svg {...ico} className="size-[max(1rem,14px)] shrink-0">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);
const PlusIcon = () => (
  <svg {...ico} className="size-[max(1.1rem,15px)]">
    <path d="M5 12h14M12 5v14" />
  </svg>
);
const ArrowUp = () => (
  <svg {...ico} className="size-[max(1.1rem,15px)]">
    <path d="M5 12l7-7 7 7M12 19V5" />
  </svg>
);
const MicIcon = () => (
  <svg {...ico} className="size-[max(1.25rem,16px)]">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
  </svg>
);
// The owner's icon (bi people-fill), drawn in the text colour.
const PeopleIcon = (): ReactNode => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    className="size-[max(1.2rem,16px)]"
    aria-hidden="true"
  >
    <path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7Zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5.784 6A2.24 2.24 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.3 6.3 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1h4.216ZM4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
  </svg>
);
const XIcon = () => (
  <svg {...ico} strokeWidth={2.4} className="size-3">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
const TickIcon = () => (
  <svg {...ico} strokeWidth={3} className="size-3">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
const PencilIcon = () => (
  <svg {...ico} className="size-[max(0.9rem,12px)]">
    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </svg>
);
const SidebarIcon = () => (
  <svg {...ico} className="size-[max(1.25rem,16px)]">
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M9 4v16" />
  </svg>
);

const RefIcon = (): ReactNode => (
  <svg {...ico} className="size-[max(1.2rem,16px)]">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6" />
  </svg>
);
// Defined after the icons it draws (a const is not ready before its line).
const MODES: [Mode, string, ReactNode, string][] = [
  ["people", "Candidates", <PeopleIcon key="p" />, "People we hold — by skills, title, place or any word in their CV"],
  ["referees", "Referees", <RefIcon key="r" />, "References named on CVs, with numbers"],
];

/** Candidates | Referees (owner 28 Nov 2026: "a little bigger", and a switch you can feel). The white
 *  thumb slides to the picked side, stretching as it goes and settling with a small overshoot;
 *  the picked icon pops. Each side keeps its own history list. */
function ModeSwitch({ mode, onPick }: { mode: Mode; onPick: (m: Mode) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  useGSAP(
    () => {
      const on = row.current?.querySelector<HTMLElement>('[aria-checked="true"]');
      if (!on || !thumb.current) return;
      const box = { x: on.offsetLeft, width: on.offsetWidth };
      if (!placed.current) {
        placed.current = true;
        gsap.set(thumb.current, box);
        return;
      }
      const from = Number(gsap.getProperty(thumb.current, "x"));
      gsap
        .timeline({ defaults: { overwrite: "auto" } })
        // Lean into the move: stretch towards the new side, then catch up and settle past it.
        .to(thumb.current, { x: Math.min(from, box.x), width: box.width + Math.abs(box.x - from), duration: 0.16, ease: "power2.in" })
        .to(thumb.current, { x: box.x, width: box.width, duration: 0.5, ease: "back.out(2.2)" })
        .fromTo(on.querySelector("svg"), { scale: 0.7, rotate: box.x > from ? -12 : 12 }, { scale: 1, rotate: 0, duration: 0.5, ease: "back.out(3)", clearProps: "transform" }, 0.12);
    },
    { dependencies: [mode], scope: row, revertOnUpdate: false },
  );
  return (
    <div ref={row} role="radiogroup" aria-label="What to search" className="relative flex h-[max(3.1rem,40px)] shrink-0 items-center gap-1 rounded-full bg-surface-2 p-1 md:ml-auto">
      <span ref={thumb} aria-hidden="true" data-still className="absolute bottom-1 left-0 top-1 rounded-full bg-surface shadow-float" />
      {MODES.map(([k, label, icon, hint]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={mode === k}
          aria-label={label}
          title={`${label} - ${hint}`}
          onClick={() => mode !== k && onPick(k)}
          className={"relative flex size-[max(2.6rem,34px)] items-center justify-center rounded-full transition-colors duration-200 " + (mode === k ? "text-brand" : "text-ink-3 hover:text-ink")}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

/** Referees named on our CVs: what the CV said (title at company, and when it was
 *  read), phone and email with copy, who named them, a CV we may hold under the same
 *  name; tick and export to Excel (old ReferralCard / ExportBar). */
function RefereeList({ list, onPick }: { list: Referee[]; onPick: (p: Person) => void }) {
  const [ticked, setTicked] = useState<string[]>([]);
  const [copied, setCopied] = useState("");
  const all = ticked.length === list.length;
  const copy = (v: string) => {
    void navigator.clipboard?.writeText(v);
    setCopied(v);
    setTimeout(() => setCopied((c) => (c === v ? "" : c)), 1400);
  };
  const exportNow = () => {
    const url = URL.createObjectURL(new Blob([toCsv(list.filter((r) => ticked.includes(r.id)))], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `referees-${ticked.length}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const Copy = ({ v, what }: { v: string; what: string }) => (
    <button type="button" onClick={() => copy(v)} aria-label={`Copy the ${what}`} title={`Copy the ${what}`} className="rounded-xs px-1 text-caption text-ink-3 hover:bg-surface-2 hover:text-ink">
      {copied === v ? "Copied" : "Copy"}
    </button>
  );
  return (
    <div className="flex max-w-[48rem] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-small">
        <label className="flex items-center gap-2 text-ink-2">
          <input type="checkbox" checked={all} onChange={() => setTicked(all ? [] : list.map((r) => r.id))} className="size-4 accent-[var(--color-brand)]" />
          Tick all
        </label>
        <button type="button" disabled={!ticked.length} onClick={exportNow} className="ml-auto flex h-[max(2.4rem,33px)] items-center rounded-full bg-brand px-4 text-small font-medium text-white hover:bg-brand-strong disabled:opacity-40">
          {ticked.length ? `Export ${ticked.length} to Excel` : "Tick referees to export"}
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {list.map((r) => {
          const on = ticked.includes(r.id);
          // A CV we hold under the same name - maybe them (never claimed to be).
          const cv = POOL.find((p) => p.name.toLowerCase() === r.name.toLowerCase());
          return (
            <li key={r.id} className={"rounded-md border px-4 py-3 transition-colors " + (on ? "border-brand bg-brand-tint" : "border-border bg-surface")}>
              <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
                <label className="flex min-w-0 flex-1 cursor-pointer gap-3">
                  <input type="checkbox" checked={on} onChange={() => setTicked((t) => (on ? t.filter((x) => x !== r.id) : [...t, r.id]))} aria-label={`Tick ${r.name} to export`} className="mt-1 size-4 shrink-0 accent-[var(--color-brand)]" />
                  <span className="min-w-0">
                    <span className="block text-body font-medium text-ink">{r.name}</span>
                    <span className="block text-small text-ink-2">
                      {r.title ?? <span className="text-ink-3">Title not on the CV</span>}
                      {r.company && (
                        <>
                          <span className="text-ink-3"> at </span>
                          {r.company}
                        </>
                      )}
                      <span className="text-caption text-ink-3"> · from a CV read {r.read}</span>
                    </span>
                  </span>
                </label>
                <div className="shrink-0 text-small sm:text-right">
                  {r.phone ? (
                    <p className="flex items-center gap-1 sm:justify-end">
                      <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="font-mono text-caption font-medium text-brand hover:underline">
                        {r.phone}
                      </a>
                      <Copy v={r.phone} what="phone number" />
                    </p>
                  ) : (
                    <p className="text-caption text-ink-3">No number on file</p>
                  )}
                  {r.email ? (
                    <p className="flex items-center gap-1 sm:justify-end">
                      <a href={`mailto:${r.email}`} className="break-all text-caption text-brand hover:underline">
                        {r.email}
                      </a>
                      <Copy v={r.email} what="email" />
                    </p>
                  ) : (
                    <p className="text-caption text-ink-3">No email on file</p>
                  )}
                </div>
              </div>
              {cv && (
                <p className="mt-2 rounded-md bg-brand-soft px-3 py-2 text-caption text-ink">
                  We have a CV for{" "}
                  <button type="button" onClick={() => onPick(cv)} className="font-medium text-brand hover:underline">
                    {cv.name}
                  </button>{" "}
                  ({cv.title} at {cv.company}) — the same name, maybe them. Open it to check.
                </p>
              )}
              <p className="mt-2 border-t border-border pt-2 text-caption text-ink-3">
                {r.namedBy.length > 1 ? `Named by ${r.namedBy.length} candidates: ` : "Reference for "}
                {r.namedBy.join(", ")}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const ClipIcon = () => (
  <svg {...ico} className="size-[max(1.15rem,15px)]">
    <path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15.5 8" />
  </svg>
);
