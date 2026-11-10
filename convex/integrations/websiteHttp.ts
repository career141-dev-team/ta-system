/**
 * The jobs career141.com shows (10 Nov). Docs: docs/WEBSITE-JOBS-API.md.
 *
 *   GET /integrations/v1/website/jobs  -> { jobs: WebsiteJob[] }
 *
 * Its own bearer token, `WEBSITE_API_TOKEN`, so it is never another
 * integration's key and can be rotated alone. 503 until it is set. Read-only,
 * and only what src/lib/websiteJobs.ts lets the public see. The website keeps
 * its own copy for a few minutes, so a page view never reaches this backend.
 */
import { makeFunctionReference } from "convex/server";
import { httpAction } from "../_generated/server";
import { hasPartnerBearerToken } from "../lib/partnerReadAuth";

const listedRef = makeFunctionReference<"query">("ta/website:listed");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });

export const websiteJobs = httpAction(async (ctx, request) => {
  const expected = process.env.WEBSITE_API_TOKEN;
  if (!expected) return json(503, { error: "The website feed is not configured" });
  if (!(await hasPartnerBearerToken(request.headers.get("authorization"), expected))) return json(401, { error: "Unauthorized" });
  try {
    const jobs = await ctx.runQuery(listedRef as never, {});
    return json(200, { jobs });
  } catch (e) {
    console.error("[website] could not list the jobs:", e);
    return json(500, { error: "Could not read the jobs" });
  }
});
