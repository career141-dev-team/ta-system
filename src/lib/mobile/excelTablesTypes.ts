/** Native Excel Tables contract. Kept identical across backend and TA_APP. */
export interface ExcelTablesPayload {
  apiVersion: 1;
  context: { openingId: string; title: string; clientName: string };
  permissions: { canAdd: boolean; canLeadNote: boolean; canUploadCv: boolean; canExport: boolean };
  locations: { id: string; name: string; archived: boolean }[];
  bulkStages: { stage: string; label: string }[];
  selectedLocationId: string | null;
  addingTo: string;
  sheets: ExcelSheetPayload[];
  adders: { id: string; name: string; count: number }[];
  counts: { all: number; pending: number; interested: number; notInterested: number; eyeMarked: number; addOns: number };
  rows: ExcelTableRowPayload[];
}

export interface ExcelSheetPayload {
  n: number;
  label: string;
  name: string;
  count: number;
  canManage: boolean;
}

export type ExcelInterest = "pending" | "interested" | "not_interested";
export type ExcelOutcome = "no_contact" | "contacted" | "responded" | "cv_received" | "shortlisted" | "declined" | "unreachable";

export interface ExcelTableRowPayload {
  id: string;
  name: string | null;
  guessedName: string | null;
  title: string | null;
  company: string | null;
  linkedinUrl: string;
  phoneNumber: string | null;
  phoneSource: string | null;
  outcome: ExcelOutcome;
  interest: ExcelInterest;
  isEyeMarked: boolean;
  isAddOn: boolean;
  level: number | null;
  addedAt: number;
  addedByName: string;
  readOnly: boolean;
  takenByName: string | null;
  pipeline: { applicationId: string; stage: string; stageLabel: string } | null;
  cvMatch: { fullName: string; strength: "same" | "possible"; hasCv: boolean; reasons: string[] } | null;
  conversation: { at: number; channel: string; note: string; byName: string }[];
  taNotes: { id: string; at: number; note: string; byName: string; canRemove: boolean }[];
  leadNotes: { id: string; at: number; note: string; byline: string; canRemove: boolean }[];
}

export type ExcelTablesWriteBody =
  | { action: "add_link"; url: string; name: string; note: string; workLocationId: string | null; level: number | null }
  | { action: "add_level"; workLocationId: string | null }
  | { action: "rename_level"; level: number; name: string; workLocationId: string | null }
  | { action: "delete_level"; level: number; workLocationId: string | null }
  | { action: "update_row"; entryId: string; outcome: ExcelOutcome; name: string; company: string; phoneNumber: string; phoneSource: string }
  | { action: "log_outreach"; entryId: string; channel: string; note: string }
  | { action: "toggle_eye"; entryId: string }
  | { action: "toggle_add_on"; entryId: string; on: boolean }
  | { action: "set_interest"; entryId: string; interest: "interested" | "not_interested"; reason: string }
  | { action: "add_to_pipeline"; entryId: string }
  | { action: "decide_cv_match"; entryId: string; decision: "same" | "different" }
  | { action: "add_ta_note"; entryId: string; note: string }
  | { action: "remove_ta_note"; entryId: string; noteId: string }
  | { action: "add_lead_note"; entryId: string; note: string }
  | { action: "remove_lead_note"; entryId: string; noteId: string }
  | { action: "delete_row"; entryId: string }
  | { action: "bulk_add_to_pipeline"; entryIds: string[] }
  | { action: "bulk_move"; entryIds: string[]; stage: string; reason: string }
  | { action: "bulk_assign_location"; entryIds: string[]; workLocationId: string };

export interface ExcelTablesWriteResult {
  ok: true;
  message: string;
  tone?: "ok" | "note";
  level?: number;
}
