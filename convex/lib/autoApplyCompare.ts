// Does the reply parser agree with the lead?
//
// Clear Director replies are applied by themselves only where
// C141_SHORTLIST_AUTO_APPLY is on; everywhere else they wait on Shortlist
// decisions for a lead to confirm. Before that flag is turned on live, the
// owner asked for the evidence (docs/19 7.6): on the replies the parser called
// clear, did the lead confirm exactly what it proposed?
//
// That is what this measures. It reads only what is already stored — the
// proposed decisions, and, since 2 Nov, the ones the lead actually confirmed.
// Nothing here moves a candidate or changes a setting.

export type Outcome = "shortlisted" | "rejected" | "hold";

export type ComparedReply = {
  /** The stored review row id, so a disagreement can be opened and read. */
  id: string;
  receivedAt: number;
  /** True when the parser needed nobody: no review reasons were raised. */
  clear: boolean;
  proposed: { applicationId: string; outcome: Outcome }[];
  confirmed: { applicationId: string; outcome: Outcome }[];
};

export type ReplyVerdict = {
  id: string;
  receivedAt: number;
  /** Every candidate the lead decided exactly as the parser proposed. */
  agreed: boolean;
  /** One line per candidate the lead decided differently, or added, or dropped. */
  differences: { applicationId: string; proposed: Outcome | "not proposed"; confirmed: Outcome | "dropped" }[];
};

/** One reply, candidate by candidate. */
export function compareReply(reply: ComparedReply): ReplyVerdict {
  const proposed = new Map(reply.proposed.map((d) => [d.applicationId, d.outcome]));
  const confirmed = new Map(reply.confirmed.map((d) => [d.applicationId, d.outcome]));
  const differences: ReplyVerdict["differences"] = [];

  for (const [applicationId, outcome] of proposed) {
    const theirs = confirmed.get(applicationId);
    // A candidate the parser proposed and the lead left out: the lead dropped it.
    if (theirs === undefined) differences.push({ applicationId, proposed: outcome, confirmed: "dropped" });
    else if (theirs !== outcome) differences.push({ applicationId, proposed: outcome, confirmed: theirs });
  }
  for (const [applicationId, outcome] of confirmed) {
    if (!proposed.has(applicationId)) differences.push({ applicationId, proposed: "not proposed", confirmed: outcome });
  }

  return { id: reply.id, receivedAt: reply.receivedAt, agreed: differences.length === 0, differences };
}

export type Comparison = {
  /** Clear replies a lead has confirmed — the only ones that answer the question. */
  compared: number;
  agreed: number;
  changed: number;
  /** Of every reply in the window, how many the parser called clear. */
  clearShare: { clear: number; unclear: number };
  /** The disagreements, newest first, for the owner to read. */
  disagreements: ReplyVerdict[];
  /** Plain words for the pipeline log, so nobody has to read JSON. */
  summary: string;
};

export function compareReplies(replies: ComparedReply[]): Comparison {
  const clear = replies.filter((r) => r.clear);
  const verdicts = clear.map(compareReply);
  const disagreements = verdicts
    .filter((v) => !v.agreed)
    .sort((a, b) => b.receivedAt - a.receivedAt);
  const agreed = verdicts.length - disagreements.length;
  const share = Math.round((agreed / Math.max(1, verdicts.length)) * 100);

  return {
    compared: verdicts.length,
    agreed,
    changed: disagreements.length,
    clearShare: { clear: clear.length, unclear: replies.length - clear.length },
    disagreements,
    summary: verdicts.length
      ? `${agreed} of ${verdicts.length} clear replies were confirmed exactly as read (${share}%). ` +
        `${disagreements.length} were changed by the lead. ` +
        `In the same window ${clear.length} replies read clearly and ${replies.length - clear.length} needed a person either way.`
      : `No clear reply has been confirmed by a lead yet, so there is nothing to compare. ` +
        `${clear.length} read clearly and ${replies.length - clear.length} needed a person.`,
  };
}

/** What the query and the pipeline report both return. */
export type AutoApplyReport = Comparison & {
  days: number;
  flag: "on" | "off";
  repliesInWindow: number;
  waitingOnALead: number;
  confirmedByALead: number;
  appliedAutomatically: number;
};
