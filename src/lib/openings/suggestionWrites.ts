import { isConvex } from "@/data/mode";
import { repo } from "@/data/store";
import type { CvMatch, User } from "@/data/types";
import { gemini } from "@/lib/ai";
import { isDeskWide, isTa } from "@/lib/auth";
import { captureHistory, findCvCandidates, linkRowTo, matchLink, type CvHit } from "@/lib/cvMatch";
import { otherHolders, rowCountsFor } from "@/lib/sharedLinks";
import { linkKey } from "@/lib/url";
import { workdayErrorMessage } from "@/lib/workdayErrors";
import { decideOn, type OpeningWriteDeps } from "@/lib/openings/writes";
import { searchReasonInWords } from "@/lib/openings/researchWrites";
import { sourceFor } from "@/lib/openings/suggestionRuns";

export type SuggestionWriteOutcome =
  | { ok: true; message: string; tone?: "ok" | "note"; hits?: CvHit[]; run?: { found: number; scanned: number; queries: number; rejected: number; cost: number; note?: string } }
  | { ok: false; status: 400 | 403 | 404 | 409 | 500 | 502; message: string };

export interface SuggestionWriteDeps extends OpeningWriteDeps {}

async function maySource(user: User, openingId: string, deps: SuggestionWriteDeps) {
  return decideOn(user, "opening.sourcing", { openingId }, deps);
}

async function mayWriteSuggestion(user: User, openingId: string, suggestionId: string, deps: SuggestionWriteDeps) {
  const hit = repo.openingOf("suggestion", suggestionId);
  if (!hit.found) return { ok: false as const, status: 404 as const, message: "That suggestion is no longer there — the list may have been regenerated." };
  if (hit.openingId !== openingId) return { ok: false as const, status: 404 as const, message: "That suggestion belongs to a different opening." };
  const suggestion = repo.suggestions(openingId).find((row) => row.id === suggestionId);
  if (
    suggestion &&
    isTa(user) &&
    ((suggestion.generatedFor && suggestion.generatedFor !== user.id) ||
      (suggestion.keptBy && suggestion.keptBy !== user.id))
  ) {
    return { ok: false as const, status: 403 as const, message: "That suggestion is another recruiter's to work." };
  }
  return decideOn(user, "opening.sourcing", { openingId, ownerTaId: hit.ownerTaId }, deps);
}

function revalidateSuggestions(openingId: string, deps: SuggestionWriteDeps) {
  deps.revalidatePath(`/openings/${openingId}/hh/suggestions`);
  deps.revalidatePath(`/openings/${openingId}/hh`, "layout");
  deps.revalidatePath(`/openings/${openingId}`, "layout");
}

export async function runOpeningSuggestions(user: User, openingId: string, deps: SuggestionWriteDeps): Promise<SuggestionWriteOutcome> {
  const decision = await maySource(user, openingId, deps);
  if (!decision.ok) return decision;
  const result = await sourceFor(openingId, user.id);
  deps.revalidatePath(`/openings/${openingId}/hh/suggestions`);
  if (result.error) return { ok: false, status: 409, message: `Suggestions did not run — ${searchReasonInWords(result.error)}` };
  const searched = `${result.scanned} profiles read from ${result.queries} searches`;
  const run = { found: result.found, scanned: result.scanned, queries: result.queries, rejected: result.rejected ?? 0, cost: result.cost, ...(result.note ? { note: result.note } : {}) };
  if (result.found === 0) return {
    ok: true, tone: "note", run,
    message: result.note === "nothing_survived_filter"
      ? `No new profiles this round (${searched}) — everyone found was already suggested or in Excel Tables. Keep or reject a few, or widen the brief, then refine.`
      : `No profiles found (${searched}). Widen the brief or tick target employers on Research, then try again.`,
  };
  return { ok: true, run, message: `${result.found} new ${result.found === 1 ? "profile" : "profiles"} to review · ${searched}.` };
}

function deskWideCheck() {
  return (id: string) => { const user = repo.user(id); return Boolean(user && isDeskWide(user)); };
}

function linkFor(openingId: string, suggestion: { linkedinUrl: string | null; name: string; company: string | null }, user: User) {
  const key = linkKey(suggestion.linkedinUrl);
  const mine = rowCountsFor(user, deskWideCheck());
  return (key ? repo.findLinkByUrl(openingId, key, mine) : undefined) ?? repo.findLinkByPerson(openingId, suggestion.name, suggestion.company, mine);
}

function heldLine(match: CvMatch | null): string {
  if (!match) return "";
  if (match.strength === "possible") return `This may be ${match.fullName}, already in the database — confirm on the row. `;
  return `${match.fullName} is already in the database${match.hasCv ? " with a CV" : ""}, and the row is linked to them. `;
}

function alsoHeldLine(others: string[]): string {
  const names = others.map((id) => repo.user(id)?.name ?? "Another TA");
  if (!names.length) return "";
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return ` ${who} also ${names.length === 1 ? "has" : "have"} them in their table — whoever shortlists them first works them.`;
}

export async function keepOpeningSuggestion(user: User, openingId: string, suggestionId: string, deps: SuggestionWriteDeps): Promise<SuggestionWriteOutcome> {
  const decision = await mayWriteSuggestion(user, openingId, suggestionId, deps);
  if (!decision.ok) return decision;
  const suggestion = repo.suggestions(openingId).find((row) => row.id === suggestionId);
  if (!suggestion) return { ok: false, status: 404, message: "That suggestion is no longer there — the list may have been regenerated." };
  if (!suggestion.linkedinUrl) return { ok: false, status: 409, message: "This suggestion has no LinkedIn profile to add." };
  repo.setSuggestionStatus(suggestionId, "kept", "more_like_this", user.id);
  let held: CvMatch | null = null;
  let also = "";
  const already = linkFor(openingId, suggestion, user);
  if (!already) {
    const entryId = repo.addLink(openingId, suggestion.linkedinUrl, user.id);
    repo.updateLink(entryId, { name: suggestion.name, title: suggestion.headline, company: suggestion.company });
    held = await matchLink(entryId, user.id);
  }
  const key = linkKey(suggestion.linkedinUrl);
  if (key) also = alsoHeldLine(otherHolders(repo.linksByUrl(openingId, key), user, deskWideCheck()));
  revalidateSuggestions(openingId, deps);
  if (already) {
    const who = already.addedBy !== user.id ? `, added by ${repo.user(already.addedBy)?.name ?? "another TA"}` : "";
    return { ok: true, tone: "note", message: `${suggestion.name || "They"} ${suggestion.name ? "is" : "are"} already in Excel Tables${who}.` };
  }
  return { ok: true, message: `${heldLine(held)}${suggestion.name || "They"} selected and added to Excel Tables.${also}` };
}

export async function dismissOpeningSuggestion(user: User, openingId: string, suggestionId: string, deps: SuggestionWriteDeps): Promise<SuggestionWriteOutcome> {
  const decision = await mayWriteSuggestion(user, openingId, suggestionId, deps);
  if (!decision.ok) return decision;
  const suggestion = repo.suggestions(openingId).find((row) => row.id === suggestionId);
  if (!suggestion) return { ok: false, status: 404, message: "That suggestion is no longer there — the list may have been regenerated." };
  repo.setSuggestionStatus(suggestionId, "dismissed", "not_relevant");
  deps.revalidatePath(`/openings/${openingId}/hh/suggestions`);
  return { ok: true, message: "Marked as not selected." };
}

function profileFor(openingId: string, suggestionId: string) {
  const suggestion = repo.suggestions(openingId).find((row) => row.id === suggestionId);
  return suggestion ? { linkedinUrl: suggestion.linkedinUrl, name: suggestion.name, company: suggestion.company, title: suggestion.headline, location: suggestion.location, ...captureHistory(null) } : null;
}

export async function findOpeningSuggestionCv(user: User, openingId: string, suggestionId: string, deps: SuggestionWriteDeps): Promise<SuggestionWriteOutcome> {
  const decision = await maySource(user, openingId, deps);
  if (!decision.ok) return decision;
  const profile = profileFor(openingId, suggestionId);
  if (!profile) return { ok: false, status: 404, message: "That profile is no longer here. Reload the page." };
  try { return { ok: true, message: "Database search complete.", hits: await findCvCandidates(profile, user.id) }; }
  catch { return { ok: false, status: 502, message: "The search could not run just now. Try again." }; }
}

export async function chooseOpeningSuggestionCv(user: User, openingId: string, suggestionId: string, candidateId: string, deps: SuggestionWriteDeps): Promise<SuggestionWriteOutcome> {
  const decision = await mayWriteSuggestion(user, openingId, suggestionId, deps);
  if (!decision.ok) return decision;
  const profile = profileFor(openingId, suggestionId);
  const suggestion = repo.suggestions(openingId).find((row) => row.id === suggestionId);
  if (!profile || !suggestion) return { ok: false, status: 404, message: "That profile is no longer here. Reload the page." };
  const hit = (await findCvCandidates(profile, user.id).catch(() => [] as CvHit[])).find((row) => row.candidateId === candidateId);
  if (!hit) return { ok: false, status: 409, message: "That person is no longer offered for this profile. Press Find CV again." };
  if (!suggestion.linkedinUrl) return { ok: false, status: 409, message: "This suggestion has no LinkedIn profile to add." };
  let rowId = linkFor(openingId, suggestion, user)?.id;
  if (!rowId) {
    rowId = repo.addLink(openingId, suggestion.linkedinUrl, user.id);
    repo.updateLink(rowId, { name: suggestion.name, title: suggestion.headline, company: suggestion.company });
  }
  repo.setSuggestionStatus(suggestion.id, "kept", "more_like_this", user.id);
  await linkRowTo(rowId, hit, user.id);
  revalidateSuggestions(openingId, deps);
  return { ok: true, message: `Linked to ${hit.fullName}'s record${hit.hasCv ? " — their CV on file is used" : ""}. No new record was made.` };
}

export async function saveEmptySuggestionsReason(user: User, openingId: string, reason: string, deps: SuggestionWriteDeps): Promise<SuggestionWriteOutcome> {
  const decision = await maySource(user, openingId, deps);
  if (!decision.ok) return decision;
  try {
    await deps.convexMutation("ta/workdays:saveCheck", { actorId: user.id, jobId: openingId, kind: "emptySuggestions", reason, reasons: {}, link: "", confirmed: false });
  } catch (error) {
    return { ok: false, status: 409, message: workdayErrorMessage(error, "saveCheck") };
  }
  deps.revalidatePath("/workday");
  deps.revalidatePath(`/openings/${openingId}/hh/suggestions`);
  return { ok: true, message: "Saved." };
}

export async function sendOpeningSuggestionMessage(user: User, openingId: string, body: string, deps: SuggestionWriteDeps): Promise<SuggestionWriteOutcome> {
  const decision = await decideOn(user, "opening.act", { openingId }, deps);
  if (!decision.ok) return decision;
  const textBody = body.trim();
  if (!textBody) return { ok: false, status: 400, message: "Write a message first." };
  const opening = repo.opening(openingId);
  if (!opening) return { ok: false, status: 404, message: "That opening no longer exists." };
  repo.addChat({ openingId, role: "user", body: textBody, action: null, affected: 0, sources: [], byUserId: user.id, at: Date.now() });
  const open = repo.suggestions(openingId).filter((row) => row.status === "new");
  const roster = open.map((row) => `${(row.linkedinUrl ?? "").split("/in/")[1] ?? row.name} | ${row.tier} | ${row.name} — ${row.headline} | ${row.why} | ${row.concern ?? ""}`).join("\n");
  const prompt = `A recruiter is working a shortlist for this role and has asked you something.\n\nROLE: ${opening.title} — ${opening.locations.join(", ")} — ${opening.packageNotes}\nSPECIFICATION:\n"""\n${(opening.jdMarkdown || opening.title).slice(0, 3000)}\n"""\n\nTHE CURRENT SHORTLIST (handle | tier | who | why | concern):\n${roster || "(empty — nothing has been sourced yet)"}\n\nTHEY SAID: "${textBody}"\n\nDecide which ONE of these it is and answer in exactly that format:\n\nIf it can be settled by re-reading the people above — reordering, retiering, or dropping some:\nREFINE\nCHANGES: handle=tier or handle=drop, semicolon separated. Only people who should change.\nREPLY: one or two plain sentences telling them what you changed and why.\n\nIf it needs new people to be found:\nSEARCH\nTERMS: the specific extra search terms this implies, semicolon separated.\nREPLY: one or two sentences saying what you will look for. Mention that it spends one of the three rounds.\n\nIf it is a question about the shortlist rather than an instruction:\nANSWER\nREPLY: answer it from the evidence above. Where the evidence does not say, say that plainly rather than guessing.\n\nNever invent a person. Never claim experience the lines above do not show.`;
  const response = await gemini("rank", prompt, { maxTokens: 3000 });
  if (!response.ok) {
    repo.addChat({ openingId, role: "assistant", body: response.reason === "rate_limited" ? "The model is rate-limited right now — try again in a minute." : "I could not reach the model just then.", action: null, affected: 0, sources: [], byUserId: null, at: Date.now() });
    deps.revalidatePath(`/openings/${openingId}/hh/suggestions`);
    return { ok: true, tone: "note", message: "The assistant could not answer just now." };
  }
  const text = response.text;
  const reply = (text.match(/^REPLY:\s*([\s\S]*)$/im)?.[1] ?? text).trim().slice(0, 900);
  let action: "refine" | "search" | "answer" = "answer";
  let affected = 0;
  if (/^\s*REFINE\b/im.test(text)) {
    action = "refine";
    const line = text.match(/^CHANGES:\s*(.*)$/im)?.[1] ?? "";
    const changes: { url: string; tier?: "priority" | "screen"; drop?: boolean }[] = [];
    for (const raw of line.split(";")) {
      const [handle, what = ""] = raw.trim().split("=").map((part) => part.trim());
      if (!handle) continue;
      if (/^drop$/i.test(what)) changes.push({ url: handle, drop: true });
      else if (/^(priority|screen)$/i.test(what)) changes.push({ url: handle, tier: what.toLowerCase() as "priority" | "screen" });
    }
    const dropping = changes.filter((change) => change.drop).length;
    if (open.length > 0 && dropping >= Math.max(3, Math.ceil(open.length * 0.7))) {
      repo.addChat({ openingId, role: "assistant", body: `Taken literally that removes ${dropping} of ${open.length} — the whole list. That is usually a preference rather than a rule, so I have left it alone.\n\nIf it really is a hard requirement, the honest answer is that nobody found so far meets it, and the next step is another round with those terms rather than an empty page. Otherwise tell me to treat it as a preference and I will re-tier instead of dropping.`, action: "answer", affected: 0, sources: [], byUserId: null, at: Date.now() });
      deps.revalidatePath(`/openings/${openingId}/hh/suggestions`);
      return { ok: true, message: "The assistant replied." };
    }
    affected = repo.applyRefinement(openingId, changes);
  } else if (/^\s*SEARCH\b/im.test(text)) action = "search";
  repo.addChat({ openingId, role: "assistant", body: reply, action, affected, sources: [], byUserId: null, at: Date.now() });
  deps.revalidatePath(`/openings/${openingId}/hh/suggestions`);
  return { ok: true, message: "The assistant replied." };
}
