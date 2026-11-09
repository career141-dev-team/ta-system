/**
 * The contact discovery door for the Brevo clone (9 Nov). Docs: docs/CONTACT-DISCOVERY-API.md.
 *
 * Its own bearer token, `CONTACTS_API_TOKEN`, so it is never the capacity
 * planner's or the Ops System's key and can be rotated alone. Until the token
 * is set every route answers 503. Every search names the Brevo user who asked,
 * and that line is kept with the search (convex/extras/contactDiscovery.ts).
 *
 *   POST /integrations/v1/contacts/discover            { query, requestedBy } -> { id, rule, readBy }
 *   POST /integrations/v1/contacts/discover/{id}/run   { rule? }              -> { id, status }
 *   GET  /integrations/v1/contacts/discover/{id}                              -> status and counts
 *   GET  /integrations/v1/contacts/discover/{id}/rows?cursor=&limit=          -> { rows, nextCursor }
 *   GET  /integrations/v1/contacts/discover/{id}/rows.csv                     -> every row, for Excel
 */
import { makeFunctionReference } from "convex/server";
import { httpAction } from "../_generated/server";
import { hasPartnerBearerToken } from "../lib/partnerReadAuth";
import { usableEmail } from "../lib/contactRule";

const ref = {
  read: makeFunctionReference<"action">("extras/contactDiscovery:read"),
  start: makeFunctionReference<"mutation">("extras/contactDiscovery:start"),
  status: makeFunctionReference<"query">("extras/contactDiscovery:status"),
  rows: makeFunctionReference<"query">("extras/contactDiscovery:rows"),
  markExport: makeFunctionReference<"mutation">("extras/contactDiscovery:markExport"),
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });

async function denied(request: Request): Promise<Response | null> {
  const expected = process.env.CONTACTS_API_TOKEN;
  if (!expected) return json(503, { error: "Contact discovery is not configured" });
  return (await hasPartnerBearerToken(request.headers.get("authorization"), expected)) ? null : json(401, { error: "Unauthorized" });
}

async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json();
    return b && typeof b === "object" && !Array.isArray(b) ? b : null;
  } catch { return null; }
}

/** "/integrations/v1/contacts/discover/<id>[/<rest>]" -> id and rest, or null. */
export function parseDiscoverPath(pathname: string): { id: string; rest: string } | null {
  const m = /^\/integrations\/v1\/contacts\/discover\/([A-Za-z0-9_-]{10,64})(?:\/(run|rows|rows\.csv))?\/?$/.exec(pathname);
  return m ? { id: m[1], rest: m[2] ?? "" } : null;
}

const CSV_HEADERS = ["Name", "Email", "Phone", "Title", "Level", "Employer", "Location", "LinkedIn", "Years of experience", "Skills", "Previous role", "Sector", "Found as", "Matched by"];
const KIND_LABEL: Record<string, string> = { current: "Current role", previous: "Previous role", meaning: "Found by meaning, check" };

/** A cell Excel will not run as a formula, quoted when it must be. */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  // A phone number ("+94 77 123 4567") is left alone: digits and spaces cannot run.
  if (/^[=+\-@\t\r]/.test(s) && !/^\+?[\d\s()-]+$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const contactsDiscover = httpAction(async (ctx, request) => {
  const no = await denied(request);
  if (no) return no;
  const b = await body(request);
  const query = typeof b?.query === "string" ? b.query.replace(/\s+/g, " ").trim() : "";
  const requestedBy = usableEmail(typeof b?.requestedBy === "string" ? b.requestedBy : "");
  if (query.length < 3 || query.length > 500) return json(400, { error: "query must be 3 to 500 characters" });
  if (!requestedBy) return json(400, { error: "requestedBy must be the email of the person asking" });
  try {
    return json(201, await ctx.runAction(ref.read, { query, requestedBy }));
  } catch (e) {
    return json(422, { error: e instanceof Error ? e.message.replace(/^.*Uncaught Error: /s, "").split("\n")[0].trim().slice(0, 200) : "Could not read that request." });
  }
});

export const contactsDiscoverUnder = httpAction(async (ctx, request) => {
  const no = await denied(request);
  if (no) return no;
  const url = new URL(request.url);
  const p = parseDiscoverPath(url.pathname);
  if (!p) return json(404, { error: "Not found" });

  if (request.method === "POST") {
    if (p.rest !== "run") return json(404, { error: "Not found" });
    const b = (await body(request)) ?? {};
    const r = await ctx.runMutation(ref.start, { id: p.id, ...(b.rule !== undefined ? { rule: b.rule } : {}) });
    return r.ok ? json(202, { id: p.id, status: "running" }) : json(r.status, { error: r.error });
  }

  if (p.rest === "") {
    const s = await ctx.runQuery(ref.status, { id: p.id });
    return s ? json(200, s) : json(404, { error: "No such search." });
  }

  if (p.rest === "rows") {
    const limit = Number(url.searchParams.get("limit") ?? 500);
    const cursor = url.searchParams.get("cursor") || null;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return json(400, { error: "limit must be 1 to 500" });
    if (cursor && cursor.length > 2048) return json(400, { error: "Invalid cursor" });
    const page = await ctx.runQuery(ref.rows, { id: p.id, cursor, limit });
    return page ? json(200, page) : json(404, { error: "No such search." });
  }

  // rows.csv: the whole list in one file, opened by Excel as it is.
  const s = await ctx.runQuery(ref.status, { id: p.id });
  if (!s) return json(404, { error: "No such search." });
  if (s.status !== "done") return json(409, { error: "The search has not finished yet." });
  const lines = [CSV_HEADERS.map(csvCell).join(",")];
  let cursor: string | null = null;
  for (let guard = 0; guard < 400; guard++) {
    const page: { rows: Record<string, unknown>[]; nextCursor: string | null } = await ctx.runQuery(ref.rows, { id: p.id, cursor, limit: 500 });
    for (const r of page.rows) {
      lines.push([
        r.name, r.email, r.phone, r.title, r.level, r.employer, r.location, r.linkedinUrl, r.experienceYears,
        r.skills, r.previousRole, r.sector, KIND_LABEL[String(r.kind)] ?? r.kind, r.matchedBy,
      ].map(csvCell).join(","));
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  await ctx.runMutation(ref.markExport, { id: p.id });
  const name = `Contacts - ${String(s.rule?.label ?? "search").replace(/[^A-Za-z0-9 ._-]/g, "").slice(0, 60)} - ${new Date().toISOString().slice(0, 10)}.csv`;
  // A byte-order mark so Excel reads names in UTF-8.
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
