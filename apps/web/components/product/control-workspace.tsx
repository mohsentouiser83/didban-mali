"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  Scale,
  ClipboardCheck,
  SlidersHorizontal,
  ArrowLeftRight,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  RefreshCcw,
  UserCheck,
  FileQuestion,
  ChevronLeft,
} from "@/components/ui/icons";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MoneyDisplay,
  toPersianDigits,
  StatusChip,
  PageHeader,
} from "@/components/ui/financial";
import { toJalaliDateTime } from "@/lib/date-utils";
import { api } from "@/lib/product-api";
import type {
  Company,
  ControlOverview,
  FindingDetectionRun,
} from "@/lib/product-types";

function faDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return toJalaliDateTime(value);
}

export function ControlWorkspace({ company }: { company: Company }) {
  const [overview, setOverview] = useState<ControlOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggeringDetection, setTriggeringDetection] = useState(false);
  const base = `/companies/${company.id}`;

  const loadData = useCallback(async () => {
    try {
      const data = await api<ControlOverview>(
        `/companies/${company.id}/control/overview`,
      );
      setOverview(data);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "دریافت اطلاعات داشبورد کنترل مالی با خطا مواجه شد.",
      );
    } finally {
      setLoading(false);
    }
  }, [company.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRunDetection = async () => {
    setTriggeringDetection(true);
    try {
      const res = await api<FindingDetectionRun>(
        `/companies/${company.id}/findings/detection-runs`,
        {
          method: "POST",
          body: JSON.stringify({ trigger_type: "manual" }),
        },
      );
      toast.success(
        `پایش مغایرت‌ها با موفقیت انجام شد: ${toPersianDigits(res.findings_detected)} مغایرت ارزیابی گردید.`,
      );
      await loadData();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "اجرای کشف مغایرت‌ها با خطا مواجه شد.",
      );
    } finally {
      setTriggeringDetection(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse" dir="rtl">
        <Skeleton className="h-10 w-72 rounded-[var(--ds-card-radius)]" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-28 rounded-[var(--ds-card-radius)]" />
          <Skeleton className="h-28 rounded-[var(--ds-card-radius)]" />
          <Skeleton className="h-28 rounded-[var(--ds-card-radius)]" />
          <Skeleton className="h-28 rounded-[var(--ds-card-radius)]" />
        </div>
        <Skeleton className="h-96 rounded-[var(--ds-card-radius)]" />
      </div>
    );
  }

  const criticalAndHigh =
    (overview?.critical_count ?? 0) + (overview?.high_count ?? 0);
  const totalFindings = overview?.total_active_count ?? 0;
  const resolvedTotal =
    (overview?.resolved_count ?? 0) + (overview?.verified_count ?? 0);
  const completionRate =
    totalFindings + resolvedTotal > 0
      ? Math.round((resolvedTotal / (totalFindings + resolvedTotal)) * 100)
      : 0;

  return (
    <div className="pp-page pp-control space-y-6 pb-12" dir="rtl">
      {/* Top Banner / Header */}
      <PageHeader
        title="کنترل مالی، از ریسک تا رسیدگی"
        description="وضعیت رسیدگی، موارد مهم و آخرین اقدامات تیم مالی را در یک نگاه بررسی کنید."
        badge={
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
            <ShieldCheck className="size-3.5" />
            کنترل داخلی و انطباق
          </span>
        }
        primaryAction={
          <Button
            size="sm"
            onClick={() => void handleRunDetection()}
            disabled={triggeringDetection}
            className="gap-1.5 font-bold"
          >
            {triggeringDetection ? (
              <RefreshCcw className="size-3.5 animate-spin" />
            ) : (
              <Zap className="size-3.5" />
            )}
            <span>اجرای پایش مغایرت‌ها</span>
          </Button>
        }
        secondaryActions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link href={`${base}/actions`}>
                <ClipboardCheck className="size-3.5 text-primary" />
                <span>کارتابل کارهای من</span>
              </Link>
            </Button>

            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link href={`${base}/reconciliation`}>
                <ArrowLeftRight className="size-3.5 text-primary" />
                <span>تطبیق بانکی</span>
              </Link>
            </Button>

            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link href={`${base}/control/policies`}>
                <SlidersHorizontal className="size-3.5 text-muted-foreground" />
                <span>خط‌مشی‌های پایش</span>
              </Link>
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="pp-metric-strip grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Critical & High Findings */}
        <div
          className={`p-4 rounded-[var(--ds-card-radius)] border transition-all ${
            (overview?.critical_count ?? 0) > 0
              ? "border-ds-danger/30 bg-ds-danger/5 shadow-xs"
              : "border-border bg-card/60"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">
              مغایرت‌های فوری و بحرانی
            </span>
            <div
              className={`size-8 rounded-[var(--ds-card-radius)] grid place-items-center ${
                (overview?.critical_count ?? 0) > 0
                  ? "bg-ds-danger/20 text-ds-danger"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <ShieldAlert className="size-4.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground tabular-nums">
              {toPersianDigits(criticalAndHigh)}
            </span>
            <span className="text-xs text-muted-foreground">مورد باز</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-ds-danger font-bold">
              {toPersianDigits(overview?.critical_count ?? 0)} بحرانی
            </span>
            <span className="text-ds-warning font-bold">
              {toPersianDigits(overview?.high_count ?? 0)} دارای اولویت بالا
            </span>
          </div>
        </div>

        {/* Total Financial Exposure */}
        <div className="p-4 rounded-[var(--ds-card-radius)] border border-border bg-card/60 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">
              کل اثر مالی ریسک‌ها
            </span>
            <div className="size-8 rounded-[var(--ds-card-radius)] bg-primary/10 text-primary grid place-items-center">
              <TrendingDown className="size-4.5" />
            </div>
          </div>
          <div className="mt-2.5">
            <MoneyDisplay
              amount={overview?.total_impact_irr ?? 0}
              currency="ریال"
              size="lg"
              className="font-bold text-foreground tabular-nums"
            />
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            مبلغ ریسک درگیر در {toPersianDigits(totalFindings)} مغایرت فعال
          </div>
        </div>

        {/* Resolution Progress */}
        <div className="p-4 rounded-[var(--ds-card-radius)] border border-border bg-card/60 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">
              پیشرفت حل و تایید نهایی
            </span>
            <div className="size-8 rounded-[var(--ds-card-radius)] bg-ds-success/10 text-ds-success grid place-items-center">
              <CheckCircle2 className="size-4.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-ds-success tabular-nums">
              {toPersianDigits(completionRate)}٪
            </span>
            <span className="text-xs text-muted-foreground">بسته‌شده</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">
              {toPersianDigits(overview?.resolved_count ?? 0)} حل‌شده موقت
            </span>
            <span className="text-ds-success font-bold">
              {toPersianDigits(overview?.verified_count ?? 0)} تایید دو امضایی
            </span>
          </div>
        </div>

        {/* Reconciliation Status */}
        <div className="p-4 rounded-[var(--ds-card-radius)] border border-border bg-card/60 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">
              تطبیق بانکی آخرین دوره
            </span>
            <div className="size-8 rounded-[var(--ds-card-radius)] bg-primary/10 text-primary grid place-items-center">
              <Scale className="size-4.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground tabular-nums">
              {toPersianDigits(
                overview?.latest_reconciliation?.matched_count ?? 0,
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              فقره تطبیق یافته
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-ds-warning font-bold">
              {toPersianDigits(
                overview?.latest_reconciliation?.unmatched_bank_count ?? 0,
              )}{" "}
              مانده در بانک
            </span>
            <span className="text-primary font-bold">
              {toPersianDigits(
                overview?.latest_reconciliation?.unmatched_journal_count ?? 0,
              )}{" "}
              مانده در دفاتر
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Severity & Exposure + Recent Audit Activities */}
      <div className="pp-control-layout grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Severity & Action Overview (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-[var(--ds-card-radius)] border border-border bg-card/60 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">
                توزیع سطح ریسک و مغایرت‌ها
              </h3>
              <Link
                href={`${base}/findings`}
                className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
              >
                <span>مشاهده همه</span>
                <ChevronLeft className="size-3.5" />
              </Link>
            </div>

            <div className="space-y-2.5">
              {/* Critical */}
              <div className="flex items-center justify-between p-2.5 rounded-[var(--ds-card-radius)] border border-ds-danger/20 bg-ds-danger/5">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-ds-danger " />
                  <span className="text-xs font-bold text-ds-danger">
                    بحرانی
                  </span>
                </div>
                <span className="text-xs font-bold text-ds-danger font-mono">
                  {toPersianDigits(overview?.critical_count ?? 0)} مورد
                </span>
              </div>

              {/* High */}
              <div className="flex items-center justify-between p-2.5 rounded-[var(--ds-card-radius)] border border-ds-warning/20 bg-ds-warning/5">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-ds-warning" />
                  <span className="text-xs font-bold text-ds-warning">
                    بالا
                  </span>
                </div>
                <span className="text-xs font-bold text-ds-warning font-mono">
                  {toPersianDigits(overview?.high_count ?? 0)} مورد
                </span>
              </div>

              {/* Medium */}
              <div className="flex items-center justify-between p-2.5 rounded-[var(--ds-card-radius)] border border-primary/20 bg-primary/5">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-primary" />
                  <span className="text-xs font-bold text-primary">متوسط</span>
                </div>
                <span className="text-xs font-bold text-primary font-mono">
                  {toPersianDigits(overview?.medium_count ?? 0)} مورد
                </span>
              </div>

              {/* Low */}
              <div className="flex items-center justify-between p-2.5 rounded-[var(--ds-card-radius)] border border-muted bg-muted/20">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-muted-foreground/60" />
                  <span className="text-xs font-medium text-muted-foreground">
                    پایین
                  </span>
                </div>
                <span className="text-xs font-bold text-muted-foreground font-mono">
                  {toPersianDigits(overview?.low_count ?? 0)} مورد
                </span>
              </div>
            </div>

            {/* Quick Links Section */}
            <div className="pp-inline-links pt-2 border-t border-border/60 grid grid-cols-2 gap-2 text-xs">
              <Link
                href={`${base}/actions`}
                className="p-2.5 rounded-[var(--ds-card-radius)] border border-border/80 bg-background/80 hover:border-primary/40 hover:bg-muted/40 transition-all flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between">
                  <ClipboardCheck className="size-4 text-primary" />
                  <ExternalLink className="size-3 text-muted-foreground" />
                </div>
                <span className="font-bold text-foreground">
                  کارتابل وظایف من
                </span>
                <span className="text-[10px] text-muted-foreground">
                  رسیدگی به اقدامات محوله
                </span>
              </Link>

              <Link
                href={`${base}/control/policies`}
                className="p-2.5 rounded-[var(--ds-card-radius)] border border-border/80 bg-background/80 hover:border-primary/40 hover:bg-muted/40 transition-all flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between">
                  <SlidersHorizontal className="size-4 text-primary" />
                  <ExternalLink className="size-3 text-muted-foreground" />
                </div>
                <span className="font-bold text-foreground">
                  قوانین کنترل مالی
                </span>
                <span className="text-[10px] text-muted-foreground">
                  مدیریت خط‌مشی‌های ۸ گانه
                </span>
              </Link>
            </div>
          </div>
        </div>

        {/* Audit Trail & Recent Activities Timeline (7 cols) */}
        <div className="lg:col-span-7">
          <div className="p-4 rounded-[var(--ds-card-radius)] border border-border bg-card/60 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  آخرین اقدامات تیم
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  گزارش لحظه‌ای اقدامات، تغییرات وضعیت و تاییدهای دو امضایی
                </p>
              </div>
            </div>

            {overview?.recent_activities &&
            overview.recent_activities.length > 0 ? (
              <div className="space-y-3">
                {overview.recent_activities.map((act) => (
                  <div
                    key={act.id}
                    className="p-3 rounded-[var(--ds-card-radius)] border border-border/70 bg-background/60 hover:bg-muted/30 transition-colors flex items-start gap-3"
                  >
                    <div className="size-7 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0 mt-0.5">
                      <UserCheck className="size-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`${base}/findings/${act.finding_id}`}
                          className="text-xs font-bold text-foreground hover:text-primary transition-colors truncate"
                        >
                          {act.finding_title}
                        </Link>
                        <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                          {faDateTime(act.created_at)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-bold text-foreground">
                          {act.user_name || "کاربر سامانه"}
                        </span>
                        <span>•</span>
                        <span className="px-1.5 py-0.2 rounded bg-muted font-medium text-foreground text-[10px]">
                          {act.action_type}
                        </span>
                        {act.note && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[280px] italic">
                              «{act.note}»
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-10 text-center text-xs text-muted-foreground space-y-2">
                <Clock className="size-8 mx-auto text-muted-foreground/40" />
                <p className="font-semibold">
                  هنوز فعالیتی برای نمایش در این دوره ثبت نشده است.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
