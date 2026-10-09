import React from "react";
import {
  AlertCircle,
  RefreshCw,
  ShieldAlert,
  Database,
  ArrowRight,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  error?: string | Error | null;
  onRetry?: () => void;
  retrying?: boolean;
  linkToDataCenter?: {
    href: string;
    label?: string;
  };
}

export function ErrorState({
  title = "خطا در دریافت اطلاعات مالی",
  error,
  onRetry,
  retrying = false,
  linkToDataCenter,
  className,
  ...props
}: ErrorStateProps) {
  const errorMessage =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "اتصال به سرویس مالی برقرار نشد. لطفاً ارتباط شبکه را بررسی نمایید.";

  // Sanitize raw technical codes or 500/SQL stack traces
  const safeMessage =
    errorMessage.includes("500") ||
    errorMessage.includes("SQL") ||
    errorMessage.includes("foreign key")
      ? "خطای سیستمی رخ داده است. سیستم در حال بررسی و بازیابی وضعیت می‌باشد."
      : errorMessage;

  return (
    <div
      className={cn(
        "error-state flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-[var(--ds-card-radius)] border border-destructive/30 bg-destructive/5 space-y-4 max-w-xl mx-auto my-6",
        className,
      )}
      {...props}
    >
      <div className="size-14 rounded-[var(--ds-card-radius)]  text-destructive grid place-items-center   ">
        <AlertCircle className="size-7" />
      </div>

      <div className="space-y-1.5 max-w-md">
        <h3 className="text-base sm:text-lg font-bold text-foreground">
          {title}
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {safeMessage}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
        {onRetry && (
          <Button
            size="sm"
            onClick={onRetry}
            disabled={retrying}
            className="gap-2"
          >
            <RefreshCw className={cn("size-3.5", retrying && "animate-spin")} />
            {retrying ? "در حال تلاش..." : "تلاش مجدد"}
          </Button>
        )}

        {linkToDataCenter && (
          <Button size="sm" variant="outline" asChild className="gap-2">
            <a href={linkToDataCenter.href}>
              <Database className="size-3.5 text-primary" />
              {linkToDataCenter.label || "بررسی مرکز داده‌ها"}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
