// The new UI's two money-spending routes on the server (24 Nov 2026). Until then they
// were Cloudflare Pages Functions (functions/api); the site is a static export, so these
// run in their own small container (new-ui-api) behind Caddy on the same address.
// Same code as before: the sign-in door first, then the shared lib. APIFY_TOKEN comes
// from /opt/new-ui/.env on the server and never reaches the browser.
// Bundled by the release (esbuild) into one file: node server.mjs, port 3200.
import http from "node:http";
import { linkedinSearch } from "../src/lib/linkedinSearch";
import { linkedinProfile } from "../src/lib/linkedinProfile";
import { refuseUnlessSignedIn } from "../src/lib/signedIn";

type Run = (token: string | undefined, body: unknown) => Promise<Response>;
const ROUTES: Record<string, Run> = {
  "/api/linkedin-search": linkedinSearch as Run,
  "/api/linkedin-profile": linkedinProfile as Run,
};

const jsonOrNull = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

http
  .createServer(async (req, res) => {
    const run = ROUTES[(req.url ?? "").split("?")[0]];
    if (!run || req.method !== "POST") {
      res.writeHead(404, { "Content-Type": "application/json" }).end('{"error":"Not found"}');
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const request = new Request(`http://local${req.url}`, { method: "POST", headers, body: raw });
    let out: Response;
    try {
      out = (await refuseUnlessSignedIn(request)) ?? (await run(process.env.APIFY_TOKEN, jsonOrNull(raw)));
    } catch {
      out = Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  })
  .listen(3200, "0.0.0.0", () => console.log("new-ui api on :3200"));
