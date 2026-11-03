import { isConvex } from "@/data/mode";
import { repo } from "@/data/store";
import type { User } from "@/data/types";
import { mobileHeadhunting } from "@/lib/mobile/headhunting";
import type { SuggestionsPayload } from "@/lib/mobile/suggestionsTypes";
import { MAX_ROUNDS } from "@/lib/sourcing";
import { scopeSuggestions } from "@/lib/visibility";
import type { WorkdayCheck } from "@/lib/workday";

/** The website's complete Suggestions state, shaped for a phone screen. */
export async function mobileSuggestions(
  user: User,
  openingId: string,
  convexQuery: <T = unknown>(name: string, args: Record<string, unknown>) => Promise<T>,
): Promise<SuggestionsPayload | null> {
  if (!mobileHeadhunting(user, openingId)) return null;
  const opening = repo.opening(openingId);
  const client = opening ? repo.client(opening.clientId) : null;
  if (!opening || !client) return null;
  const scoped = scopeSuggestions(repo.suggestions(openingId), user);
  const users = new Map(repo.users().map((row) => [row.id, row.name]));
  const all = scoped.map(({ row, takenBy }) => ({
    id: row.id, name: row.name, headline: row.headline, company: row.company, location: row.location,
    linkedinUrl: row.linkedinUrl, tier: row.tier, why: row.why, concern: row.concern, status: row.status,
    round: row.round, generatedAt: row.generatedAt, takenByName: takenBy ? users.get(takenBy) ?? "another TA" : null,
  }));
  const everyRun = repo.suggestions(openingId);
  const round = everyRun.length ? Math.max(...everyRun.map((row) => row.round)) : 0;
  let suggestionsCheck: WorkdayCheck | null = null;
  if (isConvex() && (user.role === "ta" || user.role === "ta_support")) {
    suggestionsCheck = await convexQuery<WorkdayCheck | null>("ta/workdays:suggestionsCheck", { actorId: user.id, jobId: openingId }).catch(() => null);
  }
  const picked = repo.benchmarks(openingId).filter((row) => row.isSelected);
  return {
    apiVersion: 1,
    context: { openingId, title: opening.title, clientName: client.name, userInitials: user.name.split(" ").map((part) => part[0]).join("").slice(0, 2) },
    run: {
      round, maxRounds: MAX_ROUNDS, roundsLeft: Math.max(0, MAX_ROUNDS - round),
      steered: all.filter((row) => row.status !== "new").length,
      canRun: round < MAX_ROUNDS,
      needsEmptyReason: Boolean(suggestionsCheck?.needsEmptySuggestionsReason),
    },
    counts: {
      pending: all.filter((row) => row.status === "new").length,
      selected: all.filter((row) => row.status === "kept").length,
      dismissed: all.filter((row) => row.status === "dismissed").length,
    },
    benchmark: { count: picked.length, names: picked.map((row) => row.name ?? row.title) },
    suggestions: all,
    messages: repo.chat(openingId).map((row) => ({ id: row.id, role: row.role, body: row.body, action: row.action, affected: row.affected, at: row.at })),
  };
}
