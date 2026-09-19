import React from "react";
import { TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { MoneyDisplay, toPersianDigits } from "./money-display";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface KpiMetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: number | string | bigint | null | undefined;
  currency?: string;
  unit?: string;
  subtext?: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  trend?: {
    value: string | number;
    label?: string;
    direction?: "up" | "down" | "neutral";
    isPositive?: boolean; // In financial metrics: e.g. cost increase is negative even if up
  };
  status?: "normal" | "warning" | "critical" | "limited";
  limitedReason?: string | null;
  coveragePercent?: number | null;
  loading?: boolean;
}

export const KpiMetricCard = React.forwardRef<HTMLDivElement, KpiMetricCardProps>(
  (
    {
      title,
      value,
      currency = "ریال",
      unit,
      subtext,
      icon: Icon,
      badge,
      trend,
      status = "normal",
      limitedReason,
      coveragePercent,
      loading = false,
      className,
      ...props
    },
    ref
  ) => {
    if (loading) {
      return (
        <div
          ref={ref}
          className={cn(
            "relative flex flex-col justify-between rounded-xl border border-[var(--ds-border)] bg-[var(--ds-card)] p-5 shadow-sm animate-pulse min-h-[148px]",
            className
          )}
          {...props}
        >
          <div className="flex items-center justify-between">
            <div className="h-4 w-28 rounded bg-muted" />
            <div className="size-8 rounded-lg bg-muted" />
          </div>
          <div className="my-3 h-8 w-40 rounded bg-muted" />
          <div className="h-3 w-32 rounded bg-muted" />
        </div>
      );
    }

    const isLimited = status === "limited" || limitedReason !== undefined;

    return (
      <div
        ref={ref}
        className={cn(
          "group relative flex flex-col justify-between rounded-[var(--ds-card-radius)] border border-[var(--ds-card-border)] bg-[var(--ds-card-bg)] p-5 shadow-[var(--ds-shadow-sm)] transition-all duration-200 hover:shadow-[var(--ds-shadow-md)] hover:border-[var(--ds-border-strong)] hover:-translate-y-0.5",
          status === "critical" && "border-red-500/30 bg-red-500/[0.02] hover:border-red-500/60",
          status === "warning" && "border-amber-500/30 bg-amber-500/[0.02] hover:border-amber-500/60",
          status === "limited" && "border-dashed border-slate-300 dark:border-slate-700 bg-slate-500/[0.02]",
          className
        )}
        {...props}
      >
        {/* Header: Title + Icon / Badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground/80 tracking-tight">{title}</span>
            {isLimited && limitedReason && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="اطلاعات بیشتر درباره محدودیت شاخص"
                    >
                      <HelpCircle className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs p-2.5">
                    {limitedReason}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {badge}
            {Icon && (
              <div
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg bg-muted/70 text-muted-foreground transition-colors group-hover:text-foreground group-hover:bg-muted",
                  status === "critical" && "bg-red-500/10 text-red-600 dark:text-red-400",
                  status === "warning" && "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                )}
              >
                <Icon className="size-4" />
              </div>
            )}
          </div>
        </div>

        {/* Body: Value */}
        <div className="my-2.5 flex items-baseline gap-2">
          {isLimited && !value ? (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-lg font-bold">غیرقابل‌محاسبه</span>
              <span className="text-xs text-muted-foreground/80 font-normal">
                ({limitedReason ?? "نیاز به تفکیک داده"})
              </span>
            </div>
          ) : (
            <>
              <MoneyDisplay
                amount={value}
                currency={currency}
                size="2xl"
                direction="neutral"
                className="tracking-tight"
              />
              {unit && <span className="text-xs font-semibold text-muted-foreground">{unit}</span>}
            </>
          )}
        </div>

        {/* Footer: Trend & Subtext & Coverage */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ds-border)]/60 pt-3 text-xs text-muted-foreground">
          {trend ? (
            <div
              className={cn(
                "inline-flex items-center gap-1 font-mono font-bold rounded-md px-1.5 py-0.5 text-[11px] [font-variant-numeric:tabular-nums]",
                trend.isPositive === true && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                trend.isPositive === false && "bg-rose-500/10 text-rose-600 dark:text-rose-400",
                trend.isPositive === undefined && "bg-muted text-muted-foreground"
              )}
            >
              {trend.direction === "up" && <TrendingUp className="size-3" />}
              {trend.direction === "down" && <TrendingDown className="size-3" />}
              {trend.direction === "neutral" && <Minus className="size-3" />}
              <span>{typeof trend.value === "number" ? toPersianDigits(trend.value) : trend.value}</span>
              {trend.label && <span className="font-sans font-normal opacity-85 ms-0.5">{trend.label}</span>}
            </div>
          ) : subtext ? (
            <span className="truncate">{subtext}</span>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          )}

          {coveragePercent !== undefined && coveragePercent !== null && (
            <span className="font-mono text-[11px] text-muted-foreground/80 font-medium">
              پوشش: {toPersianDigits(Math.round(coveragePercent))}٪
            </span>
          )}
        </div>
      </div>
    );
  }
);

KpiMetricCard.displayName = "KpiMetricCard";
