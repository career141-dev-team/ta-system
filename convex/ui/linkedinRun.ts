"use node";
// convex/ui/linkedinRun.ts
//
// One LinkedIn Search run in the background (26 Nov 2026): the engine
// (convex/linkedinSearch) wired to the Crustdata key, the Convex tables and Claude
// Haiku. Scheduled by ui/linkedinSearch:start, which has already checked who is
// asking, the one-run-each guard and the day's spending limit.

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createCrustdataClient, globalFetch } from "../linkedinSearch/crustdata";
import { createEngine, spendToStore, type SearchContext } from "../linkedinSearch/engine";
import { answerToEdits, checkForm } from "../linkedinSearch/check";
import { extractForm, refineForm } from "../linkedinSearch/form";
import type { Store } from "../linkedinSearch/store";
import type { CheckQuestion, Llm, StandardForm } from "../linkedinSearch/types";
import { anthropicOn, getAnthropicClient } from "../lib/llm";
import { colomboDayStart } from "../../src/lib/calendar";
import { costOf } from "./auraRules";
import { WIDEN, type RunKind } from "./linkedinRules";

const q = (name: string) => makeFunctionReference<"query">(`linkedinSearch/db:${name}`);
const m = (name: string) => makeFunctionReference<"mutation">(`linkedinSearch/db:${name}`);
const ui = {
  forRun: makeFunctionReference<"query">("ui/linkedinSearch:forRun"),
  cancelled: makeFunctionReference<"query">("ui/linkedinSearch:cancelled"),
  update: makeFunctionReference<"mutation">("ui/linkedinSearch:update"),
};

const parsed = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

/** The engine's memory, on Convex. A cancel pressed on the page shows on the running search. */
function convexStore(ctx: ActionCtx, runId: Id<"liRuns">): Store {
  return {
    upsertProfile: (r, now) => ctx.runMutation(m("upsertProfile"), { row: JSON.stringify(r), now }),
    getProfile: async (id) => parsed(await ctx.runQuery(q("getProfile"), { id })),
    findProfile: async (by) => parsed(await ctx.runQuery(q("findProfile"), by)),
    matchSaved: async (f, limit, leaveOut) => parsed(await ctx.runQuery(q("matchSaved"), { form: JSON.stringify(f), limit, leaveOut: [...leaveOut] })) ?? [],
    saveSearch: async (s) => void (await ctx.runMutation(m("saveSearch"), { search: JSON.stringify(s) })),
    getSearch: async (searchId) => {
      const s = parsed<NonNullable<Awaited<ReturnType<Store["getSearch"]>>>>(await ctx.runQuery(q("getSearch"), { searchId }));
      if (s?.state === "running" && (await ctx.runQuery(ui.cancelled, { runId }))) return { ...s, cancelRequested: true };
      return s;
    },
    findDoneSearchByFormKey: async (formKey) => parsed(await ctx.runQuery(q("doneByFormKey"), { formKey })),
    searchesForOpening: async (openingId) => parsed(await ctx.runQuery(q("searchesForOpening"), { openingId })) ?? [],
    shownProfileIds: async (scope) => new Set<string>(await ctx.runQuery(q("shownProfileIds"), scope)),
    seenBefore: (profileId, except) => ctx.runQuery(q("seenBefore"), { profileId, except }),
    // TAs do not mark people (owner, 26 Nov): they add good ones to the Excel Table.
    setMark: async () => {},
    marksFor: async () => [],
    setOutcome: async () => {},
    outcomesFor: (profileId) => ctx.runQuery(q("declinedRows"), { profileId }),
    heldBy: async (url) => (url ? await ctx.runQuery(q("heldBy"), { url }) : null),
    addedToOpening: (openingId) => ctx.runQuery(q("addedToOpening"), { openingId }),
    logSpend: async (e) => void (await ctx.runMutation(m("logSpend"), { entry: JSON.stringify(e) })),
    hasSpend: (ref, kind) => ctx.runQuery(q("hasSpend"), { ref, kind }),
    spend: async (filter) => parsed(await ctx.runQuery(q("spend"), { since: filter?.since })) ?? [],
    getPool: (role) => ctx.runQuery(q("getPool"), { role }),
    savePool: async (role, profileIds, now) => void (await ctx.runMutation(m("savePool"), { role, profileIds, now })),
    optOut: async (profileId) => void (await ctx.runMutation(m("optOut"), { profileId })),
  };
}

/** Claude Haiku reads a pasted JD; without it the engine's word rules run alone. */
function haiku(ctx: ActionCtx, userId: Id<"users">): Llm | undefined {
  if (!anthropicOn()) return undefined;
  return async ({ system, user, maxTokens }) => {
    const res = await getAnthropicClient(20_000).chat.completions.create({
      model: "claude-haiku-5-5",
      max_tokens: maxTokens ?? 700,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    });
    const i = res.usage?.prompt_tokens ?? 0;
    const o = res.usage?.completion_tokens ?? 0;
    await ctx.runMutation(internal.ui.auraLedger.record, { userId, feature: "linkedin", day: colomboDayStart(Date.now()), inputTokens: i, outputTokens: o, costUsd: costOf(i, o), ok: true });
    return res.choices[0]?.message?.content ?? "";
  };
}

type Previous = { searchId?: string; form?: StandardForm; accepted?: CheckQuestion["code"][] };
type Input = {
  text?: string;
  field?: string;
  mustHaves?: string[];
  answers?: { code: CheckQuestion["code"]; answer: string }[];
  person?: { name?: string; company?: string; url?: string };
};

export const run = internalAction({
  args: { runId: v.id("liRuns") },
  handler: async (ctx, { runId }): Promise<void> => {
    try {
      const job = await ctx.runQuery(ui.forRun, { runId });
      if (!job) return;
      const apiKey = process.env.CRUSTDATA_API_KEY;
      if (!apiKey) throw new Error("LinkedIn Search is not switched on yet.");
      const input = JSON.parse(job.input) as Input;
      const previous = parsed<Previous>(job.previous);
      const store = convexStore(ctx, runId);
      const llm = haiku(ctx, job.userId as Id<"users">);
      const crustdata = createCrustdataClient({
        apiKey,
        fetch: globalFetch,
        reserveCredits: Number(process.env.CRUSTDATA_RESERVE_CREDITS ?? 0),
        gate: {
          async acquire(bucket) {
            for (;;) {
              const wait: number = await ctx.runMutation(m("acquire"), { bucket });
              if (!wait) return;
              await ctx.runMutation(ui.update, { runId, stage: "waiting" });
              await new Promise((r) => setTimeout(r, wait));
            }
          },
        },
        onSpend: spendToStore(store),
      });
      const engine = createEngine({ crustdata, store, llm });
      const sc: SearchContext = {
        userId: job.userId,
        openingId: job.openingId ?? undefined,
        accepted: previous?.accepted ?? [],
        onProgress: (e) => void ctx.runMutation(ui.update, { runId, stage: e.stage }),
      };
      const need = () => {
        if (!previous?.searchId) throw new Error("Run the search first.");
        return previous.searchId;
      };

      const kind = job.kind as RunKind;
      let out: object;
      if (kind === "search") {
        // The AI's reading is kept per JD text, so the same JD gives the same search and costs nothing.
        const cache = { get: (key: string) => ctx.runQuery(q("cacheGet"), { key }), set: async (key: string, value: string) => void (await ctx.runMutation(m("cacheSet"), { key, value })) };
        const form = await extractForm({ text: input.text, opening: job.opening ?? undefined }, { llm, cache });
        out = await engine.searchForm(form, sc, checkForm(form, sc.accepted));
      } else if (kind === "answer" || kind === "confirm") {
        if (!previous?.form) throw new Error("Run the search first.");
        let form = previous.form;
        const accepted = new Set(sc.accepted);
        for (const a of input.answers ?? []) {
          const edits = answerToEdits(form, a.code, a.answer);
          if (edits && Object.keys(edits).length) form = refineForm(form, edits).form;
          // An answered question is never asked again (26 Nov 2026): the form still
          // carries what raised it (two places named in the JD), so it came back for ever.
          accepted.add(a.code);
        }
        sc.accepted = [...accepted];
        out = await engine.searchForm(form, { ...sc, marketCountSeen: kind === "confirm" });
      } else if (kind === "more") out = await engine.showMore(need(), sc);
      else if (kind === "widen") {
        const field = WIDEN.find((f) => f === input.field);
        if (!field) throw new Error("Pick what to widen.");
        out = await engine.widen(need(), field, sc);
      } else if (kind === "refine") out = await engine.refine(need(), { mustHaves: input.mustHaves ?? [] }, sc);
      else out = { status: "found", ...(await engine.findOnePerson(input.person ?? {}, sc)) };

      // What was already answered travels with the chat, through show more, widen and refine too.
      out = { ...out, accepted: sc.accepted };
      const { status, error } = out as { status?: string; error?: string };
      await ctx.runMutation(ui.update, {
        runId,
        state: status === "failed" ? "failed" : status === "cancelled" ? "cancelled" : "done",
        out: JSON.stringify(out),
        ...(status === "failed" ? { message: (error ?? "The search failed.").slice(0, 300) } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ui/linkedinRun] ${message}`);
      await ctx.runMutation(ui.update, { runId, state: "failed", message: message.slice(0, 300) });
    }
  },
});
