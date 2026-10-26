import { ArrowPathIcon } from "./status-icons";
import { Building2, ShieldAlert, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button, cx } from "./button";
export function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle
      size={18}
      aria-hidden
      className={cx("text-primary motion-safe:animate-spin", className)}
    />
  );
}
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx(
        "rounded-control bg-border/60 motion-safe:animate-pulse",
        className,
      )}
    />
  );
}
export function LoadingState({
  label = "در حال دریافت اطلاعات",
  layout = "cards",
  children,
}: {
  label?: string;
  layout?: "cards" | "table" | "compact";
  children?: ReactNode;
}) {
  if (children)
    return (
      <section role="status" aria-label={label}>
        <span className="sr-only">{label}</span>
        <div aria-hidden>{children}</div>
      </section>
    );
  if (layout === "compact")
    return (
      <div
        role="status"
        aria-label={label}
        className="flex items-center gap-3 py-3"
      >
        <Spinner />
        <span className="text-muted">{label}</span>
      </div>
    );
  return (
    <section role="status" aria-label={label} className="space-y-5">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-9 w-48" />
      {layout === "table" ? (
        <div
          aria-hidden
          className="hidden overflow-hidden rounded-panel border border-border bg-surface md:block"
        >
          <div className="h-14 bg-background" />
          {[0, 1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="grid h-20 grid-cols-4 items-center gap-7 border-t border-border px-5"
            >
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-9 w-28" />
            </div>
          ))}
        </div>
      ) : null}
      <div
        className={cx(
          "grid gap-5 md:grid-cols-2",
          layout === "table" && "md:hidden",
        )}
      >
        {[0, 1].map((n) => (
          <div
            key={n}
            className="space-y-4 rounded-panel border border-border bg-surface p-7"
          >
            <Skeleton className="size-12" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </section>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-panel border border-dashed border-border bg-surface px-5 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-panel bg-accent text-primary">
        <Building2 size={25} aria-hidden />
      </span>
      <h2 className="font-heading text-xl font-medium">{title}</h2>
      {description ? (
        <p className="max-w-sm text-muted">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-4 rounded-panel border border-danger/20 bg-surface p-7"
    >
      <ShieldAlert size={24} className="text-danger" aria-hidden />
      <p>{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          <ArrowPathIcon />
          تلاش دوباره
        </Button>
      ) : null}
    </div>
  );
}
export function StatusMessage({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-control border border-border bg-background p-3 text-muted"
    >
      {children}
    </p>
  );
}
