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

export type FindingRunStatus = "queued" | "processing" | "completed" | "completed_limited" | "failed";
export type FindingCode = "potential_missing_transaction" | "duplicate_transaction" | "amount_mismatch" | "date_mismatch" | "revenue_drop" | "profit_drop" | "expense_increase" | "receivables_increase";
export type FindingKind = "risk" | "anomaly" | "discrepancy" | "insight";
export type FindingCategory = "reconciliation" | "financial_analysis";
export type AssertionStatus = "deterministic" | "hypothesis";
export type PriorityBand = "critical" | "high" | "medium" | "low";
export type FindingWorkflowStatus = "needs_review" | "confirmed" | "dismissed" | "follow_up" | "resolved";
export type EvidenceType = "source_record" | "comparison" | "calculation" | "rule" | "coverage";
export type PriorityFactor = { score?: string; weight?: string; weighted_score?: string; reasons_fa?: string[] };
export type FindingGenerationRun = { id: string; company_id: string; analysis_run_id: string; reconciliation_run_id: string | null; status: FindingRunStatus; config_version: string; config: Record<string, unknown>; coverage: { reconciliation_findings?: { available?: boolean; reason?: string | null }; financial_trends?: { available?: boolean; comparison_analysis_run_id?: string | null; reason?: string | null } }; counts: { total?: number; by_code?: Partial<Record<FindingCode, number>>; catalog_size?: number; evidence_items?: number }; created_by: string; started_at: string | null; completed_at: string | null; failure_code: string | null; failure_message: string | null; created_at: string; updated_at: string };
export type Finding = { id: string; analysis_run_id: string; generation_run_id: string; reconciliation_match_id: string | null; finding_code: FindingCode; kind: FindingKind; category: FindingCategory; title_fa: string; summary_fa: string; assertion_status: AssertionStatus; severity: "high" | "medium" | "low"; priority_band: PriorityBand; priority_score: string; priority_explanation: { formula?: string; factors?: Partial<Record<"impact" | "materiality" | "confidence" | "urgency", PriorityFactor>>; score?: string; band?: PriorityBand; revenue_ratio?: string | null; critical_capped_for_low_confidence?: boolean; summary_fa?: string; uncertainty_fa?: string }; priority_model_version: string; priority_config: Record<string, unknown>; confidence_score: string; confidence_basis: Record<string, unknown>; affected_amount_irr: string | null; affected_ratio: string | null; period_start: string; period_end: string; reason_code: string; reason_parameters: Record<string, unknown>; calculation: Record<string, unknown>; rule_version: string; workflow_status: FindingWorkflowStatus; created_at: string; updated_at: string };
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
export type DashboardResponse = {
  snapshot: { analysis_run_id: string; period_start: string; period_end: string; analysis_status: "completed" | "completed_limited"; rule_set_version: string; completed_at: string; comparison_analysis_run_id: string | null };
  health: { overall_state: DashboardOverallState; financial_state: "critical_attention" | "attention" | "monitor" | "stable"; data_quality: "complete" | "limited"; highest_open_priority: PriorityBand | null; summary_fa: string; reasons_fa: string[] };
  metrics: DashboardMetric[];
  top_findings: DashboardFinding[];
  finding_summary: { total: number; by_priority: Record<PriorityBand, number>; by_workflow: Record<FindingWorkflowStatus, number>; top_limit: number; all_findings_path: string };
  main_drivers: DashboardDriver[];
  coverage: { overall_score: number; scoring_method: "simple_average_of_section_scores_v1"; sections: Record<string, DashboardCoverageSection>; limitations_fa: string[]; finding_generation_status: string | null; finding_generation_coverage: Record<string, unknown> };
};

export type ReportStatus = "queued" | "processing" | "completed" | "failed";
export type ReportAdvisorNote = { body: string; actor_id: string; finding_id?: string; source?: "decision" | "finding_note"; created_at?: string };
export type ReportFinding = { id: string; finding_code: FindingCode; title_fa: string; summary_fa: string; priority_band: PriorityBand; priority_score: string; confidence_score: string; affected_amount_irr: string | null; affected_ratio: string | null; workflow_status: FindingWorkflowStatus; is_top_finding: boolean; latest_decision: { decision: ReviewDecisionType; actor_id: string; created_at: string } | null; notes: Array<{ id: string; body: string; actor_id: string; supersedes_id: string | null; created_at: string }> };
export type ReportPayload = { schema_version: "report-snapshot-v1"; generated_at: string; title_fa: string; company: { id: string; legal_name: string; currency: string }; analysis: { id: string; period_start: string; period_end: string; status: AnalysisStatus; rule_set_version: string; completed_at: string | null }; overall_status: DashboardResponse["health"]; financial_overview: DashboardMetric[]; top_findings: DashboardFinding[]; main_drivers: DashboardDriver[]; data_coverage: DashboardResponse["coverage"]; advisor_note: ReportAdvisorNote | null; advisor_notes: ReportAdvisorNote[]; review_status: DashboardResponse["finding_summary"]; all_findings: ReportFinding[] };
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
