import type { HTMLAttributes } from "react";
import Link from "next/link";
import { AlertCircle } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  error?: string | Error | null;
  variant?: "panel" | "compact" | "inline";
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
  linkToDataCenter?: { href: string; label?: string };
}

export function ErrorState({ title, error, variant = "panel", onRetry, retrying = false, retryLabel = "تلاش دوباره", linkToDataCenter, children, className, ...props }: ErrorStateProps) {
  const message = typeof error === "string" ? error : error?.message;
  const safeMessage = message && /\bSQL\b|foreign key|stack trace|traceback/i.test(message) ? "اطلاعات دریافت نشد. دوباره تلاش کنید." : message;
  return <div role="alert" data-slot="error-state" data-variant={variant} className={cn(
    "min-w-0 text-sm leading-relaxed text-destructive [overflow-wrap:anywhere]",
    variant === "panel" && "mx-auto my-6 flex w-full max-w-xl flex-col items-center gap-4 rounded-[var(--ds-card-radius)] border border-destructive/30 bg-destructive/5 p-6 text-center sm:p-8",
    variant === "compact" && "flex flex-wrap items-center justify-between gap-3 rounded-[var(--ds-card-radius)] border border-border bg-card p-4",
    variant === "inline" && "flex flex-wrap items-center gap-2 py-1",
    className,
  )} {...props}>
    {variant === "panel" && <AlertCircle className="size-7 shrink-0" aria-hidden="true" />}
    {title && <h3 className="text-sm font-medium text-foreground">{title}</h3>}
    {safeMessage && <p>{safeMessage}</p>}
    {!title && !message && children == null && <p>اطلاعات دریافت نشد.</p>}
    {children}
    {(onRetry || linkToDataCenter) && <div className="flex flex-wrap gap-2">
      {onRetry && <Button type="button" variant="outline" loading={retrying} loadingText="در حال تلاش…" onClick={onRetry}>{retryLabel}</Button>}
      {linkToDataCenter && <Button variant="outline" asChild><Link href={linkToDataCenter.href}>{linkToDataCenter.label ?? "بررسی اسناد"}</Link></Button>}
    </div>}
  </div>;
}
