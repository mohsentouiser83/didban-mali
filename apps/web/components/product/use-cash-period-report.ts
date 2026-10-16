"use client";
import { useState } from "react";
import { Wallet, ArrowDownLeft, ArrowUpRight, Calculator } from "@/components/ui/icons";
import { toman } from "@/lib/cashflow-amounts";
import { useFinancialRange } from "@/lib/financial-periods";
import type { Company } from "@/lib/product-types";
import { usePeriodReport } from "./use-period-report";
export function useCashPeriodReport(company: Company) {
  const { range, setRange } = useFinancialRange(company.id);
  const { report, error, loading, refresh } = usePeriodReport(company.id, range);
  const cash = report?.cash;
  const rangeKey = `${company.id}:${range.start_date}:${range.end_date}`;
  const [selection, setSelection] = useState({ key: "", date: "" });
  const days = cash?.days ?? [];
  const selectedDay = days.find((day) => selection.key === rangeKey && day.date === selection.date) ?? days.at(-1);
  const dayIndex = days.findIndex((day) => day.date === selectedDay?.date);
  const money = (value: string | null | undefined) => value == null ? null : toman(value);
  const cards = [
    { title: "مانده ابتدای دوره", value: money(cash?.opening_balance_irr), icon: Wallet },
    { title: "واریزهای بانکی", value: money(cash?.inflows_irr), icon: ArrowDownLeft, detail: "جمع واریزهای ثبت‌شده؛ انتقال بین حساب‌ها نیز محاسبه می‌شود." },
    { title: "برداشت‌های بانکی", value: money(cash?.outflows_irr), icon: ArrowUpRight, detail: "جمع برداشت‌های ثبت‌شده؛ انتقال بین حساب‌ها نیز محاسبه می‌شود." },
    { title: "مانده پایان دوره", value: money(cash?.closing_balance_irr), icon: Calculator },
  ].map((card) => ({ ...card, currency: "تومان", empty: "ثبت نشده" }));
  const points = days.map((day) => ({ date: day.date, plot: day.balance_irr === null ? null : Number(day.balance_irr) / 10000000 }));
  const dayAmounts = selectedDay ? [
    { label: "مانده پایان روز", amount: money(selectedDay.balance_irr) },
    { label: "واریز بانکی", amount: cash?.inflows_irr === null ? null : money(selectedDay.inflows_irr) },
    { label: "برداشت بانکی", amount: cash?.outflows_irr === null ? null : money(selectedDay.outflows_irr) },
  ] : [];
  function chooseDate(date: string) { if (days.some((day) => day.date === date)) setSelection({ key: rangeKey, date }); }
  return { range, setRange, rangeKey, cash, error, loading, refresh, cards, points, selectedDay, dayAmounts, chooseDate,
    hasBalance: points.some((point) => point.plot !== null),
    discrepancy: cash?.warnings.some((message) => message.includes("تطبیق ندارد")) ?? false,
    canPrevious: dayIndex > 0, canNext: dayIndex >= 0 && dayIndex < days.length - 1,
    previous: () => { if (dayIndex > 0) chooseDate(days[dayIndex - 1].date); },
    next: () => { if (dayIndex >= 0 && dayIndex < days.length - 1) chooseDate(days[dayIndex + 1].date); },
  };
}
