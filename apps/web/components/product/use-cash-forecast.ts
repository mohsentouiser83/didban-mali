"use client";
import { useEffect, useState } from "react";
import { Wallet, ArrowUpRight, ArrowDownLeft, Calculator } from "@/components/ui/icons";
import { rial, toman } from "@/lib/cashflow-amounts";
import { currentRange } from "@/lib/financial-periods";
import { api } from "@/lib/product-api";
import type { CashFlowForecastResponse, CashFlowSummaryResponse } from "@/lib/product-types";
export function useCashForecast(companyId: string) {
  const [data, setData] = useState<{ companyId: string; summary: CashFlowSummaryResponse; forecast: CashFlowForecastResponse } | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    setData(null);
    Promise.all([
      api<CashFlowSummaryResponse>(`/companies/${companyId}/cashflow/summary`),
      api<CashFlowForecastResponse>(`/companies/${companyId}/cashflow/forecast?horizon_days=30&outflow_mode=planned&scenario=base`),
    ]).then(([summary, forecast]) => {
      if (active) setData({ companyId: companyId, summary, forecast });
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, retry]);

  const current = data?.companyId === companyId ? data : null;
  const accounts = current?.summary.cash_accounts ?? [];
  const account = accounts.length === 1 && accounts[0].method === "running_balance" ? accounts[0] : null;
  const cash = account?.balance_irr ?? null;
  const receipts = current?.forecast.projected_inflows_30d_irr ?? null;
  const hasPayments = current?.forecast.weeks.some((week) => !!week.payments?.length) ?? false;
  const payments = hasPayments ? current?.forecast.projected_outflows_30d_irr ?? null : null;
  const ending = cash !== null && receipts !== null && payments !== null
    ? (rial(cash) + rial(receipts) - rial(payments)).toString() : null;
  const cards = [
    { title: "مانده حساب", value: cash !== null ? toman(cash) : null, currency: "تومان", empty: "مانده موجود نیست", icon: Wallet },
    { title: "پرداخت‌های پیش رو", value: payments !== null ? toman(payments) : null, currency: "تومان", empty: "ثبت نشده", icon: ArrowUpRight },
    { title: "دریافت‌های مورد انتظار", value: receipts !== null ? toman(receipts) : null, currency: "تومان", empty: "—", icon: ArrowDownLeft },
    { title: "مانده پس از دریافت و پرداخت", value: ending !== null ? toman(ending) : null, currency: "تومان", empty: "قابل محاسبه نیست", icon: Calculator },
  ];

  return { cards, loading, failed, asOfDate: current?.forecast.as_of_date ?? currentRange().end_date, refresh: () => setRetry((value) => value + 1) };
}
