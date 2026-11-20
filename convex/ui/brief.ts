"use node";
// convex/ui/brief.ts
//
// AURA reads a new opening's brief with Claude Haiku (D11 item 1, owner 20 Nov 2026).
// read({ text, clients, team }) fills the New opening sheet's fields from a brief or a
// pasted JD; read({ ..., current, said }) applies the person's correction ("the client
// is Hayleys, make it P2") to the fields so far. It only fills: nothing is created or
// saved here - Create still runs the old save with its own rights and rules.
//
// The client and TA names come from the sheet, which read them from the old New
// opening page for this person (/api/ui/openings?part=form). They only narrow what the
// model may answer; a name outside them is a new client the person sees before Create.
// Every call is a row in aiRuns ("brief"), and the desk stops at AI_DAY_LIMIT_USD.

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { anthropicOn, getAnthropicClient } from "../lib/llm";
import { jsonIn } from "../lib/claudeFirst";
import { colomboDayStart } from "../../src/lib/calendar";
import { AI_DAY_LIMIT_USD, costOf } from "./auraRules";
import { BRIEF_SYSTEM, CHANGE_NOTE, briefTurn, cleanBrief, type BriefAnswer } from "./briefRules";

type Answer = ({ ok: true } & BriefAnswer) | { ok: false; message: string };
const refused = (message: string): Answer => ({ ok: false, message });
// The person is waiting on the sheet; the backend runs only a few actions at once.
const TIMEOUT_MS = 20_000;

const fields = v.object({
  role: v.string(),
  client: v.string(),
  clientKnown: v.boolean(),
  locations: v.array(v.object({ city: v.string(), people: v.number() })),
  priority: v.union(v.number(), v.null()),
  team: v.array(v.string()),
  musts: v.string(),
  hiringFor: v.union(v.literal("Local"), v.literal("Expat")),
  gender: v.union(v.literal("Any"), v.literal("Female"), v.literal("Male")),
});

export const read = action({
  args: {
    text: v.string(),
    clients: v.array(v.string()),
    team: v.array(v.string()),
    current: v.optional(fields),
    said: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Answer> => {
    const text = args.text.trim().slice(0, 20000);
    const said = args.said?.trim().slice(0, 500);
    if (!text && !said) return refused("Paste the job description or tell AURA about the role.");
    const me = (await ctx.runQuery(api.ui.me.whoAmI, {})) as { ok: true; id: string } | { ok: false; message: string };
    if (!me.ok) return refused(me.message);
    if (!anthropicOn()) return refused("AURA's AI is not switched on yet. Ask your admin to add the Anthropic key.");
    const now = Date.now();
    const day = colomboDayStart(now);
    const spent = (await ctx.runQuery(internal.ui.auraLedger.spentToday, { day })) as number;
    if (spent >= AI_DAY_LIMIT_USD) return refused("AURA has used today's AI allowance for the desk. It is back tomorrow.");

    const clients = args.clients.map((c) => c.trim()).filter(Boolean).slice(0, 1000);
    const team = args.team.map((t) => t.trim()).filter(Boolean).slice(0, 200);
    const correcting = !!(args.current && said);
    const userId = me.id as Id<"users">;
    const log = (i: number, o: number, ok: boolean, error?: string) =>
      ctx.runMutation(internal.ui.auraLedger.record, { userId, feature: "brief", day, inputTokens: i, outputTokens: o, costUsd: costOf(i, o), ok, ...(error ? { error: error.slice(0, 300) } : {}) });

    try {
      const res = await getAnthropicClient(TIMEOUT_MS).chat.completions.create({
        model: "claude-haiku-5-5",
        max_tokens: 800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: correcting ? `${BRIEF_SYSTEM}\n\n${CHANGE_NOTE}` : BRIEF_SYSTEM },
          { role: "user", content: briefTurn({ text, clients, team, current: correcting ? args.current : undefined, said: correcting ? said : undefined }) },
        ],
      });
      const used = res.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
      const got = cleanBrief(jsonIn(res.choices[0]?.message?.content ?? ""), clients, team, `${text}
${said ?? ""}`, correcting ? args.current : undefined);
      await log(used.prompt_tokens ?? 0, used.completion_tokens ?? 0, !!got, got ? undefined : "no usable JSON");
      return got ? { ok: true, ...got } : refused("AURA could not read that. Try again, or fill the fields by hand.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ui/brief] read: ${message}`);
      await log(0, 0, false, message);
      return refused(/timeout|abort/i.test(message) ? "AURA took too long to read it. Try again." : "AURA could not read it just now. Try again.");
    }
  },
});
