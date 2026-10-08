import React from "react";
import {
  CheckCircle2,
  Sparkles,
  Clock,
  HelpCircle,
  XCircle,
  AlertCircle,
  RefreshCcw,
  CheckCheck,
  ShieldAlert,
  ShieldCheck,
  FileCheck2,
  PlayCircle,
  Ban,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export type DomainStatus =
  // Lifecycle & Workflow
  | "new"
  | "needs_review"
  | "in_progress"
  | "resolved"
  | "verified"
  | "dismissed"
  | "reopened"
  | "follow_up"
  // Job / Import / Processing
  | "queued"
  | "processing"
  | "completed"
  | "completed_limited"
  | "failed"
  | "ready"
  // Reconciliation matching
  | "auto_matched"
  | "potential_match"
  | "suggested_match"
  | "confirmed"
  | "reversed"
  | "unmatched_bank"
  | "unmatched_journal"
  | "amount_mismatch"
  | "date_mismatch"
  | "duplicate"
  // Risk & Criticality
  | "critical"
  | "high"
  | "medium"
  | "low"
  // System Data
  | "active"
  | "stale"
  | "healthy";

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: DomainStatus | string;
  label?: string;
  size?: "xs" | "sm" | "md";
  showIcon?: boolean;
  showDot?: boolean;
  pulse?: boolean;
}

interface StatusConfig {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  bgClass: string;
  textClass: string;
  borderClass: string;
  dotClass: string;
}

const statusConfigs: Record<string, StatusConfig> = {
  // New / Fresh
  new: {
    label: "جدید",
    icon: PlayCircle,
    bgClass: "bg-primary/10",
    textClass: "text-primary",
    borderClass: "border-primary/30",
    dotClass: "bg-primary",
  },
  // Needs Review
  needs_review: {
    label: "نیازمند بررسی",
    icon: HelpCircle,
    bgClass: "bg-ds-warning/10",
    textClass: "text-ds-warning",
    borderClass: "border-ds-warning/30",
    dotClass: "bg-ds-warning",
  },
  potential_match: {
    label: "نیازمند بررسی",
    icon: HelpCircle,
    bgClass: "bg-ds-warning/10",
    textClass: "text-ds-warning",
    borderClass: "border-ds-warning/30",
    dotClass: "bg-ds-warning",
  },
  suggested_match: {
    label: "پیشنهاد تطبیق",
    icon: SparkleIcon,
    bgClass: "bg-primary/10",
    textClass: "text-primary",
    borderClass: "border-primary/30",
    dotClass: "bg-primary",
  },
  // In Progress
  in_progress: {
    label: "در حال پیگیری",
    icon: Clock,
    bgClass: "bg-primary/10",
    textClass: "text-primary",
    borderClass: "border-primary/30",
    dotClass: "bg-primary",
  },
  follow_up: {
    label: "در حال پیگیری",
    icon: Clock,
    bgClass: "bg-primary/10",
    textClass: "text-primary",
    borderClass: "border-primary/30",
    dotClass: "bg-primary",
  },
  processing: {
    label: "در حال پردازش",
    icon: RefreshCcw,
    bgClass: "bg-primary/10",
    textClass: "text-primary",
    borderClass: "border-primary/30",
    dotClass: "bg-primary",
  },
  queued: {
    label: "در صف انتظار",
    icon: Clock,
    bgClass: "bg-muted/80",
    textClass: "text-muted-foreground",
    borderClass: "border-border",
    dotClass: "bg-muted-foreground",
  },
  // Resolved / Cleared
  resolved: {
    label: "رفع‌شده",
    icon: CheckCircle2,
    bgClass: "bg-ds-success/10",
    textClass: "text-ds-success",
    borderClass: "border-ds-success/30",
    dotClass: "bg-ds-success",
  },
  auto_matched: {
    label: "تطبیق قطعی",
    icon: CheckCheck,
    bgClass: "bg-ds-success/10",
    textClass: "text-ds-success",
    borderClass: "border-ds-success/30",
    dotClass: "bg-ds-success",
  },
  // Verified (Maker-Checker approved)
  verified: {
    label: "صحه‌گذاری‌شده",
    icon: ShieldCheck,
    bgClass: "bg-teal-500/10",
    textClass: "text-teal-700",
    borderClass: "border-teal-500/30",
    dotClass: "bg-teal-500",
  },
  confirmed: {
    label: "تاییدشده",
    icon: ShieldCheck,
    bgClass: "bg-teal-500/10",
    textClass: "text-teal-700",
    borderClass: "border-teal-500/30",
    dotClass: "bg-teal-500",
  },
  completed: {
    label: "تکمیل‌شده",
    icon: CheckCircle2,
    bgClass: "bg-ds-success/10",
    textClass: "text-ds-success",
    borderClass: "border-ds-success/30",
    dotClass: "bg-ds-success",
  },
  completed_limited: {
    label: "تکمیل با هشدار",
    icon: AlertCircle,
    bgClass: "bg-ds-warning/10",
    textClass: "text-ds-warning",
    borderClass: "border-ds-warning/30",
    dotClass: "bg-ds-warning",
  },
  ready: {
    label: "آماده",
    icon: CheckCircle2,
    bgClass: "bg-ds-success/10",
    textClass: "text-ds-success",
    borderClass: "border-ds-success/30",
    dotClass: "bg-ds-success",
  },
  // Dismissed / Rejected / Reversed
  dismissed: {
    label: "رد شده",
    icon: Ban,
    bgClass: "bg-muted/70",
    textClass: "text-muted-foreground",
    borderClass: "border-border",
    dotClass: "bg-muted-foreground",
  },
  reversed: {
    label: "ابطال‌شده",
    icon: RefreshCcw,
    bgClass: "bg-ds-warning/10",
    textClass: "text-ds-warning",
    borderClass: "border-ds-warning/30",
    dotClass: "bg-ds-warning",
  },
  reopened: {
    label: "بازگشایی‌شده",
    icon: RefreshCcw,
    bgClass: "bg-ds-warning/10",
    textClass: "text-ds-warning",
    borderClass: "border-ds-warning/30",
    dotClass: "bg-ds-warning",
  },
  failed: {
    label: "ناموفق",
    icon: XCircle,
    bgClass: "bg-ds-danger/10",
    textClass: "text-ds-danger",
    borderClass: "border-ds-danger/30",
    dotClass: "bg-ds-danger",
  },
  // Mismatches
  unmatched_bank: {
    label: "فاقد سند در دفاتر",
    icon: XCircle,
    bgClass: "bg-ds-danger/10",
    textClass: "text-ds-danger",
    borderClass: "border-ds-danger/30",
    dotClass: "bg-ds-danger",
  },
  unmatched_journal: {
    label: "فاقد گردش در بانک",
    icon: XCircle,
    bgClass: "bg-ds-warning/10",
    textClass: "text-ds-warning",
    borderClass: "border-ds-warning/30",
    dotClass: "bg-ds-warning",
  },
  amount_mismatch: {
    label: "مغایرت مبلغ",
    icon: AlertCircle,
    bgClass: "bg-ds-danger/10",
    textClass: "text-ds-danger",
    borderClass: "border-ds-danger/30",
    dotClass: "bg-ds-danger",
  },
  date_mismatch: {
    label: "مغایرت تاریخ",
    icon: Clock,
    bgClass: "bg-ds-warning/10",
    textClass: "text-ds-warning",
    borderClass: "border-ds-warning/30",
    dotClass: "bg-ds-warning",
  },
  duplicate: {
    label: "تکراری",
    icon: RefreshCcw,
    bgClass: "bg-primary/10",
    textClass: "text-primary",
    borderClass: "border-primary/30",
    dotClass: "bg-primary",
  },
  // Severity
  critical: {
    label: "بحرانی",
    icon: ShieldAlert,
    bgClass: "bg-ds-danger/15",
    textClass: "text-ds-danger font-bold",
    borderClass: "border-ds-danger/40",
    dotClass: "bg-ds-danger",
  },
  high: {
    label: "بالا",
    icon: AlertCircle,
    bgClass: "bg-ds-warning/15",
    textClass: "text-ds-warning font-bold",
    borderClass: "border-ds-warning/40",
    dotClass: "bg-ds-warning",
  },
  medium: {
    label: "متوسط",
    icon: HelpCircle,
    bgClass: "bg-primary/10",
    textClass: "text-primary",
    borderClass: "border-primary/30",
    dotClass: "bg-primary",
  },
  low: {
    label: "پایین",
    icon: Clock,
    bgClass: "bg-muted/70",
    textClass: "text-muted-foreground",
    borderClass: "border-border",
    dotClass: "bg-muted-foreground",
  },
};

function SparkleIcon({ className }: { className?: string }) {
  return <Sparkles className={className} />;
}

const sizeClasses = {
  xs: "px-2 py-0.5 text-[10px] gap-1",
  sm: "px-2.5 py-1 text-xs gap-1.5",
  md: "px-3 py-1.5 text-xs sm:text-sm gap-2",
};

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  (
    {
      status,
      label,
      size = "sm",
      showIcon = true,
      showDot = false,
      pulse = false,
      className,
      ...props
    },
    ref
  ) => {
    const config = statusConfigs[status] || {
      label: label || String(status),
      icon: HelpCircle,
      bgClass: "bg-muted",
      textClass: "text-muted-foreground",
      borderClass: "border-border",
      dotClass: "bg-muted-foreground",
    };

    const displayLabel = label || config.label;
    const IconComponent = config.icon;

    return (
      <span
        ref={ref}
        className={cn(
          "group inline-flex items-center rounded-lg border font-medium select-none transition-all duration-200   cursor-default",
          sizeClasses[size],
          config.bgClass,
          config.textClass,
          config.borderClass,
          pulse && "animate-pulse",
          className
        )}
        {...props}
      >
        {showDot && (
          <span
            className={cn(
              "size-1.5 rounded-full shrink-0 transition-transform duration-200 ",
              config.dotClass,
              pulse && ""
            )}
          />
        )}
        {showIcon && !showDot && (
          <IconComponent className="size-3.5 shrink-0 transition-transform duration-200 " />
        )}
        <span className="truncate leading-none">{displayLabel}</span>
      </span>
    );
  }
);

StatusBadge.displayName = "StatusBadge";
