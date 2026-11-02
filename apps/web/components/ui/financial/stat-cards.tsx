"use client";
import { useWorkspace } from "@/hooks/workspace";
import type { Metric } from "@/lib/api";
import { amount, cn } from "@/lib/utils";
import { StatusBadge } from "../badge";
import {
  ArrowCircleDownIcon,
  ArrowCircleUpIcon,
  ChartBarIcon,
  ChartLineUpIcon,
  ReceiptIcon,
  ScalesIcon,
  TrendDownIcon,
  TrendUpIcon,
  UsersThreeIcon,
  WalletIcon,
  type Icon,
} from "@phosphor-icons/react";

const metricIcons: Record<string, Icon> = {
  revenue: TrendUpIcon,
  expense: TrendDownIcon,
  net_profit: ChartLineUpIcon,
  cash: WalletIcon,
  cash_inflow: ArrowCircleDownIcon,
  cash_outflow: ArrowCircleUpIcon,
  ar_ledger: UsersThreeIcon,
  ar_invoice: ReceiptIcon,
  ar_difference: ScalesIcon,
  ap_ledger: WalletIcon,
  ap_trade_ledger: WalletIcon,
  ap_invoice: ReceiptIcon,
  ap_difference: ScalesIcon,
};
export function MetricCardFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "group/metric min-w-0 rounded-panel border border-border bg-surface p-5 transition-[border-color,box-shadow] duration-200 ease-interface hover:border-primary/25 motion-safe:animate-page-reveal motion-safe:[animation-fill-mode:both] motion-reduce:transition-none",
        className,
      )}
    >
      {children}
    </section>
  );
}
export function StatCard({
  metric,
  label,
  metricKey,
  icon,
  showComparison = true,
}: {
  metric?: Metric;
  label: string;
  metricKey?: string;
  icon?: Icon;
  showComparison?: boolean;
}) {
  const { unit } = useWorkspace();
  const IconComponent =
    icon || metricIcons[metricKey || metric?.metric_key || ""] || ChartBarIcon;
  return (
    <MetricCardFrame>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-primary-soft text-primary transition-[background-color,transform,scale] duration-200 ease-interface group-hover/metric:bg-primary/15 motion-safe:group-hover/metric:scale-105 motion-reduce:transition-none">
            <IconComponent size={22} weight="duotone" aria-hidden />
          </span>
          <h2 className="text-sm font-medium text-muted">{label}</h2>
        </div>
        {metric && metric.status !== "available" && (
          <StatusBadge status={metric.status} />
        )}
      </div>
      <div
        key={`${metric?.value ?? "unavailable"}:${unit}:${metric?.status ?? "missing"}`}
        className="mt-4 break-words text-metric font-medium leading-normal tabular-nums motion-safe:animate-value-change"
      >
        {amount(metric?.value, unit)}
        <span className="ms-2 whitespace-nowrap text-xs font-normal text-muted">
          {unit === "IRR" ? "ریال" : "تومان"}
        </span>
      </div>
      {metric?.value == null ? (
        <p className="mt-2 text-sm leading-7 text-muted">
          {metric?.reason || metric?.action || "منبع مالی این شاخص موجود نیست."}
        </p>
      ) : !showComparison ? null : metric.comparison?.percent != null ? (
        <p className="mt-2 text-xs text-muted">
          {amount(metric.comparison.percent)}٪ نسبت به دوره مقایسه
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">دوره مقایسه موجود نیست</p>
      )}
    </MetricCardFrame>
  );
}
export function StatCards({
  metrics,
  items,
  showComparison = true,
}: {
  showComparison?: boolean;
  metrics: Metric[];
  items: { key: string; label: string; icon?: Icon }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>section:nth-child(2)]:[animation-delay:35ms] [&>section:nth-child(3)]:[animation-delay:70ms]">
      {items.map((item) => (
        <StatCard
          key={item.key}
          label={item.label}
          showComparison={showComparison}
          metricKey={item.key}
          icon={item.icon}
          metric={metrics.find((metric) => metric.metric_key === item.key)}
        />
      ))}
    </div>
  );
}
