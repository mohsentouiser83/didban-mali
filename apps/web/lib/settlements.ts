export type SettlementInvoice = { source_row_id: string; key: string; direction: "sales" | "purchases"; number: string; invoice_no?: string; party_name: string; issue_date: string; gross_amount_irr: string; allocated_amount_irr: string; unallocated_amount_irr: string; review_reason: string | null };
export type BankCandidate = { id: string; booking_date: string; description: string; bank_label: string; amount_irr: string; available_amount_irr: string; reason: string };
export type SettlementDetail = { receipt_history_complete: boolean; invoice: SettlementInvoice; allocations: { id: string; bank_transaction_id: string; amount_irr: string; booking_date: string; description: string; reversed: boolean }[]; candidates: BankCandidate[]; transaction_total: number };
export const settlementMoney = (value: string) => new Intl.NumberFormat("fa-IR").format(BigInt(value));

export function settlementInvoiceStatus(invoice: SettlementInvoice): "needs_review" | "fully_allocated" | "partially_allocated" | "unallocated" {
  return invoice.review_reason ? "needs_review" : invoice.unallocated_amount_irr === "0" ? "fully_allocated" : invoice.allocated_amount_irr !== "0" ? "partially_allocated" : "unallocated";
}
