import type { ComparisonRun } from "@/hooks/use-company-comparison";
export interface ConsolidationComparison extends ComparisonRun {
  group_id: string;
}
export interface IntercompanyMapping {
  id: string;
  group_id: string;
  version: number;
  left_company: string;
  right_company: string;
  left_party_id: string;
  right_party_id: string;
  ownership_declaration: {
    percent: string;
    provenance: string;
    independently_verified: boolean;
    note: string;
  };
}
export interface ConsolidationSource {
  id: string;
  company_id: string;
  company_name: string;
  account: string;
  party_id: string;
  role: string;
  reference: string;
  date: string;
  debit: string;
  credit: string;
  source_row_id: string;
}
export interface ConsolidationSources {
  comparison_id: string;
  companies: { company_id: string; name: string; manifest_id: string | null }[];
  period: { start: string; end: string };
  rows: ConsolidationSource[];
  unavailable: { company_id: string; reason: string }[];
  approval_available: boolean;
}
export interface EliminationPair {
  mapping_id: string;
  left_line_id: string;
  right_line_id: string;
  kind: "balance" | "services";
  review_reason: string;
}
export interface ConsolidationDraft {
  id: string;
  digest: string;
  created_at: string;
  can_approve: boolean;
  approval_policy: string;
  approval_scope: string;
  approval_status: "unapproved" | "approved_selected_eliminations";
  approvals: ConsolidationApproval[];
  snapshot: {
    source_basis?: "native_statement" | "imported_manifest";
    title: string;
    company_ids: string[];
    period: { start: string; end: string };
    status: "draft";
    limitation: string;
    approval_available: boolean;
    metrics: {
      metric_key: string;
      label: string;
      basis: string;
      scope: string;
      before: string | null;
      adjustment: string;
      after: string | null;
      status: string;
      reason: string | null;
    }[];
    pairs: {
      kind: string;
      amount: string;
      reference: string;
      date: string;
      review_reason: string;
    }[];
  };
}
export interface ConsolidationApproval {
  id: string;
  actor_id: string;
  actor_name?: string;
  created_at: string;
  draft_digest: string;
  permission_provenance: string;
  policy_version: string;
}
export interface ConsolidationApprovalPreview {
  draft_id: string;
  expected_digest: string;
  policy_version: string;
  can_approve: boolean;
  draft: ConsolidationDraft;
  financial_effect: false;
}
export const emptyPair = (): EliminationPair => ({
  mapping_id: "",
  left_line_id: "",
  right_line_id: "",
  kind: "services",
  review_reason: "",
});
