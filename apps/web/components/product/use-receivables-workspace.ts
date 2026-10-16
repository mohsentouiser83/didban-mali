"use client";
import { Receipt, Clock, Calendar, Users } from "@/components/ui/icons";
import { currentRange, useFinancialRange } from "@/lib/financial-periods";
import { toman } from "@/lib/cashflow-amounts";
import type { Company } from "@/lib/product-types";
import { usePeriodReport } from "./use-period-report";
export function useReceivablesWorkspace(company: Company) {
  const { range, setRange } = useFinancialRange(company.id);
  const state = usePeriodReport(company.id, range);
  const summary = state.report?.receivables;
  const cards = [
    { title: "مطالبات ابتدای دوره", value: summary?.opening_balance_irr, icon: Receipt },
    { title: "فروش دوره", value: summary?.sales_irr, icon: Calendar },
    { title: "وصول‌های دوره", value: summary?.receipts_irr, icon: Users },
    { title: "مطالبات پایان دوره", value: summary?.closing_balance_irr, icon: Clock },
  ].map((card) => ({ ...card, value: card.value == null ? null : toman(card.value), currency: "تومان", empty: "نامشخص" }));
  return { ...state, range, setRange, summary, cards, canWrite: ["owner", "finance_manager", "advisor"].includes(company.role ?? ""), currentDate: currentRange().end_date };
}
