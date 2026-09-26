"use client";

import { CheckCircle2, ShieldCheck, TrendingUp, AlertTriangle } from "lucide-react";
import { toPersianDigits } from "@/components/ui/financial";

interface CustomerValueSummaryProps {
  reconciledRatioPercentage?: number;
  resolvedFindingsCount?: number;
  monitoredOverdueArToman?: string;
  totalErrorsPreventedCount?: number;
}

export function CustomerValueSummary({
  reconciledRatioPercentage = 94,
  resolvedFindingsCount = 12,
  monitoredOverdueArToman = "۳.۲ میلیارد تومان",
  totalErrorsPreventedCount = 4,
}: CustomerValueSummaryProps) {
  return (
    <div
      dir="rtl"
      className="rounded-xl border border-border bg-card p-4 shadow-xs text-foreground font-sans mb-6"
    >
      <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            ارزش عملیاتی و کنترل مالی این دوره
          </h4>
        </div>
        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
          چرخه فعال
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <div className="text-base font-extrabold font-mono tracking-tight text-foreground">
              {toPersianDigits(reconciledRatioPercentage)}٪
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">تراکنش‌های بانکی تطبیق شده</div>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <div className="text-base font-extrabold font-mono tracking-tight text-foreground">
              {toPersianDigits(resolvedFindingsCount)} مورد
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">یافته مالی بررسی و بسته شده</div>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-extrabold tracking-tight text-foreground line-clamp-1">
              {monitoredOverdueArToman}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">مطالبات بالای ۹۰ روز تحت پیگیری</div>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="text-base font-extrabold font-mono tracking-tight text-foreground">
              {toPersianDigits(totalErrorsPreventedCount)} خطای مالی
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">پیشگیری از مغایرت در بستن حساب</div>
          </div>
        </div>
      </div>
    </div>
  );
}
