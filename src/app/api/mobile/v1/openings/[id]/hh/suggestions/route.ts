import { revalidatePath } from "next/cache";
import { primeStore } from "@/data/prime";
import { markTablesStale, resetStore } from "@/data/primeState";
import { repo } from "@/data/store";
import { convexMutation, convexQuery } from "@/lib/convexServer";
import { mobileSuggestions } from "@/lib/mobile/suggestions";
import { parseBody, suggestionsWriteBody } from "@/lib/mobile/openingsBodies";
import { ok, refuse, signedOut } from "@/lib/mobile/respond";
import {
  chooseOpeningSuggestionCv,
  dismissOpeningSuggestion,
  findOpeningSuggestionCv,
  keepOpeningSuggestion,
  runOpeningSuggestions,
  saveEmptySuggestionsReason,
  sendOpeningSuggestionMessage,
  type SuggestionWriteDeps,
} from "@/lib/openings/suggestionWrites";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await primeStore({ openingId: id });
  const user = await currentUser();
  if (!user) return signedOut();
  if (!repo.opening(id)) return refuse(404, "This opening is no longer available.");
  const payload = await mobileSuggestions(user, id, convexQuery);
  return payload ? ok(payload) : refuse(403, "You may not have access to Suggestions for this opening.");
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await primeStore({ openingId: id });
  const user = await currentUser();
  if (!user) return signedOut();
  const body = parseBody(suggestionsWriteBody, await req.json().catch(() => null), "Check the Suggestions update and try again.");
  if (!body.ok) return refuse(400, body.message);
  const deps: SuggestionWriteDeps = { revalidatePath, convexQuery, convexMutation, markTablesStale, resetStore };
  const input = body.value;
  const result = input.action === "run" ? await runOpeningSuggestions(user, id, deps)
    : input.action === "keep" ? await keepOpeningSuggestion(user, id, input.suggestionId, deps)
      : input.action === "dismiss" ? await dismissOpeningSuggestion(user, id, input.suggestionId, deps)
        : input.action === "find_cv" ? await findOpeningSuggestionCv(user, id, input.suggestionId, deps)
          : input.action === "choose_cv" ? await chooseOpeningSuggestionCv(user, id, input.suggestionId, input.candidateId, deps)
            : input.action === "send_message" ? await sendOpeningSuggestionMessage(user, id, input.body, deps)
              : await saveEmptySuggestionsReason(user, id, input.reason, deps);
  return result.ok ? ok(result) : refuse(result.status, result.message);
}
