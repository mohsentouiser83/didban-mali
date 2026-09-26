"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductCard } from "./product-card";
import type { DataOverviewResponse, SourceCardHealth, ActionableHealthIssue } from "@/lib/product-types";
import {
  BookOpen,
  Building2,
  Landmark,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  RefreshCw,
  UploadCloud,
  FileCheck,
  FileX2,
} from "lucide-react";

interface DataOverviewTabProps {
  overview: DataOverviewResponse | null;
  loading: boolean;
  onNavigateTab: (tab: string, initialSourceKind?: "accounting" | "bank" | "sales") => void;
  onRefresh: () => void;
}

const statusConfig: Record<
  string,
  { label: string; badgeClass: string; icon: typeof CheckCircle2 }
> = {
  ready: {
    label: "آماده و معتبر",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    icon: CheckCircle2,
  },
  needs_update: {
    label: "نیازمند به‌روزرسانی",
    badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    icon: Clock,
  },
  warning: {
    label: "دارای هشدار",
    badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    icon: AlertTriangle,
  },
  error: {
    label: "دارای خطا",
    badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    icon: AlertCircle,
  },
  processing: {
    label: "در حال پردازش",
    badgeClass: "bg-primary/10 text-primary border-primary/20 animate-pulse",
    icon: RefreshCw,
  },
  no_data: {
    label: "بدون داده",
    badgeClass: "bg-muted text-muted-foreground border-border",
    icon: HelpCircle,
  },
};

const sourceIcons = {
  accounting: BookOpen,
  bank: Landmark,
  sales: Receipt,
};

export function DataOverviewTab({
  overview,
  loading,
  onNavigateTab,
  onRefresh,
}: DataOverviewTabProps) {
  if (loading && !overview) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-3 text-center">
        <div className="size-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs text-muted-foreground">در حال خواندن وضعیت و پوشش منابع داده‌ای…</p>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="p-8 text-center rounded-2xl border border-dashed border-border text-xs text-muted-foreground">
        اطلاعات وضعیت منابع در دسترس نیست.
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Overview Top Header & KPI Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground">
            وضعیت اتصال و پوشش داده‌های مالی
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            پایش پیوسته سه رکن داده‌ای: اسناد حسابداری، صورتحساب بانکی و فاکتورهای فروش
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="h-8 gap-1.5 text-xs rounded-xl"
            title="به‌روزرسانی وضعیت منابع"
          >
            <RefreshCw className="size-3.5" />
            <span>به‌روزرسانی شاخص‌ها</span>
          </Button>
          <Button
            size="sm"
            onClick={() => onNavigateTab("upload")}
            className="h-8 gap-1.5 text-xs rounded-xl"
          >
            <UploadCloud className="size-3.5" />
            <span>بارگذاری داده جدید</span>
          </Button>
        </div>
      </div>

      {/* 3 Primary Dominant Financial Source Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {overview.sources.map((src) => {
          const cfg = statusConfig[src.status] || statusConfig.no_data;
          const IconComp = sourceIcons[src.source_kind] || BookOpen;
          const StatusIcon = cfg.icon;

          return (
            <ProductCard
              key={src.source_kind}
              className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                src.usable_for_calculations
                  ? "border-border/90 bg-card hover:border-primary/40 shadow-xs"
                  : src.status === "error"
                  ? "border-rose-500/30 bg-rose-500/[0.02]"
                  : "border-border/60 bg-card/60"
              }`}
            >
              <div className="space-y-4">
                {/* Source Title & Status Badge */}
                <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <IconComp className="size-4.5" />
                    </span>
                    <div>
                      <strong className="block text-sm font-bold text-foreground">
                        {src.source_title}
                      </strong>
                      <span className="text-[11px] text-muted-foreground">
                        {src.source_kind === "accounting"
                          ? "دفتر کل و اسناد"
                          : src.source_kind === "bank"
                          ? "تراکنش‌های حساب‌ها"
                          : "فروش و مطالبات"}
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className={`gap-1 text-[11px] py-1 px-2.5 ${cfg.badgeClass}`}>
                    <StatusIcon className="size-3" />
                    <span>{cfg.label}</span>
                  </Badge>
                </div>

                {/* Core Metrics Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-muted/30">
                    <span className="text-[11px] text-muted-foreground block">رکوردهای معتبر:</span>
                    <strong className="text-foreground text-sm block mt-0.5 font-bold font-mono">
                      {src.accepted_records.toLocaleString("fa-IR")}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-muted/30">
                    <span className="text-[11px] text-muted-foreground block">رکوردهای ردشده:</span>
                    <strong
                      className={`text-sm block mt-0.5 font-bold font-mono ${
                        src.rejected_records > 0
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {src.rejected_records.toLocaleString("fa-IR")}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-muted/30">
                    <span className="text-[11px] text-muted-foreground block">پوشش تخمینی:</span>
                    <strong className="text-foreground text-sm block mt-0.5 font-bold font-mono">
                      {src.estimated_coverage_pct.toLocaleString("fa-IR")}٪
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-muted/30">
                    <span className="text-[11px] text-muted-foreground block">تازگی اطلاعات:</span>
                    <strong className="text-foreground text-xs block mt-1 truncate">
                      {src.freshness_label}
                    </strong>
                  </div>
                </div>

                {/* Usability in Calculations Indicator */}
                <div className="flex items-center gap-2 px-1 text-[11px]">
                  {src.usable_for_calculations ? (
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                      <ShieldCheck className="size-4 shrink-0" />
                      <span>آماده استفاده در محاسبات مالی، نقدینگی و تحلیل‌ها</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <ShieldAlert className="size-4 shrink-0 text-amber-500" />
                      <span>غیرقابل استفاده در محاسبات تا بارگذاری و رفع خطا</span>
                    </span>
                  )}
                </div>

                {/* Summary Notes */}
                {src.summary_notes.length > 0 && (
                  <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside bg-muted/20 p-2.5 rounded-xl">
                    {src.summary_notes.map((note, idx) => (
                      <li key={idx} className="truncate">
                        {note}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Contextual CTA */}
              <div className="mt-4 pt-3 border-t border-border/60">
                <Button
                  variant={src.status === "no_data" || src.status === "needs_update" ? "default" : "outline"}
                  size="sm"
                  className="w-full text-xs h-8.5 rounded-xl justify-between"
                  onClick={() => {
                    if (src.primary_cta_action === "upload") {
                      onNavigateTab("upload", src.source_kind);
                    } else if (src.primary_cta_action === "quality") {
                      onNavigateTab("quality");
                    } else {
                      onNavigateTab("history");
                    }
                  }}
                >
                  <span>{src.primary_cta_label}</span>
                  <ArrowLeft className="size-3.5" />
                </Button>
              </div>
            </ProductCard>
          );
        })}
      </div>

      {/* Compact Actionable Data Health Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="size-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold">
              ✓
            </span>
            <h3 className="text-sm font-bold text-foreground">
              سلامت داده‌ها و هشدارهای نیازمند توجه
            </h3>
          </div>
          <span className="text-[11px] text-muted-foreground">
            امتیاز کلی سلامت داده:{" "}
            <strong className="font-mono text-foreground font-bold text-xs">
              {overview.overall_health_score.toLocaleString("fa-IR")}٪
            </strong>
          </span>
        </div>

        {overview.health_issues.length === 0 ? (
          <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span>
              تمام داده‌های مالی متصل در وضعیت پایدار هستند و هیچ ردیف مسدودکننده یا خطای بحرانی ثبت نشده است.
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {overview.health_issues.map((issue) => (
              <div
                key={issue.id}
                className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 text-xs transition-colors ${
                  issue.severity === "error" || issue.severity === "blocking"
                    ? "bg-rose-500/5 border-rose-500/20 hover:border-rose-500/40"
                    : issue.severity === "warning"
                    ? "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40"
                    : "bg-muted/30 border-border/80"
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    {issue.severity === "error" || issue.severity === "blocking" ? (
                      <AlertCircle className="size-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                    ) : issue.severity === "warning" ? (
                      <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                    <span className="truncate">{issue.title}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                    {issue.description}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] shrink-0 rounded-lg px-2.5 self-center"
                  onClick={() => onNavigateTab(issue.action_tab)}
                >
                  <span>{issue.action_label}</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
