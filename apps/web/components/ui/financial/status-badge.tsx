import React from "react";
import {
  CheckCircle2,
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
} from "lucide-react";
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
    bgClass: "bg-sky-500/10",
    textClass: "text-sky-700 dark:text-sky-300",
    borderClass: "border-sky-500/30",
    dotClass: "bg-sky-500",
  },
  // Needs Review
  needs_review: {
    label: "نیازمند بررسی",
    icon: HelpCircle,
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-700 dark:text-amber-300",
    borderClass: "border-amber-500/30",
    dotClass: "bg-amber-500",
  },
  potential_match: {
    label: "نیازمند بررسی",
    icon: HelpCircle,
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-700 dark:text-amber-300",
    borderClass: "border-amber-500/30",
    dotClass: "bg-amber-500",
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
    bgClass: "bg-blue-500/10",
    textClass: "text-blue-700 dark:text-blue-300",
    borderClass: "border-blue-500/30",
    dotClass: "bg-blue-500",
  },
  follow_up: {
    label: "در حال پیگیری",
    icon: Clock,
    bgClass: "bg-blue-500/10",
    textClass: "text-blue-700 dark:text-blue-300",
    borderClass: "border-blue-500/30",
    dotClass: "bg-blue-500",
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
    bgClass: "bg-emerald-500/10",
    textClass: "text-emerald-700 dark:text-emerald-300",
    borderClass: "border-emerald-500/30",
    dotClass: "bg-emerald-500",
  },
  auto_matched: {
    label: "تطبیق قطعی",
    icon: CheckCheck,
    bgClass: "bg-emerald-500/10",
    textClass: "text-emerald-700 dark:text-emerald-300",
    borderClass: "border-emerald-500/30",
    dotClass: "bg-emerald-500",
  },
  // Verified (Maker-Checker approved)
  verified: {
    label: "صحه‌گذاری‌شده",
    icon: ShieldCheck,
    bgClass: "bg-teal-500/10",
    textClass: "text-teal-700 dark:text-teal-300",
    borderClass: "border-teal-500/30",
    dotClass: "bg-teal-500",
  },
  confirmed: {
    label: "تاییدشده",
    icon: ShieldCheck,
    bgClass: "bg-teal-500/10",
    textClass: "text-teal-700 dark:text-teal-300",
    borderClass: "border-teal-500/30",
    dotClass: "bg-teal-500",
  },
  completed: {
    label: "تکمیل‌شده",
    icon: CheckCircle2,
    bgClass: "bg-emerald-500/10",
    textClass: "text-emerald-700 dark:text-emerald-300",
    borderClass: "border-emerald-500/30",
    dotClass: "bg-emerald-500",
  },
  completed_limited: {
    label: "تکمیل با هشدار",
    icon: AlertCircle,
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-700 dark:text-amber-300",
    borderClass: "border-amber-500/30",
    dotClass: "bg-amber-500",
  },
  ready: {
    label: "آماده",
    icon: CheckCircle2,
    bgClass: "bg-emerald-500/10",
    textClass: "text-emerald-700 dark:text-emerald-300",
    borderClass: "border-emerald-500/30",
    dotClass: "bg-emerald-500",
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
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-700 dark:text-amber-300",
    borderClass: "border-amber-500/30",
    dotClass: "bg-amber-500",
  },
  reopened: {
    label: "بازگشایی‌شده",
    icon: RefreshCcw,
    bgClass: "bg-orange-500/10",
    textClass: "text-orange-700 dark:text-orange-300",
    borderClass: "border-orange-500/30",
    dotClass: "bg-orange-500",
  },
  failed: {
    label: "ناموفق",
    icon: XCircle,
    bgClass: "bg-rose-500/10",
    textClass: "text-rose-700 dark:text-rose-300",
    borderClass: "border-rose-500/30",
    dotClass: "bg-rose-500",
  },
  // Mismatches
  unmatched_bank: {
    label: "فاقد سند در دفاتر",
    icon: XCircle,
    bgClass: "bg-rose-500/10",
    textClass: "text-rose-700 dark:text-rose-300",
    borderClass: "border-rose-500/30",
    dotClass: "bg-rose-500",
  },
  unmatched_journal: {
    label: "فاقد گردش در بانک",
    icon: XCircle,
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-700 dark:text-amber-300",
    borderClass: "border-amber-500/30",
    dotClass: "bg-amber-500",
  },
  amount_mismatch: {
    label: "مغایرت مبلغ",
    icon: AlertCircle,
    bgClass: "bg-rose-500/10",
    textClass: "text-rose-700 dark:text-rose-300",
    borderClass: "border-rose-500/30",
    dotClass: "bg-rose-500",
  },
  date_mismatch: {
    label: "مغایرت تاریخ",
    icon: Clock,
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-700 dark:text-amber-300",
    borderClass: "border-amber-500/30",
    dotClass: "bg-amber-500",
  },
  duplicate: {
    label: "تکراری",
    icon: RefreshCcw,
    bgClass: "bg-purple-500/10",
    textClass: "text-purple-700 dark:text-purple-300",
    borderClass: "border-purple-500/30",
    dotClass: "bg-purple-500",
  },
  // Severity
  critical: {
    label: "بحرانی",
    icon: ShieldAlert,
    bgClass: "bg-rose-500/15",
    textClass: "text-rose-700 dark:text-rose-400 font-bold",
    borderClass: "border-rose-500/40",
    dotClass: "bg-rose-500",
  },
  high: {
    label: "بالا",
    icon: AlertCircle,
    bgClass: "bg-amber-500/15",
    textClass: "text-amber-700 dark:text-amber-400 font-bold",
    borderClass: "border-amber-500/40",
    dotClass: "bg-amber-500",
  },
  medium: {
    label: "متوسط",
    icon: HelpCircle,
    bgClass: "bg-blue-500/10",
    textClass: "text-blue-700 dark:text-blue-400",
    borderClass: "border-blue-500/30",
    dotClass: "bg-blue-500",
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
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </svg>
  );
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
          "inline-flex items-center rounded-lg border font-medium select-none transition-colors",
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
              "size-1.5 rounded-full shrink-0",
              config.dotClass,
              pulse && "animate-ping"
            )}
          />
        )}
        {showIcon && !showDot && <IconComponent className="size-3.5 shrink-0" />}
        <span className="truncate leading-none">{displayLabel}</span>
      </span>
    );
  }
);

StatusBadge.displayName = "StatusBadge";
