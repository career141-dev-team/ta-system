/**
 * The HTTP door the Ops System writes through (ops docs/15 Part E).
 *
 * Four rules, all of them enforced here so no single endpoint can forget one:
 *
 *  - **The same key as the reads** (`OPS_API_TOKEN`), and 503 while it is
 *    unset, so a half-configured server refuses rather than half-works.
 *  - **One switch.** `OPS_API_WRITES_ENABLED` must say `on`. Off - which is
 *    what a fresh server is - every write answers 503 and says so, and the
 *    Ops System keeps it in its own outbox until somebody turns it on. That
 *    is how the reads can go live before the writes do.
 *  - **An idempotency key on every write.** Ops retries after an outage, so
 *    the same write will arrive twice; the second time it is answered from
 *    the first answer and nothing happens again.
 *  - **One named actor.** `OPS_API_ACTOR_EMAIL` names the TA user every
 *    Ops-originated change is recorded as. Unset or unknown, the writes
 *    refuse: an unattributable change to a live opening is worse than none.
 */

import { makeFunctionReference, type FunctionReference } from "convex/server";
import { httpAction } from "../_generated/server";
import { hasPartnerBearerToken } from "../lib/partnerReadAuth";

const query = <Args extends Record<string, unknown>, Returns>(name: string) =>
  makeFunctionReference<"query", Args, Returns>(name) as unknown as FunctionReference<"query", "internal", Args, Returns>;
const mutation = <Args extends Record<string, unknown>, Returns>(name: string) =>
  makeFunctionReference<"mutation", Args, Returns>(name) as unknown as FunctionReference<
    "mutation",
    "internal",
    Args,
    Returns
  >;

const recallRef = query<{ idempotencyKey: string }, { answer: string; at: number } | null>(
  "integrations/opsWrite:recallWrite",
);
const actorRef = query<{ email: string }, { id: string; fullName: string; role: string } | null>(
  "integrations/opsWrite:opsActor",
);
const notifyRef = mutation<Record<string, unknown>, unknown>("integrations/opsWrite:opsNotify");
const createOpeningRef = mutation<Record<string, unknown>, unknown>("integrations/opsWrite:opsCreateOpening");
const workingStageRef = mutation<Record<string, unknown>, unknown>("integrations/opsWrite:opsSetWorkingStage");
const openingStatusRef = mutation<Record<string, unknown>, unknown>("integrations/opsWrite:opsSetOpeningStatus");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

const writesOn = () => (process.env.OPS_API_WRITES_ENABLED ?? "").trim().toLowerCase() === "on";

async function door(request: Request): Promise<{ ok: true; body: Record<string, unknown>; key: string } | Response> {
  const expected = process.env.OPS_API_TOKEN;
  if (!expected) return json(503, { error: "The Ops integration is not configured" });
  if (!(await hasPartnerBearerToken(request.headers.get("authorization"), expected))) {
    return json(401, { error: "Unauthorized" });
  }
  if (!writesOn()) {
    return json(503, {
      error: "Ops writes are switched off on this server (OPS_API_WRITES_ENABLED). Nothing was changed.",
    });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 64_000) {
    return json(413, { error: "Request is too large" });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json(400, { error: "Send a JSON body" });
  const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (key.length < 8 || key.length > 200) {
    return json(400, { error: "Every write needs an idempotencyKey of 8 to 200 characters" });
  }
  return { ok: true, body, key };
}

/** The TA user every Ops-originated change is recorded as. */
async function actorId(ctx: { runQuery: (ref: typeof actorRef, args: { email: string }) => Promise<unknown> }) {
  const email = (process.env.OPS_API_ACTOR_EMAIL ?? "").trim();
  if (!email) return null;
  const actor = (await ctx.runQuery(actorRef, { email })) as { id: string } | null;
  return actor?.id ?? null;
}

const text = (value: unknown, max = 500) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const looksLikeId = (value: string) => /^[A-Za-z0-9_-]{10,64}$/.test(value);

/**
 * One write, with everything the four rules ask for.
 *
 * Each endpoint below says only what it needs and what it calls; the repeat
 * check, the actor and the error shape live here so they cannot drift apart.
 */
type Door = (ctx: Parameters<Parameters<typeof httpAction>[0]>[0], request: Request) => Promise<Response>;

function handler(
  name: string,
  ref: typeof notifyRef,
  read: (body: Record<string, unknown>, actor: string) => Record<string, unknown> | string,
  needsActor = true,
): Door {
  return async (ctx, request) => {
    const open = await door(request);
    if (open instanceof Response) return open;

    const seen = await ctx.runQuery(recallRef, { idempotencyKey: open.key });
    if (seen) {
      // The same write, arriving again after a retry. Nothing happens twice.
      return json(200, { ...JSON.parse(seen.answer || "null"), repeated: true });
    }

    const actor = needsActor ? await actorId(ctx) : "";
    if (needsActor && !actor) {
      return json(503, {
        error:
          "No Ops actor is set up on this server (OPS_API_ACTOR_EMAIL must name an active TA user). " +
          "Nothing was changed, because nothing could be attributed.",
      });
    }

    const args = read(open.body, actor ?? "");
    if (typeof args === "string") return json(400, { error: args });

    try {
      const answer = await ctx.runMutation(ref, { idempotencyKey: open.key, ...args });
      console.info("[ops-write] " + name, JSON.stringify({ key: open.key.slice(0, 24) }));
      return json(200, answer);
    } catch (error) {
      // TA's own rules refused it - no reason on a Master Sheet change, a
      // client seat that cannot work a pipeline, an opening that is gone. The
      // Ops side shows this sentence to the person who pressed the button.
      const said = error instanceof Error ? error.message : "The TA System refused it.";
      return json(422, { error: said.slice(0, 300) });
    }
  };
}

const notifyWrite = handler(
  "notify",
  notifyRef,
  (body) => {
    const userId = text(body.userId, 64);
    if (!looksLikeId(userId)) return "Say which TA user to tell (userId).";
    const title = text(body.title, 200);
    if (!title) return "A bell with no title tells nobody anything.";
    return {
      userId,
      type: text(body.type, 40) || "from_ops",
      title,
      body: text(body.body, 600),
      ...(looksLikeId(text(body.jobId, 64)) ? { jobId: text(body.jobId, 64) } : {}),
    };
  },
  false,
);

const createOpeningWrite = handler("openings", createOpeningRef, (body, actor) => {
  const clientId = text(body.clientId, 64);
  const title = text(body.title, 200);
  if (!looksLikeId(clientId)) return "An opening needs the client it belongs to (clientId).";
  if (title.length < 2) return "An opening needs a title.";
  const assigned = Array.isArray(body.assignedTaIds)
    ? body.assignedTaIds.map((value) => String(value)).filter(looksLikeId).slice(0, 10)
    : [];
  const taLeadId = text(body.requestedTaLeadId ?? body.taLeadId, 64);
  return {
    actorId: actor,
    clientId,
    title,
    ...(text(body.country, 60) ? { country: text(body.country, 60) } : {}),
    ...(text(body.brief, 20_000) ? { brief: text(body.brief, 20_000) } : {}),
    assignedTaIds: assigned,
    taLeadId: looksLikeId(taLeadId) ? taLeadId : null,
    ...(text(body.priorityTier, 10) ? { priorityTier: text(body.priorityTier, 10) } : {}),
  };
});

const workingStageWrite = handler("working-stage", workingStageRef, (body, actor) => {
  const openingId = text(body.openingId, 64);
  if (!looksLikeId(openingId)) return "Which opening? (openingId)";
  const said = text(body.mode, 20) || text(body.stage, 20);
  const mode = said === "100" || said === "100%" ? "100%" : said === "add_on" || said === "Add-on" ? "Add-on" : said === "follow_up" || said === "Follow-up" ? "Follow-up" : "";
  if (!mode) return "The mode is 100%, Follow-up or Add-on.";
  const userId = text(body.userId, 64);
  return {
    actorId: actor,
    openingId,
    ...(looksLikeId(userId) ? { userId } : {}),
    mode,
  };
});

const openingStatusWrite = handler("status", openingStatusRef, (body, actor) => {
  const openingId = text(body.openingId, 64);
  if (!looksLikeId(openingId)) return "Which opening? (openingId)";
  const status = text(body.status, 20);
  if (!["open", "on_hold", "filled", "closed"].includes(status)) {
    return "The status is open, on_hold, filled or closed.";
  }
  const reason = text(body.reason, 500);
  if (reason.length < 3) return "Say why. TA records a reason on every Master Sheet change.";
  return { actorId: actor, openingId, status, reason };
});

export const opsWriteNotify = httpAction(notifyWrite);
export const opsWriteCreateOpening = httpAction(createOpeningWrite);

/**
 * `/openings/{id}/...` - the id is in the path, the rest in the body.
 *
 * Convex's router matches an exact path or a prefix, so one handler takes
 * every write under an opening and sends it on by its last segment.
 */
export const opsWriteUnderOpening = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const rest = url.pathname.slice("/integrations/v1/openings/".length).split("/").filter(Boolean);
  if (rest.length !== 2) return json(404, { error: "Unknown endpoint" });
  const [openingId, what] = rest;
  if (!looksLikeId(openingId)) return json(400, { error: "Invalid opening id" });

  // The id belongs to the path; the handlers read it from the body, so it is
  // put there once, here, rather than in each of them.
  const original = await request.text();
  const body = (() => {
    try {
      return { ...(JSON.parse(original || "{}") as Record<string, unknown>), openingId };
    } catch {
      return null;
    }
  })();
  if (!body) return json(400, { error: "Send a JSON body" });
  const again = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(body),
  });

  if (what === "status") return openingStatusWrite(ctx, again);
  if (what === "working-stage") return workingStageWrite(ctx, again);
  return json(404, { error: "Unknown endpoint" });
});
