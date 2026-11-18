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

import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexReactClient, useQuery } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { makeFunctionReference } from "convex/server";
import { createContext, useContext, type ReactNode } from "react";

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
        <Live.Provider value={true}>{children}</Live.Provider>
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

/** Every door answer: the data, or a sentence saying why not. */
export type Answer<T> = ({ ok: true } & T) | { ok: false; message: string };

export type Me = Answer<{ id: string; name: string; initials: string; email: string; role: string }>;

/** The signed-in person; undefined while loading, null in sample mode. */
export function useSignedIn(): Me | undefined | null {
  const live = useLive();
  const me = useQuery(door.whoAmI, live ? {} : "skip") as Me | undefined;
  return live ? me : null;
}
