/** The phone Suggestions payload mirrors the website's scoped sourcing list. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "c141-mobile-suggestions-"));
process.chdir(tmp);
const { repo } = await import("@/data/store");
const { mobileSuggestions } = await import("@/lib/mobile/suggestions");
const { dismissOpeningSuggestion } = await import("@/lib/openings/suggestionWrites");
repo.reset();
const noCheck = async <T,>() => null as T;
const deps = { revalidatePath: () => undefined, convexQuery: noCheck, convexMutation: noCheck, markTablesStale: () => undefined, resetStore: () => undefined };

test("an assigned recruiter receives scoped suggestions, counts, rounds and chat", async () => {
  const ta = repo.users().find((user) => user.role === "ta" && user.isActive)!;
  const opening = repo.openingsForUser(ta)[0]!;
  const payload = await mobileSuggestions(ta, opening.id, noCheck);
  assert(payload);
  assert.equal(payload.counts.pending, payload.suggestions.filter((row) => row.status === "new").length);
  assert.equal(payload.counts.selected, payload.suggestions.filter((row) => row.status === "kept").length);
  assert(payload.run.round >= 0 && payload.run.roundsLeft >= 0);
  assert.equal(payload.context.openingId, opening.id);
});

test("another TA's unclaimed run is hidden but a claimed profile crosses", async () => {
  repo.reset();
  const tas = repo.users().filter((user) => user.role === "ta" && user.isActive);
  const ta = tas[0]!;
  const other = tas[1] ?? { ...ta, id: "u_other_ta", name: "Other TA", email: "other@example.test" };
  const opening = repo.openingsForUser(ta)[0]!;
  repo.addSuggestions(opening.id, [{ openingId: opening.id, name: "Private Result", headline: "Manager", company: "Example", location: "Colombo", linkedinUrl: "https://linkedin.com/in/private-result", tier: "priority", why: "Relevant", concern: null, sourceUrl: null, status: "new", feedback: null, round: 3, generatedAt: Date.now(), generatedFor: other.id, keptBy: null }]);
  const hidden = await mobileSuggestions(ta, opening.id, noCheck);
  assert.equal(hidden!.suggestions.some((row) => row.name === "Private Result"), false);
  const added = repo.suggestions(opening.id).find((row) => row.name === "Private Result")!;
  repo.setSuggestionStatus(added.id, "kept", "more_like_this", other.id);
  const visible = await mobileSuggestions(ta, opening.id, noCheck);
  assert.equal(visible!.suggestions.find((row) => row.name === "Private Result")?.takenByName != null, true);
});

test("a client seat cannot read Suggestions", async () => {
  const client = { id: "u_suggestions_client", name: "Client", email: "client@example.test", phone: null, routingEmail: null, role: "client" as const, initials: "CL", isActive: true };
  assert.equal(await mobileSuggestions(client, repo.openings()[0]!.id, noCheck), null);
});

test("a recruiter cannot decide another TA's suggestion by direct id", async () => {
  repo.reset();
  const ta = repo.users().find((user) => user.role === "ta" && user.isActive)!;
  const opening = repo.openingsForUser(ta)[0]!;
  repo.addSuggestions(opening.id, [{ openingId: opening.id, name: "Other TA Result", headline: "Manager", company: "Example", location: "Colombo", linkedinUrl: "https://linkedin.com/in/other-ta-result", tier: "priority", why: "Relevant", concern: null, sourceUrl: null, status: "new", feedback: null, round: 3, generatedAt: Date.now(), generatedFor: "another-ta", keptBy: null }]);
  const suggestion = repo.suggestions(opening.id).find((row) => row.name === "Other TA Result")!;
  const result = await dismissOpeningSuggestion(ta, opening.id, suggestion.id, deps);
  assert.equal(result.ok, false);
  assert.equal(repo.suggestions(opening.id).find((row) => row.id === suggestion.id)?.status, "new");
});
