import type { JournalDraftWriteResponse } from "./accounting";

export type TreasuryDirection = "receipt" | "payment";
export type TreasuryToolKind = "cash" | "bank_transfer" | "cheque" | "card" | "other";

export interface TreasuryAccountOption {
  id: string;
  kind: "bank" | "cash" | "petty_cash";
  name: string;
  active: boolean;
}

export interface TreasuryAccountOptionsResponse {
  items: TreasuryAccountOption[];
}

export interface TreasuryToolLine {
  id: string;
  company_id: string;
  created_at: string;
  document_id: string;
  line_index: number;
  tool_kind: TreasuryToolKind;
  treasury_account_id: string | null;
  cheque_id: string | null;
  bank_movement_id: string | null;
  amount: string;
  allocated_amount: string;
  remaining_amount: string;
  has_payment_proof: boolean;
  reference: string | null;
  due_date: string | null;
}

export interface TreasuryAllocationItem {
  id: string;
  company_id: string;
  created_at: string;
  tool_line_id: string;
  invoice_id: string;
  invoice_reference: string | null;
  amount: string;
  date: string;
  actor_id: string;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
}

export interface TreasuryDocumentItem {
  id: string;
  company_id: string;
  created_at: string;
  direction: TreasuryDirection;
  number: string;
  date: string;
  period_id: string;
  counterparty_id: string;
  counterparty_name: string | null;
  counterparty_code: string | null;
  total_amount: string;
  allocated_amount: string;
  allocatable_amount: string;
  has_payment_proof: boolean;
  original_unit: "IRR" | "TOMAN";
  description: string;
  operation_id: string | null;
  journal_id: string | null;
  state: "draft" | "posted" | "reversed";
  actor_id: string;
  version: number;
  tools: TreasuryToolLine[];
  allocations: TreasuryAllocationItem[];
}

export interface TreasuryDocumentListResponse {
  items: TreasuryDocumentItem[];
}

export interface TreasuryPreparedDraftResponse {
  document: TreasuryDocumentItem;
  draft: JournalDraftWriteResponse;
  operation_id: string;
}
