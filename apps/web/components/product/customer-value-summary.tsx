"use client";

import { CheckCircle2, ShieldCheck, TrendingUp, AlertTriangle } from "@/components/ui/icons";
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
      className="rounded-[var(--ds-card-radius)] border border-border bg-card p-4 shadow-xs text-foreground font-sans mb-6"
    >
      <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-ds-success" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            ارزش عملیاتی و کنترل مالی این دوره
          </h4>
        </div>
        <span className="text-[11px] font-medium text-ds-success bg-ds-success/10 px-2 py-0.5 rounded-full">
          چرخه فعال
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="group flex items-start gap-3 rounded-lg bg-muted/30 p-3 hover:bg-muted/50   transition-all duration-200 cursor-default">
          <div className="flex h-8 w-8 items-center justify-center rounded-md  text-ds-success shrink-0 transition-transform duration-200  ">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <div className="text-base font-bold font-mono tracking-normal text-foreground">
              {toPersianDigits(reconciledRatioPercentage)}٪
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">تراکنش‌های بانکی تطبیق شده</div>
          </div>
        </div>

        <div className="group flex items-start gap-3 rounded-lg bg-muted/30 p-3 hover:bg-muted/50   transition-all duration-200 cursor-default">
          <div className="flex h-8 w-8 items-center justify-center rounded-md  text-primary shrink-0 transition-transform duration-200  ">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <div className="text-base font-bold font-mono tracking-normal text-foreground">
              {toPersianDigits(resolvedFindingsCount)} مورد
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">یافته مالی بررسی و بسته شده</div>
          </div>
        </div>

        <div className="group flex items-start gap-3 rounded-lg bg-muted/30 p-3 hover:bg-muted/50   transition-all duration-200 cursor-default">
          <div className="flex h-8 w-8 items-center justify-center rounded-md  text-ds-warning shrink-0 transition-transform duration-200  ">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-normal text-foreground line-clamp-1">
              {monitoredOverdueArToman}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">مطالبات بالای ۹۰ روز تحت پیگیری</div>
          </div>
        </div>

        <div className="group flex items-start gap-3 rounded-lg bg-muted/30 p-3 hover:bg-muted/50   transition-all duration-200 cursor-default">
          <div className="flex h-8 w-8 items-center justify-center rounded-md  text-primary shrink-0 transition-transform duration-200  ">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="text-base font-bold font-mono tracking-normal text-foreground">
              {toPersianDigits(totalErrorsPreventedCount)} خطای مالی
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">پیشگیری از مغایرت در بستن حساب</div>
          </div>
        </div>
      </div>
    </div>
  );
}
