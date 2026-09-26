"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Coins,
  Compass,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FileUp,
  Gauge,
  Info,
  Landmark,
  PieChart,
  Receipt,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  WalletCards,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  MoneyDisplay,
  RiskBadge,
  StatusChip,
  toPersianDigits,
  PageHeader,
  EmptyState,
} from "@/components/ui/financial";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalysisWorkspace } from "./analysis-workspace";
import { ExecutiveCalculationPanel } from "./executive-calculation-panel";
import { CustomerValueSummary } from "./customer-value-summary";
import { DataStalenessBanner } from "./data-staleness-banner";

import { api } from "@/lib/product-api";
import type {
  AnalysisRun,
  CashFlowSummaryResponse,
  Company,
  DashboardMetric,
  ExecutiveDashboardResponse,
  PayablesSummaryResponse,
  ReceivablesSummaryResponse,
  DashboardResponse,
  PriorityBand,
} from "@/lib/product-types";


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

const priorityBandConfigs: Record<
  PriorityBand,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    textClass: string;
    bgClass: string;
    borderClass: string;
  }
> = {
  critical: {
    icon: ShieldAlert,
    label: "ریسک بحرانی",
    textClass: "text-rose-600 dark:text-rose-400",
    bgClass: "bg-rose-500/10",
    borderClass: "border-rose-500/30",
  },
  high: {
    icon: AlertCircle,
    label: "ریسک بالا",
    textClass: "text-amber-600 dark:text-amber-400",
    bgClass: "bg-amber-500/10",
    borderClass: "border-amber-500/30",
  },
  medium: {
    icon: AlertTriangle,
    label: "ریسک متوسط",
    textClass: "text-yellow-600 dark:text-yellow-500",
    bgClass: "bg-yellow-500/10",
    borderClass: "border-yellow-500/30",
  },
  low: {
    icon: Info,
    label: "ریسک پایین",
    textClass: "text-slate-600 dark:text-slate-400",
    bgClass: "bg-slate-500/10",
    borderClass: "border-slate-500/30",
  },
};

const balancePositionConfigs: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; colorClass: string; bgClass: string }
> = {
  expenses_irr: {
    icon: Coins,
    colorClass: "text-rose-600 dark:text-rose-400",
    bgClass: "bg-rose-500/10",
  },
  total_assets_irr: {
    icon: Landmark,
    colorClass: "text-cyan-600 dark:text-cyan-400",
    bgClass: "bg-cyan-500/10",
  },
  total_liabilities_irr: {
    icon: Scale,
    colorClass: "text-amber-600 dark:text-amber-400",
    bgClass: "bg-amber-500/10",
  },
  total_equity_irr: {
    icon: PieChart,
    colorClass: "text-purple-600 dark:text-purple-400",
    bgClass: "bg-purple-500/10",
  },
  sales_invoiced_irr: {
    icon: FileSpreadsheet,
    colorClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-500/10",
  },
  sales_collected_irr: {
    icon: CheckCircle,
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-500/10",
  },
};


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

  const [execDashboard, setExecDashboard] = useState<ExecutiveDashboardResponse | null>(null);
  const [loadingExec, setLoadingExec] = useState(false);

  const loadExecDashboard = useCallback(async () => {
    setLoadingExec(true);
    try {
      const res = await api<ExecutiveDashboardResponse>(
        `/companies/${company.id}/calculations/dashboard`
      );
      setExecDashboard(res);
    } catch {
      setExecDashboard(null);
    } finally {
      setLoadingExec(false);
    }
  }, [company.id]);

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
    void loadExecDashboard();
    return () => {
      ignore = true;
    };
  }, [company.id, loadExecDashboard]);

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
      <div className="onboarding-card rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-6 shadow-sm" dir="rtl">
        {error && (
          <Alert variant="destructive" className="text-xs mb-4">
            {error}
          </Alert>
        )}
        <div className="flex items-center gap-3 border-b border-border/60 pb-4">
          <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">
              به سامانه دیدبان مالی خوش آمدید!
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Step 1 */}
          <div className="step-card flex flex-col justify-between p-4 rounded-xl border border-border/70 bg-muted/20 hover:border-primary/50 transition-colors space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center font-mono">
                  ۱
                </span>
                <FileUp className="size-4 text-primary" />
              </div>
              <strong className="block text-sm font-bold text-foreground">بارگذاری اسناد و بانک</strong>
              <p className="text-xs text-muted-foreground leading-relaxed">
                فایل اکسل یا CSV دفتر روزنامه، تراز آزمایشی یا صورتحساب بانک را بارگذاری و ستون‌ها را نگاشت کنید. سرفصل‌ها به صورت خودکار طبقه‌بندی می‌شوند.
              </p>
            </div>
            <Button asChild size="sm" className="w-full text-xs gap-1.5">
              <Link href={`/companies/${company.id}/data`}>
                <FileUp className="size-3.5" />
                بارگذاری اسناد مالی
              </Link>
            </Button>
          </div>

          {/* Step 2 */}
          <div className="step-card flex flex-col justify-between p-4 rounded-xl border border-border/70 bg-muted/20 hover:border-primary/50 transition-colors space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="size-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center font-mono">
                  ۲
                </span>
                <BarChart3 className="size-4 text-emerald-500" />
              </div>
              <strong className="block text-sm font-bold text-foreground">محاسبه و تحلیل سود و زیان</strong>
              <p className="text-xs text-muted-foreground leading-relaxed">
                با انتخاب بازه زمانی، تحلیل خودکار صورت سود و زیان و شاخص‌های مالی را اجرا کنید.
              </p>
            </div>
            <Button asChild variant="secondary" size="sm" className="w-full text-xs gap-1.5">
              <Link href={`/companies/${company.id}/analysis`}>
                <BarChart3 className="size-3.5" />
                محاسبه و تحلیل دوره
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DashboardContent
      dashboard={dashboard}
      switching={switching}
      analyses={analyses}
      analysisId={analysisId}
      changeSnapshot={changeSnapshot}
      error={error}
      metricsMap={metricsMap}
      workingCapital={workingCapital}
      company={company}
      execDashboard={execDashboard}
      onRefreshExec={loadExecDashboard}
      loadingExec={loadingExec}
    />
  );
}

function DashboardContent({
  dashboard,
  switching,
  analyses,
  analysisId,
  changeSnapshot,
  error,
  metricsMap,
  workingCapital,
  company,
  execDashboard,
  onRefreshExec,
  loadingExec,
}: {
  dashboard: DashboardResponse;
  switching: boolean;
  analyses: AnalysisRun[];
  analysisId: string;
  changeSnapshot: (id: string) => void;
  error: string;
  metricsMap: Map<string, DashboardMetric>;
  workingCapital: any;
  company: Company;
  execDashboard: ExecutiveDashboardResponse | null;
  onRefreshExec: () => Promise<void>;
  loadingExec: boolean;
}) {
  const { finding_summary: findingSummary, top_findings: topFindings, main_drivers: mainDrivers } = dashboard;

  const daysSinceSnapshot = useMemo(() => {
    if (!dashboard.snapshot?.completed_at) return 0;
    const diffMs = Date.now() - new Date(dashboard.snapshot.completed_at).getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }, [dashboard.snapshot?.completed_at]);

  return (
    <div className={switching ? "opacity-60 pointer-events-none transition-opacity duration-200 space-y-6" : "space-y-6"}>
      {/* Top Header: Company Overview */}
      <PageHeader
        title="داشبورد جامع مالی"
        description="نمای یکپارچه از موقعیت نقدینگی، مطالبات، تعهدات و اقلام نیازمند اقدام شرکت"
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
            <ShieldCheck className="size-3.5" />
            دیدبان مالی
          </span>
        }
        primaryAction={
          <Button asChild size="sm" className="text-xs gap-1.5 h-8 font-bold">
            <Link href={`/companies/${company.id}/actions`}>
              کارتابل اقدامات
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        }
        secondaryActions={
          <Button asChild size="sm" variant="outline" className="text-xs gap-1.5 h-8">
            <Link href={`/companies/${company.id}/reports`}>
              <FileText className="size-3.5" />
              گزارش‌های رسمی
            </Link>
          </Button>
        }
      />

      <DataStalenessBanner
        companyId={company.id}
        lastUpdatedDaysAgo={daysSinceSnapshot}
      />

      <CustomerValueSummary
        resolvedFindingsCount={findingSummary?.by_workflow?.resolved ?? 0}
      />

      {error && (
        <Alert variant="destructive" className="text-xs">
          {error}
        </Alert>
      )}

      {/* Section 1, 3 & 5: Canonical Executive Calculation Panel (Position, Forecast, Key Changes) */}
      <ExecutiveCalculationPanel
        companyId={company.id}
        dashboard={execDashboard}
        onRefresh={onRefreshExec}
        loading={loadingExec}
      />

      {/* Working Capital & Treasury Runway Section */}
      {workingCapital && (
        <Card className="border-[var(--ds-border)] bg-[var(--ds-card)] shadow-xs">
          <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                  <ArrowRightLeft className="size-4 text-primary" />
                  وضعیت سرمایه در گردش و نقدینگی
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20 flex items-center gap-1.5">
                  <RefreshCw className="size-3 text-primary" />
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
                  <div className="grid size-7 place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    <Clock className="size-3.5" />
                  </div>
                </div>
                <div>
                  <span className="text-lg font-mono font-bold text-foreground">
                    {workingCapital.runwayDays !== null ? `${toPersianDigits(workingCapital.runwayDays)} روز` : "پایدار"}
                  </span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    بر مبنای نرخ مصرف فعلی
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
                  <div className="grid size-7 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <ArrowDownLeft className="size-3.5" />
                  </div>
                </div>
                <div>
                  <span className="text-lg font-mono font-bold text-foreground">
                    {toPersianDigits(workingCapital.dsoDays)} روز
                  </span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    میانگین وصول مطالبات
                  </span>
                </div>
              </Link>

              {/* DPO */}
              <Link
                href={`/companies/${company.id}/payables`}
                className="p-3.5 rounded-xl border border-[var(--ds-border)] bg-muted/40 hover:bg-muted/70 transition-colors group flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">دوره پرداخت بدهی (DPO)</span>
                  <div className="grid size-7 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <ArrowUpRight className="size-3.5" />
                  </div>
                </div>
                <div>
                  <span className="text-lg font-mono font-bold text-foreground">
                    {toPersianDigits(workingCapital.dpoDays)} روز
                  </span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    میانگین تسویه با تامین‌کنندگان
                  </span>
                </div>
              </Link>

              {/* CCC Gap */}
              <div className="p-3.5 rounded-xl border border-[var(--ds-border)] bg-muted/20 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">شکاف نقدینگی (CCC)</span>
                  <div className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Calendar className="size-3.5" />
                  </div>
                </div>
                <div>
                  <span className="text-lg font-mono font-bold text-primary">
                    {toPersianDigits(workingCapital.cccDays)} روز
                  </span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    {workingCapital.cccDays > 0 ? "فاصله خروج تا ورود نقد" : "تامین مالی توسط تامین‌کننده"}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 2: Actionable Findings & Needs Attention */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                <TriangleAlert className="size-4 text-amber-500" />
                نیازمند توجه و اقدام (یافته‌های اولویت‌دار)
              </CardTitle>
            </div>
            <Link href={`/companies/${company.id}/findings`}>
              <Button size="sm" variant="ghost" className="text-xs gap-1">
                فهرست همه یافته‌ها
                <ArrowUpRight className="size-3.5" />
              </Button>
            </Link>
          </div>

          {/* Finding Band Counts (Icons with Count) */}
          <div className="flex items-center gap-2 pt-2.5">
            {(["critical", "high", "medium", "low"] as PriorityBand[]).map((band) => {
              const count = findingSummary.by_priority[band] ?? 0;
              const config = priorityBandConfigs[band];
              const Icon = config.icon;
              return (
                <div
                  key={band}
                  title={`${config.label}: ${toPersianDigits(count)} مورد`}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors",
                    config.bgClass,
                    config.borderClass
                  )}
                >
                  <Icon className={cn("size-3.5", config.textClass)} aria-label={config.label} />
                  <span className={cn("font-mono font-bold", config.textClass)}>
                    {toPersianDigits(count)}
                  </span>
                </div>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {topFindings.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {topFindings.map((finding) => {
                const findingConfig = priorityBandConfigs[finding.priority_band];
                const FindingIcon = findingConfig.icon;
                return (
                  <div
                    key={finding.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-3.5 border border-border/70 bg-muted/20 hover:bg-muted/40 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        title={`${findingConfig.label}${finding.priority_score ? ` (امتیاز: ${toPersianDigits(Math.round(Number(finding.priority_score)))})` : ""}`}
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-1 rounded-lg border shrink-0",
                          findingConfig.bgClass,
                          findingConfig.borderClass
                        )}
                      >
                        <FindingIcon className={cn("size-3.5", findingConfig.textClass)} aria-label={findingConfig.label} />
                        {finding.priority_score && (
                          <span className={cn("font-mono text-[11px] font-bold", findingConfig.textClass)}>
                            {toPersianDigits(Math.round(Number(finding.priority_score)))}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/companies/${company.id}/findings/${finding.id}`}
                          className="block truncate text-xs font-bold text-foreground hover:text-primary transition-colors"
                        >
                          {finding.title_fa}
                        </Link>
                        <span className="block truncate text-[11px] text-muted-foreground mt-0.5">
                          {finding.summary_fa}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <StatusChip status={finding.workflow_status} size="sm" />
                      <Button asChild size="sm" variant="outline" className="text-xs h-7 px-2.5 gap-1 text-primary hover:text-primary border-primary/20 hover:bg-primary/10">
                        <Link href={`/companies/${company.id}/findings/${finding.id}`}>
                          <span>مشاهده و اقدام</span>
                          <ChevronLeft className="size-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="هیچ یافتهٔ بازی ثبت نشده است"
              description="تمام شاخص‌ها و آزمون‌های کنترلی در محدوده عادی قرار دارند و موردی نیازمند اقدام فوری نیست."
            />
          )}
        </CardContent>
      </Card>

      {/* Main Drivers & Financial Position */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Main Drivers */}
        <Card>
          <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
            <CardTitle className="text-sm font-extrabold flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" />
              محرک‌های اصلی تغییرات سود و نقدینگی
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {mainDrivers.length > 0 ? (
              <div className="divide-y divide-[var(--ds-border)]/60">
                {mainDrivers.map((driver) => {
                  const driverConfig = priorityBandConfigs[driver.priority_band];
                  const DriverIcon = driverConfig.icon;
                  return (
                    <Link
                      key={driver.finding_id}
                      href={`/companies/${company.id}/findings/${driver.finding_id}`}
                      className="group flex items-center justify-between gap-3 py-2.5 hover:bg-muted/30 rounded px-2 -mx-2 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          title={driverConfig.label}
                          className={cn(
                            "grid size-6 shrink-0 place-items-center rounded-md border",
                            driverConfig.bgClass,
                            driverConfig.borderClass
                          )}
                        >
                          <DriverIcon className={cn("size-3.5", driverConfig.textClass)} />
                        </div>
                        <span className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                          {driver.title_fa}
                        </span>
                      </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {driver.affected_amount_irr ? (
                        <MoneyDisplay amount={driver.affected_amount_irr} currency="ریال" size="sm" />
                      ) : driver.affected_ratio ? (
                        <span className="font-mono text-xs font-bold text-foreground">
                          {toPersianDigits((Number(driver.affected_ratio) * 100).toFixed(1))}٪
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      <ChevronLeft className="size-3.5 text-muted-foreground group-hover:text-primary transition-transform group-hover:-translate-x-0.5" />
                    </div>
                  </Link>
                );
              })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground space-y-2">
                <Compass className="size-8 text-muted-foreground/40 mx-auto" />
                <p className="font-bold text-foreground">محرک قابل‌توجهی برای تغییرات شناسایی نشد</p>
                <p className="text-[11px]">یافته‌های مالی با اثر مستقیم سود یا نقدینگی در این بخش نمایش داده می‌شوند.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Supplementary Balance Sheet Positions */}
        <Card>
          <CardHeader className="pb-3 border-b border-[var(--ds-border)]">
            <CardTitle className="text-sm font-extrabold flex items-center gap-2">
              <Landmark className="size-4 text-primary" />
              اقلام کلیدی ترازنامه
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
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
                const config = balancePositionConfigs[code];
                const ConfigIcon = config?.icon;

                return (
                  <div
                    key={code}
                    className="flex items-center justify-between rounded-xl border border-[var(--ds-border)] bg-muted/20 p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <span className="text-[11px] font-medium text-muted-foreground block truncate">
                        {metricFallbackLabels[code]}
                      </span>
                      <div>
                        {isAvailable ? (
                          <MoneyDisplay amount={metric?.value} currency="ریال" size="sm" />
                        ) : (
                          <span className="text-[11px] text-muted-foreground">غیرقابل‌محاسبه</span>
                        )}
                      </div>
                    </div>
                    {ConfigIcon && (
                      <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg ms-2", config.bgClass)}>
                        <ConfigIcon className={cn("size-4", config.colorClass)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
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
