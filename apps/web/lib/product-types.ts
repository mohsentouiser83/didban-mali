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

export type AccountClass = "asset" | "liability" | "equity" | "revenue" | "expense" | "other";
export type FinancialAccount = { id: string; source_code: string; name: string; normalized_name: string; current_class: AccountClass | null; created_at: string };
export type AccountClassification = { id: string; account_id: string; account_class: AccountClass; effective_from: string; rule_version: string; confirmed_by: string; confirmed_at: string };

export type AnalysisStatus = "queued" | "processing" | "completed" | "completed_limited" | "failed";
export type MetricCode = "revenue_irr" | "expenses_irr" | "net_profit_irr" | "net_margin_ratio" | "total_assets_irr" | "total_liabilities_irr" | "total_equity_irr" | "net_cash_movement_irr" | "sales_invoiced_irr" | "sales_collected_irr" | "sales_outstanding_irr";
export type CoverageSection = { available?: boolean; score?: number; reasons?: string[]; total_lines?: number; classified_lines?: number; unclassified_lines?: number };
export type AnalysisCoverage = { accounting?: CoverageSection; bank_cash_flow?: CoverageSection; sales?: CoverageSection; gross_profit?: CoverageSection };
export type AnalysisRun = {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  status: AnalysisStatus;
  input_manifest: { import_batch_ids?: string[]; journal_line_count_through_period_end?: number; period_start?: string; period_end?: string };
  rule_set_version: string;
  coverage: AnalysisCoverage;
  created_by: string;
  started_at: string | null;
  completed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
};
export type MetricObservation = { analysis_run_id: string; metric_code: MetricCode; period_start: string; period_end: string; value_irr: string | null; value_ratio: string | null; calculation: { formula?: string; line_count?: number; record_count?: number; unit?: string }; calculated_at: string };
export type MetricsResponse = { analysis_run: AnalysisRun; metrics: MetricObservation[] };

export type ReconciliationStatus = "queued" | "processing" | "completed" | "completed_limited" | "failed";
export type MatchLevel = "duplicate" | "exact" | "rule" | "fuzzy" | "mismatch" | "unresolved";
export type MatchStatus = "auto_matched" | "potential_match" | "amount_mismatch" | "date_mismatch" | "duplicate_high" | "duplicate_possible" | "unresolved";
export type ReconciliationCounts = { bank_transactions?: number; accounting_entries?: number; auto_matched?: number; potential_matches?: number; amount_mismatches?: number; date_mismatches?: number; duplicates?: number; unresolved?: number };
export type ReconciliationRun = {
  id: string;
  company_id: string;
  analysis_run_id: string;
  status: ReconciliationStatus;
  config_version: string;
  config: { rule_business_days?: number; review_calendar_days?: number; fuzzy_threshold?: string; ambiguity_margin?: string };
  counts: ReconciliationCounts;
  created_by: string;
  started_at: string | null;
  completed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
};
export type ReconciliationEvidenceSide = { transaction_id?: string; journal_entry_id?: string; journal_line_id?: string; source_row_id?: string; date?: string; amount_irr?: string; reference?: string | null; invoice_ref?: string | null; description?: string };
export type ReconciliationMatch = { id: string; bank_transaction_id: string | null; journal_entry_id: string | null; match_level: MatchLevel; status: MatchStatus; score: string; amount_difference_irr: string | null; date_difference_days: number | null; features: { amount_equal?: boolean; amount_difference_irr?: string; calendar_days?: number; business_days?: number; reference_equal?: boolean; description_similarity?: string; strong_identifier_equal?: boolean }; evidence: { bank?: ReconciliationEvidenceSide; accounting?: ReconciliationEvidenceSide; bank_transaction_id?: string; journal_entry_id?: string; source_row_id?: string; calculation?: string }; rule_code: string; created_at: string };
export type ReconciliationMatchesResponse = { items: ReconciliationMatch[]; next_cursor: string | null };

export const roleLabels: Record<Role, string> = {
  owner: "مالک",
  finance_manager: "مدیر مالی",
  advisor: "مشاور",
  viewer: "مشاهده‌گر",
};
