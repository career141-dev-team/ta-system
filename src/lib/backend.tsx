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

import { ClerkProvider, SignedIn, SignedOut, SignIn, useAuth } from "@clerk/clerk-react";
import { ConvexReactClient, useQuery } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { makeFunctionReference } from "convex/server";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { setSignedIn, type Role } from "@/lib/role";

const URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

/** True when this build talks to the real backend. */
export const LIVE = Boolean(URL && CLERK_KEY);

const client = LIVE ? new ConvexReactClient(URL) : null;

const Live = createContext(false);
/** Whether this screen should read the backend instead of its sample data. */
export const useLive = () => useContext(Live);

export function Backend({ children }: { children: ReactNode }) {
  if (!LIVE || !client) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        {/* Clerk's own sign-in box until the owner's login design arrives (18 Nov).
            The same accounts as AURA; "hash" routing so the static build needs no
            sign-in page of its own. */}
        <SignedOut>
          <div className="flex min-h-dvh items-center justify-center p-4">
            <SignIn routing="hash" />
          </div>
        </SignedOut>
        <SignedIn>
          <Live.Provider value={true}>
            <WhoIsLooking />
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
export type DoorDone = Answer<{ message: string }>;

/** The real opening this page shows: ?job=<id> in the address (the id in AURA's own address). */
export function jobFromAddress(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("job");
}

/** Every door answer: the data, or a sentence saying why not. */
export type Answer<T> = ({ ok: true } & T) | { ok: false; message: string };

export type Me = Answer<{ id: string; name: string; initials: string; email: string; role: string }>;

/** The signed-in person; undefined while loading, null in sample mode. */
export function useSignedIn(): Me | undefined | null {
  const live = useLive();
  const me = useQuery(door.whoAmI, live ? {} : "skip") as Me | undefined;
  return live ? me : null;
}

/** The backend's role words in the UI's roles. Admin works as a lead does (desk-wide). */
const ROLE_OF: Record<string, Role> = { ta: "TA", ta_support: "TA Support", ta_lead: "Lead", admin: "Lead", director: "Director", ops: "Ops" };
const TITLE_OF: Record<Role, string> = { TA: "Talent Acquisition", "TA Support": "TA Support", Lead: "TA Lead", Director: "Director", Ops: "Ops" };

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
