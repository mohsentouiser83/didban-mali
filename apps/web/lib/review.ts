import type { FindingStatus } from "./product-types";

export const reviewStatusLabels: Record<FindingStatus, string> = { new: "نیازمند بررسی", triaged: "بررسی اولیه", in_progress: "در حال پیگیری", reopened: "بازگشایی‌شده", resolved: "حل‌شده", verified: "تأیید نهایی", dismissed: "ردشده" };
export const reviewSeverityLabels: Record<string, string> = { critical: "بحرانی", high: "بالا", medium: "متوسط", low: "کم" };

export type ReviewReconciliationState = "suggested" | "no_candidate" | "matched" | "unavailable" | "not_applicable";
export const reviewReconciliationLabels: Record<ReviewReconciliationState, string> = { suggested: "پیشنهاد تأییدنشده", no_candidate: "بدون پیشنهاد تطبیق", matched: "تطبیق تأییدشده", unavailable: "بررسی‌نشده", not_applicable: "—" };
export type ReviewProposal = { id: string; score: string; match_type: string; payload: EvidencePayload };

export type ReviewItem = { reconciliation_state?: ReviewReconciliationState; id: string; title_fa: string; summary_fa: string; status: FindingStatus; severity: string; affected_amount_irr: string | null; assigned_to_name: string | null; due_date: string | null };
export type ReviewPreviewData = { title_fa?: string; can_review_proposals?: boolean; reconciliation_state?: ReviewReconciliationState; proposals?: ReviewProposal[]; summary_fa: string; status: FindingStatus; financial_impact_irr: string | null; assigned_to_name: string | null; due_date: string | null; evidence: { id: string; title_fa: string; description_fa: string; payload?: EvidencePayload }[] };
type SourceLocation = { source_file_id: string; source_filename: string; sheet_name: string; row_number: number; raw_values?: Record<string, unknown> };
export type EvidenceRecord = { account_name?: string; source?: SourceLocation; document_number?: string; source_entry_id?: string; reference?: string; description?: string; amount_irr?: string; date?: string };
export type EvidencePayload = EvidenceRecord & { bank?: EvidenceRecord; accounting?: EvidenceRecord; ledger_items?: EvidenceRecord[] };

export type ReviewDirection = "all" | "suggested" | "missing_accounting" | "missing_bank" | "matched";
export type ReviewDirectionCounts = Record<ReviewDirection, number>;
