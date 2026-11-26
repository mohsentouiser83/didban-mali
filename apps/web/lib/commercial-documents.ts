import type { JournalDraftWriteResponse } from "./accounting";

export type CommercialDirection = "sale" | "purchase";
export type CommercialSettlementType = "on_account" | "cash" | "mixed";
export type CommercialDocumentStatus =
  | "draft"
  | "posted"
  | "partially_returned"
  | "fully_returned"
  | "reversed"
  | "discarded";

export interface CommercialDocumentLine {
  id: string;
  company_id: string;
  created_at: string;
  document_id: string;
  line_index: number;
  line_kind: "goods" | "service";
  item_id: string | null;
  description: string;
  unit: string;
  quantity: number;
  unit_price_irr: string;
  gross_amount_irr: string;
  line_discount_irr: string;
  net_before_inv_disc_irr: string;
  allocated_invoice_discount_irr: string;
  net_amount_irr: string;
  cost_irr: string;
  cost_layers: { journal_id: string; quantity: number; unit_cost_irr: string }[];
  returned_healthy_qty: number;
  returned_defective_qty: number;
  journal_line_id: string | null;
  inventory_movement_id: string | null;
  remaining_returnable_qty: number;
}

export interface CommercialDocument {
  id: string;
  company_id: string;
  created_at: string;
  version: number;
  number: string;
  direction: CommercialDirection;
  status: CommercialDocumentStatus;
  issue_date: string;
  posting_date: string | null;
  due_date: string | null;
  period_id: string;
  counterparty_id: string;
  party_name: string | null;
  party_snapshot: Record<string, unknown> & { name?: string };
  warehouse_id: string | null;
  warehouse_name: string | null;
  proforma_id: string | null;
  currency: "IRR" | "TOMAN";
  gross_amount_irr: string;
  line_discount_total_irr: string;
  invoice_discount_irr: string;
  net_amount_irr: string;
  open_balance_irr: string | null;
  settlement_type: CommercialSettlementType;
  cash_amount_irr: string;
  cheque_amount_irr: string;
  on_account_amount_irr: string;
  applied_credit_irr: string;
  vendor_reference: string | null;
  description: string;
  operation_id: string | null;
  draft_id: string | null;
  journal_id: string | null;
  native_invoice_id: string | null;
  accounts: Record<string, string | null>;
  actor_id: string;
  lines: CommercialDocumentLine[];
}

export interface CommercialDocumentListResponse {
  total: number;
  items: CommercialDocument[];
}

export interface CommercialDocumentDraftResponse {
  document: CommercialDocument;
  operation_id: string;
  draft: JournalDraftWriteResponse;
  source_reference: string;
  financial_effect: false;
}
