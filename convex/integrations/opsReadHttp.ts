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
import type { OpsClient, OpsClientSet, OpsOpening, OpsPerson, OpsPipeline, OpsPlacement } from "./opsRead";

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
const clientSetsRef = ref<{ openingId: string; setNumber?: number }, OpsClientSet[] | null>(
  "integrations/opsRead:opsClientSets",
);
const placementsRef = ref<{ placementId?: string; openingId?: string }, OpsPlacement[]>(
  "integrations/opsRead:opsPlacements",
);
const preparedCvRef = ref<{ applicationId: string }, { uploadId: string } | null>(
  "integrations/opsRead:opsPreparedCvId",
);
const eventsRef = ref<
  { after?: string; limit?: number },
  { id: string; type: string; at: number; data: Record<string, unknown> }[] | null
>("integrations/opsRead:opsEventsAfter");
const cvDownloadRef = makeFunctionReference<"action", { uploadId: string }, {
  url: string;
  fileName: string;
  fileType: string;
} | null>("integrations/partnerRead:getCvDownload") as unknown as FunctionReference<
  "action",
  "internal",
  { uploadId: string },
  { url: string; fileName: string; fileType: string } | null
>;

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

  if (parts.length >= 2 && parts[1] === "client-sets") {
    const setNumber = parts.length === 3 ? Number(parts[2]) : null;
    if (setNumber !== null && (!Number.isInteger(setNumber) || setNumber < 1 || setNumber > 999)) {
      return json(400, { error: "Invalid set number" });
    }
    const sets = await ctx.runQuery(clientSetsRef, {
      openingId,
      ...(setNumber ? { setNumber } : {}),
    });
    if (!sets) return json(404, { error: "Opening not found" });
    // One set was asked for by its number, so one set comes back - not a list
    // of one, which the Ops client would read as the wrong shape.
    if (setNumber) {
      if (!sets.length) return json(404, { error: "That set does not exist on this opening" });
      return json(200, sets[0]);
    }
    return json(200, sets);
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

/**
 * Placements, which Ops reads rather than keeps.
 *
 * The package and the joining day are TA's record; the fee and the ninety
 * days of guarantee are counted from them, so Ops asks rather than copies.
 */
export const opsReadPlacements = httpAction(async (ctx, request) => {
  const auth = await authenticate(request);
  if (auth !== "ok") return authError(auth);
  const url = new URL(request.url);
  const openingId = url.searchParams.get("openingId") ?? "";
  if (!openingId || !looksLikeId(openingId)) return json(400, { error: "Say which opening (openingId)" });
  const rows = await ctx.runQuery(placementsRef, { openingId });
  return json(200, rows);
});

/** One placement, or one application's prepared CV, by the path. */
export const opsReadPlacementOrCv = httpAction(async (ctx, request) => {
  const auth = await authenticate(request);
  if (auth !== "ok") return authError(auth);
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
  if (!looksLikeId(id)) return json(400, { error: "Invalid id" });
  const rows = await ctx.runQuery(placementsRef, { placementId: id });
  if (!rows.length) return json(404, { error: "Placement not found" });
  return json(200, rows[0]);
});

/**
 * An application's prepared CV, as bytes.
 *
 * The one read that is not JSON. Ops fetches it once and keeps its own copy,
 * because the email the client received has to be reproducible a year later
 * even if TA replaces the CV.
 */
export const opsReadPreparedCv = httpAction(async (ctx, request) => {
  const auth = await authenticate(request);
  if (auth !== "ok") return authError(auth);

  const url = new URL(request.url);
  const parts = url.pathname.slice("/integrations/v1/applications/".length).split("/").filter(Boolean);
  if (parts.length !== 2 || parts[1] !== "prepared-cv") return json(404, { error: "Unknown endpoint" });
  const applicationId = decodeURIComponent(parts[0]);
  if (!looksLikeId(applicationId)) return json(400, { error: "Invalid application id" });

  const found = await ctx.runQuery(preparedCvRef, { applicationId });
  if (!found) return json(404, { error: "That application has no prepared CV" });

  try {
    const file = await ctx.runAction(cvDownloadRef, { uploadId: found.uploadId });
    if (!file) return json(404, { error: "The CV file is gone" });
    const upstream = await fetch(file.url, { signal: AbortSignal.timeout(30_000) });
    if (!upstream.ok || !upstream.body) return json(502, { error: "The CV is temporarily unavailable" });
    const filename = (file.fileName || "candidate-cv")
      .replace(/[^A-Za-z0-9 ._-]/g, "_")
      .slice(0, 160);
    return new Response(upstream.body, {
      status: 200,
      headers: new Headers({
        "cache-control": "no-store",
        "content-disposition": 'attachment; filename="' + filename + '"',
        "content-type": file.fileType || upstream.headers.get("content-type") || "application/octet-stream",
        "x-content-type-options": "nosniff",
      }),
    });
  } catch {
    return json(502, { error: "The CV is temporarily unavailable" });
  }
});

/**
 * The events feed (Part E, the events).
 *
 * Ops reads this every minute with the `at` of the last event it handled.
 * TA never waits for Ops: these rows were written in the same transaction as
 * the change itself and simply wait here until somebody asks.
 */
export const opsReadEvents = httpAction(async (ctx, request) => {
  const auth = await authenticate(request);
  if (auth !== "ok") return authError(auth);
  const url = new URL(request.url);
  const after = (url.searchParams.get("after") ?? "").trim();
  const limitSaid = url.searchParams.get("limit");
  const limit = limitSaid === null ? 100 : Number(limitSaid);
  if (after.length > 64) return json(400, { error: "That cursor is not one of ours" });
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return json(400, { error: "limit is 1 to 200" });

  const events = await ctx.runQuery(eventsRef, { ...(after ? { after } : {}), limit });
  if (!events) {
    // The cursor names an event we do not have. Saying so is better than
    // starting from the beginning, which would replay days of events.
    return json(400, { error: "That cursor is not an event in this system. Ask without one to start again." });
  }
  // The cursor to come back with is the last event's id, which is what the
  // Ops reader keeps. An empty batch hands back the one it asked with, so a
  // quiet hour cannot wind the reader backwards.
  const nextCursor = events.length ? events[events.length - 1].id : after;
  return json(200, { events, nextCursor });
});
