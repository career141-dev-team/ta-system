// The door in front of every server route that spends money (Apify). 19 Nov: the
// Cloudflare functions for LinkedIn Search and Extract with AI had no sign-in check, so
// anyone who found the link could spend Apify credit. Now the browser sends its Clerk
// token (the same `convex` template the backend door uses) and the backend's own
// ui/me:whoAmI decides: an active, onboarded AURA user, or no call.
// Local runs set C141_BACKEND (apps/new-ui/.env.local) so nothing reaches live from a laptop.
const BACKEND = process.env.C141_BACKEND || "https://ta-system-api.career141.com";

/** Null when the caller is a signed-in AURA user; otherwise the refusal to return. */
export async function refuseUnlessSignedIn(request: Request): Promise<Response | null> {
  const auth = request.headers.get("Authorization") ?? "";
  if (!/^Bearer \S+$/.test(auth)) return Response.json({ error: "Sign in to AURA first." }, { status: 401 });
  try {
    const res = await fetch(`${BACKEND}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ path: "ui/me:whoAmI", args: {}, format: "json" }),
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { status?: string; value?: { ok?: boolean; message?: string } };
    if (data.status === "success" && data.value?.ok === true) return null;
    return Response.json({ error: data.value?.message ?? "Sign in to AURA first." }, { status: 401 });
  } catch {
    return Response.json({ error: "Could not check your sign-in. Try again." }, { status: 503 });
  }
}
