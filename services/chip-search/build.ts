/**
 * The nightly card builder (26 Nov 2026). Reads tonight's read-only export of
 * candidates and their job histories (export.sql, emails/phones removed; the name is
 * used only for the query agent's table, never for a card),
 * and gives every candidate that has no card yet a card from Haiku. Cards of
 * candidates no longer in the export are dropped. A card is NOT rebuilt when its
 * record changes: many cards were made from the full CV file (passes 2-3,
 * 25-26 Nov), which this export does not carry, so a rebuild would thin them. Writes the new cards file next to the old one and
 * swaps it in; the service is then told to reload (nightly.sh).
 *
 * Never writes to the database. At most CHIP_NIGHTLY_MAX cards a night
 * (default 3,000, about $2 at Haiku prices); the rest wait for the next night.
 *
 *   node build.ts          build and swap
 *   node build.ts plan     counts only
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { lines, histories, cvText, cvDate, searchText } from "./read";
import { PROFILE_SYSTEM, profileUser, finishProfile, jsonOf } from "../../convex/lib/search/profile";

const DIR = process.env.CHIP_DIR || "/data";
const CARDS = path.join(DIR, "cards.jsonl");
const KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.CHIP_MODEL || "claude-haiku-5-5";
const MAX = Number(process.env.CHIP_NIGHTLY_MAX || 3000);
const PARALLEL = 4;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

const merged = (c: any) => !!(c.mergedInto || c.mergedIntoId || c.mergedIntoCandidateId || c.status === "merged" || c.isDuplicate);
const taYears = (c: any) => (typeof c.verifiedExperienceYears === "number" ? c.verifiedExperienceYears : typeof c.taExperienceYears === "number" ? c.taExperienceYears : null);
const norm = (s: string) => (s || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\b(pvt|private|ltd|limited|plc|inc|llc|co)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const IT = /\b(it|i\.t\.|ict|information technology|information systems|it infrastructure)\b/i;
const BOSS = /\b(manager|head|director|lead|chief|cio|cto)\b/i;

/** Whether the record holds an email / a phone (export.sql, 28 Nov 2026). Nothing when an older export has no flags. */
export const contactFlags = (c: any): { hasEmail?: boolean; hasPhone?: boolean } => (typeof c?.hasEmail === "boolean" ? { hasEmail: c.hasEmail, hasPhone: c.hasPhone === true } : {});

/** The model's answer into a card, with the same checks the first build ran (run.ts + fix4). */
export function card(r: { id: string; text: string; date: string; c: any }, answer: string | null): any {
  const p: any = finishProfile({ id: r.id, cvText: r.text, cvDate: r.date, taYears: taYears(r.c), mergedInto: merged(r.c) ? "merged" : null, cvFileMissing: false }, jsonOf(answer));
  if (!p.gender && (r.c.gender === "Female" || r.c.gender === "Male")) { p.gender = r.c.gender.toLowerCase(); p.genderSource = `record:${r.c.genderSource ?? "unknown"}`; }
  if (!p.dob && typeof r.c.dateOfBirth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.c.dateOfBirth)) { p.dob = r.c.dateOfBirth; p.dobSource = `record:${r.c.dateOfBirthSource ?? "unknown"}`; }
  p.answered = answer != null;
  const t = p.title || "";
  if ((IT.test(t) && BOSS.test(t) && !/project|product|program|sales|account|business|audit|risk|security officer|recruit|talent|hr|human|training|teacher|lecturer/i.test(t)) || /\b(cio|chief information officer|head of it)\b/i.test(t)) { p.roles = ["it_manager"]; p.family = "IT & Software"; }
  const age = p.dob ? (Date.now() - Date.parse(p.dob)) / (365.25 * 864e5) : null;
  if (p.years != null && (p.years > 45 || (age != null && p.years > age - 14))) { p.years = null; p.yearsSource = null; }
  const now = p.jobs?.[0]?.company ?? "";
  p.personKey = r.c.fileHash || `${norm(t)}|${norm(now)}|${p.years ?? ""}|${p.place ?? ""}`;
  p.titleKey = `${norm(t)}|${norm(now)}|${p.years ?? ""}`;
  p.builtAt = new Date().toISOString().slice(0, 10);
  Object.assign(p, contactFlags(r.c));
  return p;
}

async function haiku(user: string): Promise<string | null> {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 3000, thinking: { type: "disabled" }, system: [{ type: "text", text: PROFILE_SYSTEM, cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: user }] }),
        signal: AbortSignal.timeout(60_000),
      });
      if (r.status === 429 || r.status >= 500) throw new Error(String(r.status));
      if (!r.ok) return null;
      const j = (await r.json()) as { content?: { type: string; text?: string }[] };
      return (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    } catch {
      await new Promise((s) => setTimeout(s, 3000 * (t + 1)));
    }
  }
  return null;
}

const [mode] = process.argv.slice(2);
const hist = histories(path.join(DIR, "res.jsonl"));
const recs = new Map<string, { id: string; text: string; date: string; c: any }>();
// 28 Nov 2026: every candidate's text for the query agent's search (cvtext.jsonl, one {id, t}
// a line), written fresh each night from the export. No AI. Swapped in only with a full export.
const CVTEXT = path.join(DIR, "cvtext.jsonl");
const cvOut = mode === "plan" ? null : fs.openSync(CVTEXT + ".new", "w");
for (const c of lines(path.join(DIR, "cand.jsonl"))) {
  if (!c._id) continue;
  const h = hist.get(c._id);
  recs.set(c._id, { id: c._id, text: cvText(c, h?.h), date: cvDate(c, h?.t), c });
  if (cvOut != null && !merged(c)) {
    const t = searchText(c, h?.h, h?.x);
    // The name, so "do we have Manish Mittal" can be asked of the agent. "Unnamed candidate" is what an empty name was filled with.
    const n = typeof c.fullName === "string" && c.fullName.trim() && c.fullName.trim() !== "Unnamed candidate" ? c.fullName.trim().slice(0, 120) : undefined;
    if (t || n) fs.writeSync(cvOut, JSON.stringify({ id: c._id, t, n }) + "\n");
  }
}
if (cvOut != null) fs.closeSync(cvOut);
if (recs.size < 1000) { log(`export holds only ${recs.size} candidates - not trusting it, nothing changed`); process.exit(1); }
if (cvOut != null) fs.renameSync(CVTEXT + ".new", CVTEXT);

// The cards we keep: every one whose candidate is still in the export.
const keep: string[] = [];
const have = new Set<string>();
let dropped = 0;
const rl = readline.createInterface({ input: fs.createReadStream(CARDS, "utf8"), crlfDelay: Infinity });
for await (const l of rl) {
  if (!l) continue;
  let o: any;
  try { o = JSON.parse(l); } catch { continue; }
  const id: string = o.id;
  if (!recs.has(id)) { dropped++; continue; }
  // A kept card is not rebuilt, but an email or phone can be added to the record any day.
  const f = contactFlags(recs.get(id)!.c);
  keep.push(f.hasEmail === undefined || (o.hasEmail === f.hasEmail && o.hasPhone === f.hasPhone) ? l : JSON.stringify(Object.assign(o, f)));
  have.add(id);
}
const todo = [...recs.values()].filter((r) => !have.has(r.id));
log(`export ${recs.size}, cards kept ${keep.length}, dropped ${dropped}, to build ${todo.length} (this night at most ${MAX})`);
if (mode === "plan") process.exit(0);

const now = todo.slice(0, MAX);
const built: string[] = [];
let next = 0, failed = 0;
await Promise.all(Array.from({ length: PARALLEL }, async () => {
  while (next < now.length) {
    const r = now[next++];
    const answer = merged(r.c) ? null : await haiku(profileUser(r.text, r.date));
    if (answer == null && !merged(r.c)) failed++;
    built.push(JSON.stringify(card(r, answer)));
  }
}));
const tmp = CARDS + ".new";
fs.writeFileSync(tmp, keep.concat(built).join("\n") + "\n");
fs.copyFileSync(CARDS, CARDS + ".prev");
fs.renameSync(tmp, CARDS);
log(`cards now ${keep.length + built.length} (built ${built.length}, model failed ${failed}, ${todo.length - now.length} wait for tomorrow)`);
