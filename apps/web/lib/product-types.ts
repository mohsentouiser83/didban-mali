export type User = { id: string; email: string; full_name: string };
export type Role = "owner" | "finance_manager" | "advisor" | "viewer";

export type Company = {
  id: string;
  legal_name: string;
  national_id: string | null;
  currency: string;
  fiscal_year_start_month: number;
  timezone: string;
  role: Role;
  created_at: string;
};

export type Member = { user_id: string; email: string; full_name: string; role: Role };
export type ImportStatus = "uploaded" | "inspecting" | "awaiting_mapping" | "validating" | "queued" | "processing" | "completed" | "completed_limited" | "failed" | "cancelled";

export type ImportBatch = {
  id: string;
  source_kind: "accounting" | "bank" | "sales";
  source_label: string;
  status: ImportStatus;
  stage: string;
  progress: number;
  original_name: string;
  size_bytes: number;
  sha256: string;
  scan_status: "pending" | "clean" | "infected" | "failed";
  duplicate_detected: boolean;
  failure_message: string | null;
  failure_code?: string | null;
  retryable?: boolean;
  sheet_name?: string | null;
  header_row?: number | null;
  row_count?: number;
  accepted_count?: number;
  rejected_count?: number;
  coverage?: Record<string, unknown>;
  created_at: string;
};

export type MappingSuggestion = { target_field: string; source_column: string; confidence: number; reason: string };
export type PreviewIssue = { row_number: number | null; field: string | null; severity: "blocking" | "error" | "warning"; code: string; message: string; raw_value: string | null; remedy: string | null };
export type PreviewRow = { row_number: number; raw: Record<string, unknown>; transformed: Record<string, unknown> | null; issues: PreviewIssue[] };
export type MappingResponse = { id: string; import_batch_id: string; version: number; mapping: Record<string, string>; transforms: Record<string, string[]>; currency_unit: "rial" | "toman"; calendar: "jalali" | "gregorian"; sheet_name: string; header_row: number; column_fingerprint: string; confirmed_at: string };
export type ImportPreview = { sheets: string[]; selected_sheet: string; header_row: number; columns: string[]; column_fingerprint: string; rows: PreviewRow[]; suggestions: MappingSuggestion[]; required_fields: string[]; alternative_required_fields: string[][]; mapping: MappingResponse | null; matching_profile_id: string | null };
export type ImportIssue = PreviewIssue & { id: string };
export type IssuesPage = { items: ImportIssue[]; total: number; limit: number; offset: number };
export type ValidationResponse = { batch: ImportBatch; issue_counts: Record<string, number>; coverage: Record<string, unknown> };

export const roleLabels: Record<Role, string> = {
  owner: "مالک",
  finance_manager: "مدیر مالی",
  advisor: "مشاور",
  viewer: "مشاهده‌گر",
};
