import type { Instrumentation } from "next";

/**
 * Warm the desk once when the server starts (21 Nov, R7): after a release the first
 * person to open a page waited ~20 s while the whole desk loaded. Now it loads in the
 * background a few seconds after start - never blocking start-up or the health check,
 * and a failure only logs (the first request then loads it, as before).
 */
export async function register() {
  // The import must sit inside this `if`, not after an early return: webpack only drops it
  // from the edge build that way, and the store needs node:worker_threads (26 Nov).
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    setTimeout(() => {
      void import("@/data/prime")
        .then(({ primeStore }) => primeStore({}))
        .then(() => console.log("[warm] desk loaded at start"), (e) => console.warn("[warm] desk did not load at start:", e instanceof Error ? e.message : e));
    }, 3000);
  }
}

/**
 * Every server error as one line a person can search for (28 Sep).
 *
 * Next already prints the stack; what it does not print is the digest the
 * user was shown on the error page (src/app/error.tsx), so a TA's "Reference:
 * 1234" could not be matched to anything. `docker logs ta-prod-app | grep
 * request-error` now lists every failure with its page and reference.
 *
 * The path without its query string: a search's words, a name or a phone
 * number can sit there, and logs are kept.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : "-";
  const message = err instanceof Error ? err.message : String(err);
  console.error(
    `[request-error] ${request.method} ${request.path.split("?")[0]} ref=${digest} ${context.routeType} ${context.routePath} — ${message.slice(0, 300)}`,
  );
};
