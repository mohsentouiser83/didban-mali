"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

/** Shared surface for compact and detailed financial metrics. */
export const MetricCardFrame = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} role="article" data-slot="stat-card" className={cn(
    "grid min-w-0 gap-3 rounded-[var(--ds-card-radius)] border border-border bg-card p-3 transition-colors hover:border-[var(--ds-border-strong)] motion-safe:animate-[workspace-enter_280ms_ease-out_both] motion-reduce:transition-none sm:p-5",
    className,
  )} {...props} />,
);
MetricCardFrame.displayName = "MetricCardFrame";

export function StatCard({ title, value, valueKey, icon, detail, footer, loading = false, className }: {
  title: string;
  value: ReactNode;
  valueKey?: string;
  icon?: ReactNode;
  detail?: string;
  footer?: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return <MetricCardFrame aria-label={title} aria-busy={loading} className={className}>
    <div className="flex items-start justify-between gap-2">
      <h3 className="min-w-0 whitespace-normal text-sm font-normal leading-relaxed text-muted-foreground [overflow-wrap:anywhere]"><Hint content={detail}><span>{title}</span></Hint></h3>
      {icon}
    </div>
    {loading ? <Skeleton className="h-8 w-3/4" /> : <div key={valueKey} data-slot="stat-value" className="flex min-h-8 min-w-0 flex-wrap items-center gap-1 tabular-nums motion-safe:animate-[metric-update_320ms_ease-out_both] [&>span]:min-w-0 [&>span]:max-w-full [&>span]:flex-wrap [&>span]:gap-1 [&>span>span:last-child]:min-w-0 [&>span>span:first-child]:text-xs [&>span>span:last-child]:text-base sm:[&>span>span:last-child]:text-xl">{value}</div>}
    {footer && <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">{footer}</div>}
  </MetricCardFrame>;
}
