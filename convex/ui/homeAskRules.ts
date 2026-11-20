// convex/ui/homeAskRules.ts
//
// D11 item 5 (owner 20 Nov 2026): the two AURA chats a lead uses, with Claude Haiku
// where their word rules stop. The pure half - what the model is told and what of its
// answer reaches the screen. No database, no network: tests/uihomeask.test.ts.
//
// 1. The lead / Director / Ops home chat: the screen answers the questions it knows
//    from the real desk; anything else used to get "I can tell you ...". Haiku now
//    answers it from the same desk, read again on the backend as the person asking.
// 2. The Strategy plan chat ("put Dilini on direct headhunt tomorrow"): the screen's
//    word matching first; what it cannot place, Haiku reads into the same shape -
//    only strategies on the list, only TAs on the team, a day of this week.

export type HomeRole = "Lead" | "Director" | "Ops";

export const HOME_SYSTEM = (role: HomeRole) => `You are AURA inside Career141's recruitment desk, answering the ${role === "Lead" ? "TA Lead" : role} on their home screen.
You get their desk as JSON (the team, roles, sets, clients, interviews - whatever their role sees). Use only facts in it; if it is not there, say you do not have it. You only advise: you cannot move, send or save anything. Plain short English, no greeting.
Answer one JSON object: {"kind":"answer","say":"one or two sentences","rows":[{"main":"short line","meta":"optional detail"}],"chips":["optional short facts"],"warn":["optional short warnings"]}. At most 6 rows, 6 chips, 3 warnings.`;

/** The desk as the model sees it, cut so a big desk cannot grow the bill. */
export function homeTurn(desk: unknown, text: string): string {
  const json = JSON.stringify(desk ?? {});
  return `Desk: ${json.length > 30000 ? `${json.slice(0, 30000)}…(cut)` : json}\n\nThey ask: ${text.slice(0, 500)}`;
}

export type Said = { picks: { name: string; ta?: string }[]; day?: number; off: boolean; tas: string[]; ask?: string };

export const PLAN_SYSTEM = `You read ONE line a TA Lead types on a job's strategy plan into which strategies, which recruiters and which day, as JSON.
Use only strategy names from STRATEGIES (exactly as written) and recruiter ids from TEAM. Days: 0 = Monday ... 4 = Friday; TODAY gives today's number; "tomorrow" is today + 1, never past 4.
Answer {"picks":[{"name":"<strategy>","ta":"<id or omit>"}],"day":<0-4 or omit>,"off":<true if they want the strategies taken off>,"tas":["<ids named>"]}.
If the line names nothing you can place, answer {"ask":"one short question"}. JSON only.`;

export function planTurn(o: { text: string; strategies: string[]; tas: { id: string; name: string }[]; today: number }): string {
  return [
    `STRATEGIES: ${o.strategies.slice(0, 80).map((s) => s.slice(0, 80)).join(" | ")}`,
    `TEAM: ${o.tas.slice(0, 60).map((t) => `${t.id}=${t.name.slice(0, 60)}`).join(" | ")}`,
    `TODAY: ${o.today}`,
    `LINE: ${o.text.slice(0, 500)}`,
  ].join("\n");
}

/** The model's reading, checked against the real list and team; nothing it names
 *  outside them survives. A reading with no pick and no TA is a question. */
export function cleanPlan(raw: unknown, strategies: string[], taIds: string[], today: number): Said | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ask = typeof r.ask === "string" ? r.ask.trim().slice(0, 200) : "";
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const ids = new Set(taIds);
  const picks = (Array.isArray(r.picks) ? r.picks : [])
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : null))
    .flatMap((p) => {
      const name = p && typeof p.name === "string" ? strategies.find((s) => same(s, p.name as string)) : undefined;
      if (!name) return [];
      const ta = typeof p!.ta === "string" && ids.has(p!.ta) ? p!.ta : undefined;
      return [{ name, ...(ta ? { ta } : {}) }];
    })
    .slice(0, 30);
  const tas = [...new Set((Array.isArray(r.tas) ? r.tas : []).filter((t): t is string => typeof t === "string" && ids.has(t)))];
  const d = Number(r.day);
  const day = Number.isInteger(d) && d >= 0 && d <= 4 && d >= Math.min(today, 4) ? d : undefined;
  if (!picks.length && !tas.length) return ask ? { picks: [], off: false, tas: [], ask } : null;
  return { picks, ...(day !== undefined ? { day } : {}), off: r.off === true, tas };
}
