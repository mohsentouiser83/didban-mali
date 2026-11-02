import { amount, displayDate } from "./utils";

export interface BuilderSpec {
  period_id: string;
  source?: "imported_manifest" | "native_statement" | "native_invoice";
  kind: "metrics" | "invoices";
  basis: "ledger" | "bank" | "invoice" | "comparable_difference";
  metric_keys: string[];
  columns: string[];
  filters: {
    direction: "all" | "sales" | "purchases";
    party_id: string;
    overdue_only: boolean;
  };
}
export interface BuilderSnapshot {
  manifest_id: string | null;
  native_statement_id?: string | null;
  native_invoice_snapshot_id?: string | null;
  source?: "imported_manifest" | "native_statement" | "native_invoice";
  as_of?: string;
  spec: BuilderSpec;
  period: { start?: string; end?: string; name?: string };
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  row_count: number;
  evidence_refs: string[];
  limitations: string[];
  unit: string;
  title?: string;
}
export interface BuilderDefinition {
  id: string;
  name: string;
  spec: BuilderSpec;
  version: number;
}
export interface BuilderRun {
  id: string;
  definition_id: string;
  definition_version: number;
  manifest_id: string;
  created_at: string;
  title?: string;
  row_count?: number;
  snapshot: BuilderSnapshot;
}
export const metricOptions = [
  { value: "revenue", label: "درآمد دفتر", basis: "ledger" },
  { value: "expense", label: "هزینه دفتر", basis: "ledger" },
  { value: "pre_tax_profit", label: "سود پیش از مالیات", basis: "ledger" },
  { value: "net_profit", label: "سود خالص", basis: "ledger" },
  { value: "ar_ledger", label: "مطالبات تجاری دفتر", basis: "ledger" },
  { value: "ap_trade_ledger", label: "بدهی تجاری دفتر", basis: "ledger" },
  { value: "debt_total_ledger", label: "کل بدهی دفتر", basis: "ledger" },
  { value: "cash", label: "مانده بانک‌ها", basis: "bank" },
  { value: "cash_subset", label: "مانده حساب‌های دارای مبنا", basis: "bank" },
  { value: "ar_invoice", label: "مانده فاکتورهای فروش", basis: "invoice" },
  { value: "ap_invoice", label: "مانده فاکتورهای خرید", basis: "invoice" },
  {
    value: "ar_difference",
    label: "اختلاف قابل مقایسه مطالبات",
    basis: "comparable_difference",
  },
  {
    value: "ap_difference",
    label: "اختلاف قابل مقایسه بدهی",
    basis: "comparable_difference",
  },
];
export const nativeMetricOptions = [
  { value: "cash", label: "نقد دفتر اصلی", basis: "ledger" },
  ...metricOptions.filter((option) =>
    [
      "revenue",
      "expense",
      "pre_tax_profit",
      "ar_ledger",
      "ap_trade_ledger",
    ].includes(option.value),
  ),
];
export const sourceOptions = [
  { value: "imported_manifest", label: "دادهٔ واردشده" },
  { value: "native_statement", label: "دفتر اصلی دیدبان" },
  { value: "native_invoice", label: "فاکتور خدمات دفتر دیدبان" },
];
export const basisOptions = [
  { value: "ledger", label: "دفتر" },
  { value: "bank", label: "بانک" },
  { value: "invoice", label: "فاکتور" },
  { value: "comparable_difference", label: "اختلاف قابل مقایسه" },
];
export const metricColumns = [
  { value: "label", label: "شاخص" },
  { value: "value", label: "مبلغ" },
  { value: "unit", label: "واحد" },
  { value: "status", label: "وضعیت" },
  { value: "reason", label: "محدودیت" },
];
export const invoiceColumns = [
  { value: "reference", label: "فاکتور" },
  { value: "party_id", label: "طرف حساب" },
  { value: "date", label: "تاریخ" },
  { value: "due_date", label: "سررسید" },
  { value: "amount", label: "مبلغ" },
  { value: "paid", label: "تسویه‌شده" },
  { value: "remaining", label: "مانده" },
  { value: "status", label: "وضعیت" },
];
export function defaultSpec(
  periodId: string,
  kind: BuilderSpec["kind"] = "metrics",
  source: BuilderSpec["source"] = "imported_manifest",
): BuilderSpec {
  if (source === "native_invoice")
    return {
      ...defaultSpec(periodId, "invoices", "imported_manifest"),
      source,
    };
  if (source === "native_statement")
    return {
      period_id: periodId,
      source,
      kind: "metrics",
      basis: "ledger",
      metric_keys: ["revenue", "expense", "pre_tax_profit"],
      columns: ["label", "value", "status"],
      filters: { direction: "all", party_id: "", overdue_only: false },
    };
  return {
    period_id: periodId,
    source,
    kind,
    basis: kind === "invoices" ? "invoice" : "ledger",
    metric_keys: kind === "metrics" ? ["revenue", "expense", "net_profit"] : [],
    columns:
      kind === "metrics"
        ? ["label", "value", "status"]
        : ["reference", "party_id", "amount", "remaining", "status"],
    filters: { direction: "all", party_id: "", overdue_only: false },
  };
}
export function reportCell(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (value == null) return "ناموجود";
  if (key === "status")
    return (
      (
        {
          available: "موجود",
          limited: "محدود",
          estimated: "برآوردی",
          unavailable: "ناموجود",
        } as Record<string, string>
      )[String(value)] || "نامشخص"
    );
  if (key === "unit") return value === "IRR" ? "ریال" : String(value);
  if (["value", "amount", "paid", "remaining"].includes(key))
    return amount(String(value));
  if (["date", "due_date"].includes(key)) return displayDate(String(value));
  return String(value);
}
