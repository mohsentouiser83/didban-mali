"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  FileCheck2,
  Gauge,
  Receipt,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  WalletCards,
  AlertCircle,
  ArrowRightLeft,
  Clock,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MoneyDisplay,
  RiskBadge,
  StatusChip,
  KpiMetricCard,
  FinancialHealthBanner,
  toPersianDigits,
  FinancialHealthStatus,
  DataQualityStatus,
} from "@/components/ui/financial";

import { api } from "@/lib/product-api";
import type {
  AnalysisRun,
  CashFlowSummaryResponse,
  Company,
  DashboardMetric,
  PayablesSummaryResponse,
  ReceivablesSummaryResponse,
  DashboardResponse,
  PriorityBand,
} from "@/lib/product-types";

const primaryMetricIcons = {
  revenue_irr: TrendingUp,
  net_profit_irr: Activity,
  net_cash_movement_irr: WalletCards,
  sales_outstanding_irr: Receipt,
  payables_irr: FileCheck2,
  net_margin_ratio: Gauge,
};

const metricFallbackLabels: Record<string, string> = {
  revenue_irr: "درآمد عملیاتی",
  net_profit_irr: "سود خالص",
  net_cash_movement_irr: "خالص جریان نقد بانکی",
  sales_outstanding_irr: "مطالبات در جریان وصول",
  payables_irr: "حساب‌های پرداختنی تجاری",
  net_margin_ratio: "حاشیه سود خالص",
  expenses_irr: "کل هزینه‌های دوره",
  total_assets_irr: "مجموع دارایی‌ها",
  total_liabilities_irr: "مجموع بدهی‌ها",
  total_equity_irr: "حقوق مالکانه",
  sales_invoiced_irr: "فروش صورتحساب‌شده",
  sales_collected_irr: "مبلغ وصول‌شده",
};

const bandLabels: Record<PriorityBand, string> = {
  critical: "بحرانی",
  high: "بالا",
  medium: "متوسط",
  low: "پایین",
};

const coverageSections = [
  { key: "accounting", label: "دفتر حسابداری", hint: "طبقه‌بندی و تراز اسناد" },
  { key: "bank_cash_flow", label: "گردش حساب‌های بانکی", hint: "تراکنش‌ها و واریز/برداشت" },
  { key: "sales", label: "عملیات فروش و وصول", hint: "صورتحساب‌ها و فاکتورها" },
  { key: "gross_profit", label: "بهای تمام‌شده و سود ناخالص", hint: "تفکیک حساب‌های هزینه مستقیم" },
];

function faDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric" }).format(
      new Date(`${value}T12:00:00`)
    );
  } catch {
    return value;
  }
}

function faDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function DashboardWorkspace({ company }: { company: Company }) {
  const [analyses, setAnalyses] = useState<AnalysisRun[]>([]);
  const [analysisId, setAnalysisId] = useState("");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const [workingCapital, setWorkingCapital] = useState<{
    runwayDays: number;
    runwayStatus: string;
    dsoDays: number;
    dpoDays: number;
    cccDays: number;
    totalReceivables: string;
    totalPayables: string;
  } | null>(null);

  useEffect(() => {
    let ignore = false;
    async function loadWC() {
      try {
        const [cfRes, recRes, payRes] = await Promise.allSettled([
          api<CashFlowSummaryResponse>(`/companies/${company.id}/cashflow/summary`),
          api<ReceivablesSummaryResponse>(`/companies/${company.id}/receivables/summary`),
          api<PayablesSummaryResponse>(`/companies/${company.id}/payables/summary`),
        ]);

        if (ignore) return;

        const hasAny = cfRes.status === "fulfilled" || recRes.status === "fulfilled" || payRes.status === "fulfilled";
        if (!hasAny) {
          setWorkingCapital(null);
          return;
        }

        const runwayDays = cfRes.status === "fulfilled" ? cfRes.value.runway_days : 0;
        const runwayStatus = cfRes.status === "fulfilled" ? cfRes.value.runway_status : "normal";
        const dsoDays = recRes.status === "fulfilled" ? recRes.value.dso_days : 0;
        const dpoDays = payRes.status === "fulfilled" ? payRes.value.dpo_days : 0;
        const cccDays = payRes.status === "fulfilled" ? payRes.value.ccc_days : dsoDays - dpoDays;
        const totalReceivables =
          recRes.status === "fulfilled" ? recRes.value.total_receivables_irr : "0";
        const totalPayables =
          payRes.status === "fulfilled" ? payRes.value.total_payables_irr : "0";

        if (runwayDays === 0 && dsoDays === 0 && dpoDays === 0 && totalReceivables === "0" && totalPayables === "0") {
          setWorkingCapital(null);
          return;
        }

        setWorkingCapital({
          runwayDays,
          runwayStatus,
          dsoDays,
          dpoDays,
          cccDays,
          totalReceivables,
          totalPayables,
        });
      } catch {
        if (!ignore) {
          setWorkingCapital(null);
        }
      }
    }
    void loadWC();
    return () => {
      ignore = true;
    };
  }, [company.id]);

  const loadDashboard = useCallback(
    async (selectedId?: string) => {
      const query = new URLSearchParams({ top_limit: "5" });
      if (selectedId) query.set("analysis_run_id", selectedId);
      return api<DashboardResponse>(`/companies/${company.id}/dashboard?${query.toString()}`);
    },
    [company.id]
  );

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      setLoading(true);
      setError("");
      const [runsResult, dashboardResult] = await Promise.allSettled([
        api<AnalysisRun[]>(`/companies/${company.id}/analysis-runs?limit=30`),
        loadDashboard(),
      ]);

      if (ignore) return;

      if (runsResult.status === "fulfilled") {
        setAnalyses(
          runsResult.value.filter((item) => item.status === "completed" || item.status === "completed_limited")
        );
      }
      if (dashboardResult.status === "fulfilled") {
        setDashboard(dashboardResult.value);
        setAnalysisId(dashboardResult.value.snapshot.analysis_run_id);
      } else {
        setError(
          dashboardResult.reason instanceof Error
            ? dashboardResult.reason.message
            : "داشبورد مالی هنوز برای این شرکت آماده نیست."
        );
      }
      setLoading(false);
    }
    void bootstrap();
    return () => {
      ignore = true;
    };
  }, [company.id, loadDashboard]);

  async function changeSnapshot(value: string) {
    setAnalysisId(value);
    setSwitching(true);
    setError("");
    try {
      setDashboard(await loadDashboard(value));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تصویر تحلیلی این دوره بارگذاری نشد.");
    } finally {
      setSwitching(false);
    }
  }

  const metricsMap = useMemo(
    () => new Map(dashboard?.metrics.map((item) => [item.metric_code, item]) ?? []),
    [dashboard]
  );

  if (loading) return <DashboardSkeleton />;

  if (!dashboard) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--ds-border)] bg-[var(--ds-card)] p-12 text-center space-y-4 min-h-[380px]">
        <div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <BarChart3 className="size-7" />
        </div>
        <div className="max-w-md space-y-1">
          <h3 className="text-lg font-bold text-foreground">هنوز تصویری برای داشبورد مالی ثبت نشده است</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {error || "برای ساخت تصویر داشبورد، ابتدا باید حداقل یک دوره تحلیل مالی نرمال‌شده اجرا شود."}
          </p>
        </div>
        <Link href={`/companies/${company.id}/analysis`}>
          <Button className="gap-2">
            رفتن به اجرای تحلیل مالی
            <ChevronLeft className="size-4" />
          </Button>
        </Link>
      </div>
    );
  }

  const { snapshot, health, coverage, finding_summary: findingSummary, top_findings: topFindings, main_drivers: mainDrivers } = dashboard;

  // Map health state to banner props
  let mappedHealthStatus: FinancialHealthStatus = "attention";
  if (health.financial_state === "stable") mappedHealthStatus = "healthy";
  else if (health.financial_state === "critical_attention") mappedHealthStatus = "critical";

  const mappedDataQuality: DataQualityStatus = health.data_quality === "complete" ? "full" : "limited";

  return (
    <div className={switching ? "opacity-60 pointer-events-none transition-opacity duration-200 space-y-6" : "space-y-6"}>
      {/* Top Header: Company Overview & Period Switcher */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-[var(--ds-border)] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              <ShieldCheck className="size-3.5" />
              دیدبان مالی
            </span>
            <span className="text-xs text-muted-foreground">
              نسخه قواعد: <code className="font-mono text-foreground font-semibold">{snapshot.rule_set_version}</code>
            </span>
          </div>
          <h1 className="text-xl lg:text-2xl font-extrabold text-foreground tracking-tight">
            داشبورد مدیریت و کنترل مالی
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            ارقام، شواهد مغایرت و شاخص‌های اتکاپذیری داده بر پایه snapshot تغییرناپذیر
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col text-end">
            <span className="text-[11px] font-medium text-muted-foreground">دوره مالی انتخابی:</span>
            <span className="text-xs font-mono font-bold text-foreground">
              تکمیل: {faDateTime(snapshot.completed_at)}
            </span>
          </div>
          {analyses.length > 0 && (
            <Select value={analysisId} onValueChange={changeSnapshot} dir="rtl">
              <SelectTrigger className="w-[220px] font-bold text-xs">
                <Calendar className="size-3.5 text-primary ms-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {analyses.map((item) => (
                  <SelectItem key={item.id} value={item.id} className="text-xs">
                    {faDate(item.period_start)} تا {faDate(item.period_end)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="text-xs">
          {error}
        </Alert>
      )}

      {/* 2-Dimensional Health Banner */}
      <FinancialHealthBanner
        financialHealth={mappedHealthStatus}
        dataQuality={mappedDataQuality}
        reliabilityScore={coverage.overall_score}
        actionableFindingsCount={topFindings.length}
        periodLabel={`${faDate(snapshot.period_start)} تا ${faDate(snapshot.period_end)}`}
      />

      {/* Primary KPI Metrics Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-extrabold text-foreground flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            شاخص‌های کلیدی عملکرد و نقدینگی دوره
          </h2>
          <span className="text-xs text-muted-foreground">
            {snapshot.comparison_analysis_run_id ? "مقایسه با دوره قبل فعال است" : "دوره مبنا برای مقایسه روندی وجود ندارد"}
          </span>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Revenue */}
          <MetricCellCard
            code="revenue_irr"
            metric={metricsMap.get("revenue_irr")}
            icon={primaryMetricIcons.revenue_irr}
          />
          {/* Net Profit */}
          <MetricCellCard
            code="net_profit_irr"
            metric={metricsMap.get("net_profit_irr")}
            icon={primaryMetricIcons.net_profit_irr}
          />
          {/* Net Margin Ratio */}
          <MetricCellCard
            code="net_margin_ratio"
            metric={metricsMap.get("net_margin_ratio")}
            icon={primaryMetricIcons.net_margin_ratio}
            isRatio
          />
          {/* Net Cash Movement */}
          <MetricCellCard
            code="net_cash_movement_irr"
            metric={metricsMap.get("net_cash_movement_irr")}
            icon={primaryMetricIcons.net_cash_movement_irr}
          />
          {/* Sales Outstanding */}
          <MetricCellCard
            code="sales_outstanding_irr"
            metric={metricsMap.get("sales_outstanding_irr")}
            icon={primaryMetricIcons.sales_outstanding_irr}
          />
          {/* Payables */}
          <MetricCellCard
            code="payables_irr"
            metric={metricsMap.get("payables_irr")}
            icon={primaryMetricIcons.payables_irr}
          />
        </div>
      </div>

      {/* Working Capital & Treasury Runway Section */}
      {workingCapital && (
        <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs">
          <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                  <ArrowRightLeft className="size-4 text-primary" />
                  وضعیت سرمایه در گردش و تاب‌آوری خزانه (Working Capital & Treasury)
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  پایش هماهنگ مطالبات، پرداختنی‌ها و نقدینگی بر پایه چرخه تبدیل نقد (CCC)
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
                  چرخه تبدیل نقد: {toPersianDigits(workingCapital.cccDays)} روز
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Runway */}
              <Link
                href={`/companies/${company.id}/cashflow`}
                className="p-3.5 rounded-xl border border-[var(--ds-border)] bg-muted/40 hover:bg-muted/70 transition-colors group flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">تاب‌آوری نقد (Runway)</span>
                  <Clock className="size-4 text-primary" />
                </div>
                <div>
                  <div className="text-lg font-bold font-mono text-foreground">
                    {toPersianDigits(workingCapital.runwayDays)} روز
                  </div>
                  <span className="text-[11px] text-muted-foreground mt-0.5 block">
                    مشاهده پیش‌بینی ۱۳ هفته‌ای خزانه ←
                  </span>
                </div>
              </Link>

              {/* DSO */}
              <Link
                href={`/companies/${company.id}/receivables`}
                className="p-3.5 rounded-xl border border-[var(--ds-border)] bg-muted/40 hover:bg-muted/70 transition-colors group flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">دوره وصول مطالبات (DSO)</span>
                  <Receipt className="size-4 text-emerald-600" />
                </div>
                <div>
                  <div className="text-lg font-bold font-mono text-foreground">
                    {toPersianDigits(workingCapital.dsoDays)} روز
                  </div>
                  <span className="text-[11px] text-muted-foreground mt-0.5 block">
                    تحلیل ۵ بازه سنی بدهکاران ←
                  </span>
                </div>
              </Link>

              {/* DPO */}
              <Link
                href={`/companies/${company.id}/payables`}
                className="p-3.5 rounded-xl border border-[var(--ds-border)] bg-muted/40 hover:bg-muted/70 transition-colors group flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">دوره پرداخت بدهی‌ها (DPO)</span>
                  <FileCheck2 className="size-4 text-amber-600" />
                </div>
                <div>
                  <div className="text-lg font-bold font-mono text-foreground">
                    {toPersianDigits(workingCapital.dpoDays)} روز
                  </div>
                  <span className="text-[11px] text-muted-foreground mt-0.5 block">
                    مدیریت بستانکاران و تامین‌کنندگان ←
                  </span>
                </div>
              </Link>

              {/* CCC */}
              <div className="p-3.5 rounded-xl border border-[var(--ds-border)] bg-muted/40 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">چرخه تبدیل نقد (CCC)</span>
                  <ArrowRightLeft className="size-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-lg font-bold font-mono text-foreground">
                    {toPersianDigits(workingCapital.cccDays)} روز
                  </div>
                  <span className="text-[11px] text-muted-foreground mt-0.5 block">
                    DSO ({toPersianDigits(workingCapital.dsoDays)}) − DPO ({toPersianDigits(workingCapital.dpoDays)})
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two Columns: Actionable Findings & Data Coverage */}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
        {/* Top Actionable Findings */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                  <TriangleAlert className="size-4 text-amber-500" />
                  یافته‌های مهم نیازمند اقدام
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  ریسک‌های شناسایی‌شده توسط موتور قطعی بر پایه شواهد حسابرسی
                </CardDescription>
              </div>
              <Link href={`/companies/${company.id}/findings`}>
                <Button size="sm" variant="ghost" className="text-xs gap-1">
                  فهرست همه یافته‌ها
                  <ArrowUpRight className="size-3.5" />
                </Button>
              </Link>
            </div>

            {/* Finding Band Counts */}
            <div className="flex items-center gap-2 pt-2.5">
              {(["critical", "high", "medium", "low"] as PriorityBand[]).map((band) => {
                const count = findingSummary.by_priority[band] ?? 0;
                return (
                  <div
                    key={band}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--ds-border)] bg-muted/40 px-2.5 py-1 text-xs"
                  >
                    <RiskBadge level={band} size="sm" showIcon={false} label={bandLabels[band]} />
                    <span className="font-mono font-bold text-foreground">{toPersianDigits(count)}</span>
                  </div>
                );
              })}
            </div>
          </CardHeader>

          <CardContent className="pt-4 flex-1">
            {topFindings.length > 0 ? (
              <div className="divide-y divide-[var(--ds-border)]/60">
                {topFindings.map((finding) => (
                  <Link
                    key={finding.id}
                    href={`/companies/${company.id}/findings/${finding.id}`}
                    className="group flex items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40 rounded-lg px-2 -mx-2"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <RiskBadge level={finding.priority_band} score={Number(finding.priority_score)} size="sm" />
                      <div className="min-w-0">
                        <strong className="block truncate text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                          {finding.title_fa}
                        </strong>
                        <span className="block truncate text-[11px] text-muted-foreground mt-0.5">
                          {finding.summary_fa}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusChip status={finding.workflow_status} size="sm" />
                      <ChevronLeft className="size-4 text-muted-foreground group-hover:text-foreground transition-transform group-hover:-translate-x-1" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center space-y-2 text-muted-foreground">
                <CheckCircle2 className="size-8 text-emerald-500" />
                <p className="text-xs font-bold text-foreground">هیچ یافتهٔ بازی در این دوره وجود ندارد</p>
                <p className="text-[11px]">تمام شاخص‌ها در محدوده عادی قرار دارند.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Data Coverage & Limits */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  پوشش داده و مرزهای اتکا
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  ارزیابی کامل‌بودن منابع ورودی برای جلوگیری از تصمیم‌گیری بر داده ناقص
                </CardDescription>
              </div>
              <div className="text-end">
                <span className="font-mono text-base font-extrabold text-foreground">
                  {toPersianDigits(Math.round(coverage.overall_score))}٪
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-4 space-y-4 flex-1">
            {coverageSections.map(({ key, label, hint }) => {
              const section = coverage.sections[key];
              const score = Math.max(0, Math.min(100, Number(section?.score ?? 0)));
              const isAvailable = Boolean(section?.available);

              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={
                          isAvailable
                            ? "size-2 rounded-full bg-emerald-500"
                            : "size-2 rounded-full bg-amber-500"
                        }
                      />
                      <strong className="text-foreground">{label}</strong>
                    </div>
                    <span className="font-mono text-muted-foreground font-semibold">
                      {toPersianDigits(score)}٪
                    </span>
                  </div>
                  <Progress value={score} className="h-1.5" />
                  <span className="block text-[11px] text-muted-foreground">{hint}</span>
                </div>
              );
            })}

            {coverage.limitations_fa.length > 0 && (
              <div className="rounded-xl border border-[var(--ds-border)] bg-muted/40 p-3 text-xs space-y-1 mt-2">
                <span className="font-bold text-foreground flex items-center gap-1.5 text-[11px]">
                  <AlertCircle className="size-3.5 text-amber-600" />
                  {toPersianDigits(coverage.limitations_fa.length)} محدودیت عملیاتی ثبت‌شده:
                </span>
                <ul className="list-disc list-inside text-[11px] text-muted-foreground space-y-0.5 ps-1">
                  {coverage.limitations_fa.map((limitation, i) => (
                    <li key={i} className="truncate">
                      {limitation}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Drivers & Financial Position */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Main Drivers */}
        <Card>
          <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
            <CardTitle className="text-sm font-extrabold flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" />
              محرک‌های اصلی تغییرات دوره (Main Drivers)
            </CardTitle>
            <CardDescription className="text-xs">
              روندهای مالی قطعی که بیشترین سهم را در تغییرات سود و نقدینگی داشته‌اند
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {mainDrivers.length > 0 ? (
              <div className="divide-y divide-[var(--ds-border)]/60">
                {mainDrivers.map((driver) => (
                  <Link
                    key={driver.finding_id}
                    href={`/companies/${company.id}/findings/${driver.finding_id}`}
                    className="flex items-center justify-between gap-3 py-2.5 hover:bg-muted/30 rounded px-2 -mx-2 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <RiskBadge level={driver.priority_band} size="sm" showIcon={false} />
                      <span className="text-xs font-bold text-foreground truncate">{driver.title_fa}</span>
                    </div>
                    <div>
                      {driver.affected_amount_irr ? (
                        <MoneyDisplay amount={driver.affected_amount_irr} currency="ریال" size="sm" />
                      ) : driver.affected_ratio ? (
                        <span className="font-mono text-xs font-bold text-foreground">
                          {toPersianDigits((Number(driver.affected_ratio) * 100).toFixed(1))}٪
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground space-y-1">
                <p className="font-bold text-foreground">محرک مقایسه‌ای در این دوره شناسایی نشد</p>
                <p className="text-[11px]">برای تحلیل روندی، وجود حداقل دو دوره هم‌طول و یک یافته مالی تاییدشده الزامی است.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Supplementary Balance Sheet Positions */}
        <Card>
          <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
            <CardTitle className="text-sm font-extrabold flex items-center gap-2">
              <Receipt className="size-4 text-primary" />
              وضعیت ترازنامه و اقلام تکمیلی
            </CardTitle>
            <CardDescription className="text-xs">اقلام دارایی، بدهی، حقوق مالکانه و فروش صورتحساب‌شده</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                "expenses_irr",
                "total_assets_irr",
                "total_liabilities_irr",
                "total_equity_irr",
                "sales_invoiced_irr",
                "sales_collected_irr",
              ].map((code) => {
                const metric = metricsMap.get(code);
                const isAvailable = Boolean(metric?.available && metric.value != null);

                return (
                  <div
                    key={code}
                    className="flex flex-col justify-between rounded-lg border border-[var(--ds-border)] bg-muted/20 p-2.5"
                  >
                    <span className="text-[11px] text-muted-foreground">{metricFallbackLabels[code]}</span>
                    <div className="my-1">
                      {isAvailable ? (
                        <MoneyDisplay amount={metric?.value} currency="ریال" size="sm" />
                      ) : (
                        <span className="text-[11px] text-muted-foreground">غیرقابل‌محاسبه</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Snapshot Immutability Footnote */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-card)] p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <span>
            تصویر تحلیل مالی <strong className="text-foreground">{snapshot.analysis_run_id}</strong> با رعایت اصل عدم‌تغییرپذیری
            (Immutability) و زنجیره کامل شواهد ثبت شده است.
          </span>
        </div>
        <Link href={`/companies/${company.id}/reports`}>
          <Button size="sm" variant="outline" className="text-xs gap-1.5 h-7">
            تولید گزارش رسمی PDF (A4)
            <ArrowUpRight className="size-3" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

function MetricCellCard({
  code,
  metric,
  icon: Icon,
  isRatio = false,
}: {
  code: string;
  metric?: DashboardMetric;
  icon: React.ComponentType<{ className?: string }>;
  isRatio?: boolean;
}) {
  const isAvailable = Boolean(metric?.available && metric.value != null);
  const label = metric?.label_fa ?? metricFallbackLabels[code] ?? code;

  let trendConfig: { value: string; label?: string; direction?: "up" | "down" | "neutral"; isPositive?: boolean } | undefined;
  if (isAvailable && metric?.trend && metric.trend !== "unavailable") {
    trendConfig = {
      value: metric.trend === "up" ? "افزایش" : metric.trend === "down" ? "کاهش" : "ثابت",
      direction: metric.trend === "up" ? "up" : metric.trend === "down" ? "down" : "neutral",
      isPositive: metric.trend === "up",
    };
  }

  let formattedValue: number | string | null = null;
  if (isAvailable && metric?.value != null) {
    if (isRatio) {
      formattedValue = `${toPersianDigits((Number(metric.value) * 100).toFixed(1))}٪`;
    } else {
      formattedValue = metric.value;
    }
  }

  return (
    <KpiMetricCard
      title={label}
      value={formattedValue}
      currency={isRatio ? "" : "ریال"}
      icon={Icon}
      status={isAvailable ? "normal" : "limited"}
      limitedReason={metric?.unavailable_reason_fa}
      trend={trendConfig}
      coveragePercent={isAvailable ? 100 : null}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="در حال بارگذاری داشبورد مالی">
      <div className="flex justify-between items-center pb-4 border-b border-border">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-9 w-48" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
