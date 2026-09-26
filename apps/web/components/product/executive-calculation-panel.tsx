"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Info,
  Layers,
  Receipt,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api } from "@/lib/product-api";
import { MoneyDisplay, toPersianDigits, toJalaliDate } from "@/components/ui/financial";
import type {
  ExecutiveDashboardResponse,
  KeyChangeItem,
  MetricResultDTO,
  MetricStatus,
} from "@/lib/product-types";
import { MetricEvidenceDrawer } from "./metric-evidence-drawer";

interface ExecutiveCalculationPanelProps {
  companyId: string;
  dashboard: ExecutiveDashboardResponse | null;
  onRefresh: () => Promise<void>;
  loading?: boolean;
}

const STATUS_TAGS: Record<
  MetricStatus,
  { label: string; badgeClass: string; icon: React.ElementType }
> = {
  available: {
    label: "قطعی و قابل اتکا",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    icon: CheckCircle2,
  },
  available_with_warning: {
    label: "دارای ملاحظات داده‌ای",
    badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    icon: AlertTriangle,
  },
  approximate: {
    label: "برآورد مدلی",
    badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
    icon: Info,
  },
  insufficient_data: {
    label: "عدم تکافوی داده اولیه",
    badgeClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
    icon: HelpCircle,
  },
  not_applicable: {
    label: "جریان پایدار / خودکفا",
    badgeClass: "bg-muted text-muted-foreground border-muted-foreground/30",
    icon: Info,
  },
};

function formatToman(irr: number | string | null | undefined): string {
  if (irr === null || irr === undefined || irr === "") return "—";
  const num = typeof irr === "string" ? parseFloat(irr) : irr;
  if (isNaN(num)) return "—";
  const toman = Math.round(num / 10);
  return `${toPersianDigits(toman.toLocaleString("fa-IR"))} تومان`;
}

export function ExecutiveCalculationPanel({
  companyId,
  dashboard,
  onRefresh,
  loading = false,
}: ExecutiveCalculationPanelProps) {
  const [recalculating, setRecalculating] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<MetricResultDTO | null>(null);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await api(`/companies/${companyId}/calculations/run`, { method: "POST" });
      await onRefresh();
      toast.success("محاسبات مالی بر اساس آخرین داده‌های تاییدشده به‌روزرسانی شد.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "خطا در اجرای مجدد محاسبات مالی"
      );
    } finally {
      setRecalculating(false);
    }
  };

  if (!dashboard) {
    return (
      <Card className="border-border bg-card shadow-xs" dir="rtl">
        <CardHeader className="p-6 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                شاخص‌ها و موقعیت مالی شرکت
              </CardTitle>
              <CardDescription className="text-xs">
                محاسبه شاخص‌های نقدینگی، مطالبات، بدهی‌ها و پیش‌بینی ۱۳ هفته‌ای نقدینگی بدون حدس و تقریب‌های نامعتبر.
              </CardDescription>
            </div>
            <Button
              onClick={handleRecalculate}
              disabled={recalculating}
              size="sm"
              className="gap-2 shrink-0 text-xs font-bold rounded-xl"
            >
              <RefreshCw className={cn("size-3.5", recalculating && "animate-spin")} />
              {recalculating ? "در حال محاسبه..." : "محاسبه شاخص‌های مالی"}
            </Button>
          </div>
        </CardHeader>
      </Card>
    );
  }

  const { primary_kpis: kpis, key_changes: changes, forecast_outlook: outlook, freshness } = dashboard;
  const cashMetric = kpis["cash_position"];
  const arMetric = kpis["open_receivables"];
  const apMetric = kpis["open_payables"];
  const runwayMetric = kpis["runway"] || kpis["cash_forecast_13w"];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header and Recalculate Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm sm:text-base font-black text-foreground flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              موقعیت مالی شرکت
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            مبنای محاسبات: {toJalaliDate(dashboard.as_of_date)} | بازه جاری: {toJalaliDate(dashboard.period_start)} تا {toJalaliDate(dashboard.period_end)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleRecalculate}
            disabled={recalculating || loading}
            size="sm"
            variant="outline"
            className="gap-2 text-xs h-8 rounded-xl border-border"
          >
            <RefreshCw
              className={cn("size-3.5", (recalculating || loading) && "animate-spin")}
            />
            {recalculating ? "در حال به‌روزرسانی..." : "به‌روزرسانی شاخص‌ها"}
          </Button>
        </div>
      </div>

      {/* Freshness Banner */}
      {freshness && freshness.sources && freshness.sources.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/20 p-3.5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Clock className="size-3.5 text-primary" />
              وضعیت تازگی داده‌های ورودی (فاز ۱):
            </span>
            {freshness.is_any_stale && (
              <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                برخی ورودی‌ها نیازمند به‌روزرسانی هستند
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {freshness.sources.map((src) => (
              <div
                key={src.source_kind}
                className={cn(
                  "p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2",
                  src.is_stale
                    ? "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-300"
                    : "border-border bg-card text-foreground"
                )}
              >
                <div className="min-w-0">
                  <span className="font-semibold block truncate">{src.source_label}</span>
                  <span className="text-[11px] text-muted-foreground block truncate">
                    {src.last_data_date ? `ثبت تا: ${src.last_data_date}` : "فاقد سابقه"}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-normal shrink-0",
                    src.is_stale
                      ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
                      : "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  {src.is_stale ? `${src.days_stale || "—"} روز قدیمی` : "به‌روز"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Cash Position */}
        {cashMetric && (
          <CalculationKpiCard
            metric={cashMetric}
            icon={WalletCards}
            titleFa="نقدینگی در دسترس (Cash Position)"
            onOpenEvidence={() => setSelectedMetric(cashMetric)}
          />
        )}

        {/* 2. Open Receivables */}
        {arMetric && (
          <CalculationKpiCard
            metric={arMetric}
            icon={Receipt}
            titleFa="مطالبات باز تجاری (Open AR)"
            onOpenEvidence={() => setSelectedMetric(arMetric)}
          />
        )}

        {/* 3. Open Payables */}
        {apMetric && (
          <CalculationKpiCard
            metric={apMetric}
            icon={FileCheck2}
            titleFa="بدهی‌های باز تجاری (Open AP)"
            onOpenEvidence={() => setSelectedMetric(apMetric)}
          />
        )}

        {/* 4. Runway / Cash Outlook */}
        {runwayMetric && (
          <CalculationKpiCard
            metric={runwayMetric}
            icon={Activity}
            titleFa="تاب‌آوری / دورنمای نقدینگی"
            onOpenEvidence={() => setSelectedMetric(runwayMetric)}
          />
        )}
      </div>

      {/* Deterministic Key Changes Section */}
      {changes && changes.length > 0 && (
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="p-5 pb-3 border-b border-border">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <TrendingUp className="size-4 text-primary" />
              تغییرات مهم نسبت به دوره قبل (تحلیل قطعی)
            </CardTitle>
            <CardDescription className="text-xs">
              تغییرات معنادار بر پایه انطباق ریاضی مقادیر با دوره‌های گذشته، بدون تولید متن‌های ساختگی.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-4 space-y-2.5">
            {changes.map((ch, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-xl border border-border/80 bg-muted/20 text-xs gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={cn(
                      "size-7 rounded-lg flex items-center justify-center shrink-0",
                      ch.severity === "positive"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : ch.severity === "warning" || ch.severity === "critical"
                        ? "bg-amber-500/10 text-amber-500"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {ch.direction === "increase" ? (
                      <TrendingUp className="size-4" />
                    ) : ch.direction === "decrease" ? (
                      <TrendingDown className="size-4" />
                    ) : (
                      <ArrowRightLeft className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <span className="font-bold text-foreground block truncate">
                      {ch.title_fa}
                    </span>
                    <span className="text-muted-foreground block text-[11px] truncate">
                      {ch.change_statement}
                    </span>
                  </div>
                </div>

                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] shrink-0 font-medium",
                    ch.severity === "positive"
                      ? "border-emerald-500/30 text-emerald-600"
                      : ch.severity === "warning" || ch.severity === "critical"
                      ? "border-amber-500/30 text-amber-600"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {ch.direction === "increase" ? "افزایش" : ch.direction === "decrease" ? "کاهش" : "بدون تغییر"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 13-Week Cash Forecast Compact Visualizer */}
      {outlook && outlook.weeks && outlook.weeks.length > 0 && (
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="p-5 pb-3 border-b border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                  <BarChart3 className="size-4 text-primary" />
                  پیش‌بینی ۱۳ هفته‌ای جریان نقدینگی (Deterministic 13-Week Cash Forecast)
                </CardTitle>
                <CardDescription className="text-xs">
                  بر مبنای سررسید فاکتورهای فروش معتبر و تعهدات قطعی؛ فاکتورهای معوق به عنوان وصول برنامه‌ریزی‌نشده تفکیک شده‌اند.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-semibold self-start sm:self-auto",
                  outlook.first_deficit_week
                    ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                    : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                )}
              >
                {outlook.first_deficit_week
                  ? `هشدار کسری نقد در هفته ${outlook.first_deficit_week}`
                  : "بدون کسری پیش‌بینی‌شده"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-4 space-y-4">
            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl border border-border bg-muted/20">
                <span className="block text-muted-foreground mb-1 text-[11px]">موجودی نقد شروع دوره:</span>
                <span className="font-bold text-foreground">
                  {formatToman(outlook.starting_cash_irr)}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-border bg-muted/20">
                <span className="block text-muted-foreground mb-1 text-[11px]">پایین‌ترین نقطه نقدینگی:</span>
                <span className="font-bold text-foreground">
                  {formatToman(outlook.lowest_projected_cash_irr)}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-border bg-muted/20">
                <span className="block text-muted-foreground mb-1 text-[11px]">پوشش وصول فاکتورها:</span>
                <span className="font-bold text-foreground">
                  {outlook.inflow_coverage_percentage || 100}٪
                </span>
              </div>
              <div className="p-3 rounded-xl border border-border bg-muted/20">
                <span className="block text-muted-foreground mb-1 text-[11px]">اولین هفته کسری نقد:</span>
                <span className="font-bold text-foreground">
                  {outlook.first_deficit_week ? `هفته ${outlook.first_deficit_week}` : "ندارد"}
                </span>
              </div>
            </div>

            {/* Week Bars Preview */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground block">
                روند مانده نقد پایان هر هفته (۱۳ هفته آتی):
              </span>
              <div className="grid grid-cols-13 gap-1 pt-2 items-end h-24 bg-muted/20 rounded-xl p-3 border border-border/70">
                {outlook.weeks.map((w: any) => {
                  const closing = parseFloat(w.closing_cash_irr || "0");
                  const isNeg = closing < 0;
                  return (
                    <div
                      key={w.week_number}
                      className="flex flex-col items-center justify-end h-full gap-1 group relative"
                    >
                      <div
                        className={cn(
                          "w-full rounded-t-sm transition-all duration-300",
                          isNeg ? "bg-rose-500" : "bg-primary hover:bg-primary/80"
                        )}
                        style={{
                          height: `${Math.max(15, Math.min(100, Math.abs(closing) / 3000000))}%`,
                        }}
                      />
                      <span className="text-[9px] font-mono text-muted-foreground">
                        هـ{w.week_number}
                      </span>

                      {/* Tooltip on hover */}
                      <div className="hidden group-hover:block absolute bottom-full mb-2 z-20 bg-popover text-popover-foreground text-[10px] p-2 rounded-lg shadow-lg border border-border whitespace-nowrap">
                        <div className="font-bold">{w.jalali_range}</div>
                        <div>مانده: {formatToman(w.closing_cash_irr)}</div>
                        <div className="text-emerald-500">ورودی: {formatToman(w.expected_inflow_irr)}</div>
                        <div className="text-rose-500">خروجی: {formatToman(w.expected_outflow_irr)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evidence Drawer */}
      <MetricEvidenceDrawer
        open={!!selectedMetric}
        onOpenChange={(op) => !op && setSelectedMetric(null)}
        companyId={companyId}
        metric={selectedMetric}
      />
    </div>
  );
}

function CalculationKpiCard({
  metric,
  icon: Icon,
  titleFa,
  onOpenEvidence,
}: {
  metric: MetricResultDTO;
  icon: React.ElementType;
  titleFa: string;
  onOpenEvidence: () => void;
}) {
  const tag = STATUS_TAGS[metric.status] || STATUS_TAGS.available;
  const TagIcon = tag.icon;
  const evidence = metric.evidence;

  let displayNode: React.ReactNode = <span className="text-muted-foreground font-normal text-sm" title="داده‌ای برای این شاخص در دسترس نیست">—</span>;

  if (metric.status === "not_applicable") {
    displayNode = (
      <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
        جریان نقد مثبت / پایدار
      </span>
    );
  } else if (metric.status === "insufficient_data") {
    displayNode = (
      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
        عدم تکافوی داده
      </span>
    );
  } else if (metric.value_numeric !== null) {
    if (metric.unit === "irr") {
      displayNode = (
        <MoneyDisplay
          amount={metric.value_numeric}
          currency="ریال"
          executive
          size="lg"
          className="font-black text-foreground tracking-tight"
        />
      );
    } else {
      const unitLabel = metric.unit === "day" ? "روز" : metric.unit === "month" ? "ماه" : "";
      displayNode = (
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-black text-foreground tracking-tight">
            {toPersianDigits(metric.value_numeric)}
          </span>
          {unitLabel && (
            <span className="text-xs text-muted-foreground font-medium">
              {unitLabel}
            </span>
          )}
        </div>
      );
    }
  }

  return (
    <Card className="border-border bg-card shadow-xs hover:border-primary/40 transition-all flex flex-col justify-between">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon className="size-4" />
          </span>
          <Badge
            variant="outline"
            className={cn("text-[10px] font-normal border gap-1 px-1.5 py-0.5", tag.badgeClass)}
          >
            <TagIcon className="size-3 shrink-0" />
            <span>{tag.label}</span>
          </Badge>
        </div>

        <CardTitle className="text-xs font-bold text-muted-foreground truncate">
          {titleFa}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 pt-1 space-y-3">
        <div className="flex items-baseline gap-1.5 min-h-[32px] items-center">
          {displayNode}
        </div>

        {/* Caveats / Warnings mini summary */}
        {metric.warnings && metric.warnings.length > 0 && (
          <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 p-1.5 rounded-md truncate">
            {metric.warnings[0]}
          </div>
        )}

        {/* Evidence Button */}
        <Button
          size="sm"
          variant="ghost"
          className="w-full text-xs h-7 gap-1 text-primary hover:bg-primary/10 border border-primary/20"
          onClick={onOpenEvidence}
        >
          <ExternalLink className="size-3" />
          <span>مشاهده شواهد و جزئیات محاسبه</span>
        </Button>
      </CardContent>
    </Card>
  );
}
