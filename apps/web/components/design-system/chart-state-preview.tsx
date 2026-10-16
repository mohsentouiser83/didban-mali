"use client";
import { useState } from "react";
import { toJalaliDate } from "@/lib/date-utils";
import { Line, LineChart, ReferenceLine } from "recharts";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState, StatusMessage } from "@/components/ui/financial";
import { FinancialChart, ChartGrid, ChartTooltip, ChartValueTooltip, ChartXAxis, ChartYAxis } from "@/components/ui/financial/financial-chart";
import { DashboardCashChart } from "@/components/product/dashboard-cash-chart";
import { DashboardForecast } from "@/components/product/dashboard-forecast";
import { CashFlowForecastChart } from "@/components/product/cashflow-forecast-chart";
import { sampleDailyPoints, sampleForecastOutlook, sampleWeeklyForecast } from "./chart-state-samples";

type ContentState = "ready" | "loading" | "empty" | "error";
const modes: { value: ContentState; label: string }[] = [{ value: "ready", label: "داده" }, { value: "loading", label: "بارگذاری" }, { value: "empty", label: "خالی" }, { value: "error", label: "خطا" }];
export function ChartStatePreview() {
  const [state, setState] = useState<ContentState>("ready");
  const [singleDay, setSingleDay] = useState(false);
  return <section id="chart-states" aria-label="نمونه نمودار و حالت‌های محتوا" className="grid min-w-0 gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-[22px] font-medium">نمودار و حالت‌های محتوا</h2><div role="group" aria-label="حالت نمونه" className="flex flex-wrap gap-1">{modes.map((mode) => <Button key={mode.value} variant={state === mode.value ? "outline" : "ghost"} aria-pressed={state === mode.value} onClick={() => setState(mode.value)}>{mode.label}</Button>)}</div></div>
    <FinancialChart label="نمودار نمونه مانده؛ میلیون تومان" loading={state === "loading"} empty={state === "empty"} error={state === "error" ? "نمودار دریافت نشد." : undefined} onRetry={() => setState("ready")}>
      <LineChart data={sampleDailyPoints} accessibilityLayer><ChartGrid /><ChartXAxis dataKey="date" tickFormatter={(value) => toJalaliDate(String(value))} /><ChartYAxis /><ReferenceLine y={0} stroke="var(--ds-danger)" /><ChartTooltip content={<ChartValueTooltip unit="میلیون تومان" labelFormatter={(value) => toJalaliDate(String(value))} />} /><Line name="مانده" dataKey="plot" stroke="var(--ds-primary)" isAnimationActive={false} /></LineChart>
    </FinancialChart>
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">{state === "loading" ? <LoadingState variant="list" rows={3} label="در حال دریافت فهرست نمونه" /> : state === "error" ? <ErrorState variant="compact" title="فهرست دریافت نشد." onRetry={() => setState("ready")} /> : state === "empty" ? <EmptyState variant="compact" title="نتیجه‌ای با این فیلتر پیدا نشد." hasActiveFilters onClearFilters={() => setState("ready")} /> : <StatusMessage>نمونه نمایشی؛ داده‌های شرکت تغییر نمی‌کند.</StatusMessage>}
      <ErrorState variant="inline">تاریخ پایان باید بعد از شروع باشد.</ErrorState>
    </div>
    <details className="min-w-0 rounded-[var(--ds-card-radius)] border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-medium">نمودار روزانه؛ داده کوتاه و کسری</summary><div className="mt-4 grid min-w-0 gap-4"><Button variant="outline" className="w-fit" aria-pressed={singleDay} onClick={() => setSingleDay((value) => !value)}>داده یک‌روزه</Button><DashboardCashChart key={String(singleDay)} points={singleDay ? sampleDailyPoints.slice(0,1) : sampleDailyPoints} hasPayments /></div></details>
    <details className="min-w-0 rounded-[var(--ds-card-radius)] border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-medium">نمودارهای دورنما؛ شکاف داده و جریان هفتگی</summary><div className="mt-4 min-w-0"><DashboardForecast outlook={sampleForecastOutlook} /></div></details>
    <details className="min-w-0"><summary className="cursor-pointer text-sm font-medium">پیش‌بینی هفتگی؛ آستانه و جزئیات</summary><div className="mt-4 min-w-0"><CashFlowForecastChart forecast={sampleWeeklyForecast} scenario="base" onScenarioChange={() => undefined} /></div></details>
  </section>;
}
