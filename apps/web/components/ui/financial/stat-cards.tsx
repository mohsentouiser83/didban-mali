import type { ReactNode } from "react";
import { cx } from "../button";
import { Skeleton } from "../states";

export function MetricCardFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cx(
        "min-w-0 rounded-panel border border-border bg-surface p-5 shadow-panel motion-safe:animate-reveal",
        className,
      )}
    >
      {children}
    </article>
  );
}

export function StatCard({
  title,
  value,
  unit,
  status,
  children,
  loading = false,
}: {
  title: string;
  value: string;
  unit: string;
  status?: ReactNode;
  children?: ReactNode;
  loading?: boolean;
}) {
  return (
    <MetricCardFrame>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {status}
      </div>
      {loading ? (
        <div
          role="status"
          aria-label={`در حال دریافت ${title}`}
          className="my-5"
        >
          <Skeleton className="h-9 w-2/3" />
        </div>
      ) : (
        <div
          key={`${value}-${unit}`}
          className="my-5 motion-safe:animate-reveal"
          aria-live="polite"
          aria-atomic="true"
        >
          <p
            dir="ltr"
            className="text-start text-[28px] font-medium leading-relaxed tabular-nums [overflow-wrap:anywhere]"
          >
            {value}
          </p>
          <p className="mt-1 text-xs text-muted">{unit}</p>
        </div>
      )}
      {children}
    </MetricCardFrame>
  );
}

export function StatCards({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
  );
}
