// convex/lib/assistantControl.ts
//
// Who is talking to the candidate: the assistant, or a person (30 Oct).
//
// A TA takes over a conversation with the "Take over" button, or simply by
// replying from the WhatsApp Business app on their phone (Meta's message
// echoes). A conversation flagged "Needs you" — not interested, wants a
// person, upset — waits for a TA too. While a person has it the assistant
// still reads what the candidate sends and saves the details, but it says
// nothing and sends no reminders. "Hand back" gives it back, and the
// assistant reads what the TA said before it answers.
//
// Pure: no Convex imports, so it is tested on its own (tests/assistantcontrol.test.ts).

type AppLike = {
  taTookOverAt?: number | null;
  flaggedForTaReview?: boolean | null;
  taReviewReason?: string | null;
} | null | undefined;

/** Why the assistant must stay quiet on this application, or null when it may answer. */
export function assistantQuietReason(app: AppLike): string | null {
  if (!app) return null;
  if (typeof app.taTookOverAt === "number") return "A TA has taken over this conversation.";
  if (app.flaggedForTaReview) return `Waiting for a TA: ${app.taReviewReason ?? "flagged for review"}`;
  return null;
}

type MessageLike = {
  direction: string;
  channel?: string;
  subject?: string | null;
  body?: string | null;
  senderAgent?: string | null;
};

/**
 * One line of the conversation as the model reads it. Our messages were all
 * "[outbound]", so after a TA had talked to the candidate the assistant could
 * not tell their words from its own, and asked again what the TA had settled.
 */
export function historyLine(m: MessageLike): string {
  const who =
    m.direction === "inbound" ? "Candidate"
    : m.senderAgent === "ta" ? "TA (a person on our team)"
    : "Assistant";
  const where = m.channel === "email" ? ` (email${m.subject ? `: ${m.subject}` : ""})` : "";
  return `[${who}${where}] ${(m.body ?? "").trim()}`;
}

type ThreadMessage = {
  direction: string;
  channel?: string;
  sentAt?: number | string | null;
  senderAgent?: string | null;
  senderId?: string | null;
  deliveryStatus?: string | null;
  errorMessage?: string | null;
};

/**
 * Who started this opening's WhatsApp conversation (owner, 11 Nov): the
 * assistant answers only a conversation the system began - a template, a
 * follow-up, a campaign. One the candidate began, or a TA began by hand, is
 * the TA's: a TA's own number is also their working phone, and the assistant
 * answered a candidate who had written to the TA directly, told him a start
 * date he did not have, and he rang the office.
 *
 * The first WhatsApp message on the application decides. Counted: any message
 * from the candidate; one of ours that reached them (not failed, not still
 * pending, not redirected to the test number). Ours with a person behind it
 * (`senderAgent` "ta", or a `senderId` - pressed Send in the TA System) is the
 * TA's. Nothing at all: nobody started it, so nobody is answered.
 */
export function conversationStartedBy(thread: ThreadMessage[]): "system" | "candidate" | "ta" | null {
  const counted = thread
    .filter((m) => (m.channel ?? "whatsapp") === "whatsapp")
    .filter((m) => {
      if (m.direction === "inbound") return true;
      if (m.direction !== "outbound") return false;
      const status = String(m.deliveryStatus ?? "");
      if (status === "failed" || status === "bounced" || status === "pending") return false;
      if (/^Test mode/i.test(String(m.errorMessage ?? ""))) return false;
      return true;
    })
    .sort((a, b) => Number(a.sentAt ?? 0) - Number(b.sentAt ?? 0));
  const first = counted[0];
  if (!first) return null;
  if (first.direction === "inbound") return "candidate";
  return first.senderAgent === "ta" || first.senderId ? "ta" : "system";
}
