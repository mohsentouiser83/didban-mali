"use client";

import type { ComponentProps, HTMLAttributes, ReactElement } from "react";
import { CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { LoadingState } from "./loading-state";
import { cn } from "@/lib/utils";

export function FinancialChart({ children, label, className, loading = false, empty = false, error, onRetry, emptyMessage = "داده‌ای برای نمودار ثبت نشده است.", ...props }: Omit<HTMLAttributes<HTMLDivElement>, "children"> & { children: ReactElement; label: string; loading?: boolean; empty?: boolean; error?: string | null; onRetry?: () => void; emptyMessage?: string }) {
  return <div role="group" aria-label={label} data-slot="financial-chart" aria-busy={loading} dir="ltr" className={cn(
    "h-72 min-w-0 w-full motion-safe:animate-[workspace-enter_240ms_ease-out_both] sm:h-80 [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-axis-tick_text]:text-[11px] [&_.recharts-cartesian-axis-tick_text]:font-[family-name:var(--font-sans)] sm:[&_.recharts-cartesian-axis-tick_text]:text-xs [&_.recharts-surface]:focus-visible:outline-2 [&_.recharts-surface]:focus-visible:outline-primary",
    className,
  )} {...props}>{loading ? <LoadingState variant="chart" label={`در حال دریافت ${label}`} className="h-full [&>div]:h-full" /> : error ? <ErrorState variant="compact" dir="rtl" error={error} onRetry={onRetry} className="h-full justify-center" /> : empty ? <EmptyState variant="compact" dir="rtl" title={emptyMessage} className="h-full" /> : <ResponsiveContainer width="100%" height="100%" minWidth={0}>{children}</ResponsiveContainer>}</div>;
}

export function ChartGrid(props: ComponentProps<typeof CartesianGrid>) {
  return <CartesianGrid vertical={false} stroke="var(--ds-border)" strokeDasharray="3 5" {...props} />;
}
ChartGrid.displayName = "CartesianGrid";

export function ChartXAxis(props: ComponentProps<typeof XAxis>) {
  return <XAxis axisLine={false} tickLine={false} minTickGap={24} {...props} />;
}
ChartXAxis.displayName = "XAxis";

export function ChartYAxis(props: ComponentProps<typeof YAxis>) {
  return <YAxis width={60} axisLine={false} tickLine={false} tickFormatter={formatChartNumber} {...props} />;
}
ChartYAxis.displayName = "YAxis";

export function formatChartNumber(value: unknown) {
  if (value == null || (typeof value === "string" && !value.trim())) return "—";
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(number) : "—";
}

export function ChartTooltipSurface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div dir="rtl" data-slot="chart-tooltip" className={cn("grid min-w-0 max-w-[min(20rem,calc(100vw-2rem))] gap-2 rounded-[var(--ds-card-radius)] border border-border bg-card p-3 text-start text-xs text-foreground shadow-[var(--ds-shadow-md)] [overflow-wrap:anywhere]", className)} {...props} />;
}

type TooltipEntry = { name?: unknown; value?: unknown; color?: string };
export function ChartValueTooltip({ active, label, payload, unit, labelFormatter }: { active?: boolean; label?: unknown; payload?: readonly TooltipEntry[]; unit?: string; labelFormatter?: (label: unknown) => string }) {
  if (!active || !payload?.length) return null;
  return <ChartTooltipSurface><strong className="font-medium">{labelFormatter ? labelFormatter(label) : String(label ?? "")}</strong><dl className="grid gap-2">{payload.map((entry, index) => <div key={index} className="flex flex-wrap items-center justify-between gap-3"><dt className="text-muted-foreground">{String(entry.name ?? "مانده")}</dt><dd className="tabular-nums"><bdi>{formatChartNumber(entry.value)}</bdi>{unit && <span className="ms-1">{unit}</span>}</dd></div>)}</dl></ChartTooltipSurface>;
}

/** Shared tooltip defaults; custom contents use ChartTooltipSurface. */
export function ChartTooltip(props: ComponentProps<typeof Tooltip>) {
  return <Tooltip cursor={{ stroke: "var(--ds-border-strong)" }} {...props} />;
}
