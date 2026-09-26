"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  ChevronDown,
  ChevronLeft,
  Clock,
  Layers,
  PieChart,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Table,
  TrendingDown,
  TrendingUp,
  Wallet,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Column,
  FinancialDataTable,
  KpiMetricCard,
  MoneyDisplay,
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
import { CashFlowForecastChart } from "./cashflow-forecast-chart";

const RUNWAY_CONFIG: Record<
  CashRunwayStatus,
  { label: string; badge: string; border: string; desc: string }
> = {
  critical: {
    label: "بحرانی (کمتر از ۳۰ روز)",
    badge: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25",
    border: "border-s-red-600",
    desc: "ذخیره نقدینگی کمتر از ۱ ماه است. توقف فوری تعهدات غیرضروری و پیگیری فوری وصول مطالبات الزامی است.",
  },
  warning: {
    label: "هشدار نقدینگی (۳۰ تا ۶۰ روز)",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25",
    border: "border-s-amber-500",
    desc: "تاب‌آوری بین ۱ تا ۲ ماه. نیازمند تسریع وصول فاکتورها جهت پیشگیری از کسری در پایان ماه.",
  },
  monitor: {
    label: "پایش فعال (۶۰ تا ۹۰ روز)",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/25",
    border: "border-s-blue-500",
    desc: "ذخیره نقدینگی در وضعیت نظارت متعارف است. حفظ تعادل وصول و پرداخت دوره‌ای توصیه می‌شود.",
  },
  healthy: {
    label: "مطلوب و امن (بیش از ۱۲۰ روز)",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
    border: "border-s-emerald-500",
    desc: "پوشش نقدینگی بیش از یک فصل مالی. شرکت از ظرفیت مناسب جهت توسعه و مانور مالی برخوردار است.",
  },
  sustainable: {
    label: "خودکفا و پایدار (جریان نقد مثبت)",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
    border: "border-s-emerald-500",
    desc: "عملیات شرکت جریان نقد خالص مثبت تولید می‌کند و نیازی به اتکا به ذخایر نقدینگی ندارد.",
  },
};

function CashFlowSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" dir="rtl">
      <div className="h-10 bg-muted/60 rounded-xl w-64" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="h-28 bg-muted/60 rounded-xl" />
        <div className="h-28 bg-muted/60 rounded-xl" />
        <div className="h-28 bg-muted/60 rounded-xl" />
        <div className="h-28 bg-muted/60 rounded-xl" />
      </div>
      <div className="h-72 bg-muted/60 rounded-xl" />
    </div>
  );
}

export function CashFlowWorkspace({ company }: { company: Company }) {
  const searchParams = useSearchParams();
  const isForecastView = searchParams.get("view") === "forecast";
  const [summary, setSummary] = useState<CashFlowSummaryResponse | null>(null);
  const [forecast, setForecast] = useState<CashFlowForecastResponse | null>(null);
  const [scenario, setScenario] = useState<ScenarioType>("base");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFullTable, setShowFullTable] = useState(true);

  useEffect(() => {
    if (isForecastView && !loading) {
      const el = document.getElementById("forecast-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [isForecastView, loading]);

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

  // Buffer multiple for current cash KPI
  const bufferMultiple = useMemo(() => {
    if (!summary || !Number(summary.safety_buffer_irr)) return null;
    const current = Number(summary.current_cash_irr) || 0;
    const buffer = Number(summary.safety_buffer_irr) || 1;
    return (current / buffer).toFixed(1);
  }, [summary]);

  // Forecast table columns
  const forecastColumns: Column<CashFlowWeekItem>[] = [
    {
      key: "week_number",
      header: "هفته",
      align: "center",
      render: (row) => (
        <span className="font-mono text-xs font-medium bg-[var(--ds-muted-bg)] px-2 py-0.5 rounded border border-[var(--ds-border)]/60">
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
      header: "خالص گردش",
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
        <span className="font-semibold text-[var(--ds-card-fg)]">
          <MoneyDisplay amount={row.ending_cash_irr} compact />
        </span>
      ),
    },
    {
      key: "status",
      header: "وضعیت بافر امن",
      align: "center",
      render: (row) => {
        if (row.is_deficit) {
          return (
            <Badge variant="outline" className="text-[11px] bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25 font-medium">
              کسری ({toPersianDigits(row.deficit_amount_irr)})
            </Badge>
          );
        }
        return (
          <Badge variant="outline" className="text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25 font-medium">
            محدوده امن
          </Badge>
        );
      },
    },
  ];

  if (loading && !summary && !forecast) {
    return <CashFlowSkeleton />;
  }

  if (!summary && !forecast) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--ds-border)] bg-[var(--ds-card)] p-12 text-center space-y-4 min-h-[360px]" dir="rtl">
        <div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <WalletCards className="size-7 text-primary" />
        </div>
        <div className="max-w-md space-y-1">
          <h3 className="text-base font-bold text-foreground">هنوز جریان نقدی برای این شرکت ثبت نشده است</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            برای پیش‌بینی نقدینگی و تحلیل تاب‌آوری (Runway)، ابتدا باید صورتحساب‌های بانکی یا اسناد مالی بارگذاری و پردازش شوند.
          </p>
        </div>
        <Link href={`/companies/${company.id}/imports`}>
          <Button className="gap-2 text-xs">
            بارگذاری اسناد و گردش مالی
            <ChevronLeft className="size-4" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Sub-header Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1 border-b border-[var(--ds-border)]/60">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ds-card-fg)]">
            داشبورد نقدینگی و تاب‌آوری مالی
          </h2>
          <p className="text-xs text-[var(--ds-muted-fg)]">
            پایش موجودی در دسترس، شاخص بقای نقدی و شبیه‌سازی ورود و خروج وجوه
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {summary?.as_of_date && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--ds-muted-fg)] bg-[var(--ds-muted-bg)] px-2.5 py-1 rounded-lg border border-[var(--ds-border)]">
              <Calendar className="size-3 text-primary" />
              <span>مبنای داده‌ها:</span>
              <span className="font-medium text-[var(--ds-card-fg)]">{toPersianDigits(summary.as_of_date)}</span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(scenario, true)}
            disabled={refreshing}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCcw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>بروزرسانی</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards Row with refined typography */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Current Cash */}
        <KpiMetricCard
          title="موجودی نقد و بانک آزاد"
          value={summary?.current_cash_irr ?? 0}
          loading={loading}
          subtext={
            bufferMultiple
              ? `پوشش ${toPersianDigits(bufferMultiple)} برابری بافر امن`
              : "مجموع مانده‌های آزاد حساب‌ها"
          }
          icon={Wallet}
        />

        {/* KPI 2: Runway */}
        <KpiMetricCard
          title="تاب‌آوری نقدینگی (Runway)"
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
              ? `معادل ${toPersianDigits(summary.runway_months)} ماه با نرخ مصرف فعلی`
              : "جریان نقد پایدار"
          }
          icon={Clock}
        />

        {/* KPI 3: Monthly Burn Rate */}
        <KpiMetricCard
          title="نرخ مصرف خالص نقد (Burn Rate)"
          value={
            summary?.runway_status === "sustainable" || Number(summary?.monthly_burn_rate_irr || 0) <= 0
              ? "صفر / مازاد نقد"
              : summary?.monthly_burn_rate_irr ?? 0
          }
          loading={loading}
          subtext={
            summary?.runway_status === "sustainable"
              ? "شرکت مازاد نقد داشته و جریان نقد خودکفا است"
              : "میانگین مصرف خالص ماهانه"
          }
          icon={Activity}
        />

        {/* KPI 4: First Deficit Point */}
        <KpiMetricCard
          title="نخستین نقطه ریسک کسری"
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
              ? "ورود موجودی به زیر بافر ایمنی"
              : "تراز مثبت تا پایان افق ۱۳ هفته"
          }
          icon={summary?.first_deficit_week ? ShieldAlert : ShieldCheck}
        />
      </div>

      {/* Runway Advisory Banner (Clean, lighter typography) */}
      <div
        className={`rounded-xl border border-[var(--ds-border)] bg-[var(--ds-card)] border-s-4 ${runwayConf.border} p-4 shadow-xs`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            {summary?.runway_status === "critical" || summary?.runway_status === "warning" ? (
              <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-medium text-xs text-[var(--ds-muted-fg)]">
                  ارزیابی تاب‌آوری خزانه:
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${runwayConf.badge}`}>
                  {runwayConf.label}
                </span>
              </div>
              <p className="text-xs text-[var(--ds-muted-fg)] leading-relaxed">{runwayConf.desc}</p>
            </div>
          </div>
          <div className="text-xs text-start sm:text-end border-t sm:border-t-0 pt-2 sm:pt-0 border-[var(--ds-border)]/70 shrink-0">
            <span className="text-[var(--ds-muted-fg)] block">حداقل بافر نقدینگی امن:</span>
            <span className="font-semibold text-sm text-[var(--ds-card-fg)]">
              <MoneyDisplay amount={summary?.safety_buffer_irr ?? 0} compact />
            </span>
          </div>
        </div>
      </div>

      {/* DEDICATED SECTION: 13-Week Cash Flow Forecast & Interactive Inspector */}
      {forecast && (
        <div id="forecast-section" className="scroll-mt-6">
          <CashFlowForecastChart
            forecast={forecast}
            scenario={scenario}
            onScenarioChange={(nextScenario) => {
              setScenario(nextScenario);
              loadData(nextScenario);
            }}
            loading={refreshing}
          />
        </div>
      )}

      {/* Sources Breakdown Grid (Inflows vs Outflows) */}
      {forecast && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Inflows Breakdown */}
          <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs">
            <CardHeader className="p-4 pb-3 border-b border-[var(--ds-border)]/70">
              <CardTitle className="text-xs font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <ArrowDownLeft className="size-4" />
                  ترکیب منابع ورودی پیش‌بینی‌شده
                </span>
                <span className="font-bold text-[var(--ds-card-fg)]">
                  <MoneyDisplay amount={forecast.total_projected_inflows_irr} compact />
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {forecast.inflow_sources.length > 0 ? (
                forecast.inflow_sources.map((item) => (
                  <div key={item.category} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--ds-muted-fg)] font-medium">{item.category}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--ds-muted-fg)]">
                          <MoneyDisplay amount={item.amount_irr} compact />
                        </span>
                        <span className="font-semibold text-[var(--ds-card-fg)] tabular-nums">
                          {toPersianDigits(item.share_percentage.toFixed(1))}٪
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-[var(--ds-muted-bg)] rounded-full overflow-hidden">
                      <div
                        style={{ width: `${item.share_percentage}%` }}
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  داده‌ای برای ترکیب ورودی‌ها ثبت نشده است.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Outflows Breakdown */}
          <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs">
            <CardHeader className="p-4 pb-3 border-b border-[var(--ds-border)]/70">
              <CardTitle className="text-xs font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                  <ArrowUpRight className="size-4" />
                  ترکیب مصارف و خروجی‌های برنامه‌ریزی‌شده
                </span>
                <span className="font-bold text-[var(--ds-card-fg)]">
                  <MoneyDisplay amount={forecast.total_projected_outflows_irr} compact />
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {forecast.outflow_sources.length > 0 ? (
                forecast.outflow_sources.map((item) => (
                  <div key={item.category} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--ds-muted-fg)] font-medium">{item.category}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--ds-muted-fg)]">
                          <MoneyDisplay amount={item.amount_irr} compact />
                        </span>
                        <span className="font-semibold text-[var(--ds-card-fg)] tabular-nums">
                          {toPersianDigits(item.share_percentage.toFixed(1))}٪
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-[var(--ds-muted-bg)] rounded-full overflow-hidden">
                      <div
                        style={{ width: `${item.share_percentage}%` }}
                        className="h-full bg-rose-500 rounded-full transition-all duration-300"
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  داده‌ای برای ترکیب خروجی‌ها ثبت نشده است.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Forecast Table */}
      {forecast && (
        <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs overflow-hidden">
          <CardHeader className="p-4 border-b border-[var(--ds-border)]/70 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[var(--ds-card-fg)]">
              <Table className="size-4 text-primary" />
              <span>جدول تفصیلی گردش هفتگی وجوه نقد در افق ۱۳ هفته</span>
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFullTable((prev) => !prev)}
              className="text-xs h-7 gap-1 text-[var(--ds-muted-fg)]"
            >
              <span>{showFullTable ? "بستن جدول" : "مشاهده جدول"}</span>
              <ChevronDown className={`size-3.5 transition-transform ${showFullTable ? "rotate-180" : ""}`} />
            </Button>
          </CardHeader>

          {showFullTable && (
            <CardContent className="p-0">
              <FinancialDataTable
                data={forecast.weeks ?? []}
                columns={forecastColumns}
                keyExtractor={(row) => row.week_number}
                density="compact"
                emptyMessage="اطلاعات پیش‌بینی برای این سناریو یافت نشد."
              />
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
