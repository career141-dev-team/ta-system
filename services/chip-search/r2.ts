/**
 * Reads a CV's text from Cloudflare R2 (28 Nov 2026). The CV reader uploads
 * each CV's full text there and the database keeps only its key
 * (convex/cvs/cvExtraction.ts), so the words of the CV - what the query agent
 * searches for "speaks Tamil" or "led a team of 20" - are not in the nightly
 * export. This fetches them by key, read only, and keeps a copy on the
 * server's disk so each CV is fetched once.
 *
 * Signed by hand (AWS Signature V4, node:crypto): the service's container has
 * no AWS package and this is one GET. Checked against Amazon's own published
 * example in tests/chipagent2.test.ts.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const sha = (s: string | Buffer) => crypto.createHash("sha256").update(s).digest("hex");
const hmac = (k: string | Buffer, s: string) => crypto.createHmac("sha256", k).update(s).digest();
const EMPTY = sha("");

/** The Authorization header for one request with no body. `headers` are the ones to sign, lower-case names. */
export function sign(o: { method: string; path: string; headers: Record<string, string>; region: string; accessKey: string; secret: string; amzDate: string }): string {
  const names = Object.keys(o.headers).sort();
  const day = o.amzDate.slice(0, 8);
  const scope = `${day}/${o.region}/s3/aws4_request`;
  const request = [o.method, o.path, "", ...names.map((n) => `${n}:${o.headers[n].trim()}`), "", names.join(";"), o.headers["x-amz-content-sha256"] ?? EMPTY].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${o.secret}`, day), o.region), "s3"), "aws4_request");
  const signature = crypto.createHmac("sha256", key).update(["AWS4-HMAC-SHA256", o.amzDate, scope, sha(request)].join("\n")).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${o.accessKey}/${scope},SignedHeaders=${names.join(";")},Signature=${signature}`;
}

export type R2 = { endpoint: string; bucket: string; accessKey: string; secret: string };

/** The same four settings the backend uses (convex/storage/r2.ts). Null when any is missing: the job then reads only its disk copy. */
export function r2FromEnv(env: Record<string, string | undefined> = process.env): R2 | null {
  const endpoint = (env.R2_ENDPOINT || "").trim().replace(/\/+$/, ""), bucket = (env.R2_BUCKET_NAME || "").trim();
  const accessKey = (env.R2_ACCESS_KEY_ID || "").trim(), secret = (env.R2_SECRET_ACCESS_KEY || "").trim();
  return endpoint && bucket && accessKey && secret ? { endpoint, bucket, accessKey, secret } : null;
}

/** One object as text. Null when it is not there; throws on anything else, so a wrong key or a refused request is not read as "no CV text". */
export async function r2Get(r2: R2, key: string): Promise<string | null> {
  const host = new URL(r2.endpoint).host;
  const p = `/${r2.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
  const headers = { host, "x-amz-content-sha256": EMPTY, "x-amz-date": amzDate };
  const res = await fetch(`${r2.endpoint}${p}`, { headers: { ...headers, authorization: sign({ method: "GET", path: p, headers, region: "auto", accessKey: r2.accessKey, secret: r2.secret, amzDate }) }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Cloudflare answered ${res.status} for a CV text`);
  return await res.text();
}

/** Where a key's copy sits on disk. Null for a key that could step out of the folder. */
export function cachePath(dir: string, key: string): string | null {
  const rel = key.replace(/^cv-rawtext\//, "");
  if (!rel || rel.includes("..") || /^[\\/]/.test(rel) || !/^[\w./-]+$/.test(rel)) return null;
  return path.join(dir, rel);
}

/** A CV's text: the disk copy first, else Cloudflare (and the copy is kept). */
export async function rawText(key: string, dir: string, r2: R2 | null): Promise<{ text?: string; from: "disk" | "cloudflare" | "none" }> {
  const file = cachePath(dir, key);
  if (!file) return { from: "none" };
  try { return { text: fs.readFileSync(file, "utf8"), from: "disk" }; } catch { /* not copied yet */ }
  if (!r2) return { from: "none" };
  const text = await r2Get(r2, key);
  if (text == null) return { from: "none" };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return { text, from: "cloudflare" };
}
