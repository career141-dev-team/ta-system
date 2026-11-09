// convex/lib/whatsappTemplates.ts
//
// The two approved Meta templates, by the names they were approved under, and
// the request that sends one. Shared by the follow-up sender
// (communications/metaTemplateSender.ts) and the Settings demo
// (communications/demoSend.ts), so the demo sends exactly what candidates get.
//
// A template is approved per WhatsApp Business account, not per number: a
// number in another account cannot send these until the same names are
// approved there too (29 Oct).

import { linkedinJobId } from "./postRouting";

export const TEMPLATE_NAME = {
  initial_outreach: "career141_initial_outreach",
  reengagement: "career141_followup_reminder",
  // Utility, approved 9 Nov (madam's wording, "profile" -> "application"):
  // the first message to someone who APPLIED. Headhunted people keep the
  // Marketing initial_outreach - sending this to them would get it re-labelled.
  application: "career141_application_connect",
} as const;

/** The two every TA number must have before it sends (lib/senderRouting). The
 *  application template is optional: an account without it falls back. */
export const REQUIRED_TEMPLATES = [TEMPLATE_NAME.initial_outreach, TEMPLATE_NAME.reengagement];

export type TemplateType = keyof typeof TEMPLATE_NAME;

/** The parameter count each template was approved with — Meta refuses any other. */
export const TEMPLATE_PARAMS: Record<TemplateType, number> = { initial_outreach: 4, reengagement: 2, application: 4 };

/** Applied candidates get the Utility template; a headhunted one keeps the Marketing one. */
export const usesApplicationTemplate = (sourceChannel?: string | null) => sourceChannel !== "headhunting";

/**
 * `{{4}}` of career141_application_connect. Salary and notice are fixed text in
 * the template, so this carries only the CV (when missing) and at most three of
 * the opening's own questions: Meta caps the whole message near 1,024
 * characters, and the template already uses about 640 (owner, 9 Nov: "only the
 * 3 very important questions"). Never empty - Meta refuses an empty parameter.
 */
export function applicationDetails(cvMissing: boolean, openQuestions: string[]): string {
  const items = [...(cvMissing ? ["CV / Resume"] : []), ...openQuestions.filter((q) => q.trim()).slice(0, 3)];
  return items.length ? items.map((m) => `• ${m}`).join(" ") : "• Any updates to your CV";
}

/** Meta Error 132018: no newlines, tabs or long runs of spaces in a parameter. */
export function templateParam(s: string): string {
  return (s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** What a new candidate is asked for — the same four the follow-up starts with. */
export const STANDARD_ASKS = ["CV / Resume", "Current Salary", "Expected Salary", "Notice Period"];

/**
 * The parameters for the Settings demo: a made-up candidate and role, in the
 * order each template was approved with.
 */
export function demoTemplateParams(type: TemplateType, o: { candidateName: string; jobTitle: string; questions?: string[] }): string[] {
  if (type === "reengagement") return [o.candidateName, o.jobTitle];
  if (type === "application")
    return [o.candidateName, o.jobTitle, "https://www.linkedin.com/jobs/view/4300000000", applicationDetails(true, o.questions ?? [])];
  return [
    o.candidateName,
    o.jobTitle,
    "https://www.linkedin.com/jobs/view/4300000000",
    STANDARD_ASKS.map((a) => `• ${a}`).join(" | "),
  ];
}

/** `{{3}}` when the opening has neither a LinkedIn job link nor a short apply link. */
export const NO_ROLE_LINK = "Our team will share the role details with you shortly.";

/**
 * `{{3}}` of `career141_initial_outreach`: where the candidate can read the role
 * (the owner, 30 Oct). The opening's LinkedIn job — a live post before a draft,
 * on its public `jobs/view` address whatever form the TA pasted — else the
 * opening's short apply link, else a sentence.
 *
 * Only a LinkedIn *job* number counts. A Recruiter project link (`talent/hire/…`)
 * routes applications (lib/postRouting) but opens only for a recruiter, so a
 * candidate sent it would see a sign-in wall.
 */
export function roleLink(
  posts: { channel?: string; status: string; externalUrl?: string | null; publicUrl?: string | null }[],
  shortApplyLink?: string | null,
): string {
  const rank = (s: string) => (s === "live" ? 0 : s === "draft" ? 1 : 2);
  const linkedin = posts
    .filter((p) => p.channel === "linkedin" && rank(p.status) < 2)
    .sort((a, b) => rank(a.status) - rank(b.status));
  // The public job link a TA saved for candidates first (10 Nov), then a job
  // number in the routing link itself.
  for (const p of linkedin) {
    const id = linkedinJobId(p.publicUrl) ?? linkedinJobId(p.externalUrl);
    if (id) return `https://www.linkedin.com/jobs/view/${id}`;
  }
  const short = (shortApplyLink ?? "").trim();
  if (short) return /^https?:\/\//i.test(short) ? short : `https://${short}`;
  return NO_ROLE_LINK;
}

/**
 * The text of `career141_initial_outreach` as approved, with its four
 * parameters filled in — what the conversation stores, so a TA reading it sees
 * what the candidate got.
 */
export function initialOutreachText(name: string, jobTitle: string, link: string, missing: string): string {
  return [
    `Hi ${name},`,
    `Based on your profile, we would like to connect with you regarding a ${jobTitle} opportunity with one of our leading manufacturing clients.`,
    "Our team will reach out to you shortly to discuss the opportunity in more detail and share further information about the role.",
    "In the meantime, kindly review the role requirements using the link below:",
    link,
    "To proceed with your application, we would appreciate it if you could share the following details:",
    missing,
    "We would appreciate if you could reply directly to this chat with the requested details.",
    "Thank you, and we look forward to connecting with you!",
  ].join("\n\n");
}

/**
 * Whether career141_application_connect may still go on this account (10 Nov,
 * the owner: "if Meta marks it Marketing, the automatic messages stop"). Meta
 * can re-label an approved template at any time; Marketing costs about 35
 * times as much, so anything but an approved Utility template holds the send.
 * `templates` is Meta's message_templates answer filtered by that name.
 */
export function applicationTemplateHold(
  templates: { name?: string; category?: string; status?: string }[] | null,
): string | null {
  if (!templates) return "Meta could not be asked whether the application template is still Utility.";
  const t = templates.find((x) => x.name === TEMPLATE_NAME.application);
  if (!t) return `${TEMPLATE_NAME.application} is not on this number's WhatsApp account.`;
  if ((t.status ?? "").toUpperCase() !== "APPROVED") return `${TEMPLATE_NAME.application} is ${String(t.status).toLowerCase()} on this number's WhatsApp account.`;
  if ((t.category ?? "").toUpperCase() !== "UTILITY")
    return `Meta changed ${TEMPLATE_NAME.application} to ${String(t.category).toLowerCase()} on this number's WhatsApp account.`;
  return null;
}

/** The text of career141_application_connect as approved, filled in. */
export function applicationConnectText(name: string, jobTitle: string, link: string, details: string): string {
  return [
    `Hi ${name},`,
    `Having reviewed your application, we would like to connect with you regarding the ${jobTitle} role within Career141.`,
    "Our team will reach out to you shortly to discuss your application in more detail and share further information about the role.",
    "In the meantime, kindly review the role requirements using the LinkedIn job post link below:",
    link,
    "To proceed with your application, we would appreciate it if you could share the following details:",
    details,
    "- Current Salary\n- Expected Salary\n- Notice Period",
    "We would appreciate if you could reply directly to this chat with the requested details.",
    "Thank you, and we look forward to connecting with you!",
  ].join("\n\n");
}

/** The Cloud API `messages` request body for a template. */
export function templatePayload(type: TemplateType, to: string, params: string[], langCode: string) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: TEMPLATE_NAME[type] as string,
      language: { code: langCode },
      components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: templateParam(text) })) }],
    },
  };
}
