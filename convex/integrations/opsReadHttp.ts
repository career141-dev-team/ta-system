/**
 * The HTTP door the Ops System reads through (ops docs/15 Part E).
 *
 * Five read-only endpoints under `/integrations/v1/`, each behind its own
 * bearer token, `OPS_API_TOKEN`. They are separate from the capacity
 * planner's endpoints and use a separate key, so one integration's key can be
 * rotated without touching the other - and the planner's key can never read
 * an opening's pipeline.
 *
 * Nothing here writes. The writes and the events feed are their own pull
 * requests, by design: a read-only first slice can go live without any way to
 * change what a TA sees.
 */

import { makeFunctionReference, type FunctionReference } from "convex/server";
import { httpAction } from "../_generated/server";
import { hasPartnerBearerToken } from "../lib/partnerReadAuth";
import type { OpsClient, OpsOpening, OpsPerson, OpsPipeline } from "./opsRead";

// These modules are not in the checked-in `_generated/api`, so they are
// referenced by name (the repository's rule for new Convex modules).
const ref = <Args extends Record<string, unknown>, Returns>(name: string) =>
  makeFunctionReference<"query", Args, Returns>(name) as unknown as FunctionReference<
    "query",
    "internal",
    Args,
    Returns
  >;

const peopleRef = ref<{ activeOnly?: boolean }, OpsPerson[]>("integrations/opsRead:opsPeople");
const clientsRef = ref<{ q?: string; nameKey?: string }, OpsClient[]>("integrations/opsRead:opsClients");
const openingsRef = ref<{ clientId?: string; status?: string }, OpsOpening[]>("integrations/opsRead:opsOpenings");
const openingRef = ref<{ openingId: string }, OpsOpening | null>("integrations/opsRead:opsOpening");
const pipelineRef = ref<{ openingId: string; stage?: string }, OpsPipeline | null>(
  "integrations/opsRead:opsPipeline",
);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

async function authenticate(request: Request): Promise<"ok" | "unauthorized" | "unconfigured"> {
  const expected = process.env.OPS_API_TOKEN;
  if (!expected) return "unconfigured";
  return (await hasPartnerBearerToken(request.headers.get("authorization"), expected)) ? "ok" : "unauthorized";
}

function authError(state: "unauthorized" | "unconfigured"): Response {
  return state === "unconfigured"
    ? json(503, { error: "The Ops integration is not configured" })
    : json(401, { error: "Unauthorized" });
}

/** A Convex id as it reaches us: opaque, but never unbounded. */
const looksLikeId = (value: string) => /^[A-Za-z0-9_-]{10,64}$/.test(value);

export const opsReadPeople = httpAction(async (ctx, request) => {
  const auth = await authenticate(request);
  if (auth !== "ok") return authError(auth);
  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("active") === "true";
  const people = await ctx.runQuery(peopleRef, activeOnly ? { activeOnly: true } : {});
  console.info("[ops-read] people", JSON.stringify({ rows: people.length, activeOnly }));
  return json(200, people);
});

export const opsReadClients = httpAction(async (ctx, request) => {
  const auth = await authenticate(request);
  if (auth !== "ok") return authError(auth);
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;
  const nameKey = url.searchParams.get("nameKey") ?? undefined;
  if ((q && q.length > 120) || (nameKey && nameKey.length > 120)) {
    return json(400, { error: "Search terms are limited to 120 characters" });
  }
  const clients = await ctx.runQuery(clientsRef, { ...(q ? { q } : {}), ...(nameKey ? { nameKey } : {}) });
  console.info("[ops-read] clients", JSON.stringify({ rows: clients.length }));
  return json(200, clients);
});

export const opsReadOpenings = httpAction(async (ctx, request) => {
  const auth = await authenticate(request);
  if (auth !== "ok") return authError(auth);
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  if (clientId && !looksLikeId(clientId)) return json(400, { error: "Invalid clientId" });
  if (status && status.length > 40) return json(400, { error: "Invalid status" });
  const openings = await ctx.runQuery(openingsRef, {
    ...(clientId ? { clientId } : {}),
    ...(status ? { status } : {}),
  });
  console.info("[ops-read] openings", JSON.stringify({ rows: openings.length }));
  return json(200, openings);
});

/**
 * One opening, and its pipeline.
 *
 * Convex's router matches an exact path or a prefix, so both live behind the
 * same prefix handler and are told apart here: `/openings/{id}` and
 * `/openings/{id}/pipeline`. Anything else under the prefix is a 404 rather
 * than a guess.
 */
export const opsReadOpening = httpAction(async (ctx, request) => {
  const auth = await authenticate(request);
  if (auth !== "ok") return authError(auth);

  const url = new URL(request.url);
  const rest = url.pathname.slice("/integrations/v1/openings/".length);
  const parts = rest.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return "";
    }
  });

  if (parts.length === 0 || !looksLikeId(parts[0])) return json(400, { error: "Invalid opening id" });
  const openingId = parts[0];

  if (parts.length === 1) {
    const opening = await ctx.runQuery(openingRef, { openingId });
    if (!opening) return json(404, { error: "Opening not found" });
    return json(200, opening);
  }

  if (parts.length === 2 && parts[1] === "pipeline") {
    const stage = url.searchParams.get("stage") ?? undefined;
    if (stage && stage.length > 40) return json(400, { error: "Invalid stage" });
    const pipeline = await ctx.runQuery(pipelineRef, { openingId, ...(stage ? { stage } : {}) });
    if (!pipeline) return json(404, { error: "Opening not found" });
    console.info("[ops-read] pipeline", JSON.stringify({ rows: pipeline.applications.length }));
    return json(200, pipeline);
  }

  return json(404, { error: "Unknown endpoint" });
});
