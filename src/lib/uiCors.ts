/**
 * The new UI (new.career141.com) calls a few old-server routes from the browser
 * with the person's Clerk session token (D5/D6, 19 Nov). Only that page may.
 */
// Local runs add their own UI address (e.g. http://localhost:3000) through C141_UI_ORIGINS,
// comma-separated; unset everywhere else, so production still allows only the page above.
export const UI_ORIGINS = ["https://new.career141.com", ...(process.env.C141_UI_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean)];

export function uiCors(origin: string | null, methods = "GET, POST, OPTIONS"): Record<string, string> {
  return origin && UI_ORIGINS.includes(origin)
    ? { "access-control-allow-origin": origin, "access-control-allow-methods": methods, "access-control-allow-headers": "authorization, content-type", "access-control-max-age": "600", vary: "origin" }
    : {};
}

/** The same response with the new UI's CORS headers added. */
export function withCors(res: Response, origin: string | null): Response {
  for (const [k, v] of Object.entries(uiCors(origin))) res.headers.set(k, v);
  return res;
}
