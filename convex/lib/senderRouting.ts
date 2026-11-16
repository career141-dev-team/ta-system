// convex/lib/senderRouting.ts
//
// Which WhatsApp number a message to a candidate goes from, and whether a TA's
// number is ready to send — the rules, and nothing that reads the database or
// calls Meta, so they can be tested on their own (tests/senderrouting.test.ts).
//
// Each TA's own number sends their candidates' follow-ups while staying on the
// TA's phone (WhatsApp Business app coexistence, the owner, 30 Oct). A TA
// number is only used once it is `ready`; until then, and whenever it fails,
// the main Career141 line sends, so a candidate is never left unmessaged.

import { REQUIRED_TEMPLATES } from "./whatsappTemplates";

export interface SenderNumber {
  phone: string;
  /** Meta phone_number_id (the `whatchimpPhoneId` column). */
  phoneId: string;
  userId?: string;
  /** false: added but not checked with Meta. Missing: a row from before 30 Oct, used as it always was. */
  ready?: boolean;
}

const last9 = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "").slice(-9);

/**
 * The phone_number_id to send from, or null for the main line. In order:
 *  1. the number typed on the opening (`outreachWhatsAppNumber`), unless known not ready
 *  2. the candidate's owner TA's number, then the opening's first assigned TA's — only when ready
 *  3. the opening's inbound WhatsApp channel number, unless known not ready
 * A TA's number is checked before the channel number because the channel is
 * usually the main line, which would otherwise always win.
 */
export function pickSender(o: {
  override?: string | null;
  ownerTaId?: string | null;
  assignedTaIds?: string[] | null;
  channelNumber?: string | null;
  numbers: SenderNumber[];
}): SenderNumber | null {
  const byPhone = (p?: string | null) =>
    last9(p) ? o.numbers.find((n) => last9(n.phone) === last9(p) && n.ready !== false) ?? null : null;
  const byTa = (id?: string | null) => (id ? o.numbers.find((n) => n.userId === id && n.ready === true) ?? null : null);
  return byPhone(o.override) ?? byTa(o.ownerTaId) ?? byTa(o.assignedTaIds?.[0]) ?? byPhone(o.channelNumber);
}

/**
 * Meta errors that mean the sending number or its WhatsApp account cannot send
 * at all, rather than something about this candidate: payment not settled
 * (131042), account locked (131031), template missing in that account (132001),
 * number not registered (133010), token without access (10, 190, 200).
 */
export const isNumberLevelError = (metaError: string) =>
  /"code":\s*(10|190|200|131031|131042|132001|133010)\b/.test(metaError);

/**
 * Whether a message that arrived on a TA's own number is ours to handle
 * (3 Nov). A TA's number stays on their phone, so their friends, family and
 * other work chats arrive here too: only a candidate the desk is following up
 * is read, answered or filed. Everyone else is left to the TA on the phone -
 * no CV made from a holiday photo, no job reply to a cousin. The main line
 * keeps its old behaviour (`isTaLine` false).
 *
 * And only on that candidate's own line (4 Nov): the follow-up must belong to
 * the TA whose number the message reached - its owner, or with no owner yet
 * the opening's first assigned TA. A test candidate followed up by Sanduni
 * wrote privately to Uzmaan's number, and the assistant read it and answered
 * from Sanduni's number.
 */
export const handleOnLine = (
  isTaLine: boolean,
  lineUserId: string | undefined,
  followUps: { stage: string; lineUserId?: string | null }[],
  isFollowUpStage: (s: string) => boolean,
) => !isTaLine || (!!lineUserId && followUps.some((f) => isFollowUpStage(f.stage) && f.lineUserId === lineUserId));

/**
 * Which application a WhatsApp reply belongs to (11 Nov). A candidate in
 * Follow-up on two openings (General Manager - Operations and Chief Operating
 * Officer) answered the TA's salary question; the reply was filed against the
 * opening of the last message the SYSTEM had sent - the TA's own flyer and
 * question from her phone were never seen - so the assistant said "100%
 * complete for Chief Operating Officer" and moved that opening on.
 *
 * Now: only Follow-up applications count; on a TA's own number, only that
 * line's (the same `lineUserId` handleOnLine reads); exactly one left is the
 * answer. More than one is `unclear` - the message is filed (against the last
 * one we wrote about, else the first) but nobody is answered or moved, and the
 * TAs are told. None in Follow-up returns null and the caller keeps its old
 * choice, which only records the message.
 */
export function pickReplyApplication(o: {
  apps: { id: string; stage: string; lineUserId?: string | null }[];
  isTaLine: boolean;
  lineUserId?: string | null;
  lastOutboundAppId?: string | null;
  isFollowUpStage: (s: string) => boolean;
}): { appId: string; unclear: string[] } | null {
  let inFollowUp = o.apps.filter((a) => o.isFollowUpStage(a.stage));
  if (o.isTaLine && o.lineUserId) {
    const onLine = inFollowUp.filter((a) => a.lineUserId === o.lineUserId);
    if (onLine.length) inFollowUp = onLine;
  }
  if (inFollowUp.length === 0) return null;
  if (inFollowUp.length === 1) return { appId: inFollowUp[0].id, unclear: [] };
  const filed = inFollowUp.find((a) => a.id === o.lastOutboundAppId) ?? inFollowUp[0];
  return { appId: filed.id, unclear: inFollowUp.map((a) => a.id) };
}

/** What Meta says about one number, as `checkWithMeta` reads it. Any part may be an error message. */
export interface MetaNumberState {
  phone: { status?: string; platform_type?: string; display_phone_number?: string } | string;
  templates: { name: string; status: string }[] | string;
  subscribedApps: unknown[] | string;
}

/** Ready only when the number is on the Cloud API, both templates are approved, and replies reach us. */
export function numberReadiness(rowPhone: string, m: MetaNumberState): { ready: boolean; note: string } {
  const problems: string[] = [];
  if (typeof m.phone === "string") problems.push(`the API user cannot reach this number (${m.phone})`);
  else {
    if (m.phone.display_phone_number && last9(m.phone.display_phone_number) !== last9(rowPhone))
      problems.push(`Meta has ${m.phone.display_phone_number} under this ID, not ${rowPhone}`);
    if (m.phone.platform_type !== "CLOUD_API") problems.push("not connected to the Cloud API yet");
    if (m.phone.status && m.phone.status !== "CONNECTED") problems.push(`status is ${m.phone.status}`);
  }
  if (typeof m.templates === "string") problems.push(`templates could not be read (${m.templates})`);
  else
    for (const name of REQUIRED_TEMPLATES) {
      const t = m.templates.find((x) => x.name === name);
      if (t?.status !== "APPROVED") problems.push(`${name} is ${t ? t.status.toLowerCase() : "missing"}`);
    }
  if (typeof m.subscribedApps === "string") problems.push(`webhooks could not be read (${m.subscribedApps})`);
  else if (m.subscribedApps.length === 0) problems.push("replies are not sent to us (no app subscribed)");
  return problems.length
    ? { ready: false, note: `Not ready: ${problems.join("; ")}.` }
    : { ready: true, note: "Ready: connected, both templates approved, replies reach us." };
}
