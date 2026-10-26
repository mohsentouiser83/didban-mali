import type { Schema } from "@didban/api-client";
import { persianDigits } from "@/lib/dates";
import { formatMoney, reasonLabel } from "@/features/results/presentation";
export function canonicalMoney(text: string): string | null {
  const value = text
    .trim()
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[٬,]/g, "")
    .replace(/٫/g, ".");
  return /^(?=.*[1-9])(?:0|[1-9][0-9]{0,31})(?:\.[0-9]{1,6})?$/.test(value)
    ? value
    : null;
}
export function invoiceReason(invoice: Schema<"InvoiceBalance">) {
  if (invoice.reason_codes.includes("allocation_source_changed"))
    return "نسخه فاکتور تغییر کرده؛ ارتباط تسویه قبلی باید تعیین تکلیف شود.";
  if (invoice.remaining_as_of === null)
    return "تاریخچه تسویه برای مانده این فاکتور کافی نیست.";
  return invoice.reason_codes.map(reasonLabel).join(" ");
}
export function balanceModels(
  work: Schema<"SettlementWorkspace">,
  direction: "sales" | "purchase",
  unit: "IRR" | "IRT",
) {
  const keys =
    direction === "sales"
      ? (["ar_ledger", "ar_invoice", "ar_difference"] as const)
      : ([
          "ap_trade_ledger",
          "ap_invoice",
          "ap_difference",
          "debt_total_ledger",
        ] as const);
  const labels = {
    ar_ledger: "مطالبات دفتری",
    ar_invoice: "مطالبات فاکتوری",
    ar_difference: "اختلاف قابل مقایسه",
    ap_trade_ledger: "بدهی تجاری دفتری",
    ap_invoice: "بدهی فاکتوری",
    ap_difference: "اختلاف قابل مقایسه",
    debt_total_ledger: "کل بدهی‌های دفتری",
  };
  return keys.map((key) => ({
    key,
    title: labels[key],
    value: formatMoney(work.totals[key], unit),
    missing: work.totals[key] === null,
  }));
}

export function invoiceOverdue(
  invoice: Pick<
    Schema<"InvoiceBalance">,
    "remaining_as_of" | "overdue_days" | "due_on"
  >,
): string {
  if (invoice.remaining_as_of === null) return "مانده نامشخص";
  if (/^0(?:\.0+)?$/.test(invoice.remaining_as_of)) return "تسویه‌شده";
  if (!invoice.due_on) return "سررسید نامشخص";
  if (invoice.overdue_days === null) return "معوق‌بودن نامشخص";
  return invoice.overdue_days > 0
    ? `${persianDigits(String(invoice.overdue_days))} روز سررسیدگذشته`
    : "جاری";
}
