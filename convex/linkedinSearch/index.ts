/** LinkedIn Search engine — public surface. Drops into the TA System as convex/linkedinSearch/. */
export * from "./types";
export { formFromRules, extractForm, formKey, applyEdits, refineForm, widenForm } from "./form";
export { checkForm, answerToEdits } from "./check";
export { agentQuery, normalSearchBody, normalSearchSentence, refetchBody, findOneBody, BASIC_FIELDS, COMPANY_FIELDS } from "./query";
export { createCrustdataClient, memoryRateGate, globalFetch, realClock, CrustdataError, LIMITS, API_VERSION } from "./crustdata";
export type { CrustdataClient, HttpFetch, Clock, RateGate, SpendEvent, RawEvent, AgentRead } from "./crustdata";
export * as results from "./results";
export { memoryStore, poolKey, rowFromSaved, savedMatchScore } from "./store";
export type { Store, SavedProfile, SavedSearch, Mark, OutcomeRecord } from "./store";
export { createEngine, spendToStore } from "./engine";
export type { Engine, EngineDeps, SearchContext, SearchOutcome } from "./engine";
