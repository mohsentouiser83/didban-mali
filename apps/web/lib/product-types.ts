export type User = { id: string; email: string; full_name: string };
export type Role = "owner" | "finance_manager" | "advisor" | "viewer";

export type Company = {
  id: string;
  legal_name: string;
  national_id?: string | null;
  currency: string;
  fiscal_year_start_month?: number;
  timezone?: string;
  role?: Role;
  onboarding_stage?: string;
  is_live?: boolean;
  go_live_at?: string | null;
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
export type MappingTemplateResponse = {
  id: string;
  company_id: string;
  source_kind: "accounting" | "bank" | "sales";
  name: string;
  column_fingerprint: string;
  mapping: Record<string, string>;
  transforms: Record<string, string[]>;
  currency_unit: "rial" | "toman";
  calendar: "jalali" | "gregorian";
  header_row: number | null;
  created_at: string;
};

export type ImportPreview = {
  sheets: string[];
  selected_sheet: string;
  header_row: number;
  columns: string[];
  column_fingerprint: string;
  rows: PreviewRow[];
  suggestions: MappingSuggestion[];
  required_fields: string[];
  alternative_required_fields: string[][];
  mapping: MappingResponse | null;
  matching_profile_id: string | null;
  matching_profile?: MappingTemplateResponse | null;
};
export type ImportIssue = PreviewIssue & { id: string };
export type IssuesPage = { items: ImportIssue[]; total: number; limit: number; offset: number };
export type ValidationResponse = { batch: ImportBatch; issue_counts: Record<string, number>; coverage: Record<string, unknown> };

export type SourceHealthStatus = "ready" | "needs_update" | "warning" | "error" | "no_data" | "processing";

export type SourceCardHealth = {
  source_kind: "accounting" | "bank" | "sales";
  source_title: string;
  status: SourceHealthStatus;
  status_label: string;
  last_successful_import: string | null;
  accepted_records: number;
  rejected_records: number;
  warnings_count: number;
  estimated_coverage_pct: number;
  freshness_days: number | null;
  freshness_label: string;
  usable_for_calculations: boolean;
  primary_cta_label: string;
  primary_cta_action: "upload" | "quality" | "history" | "overview";
  summary_notes: string[];
};

export type ActionableHealthIssue = {
  id: string;
  severity: "blocking" | "error" | "warning" | "info";
  title: string;
  description: string;
  action_label: string;
  action_tab: string;
  batch_id: string | null;
};

export type DataOverviewResponse = {
  company_id: string;
  sources: SourceCardHealth[];
  health_issues: ActionableHealthIssue[];
  total_accepted_records: number;
  total_rejected_records: number;
  total_warnings: number;
  overall_health_score: number;
};

export type QualityIssueGroup = {
  code: string;
  title: string;
  severity: "blocking" | "error" | "warning";
  count: number;
  remedy: string | null;
  sample_row_numbers: number[];
  affected_batches_count: number;
};

export type QuarantinedRowItem = {
  row_id: string;
  batch_id: string;
  source_filename: string;
  source_kind: "accounting" | "bank" | "sales";
  sheet: string;
  row_number: number;
  raw_data: Record<string, unknown>;
  issues: {
    code: string;
    title: string;
    message: string;
    severity: string;
    remedy: string | null;
  }[];
};

export type DataQualityResponse = {
  company_id: string;
  total_records: number;
  accepted_records: number;
  warning_records: number;
  rejected_records: number;
  health_score_pct: number;
  groups: QualityIssueGroup[];
  quarantined_rows: QuarantinedRowItem[];
};

export type RecordLineageResponse = {
  company_id: string;
  record_id: string;
  entity_type: string;
  import_id: string;
  source_file_id: string;
  source_filename: string;
  source_file_sha256: string;
  source_row_number: number;
  sheet_name: string;
  raw_values: Record<string, unknown>;
  mapping_version: number;
  mapping_summary: Record<string, string>;
  transforms_applied: Record<string, string[]>;
  normalized_fields: Record<string, unknown>;
  imported_at: string;
};

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

export type ReconciliationStatus =
  | "queued"
  | "processing"
  | "completed"
  | "completed_limited"
  | "failed";

export type MatchLevel =
  | "exact"
  | "rule"
  | "fuzzy"
  | "mismatch"
  | "unresolved"
  | "suggested"
  | "manual"
  | "duplicate";

export type MatchStatus =
  | "auto_matched"
  | "potential_match"
  | "suggested_match"
  | "needs_review"
  | "confirmed"
  | "rejected"
  | "reversed"
  | "amount_mismatch"
  | "date_mismatch"
  | "duplicate_high"
  | "duplicate_possible"
  | "unresolved";

export type ReconciliationCounts = {
  bank_transactions?: number;
  accounting_entries?: number;
  auto_matched?: number;
  potential_matches?: number;
  amount_mismatches?: number;
  date_mismatches?: number;
  duplicates?: number;
  unresolved?: number;
};

export type ReconciliationAllocation = {
  id: string;
  match_id: string;
  side: "bank" | "journal";
  bank_transaction_id: string | null;
  journal_line_id: string | null;
  allocated_amount_irr: number;
  created_at: string;
};

export type ReconciliationRun = {
  id: string;
  company_id: string;
  analysis_run_id: string | null;
  bank_account_id?: string | null;
  status: ReconciliationStatus;
  config_version?: string;
  config?: { rule_business_days?: number; review_calendar_days?: number; fuzzy_threshold?: string; ambiguity_margin?: string };
  config_params?: Record<string, any>;
  counts?: ReconciliationCounts;
  matched_count?: number;
  unmatched_bank_count?: number;
  unmatched_journal_count?: number;
  matched_amount_irr?: number;
  period_start?: string;
  period_end?: string;
  created_by?: string;
  started_at?: string | null;
  completed_at?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
  created_at: string;
  updated_at?: string;
};

export type ReconciliationEvidenceSide = {
  transaction_id?: string;
  journal_entry_id?: string;
  journal_line_id?: string;
  source_row_id?: string;
  date?: string;
  amount_irr?: string;
  reference?: string | null;
  invoice_ref?: string | null;
  description?: string;
};

export type ReconciliationMatch = {
  id: string;
  run_id?: string;
  bank_transaction_id: string | null;
  journal_entry_id: string | null;
  match_level: MatchLevel;
  status: MatchStatus;
  score: string | number;
  amount_difference_irr: string | number | null;
  date_difference_days: number | null;
  match_type?: "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many" | "manual";
  features?: {
    amount_equal?: boolean;
    amount_difference_irr?: string;
    calendar_days?: number;
    business_days?: number;
    reference_equal?: boolean;
    description_similarity?: string;
    strong_identifier_equal?: boolean;
  } | Record<string, any>;
  evidence: {
    bank?: ReconciliationEvidenceSide;
    accounting?: ReconciliationEvidenceSide;
    bank_transaction_id?: string;
    journal_entry_id?: string;
    source_row_id?: string;
    calculation?: string;
  } | Record<string, any>;
  allocations?: ReconciliationAllocation[];
  rule_code: string;
  created_at: string;
  confirmed_at?: string | null;
};
export type ReconciliationMatchesResponse = { items: ReconciliationMatch[]; next_cursor: string | null };

export type FindingRunStatus = "queued" | "processing" | "completed" | "completed_limited" | "failed";
export type FindingCode = "potential_missing_transaction" | "duplicate_transaction" | "amount_mismatch" | "date_mismatch" | "revenue_drop" | "profit_drop" | "expense_increase" | "receivables_increase";
export type FindingKind = "risk" | "anomaly" | "discrepancy" | "insight";
export type FindingCategory =
  | "reconciliation"
  | "receivables"
  | "liquidity"
  | "financial_analysis";
export type AssertionStatus = "deterministic" | "hypothesis";
export type PriorityBand = "critical" | "high" | "medium" | "low";
export type FindingWorkflowStatus = "needs_review" | "confirmed" | "dismissed" | "follow_up" | "resolved";
export type EvidenceType = "source_record" | "comparison" | "calculation" | "rule" | "coverage";
export type PriorityFactor = { score?: string; weight?: string; weighted_score?: string; reasons_fa?: string[] };
export type FindingGenerationRun = { id: string; company_id: string; analysis_run_id: string; reconciliation_run_id: string | null; status: FindingRunStatus; config_version: string; config: Record<string, unknown>; coverage: { reconciliation_findings?: { available?: boolean; reason?: string | null }; financial_trends?: { available?: boolean; comparison_analysis_run_id?: string | null; reason?: string | null } }; counts: { total?: number; by_code?: Partial<Record<FindingCode, number>>; catalog_size?: number; evidence_items?: number }; created_by: string; started_at: string | null; completed_at: string | null; failure_code: string | null; failure_message: string | null; created_at: string; updated_at: string };
export type Finding = {
  id: string;
  analysis_run_id: string;
  generation_run_id: string;
  reconciliation_match_id: string | null;
  finding_code: FindingCode;
  kind: FindingKind;
  category: FindingCategory;
  title_fa: string;
  summary_fa: string;
  assertion_status: AssertionStatus;
  severity: "high" | "medium" | "low";
  priority_band: PriorityBand;
  priority_score: string;
  priority_explanation: { formula?: string; factors?: Partial<Record<"impact" | "materiality" | "confidence" | "urgency", PriorityFactor>>; score?: string; band?: PriorityBand; revenue_ratio?: string | null; critical_capped_for_low_confidence?: boolean; summary_fa?: string; uncertainty_fa?: string };
  priority_model_version: string;
  priority_config: Record<string, unknown>;
  confidence_score: string;
  confidence_basis: Record<string, unknown>;
  affected_amount_irr: string | null;
  affected_ratio: string | null;
  period_start: string;
  period_end: string;
  reason_code: string;
  reason_parameters: Record<string, unknown>;
  calculation: Record<string, unknown>;
  rule_version: string;
  workflow_status: FindingWorkflowStatus;
  created_at: string;
  updated_at: string;
  status?: FindingStatus;
  assigned_to_user_id?: string | null;
  assignee_name?: string | null;
  due_date?: string | null;
  assigned_at?: string | null;
  resolved_by_user_id?: string | null;
  resolver_name?: string | null;
  resolved_at?: string | null;
  resolution_type?: string | null;
  resolution_note?: string | null;
  verified_by_user_id?: string | null;
  verifier_name?: string | null;
  verified_at?: string | null;
  verification_note?: string | null;
  reopened_count?: number;
  suppression_reason?: string | null;
};
export type FindingsResponse = { items: Finding[]; next_cursor: string | null };
export type EvidenceItem = { id: string; ordinal: number; evidence_type: EvidenceType; claim_code: string; source_entity_type: string | null; source_entity_id: string | null; source_row_id: string | null; source_file_id: string | null; field_snapshot: Record<string, unknown>; calculation: Record<string, unknown>; rule_code: string | null; rule_version: string; created_at: string };
export type EvidenceItemsResponse = { items: EvidenceItem[] };

export type ReviewDecisionType = "confirmed" | "dismissed" | "follow_up" | "resolved";
export type ReviewDecisionResponse = { id: string; finding_id: string; decision: ReviewDecisionType; previous_status: FindingWorkflowStatus; resulting_status: FindingWorkflowStatus; note: string | null; actor_id: string; created_at: string };
export type FindingNoteResponse = { id: string; finding_id: string; body: string; actor_id: string; supersedes_id: string | null; created_at: string };
export type ReviewTimelineItem = { kind: "decision" | "note"; id: string; actor_id: string; created_at: string; decision: ReviewDecisionType | null; previous_status: FindingWorkflowStatus | null; resulting_status: FindingWorkflowStatus | null; note: string | null; body: string | null; supersedes_id: string | null };
export type ReviewTimelineResponse = { finding_id: string; current_status: FindingWorkflowStatus; items: ReviewTimelineItem[]; next_cursor: string | null };

export type DashboardOverallState = "critical_attention" | "attention" | "monitor" | "stable" | "limited_visibility" | "analysis_incomplete";
export type DashboardTrend = "up" | "down" | "flat" | "unavailable";
export type DashboardMetric = { metric_code: string; label_fa: string; available: boolean; unit: "IRR" | "ratio"; value: string | null; previous_value: string | null; change_value: string | null; change_ratio: string | null; trend: DashboardTrend; calculation: Record<string, unknown>; unavailable_reason_fa: string | null };
export type DashboardFinding = { id: string; finding_code: FindingCode; title_fa: string; summary_fa: string; priority_band: PriorityBand; priority_score: string; priority_reasons: Finding["priority_explanation"]; confidence_score: string; affected_amount_irr: string | null; affected_ratio: string | null; workflow_status: FindingWorkflowStatus };
export type DashboardDriver = { finding_id: string; finding_code: FindingCode; title_fa: string; direction: string | null; affected_amount_irr: string | null; affected_ratio: string | null; priority_band: PriorityBand; priority_score: string };
export type DashboardCoverageSection = { available?: boolean; score?: number; reasons?: string[]; [key: string]: unknown };
export type DashboardHealth = { overall_state: DashboardOverallState; financial_state: "critical_attention" | "attention" | "monitor" | "stable"; data_quality: "complete" | "limited"; highest_open_priority: PriorityBand | null; summary_fa: string; reasons_fa: string[] };
export type DashboardCoverage = { overall_score: number; scoring_method: "simple_average_of_section_scores_v1"; sections: Record<string, DashboardCoverageSection>; limitations_fa: string[]; finding_generation_status: string | null; finding_generation_coverage: Record<string, unknown> };

export type DashboardResponse = {
  snapshot: { analysis_run_id: string; period_start: string; period_end: string; analysis_status: "completed" | "completed_limited"; rule_set_version?: string; completed_at: string; comparison_analysis_run_id: string | null };
  metrics: DashboardMetric[];
  top_findings: DashboardFinding[];
  finding_summary: { total: number; by_priority: Record<PriorityBand, number>; by_workflow: Record<FindingWorkflowStatus, number>; top_limit: number; all_findings_path: string };
  main_drivers: DashboardDriver[];
  health?: DashboardHealth;
  coverage?: DashboardCoverage;
};

export type ReportStatus = "queued" | "processing" | "completed" | "failed";
export type ReportAdvisorNote = { body: string; actor_id: string; finding_id?: string; source?: "decision" | "finding_note"; created_at?: string };
export type ReportFinding = { id: string; finding_code: FindingCode; title_fa: string; summary_fa: string; priority_band: PriorityBand; priority_score: string; confidence_score: string; affected_amount_irr: string | null; affected_ratio: string | null; workflow_status: FindingWorkflowStatus; is_top_finding: boolean; latest_decision: { decision: ReviewDecisionType; actor_id: string; created_at: string } | null; notes: Array<{ id: string; body: string; actor_id: string; supersedes_id: string | null; created_at: string }> };
export type ReportPayload = { schema_version: "report-snapshot-v1"; generated_at: string; title_fa: string; company: { id: string; legal_name: string; currency: string }; analysis: { id: string; period_start: string; period_end: string; status: AnalysisStatus; rule_set_version: string; completed_at: string | null }; overall_status: DashboardHealth; financial_overview: DashboardMetric[]; top_findings: DashboardFinding[]; main_drivers: DashboardDriver[]; data_coverage: DashboardCoverage; advisor_note: ReportAdvisorNote | null; advisor_notes: ReportAdvisorNote[]; review_status: DashboardResponse["finding_summary"]; all_findings: ReportFinding[] };
export type ReportSnapshot = { id: string; company_id: string; analysis_run_id: string; period_start: string; period_end: string; title_fa: string; advisor_note: string | null; payload: ReportPayload; status: ReportStatus; progress: number; stage: string; download_ready: boolean; pdf_sha256: string | null; pdf_size_bytes: number | null; created_by: string; started_at: string | null; completed_at: string | null; failure_code: string | null; failure_message: string | null; created_at: string };

export type AiPurpose = "finding_explanation" | "semantic_matching";
export type AiInvocationStatus = "disabled" | "succeeded" | "failed" | "invalid_output";
export type AiSettings = { enabled: boolean; explanations_enabled: boolean; semantic_matching_enabled: boolean; global_enabled: boolean; provider_configured: boolean; data_region_configured: boolean; explanations_effective: boolean; semantic_matching_effective: boolean; revision_id: string | null; updated_at: string | null };
export type AiFindingExplanation = { summary_fa: string; why_it_matters_fa: string; caveats_fa: string[]; referenced_evidence_ids: string[]; referenced_numbers: string[]; requires_human_review: true };
export type AiRankedCandidate = { candidate_id: string; confidence: string; reason_fa: string; referenced_numbers: string[] };
export type AiSemanticMatching = { ranked_candidates: AiRankedCandidate[]; requires_human_review: true };
export type AiInvocation = { id: string; company_id: string; purpose: AiPurpose; status: AiInvocationStatus; source_finding_id: string | null; source_reconciliation_run_id: string | null; provider: string; model: string; prompt_version: string; output: AiFindingExplanation | AiSemanticMatching | null; latency_ms: number; failure_code: string | null; failure_message: string | null; requires_human_review: true; created_at: string; completed_at: string };

export type ReadinessState = "ready" | "limited" | "missing";
export type SourceReadiness = { kind: "accounting" | "bank" | "sales"; state: ReadinessState; completed_batches: number; last_activity_at: string | null };
export type JourneyStep = { id: string; state: ReadinessState; count: number; detail_fa: string; href: string };
export type CompanyReadiness = { schema_version: "company-readiness-v1"; overall_state: ReadinessState; completed_steps: number; ready_steps: number; total_steps: number; sources: SourceReadiness[]; journey: JourneyStep[]; safeguards: { tenant_scoped: boolean; human_review_required: boolean; ai_fail_safe: boolean; immutable_report_snapshot: boolean } };
export type DependencyStatus = { status: "ready" | "not_ready"; database: boolean; redis: boolean };

export const roleLabels: Record<Role, string> = {
  owner: "مالک",
  finance_manager: "مدیر مالی",
  advisor: "مشاور",
  viewer: "مشاهده‌گر",
};

export type ReceivablesRiskLevel = "low" | "medium" | "high" | "critical";
export type ReceivablesBucketKey = "not_due" | "1_30" | "31_60" | "61_90" | "90_plus" | "due_date_missing";

export type AgingBucketDetail = {
  bucket_key: ReceivablesBucketKey;
  label_fa: string;
  amount_irr: string;
  invoice_count: number;
  share_percentage: number;
};

export type ReceivablesSummaryResponse = {
  as_of_date: string;
  total_receivables_irr: string;
  total_overdue_irr: string;
  overdue_ratio: number;
  dso_days: number;
  customer_count: number;
  high_risk_customer_count: number;
  buckets: AgingBucketDetail[];
};

export type CustomerReceivableItem = {
  counterparty_id: string;
  name: string;
  national_id: string | null;
  total_outstanding_irr: string;
  overdue_amount_irr: string;
  overdue_ratio: number;
  avg_delay_days: number;
  risk_level: ReceivablesRiskLevel;
  risk_score: number;
  recommended_action: string;
  buckets: Record<ReceivablesBucketKey, string>;
  open_invoices_count: number;
};

export type CustomersReceivablesResponse = {
  as_of_date: string;
  items: CustomerReceivableItem[];
};

export type ReceivableInvoiceItem = {
  invoice_id: string;
  invoice_no: string;
  customer_name: string;
  counterparty_id: string;
  issue_date: string;
  due_date: string;
  gross_amount_irr: string;
  paid_amount_irr: string;
  remaining_amount_irr: string;
  delay_days: number;
  bucket_key: ReceivablesBucketKey;
  is_overdue: boolean;
  status: string;
};

export type InvoicesReceivablesResponse = {
  as_of_date: string;
  items: ReceivableInvoiceItem[];
};

export type CashRunwayStatus = "critical" | "warning" | "monitor" | "healthy" | "sustainable";
export type ScenarioType = "base" | "pessimistic" | "optimistic";

export type CashFlowWeekItem = {
  week_number: number;
  start_date: string;
  end_date: string;
  starting_cash_irr: string;
  projected_inflows_irr: string;
  projected_outflows_irr: string;
  net_change_irr: string;
  ending_cash_irr: string;
  is_deficit: boolean;
  deficit_amount_irr: string;
};

export type CashInflowSourceDetail = {
  category: string;
  amount_irr: string;
  share_percentage: number;
};

export type CashOutflowSourceDetail = {
  category: string;
  amount_irr: string;
  share_percentage: number;
};

export type CashFlowSummaryResponse = {
  as_of_date: string;
  current_cash_irr: string;
  monthly_burn_rate_irr: string;
  runway_days: number;
  runway_months: number;
  runway_status: CashRunwayStatus;
  safety_buffer_irr: string;
  first_deficit_week: number | null;
  lowest_projected_cash_irr: string;
};

export type CashFlowForecastResponse = {
  as_of_date: string;
  scenario: ScenarioType;
  safety_buffer_irr: string;
  current_cash_irr: string;
  total_projected_inflows_irr: string;
  total_projected_outflows_irr: string;
  net_period_movement_irr: string;
  weeks: CashFlowWeekItem[];
  inflow_sources: CashInflowSourceDetail[];
  outflow_sources: CashOutflowSourceDetail[];
};

export type PayablesRiskLevel = "low" | "medium" | "high" | "critical";
export type PayablesBucketKey = "not_due" | "1_30" | "31_60" | "61_90" | "90_plus" | "due_date_missing";

export type PayableAgingBucketDetail = {
  bucket_key: PayablesBucketKey;
  label_fa: string;
  amount_irr: string;
  vendor_count: number;
  share_percentage: number;
};

export type VendorPayableItem = {
  counterparty_id: string;
  name: string;
  national_id: string | null;
  total_payable_irr: string;
  overdue_amount_irr: string;
  overdue_ratio: number;
  avg_delay_days: number;
  risk_level: PayablesRiskLevel;
  risk_score: number;
  recommended_action: string;
  buckets: Record<PayablesBucketKey, string>;
  share_of_total_payables: number;
};

export type PayablesSummaryResponse = {
  as_of_date: string;
  total_payables_irr: string;
  total_overdue_irr: string;
  overdue_ratio: number;
  dpo_days: number;
  dso_days: number;
  ccc_days: number;
  vendor_count: number;
  high_risk_vendor_count: number;
  buckets: PayableAgingBucketDetail[];
};

export type VendorsPayablesResponse = {
  as_of_date: string;
  items: VendorPayableItem[];
};

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertCategory = "liquidity" | "credit_risk" | "supply_chain" | "compliance";
export type AlertCode =
  | "runway_critical"
  | "runway_warning"
  | "cash_gap_high"
  | "debtor_concentration"
  | "overdue_receivables_surge"
  | "customer_credit_alert"
  | "supplier_stoppage_risk"
  | "payables_overdue_surge"
  | "unmatched_bank_outflow";
export type AlertStatus = "active" | "acknowledged" | "resolved" | "dismissed";

export type EarlyWarningAlertItem = {
  id: string;
  company_id: string;
  code: AlertCode;
  category: AlertCategory;
  severity: AlertSeverity;
  title_fa: string;
  summary_fa: string;
  metric_key: string;
  current_value: string | null;
  threshold_value: string | null;
  metric_unit: string;
  suggested_action_fa: string;
  target_route: string;
  status: AlertStatus;
  triggered_at: string;
  acknowledged_at: string | null;
  acknowledged_by_user_id: string | null;
  resolved_at: string | null;
  action_note: string | null;
};

export type AlertsListResponse = {
  items: EarlyWarningAlertItem[];
  total_count: number;
};

export type AlertsSummaryResponse = {
  total_active: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  liquidity_count: number;
  credit_risk_count: number;
  supply_chain_count: number;
  compliance_count: number;
  active_alerts: EarlyWarningAlertItem[];
};

export type AlertWebhookCreateRequest = {
  name: string;
  url: string;
  secret_token?: string;
  min_severity: AlertSeverity;
};

export type AlertWebhookItem = {
  id: string;
  company_id: string;
  name: string;
  url: string;
  min_severity: AlertSeverity;
  is_active: boolean;
  created_at: string;
  last_triggered_at: string | null;
  last_delivery_status: string | null;
  last_delivery_code: number | null;
};

export type AlertWebhooksListResponse = {
  items: AlertWebhookItem[];
};

export type AlertWebhookTestResult = {
  webhook_id: string;
  is_success: boolean;
  status_code: number | null;
  message: string;
  duration_ms: number;
};

export type SimulationParametersRequest = {
  dso_change_days: number;
  early_settlement_discount_pct: number;
  discount_adoption_rate_pct: number;
  new_hires_count: number;
  avg_salary_monthly_irr: string;
  fixed_cost_monthly_change_irr: string;
  dpo_change_days: number;
  shock_customer_id?: string | null;
  shock_delay_days: number;
  shock_default_pct: number;
};

export type MetricDeltaItem = {
  baseline_value: string;
  simulated_value: string;
  delta_value: string;
  unit: string;
  is_improvement: boolean;
};

export type SimulatedWeekItem = {
  week_number: number;
  start_date: string;
  end_date: string;
  baseline_closing_cash_irr: string;
  simulated_closing_cash_irr: string;
  simulated_inflows_irr: string;
  simulated_outflows_irr: string;
  is_baseline_deficit: boolean;
  is_simulated_deficit: boolean;
};

export type SimulationResultResponse = {
  runway_days_delta: MetricDeltaItem;
  monthly_burn_rate_delta: MetricDeltaItem;
  cash_conversion_cycle_delta: MetricDeltaItem;
  liquidity_released_irr: string;
  discount_cost_annual_irr: string;
  net_annual_profit_impact_irr: string;
  first_deficit_week_baseline: number | null;
  first_deficit_week_simulated: number | null;
  executive_verdict_fa: string;
  risk_warnings_fa: string[];
  weeks: SimulatedWeekItem[];
};

export type PresetScenarioItem = {
  id: string;
  name_fa: string;
  description_fa: string;
  icon: string;
  parameters: SimulationParametersRequest;
};

export type PresetScenariosResponse = {
  items: PresetScenarioItem[];
};

export type SavedScenarioCreateRequest = {
  name: string;
  description?: string | null;
  is_favorite?: boolean;
  parameters: SimulationParametersRequest;
};

export type SavedScenarioItem = {
  id: string;
  company_id: string;
  name: string;
  description?: string | null;
  is_favorite: boolean;
  parameters: SimulationParametersRequest;
  result_summary: {
    runway_days_delta: string;
    simulated_runway: string;
    monthly_burn_delta: string;
    ccc_delta: string;
    net_annual_profit_impact: string;
    liquidity_released: string;
    executive_verdict: string;
    first_deficit_week: number | null;
  };
  created_at: string;
  updated_at: string;
};

export type SavedScenariosListResponse = {
  items: SavedScenarioItem[];
};

export type ComparativeMatrixColumn = {
  scenario_id: string;
  name: string;
  is_baseline: boolean;
  runway_days: number;
  runway_delta_days: number;
  monthly_burn_irr: string;
  monthly_burn_delta_irr: string;
  ccc_days: number;
  ccc_delta_days: number;
  liquidity_released_irr: string;
  net_annual_profit_impact_irr: string;
  first_deficit_week: number | null;
  verdict_fa: string;
  risk_level: "low" | "medium" | "high";
};

export type ComparativeMatrixRequest = {
  scenario_ids: string[];
  current_params?: SimulationParametersRequest | null;
};

export type ComparativeMatrixResponse = {
  columns: ComparativeMatrixColumn[];
};

export type DecisionMemoExportRequest = {
  scenario_id?: string | null;
  custom_params?: SimulationParametersRequest | null;
  scenario_title?: string;
  prepared_for?: string;
  memo_subject?: string;
  advisor_notes?: string | null;
};

// ==========================================
// Phase 2: Financial Calculation Engine DTOs
// ==========================================

export type MetricStatus =
  | "available"
  | "available_with_warning"
  | "approximate"
  | "insufficient_data"
  | "not_applicable";

export type MetricUnit = "irr" | "toman" | "day" | "month" | "ratio" | "percent";
export type ConfidenceLevel = "high" | "medium" | "low" | "none";
export type CalculationRunStatus =
  | "running"
  | "completed"
  | "completed_with_warnings"
  | "failed";

export type MetricEvidenceDTO = {
  title_fa: string;
  definition_fa: string;
  formula_fa: string;
  formula_version: string;
  components: Record<string, any>;
  reconciliation_notes: string[];
};

export type MetricResultDTO = {
  metric_key: string;
  metric_version: string;
  status: MetricStatus;
  value_numeric: number | null;
  value_formatted?: string | null;
  unit: MetricUnit;
  as_of_date: string;
  period_start?: string | null;
  period_end?: string | null;
  coverage_score: number;
  confidence: ConfidenceLevel;
  input_record_count: number;
  excluded_record_count: number;
  warnings: string[];
  evidence?: MetricEvidenceDTO | null;
};

export type CalculationRunDTO = {
  id: string;
  company_id: string;
  engine_version: string;
  status: CalculationRunStatus;
  as_of_date: string;
  period_start: string;
  period_end: string;
  metrics: Record<string, MetricResultDTO>;
  created_at: string;
};

export type DataFreshnessSource = {
  source_kind: "accounting" | "bank" | "sales";
  source_label: string;
  last_data_date: string | null;
  last_import_at: string | null;
  days_stale: number | null;
  is_stale: boolean;
  message: string;
};

export type DataFreshnessSummary = {
  as_of_date: string;
  is_any_stale: boolean;
  sources: DataFreshnessSource[];
};

export type KeyChangeItem = {
  metric_key: string;
  title_fa: string;
  change_statement: string;
  direction: "increase" | "decrease" | "neutral";
  previous_value: number | null;
  current_value: number | null;
  unit: string;
  severity: "positive" | "warning" | "critical" | "neutral";
};

export type ExecutiveDashboardResponse = {
  calculation_run_id: string;
  as_of_date: string;
  period_start: string;
  period_end: string;
  engine_version: string;
  primary_kpis: Record<string, MetricResultDTO>;
  key_changes: KeyChangeItem[];
  forecast_outlook: Record<string, any>;
  freshness: DataFreshnessSummary;
};

export type MetricTraceRecord = {
  entity_type: string;
  record_id: string;
  description: string;
  amount_irr: number | null;
  date: string;
  source_file_id?: string | null;
  source_file_name?: string | null;
  source_file_sha256?: string | null;
  source_row_number?: number | null;
  sheet_name?: string | null;
  raw_json?: Record<string, any>;
};

export type MetricTraceResponse = {
  metric_key: string;
  metric_version: string;
  calculation_run_id: string;
  total_records: number;
  excluded_records: number;
  sample_records: MetricTraceRecord[];
};

export type FinancialPolicyDTO = {
  company_id: string;
  dso_period_days: number;
  dso_method: string;
  burn_trailing_days: number;
  default_reporting_unit: "rial" | "toman";
  excluded_internal_transfer_accounts: string[];
  updated_at?: string | null;
};

// ==========================================
// Phase 3: Financial Control & Reconciliation
// ==========================================

export type UnmatchedBankTransaction = {
  id: string;
  booking_date: string;
  amount_irr: number;
  description: string;
  reference?: string | null;
  source_transaction_id?: string | null;
  source_row_id: string;
  bank_account_id?: string | null;
};

export type UnmatchedJournalLine = {
  id: string;
  journal_entry_id: string;
  line_id: string;
  entry_date: string;
  amount_irr: number;
  description: string;
  reference?: string | null;
  invoice_ref?: string | null;
  source_row_id: string;
  account_id?: string | null;
  counterparty_name?: string | null;
};

export type UnmatchedRecordsResponse = {
  bank_transactions: UnmatchedBankTransaction[];
  journal_lines: UnmatchedJournalLine[];
  unmatched_bank_transactions?: UnmatchedBankTransaction[];
  unmatched_journal_lines?: UnmatchedJournalLine[];
  total_unmatched_bank_amount?: number;
  total_unmatched_journal_amount?: number;
  total_bank_count?: number;
  total_journal_count?: number;
};

export type ManualMatchAllocationInput = {
  side: "bank" | "journal";
  bank_transaction_id?: string | null;
  journal_line_id?: string | null;
  allocated_amount_irr: number;
};

export type ManualMatchRequest = {
  bank_transaction_ids: string[];
  journal_line_ids: string[];
  match_type: "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many";
  allocations: ManualMatchAllocationInput[];
  note?: string | null;
};

export type FindingSeverity = "critical" | "high" | "medium" | "low";

export type FindingStatus =
  | "new"
  | "triaged"
  | "in_progress"
  | "resolved"
  | "verified"
  | "dismissed"
  | "reopened";

export type FindingListItem = {
  id: string;
  rule_code: string;
  category: FindingCategory;
  severity: FindingSeverity;
  status: FindingStatus;
  title_fa: string;
  summary_fa: string;
  financial_impact_irr: number | null;
  assigned_to_user_id: string | null;
  assignee_name?: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  is_suppressed: boolean;
  resolution_type?: string | null;
  fingerprint?: string;
};

export type MyActionQueue = {
  assigned_findings: FindingListItem[];
  verification_queue: FindingListItem[];
  assigned_count?: number;
  verification_count?: number;
};

export type FindingEvidenceItem = {
  id: string;
  evidence_type: string;
  claim_code: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  field_snapshot: Record<string, any>;
  calculation_snapshot: Record<string, any>;
  created_at: string;
};

export type FindingActivityItem = {
  id: string;
  user_id: string | null;
  user_name?: string | null;
  action_type: string;
  old_state: string | null;
  new_state: string | null;
  note: string | null;
  metadata?: Record<string, any>;
  created_at: string;
};

export type FindingDetail = {
  id: string;
  rule_code: string;
  category: FindingCategory;
  severity: FindingSeverity;
  status: FindingStatus;
  title_fa: string;
  summary_fa: string;
  financial_impact_irr: number | null;
  assigned_to_user_id: string | null;
  assignee_name?: string | null;
  due_date: string | null;
  assigned_at?: string | null;
  resolved_by_user_id?: string | null;
  resolver_name?: string | null;
  resolved_at?: string | null;
  resolution_type?: string | null;
  resolution_note?: string | null;
  verified_by_user_id?: string | null;
  verifier_name?: string | null;
  verified_at?: string | null;
  verification_note?: string | null;
  reopened_count: number;
  context_data: Record<string, any>;
  evidence_items: FindingEvidenceItem[];
  activities: FindingActivityItem[];
  is_suppressed: boolean;
  suppression_reason?: string | null;
  created_at: string;
  updated_at: string;
};

export type FindingDetectionRun = {
  id: string;
  company_id: string;
  status: "queued" | "running" | "completed" | "failed";
  trigger_type: "manual" | "post_calculation" | "post_reconciliation";
  findings_detected: number;
  findings_created: number;
  findings_updated: number;
  findings_suppressed: number;
  summary: Record<string, any>;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
};

export type FinancialControlPolicy = {
  id: string;
  rule_code: string;
  is_enabled: boolean;
  severity_override?: FindingSeverity | null;
  thresholds: Record<string, any>;
  updated_at: string;
};

export type InAppAlert = {
  id: string;
  company_id: string;
  user_id?: string | null;
  finding_id?: string | null;
  channel?: string;
  title_fa: string;
  body_fa?: string;
  message_fa?: string;
  severity?: FindingSeverity;
  is_read: boolean;
  created_at: string;
};

export type ControlOverview = {
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  total_active_count: number;
  total_impact_irr: number;
  resolved_count: number;
  verified_count: number;
  latest_reconciliation?: {
    run_id: string | null;
    period_end: string | null;
    matched_count: number;
    unmatched_bank_count: number;
    unmatched_journal_count: number;
    matched_amount_irr: number;
  } | null;
  recent_activities: Array<{
    id: string;
    finding_id: string;
    finding_title: string;
    user_name: string;
    action_type: string;
    note: string | null;
    created_at: string;
  }>;
};

export type OnboardingStepItem = {
  key: string;
  title_fa: string;
  status: "completed" | "in_progress" | "pending" | "blocked";
  blocker_message: string | null;
  cta_label: string | null;
  cta_route: string | null;
  responsible_role: string | null;
};

export type OnboardingStatus = {
  company_id: string;
  is_live: boolean;
  onboarding_stage: string;
  progress_percentage: number;
  steps: OnboardingStepItem[];
  active_blocker: string | null;
  next_action_fa: string | null;
  responsible_party_fa: string | null;
};

export type GoLiveValidationPayload = {
  cash_position_irr: string;
  receivables_irr: string;
  payables_irr: string;
  reconciliation_difference_irr: string;
  opening_balance_confirmed: boolean;
  user_statement: string;
};

export type SupportTicketPayload = {
  category: "P1_CRITICAL" | "P2_HIGH" | "P3_NORMAL" | "P4_QUESTION";
  subject: string;
  description: string;
  current_route?: string;
  error_digest?: string;
  safe_diagnostic_json?: Record<string, unknown>;
};

export type ProductFeedbackPayload = {
  category:
    | "BUG"
    | "UX_PROBLEM"
    | "DATA_ISSUE"
    | "MISSING_CONFIG"
    | "FEATURE_REQUEST"
    | "INTEGRATION"
    | "REPORTING"
    | "EDUCATION";
  problem_statement: string;
  context?: string;
  impact?: "high" | "medium" | "low";
  workaround?: string;
  requested_outcome?: string;
};

// Phase 7 Integration Types
export type IntegrationProvider = "sepidar" | "bank_direct" | "rahkaran";
export type ConnectionStatus = "connected" | "syncing" | "reauth_required" | "error" | "inactive" | "disconnected";

export type IntegrationConnection = {
  id: string;
  company_id: string;
  provider: IntegrationProvider;
  name: string;
  status: ConnectionStatus;
  config: Record<string, any>;
  last_sync_at: string | null;
  next_sync_at: string | null;
  last_error_message: string | null;
  last_sync_record_count: number;
  sync_interval_minutes: number;
  created_at: string;
  updated_at: string;
};

export type IntegrationSyncJob = {
  id: string;
  company_id: string;
  connection_id: string;
  sync_type: string;
  status: "queued" | "running" | "completed" | "failed" | "partial";
  started_at: string | null;
  completed_at: string | null;
  records_received: number;
  records_imported: number;
  records_rejected: number;
  watermark_cursor: string | null;
  summary: Record<string, any>;
  error_message: string | null;
  created_at: string;
};

export type ConnectionTestResult = {
  success: boolean;
  status: string;
  message_fa: string;
  latency_ms: number;
  details: Record<string, any>;
};

// Phase 7 Automation Types
export type AutomationActionType = "daily_morning_cycle" | "reconcile_and_findings" | "assign_overdue_ar" | "notify_staleness";

export type AutomationRule = {
  id: string;
  company_id: string;
  name: string;
  action_type: AutomationActionType;
  is_enabled: boolean;
  schedule_cron: string;
  config: Record<string, any>;
  last_run_at: string | null;
  next_run_at: string | null;
  last_status: string;
  created_at: string;
  updated_at: string;
};

export type AutomationRun = {
  id: string;
  company_id: string;
  rule_id: string;
  trigger_type: string;
  status: "running" | "succeeded" | "failed";
  started_at: string;
  completed_at: string | null;
  duration_ms: number;
  steps_executed: Array<{
    step: string;
    title_fa: string;
    status: string;
    details: Record<string, any>;
  }>;
  error_message: string | null;
  created_at: string;
};

// Phase 8 Product Health & Operational Metrics Types
export type CustomerHealthSummary = {
  company_id: string;
  company_name: string;
  is_live: boolean;
  health_status: "healthy" | "needs_attention" | "at_risk";
  last_data_refresh: string | null;
  last_user_activity: string | null;
  critical_findings_count: number;
  unreconciled_transactions_count: number;
  active_finance_users_count: number;
  implementation_hours_total: number;
  primary_business_objective?: string | null;
};

export type ValueMetricsOverview = {
  total_companies: number;
  live_companies: number;
  activated_companies: number;
  mean_time_to_first_value_hours: number;
  total_reconciliation_hours_saved_monthly: number;
  total_critical_errors_prevented: number;
  average_implementation_hours_per_company: number;
};
