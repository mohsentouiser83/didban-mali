"use client";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCardFrame } from "./stat-card";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { MoneyDisplay, toPersianDigits } from "./money-display";
import { Hint } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

export interface KpiMetricCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
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

export const KpiMetricCard = React.forwardRef<
  HTMLDivElement,
  KpiMetricCardProps
>(
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
    ref,
  ) => {
    if (loading) {
      return (
        <MetricCardFrame
          ref={ref}
          aria-label={title}
          aria-busy="true"
          className={cn(
            "relative flex flex-col justify-between rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-card)] p-5 shadow-[var(--ds-shadow-sm)] min-h-[148px]",
            className,
          )}
          {...props}
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="size-8" />
          </div>
          <Skeleton className="my-3 h-8 w-40" />
          <Skeleton className="h-3 w-32" />
        </MetricCardFrame>
      );
    }

    const isLimited = status === "limited" || limitedReason != null;

    return (
      <MetricCardFrame
        ref={ref}
        aria-label={title}
        aria-busy="false"
        className={cn(
          "group relative flex flex-col justify-between rounded-[var(--ds-card-radius)] border border-[var(--ds-card-border)] bg-[var(--ds-card-bg)] p-5 shadow-[var(--ds-shadow-sm)] transition-all duration-300  hover:border-[var(--ds-primary)]/40  cursor-default select-none",
          status === "critical" &&
            "border-ds-danger/30 bg-ds-danger/[0.02] hover:border-ds-danger/60",
          status === "warning" &&
            "border-ds-warning/30 bg-ds-warning/[0.02] hover:border-ds-warning/60",
          status === "limited" &&
            "border-dashed border-border bg-muted/20",
          className,
        )}
        {...props}
      >
        {/* Header: Title + Icon / Badge */}
        <div
          data-slot="metric-header"
          className="flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <span
              data-slot="metric-label"
              className="text-sm font-medium text-foreground/85 tracking-normal transition-colors group-hover:text-foreground"
            >
              {title}
            </span>
            {isLimited && limitedReason && (
              <Hint content={limitedReason}>
                <Button variant="ghost" size="icon" type="button" aria-label="اطلاعات بیشتر درباره محدودیت شاخص" className="text-muted-foreground hover:text-foreground">
                  <HelpCircle className="size-3.5" aria-hidden="true" />
                </Button>
              </Hint>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {badge}
            {Icon && (
              <div
                data-slot="metric-icon"
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-[var(--ds-card-radius)]  text-muted-foreground transition-all duration-300  group-hover:text-primary   ",
                  status === "critical" &&
                    " text-ds-danger  group-hover:text-ds-danger",
                  status === "warning" &&
                    " text-ds-warning  group-hover:text-ds-warning",
                )}
              >
                <Icon className="size-4.5 transition-transform duration-300 " />
              </div>
            )}
          </div>
        </div>

        {/* Body: Value */}
        <div
          data-slot="metric-value"
          key={`${value}:${status}`}
          className="my-2.5 flex min-w-0 flex-wrap items-baseline gap-2 motion-safe:animate-[metric-update_320ms_ease-out_both] [&>span]:flex-wrap"
        >
          {isLimited && value == null ? (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-lg font-bold">غیرقابل‌محاسبه</span>
              <span className="text-xs text-muted-foreground/80 font-normal">
                ({limitedReason ?? "نیاز به تفکیک داده"})
              </span>
            </div>
          ) : (
            <>
              <MoneyDisplay
                wrap
                amount={value}
                currency={currency}
                size="2xl"
                direction="neutral"
                className="tracking-normal"
              />
              {unit && (
                <span className="text-xs font-semibold text-muted-foreground">
                  {unit}
                </span>
              )}
            </>
          )}
        </div>

        {/* Footer: Trend & Subtext & Coverage */}
        <div
          data-slot="metric-footer"
          className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ds-border)]/60 pt-3 text-xs text-muted-foreground"
        >
          {trend ? (
            <div
              className={cn(
                "inline-flex items-center gap-1 tabular-nums font-bold rounded-md px-1.5 py-0.5 text-[11px] [font-variant-numeric:tabular-nums]",
                trend.isPositive === true && "bg-ds-success/10 text-ds-success",
                trend.isPositive === false && "bg-ds-danger/10 text-ds-danger",
                trend.isPositive === undefined &&
                  "bg-muted text-muted-foreground",
              )}
            >
              {trend.direction === "up" && <TrendingUp className="size-3" />}
              {trend.direction === "down" && (
                <TrendingDown className="size-3" />
              )}
              {trend.direction === "neutral" && <Minus className="size-3" />}
              <span>
                {typeof trend.value === "number"
                  ? toPersianDigits(trend.value)
                  : trend.value}
              </span>
              {trend.label && (
                <span className="font-sans font-normal opacity-85 ms-0.5">
                  {trend.label}
                </span>
              )}
            </div>
          ) : subtext ? (
            <span className="text-pretty">{subtext}</span>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          )}

          {coveragePercent !== undefined && coveragePercent !== null && (
            <span className="tabular-nums text-[11px] text-muted-foreground/80 font-medium">
              پوشش: {toPersianDigits(Math.round(coveragePercent))}٪
            </span>
          )}
        </div>
      </MetricCardFrame>
    );
  },
);

KpiMetricCard.displayName = "KpiMetricCard";
