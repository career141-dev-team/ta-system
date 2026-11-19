"use client";

// The live backend, straight from the browser (18 Nov 2026).
//
// The old TA System reached Convex through its own Next.js server, which kept a
// copy of the desk in memory and froze while it saved - the cause of the
// slowness. This UI talks to the same Convex backend directly, through the
// signed-in door in the TA repo (career141-dev-team/ta-system, convex/ui).
// The person is their Clerk sign-in (the same accounts as AURA); the backend
// trusts nothing else.
//
// With NEXT_PUBLIC_CONVEX_URL and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY unset the
// UI runs on its sample data exactly as before, so a build without them (a
// design preview) never tries to sign anyone in.

import { ClerkProvider, SignedIn, SignedOut, useAuth, useClerk, useSignIn } from "@clerk/clerk-react";
import { isClerkAPIResponseError } from "@clerk/clerk-react/errors";
import { ConvexReactClient, useAction, useMutation, useQuery } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { makeFunctionReference } from "convex/server";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { setSignedIn, type Role } from "@/lib/role";
import { useBusy } from "@/lib/busy";
import { goLive, setLiveDay } from "@/lib/workday";
import { setLiveAlerts, type Alert } from "@/app/alerts/data";
import LoginScreen from "@/app/signin/LoginScreen";

const URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

/** True when this build talks to the real backend. */
export const LIVE = Boolean(URL && CLERK_KEY);

const client = LIVE ? new ConvexReactClient(URL) : null;

// Convex's hooks throw when there is no provider - which is every build without the two
// env values (the live design preview). LIVE never changes in a build, so a screen uses
// these two: the real hooks when live, harmless stand-ins when not.
const noMutation = async () => undefined;
// A backend that is slow for a moment (a restart, a 1 s limit) makes Convex's useQuery THROW,
// which dropped the whole page onto "This page couldn't load" (19 Nov). The hook is called
// first, so the rule of hooks holds; a failed answer reads as "still loading" and the next
// answer from the backend replaces it.
// 19 Nov (later): a failed read now says so (READ_FAILED, one object so a screen comparing
// answers does not loop) instead of reading as "loading" for ever, and every read still
// waiting keeps the tab's loading bar running (src/lib/busy.ts) - one place for every screen.
const READ_FAILED = { ok: false as const, message: "Could not read this just now. Reload the page to try again." };
const safeQuery = ((query: Parameters<typeof useQuery>[0], args: Parameters<typeof useQuery>[1]) => {
  let answer: unknown;
  try {
    answer = useQuery(query, args);
  } catch (error) {
    console.warn("[door] a read failed:", error instanceof Error ? error.message.split("\n")[0] : error);
    answer = READ_FAILED;
  }
  useBusy(args !== "skip" && answer === undefined);
  return answer;
}) as typeof useQuery;
export const useDoorQuery = (LIVE ? safeQuery : () => undefined) as typeof useQuery;
export const useDoorMutation = (LIVE ? useMutation : () => noMutation) as typeof useMutation;
export const useDoorAction = (LIVE ? useAction : () => noMutation) as typeof useAction;
/** Headers that prove who is asking, for our own money-spending routes (src/lib/signedIn.ts). */
export const useSignedHeaders = (LIVE
  ? () => {
      const { getToken } = useAuth();
      return async (): Promise<Record<string, string>> => {
        const token = await getToken({ template: "convex" });
        return token ? { Authorization: `Bearer ${token}` } : {};
      };
    }
  : () => async () => ({})) as () => () => Promise<Record<string, string>>;

/** The old server, where the email's CV files and workbook are made (D5 step 3). */
export const OLD_SERVER = "https://ta-system.career141.com";

/** A candidate's CV as a PDF (D6): by application, or a database match by candidate. */
export const cvUrl = (q: { app?: string; candidate?: string }) =>
  `${OLD_SERVER}/api/ui/cv?${q.app ? `app=${encodeURIComponent(q.app)}` : `candidate=${encodeURIComponent(q.candidate ?? "")}`}`;
/** The Prepared CV (the CV with the CAREER141 box stamped), with one-off box details. */
export const preparedCvUrl = (app: string, extra: Record<string, string> = {}) =>
  `${OLD_SERVER}/api/ui/prepared-cv?${new URLSearchParams({ app, ...extra })}`;

// pdf.js and downloads read old-server files with the person's session: the signed-in
// app registers how to get it (CvSession below), the CV viewer asks for it.
let cvSession: () => Promise<Record<string, string>> = async () => ({});
export const cvHeaders = (url: string) => (url.startsWith(OLD_SERVER) ? cvSession() : Promise.resolve({}));
/** Save an old-server file (a CV, a Prepared CV) under a name, with the session. */
export async function saveLiveFile(url: string, name: string): Promise<boolean> {
  const res = await fetch(url, { headers: await cvHeaders(url) }).catch(() => null);
  if (!res?.ok) return false;
  const a = document.createElement("a");
  a.href = globalThis.URL.createObjectURL(await res.blob());
  a.download = name;
  a.click();
  setTimeout(() => globalThis.URL.revokeObjectURL(a.href), 10_000);
  return true;
}
/**
 * The candidate and JD buttons the old server runs for us (D7, ta-system #30):
 * Add-on, Backup, add to another job, the Database CVs shortlist, approve and
 * re-read the JD, interview, offer and placement. A placement goes as a form with
 * the signed offer letter. The answer is the TA System's own sentence.
 */
export async function candidateCall(body: Record<string, unknown>, letter?: File | null): Promise<{ ok: boolean; message: string }> {
  const url = `${OLD_SERVER}/api/ui/candidate`;
  const auth = await cvHeaders(url);
  let init: RequestInit;
  if (letter) {
    const form = new FormData();
    form.append("payload", JSON.stringify(body));
    form.append("letter", letter);
    init = { method: "POST", headers: auth, body: form };
  } else {
    init = { method: "POST", headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify(body) };
  }
  const res = await fetch(url, init).catch(() => null);
  const got = (await res?.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  return { ok: !!got?.ok, message: got?.message ?? "Could not reach the TA System. Check your connection and try again." };
}

/** One candidate's offers (to name the offer a placement is for). */
export async function candidateOffers(openingId: string, appId: string): Promise<{ id: string; status: string }[] | null> {
  const url = `${OLD_SERVER}/api/ui/candidate?${new URLSearchParams({ opening: openingId, app: appId })}`;
  const res = await fetch(url, { headers: await cvHeaders(url) }).catch(() => null);
  const got = (await res?.json().catch(() => null)) as { ok?: boolean; offers?: { id: string; status: string }[] } | null;
  return got?.ok ? (got.offers ?? []) : null;
}

function CvSession() {
  const session = useSessionHeaders();
  useEffect(() => {
    cvSession = session;
  }, [session]);
  return null;
}
/** Headers with the person's plain Clerk session, which the old server reads like its own cookie. */
export const useSessionHeaders = (LIVE
  ? () => {
      const { getToken } = useAuth();
      return async (): Promise<Record<string, string>> => {
        const token = await getToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      };
    }
  : () => async () => ({})) as () => () => Promise<Record<string, string>>;

// The sign-in screen's Clerk hook, with the same stand-in for a build without a backend.
export const useDoorSignIn = (LIVE ? useSignIn : () => ({ isLoaded: false, signIn: undefined, setActive: undefined })) as typeof useSignIn;

/** Sign out: Clerk's own when live (the menu's Sign out used to be only a link, so nobody was ever signed out). */
export const useDoorSignOut = (LIVE ? () => useClerk().signOut : () => undefined) as () => (() => Promise<void>) | undefined;

/** A Clerk failure in a sentence the person can act on. */
export function errorText(e: unknown): string {
  if (isClerkAPIResponseError(e)) return e.errors[0]?.longMessage ?? e.errors[0]?.message ?? "Could not sign in.";
  return "Could not sign in. Check your connection and try again.";
}

const Live = createContext(false);
/** Whether this screen should read the backend instead of its sample data. */
export const useLive = () => useContext(Live);

export function Backend({ children }: { children: ReactNode }) {
  if (!LIVE || !client) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        {/* The owner's sign-in screen (src/app/signin/LoginScreen.tsx), Clerk underneath:
            the same accounts as AURA. */}
        <SignedOut>
          <LoginScreen />
        </SignedOut>
        <SignedIn>
          <Live.Provider value={true}>
            <WhoIsLooking />
            <LiveWorkday />
            <CvSession />
            <LiveBell />
            <KeepSignedIn />
            {children}
          </Live.Provider>
        </SignedIn>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

// The door's functions, named by path: the TA repo owns their types.
export const door = {
  whoAmI: makeFunctionReference<"query">("ui/me:whoAmI"),
  board: makeFunctionReference<"query">("ui/pipeline:board"),
  move: makeFunctionReference<"mutation">("ui/pipeline:move"),
  shortlist: makeFunctionReference<"mutation">("ui/pipeline:shortlist"),
  openings: makeFunctionReference<"query">("ui/openings:list"),
  summary: makeFunctionReference<"query">("ui/opening:summary"),
  setFollowUp: makeFunctionReference<"mutation">("ui/opening:setFollowUp"),
  setQuestions: makeFunctionReference<"mutation">("ui/manage:setQuestions"),
  scoops: makeFunctionReference<"query">("ui/opening:scoops"),
  matches: makeFunctionReference<"query">("ui/opening:matches"),
  strategies: makeFunctionReference<"query">("ui/opening:strategies"),
  postApplicants: makeFunctionReference<"query">("ui/opening:postApplicants"),
  acceptStrategies: makeFunctionReference<"mutation">("ui/manage:acceptStrategies"),
  submitStrategies: makeFunctionReference<"mutation">("ui/manage:submitStrategies"),
  removeFromOpening: makeFunctionReference<"mutation">("ui/manage:removeFromOpening"),
  notForJob: makeFunctionReference<"mutation">("ui/manage:notForJob"),
  addPost: makeFunctionReference<"mutation">("ui/posts:addPost"),
  updatePost: makeFunctionReference<"mutation">("ui/posts:updatePost"),
  setPostStatus: makeFunctionReference<"mutation">("ui/posts:setPostStatus"),
  deletePost: makeFunctionReference<"mutation">("ui/posts:deletePost"),
  moveCvs: makeFunctionReference<"mutation">("ui/posts:moveCvs"),
  postsList: makeFunctionReference<"query">("ui/posts:list"),
  today: makeFunctionReference<"query">("ui/day:today"),
  compose: makeFunctionReference<"query">("ui/email:compose"),
  settle: makeFunctionReference<"mutation">("ui/email:settle"),
  emails: makeFunctionReference<"query">("ui/email:emails"),
  sendMidday: makeFunctionReference<"action">("ui/emailSend:sendMidday"),
  // AURA on Today (E5 group 1): the TA's desk, and one question to Claude Haiku.
  desk: makeFunctionReference<"query">("ui/desk:desk"),
  things: makeFunctionReference<"query">("ui/desk:things"),
  askToday: makeFunctionReference<"action">("ui/aura:askToday"),
  // The lead's AURA home (19 Nov): every TA's day, decisions and open roles.
  leadDesk: makeFunctionReference<"query">("ui/lead:desk"),
  // The Director's and Ops's AURA homes (19 Nov).
  directorDesk: makeFunctionReference<"query">("ui/homes:director"),
  opsDesk: makeFunctionReference<"query">("ui/homes:ops"),
  // AURA's day plan, phase 1 (19 Nov): draft, approve, tick, close.
  planToday: makeFunctionReference<"query">("ui/plan:today"),
  planSaveDraft: makeFunctionReference<"mutation">("ui/plan:saveDraft"),
  planApprove: makeFunctionReference<"mutation">("ui/plan:approve"),
  planSetTask: makeFunctionReference<"mutation">("ui/plan:setTask"),
  planClose: makeFunctionReference<"mutation">("ui/plan:close"),
  planSnooze: makeFunctionReference<"mutation">("ui/plan:snooze"),
  planChange: makeFunctionReference<"action">("ui/planTalk:change"),
  scoopUploadUrl: makeFunctionReference<"mutation">("ui/opening:scoopUploadUrl"),
  queueScoop: makeFunctionReference<"mutation">("ui/opening:queueScoop"),
  refreshChecks: makeFunctionReference<"mutation">("ui/day:refreshChecks"),
  startDay: makeFunctionReference<"mutation">("ui/day:start"),
  addPosition: makeFunctionReference<"mutation">("ui/day:addPosition"),
  setWorkType: makeFunctionReference<"mutation">("ui/day:setWorkType"),
  excuseCheck: makeFunctionReference<"mutation">("ui/day:excuseCheck"),
  saveCheck: makeFunctionReference<"mutation">("ui/day:saveCheck"),
  setWorkingStage: makeFunctionReference<"mutation">("ui/day:setWorkingStage"),
  bell: makeFunctionReference<"query">("ui/day:bell"),
  markRead: makeFunctionReference<"mutation">("ui/day:markRead"),
  markAllRead: makeFunctionReference<"mutation">("ui/day:markAllRead"),
};

/** The board's columns in the backend's words, in the same order as the UI's STAGES. */
export const STAGE_KEYS = [
  "ta_follow_up", "ai_follow_up", "director_review", "director_shortlist", "client_shortlist",
  "interview", "offer", "placed", "rejected", "dropped_out",
] as const;

/** One card as the door sends it (convex/ui/rules.ts toCard). */
export type DoorCard = {
  id: string; stage: string; name: string; title: string | null; company: string | null;
  location: string | null; years: number | null; noticeDays: number | null; phone: string | null;
  email: string | null; channel: string | null; setNumber: number | null; addOn: boolean;
  backup: boolean; owned: boolean; mine: boolean; lockedBy: string | null; missing: string[];
};
export type DoorBoard = Answer<{ opening: { id: string; title: string }; columns: { stage: string; label: string; count: number; capped: boolean; cards: DoorCard[] }[] }>;
/** One card on the Openings page, as ui/openings:list sends it. */
export type DoorOpening = { id: string; client: string; title: string; status: "active" | "hold" | "placed" | "lost"; priority: 1 | 2 | 3 | 4 | 5; days: number; team: string[]; made: number; website: boolean };
export type DoorOpenings = Answer<{ openings: DoorOpening[]; capped: string[] }>;
export type DoorDone = Answer<{ message: string }>;

/** The real opening this page shows: ?job=<id> in the address (the id in AURA's own address). */
export function jobFromAddress(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("job");
}

/** Every door answer: the data, or a sentence saying why not. */
/** One position on the TA's desk (ui/desk:desk). */
export type DoorDeskPosition = {
  id: string; title: string; client: string; priority: string | null; day: number; target: number | null;
  skills: string[]; years: [number, number | null]; salary: string | null; where: string; hiring: string | null;
  pipeline: number; cvsToday: number; director: number; jdApproved: boolean; linkedinLive: boolean;
  strategies: { name: string; waiting: boolean }[];
};
/** AURA's reply on Today (ui/aura:askToday). `where` is a position id on the desk. */
export type AuraReply =
  | { kind: "plan"; headline: string; steps: { at: string; what: string; where?: string; tone: "brand" | "warn" | "info" | "none" }[] }
  | { kind: "answer"; say: string; rows: { main: string; meta?: string; where?: string }[]; chips: string[]; warn: string[] };

export type Answer<T> = ({ ok: true } & T) | { ok: false; message: string };

export type Me = Answer<{ id: string; name: string; initials: string; email: string; role: string }>;

/** The signed-in person; undefined while loading, null in sample mode. */
export function useSignedIn(): Me | undefined | null {
  const live = useLive();
  const me = useDoorQuery(door.whoAmI, live ? {} : "skip") as Me | undefined;
  return live ? me : null;
}

/** The backend's role words in the UI's roles. Admin works as a lead does (desk-wide). */
const ROLE_OF: Record<string, Role> = { ta: "TA", ta_support: "TA Support", ta_lead: "Lead", admin: "Admin", director: "Director", ops: "Ops" };
const TITLE_OF: Record<Role, string> = { TA: "Talent Acquisition", "TA Support": "TA Support", Lead: "TA Lead", Admin: "Admin", Director: "Director", Ops: "Ops" };

/** "Keep me signed in" off: Clerk keeps a session for days, so when the box was left unticked
 *  the session ends with the browser - a new browser session (no mark in sessionStorage) signs out. */
function KeepSignedIn() {
  const { signOut } = useClerk();
  useEffect(() => {
    try {
      if (localStorage.getItem("ta-ui:keep") === "0" && !sessionStorage.getItem("ta-ui:here")) void signOut();
      sessionStorage.setItem("ta-ui:here", "1");
    } catch {}
  }, [signOut]);
  return null;
}

/** Tells every screen who is signed in: their real name and role from the backend. */
function WhoIsLooking() {
  const me = useQuery(door.whoAmI, {}) as Me | undefined;
  useEffect(() => {
    if (!me?.ok) return;
    const role = ROLE_OF[me.role] ?? "TA";
    setSignedIn({ role, name: me.name, title: me.role === "admin" ? "Admin" : TITLE_OF[role] });
  }, [me]);
  return null;
}

/** One position on today's workday, as ta/workdays:dashboard sends it. */
export type DayCheck = { key: string; label: string; status?: string; progress?: string; exception?: { reason: string } };
export type DayJob = { jobId: string; title: string; workType: "100%" | "Follow-up" | "Add-on"; eodSentAt?: number; checks: DayCheck[]; eodChecks?: DayCheck[] };
export type DayView = { id: string; date: string; startedAt: number; finishedAt: number | null; jobs: DayJob[]; staleChecklists?: string[] };
export type DayPayload = {
  canWork: boolean; active: DayView | null; history: DayView[]; lastFinishedAt: number | null; lastFinishedDate: string | null;
  options: { id: string; title: string; workType?: "100%" | "Follow-up" | "Add-on" }[];
};
export type DoorDay = Answer<{ view: DayPayload }>;

const colomboToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });

/** Today's real workday into src/lib/workday.ts, so every screen's gate and Today follow it. */
function LiveWorkday() {
  goLive();
  const got = useQuery(door.today, {}) as DoorDay | undefined;
  const refresh = useMutation(door.refreshChecks);
  useEffect(() => {
    if (!got?.ok) return void (got && setLiveDay("none", null));
    const v = got.view;
    // A day closed by today's EOD is no longer "active": it is the newest in history.
    const day = v.active ?? v.history.find((d) => d.date === colomboToday()) ?? null;
    setLiveDay(day ? { id: day.id, startedAt: day.startedAt, finishedAt: day.finishedAt } : "none", v);
    // Positions computed live: ask for one stored recompute (the old route's step).
    if (v.active?.staleChecklists?.length) void refresh({ workdayId: v.active.id, jobIds: v.active.staleChecklists }).catch(() => {});
  }, [got, refresh]);
  return null;
}

type DoorBell = Answer<{ rows: { unreadCount: number; notifications: { id: string; type: string; title: string; body: string; jobId: string | null; read: boolean }[] } }>;
// Notifications that ask for something to be done sit under "Needs you"; the rest are updates.
const NEEDS = new Set(["strategy_assigned", "workday_exception", "opening_access_requested", "eod_stuck", "eod_reminder", "workday_expired", "eod_lead_digest"]);
const ICON: Record<string, Alert["icon"]> = { strategy_assigned: "task", workday_exception: "task", eod_reminder: "task", opening_changed: "person", candidate_placed: "person" };

/** The person's real notifications into the bell (src/app/alerts/data.ts). */
function LiveBell() {
  const got = useQuery(door.bell, { limit: 30 }) as DoorBell | undefined;
  const one = useMutation(door.markRead);
  const all = useMutation(door.markAllRead);
  useEffect(() => {
    if (!got?.ok) return;
    setLiveAlerts(
      got.rows.notifications.map((n) => ({
        id: n.id, title: n.title, body: n.body, unread: !n.read, needs: NEEDS.has(n.type), icon: ICON[n.type] ?? "bell",
        href: n.jobId ? `/openings/demo?job=${n.jobId}` : "/today",
      })),
      (id) => void (id ? one({ notificationId: id }) : all({})).catch(() => {}),
    );
  }, [got, one, all]);
  return null;
}
