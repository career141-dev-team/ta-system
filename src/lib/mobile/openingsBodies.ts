import { z } from "zod";

import { CONSENT_TEXT } from "@/lib/intake";
import { OPENING_STATUSES, WORKING_STAGES } from "@/lib/openings/writes";

/** Request bodies for the mobile openings writes, checked before anything runs. */
export const setStatusBody = z.object({ status: z.enum(OPENING_STATUSES) }).strict();
export const setWorkingStageBody = z.object({ stage: z.enum(WORKING_STAGES as [string, ...string[]]) }).strict();
export const binOpeningsBody = z.object({ openingIds: z.array(z.string().trim().min(1).max(200)).min(1).max(200) }).strict();

/** Parse a JSON body against a schema, or the sentence to send back. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown, problem: string): { ok: true; value: T } | { ok: false; message: string } {
  const parsed = schema.safeParse(body);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, message: problem };
}

const text = (max: number) => z.string().max(max);

export const openingDetailsBody = z
  .object({
    title: text(200),
    salaryMin: text(40),
    salaryMax: text(40),
    salaryCurrency: text(10),
    packageNotes: text(500),
    locations: text(1000),
    targetNationalities: text(500),
    headcount: text(10),
    priorityTier: text(4),
  })
  .strict();

export const openingTeamBody = z
  .object({
    members: z
      .array(z.object({ userId: z.string().trim().min(1).max(200), role: z.enum(["primary_recruiter", "supporting_recruiter", "director", "client_contact"]) }).strict())
      .max(50),
  })
  .strict();

export const emptyBody = z.object({}).strict();
export const accessRequestBody = z.object({ reason: text(1000) }).strict();
export const accessDecisionBody = z.object({ decision: z.enum(["approve", "reject"]), reason: text(1000) }).strict();

export const newOpeningBody = z
  .object({
    clientId: z.string().trim().max(200),
    title: text(200),
    country: text(100),
    hiringFor: text(100),
    targetGender: z.enum(["", "Female", "Male"]),
    // Checked again, with the web's words, by validateWorkLocations.
    workLocations: z.array(z.object({ id: text(80), name: text(200), vacancies: z.number() }).strict()).max(50),
    notes: text(20000),
    recording: z
      .object({ key: z.string().regex(/^convex:[A-Za-z0-9_-]{1,200}$/), durationMs: z.number().int().min(0).max(24 * 3600 * 1000), consentText: z.literal(CONSENT_TEXT) })
      .strict()
      .nullable(),
    autoFollowUp: z.boolean(),
    assignedTaIds: z.array(z.string().trim().min(1).max(200)).max(50),
  })
  .strict();

export const newClientBody = z
  .object({
    name: text(200),
    industry: text(100),
    contactName: text(200),
    contactTitle: text(200),
    contactEmail: text(320),
  })
  .strict();

export const jdWriteBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_notes"), notes: text(20_000) }).strict(),
  z.object({ action: z.literal("generate"), notes: text(20_000) }).strict(),
  z.object({ action: z.literal("approve"), markdown: text(100_000) }).strict(),
  z.object({ action: z.literal("amend"), markdown: text(100_000) }).strict(),
  z.object({ action: z.literal("revise"), request: text(2_000), currentMarkdown: text(100_000) }).strict(),
  z.object({ action: z.literal("restore"), messageId: z.string().min(1).max(100) }).strict(),
  z.object({
    action: z.literal("save_details"),
    details: z.object({
      title: text(200), clientIndustry: text(100), recruitmentType: z.enum(["both", "headhunting", "job_posting"]),
      isConfidential: z.boolean(), jobStatus: z.enum(["active", "draft", "on_hold"]), location: text(300), seniorityLevel: text(80),
      experienceMinYears: z.number().min(0).max(50), experienceMaxYears: z.number().min(0).max(50).nullable(), educationLevel: text(100),
      salaryMin: z.number().min(0).max(1_000_000_000).nullable(), salaryMax: z.number().min(0).max(1_000_000_000).nullable(), salaryCurrency: text(10),
      requiredSkills: z.array(text(200)).max(100), niceToHaveSkills: z.array(text(200)).max(100), languagesRequired: z.array(text(100)).max(50),
    }).strict(),
  }).strict(),
  z.object({ action: z.literal("reextract_details") }).strict(),
]);

export const strategyWriteBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }).strict(),
  z.object({
    action: z.literal("submit"),
    rows: z.array(z.object({ rowId: z.string().min(1).max(200), used: z.boolean(), date: text(20), note: text(500) }).strict()).max(100),
  }).strict(),
  z.object({ action: z.literal("remove_proof"), rowId: z.string().min(1).max(200), proofId: z.string().min(1).max(300) }).strict(),
]);

const researchField = z.enum(["similarDesignation", "websiteLink", "servicesProvider", "country", "location", "competitors", "socialMedia", "companyOverview"]);
export const researchWriteBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run_research") }).strict(),
  z.object({ action: z.literal("correct_client"), researchNotes: text(2_000) }).strict(),
  z.object({ action: z.literal("edit_field"), field: researchField, value: text(20_000) }).strict(),
  z.object({ action: z.literal("run_benchmark") }).strict(),
  z.object({ action: z.literal("toggle_benchmark"), entryId: z.string().min(1).max(200) }).strict(),
  z.object({ action: z.literal("confirm"), unavailable: z.partialRecord(researchField, text(1_000)) }).strict(),
]);

export const suggestionsWriteBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run") }).strict(),
  z.object({ action: z.literal("keep"), suggestionId: z.string().min(1).max(200) }).strict(),
  z.object({ action: z.literal("dismiss"), suggestionId: z.string().min(1).max(200) }).strict(),
  z.object({ action: z.literal("find_cv"), suggestionId: z.string().min(1).max(200) }).strict(),
  z.object({ action: z.literal("choose_cv"), suggestionId: z.string().min(1).max(200), candidateId: z.string().min(1).max(200) }).strict(),
  z.object({ action: z.literal("send_message"), body: text(2_000) }).strict(),
  z.object({ action: z.literal("save_empty_reason"), reason: text(1_000) }).strict(),
]);

const excelOutcome = z.enum(["no_contact", "contacted", "responded", "cv_received", "shortlisted", "declined", "unreachable"]);
const excelId = z.string().min(1).max(200);
const locationId = z.string().max(80).nullable();
export const excelTablesWriteBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add_link"), url: text(2_000), name: text(200), note: text(2_000), workLocationId: locationId, level: z.number().int().min(1).max(10_000).nullable() }).strict(),
  z.object({ action: z.literal("add_level"), workLocationId: locationId }).strict(),
  z.object({ action: z.literal("rename_level"), level: z.number().int().min(1).max(10_000), name: text(40), workLocationId: locationId }).strict(),
  z.object({ action: z.literal("delete_level"), level: z.number().int().min(1).max(10_000), workLocationId: locationId }).strict(),
  z.object({ action: z.literal("update_row"), entryId: excelId, outcome: excelOutcome, name: text(200), company: text(200), phoneNumber: text(80), phoneSource: text(80) }).strict(),
  z.object({ action: z.literal("log_outreach"), entryId: excelId, channel: text(40), note: text(2_000) }).strict(),
  z.object({ action: z.literal("toggle_eye"), entryId: excelId }).strict(),
  z.object({ action: z.literal("toggle_add_on"), entryId: excelId, on: z.boolean() }).strict(),
  z.object({ action: z.literal("set_interest"), entryId: excelId, interest: z.enum(["interested", "not_interested"]), reason: text(300) }).strict(),
  z.object({ action: z.literal("add_to_pipeline"), entryId: excelId }).strict(),
  z.object({ action: z.literal("decide_cv_match"), entryId: excelId, decision: z.enum(["same", "different"]) }).strict(),
  z.object({ action: z.literal("add_ta_note"), entryId: excelId, note: text(2_000) }).strict(),
  z.object({ action: z.literal("remove_ta_note"), entryId: excelId, noteId: excelId }).strict(),
  z.object({ action: z.literal("add_lead_note"), entryId: excelId, note: text(2_000) }).strict(),
  z.object({ action: z.literal("remove_lead_note"), entryId: excelId, noteId: excelId }).strict(),
  z.object({ action: z.literal("delete_row"), entryId: excelId }).strict(),
  z.object({ action: z.literal("bulk_add_to_pipeline"), entryIds: z.array(excelId).min(1).max(25) }).strict(),
  z.object({ action: z.literal("bulk_move"), entryIds: z.array(excelId).min(1).max(25), stage: text(80), reason: text(300) }).strict(),
  z.object({ action: z.literal("bulk_assign_location"), entryIds: z.array(excelId).min(1).max(25), workLocationId: excelId }).strict(),
]);
