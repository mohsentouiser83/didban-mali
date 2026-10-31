import type { Schema } from "@didban/api-client";
import { groupMoneyDigits } from "@/lib/money";
import { persianDigits } from "@/lib/dates";

export type DisplayUnit = "IRR" | "IRT";
export const metricLabels: Record<string, string> = {
  revenue: "درآمد",
  expense: "هزینه",
  net_profit: "سود خالص",
  profit_before_tax: "سود پیش از مالیات",
  cash: "مانده نقد",
  ar_ledger: "مطالبات دفتری",
  ar_invoice: "مطالبات فاکتوری",
  ap_trade_ledger: "بدهی تجاری دفتری",
  ap_invoice: "بدهی فاکتوری",
  debt_total_ledger: "کل بدهی‌های دفتری",
  ar_difference: "اختلاف مطالبات دفتر و فاکتورها",
  ap_difference: "اختلاف بدهی تجاری دفتر و فاکتورها",
};
export const metricOrder = Object.keys(metricLabels);
export const statusLabels = {
  available: "آماده",
  limited: "محدود",
  estimated: "برآوردی",
  unavailable: "داده کافی نیست",
} as const;
export const coverageLabels = {
  missing: "منبع موجود نیست",
  declared_complete: "کامل به اظهار کاربر",
  verified_complete: "کامل با کنترل مستقل",
  partial: "پوشش بخشی از دوره",
  unknown: "پوشش نامشخص",
} as const;
export const sourceLabels: Record<string, string> = {
  ledger: "دفتر حسابداری",
  trial_balance: "تراز آزمایشی",
  bank: "گردش بانک",
  invoices: "فاکتورها",
  sales_invoices: "فاکتورهای فروش",
  purchase_invoices: "فاکتورهای خرید",
  chart_of_accounts: "کدینگ حساب‌ها",
  opening_balances: "مانده ابتدای دوره",
  payment_schedule: "برنامه پرداخت",
  moadian: "صورتحساب مؤدیان",
  settlements: "سوابق دریافت‌وپرداخت",
  moadian_sales: "صورتحساب فروش مؤدیان",
  moadian_purchases: "صورتحساب خرید مؤدیان",
  planned_payments: "پرداخت‌های برنامه‌ریزی‌شده",
  receipt_history: "تاریخچه وصول",
};
export const unitLabel = (unit: DisplayUnit) =>
  unit === "IRT" ? "تومان" : "ریال";
export const moduleLabels: Record<string, string> = {
  bank_reconciliation: "تطبیق بانک",
  moadian_reconciliation: "تطبیق مؤدیان",
  moadian: "تطبیق مؤدیان",
  reconciliation: "تطبیق‌ها",
  settlements: "تخصیص دریافت‌وپرداخت",
  forecast: "پیش‌بینی نقدینگی",
  cashflow_forecast: "پیش‌بینی نقدینگی",
  reports: "گزارش قابل دانلود",
  report: "گزارش قابل دانلود",
};

/** Decimal string shift preserves amounts beyond JavaScript's integer precision. */
export function formatMoney(value: string | null, unit: DisplayUnit): string {
  if (value === null) return "—";
  if (!/^-?\d+(\.\d+)?$/.test(value)) return "نامعتبر";
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const digits = whole + fraction;
  const position = whole.length - (unit === "IRT" ? 1 : 0);
  const integral = (position > 0 ? digits.slice(0, position) : "0").replace(
    /^0+(?=\d)/,
    "",
  );
  const decimal = (
    (position < 0 ? "0".repeat(-position) : "") +
    digits.slice(Math.max(0, position))
  ).replace(/0+$/, "");
  const nonzero = /[1-9]/.test(integral + decimal);
  return persianDigits(
    `${negative && nonzero ? "−" : ""}${groupMoneyDigits(integral)}${decimal ? `٫${decimal}` : ""}`,
  );
}

const reasons: Record<string, string> = {
  forecast_invalid_payment_rows:
    "بعضی ردیف‌های برنامه پرداخت نامعتبرند؛ فقط تعهدهای معتبر در پیش‌بینی آمده‌اند.",
  forecast_invalid_history_rows:
    "بعضی سوابق وصول نامعتبرند؛ برآورد وصول فقط بر سابقه معتبر تکیه دارد.",
  forecast_invalid_invoice_rows:
    "بعضی فاکتورها نامعتبرند؛ دریافت و پرداخت آینده کامل نیست.",
  forecast_invalid_settlement_rows:
    "بعضی تسویه‌ها نامعتبرند؛ مانده تعهدهای وابسته قابل اتکا نیست.",

  trial_balance_source_missing: "تراز آزمایشی بارگذاری نشده است.",
  trial_balance_date_missing: "تراز آزمایشی در تاریخ گزارش موجود نیست.",
  trial_balance_scope_mismatch: "گردش تراز با بازه گزارش یکسان نیست.",
  trial_balance_closing_entries_unknown:
    "گردش پیش از اختتامیه مشخص نیست؛ سود دوره محاسبه نشد.",
  trial_balance_level_unknown: "سطح جزئی حساب‌های تراز مشخص نیست.",
  duplicate_trial_balance_account: "حساب تراز در همین بازه تکرار شده است.",
  trial_balance_unbalanced: "جمع بدهکار و بستانکار تراز برابر نیست.",
  trial_balance_rollforward_mismatch:
    "مانده ابتدا و گردش با مانده پایان تراز تطابق ندارد.",
  cashflow_activity_missing:
    "طبقه بعضی گردش‌های نقد مشخص نیست؛ خالص فعالیت کامل نیست.",
  cash_statement_bridge_mismatch: "گردش نقد با تغییر مانده دفتری تطابق ندارد.",

  invalid_amount: "مبلغ نامعتبر است؛ این شاخص محاسبه نشده است.",
  invalid_date: "تاریخ نامعتبر است؛ این شاخص محاسبه نشده است.",
  conflicting_row_identity:
    "شناسه ردیف‌ها تعارض دارد؛ این شاخص محاسبه نشده است.",
  source_missing: "منبع لازم برای این شاخص موجود نیست.",
  coverage_unknown: "پوشش دوره مشخص نشده است.",
  coverage_incomplete: "داده تمام دوره را پوشش نمی‌دهد.",
  invalid_rows: "ردیف‌های نامعتبر از محاسبه کنار گذاشته شده‌اند.",
  journal_unbalanced: "تراز ثبت‌های دفتر برقرار نیست.",
  account_role_unknown: "نقش بعضی حساب‌ها مشخص نیست.",
  ledger_opening_unknown: "مانده ابتدای دوره دفتر مشخص نیست.",
  income_tax_unknown:
    "هزینه مالیات بر درآمد مشخص نیست؛ سود خالص محاسبه نشده است.",
  cogs_unknown: "بهای تمام‌شده مشخص نیست.",
  income_tax_conflict: "هزینه مالیات با سند تخصیص سود تطابق ندارد.",
  periodic_cogs_template_scope:
    "قالب انتخابی بهای تمام‌شده ادواری را پوشش نمی‌دهد.",
  allocated_tax_template_scope:
    "قالب انتخابی مالیات سند تخصیص سود را پوشش نمی‌دهد.",
  bank_binding_unknown: "ارتباط حساب بانکی با دفتر مشخص نیست.",
  bank_source_accounts_ambiguous:
    "یک شیت شامل چند حساب بانکی است؛ فایل هر حساب را جدا بارگذاری کنید.",
  bank_anchor_unknown: "مانده مبنای حساب بانکی مشخص نیست.",
  bank_cutoff_unknown: "پوشش بانک تا تاریخ گزارش مشخص نیست.",
  bank_balance_mismatch: "مانده بانک با گردش حساب هم‌خوان نیست.",
  invoice_openings_unknown: "مانده باز فاکتورها در ابتدای دوره مشخص نیست.",
  settlement_coverage_unknown: "کامل بودن سوابق تسویه مشخص نیست.",
  due_date_missing: "سررسید مشخص نیست؛ معوق‌بودن قابل محاسبه نیست.",
  payment_dates_missing:
    "تاریخ بعضی تسویه‌ها موجود نیست؛ مانده تاریخی قابل محاسبه نیست.",
  invoice_identity_ambiguous: "هویت بعضی فاکتورها مبهم است.",
  settlement_invalid: "سوابق تسویه نیاز به اصلاح دارند.",
  scope_not_comparable: "دامنه دفتر و فاکتورها قابل مقایسه نیست.",
  aggregate_out_of_range: "مجموع از محدوده مجاز محاسبه خارج است.",
  comparison_missing: "داده قابل مقایسه دوره قبل موجود نیست.",
  zero_denominator: "مقدار دوره قبل صفر است؛ درصد تغییر محاسبه نمی‌شود.",
  sign_change: "علامت مبلغ نسبت به دوره قبل تغییر کرده است.",
  missing_ledger: "دفتر حسابداری بارگذاری نشده است.",
  missing_bank: "گردش بانک بارگذاری نشده است.",
  missing_invoices: "فاکتورها بارگذاری نشده‌اند.",
  missing_previous_period: "داده دوره قبل موجود نیست.",
  previous_period_unavailable: "داده معتبر دوره قبل موجود نیست.",
  insufficient_coverage: "پوشش داده برای این محاسبه کافی نیست.",
  incomplete_coverage: "داده تمام دوره را پوشش نمی‌دهد.",
  non_comparable_scope: "دامنه دفتر و فاکتورها قابل مقایسه نیست.",
};
export function reasonLabel(code: string): string {
  return (
    reasons[code] ?? "شرایط محاسبه کامل نیست؛ شواهد این شاخص را بررسی کنید."
  );
}
export function metricReason(metric: Schema<"MetricObservation">) {
  if (metric.reason_codes.includes("source_missing")) {
    const sources: Record<string, string> = {
      cash: "گردش بانک",
      ar_invoice: "فاکتورهای فروش",
      ap_invoice: "فاکتورهای خرید",
    };
    const source = sources[metric.metric_key] ?? "دفتر حسابداری";
    return `${source} بارگذاری نشده؛ ${metricLabels[metric.metric_key] ?? "این شاخص"} محاسبه نشده است.`;
  }
  return [...new Set(metric.reason_codes.map(reasonLabel))].join(" ");
}
export function orderMetrics(metrics: Schema<"MetricObservation">[]) {
  return [...metrics].sort((a, b) => {
    const ai = metricOrder.indexOf(a.metric_key),
      bi = metricOrder.indexOf(b.metric_key);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
}
