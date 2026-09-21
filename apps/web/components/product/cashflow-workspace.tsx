"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Layers,
  RefreshCcw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Column,
  FinancialDataTable,
  KpiMetricCard,
  MoneyDisplay,
  RiskBadge,
  toPersianDigits,
} from "@/components/ui/financial";

import { api } from "@/lib/product-api";
import type {
  CashFlowForecastResponse,
  CashFlowSummaryResponse,
  CashFlowWeekItem,
  CashRunwayStatus,
  Company,
  ScenarioType,
} from "@/lib/product-types";

const RUNWAY_CONFIG: Record<
  CashRunwayStatus,
  { label: string; badge: string; border: string; desc: string }
> = {
  critical: {
    label: "بحرانی (کمتر از ۳۰ روز)",
    badge: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    border: "border-r-red-600",
    desc: "ذخیره نقدینگی کمتر از ۱ ماه است. توقف فوری تعهدات غیرضروری و پیگیری وصول مطالبات الزامی است.",
  },
  warning: {
    label: "هشدار نقدینگی (۳۰ تا ۶۰ روز)",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    border: "border-r-amber-500",
    desc: "تاب‌آوری بین ۱ تا ۲ ماه. نیازمند تسریع وصول فاکتورها جهت جلوگیری از کسری در پایان ماه.",
  },
  monitor: {
    label: "پایش فعال (۶۰ تا ۹۰ روز)",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    border: "border-r-blue-500",
    desc: "ذخیره نقدینگی در وضعیت نظارت متعارف است. توصیه به حفظ تعادل وصول و پرداخت دوره‌ای.",
  },
  healthy: {
    label: "مطلوب و امن (بیش از ۱۲۰ روز)",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    border: "border-r-emerald-500",
    desc: "پوشش نقدینگی بیش از یک فصل مالی. ظرفیت مناسب جهت سرمایه‌گذاری یا توسعه فعالیت‌ها.",
  },
  sustainable: {
    label: "خودکفا و پایدار (جریان نقد مثبت)",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    border: "border-r-emerald-500",
    desc: "عملیات شرکت جریان نقد مثبت تولید می‌کند و نیازی به مصرف ذخایر نقدینگی ندارد.",
  },
};

function CashFlowSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" dir="rtl">
      <div className="h-20 bg-muted rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="h-28 bg-muted rounded-xl" />
        <div className="h-28 bg-muted rounded-xl" />
        <div className="h-28 bg-muted rounded-xl" />
        <div className="h-28 bg-muted rounded-xl" />
      </div>
      <div className="h-64 bg-muted rounded-xl" />
    </div>
  );
}

export function CashFlowWorkspace({ company }: { company: Company }) {
  const [summary, setSummary] = useState<CashFlowSummaryResponse | null>(null);
  const [forecast, setForecast] = useState<CashFlowForecastResponse | null>(null);
  const [scenario, setScenario] = useState<ScenarioType>("base");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(
    async (targetScenario: ScenarioType, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const [sumRes, fcRes] = await Promise.allSettled([
          api<CashFlowSummaryResponse>(`/companies/${company.id}/cashflow/summary`),
          api<CashFlowForecastResponse>(
            `/companies/${company.id}/cashflow/forecast?scenario=${targetScenario}`
          ),
        ]);

        if (
          sumRes.status === "fulfilled" &&
          sumRes.value &&
          Number(sumRes.value.current_cash_irr) > 0
        ) {
          setSummary(sumRes.value);
        } else {
          setSummary(null);
        }

        if (
          fcRes.status === "fulfilled" &&
          fcRes.value &&
          fcRes.value.weeks?.length > 0
        ) {
          setForecast(fcRes.value);
        } else {
          setForecast(null);
        }
      } catch {
        setSummary(null);
        setForecast(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [company.id]
  );

  useEffect(() => {
    loadData(scenario);
  }, [loadData, scenario]);

  const runwayConf = summary
    ? RUNWAY_CONFIG[summary.runway_status]
    : RUNWAY_CONFIG.monitor;

  // Forecast table columns
  const forecastColumns: Column<CashFlowWeekItem>[] = [
    {
      key: "week_number",
      header: "هفته",
      align: "center",
      render: (row) => (
        <span className="font-mono text-xs font-bold bg-[var(--ds-muted-bg)] px-2 py-0.5 rounded">
          هفته {toPersianDigits(row.week_number)}
        </span>
      ),
    },
    {
      key: "dates",
      header: "بازه زمانی",
      render: (row) => (
        <span className="text-xs text-[var(--ds-muted-fg)]">
          {toPersianDigits(row.start_date)} تا {toPersianDigits(row.end_date)}
        </span>
      ),
    },
    {
      key: "starting_cash_irr",
      header: "مانده ابتدای دوره",
      numeric: true,
      align: "left",
      render: (row) => <MoneyDisplay amount={row.starting_cash_irr} compact />,
    },
    {
      key: "projected_inflows_irr",
      header: "ورودی پیش‌بینی‌شده (+)",
      numeric: true,
      align: "left",
      render: (row) => (
        <MoneyDisplay amount={row.projected_inflows_irr} compact direction="positive" />
      ),
    },
    {
      key: "projected_outflows_irr",
      header: "خروجی برنامه‌ریزی‌شده (-)",
      numeric: true,
      align: "left",
      render: (row) => (
        <MoneyDisplay amount={row.projected_outflows_irr} compact direction="negative" />
      ),
    },
    {
      key: "net_change_irr",
      header: "خالص جریان نقد",
      numeric: true,
      align: "left",
      render: (row) => (
        <MoneyDisplay amount={row.net_change_irr} compact direction="auto" showSign />
      ),
    },
    {
      key: "ending_cash_irr",
      header: "مانده پایان هفته",
      numeric: true,
      align: "left",
      render: (row) => (
        <span className="font-bold">
          <MoneyDisplay amount={row.ending_cash_irr} compact />
        </span>
      ),
    },
    {
      key: "status",
      header: "وضعیت بافر",
      align: "center",
      render: (row) => {
        if (row.is_deficit) {
          return (
            <Badge variant="outline" className="text-[11px] bg-red-50 text-red-700 border-red-200">
              کسری بافر ({toPersianDigits(row.deficit_amount_irr)})
            </Badge>
          );
        }
        return (
          <Badge variant="outline" className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200">
            محدوده امن
          </Badge>
        );
      },
    },
  ];

  if (loading) {
    return <CashFlowSkeleton />;
  }

  if (!summary && !forecast) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--ds-border)] bg-[var(--ds-card)] p-12 text-center space-y-4 min-h-[380px]" dir="rtl">
        <div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <WalletCards className="size-7 text-primary" />
        </div>
        <div className="max-w-md space-y-1">
          <h3 className="text-lg font-bold text-foreground">هنوز جریان نقدی برای این شرکت ثبت نشده است</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            برای پیش‌بینی نقدینگی و تحلیل بازه بقا (Runway)، ابتدا باید گردش حساب بانکی یا صورتحساب‌های مالی بارگذاری و تایید شوند.
          </p>
        </div>
        <Link href={`/companies/${company.id}/imports`}>
          <Button className="gap-2">
            رفتن به بارگذاری داده‌های مالی
            <ChevronLeft className="size-4" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[var(--ds-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-[var(--ds-card-fg)]">
              جریان وجوه نقد و پایش نقدینگی
            </h1>
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs">
              پیش‌بینی ۱۳ هفته‌ای خزانه
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {summary?.as_of_date && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--ds-muted-fg)] bg-[var(--ds-muted-bg)] px-3 py-1.5 rounded-lg border border-[var(--ds-border)]">
              <Calendar className="size-3.5 text-primary" />
              <span>مبنای محاسبه:</span>
              <span className="font-semibold text-[var(--ds-card-fg)]">{toPersianDigits(summary.as_of_date)}</span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(scenario, true)}
            disabled={refreshing}
            className="h-9 gap-1.5"
          >
            <RefreshCcw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>بروزرسانی</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiMetricCard
          title="موجودی نقد و بانک در دسترس"
          value={summary?.current_cash_irr ?? 0}
          loading={loading}
          subtext="مجموع مانده‌های آزاد حساب‌های بانکی"
          icon={Wallet}
        />
        <KpiMetricCard
          title="تاب‌آوری نقدینگی"
          value={summary?.runway_days ? `${toPersianDigits(summary.runway_days)} روز` : "پایدار"}
          unit=""
          currency=""
          loading={loading}
          status={
            summary?.runway_status === "critical"
              ? "critical"
              : summary?.runway_status === "warning"
              ? "warning"
              : "normal"
          }
          subtext={
            summary?.runway_months
              ? `معادل ${toPersianDigits(summary.runway_months)} ماه بر پایه نرخ مصرف فعلی`
              : "جریان نقد پایدار"
          }
          icon={Clock}
        />
        <KpiMetricCard
          title="میانگین جریان خروجی ماهانه"
          value={summary?.monthly_burn_rate_irr ?? 0}
          loading={loading}
          subtext="میانگین هزینه‌های عملیاتی ۳ ماه اخیر"
          icon={Activity}
        />
        <KpiMetricCard
          title="نقطه کسری نقدینگی پیش‌بینی‌شده"
          value={
            summary?.first_deficit_week
              ? `هفته ${toPersianDigits(summary.first_deficit_week)}`
              : "بدون کسری (امن)"
          }
          unit=""
          currency=""
          loading={loading}
          status={summary?.first_deficit_week ? "critical" : "normal"}
          subtext={
            summary?.first_deficit_week
              ? "افت به زیر بافر امن نقدینگی"
              : "تراز مثبت تا پایان افق ۱۳ هفته"
          }
          icon={ShieldAlert}
        />
      </div>

      {/* Runway Advisory Banner */}
      <Card
        className={`border border-[var(--ds-border)] bg-[var(--ds-card)] border-r-4 ${runwayConf.border} shadow-xs`}
      >
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            {summary?.runway_status === "critical" || summary?.runway_status === "warning" ? (
              <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-[var(--ds-card-fg)]">
                  ارزیابی تاب‌آوری خزانه:
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${runwayConf.badge}`}>
                  {runwayConf.label}
                </span>
              </div>
              <p className="text-xs text-[var(--ds-muted-fg)] mt-1">{runwayConf.desc}</p>
            </div>
          </div>
          <div className="text-xs text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-[var(--ds-border)]">
            <span className="text-[var(--ds-muted-fg)] block">حداقل بافر نقدینگی امن:</span>
            <span className="font-semibold text-[var(--ds-card-fg)]">
              <MoneyDisplay amount={summary?.safety_buffer_irr ?? 0} compact />
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Scenario Control & Timeline Card */}
      <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs">
        <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <SlidersHorizontal className="size-4 text-primary" />
                پیش‌بینی ۱۳ هفته‌ای جریان وجوه نقد
              </CardTitle>
            </div>

            {/* Scenario Segmented Selector */}
            <div className="flex items-center gap-1.5 p-1 bg-[var(--ds-muted-bg)] rounded-lg border border-[var(--ds-border)]">
              <Button
                variant={scenario === "base" ? "default" : "ghost"}
                size="sm"
                onClick={() => setScenario("base")}
                className="h-7 text-xs px-3 rounded-md"
              >
                پایه (واقع‌بینانه)
              </Button>
              <Button
                variant={scenario === "pessimistic" ? "default" : "ghost"}
                size="sm"
                onClick={() => setScenario("pessimistic")}
                className={`h-7 text-xs px-3 rounded-md ${
                  scenario !== "pessimistic" ? "text-amber-600 dark:text-amber-400" : ""
                }`}
              >
                بدبینانه (استرس نقد)
              </Button>
              <Button
                variant={scenario === "optimistic" ? "default" : "ghost"}
                size="sm"
                onClick={() => setScenario("optimistic")}
                className="h-7 text-xs px-3 rounded-md"
              >
                خوش‌بینانه (تسریع وصول)
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-5">
          {/* Visual Week Timeline Bars */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--ds-muted-fg)] pb-1">
              <span>روند مانده نقدینگی هفتگی در افق ۳ ماهه</span>
              <span className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded bg-emerald-500" /> ورودی هفتگی
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded bg-rose-500" /> خروجی هفتگی
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded bg-primary" /> مانده پایان هفته
                </span>
              </span>
            </div>

            {/* 13 Bars */}
            <div className="grid grid-cols-13 gap-1.5 pt-2">
              {forecast?.weeks.map((w) => {
                const isCurrentDeficit = w.is_deficit;
                return (
                  <div
                    key={w.week_number}
                    className="flex flex-col items-center gap-1 text-[11px] group cursor-default"
                  >
                    <div className="text-[10px] text-[var(--ds-muted-fg)] font-mono">
                      هـ{toPersianDigits(w.week_number)}
                    </div>
                    {/* Mini visual indicator */}
                    <div
                      className={`w-full h-14 rounded flex flex-col justify-end p-1 transition-all ${
                        isCurrentDeficit
                          ? "bg-red-500/15 border border-red-500/40"
                          : "bg-[var(--ds-muted-bg)] border border-[var(--ds-border)]"
                      }`}
                    >
                      <div
                        style={{
                          height: `${Math.min(
                            100,
                            Math.max(
                              15,
                              Number(w.ending_cash_irr) /
                                (Number(forecast.current_cash_irr) * 1.3) *
                                100
                            )
                          )}%`,
                        }}
                        className={`w-full rounded-xs transition-all ${
                          isCurrentDeficit ? "bg-red-500" : "bg-primary/80"
                        }`}
                      />
                    </div>
                    <span
                      className={`text-[10px] font-mono ${
                        isCurrentDeficit ? "text-red-600 font-bold" : "text-[var(--ds-muted-fg)]"
                      }`}
                    >
                      {toPersianDigits((Number(w.ending_cash_irr) / 10000000000).toFixed(1))}هـ
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sources Breakdown Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Inflows */}
            <Card className="border-[var(--ds-border)] bg-[var(--ds-card-bg)] shadow-none">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-xs font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-emerald-600">
                    <ArrowDownLeft className="size-4" />
                    ترکیب منابع ورودی نقدینگی
                  </span>
                  <span className="font-semibold text-[var(--ds-card-fg)]">
                    <MoneyDisplay amount={forecast?.total_projected_inflows_irr ?? 0} compact />
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                {forecast?.inflow_sources.map((item) => (
                  <div key={item.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--ds-muted-fg)]">{item.category}</span>
                      <span className="font-semibold text-[var(--ds-card-fg)]">
                        {toPersianDigits(item.share_percentage.toFixed(1))}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-[var(--ds-muted-bg)] rounded-full overflow-hidden">
                      <div
                        style={{ width: `${item.share_percentage}%` }}
                        className="h-full bg-emerald-500 rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Outflows */}
            <Card className="border-[var(--ds-border)] bg-[var(--ds-card-bg)] shadow-none">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-xs font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-rose-600">
                    <ArrowUpRight className="size-4" />
                    ترکیب مصارف و خروجی‌های برنامه‌ریزی‌شده
                  </span>
                  <span className="font-semibold text-[var(--ds-card-fg)]">
                    <MoneyDisplay amount={forecast?.total_projected_outflows_irr ?? 0} compact />
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                {forecast?.outflow_sources.map((item) => (
                  <div key={item.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--ds-muted-fg)]">{item.category}</span>
                      <span className="font-semibold text-[var(--ds-card-fg)]">
                        {toPersianDigits(item.share_percentage.toFixed(1))}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-[var(--ds-muted-bg)] rounded-full overflow-hidden">
                      <div
                        style={{ width: `${item.share_percentage}%` }}
                        className="h-full bg-rose-500 rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Detailed Forecast Table */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--ds-card-fg)] flex items-center gap-1.5">
                <Calendar className="size-4 text-primary" />
                جدول گردش هفتگی وجوه نقد در افق ۱۳ هفته
              </h3>
            </div>

            <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] overflow-hidden">
              <FinancialDataTable
                data={forecast?.weeks ?? []}
                columns={forecastColumns}
                keyExtractor={(row) => row.week_number}
                density="compact"
                emptyMessage="اطلاعات پیش‌بینی برای این سناریو یافت نشد."
              />
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
