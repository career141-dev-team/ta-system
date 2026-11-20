"use node";
// convex/ui/cvAgent.ts
//
// AURA on a CV with Claude Haiku (D11 item 4, owner 20 Nov 2026). ask({ said, box,
// cvText }) either changes what the green box says, in the TA's own words, or answers
// a question from the CV's text (rules in cvAgentRules.ts). The popup's word rules
// run first and cost nothing; only what they cannot read comes here. Nothing is saved
// here: the popup saves the box through /api/ui/cv-box (the old save and its rules).
// Every call is a row in aiRuns ("cv"), and the desk stops at AI_DAY_LIMIT_USD.

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { anthropicOn, getAnthropicClient } from "../lib/llm";
import { jsonIn } from "../lib/claudeFirst";
import { colomboDayStart } from "../../src/lib/calendar";
import { AI_DAY_LIMIT_USD, costOf } from "./auraRules";
import { CV_SYSTEM, cleanCvAnswer, cvTurn, type CvAnswer } from "./cvAgentRules";

type Answer = ({ ok: true } & CvAnswer) | { ok: false; message: string };
const refused = (message: string): Answer => ({ ok: false, message });
const TIMEOUT_MS = 20_000;

const boxText = v.object({
  designation: v.string(),
  company: v.string(),
  currentSalary: v.string(),
  expectedSalary: v.string(),
  notice: v.string(),
  notes: v.array(v.string()),
});

export const ask = action({
  args: { said: v.string(), box: v.union(boxText, v.null()), cvText: v.string() },
  handler: async (ctx, args): Promise<Answer> => {
    const said = args.said.trim().slice(0, 500);
    if (!said) return refused("Say what to do, or ask about the CV.");
    const me = (await ctx.runQuery(api.ui.me.whoAmI, {})) as { ok: true; id: string } | { ok: false; message: string };
    if (!me.ok) return refused(me.message);
    if (!anthropicOn()) return refused("AURA's AI is not switched on yet. Ask your admin to add the Anthropic key.");
    const day = colomboDayStart(Date.now());
    const spent = (await ctx.runQuery(internal.ui.auraLedger.spentToday, { day })) as number;
    if (spent >= AI_DAY_LIMIT_USD) return refused("AURA has used today's AI allowance for the desk. It is back tomorrow.");
    const userId = me.id as Id<"users">;
    const log = (i: number, o: number, ok: boolean, error?: string) =>
      ctx.runMutation(internal.ui.auraLedger.record, { userId, feature: "cv", day, inputTokens: i, outputTokens: o, costUsd: costOf(i, o), ok, ...(error ? { error: error.slice(0, 300) } : {}) });
    try {
      const res = await getAnthropicClient(TIMEOUT_MS).chat.completions.create({
        model: "claude-haiku-5-5",
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: CV_SYSTEM },
          { role: "user", content: cvTurn({ said, box: args.box, cvText: args.cvText }) },
        ],
      });
      const used = res.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
      const got = cleanCvAnswer(jsonIn(res.choices[0]?.message?.content ?? ""), args.box);
      await log(used.prompt_tokens ?? 0, used.completion_tokens ?? 0, !!got, got ? undefined : "no usable JSON");
      return got ? { ok: true, ...got } : refused("AURA could not read that. Say it another way.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ui/cvAgent] ask: ${message}`);
      await log(0, 0, false, message);
      return refused(/timeout|abort/i.test(message) ? "AURA took too long. Try again." : "AURA could not answer just now. Try again.");
    }
  },
});
