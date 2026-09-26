"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  LineChart,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyDisplay, toPersianDigits } from "@/components/ui/financial";
import type {
  CashFlowForecastResponse,
  CashFlowWeekItem,
  ScenarioType,
} from "@/lib/product-types";

interface CashFlowForecastChartProps {
  forecast: CashFlowForecastResponse;
  scenario: ScenarioType;
  onScenarioChange: (scenario: ScenarioType) => void;
  loading?: boolean;
}

export function CashFlowForecastChart({
  forecast,
  scenario,
  onScenarioChange,
  loading = false,
}: CashFlowForecastChartProps) {
  // Default selected week: first deficit week or week 1
  const initialWeekNumber = useMemo(() => {
    const firstDeficit = forecast.weeks.find((w) => w.is_deficit);
    return firstDeficit ? firstDeficit.week_number : 1;
  }, [forecast.weeks]);

  const [selectedWeekNum, setSelectedWeekNum] = useState<number>(initialWeekNumber);

  const selectedWeek: CashFlowWeekItem = useMemo(() => {
    return (
      forecast.weeks.find((w) => w.week_number === selectedWeekNum) ??
      forecast.weeks[0]!
    );
  }, [forecast.weeks, selectedWeekNum]);

  // Max cash scale for relative bar heights
  const safetyBufferNum = Number(forecast.safety_buffer_irr) || 0;
  const maxCash = useMemo(() => {
    const highestEnding = Math.max(
      ...forecast.weeks.map((w) => Number(w.ending_cash_irr) || 0),
      Number(forecast.current_cash_irr) || 0,
      safetyBufferNum * 1.25
    );
    return highestEnding > 0 ? highestEnding * 1.15 : 1;
  }, [forecast.weeks, forecast.current_cash_irr, safetyBufferNum]);

  const bufferPercentage = Math.min(
    92,
    Math.max(12, (safetyBufferNum / maxCash) * 100)
  );

  const deficitWeeksCount = useMemo(
    () => forecast.weeks.filter((w) => w.is_deficit).length,
    [forecast.weeks]
  );

  return (
    <section className="space-y-4" aria-label="سکشن پیش‌بینی ۱۳ هفته‌ای نقدینگی">
      <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs overflow-hidden">
        {/* Header & Scenario Controls */}
        <CardHeader className="p-4 sm:p-5 border-b border-[var(--ds-border)] space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <LineChart className="size-4" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-[var(--ds-card-fg)] tracking-tight">
                  مدلسازی و پیش‌بینی ۱۳ هفته‌ای خزانه
                </h2>
                <Badge
                  variant="outline"
                  className="hidden sm:inline-flex text-[11px] font-medium border-[var(--ds-border)] bg-[var(--ds-muted-bg)] text-[var(--ds-muted-fg)]"
                >
                  افق ۳ ماهه
                </Badge>
              </div>
              <p className="text-xs text-[var(--ds-muted-fg)] leading-relaxed">
                رصد تعادل نقدینگی، پیش‌بینی ورودی/خروجی و تشخیص زودهنگام هفته‌های افت زیر بافر امن
              </p>
            </div>

            {/* Scenario Segmented Selector */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[var(--ds-muted-bg)] rounded-xl border border-[var(--ds-border)] self-start lg:self-auto">
              <button
                type="button"
                onClick={() => onScenarioChange("base")}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  scenario === "base"
                    ? "bg-[var(--ds-card)] text-foreground shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                پایه (واقع‌بینانه)
              </button>
              <button
                type="button"
                onClick={() => onScenarioChange("pessimistic")}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  scenario === "pessimistic"
                    ? "bg-[var(--ds-card)] text-amber-600 dark:text-amber-400 shadow-xs font-bold"
                    : "text-muted-foreground hover:text-amber-600"
                }`}
              >
                بدبینانه (استرس نقد)
              </button>
              <button
                type="button"
                onClick={() => onScenarioChange("optimistic")}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  scenario === "optimistic"
                    ? "bg-[var(--ds-card)] text-emerald-600 dark:text-emerald-400 shadow-xs font-bold"
                    : "text-muted-foreground hover:text-emerald-600"
                }`}
              >
                خوش‌بینانه (تسریع وصول)
              </button>
            </div>
          </div>

          {/* Quick Context Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs border-t border-[var(--ds-border)]/60">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-[var(--ds-muted-fg)]">
                <span className="size-2 rounded-full bg-primary" />
                <span>مانده پایان هفته (بالای بافر)</span>
              </div>
              <div className="flex items-center gap-1.5 text-[var(--ds-muted-fg)]">
                <span className="size-2 rounded-full bg-rose-500" />
                <span>کسری / افت به زیر بافر</span>
              </div>
              <div className="hidden md:flex items-center gap-1.5 text-[var(--ds-muted-fg)]">
                <span className="w-3.5 border-t border-dashed border-amber-500" />
                <span>حداقل بافر امن</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-[var(--ds-muted-fg)]">
                حداقل بافر امن خزانه:
              </div>
              <span className="font-semibold text-[var(--ds-card-fg)]">
                <MoneyDisplay amount={forecast.safety_buffer_irr} compact />
              </span>
              {deficitWeeksCount > 0 ? (
                <Badge variant="outline" className="gap-1 text-[11px] bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20 font-medium">
                  <AlertTriangle className="size-3" />
                  <span>{toPersianDigits(deficitWeeksCount)} هفته کسری</span>
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-medium">
                  <CheckCircle2 className="size-3" />
                  <span>پوشش کامل ۱۳ هفته</span>
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Chart Visualization Area */}
        <CardContent className="p-4 sm:p-6 space-y-6">
          <div className="relative pt-6 pb-2">
            {/* Safety Buffer Horizontal Line */}
            <div
              style={{ bottom: `${bufferPercentage}%` }}
              className="absolute inset-x-0 border-b border-dashed border-amber-500/70 z-10 pointer-events-none flex items-center justify-end"
            >
              <span className="text-[10px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-sm me-1">
                تراز بافر امن
              </span>
            </div>

            {/* 13 Week Columns Grid */}
            <div className="grid grid-cols-13 gap-1 sm:gap-2 h-56 sm:h-64 items-end border-b border-[var(--ds-border)] pb-2 relative">
              {forecast.weeks.map((w) => {
                const endingNum = Math.max(0, Number(w.ending_cash_irr) || 0);
                const heightPercent = Math.min(
                  100,
                  Math.max(10, (endingNum / maxCash) * 100)
                );
                const isSelected = w.week_number === selectedWeekNum;
                const isDeficit = w.is_deficit;

                return (
                  <button
                    key={w.week_number}
                    type="button"
                    onClick={() => setSelectedWeekNum(w.week_number)}
                    className={`group relative flex flex-col justify-end items-center h-full w-full rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      isSelected
                        ? "bg-primary/5 ring-1 ring-primary/40 shadow-xs"
                        : "hover:bg-[var(--ds-muted-bg)]/60"
                    }`}
                    aria-label={`هفته ${w.week_number}`}
                    title={`هفته ${w.week_number}: برای مشاهده ریز آمار کلیک کنید`}
                  >
                    {/* Deficit / Selected Indicator Top Pin */}
                    <div className="absolute top-1 inset-x-0 flex justify-center">
                      {isDeficit ? (
                        <span className="size-2 rounded-full bg-rose-500 animate-pulse" />
                      ) : isSelected ? (
                        <span className="size-1.5 rounded-full bg-primary" />
                      ) : null}
                    </div>

                    {/* Bar visual representation */}
                    <div className="w-full px-0.5 sm:px-1 h-full flex items-end">
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-t-sm sm:rounded-t-md transition-all duration-300 relative ${
                          isDeficit
                            ? "bg-rose-500/85 group-hover:bg-rose-600 shadow-xs"
                            : isSelected
                            ? "bg-primary shadow-xs"
                            : "bg-primary/60 group-hover:bg-primary/80"
                        }`}
                      >
                        {/* Net positive / negative micro-tag */}
                        {Number(w.net_change_irr) >= 0 ? (
                          <div className="absolute -top-3 inset-x-0 hidden sm:flex justify-center">
                            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold leading-none">
                              +
                            </span>
                          </div>
                        ) : (
                          <div className="absolute -top-3 inset-x-0 hidden sm:flex justify-center">
                            <span className="text-[9px] text-rose-600 dark:text-rose-400 font-bold leading-none">
                              -
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Week Label Under Column */}
                    <div className="pt-2 pb-1 text-center w-full">
                      <span
                        className={`text-[11px] block transition-colors ${
                          isSelected
                            ? "font-bold text-primary"
                            : isDeficit
                            ? "text-rose-600 font-medium"
                            : "text-[var(--ds-muted-fg)] group-hover:text-[var(--ds-card-fg)] font-medium"
                        }`}
                      >
                        هـ{toPersianDigits(w.week_number)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Week Inspector: Dedicated Detail Panel for Selected Week */}
          <div className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-muted-bg)]/40 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--ds-border)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                  {toPersianDigits(selectedWeek.week_number)}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--ds-card-fg)]">
                    جزئیات پیش‌بینی هفته {toPersianDigits(selectedWeek.week_number)}
                  </h3>
                  <p className="text-xs text-[var(--ds-muted-fg)]">
                    بازه زمانی: {toPersianDigits(selectedWeek.start_date)} تا{" "}
                    {toPersianDigits(selectedWeek.end_date)}
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                {selectedWeek.is_deficit ? (
                  <Badge variant="outline" className="text-xs py-1 px-3 bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25 font-medium gap-1.5">
                    <ShieldAlert className="size-3.5" />
                    <span>
                      کسری بافر امن:{" "}
                      <MoneyDisplay amount={selectedWeek.deficit_amount_irr} compact />
                    </span>
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs py-1 px-3 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25 font-medium gap-1.5">
                    <ShieldCheck className="size-3.5" />
                    <span>محدوده امن (بالای بافر)</span>
                  </Badge>
                )}

                {/* Week Navigation Buttons */}
                <div className="flex items-center gap-1 me-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={selectedWeekNum <= 1}
                    onClick={() => setSelectedWeekNum((prev) => Math.max(1, prev - 1))}
                    aria-label="هفته قبل"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={selectedWeekNum >= 13}
                    onClick={() => setSelectedWeekNum((prev) => Math.min(13, prev + 1))}
                    aria-label="هفته بعد"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* 5-Item Deconstructed Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* 1. Starting Cash */}
              <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-card)] p-3 space-y-1">
                <span className="text-[11px] font-medium text-[var(--ds-muted-fg)] block">
                  مانده ابتدای دوره
                </span>
                <div className="font-bold text-sm text-[var(--ds-card-fg)] tabular-nums">
                  <MoneyDisplay amount={selectedWeek.starting_cash_irr} compact />
                </div>
              </div>

              {/* 2. Inflows */}
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.02] p-3 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  <span>ورودی پیش‌بینی‌شده</span>
                  <ArrowDownLeft className="size-3.5" />
                </div>
                <div className="font-bold text-sm text-emerald-700 dark:text-emerald-400 tabular-nums">
                  <MoneyDisplay amount={selectedWeek.projected_inflows_irr} compact />
                </div>
              </div>

              {/* 3. Outflows */}
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.02] p-3 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-medium text-rose-700 dark:text-rose-400">
                  <span>خروجی برنامه‌ریزی‌شده</span>
                  <ArrowUpRight className="size-3.5" />
                </div>
                <div className="font-bold text-sm text-rose-700 dark:text-rose-400 tabular-nums">
                  <MoneyDisplay amount={selectedWeek.projected_outflows_irr} compact />
                </div>
              </div>

              {/* 4. Net Movement */}
              <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-card)] p-3 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-medium text-[var(--ds-muted-fg)]">
                  <span>خالص گردش دوره</span>
                  {Number(selectedWeek.net_change_irr) >= 0 ? (
                    <TrendingUp className="size-3.5 text-emerald-600" />
                  ) : (
                    <TrendingDown className="size-3.5 text-rose-600" />
                  )}
                </div>
                <div className="font-bold text-sm tabular-nums">
                  <MoneyDisplay
                    amount={selectedWeek.net_change_irr}
                    compact
                    direction="auto"
                    showSign
                  />
                </div>
              </div>

              {/* 5. Ending Cash */}
              <div
                className={`col-span-2 sm:col-span-1 rounded-lg border p-3 space-y-1 ${
                  selectedWeek.is_deficit
                    ? "border-rose-500/40 bg-rose-500/[0.05]"
                    : "border-primary/30 bg-primary/[0.03]"
                }`}
              >
                <span className="text-[11px] font-medium text-[var(--ds-muted-fg)] block">
                  مانده پایان هفته
                </span>
                <div
                  className={`font-bold text-sm tabular-nums ${
                    selectedWeek.is_deficit
                      ? "text-rose-700 dark:text-rose-400"
                      : "text-foreground"
                  }`}
                >
                  <MoneyDisplay amount={selectedWeek.ending_cash_irr} compact />
                </div>
              </div>
            </div>

            {/* Tactical Advisory if Deficit */}
            {selectedWeek.is_deficit && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-800 dark:text-red-300">
                <AlertTriangle className="size-4 shrink-0 mt-0.5 text-red-600" />
                <div className="leading-relaxed space-y-1">
                  <div className="font-bold">هشدار کسری نقدینگی در این مقطع:</div>
                  <div>
                    موجودی پیش‌بینی‌شده در پایان هفته {toPersianDigits(selectedWeek.week_number)}{" "}
                    به مبلغ{" "}
                    <span className="font-semibold underline">
                      <MoneyDisplay amount={selectedWeek.deficit_amount_irr} compact />
                    </span>{" "}
                    کمتر از حداقل بافر ایمنی شرکت خواهد بود. توصیه می‌شود تسویه بدهی‌های غیرضروری به تعویق افتاده یا وصولی فاکتورهای عمده مشتریان تسریع گردد.
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
