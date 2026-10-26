import type { Schema } from "@didban/api-client";
import { formatDate } from "@/lib/dates";
import { formatMoney, type DisplayUnit } from "@/features/results/presentation";
import { createFinancialChartData } from "@/components/ui/financial/chart-data";
const reasonLabels: Record<string, string> = {
  source_missing: "گردش بانک موجود نیست.",
  bank_binding_unknown: "ارتباط حساب بانک مشخص نیست.",
  bank_anchor_unknown: "مانده مبنای حساب مشخص نیست.",
  bank_balance_mismatch: "مانده با گردش بانک هم‌خوان نیست.",
  coverage_unknown: "پوشش گردش بانک تأیید نشده است.",
  coverage_incomplete: "گردش بانک بخشی از بازه را پوشش می‌دهد.",
  invalid_rows: "گردش بانک دارای ردیف نامعتبر است.",
  transfer_scope_unknown: "تفکیک انتقال داخلی و گردش خارجی تأیید نشده است.",
  aggregate_out_of_range: "مجموع از محدوده مجاز محاسبه خارج است.",
  period_range_limit: "نمای روزانه برای بازه بیش از ۱۰ سال آماده نمی‌شود.",
};
export const cashflowReason = (code: string) =>
  reasonLabels[code] ?? "داده معتبر برای این بخش کامل نیست.";
function scaled(v: string) {
  const negative = v.startsWith("-"),
    [integer, fraction = ""] = v.replace(/^-/, "").split(".");
  return (
    (BigInt(integer) * 1000000n + BigInt(fraction.padEnd(6, "0"))) *
    (negative ? -1n : 1n)
  );
}
function decimal(v: bigint) {
  const neg = v < 0n,
    a = neg ? -v : v;
  return `${neg ? "-" : ""}${a / 1000000n}${
    a % 1000000n
      ? "." +
        String(a % 1000000n)
          .padStart(6, "0")
          .replace(/0+$/, "")
      : ""
  }`;
}
export function cashflowSum(values: (string | null)[]) {
  if (!values.length || values.some((v) => v === null)) return null;
  const sum = values.reduce<bigint>((total, v) => total + scaled(v!), 0n);
  return sum >= 10n ** 38n || sum <= -(10n ** 38n) ? null : decimal(sum);
}
export function cashflowReportModel(
  days: Schema<"CashDay">[],
  unit: DisplayUnit,
) {
  const metrics = [
    ["end", "مانده پایان گزارش", days.at(-1)?.closing ?? null],
    ["in", "واریز ثبت‌شده", cashflowSum(days.map((d) => d.inflow_recorded))],
    ["out", "برداشت ثبت‌شده", cashflowSum(days.map((d) => d.outflow_recorded))],
    ["net", "خالص گردش ثبت‌شده", cashflowSum(days.map((d) => d.net_recorded))],
    [
      "external-in",
      "ورود خارجی طبق فایل‌ها",
      cashflowSum(days.map((d) => d.inflow_external)),
    ],
    [
      "external-out",
      "خروج خارجی طبق فایل‌ها",
      cashflowSum(days.map((d) => d.outflow_external)),
    ],
  ] as const;
  return {
    metrics: metrics.map(([key, title, value]) => ({
      key,
      title,
      value: formatMoney(value, unit),
      missing: value === null,
      reason:
        value !== null
          ? ""
          : key.startsWith("external")
            ? "تفکیک انتقال داخلی و گردش خارجی تأیید نشده است."
            : key === "end"
              ? "مانده معتبر همه حساب‌ها تا پایان گزارش موجود نیست."
              : days.some((d) => d.inflow_recorded === null)
                ? "گردش معتبر همه روزهای بازه موجود نیست."
                : !days.length
                  ? "ردیف روزانه‌ای برای این بازه موجود نیست."
                  : "مجموع از محدوده مجاز محاسبه خارج است.",
    })),
    chart: createFinancialChartData(
      days.map((d) => ({ label: formatDate(d.date), value: d.closing })),
    ),
    options: days.map((d) => ({ value: d.date, label: formatDate(d.date) })),
  };
}
export function dayModel(day: Schema<"CashDay">, unit: DisplayUnit) {
  return {
    date: formatDate(day.date),
    opening: formatMoney(day.opening, unit),
    closing: formatMoney(day.closing, unit),
    inflow: formatMoney(day.inflow_recorded, unit),
    outflow: formatMoney(day.outflow_recorded, unit),
    externalIn: formatMoney(day.inflow_external, unit),
    externalOut: formatMoney(day.outflow_external, unit),
    internal: formatMoney(day.internal_net, unit),
    reasons: day.reason_codes.map(cashflowReason),
    movements: day.movements.map((m) => ({
      ...m,
      amount: formatMoney(m.amount, unit),
    })),
  };
}
export type CashflowReportModel = ReturnType<typeof cashflowReportModel>;
export type CashflowDayModel = ReturnType<typeof dayModel>;
