"use client";
import { cn } from "@/lib/utils";
import {
  ArrowClockwiseIcon,
  FolderOpenIcon,
  InfoIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "./button";
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-control bg-border motion-safe:animate-pulse",
        className,
      )}
    />
  );
}
export function LoadingState({
  label = "در حال دریافت اطلاعات",
  variant = "summary",
}: {
  label?: string;
  variant?: "summary" | "message" | "panels";
}) {
  if (variant === "panels")
    return (
      <section role="status" aria-label={label} className="grid gap-5 lg:grid-cols-2">
        <span className="sr-only">{label}</span>
        {[0, 1].map((index) => (
          <div key={index} aria-hidden className="space-y-5 rounded-panel border border-border bg-surface p-5 sm:p-7">
            <div className="flex items-center gap-3"><Skeleton className="size-12" /><Skeleton className="h-5 w-24" /></div>
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-11 w-36" />
          </div>
        ))}
      </section>
    );
  if (variant === "message")
    return (
      <section role="status" aria-label={label} className="space-y-2 py-1">
        <span className="sr-only">{label}</span>
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-44" />
      </section>
    );
  return (
    <section
      role="status"
      aria-label={label}
      className="space-y-5 motion-safe:animate-fade-in"
    >
      <span className="sr-only">{label}</span>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            aria-hidden
            className="space-y-4 rounded-panel border border-border bg-surface p-5"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 shrink-0" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-9 w-36 max-w-full" />
            <Skeleton className="h-3 w-40 max-w-full" />
          </div>
        ))}
      </div>
      <div
        aria-hidden
        className="space-y-5 rounded-panel border border-border bg-surface p-5 sm:p-7"
      >
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    </section>
  );
}
export function EmptyState({
  title = "هنوز داده‌ای ندارید",
  description,
  action,
  compact = false,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-5 text-center motion-safe:animate-fade-in",
        compact ? "py-8" : "py-14",
      )}
    >
      <span className={cn(
        "grid size-14 place-items-center rounded-panel",
        compact
          ? "bg-primary-soft text-primary"
          : "border border-lilac/70 bg-lilac-soft text-lilac",
      )}>
        <FolderOpenIcon size={26} aria-hidden />
      </span>
      <div>
        <h2 className="font-display text-xl font-medium">{title}</h2>
        {description && (
          <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
export function ErrorState({
  message = "اطلاعات دریافت نشد.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-panel border border-danger/20 bg-surface p-8 text-center motion-safe:animate-fade-in"
    >
      <WarningCircleIcon size={28} className="text-danger" aria-hidden />
      <p>
        {message === "Not Found" ? "اطلاعات این بخش در دسترس نیست." : message}
      </p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          <ArrowClockwiseIcon size={18} aria-hidden />
          تلاش دوباره
        </Button>
      )}
    </div>
  );
}
export function StatusMessage({
  children,
  tone = "warning",
}: {
  children: React.ReactNode;
  tone?: "warning" | "danger" | "primary";
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-control px-4 py-3 text-sm leading-7 motion-safe:animate-fade-in",
        tone === "warning"
          ? "bg-warning-soft text-warning"
          : tone === "danger"
            ? "bg-danger-soft text-danger"
            : "bg-primary-soft text-primary",
      )}
    >
      {tone === "primary" ? (
        <InfoIcon size={18} aria-hidden className="mt-1 shrink-0" />
      ) : (
        <WarningCircleIcon size={18} aria-hidden className="mt-1 shrink-0" />
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
