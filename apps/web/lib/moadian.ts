import type { ImportBatch } from "./product-types";
export type ComparisonStatus = "matched" | "difference" | "suggested" | "internal_only" | "portal_only" | "review";
export const comparisonLabels: Record<ComparisonStatus, string> = {
  matched: "تطبیق با شماره مالیاتی", difference: "اختلاف اطلاعات", suggested: "تطبیق پیشنهادی",
  internal_only: "فقط در فایل حسابداری", portal_only: "فقط در فایل کارپوشه", review: "نیازمند بررسی",
};
export type InvoiceSnapshot = {
  row_id: string; batch_id: string; row_number: number; sheet: string; invoice_no: string; tax_id: string;
  issue_date: string; party_name: string; party_id: string; gross_amount: string; tax_amount: string | null;
  subject: string; reference_tax_id: string; status: string;
};
export type ComparisonItem = {
  status: ComparisonStatus; internal: InvoiceSnapshot | null; portal: InvoiceSnapshot | null;
  differences: string[]; limitations: string[]; reason: string;
};
export type ComparisonReport = {
  internal_batch_id: string; portal_batch_id: string; start_date: string; end_date: string;
  counts: Partial<Record<ComparisonStatus, number>>; total: number; items: ComparisonItem[];
  offset: number; limit: number; rejected_rows: number;
};
export type ComparisonSelection = { direction: "sales" | "purchases"; internal: string; portal: string; start: string; end: string };
export const completedInvoices = (batches: ImportBatch[]) => batches.filter((b) => ["completed", "completed_limited"].includes(b.status));

export function comparisonFilters(counts?: ComparisonReport["counts"]) {
  return [
    { value: "all" as const, label: "همه", count: counts ? Object.values(counts).reduce((total, count) => total + (count ?? 0), 0) : undefined },
    ...Object.entries(comparisonLabels).map(([value, label]) => ({
      value: value as ComparisonStatus, label, count: counts?.[value as ComparisonStatus] ?? (counts ? 0 : undefined),
    })),
  ];
}
