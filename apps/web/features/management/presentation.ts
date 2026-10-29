import type { Schema } from "@didban/api-client";
import {
  formatMoney,
  reasonLabel,
  unitLabel,
} from "@/features/results/presentation";
import { formatDate, persianDigits } from "@/lib/dates";
export type ManagementKind =
  "statements" | "daily" | "analysis" | "cash-statement";
export const titles: Record<ManagementKind, string> = {
  statements: "صورت‌های مالی",
  "cash-statement": "صورت جریان وجوه نقد",
  daily: "گزارش روزانه مدیر مالی",
  analysis: "تحلیل تغییر سود و نقدینگی",
};
const reasons: Record<string, string> = {
  transfer_scope_unknown: "انتقال داخلی از گردش خارجی تفکیک نشده است.",
  expected_date_unknown: "تعهدهای بدون تاریخ در پیش‌بینی نیامده‌اند.",
  invoice_balance_unknown:
    "مانده بعضی فاکتورها مشخص نیست؛ در پیش‌بینی نیامده‌اند.",
  payment_history_unknown: "تاریخچه پرداخت بعضی تعهدها کامل نیست.",
  future_payment_coverage_unknown:
    "برنامه پرداخت کامل نیست؛ برآورد فقط تعهدهای معلوم را پوشش می‌دهد.",
  forecast_policy_unconfirmed: "زمان وصول بر پاسخ‌های موردی کاربر تکیه دارد.",
  forecast_sources_missing:
    "فاکتور باز یا برنامه پرداخت معتبر برای پیش‌بینی موجود نیست.",
  balance_anchor_missing: "مانده مبنای معتبر بانک موجود نیست.",
  cash_movement_coverage_unknown: "گردش بانک تمام بازه را پوشش نمی‌دهد.",
  cash_bridge_control_failed: "جمع گردش با تغییر مانده بانک تطابق ندارد.",
  income_tax_unknown: "مالیات عملکرد تا تاریخ گزارش مشخص نیست.",
  cogs_unknown: "بهای تمام‌شده تا تاریخ گزارش مشخص نیست.",
  template_accounts_unmapped: "بعضی حساب‌ها در قالب نگاشت نشده‌اند.",
  template_account_missing: "حساب تعیین‌شده در داده دفتر موجود نیست.",
  template_role_conflict: "سرفصل قالب با نقش حساب سازگار نیست.",
  template_section_missing: "بخش لازم در قالب تعریف نشده است.",
  balance_sheet_unbalanced: "جمع دارایی با بدهی و حقوق مالکانه برابر نیست.",
  variance_control_failed: "اجزای تغییر سود با تغییر کل تطابق ندارند.",
  bank_source_missing: "گردش بانک برای این روز موجود نیست.",
  forecast_date_or_sources_missing:
    "پیش‌بینی متناسب با تاریخ گزارش موجود نیست.",
};
export const managementReason = (codes: string[]) =>
  [...new Set(codes)].map((c) => reasons[c] ?? reasonLabel(c)).join(" ");
export function managementModel(
  data: Schema<"ManagementReport">,
  unit: "IRR" | "IRT",
) {
  const money = (value: string | null) => formatMoney(value, unit);
  const model = {
    cashStatement: data.cashflow_statement
      ? {
          metrics: (
            [
              ["opening", "وجه نقد آغاز بازه"],
              ["closing", "وجه نقد پایان بازه"],
              ["change", "تغییر وجه نقد"],
            ] as const
          ).map(([key, title]) => ({
            key,
            title,
            value: money(data.cashflow_statement![key].value),
            reason: managementReason(
              data.cashflow_statement![key].reason_codes,
            ),
          })),
          sections: data.cashflow_statement.sections.map((s) => ({
            key: s.key,
            label: s.label,
            value: money(s.net.value),
            known: money(s.classified_net.value),
            reason: managementReason(s.net.reason_codes),
          })),
          unclassifiedCount: persianDigits(
            String(data.cashflow_statement.unclassified_count),
          ),
          hasUnclassified: data.cashflow_statement.unclassified_count > 0,
          unclassifiedNet: money(
            data.cashflow_statement.unclassified_net.value,
          ),
          control:
            data.cashflow_statement.control.value === "0"
              ? "کنترل تغییر وجه نقد: برابر"
              : managementReason(data.cashflow_statement.control.reason_codes),
        }
      : null,
    unit: unitLabel(unit),
    range: `${formatDate(data.starts_on)} تا ${formatDate(data.as_of_date)}`,
    lines: data.statements.lines.map((line) => ({
      key: line.key,
      label: line.label,
      section: line.section,
      value: money(line.value),
      reason: managementReason(line.reason_codes),
      available: line.value !== null,
      accountCount: persianDigits(String(line.details.length)),
    })),
    totals: data.statements.totals.map((t) => ({
      key: t.key,
      label: t.label,
      value: money(t.value),
      reason: managementReason(t.reason_codes),
    })),
    control:
      data.statements.balance_control.value === "0"
        ? "کنترل تراز: برابر"
        : managementReason(data.statements.balance_control.reason_codes),
    unmapped: data.statements.unmapped_accounts.join("، "),
    days: data.daily.days.map((day) => ({
      date: day.date,
      label: formatDate(day.date),
      metrics: [
        { key: "opening", title: "مانده آغاز روز", value: money(day.opening) },
        {
          key: "inflow",
          title: "واریز ثبت‌شده بانک",
          value: money(day.inflow_recorded),
        },
        {
          key: "outflow",
          title: "برداشت ثبت‌شده بانک",
          value: money(day.outflow_recorded),
        },
        { key: "closing", title: "مانده پایان روز", value: money(day.closing) },
        {
          key: "expense",
          title: "هزینه ثبت‌شده دفتر",
          value: money(day.booked_expense.value),
        },
        {
          key: "net",
          title: "خالص گردش ثبت‌شده",
          value: money(day.net_recorded),
        },
      ],
      reason: managementReason(day.cash_reason_codes),
      expenseReason: managementReason(day.booked_expense.reason_codes),
      movementCount: persianDigits(String(day.movements.length)),
    })),
    upcoming: data.daily.upcoming.map((day) => ({
      date: formatDate(String(day.date)),
      incoming: money(day.expected_in == null ? null : String(day.expected_in)),
      outgoing: money(
        day.expected_out == null ? null : String(day.expected_out),
      ),
      closing: money(day.closing == null ? null : String(day.closing)),
    })),
    upcomingReason: managementReason(data.daily.upcoming_reason_codes),
    analysis: {
      delta: money(data.analysis.profit_delta),
      reason: managementReason(data.analysis.reason_codes),
      comparison:
        data.analysis.comparison_starts_on &&
        data.analysis.comparison_as_of_date
          ? `${formatDate(data.analysis.comparison_starts_on)} تا ${formatDate(data.analysis.comparison_as_of_date)}`
          : "",
      drivers: data.analysis.drivers.map((d, i) => ({
        key: String(i),
        account: d.account,
        label: d.label,
        current: money(d.current),
        previous: money(d.previous),
        effect: money(d.profit_effect),
        direction: d.profit_effect.startsWith("-") ? "کاهش سود" : "افزایش سود",
      })),
      cashBridge: data.analysis.cash
        ? {
            metrics: (
              [
                ["opening", "مانده آغاز بازه"],
                ["closing", "مانده پایان بازه"],
                ["change", "تغییر مانده نقد"],
                ["inflow", "واریز ثبت‌شده بانک"],
                ["outflow", "برداشت ثبت‌شده بانک"],
                ["external_inflow", "ورود خارجی"],
                ["external_outflow", "خروج خارجی"],
              ] as const
            ).map(([key, title]) => ({
              key,
              title,
              value: money(data.analysis.cash![key].value),
              reason: managementReason(data.analysis.cash![key].reason_codes),
            })),
            drivers: data.analysis.cash.drivers.map((d, i) => ({
              key: String(i),
              label: d.label,
              sheet: d.sheet_name,
              value: money(d.value),
              reason: managementReason(d.reason_codes),
            })),
          }
        : null,
      cash: data.analysis.cash_movements.map((m, i) => ({
        key: String(i),
        date: formatDate(m.date),
        account: m.account_name,
        amount: money(m.amount),
        reference: m.reference ?? "—",
      })),
    },
  };
  return {
    ...model,
    incomeLines: model.lines.filter(
      (line) => !["asset", "liability", "equity"].includes(line.section),
    ),
    balanceLines: model.lines.filter((line) =>
      ["asset", "liability", "equity"].includes(line.section),
    ),
    profitTotals: model.totals.filter((total) =>
      ["gross_profit", "operating_profit", "net_profit"].includes(total.key),
    ),
    balanceTotals: model.totals.filter((total) =>
      [
        "assets",
        "liabilities",
        "recorded_equity",
        "unclosed_earnings",
      ].includes(total.key),
    ),
  };
}
export type ManagementModel = ReturnType<typeof managementModel>;
export type DetailModel = {
  title: string;
  rows: {
    key: string;
    account: string;
    date: string;
    file: string;
    row: string;
    amount: string;
  }[];
  page: string;
  more: boolean;
  previous: boolean;
};
export function sourceDetail(
  ref: Schema<"ManagementSourceRef">,
  unit: "IRR" | "IRT",
) {
  return {
    key: ref.normalized_id,
    account: ref.account ?? "—",
    date: ref.date ? formatDate(ref.date) : "—",
    file: `${ref.file_name ?? ref.source_file_id} · ${ref.sheet_name}`,
    row: persianDigits(String(ref.row_number)),
    amount: `${ref.basis === "period_movement" ? "گردش دوره · " : ref.basis === "closing_balance" ? "مانده پایان · " : ""}بدهکار ${formatMoney(ref.debit, unit)} · بستانکار ${formatMoney(ref.credit, unit)}`,
  };
}
